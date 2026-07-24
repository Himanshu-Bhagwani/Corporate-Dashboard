const { pool } = require('../config/db');
const crypto = require('crypto');

// Aggregate adjustments (payments, CN, DN) per invoice for a company.
// Returns an empty map (not an error) if the table doesn't exist yet — the
// migration might not have run in an older environment.
const _getAdjustmentTotals = async (companyId) => {
  try {
    const result = await pool.query(
      `SELECT invoice_id,
              COALESCE(SUM(CASE WHEN kind = 'payment' THEN total_amount ELSE 0 END), 0) AS payments_total,
              COALESCE(SUM(CASE WHEN kind = 'credit_note' THEN total_amount ELSE 0 END), 0) AS cn_total,
              COALESCE(SUM(CASE WHEN kind = 'debit_note' THEN total_amount ELSE 0 END), 0) AS dn_total
       FROM invoice_adjustments
       WHERE company_id = $1
       GROUP BY invoice_id`,
      [companyId]
    );
    const map = {};
    for (const row of result.rows) {
      map[row.invoice_id] = {
        payments_total: parseFloat(row.payments_total),
        cn_total: parseFloat(row.cn_total),
        dn_total: parseFloat(row.dn_total),
      };
    }
    return map;
  } catch (err) {
    console.log('[Invoices] Adjustments table not available:', err.message);
    return {};
  }
};

// GET all invoices for a company
const getInvoices = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    // Auto-update overdue invoices — but never override a status the user set
    // manually via the dropdown (status_locked = true).
    await pool.query(
      `UPDATE invoices SET status = 'overdue'
       WHERE company_id = $1 AND status = 'pending' AND due_date < CURRENT_DATE
             AND COALESCE(status_locked, false) = false`,
      [companyId]
    );

    const result = await pool.query(
      `SELECT id, company_id, invoice_number, client_name, vendor_name, type, amount, grand_total, status,
              TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
              TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date,
              notes, irn_number, ack_number, created_at,
              entity_name, entity_gstin, entity_pan, entity_reg, entity_address, supplier_state, entity_logo,
              client_email, client_address, place_of_supply, client_gstin, client_contact, client_phone,
              currency, po_number, payment_terms,
              line_items, subtotal, total_discount, cgst_total, sgst_total, igst_total, cess_total,
              amount_paid, balance_due, tax_scheme,
              payment_account_holder, payment_bank_name, payment_account_number, payment_ifsc, payment_upi, payment_mode
       FROM invoices WHERE company_id = $1 ORDER BY created_at DESC`,
      [companyId]
    );

    const totals = await _getAdjustmentTotals(companyId);
    const rows = result.rows.map(inv => {
      const t = totals[inv.id] || { payments_total: 0, cn_total: 0, dn_total: 0 };
      const base = parseFloat(inv.grand_total || inv.amount) || 0;
      const revisedTotal = base + t.dn_total - t.cn_total;
      const outstanding = Math.max(0, revisedTotal - t.payments_total);
      return {
        ...inv,
        amount_paid: t.payments_total,
        revised_total: revisedTotal,
        credit_notes_total: t.cn_total,
        debit_notes_total: t.dn_total,
        outstanding,
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// Generate sequential invoice number.
//
// Uses the highest sequence already in use rather than COUNT(*): uploaded
// invoices keep the supplier's own number and deletions leave gaps, so a count
// hands out a number that already exists and the insert dies on the unique
// index. `offset` lets the caller skip ahead when a number is taken anyway.
const _getNextInvoiceNumber = async (companyId, type, offset = 0) => {
  const prefix = (type === 'Credit Note') ? 'CN' : (type === 'Debit Note') ? 'DN' : 'INV';
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;
  const result = await pool.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^.*-', ''), '')::bigint), 0) AS max_seq
       FROM invoices
      WHERE company_id = $1
        AND invoice_number LIKE $2
        AND invoice_number ~ $3`,
    [companyId, pattern, `^${prefix}-${year}-[0-9]+$`]
  );
  const seq = parseInt(result.rows[0].max_seq, 10) + 1 + offset;
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
};

// Generate dummy IRN (SHA-256 hash)
const _generateIRN = (gstin, invoiceNumber, issueDate) => {
  const gstin_val = gstin || '27AABBCCDD1234E';
  const date_val = issueDate || new Date().toISOString().slice(0, 10);
  let fy;
  try {
    const dt = new Date(date_val);
    fy = dt.getMonth() >= 3 ? `${dt.getFullYear()}-${dt.getFullYear() + 1}` : `${dt.getFullYear() - 1}-${dt.getFullYear()}`;
  } catch { fy = '2026-2027'; }
  return crypto.createHash('sha256').update(`${gstin_val}${invoiceNumber}${fy}${date_val}`).digest('hex');
};

const generateIRN = async (req, res) => {
  try {
    const { gstin, invoiceNumber, issueDate } = req.body;
    const irn = _generateIRN(gstin, invoiceNumber, issueDate);
    const ackNumber = `ACK-${new Date().getFullYear()}-INV-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
    const ackDate = new Date().toLocaleString('en-IN', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true
    }).replace(',', '');
    
    res.json({ irn, ackNumber, ackDate });
  } catch (error) {
    console.error('Generate IRN error:', error);
    res.status(500).json({ error: 'Failed to generate IRN' });
  }
};

const getNextNumber = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { type = 'receivable' } = req.query;
    const nextNumber = await _getNextInvoiceNumber(companyId, type);
    res.json({ invoiceNumber: nextNumber });
  } catch (error) {
    console.error('Get next invoice number error:', error);
    res.status(500).json({ error: 'Failed to fetch next invoice number' });
  }
};

// POST create a new invoice
const createInvoice = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const {
      client_name, vendor_name, type = 'receivable',
      issue_date, due_date, notes,
      // Entity fields
      entity_name, entity_gstin, entity_pan, entity_reg, entity_address, supplier_state, entity_logo,
      // Client fields
      client_email, client_address, place_of_supply, client_gstin, client_contact, client_phone,
      // Invoice meta
      currency = 'INR', po_number, payment_terms,
      // Line items & totals
      line_items = [], subtotal = 0, total_discount = 0,
      cgst_total = 0, sgst_total = 0, igst_total = 0, cess_total = 0, grand_total = 0,
      amount_paid = 0, balance_due, tax_scheme,
      // Payment
      payment_account_holder, payment_bank_name, payment_account_number, payment_ifsc, payment_upi, payment_mode = 'Bank Transfer'
    } = req.body;

    const finalIssueDate = issue_date || new Date().toISOString().slice(0, 10);
    const ackNumber = `ACK-${new Date().getFullYear()}-INV-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;

    // Use grand_total as the primary amount, fallback to req.body.amount
    const finalAmount = grand_total || req.body.amount || 0;
    const finalBalanceDue = balance_due !== undefined ? balance_due : (finalAmount - amount_paid);

    // Determine status based on payment
    let status = 'pending';
    if (amount_paid >= finalAmount && finalAmount > 0) status = 'paid';
    else if (amount_paid > 0) status = 'pending'; // partial

    // Two saves at once (or a number already taken by an upload) can still lose
    // the race for a number, so step forward and try again instead of 500-ing.
    let result;
    for (let attempt = 0; ; attempt++) {
      const invoiceNumber = await _getNextInvoiceNumber(companyId, type, attempt);
      const irnNumber = _generateIRN(entity_gstin, invoiceNumber, finalIssueDate);
      try {
        result = await pool.query(
          `INSERT INTO invoices (
            company_id, invoice_number, client_name, vendor_name, type, amount, grand_total, status,
            due_date, issue_date, notes, irn_number, ack_number,
            entity_name, entity_gstin, entity_pan, entity_reg, entity_address, supplier_state, entity_logo,
            client_email, client_address, place_of_supply, client_gstin, client_contact, client_phone,
            currency, po_number, payment_terms,
            line_items, subtotal, total_discount, cgst_total, sgst_total, igst_total, cess_total,
            amount_paid, balance_due, tax_scheme,
            payment_account_holder, payment_bank_name, payment_account_number, payment_ifsc, payment_upi, payment_mode
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26,
            $27, $28, $29,
            $30, $31, $32, $33, $34, $35, $36,
            $37, $38, $39,
            $40, $41, $42, $43, $44, $45
          ) RETURNING *,
            TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
            TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
          [
            companyId, invoiceNumber, client_name || vendor_name, vendor_name, type, finalAmount, finalAmount, status,
            due_date, finalIssueDate, notes, irnNumber, ackNumber,
            entity_name, entity_gstin, entity_pan, entity_reg, entity_address, supplier_state, entity_logo,
            client_email, client_address, place_of_supply, client_gstin, client_contact, client_phone,
            currency, po_number, payment_terms,
            JSON.stringify(line_items), subtotal, total_discount, cgst_total, sgst_total, igst_total, cess_total,
            amount_paid, finalBalanceDue, tax_scheme,
            payment_account_holder, payment_bank_name, payment_account_number, payment_ifsc, payment_upi, payment_mode
          ]
        );
        break;
      } catch (err) {
        if (err.code === '23505' && attempt < 25) continue;
        throw err;
      }
    }

    // Audit: mark the create event so the drawer can show it.
    try {
      await pool.query(
        `INSERT INTO invoice_adjustments (invoice_id, company_id, kind, reason, event_date)
         VALUES ($1, $2, 'created', 'System created invoice', CURRENT_DATE)`,
        [result.rows[0].id, companyId]
      );
    } catch (e) { /* ignore audit failures */ }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
};

// PUT update an invoice — accepts every field the CreateInvoiceView sends. Any
// field left undefined is preserved (COALESCE).
const updateInvoice = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { id } = req.params;
    const b = req.body || {};

    const amount = b.grand_total ?? b.amount;
    const grandTotal = b.grand_total ?? b.amount;
    const lineItemsJson = b.line_items !== undefined ? JSON.stringify(b.line_items) : null;

    const result = await pool.query(
      `UPDATE invoices SET
         client_name = COALESCE($1, client_name),
         vendor_name = COALESCE($2, vendor_name),
         type = COALESCE($3, type),
         amount = COALESCE($4, amount),
         grand_total = COALESCE($5, grand_total),
         due_date = COALESCE($6, due_date),
         issue_date = COALESCE($7, issue_date),
         notes = COALESCE($8, notes),
         status = COALESCE($9, status),
         amount_paid = COALESCE($10, amount_paid),
         balance_due = COALESCE($11, balance_due),
         entity_name = COALESCE($12, entity_name),
         entity_gstin = COALESCE($13, entity_gstin),
         entity_pan = COALESCE($14, entity_pan),
         entity_reg = COALESCE($15, entity_reg),
         entity_address = COALESCE($16, entity_address),
         supplier_state = COALESCE($17, supplier_state),
         entity_logo = COALESCE($18, entity_logo),
         client_email = COALESCE($19, client_email),
         client_address = COALESCE($20, client_address),
         place_of_supply = COALESCE($21, place_of_supply),
         client_gstin = COALESCE($22, client_gstin),
         client_contact = COALESCE($23, client_contact),
         client_phone = COALESCE($24, client_phone),
         currency = COALESCE($25, currency),
         po_number = COALESCE($26, po_number),
         payment_terms = COALESCE($27, payment_terms),
         line_items = COALESCE($28::jsonb, line_items),
         subtotal = COALESCE($29, subtotal),
         total_discount = COALESCE($30, total_discount),
         cgst_total = COALESCE($31, cgst_total),
         sgst_total = COALESCE($32, sgst_total),
         igst_total = COALESCE($33, igst_total),
         cess_total = COALESCE($34, cess_total),
         tax_scheme = COALESCE($35, tax_scheme),
         payment_account_holder = COALESCE($36, payment_account_holder),
         payment_bank_name = COALESCE($37, payment_bank_name),
         payment_account_number = COALESCE($38, payment_account_number),
         payment_ifsc = COALESCE($39, payment_ifsc),
         payment_upi = COALESCE($40, payment_upi),
         payment_mode = COALESCE($41, payment_mode),
         status_locked = COALESCE($44, status_locked)
       WHERE id = $42 AND company_id = $43
       RETURNING *,
         TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
         TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
      [
        b.client_name, b.vendor_name, b.type, amount, grandTotal,
        b.due_date, b.issue_date, b.notes, b.status, b.amount_paid, b.balance_due,
        b.entity_name, b.entity_gstin, b.entity_pan, b.entity_reg, b.entity_address, b.supplier_state, b.entity_logo,
        b.client_email, b.client_address, b.place_of_supply, b.client_gstin, b.client_contact, b.client_phone,
        b.currency, b.po_number, b.payment_terms,
        lineItemsJson,
        b.subtotal, b.total_discount, b.cgst_total, b.sgst_total, b.igst_total, b.cess_total, b.tax_scheme,
        b.payment_account_holder, b.payment_bank_name, b.payment_account_number, b.payment_ifsc, b.payment_upi, b.payment_mode,
        id, companyId,
        // Lock the status only when the caller explicitly set one (dropdown).
        b.status !== undefined ? true : null,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // A status-only change (the table dropdown sends just { status }) shouldn't
    // spam the audit log with a generic "Invoice details updated" entry.
    const bodyKeys = Object.keys(b);
    const isStatusOnly = bodyKeys.length === 1 && bodyKeys[0] === 'status';
    if (isStatusOnly) {
      try {
        await pool.query(
          `INSERT INTO invoice_adjustments (invoice_id, company_id, kind, reason, event_date)
           VALUES ($1, $2, 'edited', $3, CURRENT_DATE)`,
          [id, companyId, `Status changed to ${b.status}`]
        );
      } catch (e) { /* ignore audit failures */ }
      return res.json(result.rows[0]);
    }

    try {
      await pool.query(
        `INSERT INTO invoice_adjustments (invoice_id, company_id, kind, reason, event_date)
         VALUES ($1, $2, 'edited', 'Invoice details updated', CURRENT_DATE)`,
        [id, companyId]
      );
    } catch (e) { /* ignore audit failures */ }

    // If the caller changed amount_paid, log the delta as a payment adjustment so
    // the outstanding calc + main table + drawer stay consistent.
    if (b.amount_paid !== undefined && b.amount_paid !== null) {
      try {
        const totalsRes = await pool.query(
          `SELECT COALESCE(SUM(total_amount), 0) AS payments_total
           FROM invoice_adjustments
           WHERE invoice_id = $1 AND kind = 'payment'`,
          [id]
        );
        const priorPayments = parseFloat(totalsRes.rows[0].payments_total) || 0;
        const delta = parseFloat(b.amount_paid) - priorPayments;
        if (Math.abs(delta) > 0.005) {
          await pool.query(
            `INSERT INTO invoice_adjustments
              (invoice_id, company_id, kind, reference, base_amount, tax_amount, total_amount, reason, event_date)
             VALUES ($1, $2, 'payment', 'Edit form', $3, 0, $3, 'Manual payment entry', CURRENT_DATE)`,
            [id, companyId, delta]
          );
        }
        await _syncInvoiceStatus(id, companyId);
      } catch (e) {
        console.error('Failed to sync manual amount_paid:', e.message);
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
};

// GET analytics/volume-trend
const getVolumeTrend = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const {
      base_measure = 'invoice_count',
      aggregation_grain = 'day',
      trend_window_type = 'fixed',
      trend_window_size = '30D',
      statistic = 'sum',
      invoice_type,
      status
    } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let window_days, current_start, prev_start, prev_end;

    if (trend_window_size === '7D') {
      window_days = 7;
      current_start = new Date(today); current_start.setDate(today.getDate() - 6);
      prev_start = new Date(current_start); prev_start.setDate(current_start.getDate() - 7);
      prev_end = new Date(current_start); prev_end.setDate(current_start.getDate() - 1);
    } else if (trend_window_size === '30D') {
      window_days = 30;
      current_start = new Date(today); current_start.setDate(today.getDate() - 29);
      prev_start = new Date(current_start); prev_start.setDate(current_start.getDate() - 30);
      prev_end = new Date(current_start); prev_end.setDate(current_start.getDate() - 1);
    } else if (trend_window_size === '90D') {
      window_days = 90;
      current_start = new Date(today); current_start.setDate(today.getDate() - 89);
      prev_start = new Date(current_start); prev_start.setDate(current_start.getDate() - 90);
      prev_end = new Date(current_start); prev_end.setDate(current_start.getDate() - 1);
    } else if (trend_window_size === 'MTD') {
      current_start = new Date(today.getFullYear(), today.getMonth(), 1);
      window_days = Math.floor((today - current_start) / (1000 * 60 * 60 * 24)) + 1;
      const prev_month_end = new Date(current_start); prev_month_end.setDate(current_start.getDate() - 1);
      prev_start = new Date(prev_month_end.getFullYear(), prev_month_end.getMonth(), 1);
      prev_end = prev_month_end;
    } else if (trend_window_size === 'QTD') {
      const q_start_month = Math.floor(today.getMonth() / 3) * 3;
      current_start = new Date(today.getFullYear(), q_start_month, 1);
      window_days = Math.floor((today - current_start) / (1000 * 60 * 60 * 24)) + 1;
      prev_end = new Date(current_start); prev_end.setDate(current_start.getDate() - 1);
      if (q_start_month > 0) {
        prev_start = new Date(prev_end.getFullYear(), Math.floor(prev_end.getMonth() / 3) * 3, 1);
      } else {
        prev_start = new Date(prev_end.getFullYear(), 0, 1);
      }
    } else if (trend_window_size === 'YTD') {
      current_start = new Date(today.getFullYear(), 0, 1);
      window_days = Math.floor((today - current_start) / (1000 * 60 * 60 * 24)) + 1;
      prev_start = new Date(today.getFullYear() - 1, 0, 1);
      prev_end = new Date(today.getFullYear() - 1, 11, 31);
    }

    const current_end = new Date(today);

    let queryStr = `SELECT * FROM invoices WHERE company_id = $1 AND issue_date >= $2 AND issue_date <= $3`;
    let queryParams = [companyId, prev_start.toISOString().split('T')[0], current_end.toISOString().split('T')[0]];
    
    const result = await pool.query(queryStr, queryParams);
    
    let invoices = result.rows;
    if (invoice_type) invoices = invoices.filter(i => i.type.toLowerCase() === invoice_type.toLowerCase());
    if (status) invoices = invoices.filter(i => i.status.toLowerCase() === status.toLowerCase());

    const bucket_key = (d) => {
      if (aggregation_grain === 'day') {
        return d.toISOString().split('T')[0];
      } else if (aggregation_grain === 'week') {
        const d_copy = new Date(d);
        const day = d_copy.getDay(), diff = d_copy.getDate() - day + (day === 0 ? -6: 1);
        const monday = new Date(d_copy.setDate(diff));
        return monday.toISOString().split('T')[0];
      } else {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    };

    const current_buckets = {};
    const prev_buckets = {};

    invoices.forEach(inv => {
      const d = new Date(inv.issue_date);
      const key = bucket_key(d);
      const val = parseFloat(inv.grand_total || inv.amount) || 0;

      if (d >= current_start && d <= current_end) {
        if (!current_buckets[key]) current_buckets[key] = { count: 0, amount: 0, receivable: 0, payable: 0 };
        current_buckets[key].count += 1;
        current_buckets[key].amount += val;
        if ((inv.type || 'receivable').toLowerCase() === 'payable') current_buckets[key].payable += val;
        else current_buckets[key].receivable += val;
      }

      if (d >= prev_start && d <= (prev_end || new Date(current_start.getTime() - 86400000))) {
        if (!prev_buckets[key]) prev_buckets[key] = { count: 0, amount: 0 };
        prev_buckets[key].count += 1;
        prev_buckets[key].amount += val;
      }
    });

    const generate_range = () => {
      const keys = [];
      let cursor = new Date(current_start);
      while (cursor <= current_end) {
        keys.push(bucket_key(cursor));
        if (aggregation_grain === 'day') cursor.setDate(cursor.getDate() + 1);
        else if (aggregation_grain === 'week') cursor.setDate(cursor.getDate() + 7);
        else cursor.setMonth(cursor.getMonth() + 1);
      }
      return [...new Set(keys)];
    };

    const ordered_keys = generate_range();
    const raw_values = ordered_keys.map(k => {
      const b = current_buckets[k] || { count: 0, amount: 0 };
      return base_measure === 'invoice_count' ? b.count : b.amount;
    });

    let stat_values = [...raw_values];
    if (statistic === 'moving_avg') {
      const window = 3;
      stat_values = raw_values.map((v, i) => {
        const chunk = raw_values.slice(Math.max(0, i - window + 1), i + 1);
        return chunk.reduce((a, b) => a + b, 0) / chunk.length;
      });
    } else if (statistic === 'moving_sum') {
      const window = 3;
      stat_values = raw_values.map((v, i) => {
        const chunk = raw_values.slice(Math.max(0, i - window + 1), i + 1);
        return chunk.reduce((a, b) => a + b, 0);
      });
    } else if (statistic === 'growth_rate') {
      stat_values = [0];
      for (let i = 1; i < raw_values.length; i++) {
        stat_values.push(raw_values[i - 1] === 0 ? 0 : ((raw_values[i] - raw_values[i - 1]) / raw_values[i - 1]) * 100);
      }
    }

    const series = ordered_keys.map((key, i) => {
      const b = current_buckets[key] || { count: 0, amount: 0, receivable: 0, payable: 0 };
      return {
        period: key,
        value: Number(stat_values[i].toFixed(2)),
        raw_count: b.count,
        raw_amount: Number(b.amount.toFixed(2)),
        receivable: Number(b.receivable.toFixed(2)),
        payable: Number(b.payable.toFixed(2))
      };
    });

    let prev_total_count = 0, prev_total_amount = 0;
    Object.values(prev_buckets).forEach(v => { prev_total_count += v.count; prev_total_amount += v.amount; });
    
    let curr_total_count = 0, curr_total_amount = 0;
    Object.values(current_buckets).forEach(v => { curr_total_count += v.count; curr_total_amount += v.amount; });

    const prev_val = base_measure === 'invoice_count' ? prev_total_count : prev_total_amount;
    const curr_val = base_measure === 'invoice_count' ? curr_total_count : curr_total_amount;

    let pct_change = null;
    if (prev_val !== 0) pct_change = Number((((curr_val - prev_val) / prev_val) * 100).toFixed(2));

    res.json({
      meta: {
        base_measure, aggregation_grain, trend_window_type, trend_window_size, statistic,
        current_window: { start: current_start.toISOString(), end: current_end.toISOString() },
        previous_window: { start: prev_start.toISOString(), end: (prev_end || new Date(current_start.getTime() - 86400000)).toISOString() }
      },
      series,
      summary: {
        current_total: Number(curr_val.toFixed(2)),
        previous_total: Number(prev_val.toFixed(2)),
        pct_change,
        current_count: curr_total_count,
        current_amount: Number(curr_total_amount.toFixed(2)),
        previous_count: prev_total_count,
        previous_amount: Number(prev_total_amount.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Volume trend error:', error);
    res.status(500).json({ error: 'Failed to fetch volume trend' });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const result = await pool.query('DELETE FROM invoices WHERE id = $1 AND company_id = $2 RETURNING *', [id, companyId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found or unauthorized' });
    res.json({ message: 'Invoice deleted successfully', invoice: result.rows[0] });
  } catch (err) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
};

const deleteAllInvoices = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const result = await pool.query('DELETE FROM invoices WHERE company_id = $1 RETURNING *', [companyId]);
    res.json({ message: 'All invoices deleted successfully', count: result.rowCount });
  } catch (err) {
    console.error('Delete all invoices error:', err);
    res.status(500).json({ error: 'Failed to delete all invoices' });
  }
};

// Log an audit event without any monetary effect (created / edited).
const _logAudit = async (invoiceId, companyId, kind, reason) => {
  try {
    await pool.query(
      `INSERT INTO invoice_adjustments (invoice_id, company_id, kind, reason, event_date)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
      [invoiceId, companyId, kind, reason || null]
    );
  } catch (e) {
    console.error('Audit log insert failed:', e.message);
  }
};

// Compute current outstanding and revised total for a single invoice.
const _computeOutstanding = async (invoiceId, companyId) => {
  const invRes = await pool.query(
    `SELECT id, amount, grand_total FROM invoices WHERE id = $1 AND company_id = $2`,
    [invoiceId, companyId]
  );
  if (invRes.rows.length === 0) return null;
  const inv = invRes.rows[0];
  const base = parseFloat(inv.grand_total || inv.amount) || 0;

  const adjRes = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'payment' THEN total_amount ELSE 0 END), 0) AS payments_total,
       COALESCE(SUM(CASE WHEN kind = 'credit_note' THEN total_amount ELSE 0 END), 0) AS cn_total,
       COALESCE(SUM(CASE WHEN kind = 'debit_note' THEN total_amount ELSE 0 END), 0) AS dn_total
     FROM invoice_adjustments WHERE invoice_id = $1`,
    [invoiceId]
  );
  const t = adjRes.rows[0];
  const payments = parseFloat(t.payments_total);
  const cn = parseFloat(t.cn_total);
  const dn = parseFloat(t.dn_total);
  const revisedTotal = base + dn - cn;
  const outstanding = Math.max(0, revisedTotal - payments);
  return { base, revisedTotal, payments, cn, dn, outstanding };
};

const _syncInvoiceStatus = async (invoiceId, companyId) => {
  const totals = await _computeOutstanding(invoiceId, companyId);
  if (!totals) return;
  // Paid ONLY when a real (>0) revised total has been fully settled — that
  // condition always wins, even over a manual lock. Otherwise a manually-locked
  // status is preserved; unlocked invoices fall back to overdue/pending by date.
  await pool.query(
    `UPDATE invoices SET amount_paid = $1, balance_due = $2,
       status = CASE
         WHEN $3::numeric <= 0 AND $4::numeric > 0 THEN 'paid'
         WHEN COALESCE(status_locked, false) = true THEN status
         WHEN due_date < CURRENT_DATE THEN 'overdue'
         ELSE 'pending'
       END
     WHERE id = $5 AND company_id = $6`,
    [totals.payments, totals.outstanding, totals.outstanding, totals.revisedTotal, invoiceId, companyId]
  );
};

const _nextAdjustmentNumber = async (companyId, prefix) => {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM invoice_adjustments
     WHERE company_id = $1 AND kind = $2`,
    [companyId, prefix === 'CN' ? 'credit_note' : 'debit_note']
  );
  const seq = parseInt(result.rows[0].count) + 1;
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
};

// POST /invoices/:id/payment
const recordPayment = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { id } = req.params;
    const { amount, event_date, mode, reference } = req.body;

    const paid = parseFloat(amount);
    if (!paid || paid <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    await pool.query(
      `INSERT INTO invoice_adjustments
        (invoice_id, company_id, kind, reference, base_amount, tax_amount, total_amount, reason, event_date)
       VALUES ($1, $2, 'payment', $3, $4, 0, $4, $5, $6)`,
      [id, companyId, reference || null, paid, mode || 'Payment', event_date || new Date().toISOString().slice(0, 10)]
    );

    await _syncInvoiceStatus(id, companyId);
    const totals = await _computeOutstanding(id, companyId);
    res.json({ message: 'Payment recorded', ...totals });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

// POST /invoices/:id/credit-note   { amount, tax_percent, reason, event_date }
// POST /invoices/:id/debit-note
const _raiseNote = (kind) => async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { id } = req.params;
    const { amount, tax_percent, reason, event_date, notes, line_item_refs } = req.body;

    const base = parseFloat(amount);
    if (!base || base <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    // The note references lines of the parent invoice. Validate the selection
    // against that invoice rather than trusting the client: a note must never
    // point at a supply that wasn't billed on it.
    const refs = Array.isArray(line_item_refs) ? line_item_refs : [];
    if (refs.length > 0) {
      const invRes = await pool.query(
        `SELECT line_items FROM invoices WHERE id = $1 AND company_id = $2`, [id, companyId]
      );
      if (invRes.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
      const stored = invRes.rows[0].line_items;
      const parsed = Array.isArray(stored)
        ? stored
        : (typeof stored === 'string' ? (() => { try { return JSON.parse(stored || '[]'); } catch { return []; } })() : []);
      const names = new Set(parsed.map((li, i) => String(li.name || li.description || `Line ${i + 1}`)));
      const unknown = refs.filter(r => !names.has(String(r.name)));
      if (unknown.length > 0) {
        return res.status(400).json({
          error: `Line item "${unknown[0].name}" is not on this invoice`,
        });
      }
      // A credit note cannot exceed the value of the lines it reverses.
      if (kind === 'credit_note') {
        const selectable = refs.reduce((s, r) => s + (parseFloat(r.taxable_value) || 0), 0);
        if (selectable > 0 && base > selectable + 0.01) {
          return res.status(400).json({ error: 'Credit exceeds the value of the selected line items' });
        }
      }
    }

    // Default the tax rate to the invoice's first line-item rate (or 18%) if the
    // caller didn't provide one — the UI just asks for a base amount.
    let taxPct = parseFloat(tax_percent);
    if (isNaN(taxPct)) {
      const invRes = await pool.query(`SELECT line_items FROM invoices WHERE id = $1 AND company_id = $2`, [id, companyId]);
      const items = invRes.rows[0]?.line_items;
      const li = Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items || '[]') : []);
      taxPct = parseFloat(li[0]?.tax_percent);
      if (isNaN(taxPct)) taxPct = 18;
    }
    const tax = base * (taxPct / 100);
    const total = base + tax;

    const prefix = kind === 'credit_note' ? 'CN' : 'DN';
    const reference = await _nextAdjustmentNumber(companyId, prefix);

    await pool.query(
      `INSERT INTO invoice_adjustments
        (invoice_id, company_id, kind, reference, base_amount, tax_amount, total_amount, tax_percent, reason, notes, event_date, line_item_refs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, companyId, kind, reference, base, tax, total, taxPct, reason || null, notes || null,
       event_date || new Date().toISOString().slice(0, 10), JSON.stringify(refs)]
    );

    await _syncInvoiceStatus(id, companyId);
    const totals = await _computeOutstanding(id, companyId);
    res.json({ message: `${prefix} raised`, reference, base, tax, total, ...totals });
  } catch (error) {
    console.error(`Raise ${kind} error:`, error);
    res.status(500).json({ error: `Failed to raise ${kind}` });
  }
};

// GET /invoices/:id/adjustments — returns transaction list + audit log + outstanding
const getInvoiceAdjustments = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { id } = req.params;

    const adj = await pool.query(
      `SELECT id, kind, reference, base_amount, tax_amount, total_amount, tax_percent,
              reason, notes, COALESCE(line_item_refs, '[]'::jsonb) AS line_item_refs,
              TO_CHAR(event_date, 'YYYY-MM-DD') as event_date, created_at
       FROM invoice_adjustments
       WHERE invoice_id = $1 AND company_id = $2
       ORDER BY created_at ASC`,
      [id, companyId]
    );

    const totals = await _computeOutstanding(id, companyId);
    res.json({ adjustments: adj.rows, ...totals });
  } catch (error) {
    console.error('Get adjustments error:', error);
    res.status(500).json({ error: 'Failed to fetch adjustments' });
  }
};

const recordCreditNote = _raiseNote('credit_note');
const recordDebitNote = _raiseNote('debit_note');

module.exports = {
  getInvoices, createInvoice, updateInvoice, getVolumeTrend, deleteInvoice, deleteAllInvoices,
  getNextNumber, generateIRN,
  recordPayment, recordCreditNote, recordDebitNote, getInvoiceAdjustments,
  _logAudit
};
