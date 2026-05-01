const { pool } = require('../config/db');

// Categories that identify vendors (expense transactions)
const VENDOR_CATEGORIES = [
  'Marketing', 'Software', 'Professional Fees', 'Maintenance',
  'Office Supplies', 'Misc', 'Rent', 'Utilities', 'Insurance',
  'Travel', 'Training', 'Salaries', 'Tax'
];

// Categories that identify customers (income transactions)
const CUSTOMER_CATEGORIES = [
  'Sales', 'Consulting', 'Commissions', 'Commission', 'Misc', 'Shares'
];

// ─── LEDGER ENDPOINTS ───────────────────────────────────────────────

/**
 * GET /api/accounting/ledger
 * Returns smart-classified customers and vendors derived from transactions,
 * invoices, and manually added ledger contacts.
 * Classification logic:
 *   Customer = income transaction with customer category OR in receivable invoices
 *   Vendor   = expense transaction with vendor category
 * Important contacts sort first. Top 5 returned by default.
 */
const getLedger = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { search, filter } = req.query;

    // Ensure ledger_contacts table exists (graceful degradation)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ledger_contacts (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('customer', 'vendor')),
        email VARCHAR(255),
        phone VARCHAR(50),
        is_important BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name, contact_type)
      )
    `);

    const customerCategories = CUSTOMER_CATEGORIES.map(c => c.toLowerCase());
    const vendorCategories = VENDOR_CATEGORIES.map(c => c.toLowerCase());

    // ── Customers: income transactions with customer categories ──
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
      WHERE t.company_id = $1
        AND t.type = 'income'
        AND LOWER(t.category) = ANY($2::text[])
    `;
    const customerParams = [companyId, customerCategories];

    if (search) {
      customerParams.push(`%${search}%`);
      customerQuery += ` AND (t.name ILIKE $${customerParams.length} OR t.notes ILIKE $${customerParams.length})`;
    }
    customerQuery += ` GROUP BY t.name ORDER BY total_amount DESC`;

    // ── Vendors: expense transactions with vendor categories ──
    let vendorQuery = `
      SELECT
        t.name AS counterparty,
        'vendor' AS ledger_type,
        COUNT(t.id) AS transaction_count,
        SUM(t.amount) AS total_amount,
        MAX(t.date) AS last_transaction_date,
        MIN(t.date) AS first_transaction_date,
        MODE() WITHIN GROUP (ORDER BY t.category) AS primary_category,
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
      WHERE t.company_id = $1
        AND t.type = 'expense'
        AND LOWER(t.category) = ANY($2::text[])
    `;
    const vendorParams = [companyId, vendorCategories];

    if (search) {
      vendorParams.push(`%${search}%`);
      vendorQuery += ` AND (t.name ILIKE $${vendorParams.length} OR t.notes ILIKE $${vendorParams.length} OR t.category ILIKE $${vendorParams.length})`;
    }
    vendorQuery += ` GROUP BY t.name ORDER BY total_amount DESC`;

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

    // Enrich customers with invoice receivable data
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

    // Add invoice-only customers (no transactions yet but in invoices)
    if (!filter || filter === 'all' || filter === 'customer') {
      const txnCustomerNames = new Set(customers.map(c => c.counterparty));
      invoiceResult.rows.forEach(inv => {
        if (!txnCustomerNames.has(inv.client_name) && (!search || inv.client_name.toLowerCase().includes(search.toLowerCase()))) {
          customers.push({
            counterparty: inv.client_name,
            ledger_type: 'customer',
            transaction_count: '0',
            total_amount: '0',
            last_transaction_date: null,
            first_transaction_date: null,
            transactions: [],
          });
        }
      });
    }

    customers = customers.map(c => ({
      ...c,
      invoices: invoiceMap[c.counterparty] || null,
    }));

    // Load ledger_contacts for important flag and manually added contacts
    const contactsResult = await pool.query(
      `SELECT name, contact_type, email, phone, is_important, notes FROM ledger_contacts WHERE company_id = $1`,
      [companyId]
    );

    const contactMap = {};
    const manualContacts = { customer: [], vendor: [] };
    contactsResult.rows.forEach(c => {
      contactMap[`${c.contact_type}::${c.name}`] = c;
      manualContacts[c.contact_type].push(c);
    });

    // Merge is_important flag into customers
    customers = customers.map(c => ({
      ...c,
      is_important: contactMap[`customer::${c.counterparty}`]?.is_important || false,
      contact_info: contactMap[`customer::${c.counterparty}`] || null,
    }));

    // Add manually added customers that have no transactions
    if (!filter || filter === 'all' || filter === 'customer') {
      const existingNames = new Set(customers.map(c => c.counterparty));
      manualContacts.customer.forEach(mc => {
        if (!existingNames.has(mc.name) && (!search || mc.name.toLowerCase().includes(search.toLowerCase()))) {
          customers.push({
            counterparty: mc.name,
            ledger_type: 'customer',
            transaction_count: '0',
            total_amount: '0',
            last_transaction_date: null,
            first_transaction_date: null,
            transactions: [],
            invoices: invoiceMap[mc.name] || null,
            is_important: mc.is_important,
            contact_info: mc,
          });
        }
      });
    }

    // Sort customers: important first, then by total_amount
    customers.sort((a, b) => {
      if (a.is_important && !b.is_important) return -1;
      if (!a.is_important && b.is_important) return 1;
      return parseFloat(b.total_amount) - parseFloat(a.total_amount);
    });

    // Enrich vendors with contact info
    vendors = vendors.map(v => ({
      ...v,
      service_category: v.primary_category,
      is_important: contactMap[`vendor::${v.counterparty}`]?.is_important || false,
      contact_info: contactMap[`vendor::${v.counterparty}`] || null,
    }));

    // Add manually added vendors with no transactions
    if (!filter || filter === 'all' || filter === 'vendor') {
      const existingVendorNames = new Set(vendors.map(v => v.counterparty));
      manualContacts.vendor.forEach(mc => {
        if (!existingVendorNames.has(mc.name) && (!search || mc.name.toLowerCase().includes(search.toLowerCase()))) {
          vendors.push({
            counterparty: mc.name,
            ledger_type: 'vendor',
            transaction_count: '0',
            total_amount: '0',
            last_transaction_date: null,
            first_transaction_date: null,
            transactions: [],
            service_category: null,
            is_important: mc.is_important,
            contact_info: mc,
          });
        }
      });
    }

    // Sort vendors: important first, then by total_amount
    vendors.sort((a, b) => {
      if (a.is_important && !b.is_important) return -1;
      if (!a.is_important && b.is_important) return 1;
      return parseFloat(b.total_amount) - parseFloat(a.total_amount);
    });

    res.json({ customers, vendors });
  } catch (error) {
    console.error('Ledger fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch ledger data' });
  }
};

// ─── LEDGER CONTACTS CRUD ────────────────────────────────────────────

/**
 * POST /api/accounting/contacts
 * Add or update a ledger contact (customer or vendor)
 */
const createContact = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { name, contact_type, email, phone, is_important, notes } = req.body;
    if (!name || !contact_type) return res.status(400).json({ error: 'Name and contact_type required' });
    if (!['customer', 'vendor'].includes(contact_type)) {
      return res.status(400).json({ error: 'contact_type must be customer or vendor' });
    }

    const result = await pool.query(`
      INSERT INTO ledger_contacts (company_id, name, contact_type, email, phone, is_important, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (company_id, name, contact_type)
      DO UPDATE SET email = $4, phone = $5, is_important = $6, notes = $7, updated_at = NOW()
      RETURNING *
    `, [companyId, name, contact_type, email || null, phone || null, is_important || false, notes || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
};

/**
 * PUT /api/accounting/contacts/:id
 * Update a ledger contact
 */
const updateContact = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { id } = req.params;
    const { name, email, phone, is_important, notes } = req.body;

    const result = await pool.query(`
      UPDATE ledger_contacts
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          is_important = COALESCE($4, is_important),
          notes = COALESCE($5, notes),
          updated_at = NOW()
      WHERE id = $6 AND company_id = $7
      RETURNING *
    `, [name, email, phone, is_important, notes, id, companyId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
};

/**
 * DELETE /api/accounting/contacts/:id
 */
const deleteContact = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM ledger_contacts WHERE id = $1 AND company_id = $2 RETURNING *`,
      [id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
};

/**
 * PATCH /api/accounting/contacts/toggle-important
 * Toggle important flag for a contact by name+type (upsert)
 */
const toggleImportant = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { name, contact_type } = req.body;
    if (!name || !contact_type) return res.status(400).json({ error: 'Name and contact_type required' });

    // Check if exists
    const existing = await pool.query(
      `SELECT id, is_important FROM ledger_contacts WHERE company_id = $1 AND name = $2 AND contact_type = $3`,
      [companyId, name, contact_type]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE ledger_contacts SET is_important = NOT is_important, updated_at = NOW()
         WHERE company_id = $1 AND name = $2 AND contact_type = $3 RETURNING *`,
        [companyId, name, contact_type]
      );
    } else {
      result = await pool.query(`
        INSERT INTO ledger_contacts (company_id, name, contact_type, is_important)
        VALUES ($1, $2, $3, true)
        RETURNING *
      `, [companyId, name, contact_type]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle important error:', error);
    res.status(500).json({ error: 'Failed to toggle important' });
  }
};

// ─── CHART OF ACCOUNTS ENDPOINTS ────────────────────────────────────

/**
 * GET /api/accounting/chart-of-accounts
 * Returns chart of accounts enriched with live balances from real user data.
 */
const getChartOfAccounts = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    let result = await pool.query(
      `SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY account_type, name ASC`,
      [companyId]
    );

    if (result.rows.length === 0) {
      await autoGenerateChartOfAccounts(companyId);
      result = await pool.query(
        `SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY account_type, name ASC`,
        [companyId]
      );
    }

    const enriched = await enrichChartOfAccounts(companyId, result.rows);
    res.json(enriched);
  } catch (error) {
    console.error('Chart of accounts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch chart of accounts' });
  }
};

/**
 * POST /api/accounting/chart-of-accounts
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

    // Assets: bank accounts added by user
    const accounts = await client.query(
      `SELECT name, opening_balance FROM accounts WHERE company_id = $1`,
      [companyId]
    );

    let assetIdx = 1;
    for (const acc of accounts.rows) {
      await client.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
         VALUES ($1, $2, $3, 'Asset', $4, $5)
         ON CONFLICT DO NOTHING`,
        [companyId, `1${String(assetIdx++).padStart(3, '0')}`, acc.name, `Bank account - ${acc.name}`, parseFloat(acc.opening_balance) || 0]
      );
    }

    // Accounts Receivable from unpaid invoices
    const receivables = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM invoices
       WHERE company_id = $1 AND type = 'receivable' AND status IN ('pending', 'overdue')`,
      [companyId]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, 'Asset', $4, $5)
       ON CONFLICT DO NOTHING`,
      [companyId, `1${String(assetIdx++).padStart(3, '0')}`, 'Accounts Receivable', 'Outstanding customer invoices', parseFloat(receivables.rows[0].total)]
    );

    // Liabilities: Accounts Payable from unpaid vendor invoices
    const payables = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM invoices
       WHERE company_id = $1 AND type = 'payable' AND status IN ('pending', 'overdue')`,
      [companyId]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, 'Liability', $4, $5)
       ON CONFLICT DO NOTHING`,
      [companyId, '2001', 'Accounts Payable', 'Outstanding vendor payments', parseFloat(payables.rows[0].total)]
    );

    // GST and TDS payable from compliance events
    const gstPayable = await client.query(
      `SELECT COALESCE(SUM(net_tax_payable), 0) as total FROM compliance_events
       WHERE company_id = $1 AND type = 'GST' AND status = 'PENDING'`,
      [companyId]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, 'Liability', $4, $5)
       ON CONFLICT DO NOTHING`,
      [companyId, '2002', 'GST Payable', 'Pending GST liability', parseFloat(gstPayable.rows[0].total) || 0]
    );

    const tdsPayable = await client.query(
      `SELECT COALESCE(SUM(net_tax_payable), 0) as total FROM compliance_events
       WHERE company_id = $1 AND type = 'TDS' AND status = 'PENDING'`,
      [companyId]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, 'Liability', $4, $5)
       ON CONFLICT DO NOTHING`,
      [companyId, '2003', 'TDS Payable', 'Pending TDS liability', parseFloat(tdsPayable.rows[0].total) || 0]
    );

    // Bank loans from expense transactions categorized as loan payments
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, 'Liability', $4, $5)
       ON CONFLICT DO NOTHING`,
      [companyId, '2004', 'Bank Loans', 'Outstanding bank loan obligations', 0]
    );

    // Equity
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, 'Equity', $4, $5)
       ON CONFLICT DO NOTHING`,
      [companyId, '3001', "Owner's Equity", 'Capital invested by owners', 0]
    );
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
       VALUES ($1, $2, $3, 'Equity', $4, $5)
       ON CONFLICT DO NOTHING`,
      [companyId, '3002', 'Retained Earnings', 'Accumulated profits', 0]
    );

    // Revenue: from income transaction categories
    const revenueCategories = await client.query(
      `SELECT DISTINCT category, SUM(amount) as total
       FROM transactions WHERE company_id = $1 AND type = 'income'
       GROUP BY category ORDER BY total DESC`,
      [companyId]
    );
    let revIdx = 1;
    for (const cat of revenueCategories.rows) {
      await client.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
         VALUES ($1, $2, $3, 'Revenue', $4, $5)
         ON CONFLICT DO NOTHING`,
        [companyId, `4${String(revIdx++).padStart(3, '0')}`, `${cat.category} Revenue`, `Revenue from ${cat.category}`, parseFloat(cat.total)]
      );
    }

    // Expenses: from expense transaction categories
    const expenseCategories = await client.query(
      `SELECT DISTINCT category, SUM(amount) as total
       FROM transactions WHERE company_id = $1 AND type = 'expense'
       GROUP BY category ORDER BY total DESC`,
      [companyId]
    );
    let expIdx = 1;
    for (const cat of expenseCategories.rows) {
      await client.query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
         VALUES ($1, $2, $3, 'Expense', $4, $5)
         ON CONFLICT DO NOTHING`,
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
  // Live income totals per category
  const incomeTotals = await pool.query(
    `SELECT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'income' GROUP BY category`,
    [companyId]
  );
  // Live expense totals per category
  const expenseTotals = await pool.query(
    `SELECT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'expense' GROUP BY category`,
    [companyId]
  );
  // Live per-account balances: opening_balance + account-linked income − account-linked expenses.
  // Only transactions explicitly assigned to an account (account_id IS NOT NULL) are included.
  const accountBalances = await pool.query(
    `SELECT a.name,
       a.opening_balance +
       COALESCE(SUM(CASE WHEN t.type = 'income'  AND t.account_id IS NOT NULL THEN t.amount ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.account_id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS balance
     FROM accounts a
     LEFT JOIN transactions t ON t.account_id = a.id AND t.company_id = $1
     WHERE a.company_id = $1
     GROUP BY a.id, a.name, a.opening_balance`,
    [companyId]
  );
  // Aggregate cash = sum of all per-account balances
  const totalCash = accountBalances.rows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0);
  // Live accounts receivable (unpaid customer invoices)
  const receivables = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM invoices
     WHERE company_id = $1 AND type = 'receivable' AND status IN ('pending', 'overdue')`,
    [companyId]
  );
  // Live accounts payable (unpaid vendor invoices)
  const payables = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM invoices
     WHERE company_id = $1 AND type = 'payable' AND status IN ('pending', 'overdue')`,
    [companyId]
  );
  // Live GST payable
  const gstPayable = await pool.query(
    `SELECT COALESCE(SUM(net_tax_payable), 0) as total FROM compliance_events
     WHERE company_id = $1 AND type = 'GST' AND status = 'PENDING'`,
    [companyId]
  );
  // Live TDS payable
  const tdsPayable = await pool.query(
    `SELECT COALESCE(SUM(net_tax_payable), 0) as total FROM compliance_events
     WHERE company_id = $1 AND type = 'TDS' AND status = 'PENDING'`,
    [companyId]
  );

  const incomeMap = {};
  incomeTotals.rows.forEach(r => { incomeMap[r.category] = parseFloat(r.total); });
  const expenseMap = {};
  expenseTotals.rows.forEach(r => { expenseMap[r.category] = parseFloat(r.total); });
  const balanceMap = {};
  accountBalances.rows.forEach(r => { balanceMap[r.name] = parseFloat(r.balance); });

  const liveReceivables = parseFloat(receivables.rows[0].total) || 0;
  const livePayables = parseFloat(payables.rows[0].total) || 0;
  const liveGST = parseFloat(gstPayable.rows[0].total) || 0;
  const liveTDS = parseFloat(tdsPayable.rows[0].total) || 0;

  // Track which bank account names are already covered by a COA Asset row
  const coveredBankNames = new Set(
    rows.filter(r => r.account_type === 'Asset' && balanceMap[r.name] !== undefined).map(r => r.name)
  );

  const enrichedRows = rows.map(row => {
    let liveBalance = parseFloat(row.opening_balance) || 0;

    if (row.account_type === 'Asset') {
      if (balanceMap[row.name] !== undefined) {
        liveBalance = balanceMap[row.name];
      } else if (row.name === 'Accounts Receivable') {
        liveBalance = liveReceivables;
      } else if (row.name === 'Cash in Bank' || row.name === 'Cash and Bank Equivalents') {
        // Aggregate entry — show total cash (opening balances + all transactions)
        liveBalance = totalCash;
      }
    } else if (row.account_type === 'Liability') {
      if (row.name === 'Accounts Payable') {
        liveBalance = livePayables;
      } else if (row.name === 'GST Payable') {
        liveBalance = liveGST;
      } else if (row.name === 'TDS Payable') {
        liveBalance = liveTDS;
      }
    } else if (row.account_type === 'Revenue') {
      const catName = row.name.replace(' Revenue', '');
      liveBalance = incomeMap[catName] || parseFloat(row.opening_balance) || 0;
    } else if (row.account_type === 'Expense') {
      liveBalance = expenseMap[row.name] || parseFloat(row.opening_balance) || 0;
    }

    return { ...row, live_balance: liveBalance };
  });

  // Inject virtual Asset rows for any bank accounts not already represented in COA
  const virtualBankRows = accountBalances.rows
    .filter(r => !coveredBankNames.has(r.name))
    .map((r, idx) => ({
      id: `virtual-bank-${idx}`,
      company_id: companyId,
      code: `1V${String(idx + 1).padStart(2, '0')}`,
      name: r.name,
      account_type: 'Asset',
      description: `Bank account – ${r.name}`,
      opening_balance: parseFloat(r.balance) || 0,
      live_balance: parseFloat(r.balance) || 0,
      is_virtual: true,
    }));

  // If no bank accounts added at all, inject a synthetic "Cash and Bank Equivalents" row
  // showing total cash (opening + all transactions) so something meaningful always appears.
  const hasBankAssets = enrichedRows.some(r => r.account_type === 'Asset' && balanceMap[r.name] !== undefined)
    || virtualBankRows.length > 0;

  const syntheticCash = (!hasBankAssets && totalCash > 0)
    ? [{
        id: 'virtual-cash-total',
        company_id: companyId,
        code: '1V01',
        name: 'Cash and Bank Equivalents',
        account_type: 'Asset',
        description: 'Total cash across all accounts',
        opening_balance: totalCash,
        live_balance: totalCash,
        is_virtual: true,
      }]
    : [];

  return [...enrichedRows, ...virtualBankRows, ...syntheticCash];
}

module.exports = {
  getLedger,
  createContact,
  updateContact,
  deleteContact,
  toggleImportant,
  getChartOfAccounts,
  createChartOfAccountsEntry,
  updateChartOfAccountsEntry,
  deleteChartOfAccountsEntry,
};
