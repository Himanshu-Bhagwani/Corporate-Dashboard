const { pool } = require('../config/db');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 20 * 1024 * 1024 } 
});

// GET all transactions with account name joined from accounts table
const getTransactions = async (req, res) => {
  try {
    const { date, type, from_date, to_date, category, search } = req.query;
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    let query = `
      SELECT 
        t.id,
        t.name,
        t.type,
        t.category,
        t.amount,
        TO_CHAR(t.date, 'YYYY-MM-DD') as date,
        t.notes,
        t.created_at,
        t.account_id,
        a.name AS account
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.company_id = $1
    `;
    const params = [companyId];

    if (date) {
      params.push(date);
      query += ` AND t.date = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      query += ` AND t.date >= $${params.length}`;
    }

    if (to_date) {
      params.push(to_date);
      query += ` AND t.date <= $${params.length}`;
    }

    if (type && type !== 'all') {
      params.push(type);
      query += ` AND t.type = $${params.length}`;
    }

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND t.category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (t.name ILIKE $${params.length} OR t.notes ILIKE $${params.length})`;
    }

    query += ' ORDER BY t.date DESC, t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST create a new transaction
const createTransaction = async (req, res) => {
  try {
    const { name, type, category, account_id, amount, date, notes } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const result = await pool.query(
      `INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [companyId, name, type, category, account_id, amount, date, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating transaction:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST bulk create transactions (for CSV/PDF upload)
const bulkCreateTransactions = async (req, res) => {
  try {
    const { transactions } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const createdTransactions = [];
      for (const txn of transactions) {
        const result = await client.query(
          'INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [companyId, txn.name, txn.type, txn.category, txn.account_id, txn.amount, txn.date, txn.notes]
        );
        createdTransactions.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.json({ count: createdTransactions.length, transactions: createdTransactions });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Bulk create transactions error:', error);
    res.status(500).json({ error: 'Failed to create transactions' });
  }
};

// PUT update a transaction
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, category, account_id, amount, date, notes } = req.body;
    const companyId = req.headers['x-company-id'];

    const result = await pool.query(
      `UPDATE transactions
       SET name = $1, type = $2, category = $3, account_id = $4, amount = $5, date = $6, notes = $7
       WHERE id = $8 AND company_id = $9
       RETURNING *`,
      [name, type, category, account_id, amount, date, notes || null, id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating transaction:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE a transaction
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.headers['x-company-id'];

    const result = await pool.query(
      'DELETE FROM transactions WHERE id = $1 AND company_id = $2 RETURNING *',
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET analytics data
const getAnalytics = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    // Get category breakdown
    const categoryResult = await pool.query(
      `SELECT category, type, SUM(amount) as total 
       FROM transactions 
       WHERE company_id = $1 
       GROUP BY category, type 
       ORDER BY total DESC`,
      [companyId]
    );

    // Get monthly trends
    const monthlyResult = await pool.query(
      `SELECT 
         DATE_TRUNC('month', date) as month,
         type,
         SUM(amount) as total
       FROM transactions
       WHERE company_id = $1 AND date >= NOW() - INTERVAL '6 months'
       GROUP BY month, type
       ORDER BY month ASC`,
      [companyId]
    );

    res.json({
      categoryBreakdown: categoryResult.rows,
      monthlyTrends: monthlyResult.rows
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

// POST upload CSV file and bulk-insert transactions
const uploadCSV = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const results = [];
    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row) => {
          // Normalize column headers
          const getVal = (keys) => {
            const matchedKey = Object.keys(row).find(k => keys.includes(k.trim().toLowerCase()));
            return matchedKey ? row[matchedKey] : undefined;
          };

          const name = getVal(['name', 'description', 'particulars', 'title']) || 'Unnamed';
          const amountRaw = parseFloat(getVal(['amount', 'value', 'total', 'price']) || 0);
          const typeInput = (getVal(['type', 'transactiontype', 'category']) || '').toLowerCase().trim();

          let parsedType = 'expense';
          if (['income', 'credit', 'deposit', 'cr', 'in', 'sale'].includes(typeInput)) {
            parsedType = 'income';
          } else if (['expense', 'debit', 'withdrawal', 'dr', 'out', 'purchase'].includes(typeInput)) {
            parsedType = 'expense';
          } else {
            // Fallback to value sign
            parsedType = amountRaw >= 0 ? 'income' : 'expense';
          }

          const category = getVal(['category', 'group']) || 'Misc';
          const date = getVal(['date', 'time', 'created']) || new Date().toISOString().slice(0, 10);
          const notes = getVal(['notes', 'memo', 'reference']) || '';

          results.push({
            id: 'temp_' + results.length,
            name,
            type: parsedType,
            category,
            amount: Math.abs(amountRaw),
            date,
            notes,
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (results.length === 0) {
      return res.status(400).json({ error: 'No valid rows found in CSV' });
    }

    // Regex-based categorization (instant, no AI call)
    const autoCategorize = (desc, notes) => {
      if (!desc && !notes) return 'Misc';
      const d = ((desc || '') + ' ' + (notes || '')).toLowerCase();

      if (d.includes('salary') || d.includes('salaries') || d.includes('payroll') ||
          d.includes('wages') || d.includes('stipend') || d.includes('payslip') ||
          d.includes('employee payment') || d.includes('staff payment')) return 'Salaries';

      if (d.includes('aws') || d.includes('amazon web') || d.includes('gcp') ||
          d.includes('google cloud') || d.includes('azure') || d.includes('github') ||
          d.includes('gitlab') || d.includes('software') || d.includes('subscription') ||
          d.includes('saas') || d.includes('zoom') || d.includes('slack') ||
          d.includes('notion') || d.includes('figma') || d.includes('adobe') ||
          d.includes('microsoft') || d.includes('office 365') || d.includes('shopify') ||
          d.includes('hubspot') || d.includes('razorpay') || d.includes('stripe') ||
          d.includes('twilio') || d.includes('sendgrid') || d.includes('digitalocean') ||
          d.includes('heroku') || d.includes('hosting') || d.includes('domain') ||
          d.includes('licence') || d.includes('license')) return 'Software';

      if (d.includes('rent') || d.includes('lease') || d.includes('landlord') ||
          d.includes('premises')) return 'Rent';

      if (d.includes('income tax') || d.includes('gst') || d.includes('tds') ||
          d.includes('advance tax') || d.includes('tax payment') || d.includes('cess') ||
          d.includes('customs') || d.includes('nsdl') || d.includes('challan') ||
          d.includes('professional tax')) return 'Tax';

      if (d.includes('consulting') || d.includes('advisory') || d.includes('consultant')) return 'Consulting';

      if (d.includes('professional fee') || d.includes('legal fee') || d.includes('lawyer') ||
          d.includes('advocate') || d.includes('audit fee') || d.includes('chartered accountant') ||
          d.includes('retainer') || d.includes('law firm') || d.includes('notary')) return 'Professional Fees';

      if (d.includes('flight') || d.includes('airline') || d.includes('hotel') ||
          d.includes('uber') || d.includes('irctc') || d.includes('makemytrip') ||
          d.includes('taxi') || d.includes('travel')) return 'Travel';

      if (d.includes('marketing') || d.includes('advertising') || d.includes(' ads') ||
          d.includes('facebook') || d.includes('google ads') || d.includes('meta ads') ||
          d.includes('linkedin ads') || d.includes('campaign') || d.includes('branding') ||
          d.includes('promotion') || d.includes('influencer')) return 'Marketing';

      if (d.includes('electricity') || d.includes('water bill') || d.includes('internet') ||
          d.includes('broadband') || d.includes('airtel') || d.includes('jio') ||
          d.includes('telecom') || d.includes('gas bill') || d.includes('utility') ||
          d.includes('recharge')) return 'Utilities';

      if (d.includes('insurance') || d.includes('lic premium') || d.includes('health cover') ||
          d.includes('policy') || d.includes('mediclaim') || d.includes('premium payment')) return 'Insurance';

      if (d.includes('training') || d.includes('workshop') || d.includes('seminar') ||
          d.includes('conference') || d.includes('course') || d.includes('certification') ||
          d.includes('udemy') || d.includes('coursera') || d.includes('education')) return 'Training';

      if (d.includes('stationery') || d.includes('office supply') || d.includes('supplies') ||
          d.includes('printer') || d.includes('furniture') || d.includes('equipment') ||
          d.includes('laptop') || d.includes('computer') || d.includes('hardware') ||
          d.includes('amazon') || d.includes('flipkart')) return 'Office supplies';

      if (d.includes('maintenance') || d.includes('repair') || d.includes('amc') ||
          d.includes('housekeeping') || d.includes('cleaning') || d.includes('security')) return 'Maintainance';

      if (d.includes('sales') || d.includes('revenue') || d.includes('invoice') ||
          d.includes('payment received') || d.includes('collection') || d.includes('refund') ||
          d.includes('cashback') || d.includes('incoming')) return 'Sales';

      if (d.includes('share') || d.includes('equity') || d.includes('dividend') ||
          d.includes('mutual fund') || d.includes('zerodha') || d.includes('groww') ||
          d.includes('stock') || d.includes('investment')) return 'Shares';

      return 'Misc';
    };

    results.forEach(txn => {
      txn.category = autoCategorize(txn.name, txn.notes);
    });

    // Bulk insert
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = [];
      for (const txn of results) {
        const result = await client.query(
          `INSERT INTO transactions (company_id, name, type, category, amount, date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [companyId, txn.name, txn.type, txn.category, txn.amount, txn.date, txn.notes]
        );
        created.push(result.rows[0]);
      }
      await client.query('COMMIT');
      res.json({ count: created.length, transactions: created });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ error: 'Failed to process CSV file' });
  }
};

const deleteAllTransactions = async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID required' });
  try {
    const result = await pool.query(
      'DELETE FROM transactions WHERE company_id = $1',
      [companyId]
    );
    res.json({ deleted: result.rowCount });
  } catch (error) {
    console.error('Delete all transactions error:', error);
    res.status(500).json({ error: 'Failed to delete transactions' });
  }
};

module.exports = {
  getTransactions,
  createTransaction,
  bulkCreateTransactions,
  updateTransaction,
  deleteTransaction,
  deleteAllTransactions,
  getAnalytics,
  uploadCSV,
  upload,
};
