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
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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
app.get('/', (req, res) => {
  res.send('Backend is running');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend live on port ${PORT}`);
});