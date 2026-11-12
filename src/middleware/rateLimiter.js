const redis = require('../config/redis');
const tiers = require('../config/tiers');

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, windowMs)
  return {1, limit - count - 1, math.ceil(windowMs / 1000)}
end

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retryAfter = 1
if oldest[2] then
  retryAfter = math.max(1, math.ceil((tonumber(oldest[2]) + windowMs - now) / 1000))
end
return {0, 0, retryAfter}
`;

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refillRate = tonumber(ARGV[3])
local ttlSec = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(data[1])
local lastRefill = tonumber(data[2])

if not tokens or not lastRefill then
  tokens = capacity
  lastRefill = now
else
  local elapsed = math.max(0, (now - lastRefill) / 1000.0)
  tokens = math.min(capacity, tokens + (elapsed * refillRate))
  lastRefill = now
end

if tokens >= 1 then
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
  redis.call('EXPIRE', key, ttlSec)
  return {1, math.floor(tokens), 0}
else
  local retryAfter = math.max(1, math.ceil((1 - tokens) / refillRate))
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
  redis.call('EXPIRE', key, ttlSec)
  return {0, 0, retryAfter}
end
`;

async function evaluateLimit(algorithm, policy, redisKey, now) {
  if (algorithm === 'token_bucket') {
    const ttl = Math.ceil(policy.burst / policy.refillPerSec) + 60;
    const result = await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      redisKey,
      now,
      policy.burst,
      policy.refillPerSec,
      ttl
    );
    const [allowed, remaining, resetOrRetry] = result.map(Number);
    return { allowed, remaining, resetOrRetry, limitHeader: policy.burst };
  }

  const windowMs = policy.windowSeconds * 1000;
  const member = `${now}-${Math.random().toString(36).slice(2, 9)}`;
  const result = await redis.eval(
    SLIDING_WINDOW_LUA,
    1,
    redisKey,
    now,
    windowMs,
    policy.limit,
    member
  );
  const [allowed, remaining, resetOrRetry] = result.map(Number);
  return { allowed, remaining, resetOrRetry, limitHeader: policy.limit };
}

async function rateLimiterMiddleware(req, res, next) {
  const { tenantId, tier, algorithm } = req.tenant;
  const policy = tiers[tier] || tiers.free;
  const endpoint = req.path || '/';
  const redisKey = `ratelimit:${tenantId}:${tier}:${endpoint}`;
  const now = Date.now();

  try {
    let outcome;
    try {
      outcome = await evaluateLimit(algorithm, policy, redisKey, now);
    } catch (evalErr) {
      // If algorithm was switched live (ZSET <-> HASH), clear old key structure and retry once
      if (evalErr.message && evalErr.message.includes('WRONGTYPE')) {
        await redis.del(redisKey);
        outcome = await evaluateLimit(algorithm, policy, redisKey, now);
      } else {
        throw evalErr;
      }
    }

    const { allowed, remaining, resetOrRetry, limitHeader } = outcome;

    res.setHeader('X-RateLimit-Limit', limitHeader);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Algorithm', algorithm);
    res.setHeader('X-RateLimit-Scope', endpoint);

    if (!allowed) {
      res.setHeader('Retry-After', resetOrRetry);
      return res.status(429).json({
        error: 'Too Many Requests',
        tenantId,
        tier,
        algorithm,
        endpoint,
        retryAfterSeconds: resetOrRetry,
      });
    }

    return next();
  } catch (err) {
    console.error('Rate limiter error:', err);
    return next();
  }
}

module.exports = rateLimiterMiddleware;
