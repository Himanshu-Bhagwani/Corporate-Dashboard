const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Global search across transactions, invoices, vendors
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    const companyId = req.headers['x-company-id'];

    if (!companyId || !q) {
      return res.status(400).json({ error: 'Company ID and search query required' });
    }

    const searchTerm = `%${q}%`;
    const results = {
      transactions: [],
      invoices: [],
      vendors: []
    };

    // Search transactions
    const transactionsResult = await pool.query(
      `SELECT id, name, type, category, amount, date, 'transaction' as result_type
       FROM transactions
       WHERE company_id = $1 AND (name ILIKE $2 OR category ILIKE $2 OR notes ILIKE $2)
       LIMIT 10`,
      [companyId, searchTerm]
    );
    results.transactions = transactionsResult.rows;

    // Search invoices
    const invoicesResult = await pool.query(
      `SELECT id, invoice_number, vendor_name, client_name, amount, status, 'invoice' as result_type
       FROM invoices
       WHERE company_id = $1 AND (invoice_number ILIKE $2 OR vendor_name ILIKE $2 OR client_name ILIKE $2)
       LIMIT 10`,
      [companyId, searchTerm]
    );
    results.invoices = invoicesResult.rows;

    // Search vendors
    const vendorsResult = await pool.query(
      `SELECT id, name, email, phone, 'vendor' as result_type
       FROM vendors
       WHERE company_id = $1 AND (name ILIKE $2 OR email ILIKE $2)
       LIMIT 10`,
      [companyId, searchTerm]
    );
    results.vendors = vendorsResult.rows;

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
