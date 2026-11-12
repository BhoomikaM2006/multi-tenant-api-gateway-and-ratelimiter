const tenantStats = {};

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const tenantId = req.tenant?.tenantId || 'unauthenticated';

    if (req.path.startsWith('/api')) {
      if (!tenantStats[tenantId]) {
        tenantStats[tenantId] = {
          totalRequests: 0,
          allowed2xx: 0,
          rateLimited429: 0,
          totalLatencyMs: 0,
        };
      }
      tenantStats[tenantId].totalRequests += 1;
      tenantStats[tenantId].totalLatencyMs += durationMs;
      if (res.statusCode === 429) {
        tenantStats[tenantId].rateLimited429 += 1;
      } else if (res.statusCode >= 200 && res.statusCode < 400) {
        tenantStats[tenantId].allowed2xx += 1;
      }
    }

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        tenantId,
        tier: req.tenant?.tier || null,
        algorithm: req.tenant?.algorithm || null,
        latencyMs: Number(durationMs.toFixed(2)),
      })
    );
  });

  next();
}

function getMetrics(req, res) {
  const formatted = {};
  for (const [id, s] of Object.entries(tenantStats)) {
    formatted[id] = {
      ...s,
      avgLatencyMs: s.totalRequests > 0 ? Number((s.totalLatencyMs / s.totalRequests).toFixed(2)) : 0,
    };
  }
  res.json({ uptimeSeconds: Math.floor(process.uptime()), tenants: formatted });
}

module.exports = { metricsMiddleware, getMetrics };
