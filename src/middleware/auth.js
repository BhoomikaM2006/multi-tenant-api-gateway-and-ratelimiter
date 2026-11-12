const db = require('../config/db');
const redis = require('../config/redis');

async function authMiddleware(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  const cacheKey = `tenant_auth:${apiKey}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      req.tenant = JSON.parse(cached);
      return next();
    }

    const result = await db.query(
      'SELECT tenant_id, name, tier, algorithm, is_active FROM tenants WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(403).json({ error: 'Invalid or inactive API key' });
    }

    const tenant = {
      tenantId: result.rows[0].tenant_id,
      name: result.rows[0].name,
      tier: result.rows[0].tier,
      algorithm: result.rows[0].algorithm || 'sliding_window',
    };

    await redis.set(cacheKey, JSON.stringify(tenant), 'EX', 300);
    req.tenant = tenant;
    return next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Authentication service failure' });
  }
}

module.exports = authMiddleware;
