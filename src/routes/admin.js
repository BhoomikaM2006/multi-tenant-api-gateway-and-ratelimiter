const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const redis = require('../config/redis');

const router = express.Router();

const VALID_TIERS = ['free', 'premium', 'enterprise'];
const VALID_ALGORITHMS = ['sliding_window', 'token_bucket'];

// List all tenants and their current policies
router.get('/tenants', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, tenant_id, name, api_key, tier, algorithm, is_active FROM tenants ORDER BY id ASC'
    );
    res.json({ tenants: result.rows });
  } catch (err) {
    console.error('Admin list tenants error:', err);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// Create a new tenant dynamically
router.post('/tenants', async (req, res) => {
  const { tenantId, name, tier = 'free', algorithm = 'sliding_window' } = req.body;
  if (!tenantId || !name) {
    return res.status(400).json({ error: 'tenantId and name are required' });
  }
  if (!VALID_TIERS.includes(tier) || !VALID_ALGORITHMS.includes(algorithm)) {
    return res.status(400).json({ error: 'Invalid tier or algorithm' });
  }

  const apiKey = `sk_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}_${crypto.randomBytes(6).toString('hex')}`;

  try {
    const result = await db.query(
      `INSERT INTO tenants (tenant_id, name, api_key, tier, algorithm)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, name, api_key, tier, algorithm, is_active`,
      [tenantId, name, apiKey, tier, algorithm]
    );
    res.status(201).json({ message: 'Tenant created', tenant: result.rows[0] });
  } catch (err) {
    console.error('Admin create tenant error:', err);
    res.status(500).json({ error: err.detail || 'Failed to create tenant' });
  }
});

// Dynamically update tenant tier/algorithm and invalidate Redis auth cache
router.patch('/tenants/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const { tier, algorithm, is_active } = req.body;

  if (tier && !VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }
  if (algorithm && !VALID_ALGORITHMS.includes(algorithm)) {
    return res.status(400).json({ error: 'Invalid algorithm' });
  }

  try {
    const existing = await db.query('SELECT * FROM tenants WHERE tenant_id = $1', [tenantId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const current = existing.rows[0];
    const nextTier = tier ?? current.tier;
    const nextAlgo = algorithm ?? current.algorithm;
    const nextActive = typeof is_active === 'boolean' ? is_active : current.is_active;

    const updated = await db.query(
      `UPDATE tenants
       SET tier = $1, algorithm = $2, is_active = $3
       WHERE tenant_id = $4
       RETURNING id, tenant_id, name, api_key, tier, algorithm, is_active`,
      [nextTier, nextAlgo, nextActive, tenantId]
    );

    // Immediately evict cached auth record so new policy takes effect on next request
    await redis.del(`tenant_auth:${current.api_key}`);

    res.json({
      message: 'Policy updated and Redis cache invalidated',
      tenant: updated.rows[0],
    });
  } catch (err) {
    console.error('Admin update tenant error:', err);
    res.status(500).json({ error: 'Failed to update tenant policy' });
  }
});

module.exports = router;
