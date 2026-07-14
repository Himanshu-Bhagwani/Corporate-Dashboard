const fs = require('fs');
const path = require('path');

// Setup process env if running locally
const envPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*(DATABASE_URL)\s*=\s*(.*)?\s*$/);
    if (match) {
      process.env.DATABASE_URL = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

const { pool, connectDB } = require('../config/db');
const { runMigrations } = require('./runMigrations');
const { seedDemoData } = require('../seed-on-start');

async function setup() {
  try {
    await connectDB();
    
    console.log('[BUILD DB] Starting migrations...');
    await runMigrations();
    console.log('[BUILD DB] Migrations completed.');

    console.log('[BUILD DB] Running legacy inline alters...');
    await pool.query(`ALTER TABLE user_companies ADD COLUMN IF NOT EXISTS last_selected_at TIMESTAMP;`);
    await pool.query(`UPDATE user_companies SET last_selected_at = created_at WHERE last_selected_at IS NULL;`);
    
    await pool.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS gstin VARCHAR(100);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS pan VARCHAR(100);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan VARCHAR(50);
    `);
    
    await pool.query(`
      ALTER TABLE compliance_events DROP CONSTRAINT IF EXISTS compliance_events_type_check;
      ALTER TABLE compliance_events ADD CONSTRAINT compliance_events_type_check
        CHECK (type IN ('GST','TDS','INCOME_TAX','OTHER','Income Tax','ROC','Payroll','Custom'));
    `);

    await pool.query(`
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS sales_amount NUMERIC DEFAULT 0;
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS net_tax_payable NUMERIC DEFAULT 0;
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS itc_available NUMERIC DEFAULT 0;
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS advance_tax_paid NUMERIC DEFAULT 0;
    `);
    console.log('[BUILD DB] Legacy inline alters finished.');

    console.log('[BUILD DB] Checking and seeding demo data...');
    await seedDemoData();
    console.log('[BUILD DB] Database setup successfully completed!');
    
    process.exit(0);
  } catch (err) {
    console.error('[BUILD DB] Fatal setup error:', err.message);
    process.exit(1);
  }
}

setup();
