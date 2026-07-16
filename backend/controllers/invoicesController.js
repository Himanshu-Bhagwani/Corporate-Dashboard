const { pool } = require('../config/db');
const crypto = require('crypto');

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
      `SELECT id, invoice_number, client_name, vendor_name, type, amount, grand_total, status, 
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

    res.json(result.rows);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// Generate sequential invoice number
const _getNextInvoiceNumber = async (companyId, type) => {
  const prefix = (type === 'Credit Note') ? 'CN' : (type === 'Debit Note') ? 'DN' : 'INV';
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM invoices WHERE company_id = $1 AND invoice_number LIKE $2`,
    [companyId, `${prefix}-${year}-%`]
  );
  const seq = parseInt(result.rows[0].count) + 1;
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

    const invoiceNumber = await _getNextInvoiceNumber(companyId, type);
    const finalIssueDate = issue_date || new Date().toISOString().slice(0, 10);
    const irnNumber = _generateIRN(entity_gstin, invoiceNumber, finalIssueDate);
    const ackNumber = `ACK-${new Date().getFullYear()}-INV-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;

    // Use grand_total as the primary amount, fallback to req.body.amount
    const finalAmount = grand_total || req.body.amount || 0;
    const finalBalanceDue = balance_due !== undefined ? balance_due : (finalAmount - amount_paid);

    // Determine status based on payment
    let status = 'pending';
    if (amount_paid >= finalAmount && finalAmount > 0) status = 'paid';
    else if (amount_paid > 0) status = 'pending'; // partial

    const result = await pool.query(
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
    const { client_name, amount, due_date, issue_date, notes, status, grand_total, amount_paid, balance_due } = req.body;

    const result = await pool.query(
      `UPDATE invoices 
       SET client_name = COALESCE($1, client_name),
           amount = COALESCE($2, amount),
           grand_total = COALESCE($3, grand_total),
           due_date = COALESCE($4, due_date),
           issue_date = COALESCE($5, issue_date),
           notes = COALESCE($6, notes),
           status = COALESCE($7, status),
           amount_paid = COALESCE($8, amount_paid),
           balance_due = COALESCE($9, balance_due)
       WHERE id = $10 AND company_id = $11
       RETURNING *, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
      [client_name, amount, grand_total, due_date, issue_date, notes, status, amount_paid, balance_due, id, companyId]
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

module.exports = { getInvoices, createInvoice, updateInvoice, getVolumeTrend, deleteInvoice, deleteAllInvoices };
