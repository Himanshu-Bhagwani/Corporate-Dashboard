/**
 * SODA Business — Simple Migration Runner
 * Applies SQL migration files in numeric order (001_, 002_, …).
 * Tracks applied migrations in a `schema_migrations` table.
 */

const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const runMigrations = async () => {
  // Ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // numeric prefix ensures correct order

  for (const file of files) {
    const exists = await pool.query(
      'SELECT id FROM schema_migrations WHERE filename = $1',
      [file]
    );
    if (exists.rows.length > 0) continue; // already applied

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      console.log(`[MIGRATION] Applied: ${file}`);
    } catch (err) {
      console.error(`[MIGRATION] Failed on ${file}:`, err.message);
      // Don't crash — log and continue with remaining migrations
    }
  }
};

module.exports = { runMigrations };
