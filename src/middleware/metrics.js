const tenantStats = {};
const endpointStats = {};

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const tenantId = req.tenant?.tenantId || 'unauthenticated';
    const endpoint = req.path || '/';

    if (req.originalUrl.startsWith('/api')) {
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

      if (!endpointStats[endpoint]) {
        endpointStats[endpoint] = {
          totalRequests: 0,
          allowed2xx: 0,
          rateLimited429: 0,
          totalLatencyMs: 0,
        };
      }
      endpointStats[endpoint].totalRequests += 1;
      endpointStats[endpoint].totalLatencyMs += durationMs;
      if (res.statusCode === 429) {
        endpointStats[endpoint].rateLimited429 += 1;
      } else if (res.statusCode >= 200 && res.statusCode < 400) {
        endpointStats[endpoint].allowed2xx += 1;
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
  const formattedTenants = {};
  for (const [id, s] of Object.entries(tenantStats)) {
    formattedTenants[id] = {
      ...s,
      avgLatencyMs: s.totalRequests > 0 ? Number((s.totalLatencyMs / s.totalRequests).toFixed(2)) : 0,
    };
  }

  const formattedEndpoints = {};
  for (const [ep, s] of Object.entries(endpointStats)) {
    formattedEndpoints[ep] = {
      ...s,
      avgLatencyMs: s.totalRequests > 0 ? Number((s.totalLatencyMs / s.totalRequests).toFixed(2)) : 0,
    };
  }

  res.json({
    uptimeSeconds: Math.floor(process.uptime()),
    tenants: formattedTenants,
    endpoints: formattedEndpoints,
  });
}

function getPrometheusMetrics(req, res) {
  const lines = [
    '# HELP gateway_uptime_seconds Uptime of the API gateway in seconds',
    '# TYPE gateway_uptime_seconds gauge',
    `gateway_uptime_seconds ${Math.floor(process.uptime())}`,
    '# HELP gateway_requests_total Total API requests processed by tenant and status',
    '# TYPE gateway_requests_total counter',
  ];

  for (const [tenantId, s] of Object.entries(tenantStats)) {
    lines.push(`gateway_requests_total{tenant="${tenantId}",status="2xx"} ${s.allowed2xx}`);
    lines.push(`gateway_requests_total{tenant="${tenantId}",status="429"} ${s.rateLimited429}`);
  }

  lines.push('# HELP gateway_endpoint_requests_total Total API requests by endpoint and status');
  lines.push('# TYPE gateway_endpoint_requests_total counter');
  for (const [ep, s] of Object.entries(endpointStats)) {
    lines.push(`gateway_endpoint_requests_total{endpoint="${ep}",status="2xx"} ${s.allowed2xx}`);
    lines.push(`gateway_endpoint_requests_total{endpoint="${ep}",status="429"} ${s.rateLimited429}`);
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
}

module.exports = { metricsMiddleware, getMetrics, getPrometheusMetrics };
