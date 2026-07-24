// ─── Environment Variables Loader ─────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const envPaths = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env')
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        value = value.trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log(`[Env] Loaded environment from ${envPath}`);
    break;
  }
}

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { pool } = require('./config/db');
const {
  corsOptions, helmetMiddleware, authLimiter, apiLimiter,
  uploadLimiter, govtApiLimiter, sanitizeInput, jsonDepthGuard,
  extractClientIp, sqlGuard, securityLogger, hpp,
} = require('./middleware/security');
const { seedDemoData } = require('./seed-on-start');
const { runMigrations } = require('./utils/runMigrations');

const transactionRoutes    = require('./routes/transactions');
const accountRoutes        = require('./routes/accounts');
const authRoutes           = require('./routes/auth');
const companyRoutes        = require('./routes/companies');
const searchRoutes         = require('./routes/search');
const dashboardRoutes      = require('./routes/dashboard');
const invoiceRoutes        = require('./routes/invoices');
const complianceRoutes     = require('./routes/compliance');
const reportsRoutes        = require('./routes/reports');
const aiRoutes             = require('./routes/ai');
const accountingRoutes     = require('./routes/accounting');
const notificationsRoutes  = require('./routes/notifications');
const documentsRoutes      = require('./routes/documents');
const noticesRoutes        = require('./routes/notices');
const financialMetricsRoutes = require('./routes/financialMetrics');
const verifyRoutes         = require('./routes/verify');
const tallyRoutes          = require('./routes/tally');
const automationRulesRoutes = require('./routes/automationRules');
const loansRoutes          = require('./routes/loans');

const app = express();

// ─── Trust proxy (required for Vercel / any reverse-proxy deployment) ─────────
// Vercel routes all traffic through a load balancer that sets X-Forwarded-For.
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// and blocks every request with a 401/500 before it can reach our routes.
app.set('trust proxy', 1);

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(cors(corsOptions));
app.use(extractClientIp);
app.use(hpp());
app.use(securityLogger);

// ─── Apeilo threat webhook ────────────────────────────────────────────────────
// MUST be mounted before express.json(): the route verifies an HMAC over the
// raw request body, so the global JSON parser must not consume it first.
app.use('/api/apeilo', require('./routes/apeiloWebhook'));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(jsonDepthGuard);
app.use(sanitizeInput);
app.use(sqlGuard);
app.use('/api/', apiLimiter);

// ─── DB + migrations + seed ───────────────────────────────────────────────────
connectDB().then(async () => {
  if (process.env.VERCEL !== '1') {
    try {
      await runMigrations();
      console.log('[MIGRATION] Migrations completed successfully.');
    } catch (err) {
      console.error('[MIGRATION] Migration failed:', err.message);
    }
  }

  // Run legacy inline alters sequentially to ensure missing columns are created
  try {
    // Session revocation cut-off. Refresh tokens issued before this instant are
    // rejected, which is how "log out everywhere" works. NULL = never revoked,
    // so existing sessions are unaffected by this migration.
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_valid_from TIMESTAMPTZ;`);

    await pool.query(`ALTER TABLE user_companies ADD COLUMN IF NOT EXISTS last_selected_at TIMESTAMP;`);
    await pool.query(`UPDATE user_companies SET last_selected_at = created_at WHERE last_selected_at IS NULL;`);

    // One-time rename: update demo company name from old placeholder to HB devs Pvt. Ltd.
    await pool.query(`
      UPDATE companies
      SET name = 'HB devs Pvt. Ltd.'
      WHERE name IN ('Acme Corp Pvt Ltd', 'Acme Corp');
    `);

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

    // Ensure tables that may not have been created via migrations exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compliance_documents (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'Other',
        file_path TEXT,
        file_data BYTEA,
        file_size VARCHAR(50),
        mime_type VARCHAR(100),
        expiry_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_compliance_documents_company ON compliance_documents(company_id);
    `);
    // Add file_data column if upgrading from an older schema without it
    await pool.query(`ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS file_data BYTEA;`);
    await pool.query(`ALTER TABLE compliance_documents ALTER COLUMN file_path DROP NOT NULL;`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(100),
        ip_address VARCHAR(100),
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, action, ip_address)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_history_company ON chat_history(company_id);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS action_plans (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        plan_type VARCHAR(50),
        plan_title VARCHAR(255),
        steps JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_action_plans_company ON action_plans(company_id);
    `);

    console.log('[DB] Legacy inline alters checked successfully.');
  } catch (err) {
    console.error('[DB PATCH] Legacy inline patch failed:', err.message);
  }

  if (process.env.VERCEL !== '1') {
    setTimeout(() => {
      seedDemoData().catch(err => console.error('Seed error:', err));
    }, 2000);
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// Brute-force protection belongs only on the endpoints that verify credentials.
// Mounting it on all of /api/auth also counted /auth/me (called on every page
// load) and /auth/refresh (called every 15 min), so ordinary use tripped the
// "too many login attempts" limit. Those two stay covered by the general
// apiLimiter (200 req/min) applied above.
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google',   authLimiter);
app.use('/api/auth',              authRoutes);
app.use('/api/companies',         companyRoutes);
app.use('/api/transactions',      transactionRoutes);
app.use('/api/accounts',          accountRoutes);
app.use('/api/search',            searchRoutes);
app.use('/api/dashboard',         dashboardRoutes);
app.use('/api/invoices',          invoiceRoutes);
app.use('/api/compliance',        complianceRoutes);
app.use('/api/reports',           reportsRoutes);
app.use('/api/ai',                aiRoutes);
app.use('/api/accounting',        accountingRoutes);
app.use('/api/notifications',     notificationsRoutes);
app.use('/api/compliance-documents', documentsRoutes);
app.use('/api/compliance-notices',   noticesRoutes);
app.use('/api/financial-metrics', financialMetricsRoutes);
app.use('/api/verify',            verifyRoutes);
app.use('/api/tally',             tallyRoutes);
app.use('/api/automation-rules',  automationRulesRoutes);
app.use('/api/loans',             loansRoutes);
app.get('/api/verify-db', async (req, res) => {
  try {
    const companiesCols = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'companies'`
    );
    const migrations = await pool.query(
      `SELECT filename FROM schema_migrations`
    ).catch(e => ({ rows: [{ filename: 'Error: ' + e.message }] }));

    res.json({
      companies_columns: companiesCols.rows,
      applied_migrations: migrations.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ─── Serve Frontend Static Files in Production ────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDistPath));
  
  // Return frontend index for any non-API routes
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('SODA Business Backend is running (development mode)'));
}

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (Max: 20MB)' });
  }
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ─── Server ───────────────────────────────────────────────────────────────────
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SODA Business Backend live on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  server.setTimeout(600000);
  server.keepAliveTimeout = 600000;
  server.headersTimeout   = 600000;
}

module.exports = app;
