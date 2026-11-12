module.exports = {
  free: { limit: 60, windowSeconds: 60, burst: 20, refillPerSec: 1 },
  premium: { limit: 300, windowSeconds: 60, burst: 60, refillPerSec: 5 },
  enterprise: { limit: 1000, windowSeconds: 60, burst: 200, refillPerSec: 16.67 },
};
