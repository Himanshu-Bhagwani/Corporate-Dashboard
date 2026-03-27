const { pool } = require('../config/db');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
          // Map CSV columns — flexible column name matching
          const name = row.Name || row.Description || row.name || row.description || 'Unnamed';
          const amountRaw = parseFloat(row.Amount || row.amount || 0);
          const type = (row.Type || row.type || (amountRaw >= 0 ? 'income' : 'expense')).toLowerCase();
          const category = row.Category || row.category || 'Misc';
          const date = row.Date || row.date || new Date().toISOString().slice(0, 10);
          const notes = row.Notes || row.notes || '';

          results.push({
            name,
            type: type === 'income' ? 'income' : 'expense',
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

module.exports = {
  getTransactions,
  createTransaction,
  bulkCreateTransactions,
  updateTransaction,
  deleteTransaction,
  getAnalytics,
  uploadCSV,
  upload,
};
