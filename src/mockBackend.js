const express = require('express');
const app = express();
const PORT = 4000;

app.use(express.json());

app.get('/users', (req, res) => {
  res.json({
    service: 'users-microservice',
    authenticatedTenant: req.headers['x-tenant-id'],
    tenantTier: req.headers['x-tenant-tier'],
    data: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]
  });
});

app.get('/orders', (req, res) => {
  res.json({
    service: 'orders-microservice',
    authenticatedTenant: req.headers['x-tenant-id'],
    tenantTier: req.headers['x-tenant-tier'],
    orders: [
      { orderId: 'ORD-101', total: 49.99 },
      { orderId: 'ORD-102', total: 120.00 }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`[Upstream Backend] Microservice running on http://localhost:${PORT}`);
});
