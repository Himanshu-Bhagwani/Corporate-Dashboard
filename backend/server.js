const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { pool } = require('./config/db');
const { seedDemoData } = require('./seed-on-start');
const transactionRoutes = require('./routes/transactions');
const accountRoutes = require('./routes/accounts');
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const searchRoutes = require('./routes/search');
const dashboardRoutes = require('./routes/dashboard');
const invoiceRoutes = require('./routes/invoices');
const complianceRoutes = require('./routes/compliance');
const reportsRoutes = require('./routes/reports');
const aiRoutes = require('./routes/ai');
const accountingRoutes = require('./routes/accounting');
const notificationsRoutes = require('./routes/notifications');
const documentsRoutes = require('./routes/documents');
const noticesRoutes = require('./routes/notices');
const financialMetricsRoutes = require('./routes/financialMetrics');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Connect to PostgreSQL and seed demo data
connectDB().then(() => {
  // Seed demo data after database connection
  setTimeout(() => {
    seedDemoData().catch(err => console.error('Seed error:', err));
  }, 2000); // Wait 2 seconds for tables to be created

  // Ensure user preference column exists (used to remember last selected company).
  // If the column doesn't exist yet, create it so frontend can restore the active company on login.
  pool
    .query(`ALTER TABLE user_companies ADD COLUMN IF NOT EXISTS last_selected_at TIMESTAMP;`)
    .then(() =>
      pool.query(
        `UPDATE user_companies SET last_selected_at = created_at WHERE last_selected_at IS NULL;`
      )
    )
    .catch((err) => console.error('Preference column init failed:', err.message));

  // Ensure new columns for company onboarding exist
  pool
    .query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS gstin VARCHAR(100);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS pan VARCHAR(100);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan VARCHAR(50);
      CREATE TABLE IF NOT EXISTS team_invites (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, email)
      );
    `)
    .catch((err) => console.error('Company columns init failed:', err.message));

  // Ensure chart_of_accounts table exists
  pool
    .query(`
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        account_type VARCHAR(50) NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
        description TEXT,
        opening_balance NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company ON chart_of_accounts(company_id);
    `)
    .catch((err) => console.error('Chart of accounts table init failed:', err.message));

  // Ensure notification_dismissals table exists
  pool
    .query(`
      CREATE TABLE IF NOT EXISTS notification_dismissals (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        notification_key VARCHAR(255) NOT NULL,
        dismissed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, notification_key)
      );
    `)
    .catch((err) => console.error('Notification dismissals table init failed:', err.message));

  // Drop and widen the compliance_events type CHECK constraint to allow all category values
  pool
    .query(`
      ALTER TABLE compliance_events DROP CONSTRAINT IF EXISTS compliance_events_type_check;
      ALTER TABLE compliance_events ADD CONSTRAINT compliance_events_type_check
        CHECK (type IN ('GST','TDS','INCOME_TAX','OTHER','Income Tax','ROC','Payroll','Custom'));
    `)
    .catch((err) => console.error('Compliance type constraint update failed:', err.message));

  // Ensure compliance extension tables and columns exist
  pool
    .query(`
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS sales_amount NUMERIC DEFAULT 0;
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS net_tax_payable NUMERIC DEFAULT 0;
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS itc_available NUMERIC DEFAULT 0;
      ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS advance_tax_paid NUMERIC DEFAULT 0;

      CREATE TABLE IF NOT EXISTS compliance_documents (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'Other',
        file_path VARCHAR(500) NOT NULL,
        file_size VARCHAR(50),
        mime_type VARCHAR(100),
        expiry_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS compliance_notices (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(255) NOT NULL,
        due_date DATE NOT NULL,
        description TEXT DEFAULT '',
        priority VARCHAR(50) DEFAULT 'Medium',
        status VARCHAR(50) DEFAULT 'Open',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_compliance_documents_company ON compliance_documents(company_id);
      CREATE INDEX IF NOT EXISTS idx_compliance_notices_company ON compliance_notices(company_id);
    `)
    .catch((err) => console.error('Compliance extensions init failed:', err.message));

  // Ensure chat_history table exists
  pool
    .query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'ai')),
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_history_company ON chat_history(company_id);
    `)
    .catch((err) => console.error('Chat history table init failed:', err.message));
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/compliance-documents', documentsRoutes);
app.use('/api/compliance-notices', noticesRoutes);
app.use('/api/financial-metrics', financialMetricsRoutes);
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Error handling middleware (catch Multer/Express limit errors)
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (Max: 20MB)' });
  }
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend live on port ${PORT}`);
});

// Increase timeout for long-running PDF extraction and AI categorization
server.setTimeout(600000); // 10 minutes
server.keepAliveTimeout = 600000;
server.headersTimeout = 600000;