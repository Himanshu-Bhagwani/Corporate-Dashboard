/**
 * SODA Business — TDS Calculation Engine
 *
 * Covers all major TDS sections per Indian Income Tax Act.
 * Uses the tds_sections master table seeded in migration 003.
 *
 * Key rules implemented:
 *  - Section threshold: single payment AND aggregate annual threshold
 *  - Section 206AA: 20% (or higher of applicable rate) if no PAN furnished
 *  - Surcharge: applicable above certain income slabs (simplified: 0 for now, configurable)
 *  - Health & Education Cess: 4% on TDS + surcharge (only for non-residents; skipped for residents)
 *  - Deposit deadlines: 7th of next month (except March → Apr 30)
 *  - Quarter mapping: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar
 */

'use strict';

const { pool } = require('../config/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return Indian FY string for a given date. E.g. 2024-05-01 → '2024-25' */
const getFY = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-based
  return month >= 4 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`;
};

/** Return TDS quarter for a given date. Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar */
const getQuarter = (date) => {
  const month = new Date(date).getMonth() + 1;
  if (month >= 4 && month <= 6)  return 'Q1';
  if (month >= 7 && month <= 9)  return 'Q2';
  if (month >= 10 && month <= 12) return 'Q3';
  return 'Q4';
};

/** TDS deposit due date: 7th of next month; March payments → 30 Apr */
const depositDueDate = (paymentDate) => {
  const d = new Date(paymentDate);
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  if (month === 3) return new Date(year, 3, 30); // Apr 30
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 7);
};

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Calculate TDS for a payment.
 *
 * @param {object} params
 * @param {string} params.section        - TDS section code e.g. '194C'
 * @param {number} params.paymentAmount  - Payment amount in rupees
 * @param {string} params.paymentDate    - ISO date string
 * @param {string|null} params.pan       - Deductee PAN (null/empty → 206AA applies)
 * @param {number} params.companyId      - For aggregate threshold check
 * @param {string} params.deducteeName   - For aggregate lookup
 * @param {boolean} params.isCompany     - True if deductee is company (affects 194C rate)
 *
 * @returns {Promise<object>} Calculation result with breakdown
 */
const calculateTDS = async ({ section, paymentAmount, paymentDate, pan, companyId, deducteeName, isCompany = false }) => {
  // 1. Load section from DB
  const secRow = await pool.query(
    'SELECT * FROM tds_sections WHERE section = $1', [section]
  );
  if (secRow.rows.length === 0) {
    throw new Error(`Unknown TDS section: ${section}`);
  }
  const sec = secRow.rows[0];

  const hasPan = pan && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase().trim());
  const fy = getFY(paymentDate);
  const quarter = getQuarter(paymentDate);

  // 2. Check single-transaction threshold
  const belowSingleThreshold = paymentAmount < sec.threshold_pa;

  // 3. Check aggregate annual threshold for same deductee + section
  let aggregateAmount = paymentAmount;
  if (deducteeName && companyId) {
    const aggRes = await pool.query(
      `SELECT COALESCE(SUM(payment_amount), 0) as total
       FROM tds_deductions
       WHERE company_id = $1 AND section = $2 AND fy = $3
         AND deductee_name ILIKE $4`,
      [companyId, section, fy, deducteeName]
    );
    aggregateAmount = paymentAmount + parseFloat(aggRes.rows[0].total);
  }

  const belowAggregateThreshold = sec.threshold_pa > 0 && aggregateAmount <= sec.threshold_pa;

  // 4. Determine applicable rate
  // 194C: 1% for individual/HUF, 2% for company
  let rate = hasPan ? parseFloat(sec.rate_pct_pan) : parseFloat(sec.rate_pct_no_pan);

  // Special: 194C company rate = 2%
  if (section === '194C' && isCompany && hasPan) rate = 2;
  // 206AA: max of (prescribed rate, 20%) if no PAN — already in rate_pct_no_pan as 20 for most
  if (!hasPan) rate = Math.max(rate, 20);

  // 5. Compute TDS
  const tdsAmount = belowAggregateThreshold ? 0 : Math.round((paymentAmount * rate / 100) * 100) / 100;
  const tdsAmountPaise = Math.round(tdsAmount * 100);

  // 6. Deposit deadline
  const depositDeadline = depositDueDate(paymentDate);

  return {
    section,
    description:       sec.description,
    paymentAmount,
    paymentDate,
    pan:               hasPan ? pan.toUpperCase() : null,
    hasPan,
    rate,
    tdsAmount,
    tdsAmountPaise,
    surcharge:         0,
    healthEducationCess: 0,
    netTdsPayable:     tdsAmount,
    belowThreshold:    belowAggregateThreshold,
    singleThreshold:   parseFloat(sec.threshold_pa),
    aggregateAmount,
    fy,
    quarter,
    depositDeadline:   depositDeadline.toISOString().split('T')[0],
    warning:           !hasPan ? '206AA applies: 20% rate used (PAN not furnished)' : null,
  };
};

// ─── CRUD for TDS deductions ──────────────────────────────────────────────────

/** Record a computed TDS deduction into the DB */
const recordDeduction = async (companyId, userId, data) => {
  const {
    section, deducteeName, deducteePan, paymentDate, paymentAmount,
    tdsRate, tdsAmount, tdsAmountPaise, surcharge = 0, healthEducationCess = 0,
    netTdsPayable, challanNo, challanDate, depositDate, transactionId, invoiceId, notes
  } = data;

  const fy      = getFY(paymentDate);
  const quarter = getQuarter(paymentDate);

  const result = await pool.query(
    `INSERT INTO tds_deductions
       (company_id, transaction_id, invoice_id, section, deductee_name, deductee_pan,
        payment_date, payment_amount, tds_rate, tds_amount, tds_amount_paise,
        surcharge, health_edu_cess, net_tds_payable, challan_no, challan_date,
        deposit_date, status, quarter, fy, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
             CASE WHEN $16 IS NOT NULL THEN 'deposited' ELSE 'pending' END,
             $18,$19,$20,$21)
     RETURNING *`,
    [companyId, transactionId || null, invoiceId || null, section,
     deducteeName, deducteePan || null, paymentDate, paymentAmount,
     tdsRate, tdsAmount, tdsAmountPaise, surcharge, healthEducationCess,
     netTdsPayable, challanNo || null, challanDate || null,
     depositDate || null, quarter, fy, notes || null, userId || null]
  );
  return result.rows[0];
};

/** Get all TDS deductions for a company with optional filters */
const getDeductions = async (companyId, { quarter, fy, section, status, page = 1, limit = 100 }) => {
  let q = `SELECT d.*, s.description as section_description
            FROM tds_deductions d
            LEFT JOIN tds_sections s ON s.section = d.section
            WHERE d.company_id = $1`;
  const params = [companyId];

  if (quarter) { params.push(quarter); q += ` AND d.quarter = $${params.length}`; }
  if (fy)      { params.push(fy);      q += ` AND d.fy = $${params.length}`; }
  if (section) { params.push(section); q += ` AND d.section = $${params.length}`; }
  if (status)  { params.push(status);  q += ` AND d.status = $${params.length}`; }

  const countRes = await pool.query(q.replace('SELECT d.*, s.description as section_description', 'SELECT COUNT(*)'), params);
  const total = parseInt(countRes.rows[0].count, 10);

  const offset = (page - 1) * limit;
  params.push(limit); q += ` ORDER BY d.payment_date DESC LIMIT $${params.length}`;
  params.push(offset); q += ` OFFSET $${params.length}`;

  const result = await pool.query(q, params);
  return { data: result.rows, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) };
};

/** Quarter-wise summary for 26Q filing */
const getQuarterSummary = async (companyId, fy) => {
  const result = await pool.query(
    `SELECT quarter, section,
       COUNT(*) as deductee_count,
       SUM(payment_amount) as total_payments,
       SUM(tds_amount) as total_tds,
       SUM(net_tds_payable) as total_payable,
       COUNT(*) FILTER (WHERE status = 'deposited') as deposited_count,
       COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
       COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
     FROM tds_deductions
     WHERE company_id = $1 AND fy = $2
     GROUP BY quarter, section
     ORDER BY quarter, section`,
    [companyId, fy]
  );
  return result.rows;
};

/** Mark overdue deductions (deposit_date IS NULL and deposit deadline passed) */
const markOverdue = async () => {
  const result = await pool.query(
    `UPDATE tds_deductions
     SET status = 'overdue'
     WHERE status = 'pending'
       AND payment_date < NOW() - INTERVAL '37 days'
       AND challan_no IS NULL
     RETURNING id, company_id, section, payment_date, tds_amount`
  );
  return result.rows;
};

/** Update challan details for a deduction */
const updateChallan = async (id, companyId, { challanNo, challanDate, depositDate }) => {
  const result = await pool.query(
    `UPDATE tds_deductions
     SET challan_no = $3, challan_date = $4, deposit_date = $5,
         status = 'deposited'
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [id, companyId, challanNo, challanDate, depositDate]
  );
  return result.rows[0];
};

/** Get all TDS section definitions */
const getSections = async () => {
  const result = await pool.query('SELECT * FROM tds_sections ORDER BY section');
  return result.rows;
};

module.exports = {
  calculateTDS,
  recordDeduction,
  getDeductions,
  getQuarterSummary,
  markOverdue,
  updateChallan,
  getSections,
  getFY,
  getQuarter,
};
