const { pool } = require('../config/db');

// ─── LEDGER ENDPOINTS ───────────────────────────────────────────────

/**
 * GET /api/accounting/ledger
 * Returns ledger entries derived from transactions, invoices, and vendors.
 * Customers = income transactions grouped by counterparty (name)
 * Vendors   = expense transactions grouped by counterparty (name)
 */
const getLedger = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { search, filter } = req.query; // filter: 'all' | 'customer' | 'vendor'

    // ── Customers: group income transactions by name ──
    let customerQuery = `
      SELECT 
        t.name AS counterparty,
        'customer' AS ledger_type,
        COUNT(t.id) AS transaction_count,
        SUM(t.amount) AS total_amount,
        MAX(t.date) AS last_transaction_date,
        MIN(t.date) AS first_transaction_date,
        json_agg(json_build_object(
          'id', t.id,
          'name', t.name,
          'amount', t.amount,
          'date', TO_CHAR(t.date, 'YYYY-MM-DD'),
          'category', t.category,
          'notes', t.notes,
          'account', a.name
        ) ORDER BY t.date DESC) AS transactions
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.company_id = $1 AND t.type = 'income'
    `;
    const customerParams = [companyId];

    if (search) {
      customerParams.push(`%${search}%`);
      customerQuery += ` AND (t.name ILIKE $${customerParams.length} OR t.notes ILIKE $${customerParams.length})`;
    }
    customerQuery += ` GROUP BY t.name ORDER BY total_amount DESC`;

    // ── Vendors: group expense transactions by name ──
    let vendorQuery = `
      SELECT 
        t.name AS counterparty,
        'vendor' AS ledger_type,
        COUNT(t.id) AS transaction_count,
        SUM(t.amount) AS total_amount,
        MAX(t.date) AS last_transaction_date,
        MIN(t.date) AS first_transaction_date,
        t.category AS service_category,
        json_agg(json_build_object(
          'id', t.id,
          'name', t.name,
          'amount', t.amount,
          'date', TO_CHAR(t.date, 'YYYY-MM-DD'),
          'category', t.category,
          'notes', t.notes,
          'account', a.name
        ) ORDER BY t.date DESC) AS transactions
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.company_id = $1 AND t.type = 'expense'
    `;
    const vendorParams = [companyId];

    if (search) {
      vendorParams.push(`%${search}%`);
      vendorQuery += ` AND (t.name ILIKE $${vendorParams.length} OR t.notes ILIKE $${vendorParams.length} OR t.category ILIKE $${vendorParams.length})`;
    }
    vendorQuery += ` GROUP BY t.name, t.category ORDER BY total_amount DESC`;

    let customers = [];
    let vendors = [];

    if (!filter || filter === 'all' || filter === 'customer') {
      const customerResult = await pool.query(customerQuery, customerParams);
      customers = customerResult.rows;
    }

    if (!filter || filter === 'all' || filter === 'vendor') {
      const vendorResult = await pool.query(vendorQuery, vendorParams);
      vendors = vendorResult.rows;
    }

    // Also pull invoice data for richer customer info
    const invoiceResult = await pool.query(`
      SELECT 
        client_name,
        COUNT(*) AS invoice_count,
        SUM(amount) AS total_invoiced,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS total_paid,
        SUM(CASE WHEN status IN ('pending', 'overdue') THEN amount ELSE 0 END) AS total_outstanding
      FROM invoices
      WHERE company_id = $1 AND type = 'receivable' AND client_name IS NOT NULL
      GROUP BY client_name
    `, [companyId]);

    const invoiceMap = {};
    invoiceResult.rows.forEach(row => {
      invoiceMap[row.client_name] = row;
    });

    // Enrich customer entries with invoice data
    customers = customers.map(c => ({
      ...c,
      invoices: invoiceMap[c.counterparty] || null,
    }));

    // Get vendor records from vendors table for enrichment (optional table)
    let vendorMap = {};
    try {
      const vendorRecords = await pool.query(
        `SELECT name, email, phone FROM vendors WHERE company_id = $1`,
        [companyId]
      );
      vendorRecords.rows.forEach(v => {
        vendorMap[v.name] = v;
      });
    } catch (e) {
      // vendors table may not exist — that's ok, skip enrichment
    }

    vendors = vendors.map(v => ({
      ...v,
      vendor_info: vendorMap[v.counterparty] || null,
    }));

    res.json({ customers, vendors });
  } catch (error) {
    console.error('Ledger fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch ledger data' });
  }
};

// ─── CHART OF ACCOUNTS ENDPOINTS ────────────────────────────────────

/**
 * GET /api/accounting/chart-of-accounts
 * Returns all chart of accounts entries for the company, grouped by type.
 * Auto-generates base accounts from existing data if none exist.
 */
const getChartOfAccounts = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    let result = await pool.query(
      `SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY account_type, name ASC`,
      [companyId]
    );

    // If no chart of accounts exist, auto-generate from existing data
    if (result.rows.length === 0) {
      await autoGenerateChartOfAccounts(companyId);
      result = await pool.query(
        `SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY account_type, name ASC`,
        [companyId]
      );
    }

    // Enrich with live balances from transactions
    const enriched = await enrichChartOfAccounts(companyId, result.rows);

    res.json(enriched);
  } catch (error) {
    console.error('Chart of accounts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch chart of accounts' });
  }
};

/**
 * POST /api/accounting/chart-of-accounts
 * Create a new chart of accounts entry
 */
const createChartOfAccountsEntry = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { name, account_type, description, opening_balance } = req.body;

    if (!name || !account_type) {
      return res.status(400).json({ error: 'Name and account type are required' });
    }

    const validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    if (!validTypes.includes(account_type)) {
      return res.status(400).json({ error: `Invalid account type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Generate account code
    const codePrefix = { Asset: '1', Liability: '2', Equity: '3', Revenue: '4', Expense: '5' };
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM chart_of_accounts WHERE company_id = $1 AND account_type = $2`,
      [companyId, account_type]
    );
    const code = `${codePrefix[account_type]}${String(parseInt(countResult.rows[0].count) + 1).padStart(3, '0')}`;

    const result = await pool.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [companyId, code, name, account_type, description || null, parseFloat(opening_balance) || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create chart of accounts error:', error);
    res.status(500).json({ error: 'Failed to create account entry' });
  }
};

/**
 * PUT /api/accounting/chart-of-accounts/:id
 * Update an existing chart of accounts entry
 */
const updateChartOfAccountsEntry = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { id } = req.params;
    const { name, account_type, description, opening_balance } = req.body;

    const result = await pool.query(
      `UPDATE chart_of_accounts 
       SET name = COALESCE($1, name),
           account_type = COALESCE($2, account_type),
           description = COALESCE($3, description),
           opening_balance = COALESCE($4, opening_balance),
           updated_at = NOW()
       WHERE id = $5 AND company_id = $6
       RETURNING *`,
      [name, account_type, description, opening_balance !== undefined ? parseFloat(opening_balance) : null, id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update chart of accounts error:', error);
    res.status(500).json({ error: 'Failed to update account entry' });
  }
};

/**
 * DELETE /api/accounting/chart-of-accounts/:id
 */
const deleteChartOfAccountsEntry = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM chart_of_accounts WHERE id = $1 AND company_id = $2 RETURNING *`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete chart of accounts error:', error);
    res.status(500).json({ error: 'Failed to delete account entry' });
  }
};

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────

async function autoGenerateChartOfAccounts(companyId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Assets: from bank accounts
    const accounts = await client.query(
      `SELECT name, opening_balance FROM accounts WHERE company_id = $1`,
      [companyId]
    );

    let assetIdx = 1;
    for (const acc of accounts.rows) {
      await client.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Asset', $4, $5)`,
        [companyId, `1${String(assetIdx++).padStart(3, '0')}`, acc.name, `Bank account - ${acc.name}`, parseFloat(acc.opening_balance) || 0]
      );
    }

    // Add Accounts Receivable from invoices
    const receivables = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE company_id = $1 AND status IN ('pending', 'overdue')`,
      [companyId]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Asset', $4, $5)`,
      [companyId, `1${String(assetIdx++).padStart(3, '0')}`, 'Accounts Receivable', 'Outstanding customer invoices', parseFloat(receivables.rows[0].total)]
    );

    // Liabilities
    const payables = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE company_id = $1 AND type = 'payable' AND status IN ('pending', 'overdue')`,
      [companyId]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Liability', $4, $5)`,
      [companyId, '2001', 'Accounts Payable', 'Outstanding vendor payments', parseFloat(payables.rows[0].total)]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Liability', $4, $5)`,
      [companyId, '2002', 'Tax Liabilities', 'GST, TDS, and other tax payables', 0]
    );

    // Equity
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Equity', $4, $5)`,
      [companyId, '3001', 'Owner\'s Equity', 'Capital invested by owners', 0]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Equity', $4, $5)`,
      [companyId, '3002', 'Retained Earnings', 'Accumulated profits', 0]
    );

    // Revenue: from income transaction categories
    const revenueCategories = await client.query(
      `SELECT DISTINCT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'income' GROUP BY category ORDER BY total DESC`,
      [companyId]
    );
    let revIdx = 1;
    for (const cat of revenueCategories.rows) {
      await client.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Revenue', $4, $5)`,
        [companyId, `4${String(revIdx++).padStart(3, '0')}`, `${cat.category} Revenue`, `Revenue from ${cat.category}`, parseFloat(cat.total)]
      );
    }

    // Expenses: from expense transaction categories
    const expenseCategories = await client.query(
      `SELECT DISTINCT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'expense' GROUP BY category ORDER BY total DESC`,
      [companyId]
    );
    let expIdx = 1;
    for (const cat of expenseCategories.rows) {
      await client.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance) VALUES ($1, $2, $3, 'Expense', $4, $5)`,
        [companyId, `5${String(expIdx++).padStart(3, '0')}`, cat.category, `Expense - ${cat.category}`, parseFloat(cat.total)]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Auto-generate chart of accounts error:', error);
  } finally {
    client.release();
  }
}

async function enrichChartOfAccounts(companyId, rows) {
  // Get live transaction totals per category
  const incomeTotals = await pool.query(
    `SELECT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'income' GROUP BY category`,
    [companyId]
  );
  const expenseTotals = await pool.query(
    `SELECT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'expense' GROUP BY category`,
    [companyId]
  );

  // Get account balances
  const accountBalances = await pool.query(
    `SELECT a.name, a.opening_balance +
       COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS balance
     FROM accounts a
     LEFT JOIN transactions t ON t.account_id = a.id AND t.company_id = $1
     WHERE a.company_id = $1
     GROUP BY a.id`,
    [companyId]
  );

  const incomeMap = {};
  incomeTotals.rows.forEach(r => { incomeMap[r.category] = parseFloat(r.total); });
  const expenseMap = {};
  expenseTotals.rows.forEach(r => { expenseMap[r.category] = parseFloat(r.total); });
  const balanceMap = {};
  accountBalances.rows.forEach(r => { balanceMap[r.name] = parseFloat(r.balance); });

  return rows.map(row => {
    let liveBalance = parseFloat(row.opening_balance) || 0;

    if (row.account_type === 'Asset' && balanceMap[row.name] !== undefined) {
      liveBalance = balanceMap[row.name];
    } else if (row.account_type === 'Revenue') {
      const catName = row.name.replace(' Revenue', '');
      liveBalance = incomeMap[catName] || parseFloat(row.opening_balance) || 0;
    } else if (row.account_type === 'Expense') {
      liveBalance = expenseMap[row.name] || parseFloat(row.opening_balance) || 0;
    }

    return { ...row, live_balance: liveBalance };
  });
}

module.exports = {
  getLedger,
  getChartOfAccounts,
  createChartOfAccountsEntry,
  updateChartOfAccountsEntry,
  deleteChartOfAccountsEntry,
};
