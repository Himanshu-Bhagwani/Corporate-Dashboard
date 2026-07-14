/**
 * SODA Business — GST Filing Tracker & Data Aggregator
 *
 * Covers: GSTR-1, GSTR-3B, GSTR-9, GSTR-9C
 *
 * Due dates (standard):
 *   GSTR-1:  11th of next month (monthly) or quarterly (QRMP)
 *   GSTR-3B: 20th of next month
 *   GSTR-9:  Dec 31 of next year (annual return)
 *   GSTR-9C: Dec 31 of next year (reconciliation, if turnover > 5Cr)
 */

'use strict';

const { pool } = require('../config/db');

// ─── Due date helpers ─────────────────────────────────────────────────────────

const RETURN_DUE_DAY = { 'GSTR-1': 11, 'GSTR-3B': 20, 'GSTR-2B': 14 };

/** Get GSTR-1 / GSTR-3B due date for a monthly period e.g. '2024-04' */
const monthlyDueDate = (period, returnType) => {
  const [year, month] = period.split('-').map(Number);
  const day = RETURN_DUE_DAY[returnType] || 20;
  // Due in next month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Get annual return due date for a FY e.g. '2024-25' → '2025-12-31' */
const annualDueDate = (fy) => {
  const endYear = parseInt(fy.split('-')[0]) + 1;
  return `${endYear}-12-31`;
};

/** Seed monthly GSTR-1 and GSTR-3B filings for a company for a given FY */
const seedMonthlyFilings = async (companyId, fy) => {
  const [startYear, endSuffix] = fy.split('-');
  const startY = parseInt(startYear);
  const endY   = startY + 1;

  // FY months: Apr (startY) → Mar (endY)
  const months = [
    `${startY}-04`, `${startY}-05`, `${startY}-06`,
    `${startY}-07`, `${startY}-08`, `${startY}-09`,
    `${startY}-10`, `${startY}-11`, `${startY}-12`,
    `${endY}-01`,   `${endY}-02`,   `${endY}-03`,
  ];

  const inserted = [];
  for (const period of months) {
    for (const rt of ['GSTR-1', 'GSTR-3B']) {
      const exists = await pool.query(
        'SELECT id FROM gst_filings WHERE company_id=$1 AND return_type=$2 AND period=$3',
        [companyId, rt, period]
      );
      if (exists.rows.length > 0) continue;

      const dueDate = monthlyDueDate(period, rt);
      const row = await pool.query(
        `INSERT INTO gst_filings (company_id, return_type, period, due_date)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
        [companyId, rt, period, dueDate]
      );
      if (row.rows[0]) inserted.push(row.rows[0]);
    }
  }

  // Annual GSTR-9
  const annualExists = await pool.query(
    'SELECT id FROM gst_filings WHERE company_id=$1 AND return_type=$2 AND period=$3',
    [companyId, 'GSTR-9', fy]
  );
  if (annualExists.rows.length === 0) {
    const row = await pool.query(
      `INSERT INTO gst_filings (company_id, return_type, period, due_date)
       VALUES ($1,'GSTR-9',$2,$3) ON CONFLICT DO NOTHING RETURNING *`,
      [companyId, fy, annualDueDate(fy)]
    );
    if (row.rows[0]) inserted.push(row.rows[0]);
  }

  return inserted;
};

// ─── GSTR-1 data aggregation from transactions ────────────────────────────────

/**
 * Aggregate invoice data for GSTR-1 (outward supplies).
 * Groups by tax rate, supply type (B2B/B2C), and period.
 */
const getGSTR1Data = async (companyId, period) => {
  const [year, month] = period.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate   = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

  // B2B invoices (GST registered buyers — those with GSTIN)
  const b2b = await pool.query(
    `SELECT
       i.gstin as buyer_gstin,
       i.id as invoice_id,
       i.invoice_number,
       TO_CHAR(i.date, 'YYYY-MM-DD') as invoice_date,
       i.amount as taxable_value,
       i.gst_rate,
       i.cgst, i.sgst, i.igst,
       (i.cgst + i.sgst + i.igst) as total_gst,
       i.supply_type
     FROM invoices i
     WHERE i.company_id = $1
       AND i.date BETWEEN $2 AND $3
       AND i.deleted_at IS NULL
       AND i.gstin IS NOT NULL AND i.gstin != ''
     ORDER BY i.date`,
    [companyId, startDate, endDate]
  );

  // B2C invoices (no GSTIN — individual consumers)
  const b2c = await pool.query(
    `SELECT
       i.gst_rate,
       COUNT(*) as invoice_count,
       SUM(i.amount) as taxable_value,
       SUM(i.cgst) as total_cgst,
       SUM(i.sgst) as total_sgst,
       SUM(i.igst) as total_igst,
       SUM(i.cgst + i.sgst + i.igst) as total_gst
     FROM invoices i
     WHERE i.company_id = $1
       AND i.date BETWEEN $2 AND $3
       AND i.deleted_at IS NULL
       AND (i.gstin IS NULL OR i.gstin = '')
     GROUP BY i.gst_rate`,
    [companyId, startDate, endDate]
  );

  // HSN summary
  const hsn = await pool.query(
    `SELECT
       i.hsn_sac,
       i.gst_rate,
       COUNT(*) as count,
       SUM(i.amount) as taxable_value,
       SUM(i.cgst + i.sgst + i.igst) as total_gst
     FROM invoices i
     WHERE i.company_id = $1
       AND i.date BETWEEN $2 AND $3
       AND i.deleted_at IS NULL
       AND i.hsn_sac IS NOT NULL
     GROUP BY i.hsn_sac, i.gst_rate
     ORDER BY taxable_value DESC`,
    [companyId, startDate, endDate]
  );

  return { period, b2b: b2b.rows, b2c: b2c.rows, hsnSummary: hsn.rows };
};

// ─── GSTR-3B data aggregation ─────────────────────────────────────────────────

/**
 * Aggregate outward + inward data for GSTR-3B.
 * Returns summary tables 3.1 (outward), 4 (ITC eligible).
 */
const getGSTR3BData = async (companyId, period) => {
  const [year, month] = period.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate   = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

  // 3.1 — Outward taxable supplies
  const outward = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN i.gstin IS NOT NULL AND i.gstin != '' THEN i.amount ELSE 0 END), 0) as b2b_taxable,
       COALESCE(SUM(CASE WHEN i.gstin IS NULL OR i.gstin = '' THEN i.amount ELSE 0 END), 0) as b2c_taxable,
       COALESCE(SUM(i.cgst), 0) as total_cgst,
       COALESCE(SUM(i.sgst), 0) as total_sgst,
       COALESCE(SUM(i.igst), 0) as total_igst,
       COALESCE(SUM(i.amount), 0) as total_taxable,
       COALESCE(SUM(i.cgst + i.sgst + i.igst), 0) as total_gst
     FROM invoices i
     WHERE i.company_id = $1
       AND i.date BETWEEN $2 AND $3
       AND i.deleted_at IS NULL`,
    [companyId, startDate, endDate]
  );

  // 4 — ITC from purchase transactions (inward supplies)
  const itc = await pool.query(
    `SELECT
       COALESCE(SUM(t.amount * 0.09), 0) as itc_cgst_est,
       COALESCE(SUM(t.amount * 0.09), 0) as itc_sgst_est,
       COALESCE(SUM(0), 0) as itc_igst_est,
       COALESCE(SUM(t.amount * 0.18), 0) as itc_total_est,
       COUNT(*) as purchase_count
     FROM transactions t
     WHERE t.company_id = $1
       AND t.type = 'expense'
       AND t.date BETWEEN $2 AND $3
       AND t.deleted_at IS NULL
       AND t.category NOT IN ('Salary','TDS','Tax','Personal')`,
    [companyId, startDate, endDate]
  );

  // 5.1 — Net tax payable
  const outRow = outward.rows[0];
  const itcRow = itc.rows[0];
  const cgstPayable = Math.max(0, parseFloat(outRow.total_cgst) - parseFloat(itcRow.itc_cgst_est));
  const sgstPayable = Math.max(0, parseFloat(outRow.total_sgst) - parseFloat(itcRow.itc_sgst_est));
  const igstPayable = Math.max(0, parseFloat(outRow.total_igst) - parseFloat(itcRow.itc_igst_est));

  return {
    period,
    table_3_1: outRow,
    table_4_itc: itcRow,
    net_payable: {
      cgst: cgstPayable,
      sgst: sgstPayable,
      igst: igstPayable,
      total: cgstPayable + sgstPayable + igstPayable,
    },
    note: 'ITC estimates based on 18% GST on expenses. Update with actual 2B data for accurate filing.',
  };
};

// ─── Filing CRUD ──────────────────────────────────────────────────────────────

const getFilings = async (companyId, { returnType, fy, status }) => {
  let q = `SELECT * FROM gst_filings WHERE company_id=$1`;
  const params = [companyId];
  if (returnType) { params.push(returnType); q += ` AND return_type=$${params.length}`; }
  if (fy)         {
    // For annual returns, period = FY string. For monthly, period starts with year
    const [startY] = fy.split('-');
    params.push(`${startY}-%`);
    params.push(fy);
    q += ` AND (period LIKE $${params.length - 1} OR period = $${params.length})`;
  }
  if (status) { params.push(status); q += ` AND status=$${params.length}`; }
  q += ' ORDER BY period DESC, return_type';
  const result = await pool.query(q, params);
  return result.rows;
};

const updateFiling = async (id, companyId, data) => {
  const { status, filedDate, arn, taxPayable, taxPaid, lateFee, interest, notes } = data;
  const result = await pool.query(
    `UPDATE gst_filings
     SET status = COALESCE($3, status),
         filed_date = COALESCE($4, filed_date),
         arn = COALESCE($5, arn),
         tax_payable = COALESCE($6, tax_payable),
         tax_paid = COALESCE($7, tax_paid),
         late_fee = COALESCE($8, late_fee),
         interest = COALESCE($9, interest),
         notes = COALESCE($10, notes)
     WHERE id=$1 AND company_id=$2
     RETURNING *`,
    [id, companyId, status, filedDate || null, arn || null,
     taxPayable || null, taxPaid || null, lateFee || null, interest || null, notes || null]
  );
  return result.rows[0];
};

module.exports = {
  seedMonthlyFilings,
  getGSTR1Data,
  getGSTR3BData,
  getFilings,
  updateFiling,
  monthlyDueDate,
  annualDueDate,
};
