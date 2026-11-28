const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  for (let i = 0; i < 20; i++) {
    try { await pool.query('SELECT 1'); break; }
    catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (name,email,password_hash,role) VALUES ('Professor',$1,$2,'admin')
       ON CONFLICT (email) DO NOTHING`, [ADMIN_EMAIL.toLowerCase(), hash]);
  }
}
module.exports = { pool, init };
