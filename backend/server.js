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

const app = express();

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(cors(corsOptions));
app.use(extractClientIp);
app.use(hpp());
app.use(securityLogger);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(jsonDepthGuard);
app.use(sanitizeInput);
app.use(sqlGuard);
app.use('/api/', apiLimiter);

// ─── DB + migrations + seed ───────────────────────────────────────────────────
connectDB().then(async () => {
  if (process.env.VERCEL === '1') {
    console.log('[DB] Running inside Vercel serverless environment — skipping inline migrations and seeds.');
    return;
  }

  try {
    await runMigrations();
    console.log('[MIGRATION] Migrations completed successfully.');
  } catch (err) {
    console.error('[MIGRATION] Migration failed:', err.message);
  }

  // Run legacy inline alters sequentially to prevent race conditions
  try {
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
  } catch (err) {
    console.error('[DB PATCH] Legacy inline patch failed:', err.message);
  }

  setTimeout(() => {
    seedDemoData().catch(err => console.error('Seed error:', err));
  }, 2000);
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',              authLimiter, authRoutes);
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

// ─── Serve Frontend Static Files in Production ────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDistPath));
  
  // Return frontend index for any non-API routes
  app.get('/(.*)', (req, res, next) => {
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
