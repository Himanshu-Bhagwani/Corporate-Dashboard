const { pool } = require('../config/db');

// GET all invoices for a company
const getInvoices = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    // Auto-update overdue invoices
    await pool.query(
      `UPDATE invoices SET status = 'overdue' 
       WHERE company_id = $1 AND status = 'pending' AND due_date < CURRENT_DATE`,
      [companyId]
    );

    const result = await pool.query(
      `SELECT id, invoice_number, client_name, vendor_name, type, amount, status, 
              TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
              TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date,
              notes, created_at
       FROM invoices WHERE company_id = $1 ORDER BY due_date DESC`,
      [companyId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// POST create a new invoice
const createInvoice = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { client_name, amount, due_date, issue_date, notes, type } = req.body;

    // Generate invoice number
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM invoices WHERE company_id = $1',
      [companyId]
    );
    const invoiceNumber = `INV-${String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0')}`;

    const result = await pool.query(
      `INSERT INTO invoices (company_id, invoice_number, client_name, type, amount, status, due_date, issue_date, notes)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
       RETURNING *, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
      [companyId, invoiceNumber, client_name, type || 'receivable', amount, due_date, issue_date || new Date().toISOString().slice(0, 10), notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
};

// PUT update an invoice
const updateInvoice = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { id } = req.params;
    const { client_name, amount, due_date, issue_date, notes, status } = req.body;

    const result = await pool.query(
      `UPDATE invoices 
       SET client_name = COALESCE($1, client_name),
           amount = COALESCE($2, amount),
           due_date = COALESCE($3, due_date),
           issue_date = COALESCE($4, issue_date),
           notes = COALESCE($5, notes),
           status = COALESCE($6, status)
       WHERE id = $7 AND company_id = $8
       RETURNING *, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
      [client_name, amount, due_date, issue_date, notes, status, id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
};

module.exports = { getInvoices, createInvoice, updateInvoice };
