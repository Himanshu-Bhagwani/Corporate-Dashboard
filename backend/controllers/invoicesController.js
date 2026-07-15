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
              notes, irn_number, created_at
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
    const invoiceNumber = `INV-${String(new Date().getFullYear())}-${String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0')}`;

    const finalIssueDate = issue_date || new Date().toISOString().slice(0, 10);
    
    // Generate Dummy IRN
    const crypto = require('crypto');
    const dummyGstin = '29ABCDE1234F1Z5'; // Fallback dummy GSTIN
    const financialYear = new Date().getMonth() < 3 ? `${new Date().getFullYear() - 1}-${new Date().getFullYear()}` : `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    const irnData = `${dummyGstin}${invoiceNumber}${financialYear}${finalIssueDate}`;
    const irnNumber = crypto.createHash('sha256').update(irnData).digest('hex');

    const result = await pool.query(
      `INSERT INTO invoices (company_id, invoice_number, client_name, type, amount, status, due_date, issue_date, notes, irn_number)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
       RETURNING *, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
      [companyId, invoiceNumber, client_name, type || 'receivable', amount, due_date, finalIssueDate, notes, irnNumber]
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
      const val = parseFloat(inv.amount) || 0;

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

module.exports = { getInvoices, createInvoice, updateInvoice, getVolumeTrend };
