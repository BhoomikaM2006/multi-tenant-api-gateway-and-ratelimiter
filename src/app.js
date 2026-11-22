require('dotenv').config();
const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const authMiddleware = require('./middleware/auth');
const rateLimiterMiddleware = require('./middleware/rateLimiter');
const { metricsMiddleware, getMetrics, getPrometheusMetrics } = require('./middleware/metrics');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

app.use(metricsMiddleware);

// Health check & observability endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'multi-tenant-api-gateway' });
});

app.get('/metrics', getMetrics);
app.get('/metrics/prometheus', getPrometheusMetrics);

// Live Administrative Dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Control-Plane Admin API
app.use('/admin', express.json(), adminRoutes);

// Protected multi-tenant API proxy pipeline
app.use(
  '/api',
  authMiddleware,
  rateLimiterMiddleware,
  createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('x-tenant-id', req.tenant.tenantId);
        proxyReq.setHeader('x-tenant-tier', req.tenant.tier);
        proxyReq.setHeader('x-rate-limit-algorithm', req.tenant.algorithm);
      },
    },
  })
);

app.listen(PORT, () => {
  console.log(`API Gateway listening on http://localhost:${PORT}`);
  console.log(`Live Admin Dashboard available at http://localhost:${PORT}/dashboard`);
  console.log(`Prometheus metrics available at http://localhost:${PORT}/metrics/prometheus`);
});
