const TIERS = {
  free: {
    limit: 60,
    windowSeconds: 60,
    burst: 20,
    refillPerSec: 1,
    endpointOverrides: {
      '/login': { limit: 10, windowSeconds: 60, burst: 5, refillPerSec: 0.2 },
      '/orders': { limit: 20, windowSeconds: 60, burst: 8, refillPerSec: 0.35 },
    },
  },
  premium: {
    limit: 300,
    windowSeconds: 60,
    burst: 60,
    refillPerSec: 5,
    endpointOverrides: {
      '/login': { limit: 30, windowSeconds: 60, burst: 10, refillPerSec: 0.5 },
    },
  },
  enterprise: {
    limit: 1000,
    windowSeconds: 60,
    burst: 200,
    refillPerSec: 16.67,
    endpointOverrides: {},
  },
};

function getPolicyForEndpoint(tier, endpoint) {
  const baseTier = TIERS[tier] || TIERS.free;
  const override = baseTier.endpointOverrides && baseTier.endpointOverrides[endpoint];
  if (override) {
    return { ...baseTier, ...override, policySource: `endpoint:${endpoint}` };
  }
  return { ...baseTier, policySource: `tier:${tier}` };
}

module.exports = {
  ...TIERS,
  getPolicyForEndpoint,
};
