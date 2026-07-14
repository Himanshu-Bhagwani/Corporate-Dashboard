/**
 * SODA Business — ROC / MCA21 Filing Deadline Tracker
 *
 * Manages due dates for MCA21 forms:
 *   MGT-7, AOC-4, ADT-1, DIR-3 KYC, DPT-3, MSME-1, BEN-2, INC-20A, etc.
 *
 * Due date logic:
 *   - AGM-based forms: company AGM is normally last day of Sep (6 months after FY end Mar 31)
 *   - Fixed-date forms: DIR-3 KYC = Sep 30, DPT-3 = Jun 30, MSME-1 = Apr 30 / Oct 31
 *   - Event-based: INC-20A = 180d from incorporation, CHG-1 = 30d from charge creation
 */

'use strict';

const { pool } = require('../config/db');

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Add N days to a date */
const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

/**
 * Compute due dates for standard AGM-based forms for a given FY.
 * FY 2024-25 → end Mar 31 2025 → AGM = Sep 30 2025
 */
const computeStandardDueDates = (fy) => {
  // Parse FY e.g. '2024-25' → end year 2025
  const endYear = parseInt(fy.split('-')[0]) + 1;

  // AGM = Sep 30 of the year after FY end
  const agm = new Date(endYear, 8, 30); // Sep 30

  // Fixed dates
  const sep30 = new Date(endYear, 8, 30);   // Sep 30 (DIR-3 KYC)
  const jun30  = new Date(endYear, 5, 30);  // Jun 30 (DPT-3)
  const apr30  = new Date(endYear, 3, 30);  // Apr 30 (MSME-1 first)
  const oct31  = new Date(endYear, 9, 31);  // Oct 31 (MSME-1 second)

  return {
    'MGT-7':   addDays(agm, 60),   // 60d after AGM
    'MGT-7A':  addDays(agm, 60),
    'AOC-4':   addDays(agm, 30),   // 30d after AGM
    'AOC-4 CFS': addDays(agm, 30),
    'ADT-1':   addDays(agm, 15),   // 15d after AGM
    'DIR-3 KYC': sep30,
    'DPT-3':   jun30,
    'MSME-1_H1': apr30,            // For Oct-Mar outstanding
    'MSME-1_H2': oct31,            // For Apr-Sep outstanding
    'BEN-2':   null,               // Event-based: 30d after BEN-1 receipt
    'INC-20A': null,               // Event-based: 180d from incorporation
    'CHG-1':   null,               // Event-based: 30d from charge
    'PAS-3':   null,               // Event-based: 30d from allotment
    'SH-7':    null,               // Event-based: 30d from resolution
  };
};

// ─── Seed deadlines for a company ────────────────────────────────────────────

/**
 * Seed standard ROC deadlines for a company for a given FY.
 * Skips forms that are already seeded (idempotent).
 */
const seedCompanyDeadlines = async (companyId, fy) => {
  const dueDates = computeStandardDueDates(fy);

  const templates = await pool.query('SELECT * FROM roc_form_templates');
  const inserted = [];

  for (const tmpl of templates.rows) {
    // Skip event-based forms (no fixed due date) — they're added manually
    const formKey = tmpl.form_name === 'MSME-1' ? 'MSME-1_H1' : tmpl.form_name;
    const dueDate = dueDates[formKey];
    if (!dueDate) continue;

    // Check if already exists
    const exists = await pool.query(
      'SELECT id FROM roc_deadlines WHERE company_id = $1 AND form_name = $2 AND fy = $3',
      [companyId, tmpl.form_name, fy]
    );
    if (exists.rows.length > 0) continue;

    const row = await pool.query(
      `INSERT INTO roc_deadlines
         (company_id, form_name, description, due_date, fy, filing_period, penalty_per_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [companyId, tmpl.form_name, tmpl.description,
       dueDate.toISOString().split('T')[0], fy, tmpl.due_rule, tmpl.penalty_per_day]
    );
    inserted.push(row.rows[0]);
  }

  // Also seed MSME-1 H2 separately
  if (dueDates['MSME-1_H2']) {
    const exists = await pool.query(
      `SELECT id FROM roc_deadlines
       WHERE company_id=$1 AND form_name='MSME-1' AND fy=$2 AND due_date=$3`,
      [companyId, fy, dueDates['MSME-1_H2'].toISOString().split('T')[0]]
    );
    if (exists.rows.length === 0) {
      const tmpl = templates.rows.find(t => t.form_name === 'MSME-1');
      if (tmpl) {
        const row = await pool.query(
          `INSERT INTO roc_deadlines (company_id, form_name, description, due_date, fy, filing_period, penalty_per_day)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [companyId, 'MSME-1', tmpl.description + ' (Apr–Sep outstanding)',
           dueDates['MSME-1_H2'].toISOString().split('T')[0], fy,
           'Oct 31 (for Apr-Sep outstanding payments to MSME)', tmpl.penalty_per_day]
        );
        inserted.push(row.rows[0]);
      }
    }
  }

  return inserted;
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

const getDeadlines = async (companyId, { fy, status, upcoming_days }) => {
  let q = `SELECT * FROM roc_deadlines WHERE company_id = $1`;
  const params = [companyId];

  if (fy)     { params.push(fy);     q += ` AND fy = $${params.length}`; }
  if (status) { params.push(status); q += ` AND status = $${params.length}`; }
  if (upcoming_days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + parseInt(upcoming_days, 10));
    params.push(cutoff.toISOString().split('T')[0]);
    q += ` AND due_date <= $${params.length} AND status = 'pending'`;
  }

  q += ' ORDER BY due_date ASC';
  const result = await pool.query(q, params);
  return result.rows;
};

const addDeadline = async (companyId, data) => {
  const { formName, description, dueDate, fy, filingPeriod, penaltyPerDay, notes } = data;
  const result = await pool.query(
    `INSERT INTO roc_deadlines
       (company_id, form_name, description, due_date, fy, filing_period, penalty_per_day, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId, formName, description, dueDate, fy || null,
     filingPeriod || null, penaltyPerDay || 200, notes || null]
  );
  return result.rows[0];
};

const updateDeadline = async (id, companyId, data) => {
  const { status, filedDate, filingNumber, notes, dueDate } = data;
  const result = await pool.query(
    `UPDATE roc_deadlines
     SET status = COALESCE($3, status),
         filed_date = COALESCE($4, filed_date),
         filing_number = COALESCE($5, filing_number),
         notes = COALESCE($6, notes),
         due_date = COALESCE($7, due_date),
         updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [id, companyId, status || null, filedDate || null,
     filingNumber || null, notes || null, dueDate || null]
  );
  return result.rows[0];
};

/**
 * Get a reminder digest: forms due in N days per company.
 * Used by notification scheduler.
 * Returns: [{company_id, form_name, due_date, days_remaining, penalty_per_day}]
 */
const getUpcomingReminders = async (daysAhead = 30) => {
  const result = await pool.query(
    `SELECT r.*, c.name as company_name,
       (r.due_date - CURRENT_DATE) as days_remaining,
       CASE
         WHEN (r.due_date - CURRENT_DATE) <= 1  THEN 'CRITICAL'
         WHEN (r.due_date - CURRENT_DATE) <= 7  THEN 'HIGH'
         WHEN (r.due_date - CURRENT_DATE) <= 15 THEN 'MEDIUM'
         ELSE 'LOW'
       END as urgency
     FROM roc_deadlines r
     JOIN companies c ON c.id = r.company_id
     WHERE r.status = 'pending'
       AND r.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1
     ORDER BY r.due_date ASC`,
    [daysAhead]
  );
  return result.rows;
};

/** Auto-mark past-due deadlines as overdue */
const markOverdueDeadlines = async () => {
  const result = await pool.query(
    `UPDATE roc_deadlines SET status = 'overdue', updated_at = NOW()
     WHERE status = 'pending' AND due_date < CURRENT_DATE
     RETURNING id, company_id, form_name, due_date`
  );
  return result.rows;
};

/** Penalty calculation for an overdue filing */
const calcPenalty = (deadline) => {
  if (!deadline || deadline.status !== 'overdue') return 0;
  const today = new Date();
  const due = new Date(deadline.due_date);
  const daysLate = Math.max(0, Math.floor((today - due) / (1000 * 60 * 60 * 24)));
  return daysLate * (parseFloat(deadline.penalty_per_day) || 200);
};

module.exports = {
  seedCompanyDeadlines,
  getDeadlines,
  addDeadline,
  updateDeadline,
  getUpcomingReminders,
  markOverdueDeadlines,
  calcPenalty,
  computeStandardDueDates,
};
