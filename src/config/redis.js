const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    // Retry connection every 2 seconds if disconnected
    return 2000;
  },
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully to Redis counter store');
});

redis.on('error', (err) => {
  console.error('[Redis ERROR]:', err.message);
});

module.exports = redis;