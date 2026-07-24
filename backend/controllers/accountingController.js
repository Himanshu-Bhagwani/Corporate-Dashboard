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

    // Seed the default chart once per company. Re-seeding whenever the table is
    // empty would undo "Clear All" on the very next load.
    if (result.rows.length === 0) {
      const seeded = await pool.query(
        `SELECT coa_generated_at FROM companies WHERE id = $1`,
        [companyId]
      );
      if (seeded.rows.length > 0 && !seeded.rows[0].coa_generated_at) {
        await autoGenerateChartOfAccounts(companyId);
        result = await pool.query(
          `SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY account_type, name ASC`,
          [companyId]
        );
      }
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

/**
 * DELETE /api/accounting/chart-of-accounts/type/:accountType
 * Clears every stored account under one heading (Asset, Liability, …).
 * Live rows derived from transactions/loans/invoices are not stored, so they
 * reappear on the next load — they follow the underlying data, not this table.
 */
const clearChartOfAccountsType = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { accountType } = req.params;
    const validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    if (!validTypes.includes(accountType)) {
      return res.status(400).json({ error: `Invalid account type. Must be one of: ${validTypes.join(', ')}` });
    }

    const result = await pool.query(
      `DELETE FROM chart_of_accounts WHERE company_id = $1 AND account_type = $2 RETURNING id`,
      [companyId, accountType]
    );

    res.json({ message: `Cleared ${result.rowCount} ${accountType} account(s)`, deleted: result.rowCount });
  } catch (error) {
    console.error('Clear chart of accounts type error:', error);
    res.status(500).json({ error: 'Failed to clear accounts' });
  }
};

// Balance-sheet totals entered on the Financial Metrics screen are held in the
// chart as one clearly-named account per heading, so the two screens agree and
// the figure is never double-counted against the live ledger data.
const RECONCILE_ACCOUNTS = {
  Asset:     'Unrecorded Assets (Financial Metrics)',
  Liability: 'Unrecorded Liabilities (Financial Metrics)',
  Equity:    'Owner Capital (Financial Metrics)',
};

/**
 * POST /api/accounting/chart-of-accounts/reconcile
 * Body: { totalAssets?, totalLiabilities?, equity? }
 * Makes each heading's live total match the figure the owner entered by parking
 * the difference in a single adjustment account.
 */
const reconcileChartOfAccounts = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const targets = {
      Asset:     req.body.totalAssets,
      Liability: req.body.totalLiabilities,
      Equity:    req.body.equity,
    };

    const applied = {};
    for (const [accountType, rawTarget] of Object.entries(targets)) {
      if (rawTarget === undefined || rawTarget === null || rawTarget === '') continue;
      const target = parseFloat(rawTarget);
      if (!Number.isFinite(target) || target < 0) continue;

      const name = RECONCILE_ACCOUNTS[accountType];
      const existing = await pool.query(
        `SELECT id, opening_balance FROM chart_of_accounts
          WHERE company_id = $1 AND account_type = $2 AND name = $3`,
        [companyId, accountType, name]
      );
      const currentAdjustment = existing.rows.length > 0
        ? parseFloat(existing.rows[0].opening_balance) || 0
        : 0;

      // What the ledger reports on its own, ignoring any previous adjustment.
      const totals = await getCoaTotals(companyId);
      const baseline = (totals[accountType] || 0) - currentAdjustment;
      const gap = Math.round((target - baseline) * 100) / 100;

      if (gap <= 0) {
        // Real data already meets or exceeds the figure — drop the adjustment.
        if (existing.rows.length > 0) {
          await pool.query(`DELETE FROM chart_of_accounts WHERE id = $1`, [existing.rows[0].id]);
        }
        applied[accountType] = { baseline, adjustment: 0 };
        continue;
      }

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE chart_of_accounts SET opening_balance = $1, updated_at = NOW() WHERE id = $2`,
          [gap, existing.rows[0].id]
        );
      } else {
        const codePrefix = { Asset: '1', Liability: '2', Equity: '3' }[accountType];
        const countResult = await pool.query(
          `SELECT COUNT(*) as count FROM chart_of_accounts WHERE company_id = $1 AND account_type = $2`,
          [companyId, accountType]
        );
        const code = `${codePrefix}${String(parseInt(countResult.rows[0].count) + 1).padStart(3, '0')}`;
        await pool.query(
          `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [companyId, code, name, accountType, 'Entered under Financial Metrics → Additional Data', gap]
        );
      }
      applied[accountType] = { baseline, adjustment: gap };
    }

    res.json({ applied, totals: await getCoaTotals(companyId) });
  } catch (error) {
    console.error('Reconcile chart of accounts error:', error);
    res.status(500).json({ error: 'Failed to sync figures into the Chart of Accounts' });
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

    await client.query(
      `UPDATE companies SET coa_generated_at = NOW() WHERE id = $1`,
      [companyId]
    );

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
  // Live TDS payable — compliance events plus TDS actually deducted and not yet
  // deposited with the government (the tds_deductions ledger).
  const tdsPayable = await pool.query(
    `SELECT COALESCE(SUM(net_tax_payable), 0) as total FROM compliance_events
     WHERE company_id = $1 AND type = 'TDS' AND status = 'PENDING'`,
    [companyId]
  );
  const tdsDeducted = await safeSum(
    `SELECT COALESCE(SUM(COALESCE(net_tds_payable, tds_amount)), 0) as total
       FROM tds_deductions
      WHERE company_id = $1 AND status <> 'deposited'`,
    [companyId]
  );
  // Live bank loan liability — principal still owed on disbursed/active loans
  const loanOutstanding = await safeSum(
    `SELECT COALESCE(SUM(outstanding_principal), 0) as total
       FROM loans
      WHERE company_id = $1 AND status IN ('DISBURSED','REPAYMENT_ACTIVE')`,
    [companyId]
  );

  // Category names are matched case-insensitively: the PDF importer writes
  // "Office supplies" while a hand-made account may read "Office Supplies".
  const incomeMap = {};
  incomeTotals.rows.forEach(r => { if (r.category) incomeMap[r.category.toLowerCase()] = parseFloat(r.total); });
  const expenseMap = {};
  expenseTotals.rows.forEach(r => { if (r.category) expenseMap[r.category.toLowerCase()] = parseFloat(r.total); });
  const balanceMap = {};
  accountBalances.rows.forEach(r => { balanceMap[r.name] = parseFloat(r.balance); });

  const liveReceivables = parseFloat(receivables.rows[0].total) || 0;
  const livePayables = parseFloat(payables.rows[0].total) || 0;
  const liveGST = parseFloat(gstPayable.rows[0].total) || 0;
  const liveTDS = (parseFloat(tdsPayable.rows[0].total) || 0) + tdsDeducted;

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
      } else if (row.name === 'Bank Loans') {
        liveBalance = loanOutstanding;
      }
    } else if (row.account_type === 'Revenue') {
      const catName = row.name.replace(/ Revenue$/i, '').toLowerCase();
      liveBalance = incomeMap[catName] ?? parseFloat(row.opening_balance) ?? 0;
    } else if (row.account_type === 'Expense') {
      liveBalance = expenseMap[row.name.toLowerCase()] ?? parseFloat(row.opening_balance) ?? 0;
    }

    return { ...row, live_balance: liveBalance };
  });

  // Inject virtual Revenue/Expense rows for transaction categories that have no
  // account yet. autoGenerateChartOfAccounts only runs while the chart is empty,
  // so anything imported later (a PDF bank statement adding "Software",
  // "Salaries", …) would otherwise never show a balance here.
  const coveredRevenue = new Set(
    rows.filter(r => r.account_type === 'Revenue').map(r => r.name.replace(/ Revenue$/i, '').toLowerCase())
  );
  const coveredExpense = new Set(
    rows.filter(r => r.account_type === 'Expense').map(r => r.name.toLowerCase())
  );

  const virtualRevenueRows = incomeTotals.rows
    .filter(r => r.category && !coveredRevenue.has(r.category.toLowerCase()))
    .map((r, idx) => ({
      id: `virtual-revenue-${idx}`,
      company_id: companyId,
      code: `4V${String(idx + 1).padStart(2, '0')}`,
      name: `${r.category} Revenue`,
      account_type: 'Revenue',
      description: `Income from ${r.category} transactions`,
      opening_balance: parseFloat(r.total) || 0,
      live_balance: parseFloat(r.total) || 0,
      is_virtual: true,
    }));

  const virtualExpenseRows = expenseTotals.rows
    .filter(r => r.category && !coveredExpense.has(r.category.toLowerCase()))
    .map((r, idx) => ({
      id: `virtual-expense-${idx}`,
      company_id: companyId,
      code: `5V${String(idx + 1).padStart(2, '0')}`,
      name: r.category,
      account_type: 'Expense',
      description: `Expense - ${r.category} transactions`,
      opening_balance: parseFloat(r.total) || 0,
      live_balance: parseFloat(r.total) || 0,
      is_virtual: true,
    }));

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

  return [
    ...enrichedRows,
    ...virtualBankRows,
    ...syntheticCash,
    ...virtualRevenueRows,
    ...virtualExpenseRows,
  ];
}

/**
 * Live totals per account type — the same numbers the Chart of Accounts screen
 * shows, so the dashboard metrics and the ledger can never disagree.
 * Returns { Asset, Liability, Equity, Revenue, Expense }.
 */
async function getCoaTotals(companyId) {
  const totals = { Asset: 0, Liability: 0, Equity: 0, Revenue: 0, Expense: 0 };
  try {
    const stored = await pool.query(
      `SELECT * FROM chart_of_accounts WHERE company_id = $1`,
      [companyId]
    );
    const enriched = await enrichChartOfAccounts(companyId, stored.rows);
    for (const row of enriched) {
      if (totals[row.account_type] !== undefined) {
        totals[row.account_type] += parseFloat(row.live_balance) || 0;
      }
    }
  } catch (error) {
    console.warn('Chart of accounts totals unavailable —', error.message);
  }
  return totals;
}

// Sum helper for tables added by later migrations — a deployment where the
// migration hasn't run yet should show a zero balance, not fail the whole chart.
async function safeSum(sql, params) {
  try {
    const result = await pool.query(sql, params);
    return parseFloat(result.rows[0].total) || 0;
  } catch (error) {
    console.warn('Chart of accounts: skipped a balance source —', error.message);
    return 0;
  }
}

/* ══════════════════════════════════════════════════════════════════
 * Financial statement upload (Balance Sheet / P&L) → Chart of Accounts
 * Accepts CSV or PDF. Rows are grouped into Asset / Liability / Equity /
 * Revenue / Expense either via an explicit type column (CSV) or by the
 * section heading they appear under (PDF / sectioned CSV).
 * ══════════════════════════════════════════════════════════════════ */

const SECTION_TYPE_MAP = [
  { re: /fixed assets|current assets|non.?current assets|\bassets?\b|investments|cash and bank|inventor(y|ies)|receivable/i, type: 'Asset' },
  { re: /liabilit|payable|borrowing|loans? (taken|payable)|provisions|creditors/i, type: 'Liability' },
  { re: /equity|capital|reserves|surplus|shareholder|owner.?s? fund/i, type: 'Equity' },
  { re: /revenue|income|sales|turnover|other income/i, type: 'Revenue' },
  { re: /expens|expenditure|cost of|purchases|overheads|depreciation|finance cost/i, type: 'Expense' },
];

const detectSectionType = (line) => {
  for (const { re, type } of SECTION_TYPE_MAP) {
    if (re.test(line)) return type;
  }
  return null;
};

// Normalize an explicit type/section cell to one of our five account types
const normalizeType = (raw) => {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith('asset')) return 'Asset';
  if (t.startsWith('liab')) return 'Liability';
  if (t.startsWith('equit') || t.includes('capital')) return 'Equity';
  if (t.startsWith('rev') || t.includes('income') || t.includes('sales')) return 'Revenue';
  if (t.startsWith('exp') || t.includes('cost')) return 'Expense';
  return detectSectionType(t);
};

// "1,23,456.78" / "₹1.2L" style → number (Indian formats included)
const parseAmount = (raw) => {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[₹$,\s]/g, '').replace(/\((.+)\)/, '-$1');
  if (/^-?\d+(\.\d+)?(cr)$/i.test(s)) return parseFloat(s) * 10000000;
  if (/^-?\d+(\.\d+)?(l|lac|lakh)$/i.test(s)) return parseFloat(s) * 100000;
  if (/^-?\d+(\.\d+)?(k)$/i.test(s)) return parseFloat(s) * 1000;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

// Parse CSV text into { name, account_type, amount } rows.
// Supports both a `type` column and section-heading rows.
const parseStatementCsv = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const splitCsv = (line) => line.split(',').map(c => c.replace(/^"|"$/g, '').trim());

  const header = splitCsv(lines[0]).map(h => h.toLowerCase());
  const nameIdx   = header.findIndex(h => ['name', 'account', 'particulars', 'head', 'description', 'item'].includes(h));
  const amountIdx = header.findIndex(h => ['amount', 'balance', 'value', 'total', 'closing balance', 'opening balance'].includes(h));
  const typeIdx   = header.findIndex(h => ['type', 'account_type', 'section', 'category', 'group'].includes(h));
  const hasHeader = nameIdx !== -1 && amountIdx !== -1;

  const rows = [];
  let currentSection = null;

  const dataLines = hasHeader ? lines.slice(1) : lines;
  for (const line of dataLines) {
    const cells = splitCsv(line);
    const name   = hasHeader ? cells[nameIdx] : cells[0];
    const amount = parseAmount(hasHeader ? cells[amountIdx] : cells[cells.length - 1]);
    if (!name) continue;

    // A row with no amount that looks like a heading switches the section
    if (amount === null) {
      const sec = detectSectionType(name);
      if (sec) currentSection = sec;
      continue;
    }

    const explicit = typeIdx !== -1 ? normalizeType(cells[typeIdx]) : null;
    const type = explicit || currentSection || detectSectionType(name);
    if (!type) continue;

    rows.push({ name, account_type: type, amount });
  }
  return rows;
};

// Parse plain PDF text into rows using section headings + trailing amounts
const parseStatementPdfText = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = [];
  let currentSection = null;

  // "Sundry Debtors  1,23,456.78" → name + trailing amount
  const lineRe = /^(.+?)[\s.·]{2,}(-?\(?[₹$]?\s?[\d,]+(?:\.\d+)?\)?)$/;

  for (const line of lines) {
    const m = line.match(lineRe) || line.match(/^(.+?)\s(-?\(?[₹$]?[\d,]+(?:\.\d+)?\)?)$/);
    if (!m) {
      const sec = detectSectionType(line);
      if (sec) currentSection = sec;
      continue;
    }
    const name = m[1].replace(/[.·\s]+$/, '').trim();
    const amount = parseAmount(m[2]);
    if (!name || amount === null || Math.abs(amount) < 0.01) continue;
    if (/^total\b|^grand total|^net\b|^page \d|^statement|^balance sheet|^profit\s*(&|and)\s*loss/i.test(name)) continue;

    const type = currentSection || detectSectionType(name);
    if (!type) continue;
    rows.push({ name, account_type: type, amount });
  }
  return rows;
};

/**
 * POST /api/accounting/upload-statement — CSV or PDF financial statement.
 * Upserts parsed line items into chart_of_accounts (matched by name).
 */
const uploadFinancialStatement = async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const isPdf = req.file.mimetype === 'application/pdf' || /\.pdf$/i.test(req.file.originalname || '');
    let rows;
    if (isPdf) {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(req.file.buffer);
      if (!data || !data.text || !data.text.trim()) {
        return res.status(400).json({ error: 'Could not read text from this PDF. If it is a scanned image, please upload a CSV instead.' });
      }
      rows = parseStatementPdfText(data.text);
    } else {
      rows = parseStatementCsv(req.file.buffer.toString('utf8'));
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        error: 'No account lines recognised. Use columns like name, amount, type (Asset/Liability/Equity/Revenue/Expense), or section headings above each block.',
      });
    }

    await client.query('BEGIN');

    const codePrefix = { Asset: '1', Liability: '2', Equity: '3', Revenue: '4', Expense: '5' };
    const typeCounts = {};
    const countRes = await client.query(
      `SELECT account_type, COUNT(*) as count FROM chart_of_accounts WHERE company_id = $1 GROUP BY account_type`,
      [companyId]
    );
    countRes.rows.forEach(r => { typeCounts[r.account_type] = parseInt(r.count); });

    let created = 0, updated = 0;
    const imported = [];
    for (const row of rows) {
      const existing = await client.query(
        `SELECT id FROM chart_of_accounts WHERE company_id = $1 AND LOWER(name) = LOWER($2)`,
        [companyId, row.name]
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE chart_of_accounts SET account_type = $1, opening_balance = $2, updated_at = NOW() WHERE id = $3`,
          [row.account_type, row.amount, existing.rows[0].id]
        );
        updated++;
      } else {
        typeCounts[row.account_type] = (typeCounts[row.account_type] || 0) + 1;
        const code = `${codePrefix[row.account_type]}${String(typeCounts[row.account_type]).padStart(3, '0')}`;
        await client.query(
          `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description, opening_balance)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [companyId, code, row.name, row.account_type, `Imported from ${isPdf ? 'PDF' : 'CSV'} statement`, row.amount]
        );
        created++;
      }
      imported.push(row);
    }

    await client.query('COMMIT');
    res.json({ created, updated, total: rows.length, rows: imported });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Statement upload error:', error);
    res.status(500).json({ error: 'Failed to process the statement file' });
  } finally {
    client.release();
  }
};

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
  clearChartOfAccountsType,
  reconcileChartOfAccounts,
  uploadFinancialStatement,
  getCoaTotals,
};
