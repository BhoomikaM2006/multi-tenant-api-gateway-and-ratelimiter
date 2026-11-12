const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('[Postgres] Connected successfully to api_gateway database');
});

pool.on('error', (err) => {
  console.error('[Postgres Error]:', err);
});

module.exports = pool;
