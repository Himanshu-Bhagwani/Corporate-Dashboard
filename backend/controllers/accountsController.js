const { pool } = require('../config/db');

// GET all accounts with live balance computed from transactions
const getAccounts = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const result = await pool.query(`
      SELECT 
        a.id,
        a.name,
        a.type,
        a.bank,
        a.account_number,
        a.opening_balance,
        a.created_at,
        a.opening_balance +
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS balance,
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expenses,
        COUNT(t.id) AS transaction_count
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id AND t.company_id = $1
      WHERE a.company_id = $1
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `, [companyId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching accounts:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST create a new account
const createAccount = async (req, res) => {
  try {
    const { name, type, bank, account_number, opening_balance } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    if (!name || !type || !bank) {
      return res.status(400).json({ error: 'Name, type, and bank are required' });
    }

    const result = await pool.query(
      `INSERT INTO accounts (company_id, name, type, bank, account_number, opening_balance)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [companyId, name, type, bank, account_number || null, parseFloat(opening_balance) || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating account:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT update an account
const updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, bank, account_number, opening_balance } = req.body;
    const companyId = req.headers['x-company-id'];

    const result = await pool.query(
      `UPDATE accounts
       SET name = $1, type = $2, bank = $3, account_number = $4, opening_balance = $5
       WHERE id = $6 AND company_id = $7
       RETURNING *`,
      [name, type, bank, account_number || null, parseFloat(opening_balance) || 0, id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating account:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE an account — cascades to delete all linked transactions first
const deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.headers['x-company-id'];

    // Delete all transactions linked to this account first
    await pool.query('DELETE FROM transactions WHERE account_id = $1 AND company_id = $2', [id, companyId]);

    // Now delete the account itself
    const result = await pool.query(
      'DELETE FROM accounts WHERE id = $1 AND company_id = $2 RETURNING *',
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Account and all its transactions deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAccounts, createAccount, updateAccount, deleteAccount };
