# Multi-Tenant API Gateway with Dynamic Rate Limiting

A high-performance, multi-tenant reverse-proxy API gateway built with **Node.js**, **Express**, **PostgreSQL**, and **Redis**, featuring atomic Lua-based rate limiting, zero-downtime policy management, and a real-time observability dashboard.

## Architecture

- **Gateway Core (`src/app.js`):** Express reverse-proxy routing `/api/*` traffic to upstream microservices.
- **Auth Layer (`src/middleware/auth.js`):** API key verification (`x-api-key`) backed by Redis cache-aside and PostgreSQL.
- **Atomic Rate Limiter (`src/middleware/rateLimiter.js`):** Redis Lua scripts implementing **Sliding Window Log** (`ZSET`) and **Token Bucket** (`HASH`) with automatic `WRONGTYPE` protection.
- **Control Plane (`src/routes/admin.js`):** Live policy updates (`PATCH /admin/tenants/:tenantId`) and tenant provisioning (`POST /admin/tenants`) with zero downtime.
- **Observability Console (`public/dashboard.html`):** Real-time `/dashboard` UI tracking `200 OK` vs `429 Blocked` metrics.

## Quick Start

1. Install dependencies: `npm install`
2. Initialize PostgreSQL & seed tenants: `node src/db/seed.js`
3. Start upstream mock service: `node src/mockBackend.js`
4. Start API gateway: `node src/app.js`
5. Open the dashboard at `http://localhost:3000/dashboard`

## k6 Load Test Benchmark

Tested with **35 concurrent virtual users** across three isolated tenant tiers (`19.05 req/s` sustained over `20s`, `100%` check pass rate):

| Tenant Tier | Algorithm & Limit | Target Rate | Allowed (`200`) | Blocked (`429`) | Avg Latency | p95 Latency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`tenant-free`** | Sliding Window (`60/min`) | `5 req/s` (101) | **60** | **41** | `8.75 ms` | `16.50 ms` |
| **`tenant-pro`** | Token Bucket (`300/min`, burst `60`) | `4 req/s` (80) | **80** | **0** | `9.47 ms` | `17.01 ms` |
| **`tenant-ent`** | Sliding Window (`1000/min`) | `10 req/s` (200) | **200** | **0** | `9.72 ms` | `16.37 ms` |
| **Total** | **35 VUs** | **19.05 req/s** | **340** | **41** | **`9.47 ms`** | **`17.01 ms`** |
