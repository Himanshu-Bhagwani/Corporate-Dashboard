const { pool } = require('../config/db');

/* ── Helpers ──────────────────────────────────────────────────────── */

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Add N months to a date, clamping the day (e.g. 31 Jan + 1m → 28 Feb)
const addMonths = (dateStr, months) => {
  const d = new Date(dateStr);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, daysInMonth));
  return target.toISOString().slice(0, 10);
};

// Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1)
const computeEmi = (principal, annualRate, tenureMonths) => {
  const P = parseFloat(principal) || 0;
  const n = parseInt(tenureMonths) || 0;
  const r = (parseFloat(annualRate) || 0) / 12 / 100;
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return round2(P / n);
  return round2((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
};

const buildEmiSchedule = ({ principal, annualRate, tenureMonths, emiAmount, firstEmiDate }) => {
  const n = parseInt(tenureMonths);
  const r = (parseFloat(annualRate) || 0) / 12 / 100;
  const emi = parseFloat(emiAmount) > 0 ? round2(emiAmount) : computeEmi(principal, annualRate, n);
  const rows = [];
  let balance = round2(principal);
  for (let i = 1; i <= n && balance > 0; i++) {
    const interest = round2(balance * r);
    let principalComp = round2(emi - interest);
    let rowEmi = emi;
    // Final EMI clears whatever balance remains
    if (i === n || principalComp >= balance) {
      principalComp = balance;
      rowEmi = round2(principalComp + interest);
    }
    balance = round2(balance - principalComp);
    rows.push({
      emi_number: i,
      due_date: addMonths(firstEmiDate, i - 1),
      principal: principalComp,
      interest,
      emi_amount: rowEmi,
    });
  }
  return rows;
};

// Flag pending EMIs past their due date as OVERDUE (scoped to a company)
const refreshOverdueEmis = async (companyId) => {
  await pool.query(
    `UPDATE loan_emis SET status = 'OVERDUE'
     WHERE status = 'PENDING' AND due_date < CURRENT_DATE
       AND loan_id IN (SELECT id FROM loans WHERE company_id = $1)`,
    [companyId]
  );
};

// Make sure the CoA has the accounts EMI payments post against
const ensureCoaAccount = async (client, companyId, code, name, accountType, description) => {
  const existing = await client.query(
    'SELECT id FROM chart_of_accounts WHERE company_id = $1 AND LOWER(name) = LOWER($2)',
    [companyId, name]
  );
  if (existing.rows.length > 0) return;
  await client.query(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [companyId, code, name, accountType, description]
  );
};

/* ── GET /api/loans — list + dashboard summary strip ──────────────── */
const getLoans = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    await refreshOverdueEmis(companyId);

    const loansResult = await pool.query(
      `SELECT l.*,
        next_emi.due_date  AS next_emi_date,
        next_emi.emi_amount AS next_emi_amount,
        emis.total_emis, emis.paid_emis
       FROM loans l
       LEFT JOIN LATERAL (
         SELECT due_date, emi_amount FROM loan_emis
         WHERE loan_id = l.id AND status IN ('PENDING','OVERDUE','PARTIALLY_PAID')
         ORDER BY due_date ASC LIMIT 1
       ) next_emi ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS total_emis,
                COUNT(*) FILTER (WHERE status = 'PAID') AS paid_emis
         FROM loan_emis WHERE loan_id = l.id
       ) emis ON true
       WHERE l.company_id = $1
       ORDER BY l.created_at DESC`,
      [companyId]
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','REJECTED')) AS total_active,
         COUNT(*) FILTER (WHERE status = 'CLOSED') AS total_closed,
         COALESCE(SUM(outstanding_principal) FILTER (WHERE status IN ('DISBURSED','REPAYMENT_ACTIVE')), 0) AS total_outstanding
       FROM loans WHERE company_id = $1`,
      [companyId]
    );

    const interestResult = await pool.query(
      `SELECT COALESCE(SUM(e.interest), 0) AS interest_paid
       FROM loan_emis e JOIN loans l ON l.id = e.loan_id
       WHERE l.company_id = $1 AND e.status = 'PAID'`,
      [companyId]
    );

    const nextEmiResult = await pool.query(
      `SELECT e.due_date, e.emi_amount, l.loan_ref, l.lender_bank, l.lender
       FROM loan_emis e JOIN loans l ON l.id = e.loan_id
       WHERE l.company_id = $1 AND e.status IN ('PENDING','OVERDUE','PARTIALLY_PAID')
       ORDER BY e.due_date ASC LIMIT 1`,
      [companyId]
    );

    const s = summaryResult.rows[0];
    res.json({
      loans: loansResult.rows,
      summary: {
        totalActive: parseInt(s.total_active) || 0,
        totalClosed: parseInt(s.total_closed) || 0,
        totalOutstanding: parseFloat(s.total_outstanding) || 0,
        totalInterestPaid: parseFloat(interestResult.rows[0].interest_paid) || 0,
        nextEmi: nextEmiResult.rows[0] || null,
      },
    });
  } catch (error) {
    console.error('Error fetching loans:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

/* ── GET /api/loans/prefill — company + financial data for the form ─ */
const getLoanPrefill = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const companyResult = await pool.query(
      `SELECT name, industry, entity_type, gstin, pan, tax_id, created_at
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (companyResult.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    const [turnoverResult, monthlyResult, yearlyResult, existingResult, gstResult, itrResult] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS turnover FROM transactions
         WHERE company_id = $1 AND type = 'income' AND date >= NOW() - INTERVAL '12 months'`,
        [companyId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount) / 3.0, 0) AS monthly FROM transactions
         WHERE company_id = $1 AND type = 'income' AND date >= NOW() - INTERVAL '3 months'`,
        [companyId]
      ),
      pool.query(
        `SELECT EXTRACT(YEAR FROM date)::int AS year,
                SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS net_profit
         FROM transactions WHERE company_id = $1
         GROUP BY 1 ORDER BY 1 DESC LIMIT 3`,
        [companyId]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(outstanding_principal), 0) AS outstanding
         FROM loans WHERE company_id = $1 AND status IN ('SANCTIONED','DISBURSED','REPAYMENT_ACTIVE')`,
        [companyId]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE type = 'GST' AND status = 'FILED') AS filed,
                COUNT(*) FILTER (WHERE type = 'GST') AS total
         FROM compliance_events WHERE company_id = $1`,
        [companyId]
      ),
      pool.query(
        `SELECT COUNT(*) AS filed FROM compliance_events
         WHERE company_id = $1 AND type IN ('INCOME_TAX','Income Tax') AND status = 'FILED'`,
        [companyId]
      ),
    ]);

    const gst = gstResult.rows[0];
    const gstFilingStatus =
      parseInt(gst.total) === 0 ? '' :
      parseInt(gst.filed) === parseInt(gst.total) ? 'Up to date' :
      parseInt(gst.filed) > 0 ? 'Partially filed' : 'Not filed';

    res.json({
      company: companyResult.rows[0],
      financials: {
        annualTurnover: round2(turnoverResult.rows[0].turnover),
        monthlyRevenue: round2(monthlyResult.rows[0].monthly),
        yearlyNetProfits: yearlyResult.rows.map(r => ({ year: r.year, netProfit: round2(r.net_profit) })),
        gstFilingStatus,
        itrFiled: parseInt(itrResult.rows[0].filed) > 0,
      },
      existingLoans: {
        count: parseInt(existingResult.rows[0].cnt) || 0,
        outstanding: parseFloat(existingResult.rows[0].outstanding) || 0,
      },
    });
  } catch (error) {
    console.error('Error building loan prefill:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

/* ── POST /api/loans — submit a new application ───────────────────── */
const createLoan = async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const {
      loan_type, lender,
      company_name, cin_number, date_of_incorporation, business_type, industry, annual_turnover,
      amount_required, purpose, tenure_preferred_months, has_existing_loans, existing_loans_outstanding,
      net_profit_y1, net_profit_y2, net_profit_y3, monthly_revenue, gst_filing_status, itr_filed,
      documents,
    } = req.body;

    if (!company_name || !amount_required) {
      return res.status(400).json({ error: 'Company name and loan amount are required' });
    }

    await client.query('BEGIN');

    const year = new Date().getFullYear();
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(NULLIF(SPLIT_PART(loan_ref, '-', 3), '')::int), 0) + 1 AS next
       FROM loans WHERE loan_ref LIKE $1`,
      [`LOAN-${year}-%`]
    );
    const loanRef = `LOAN-${year}-${String(seqResult.rows[0].next).padStart(3, '0')}`;

    const result = await client.query(
      `INSERT INTO loans (
         company_id, loan_ref, loan_type, lender, status,
         company_name, cin_number, date_of_incorporation, business_type, industry, annual_turnover,
         amount_required, purpose, tenure_preferred_months, has_existing_loans, existing_loans_outstanding,
         net_profit_y1, net_profit_y2, net_profit_y3, monthly_revenue, gst_filing_status, itr_filed,
         documents
       ) VALUES ($1,$2,$3,$4,'SUBMITTED',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        companyId, loanRef, loan_type || 'TERM_LOAN', lender || null,
        company_name, cin_number || null, date_of_incorporation || null, business_type || null, industry || null, annual_turnover || null,
        amount_required, purpose || null, tenure_preferred_months || null, Boolean(has_existing_loans), existing_loans_outstanding || 0,
        net_profit_y1 || null, net_profit_y2 || null, net_profit_y3 || null, monthly_revenue || null, gst_filing_status || null, Boolean(itr_filed),
        JSON.stringify(documents || []),
      ]
    );

    await client.query(
      `INSERT INTO loan_status_history (loan_id, status, note) VALUES ($1, 'SUBMITTED', 'Loan application submitted')`,
      [result.rows[0].id]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating loan:', error.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

/* ── GET /api/loans/:id — full detail (history + EMI schedule) ────── */
const getLoan = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    const { id } = req.params;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    await refreshOverdueEmis(companyId);

    const loanResult = await pool.query(
      'SELECT * FROM loans WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (loanResult.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });

    const [historyResult, emisResult] = await Promise.all([
      pool.query('SELECT * FROM loan_status_history WHERE loan_id = $1 ORDER BY created_at ASC, id ASC', [id]),
      pool.query('SELECT * FROM loan_emis WHERE loan_id = $1 ORDER BY emi_number ASC', [id]),
    ]);

    res.json({
      loan: loanResult.rows[0],
      history: historyResult.rows,
      emis: emisResult.rows,
    });
  } catch (error) {
    console.error('Error fetching loan:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

/* ── PATCH /api/loans/:id/status — manual status move + note ──────── */
const updateLoanStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = req.headers['x-company-id'];
    const { id } = req.params;
    const { status, note } = req.body;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const VALID = ['SUBMITTED', 'UNDER_REVIEW', 'SANCTIONED', 'DISBURSED', 'REPAYMENT_ACTIVE', 'CLOSED', 'REJECTED'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE loans SET status = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3 RETURNING *`,
      [status, id, companyId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Loan not found' });
    }

    // Closing a loan means every remaining EMI is settled and nothing's owed.
    // We skip auto-transactions here — closures are usually a foreclosure/lump-sum
    // rather than N monthly debits, so the finance team records that payoff manually.
    let closedEmiCount = 0;
    if (status === 'CLOSED') {
      const closeResult = await client.query(
        `UPDATE loan_emis
         SET status = 'PAID',
             paid_amount = emi_amount,
             paid_date = COALESCE(paid_date, CURRENT_DATE)
         WHERE loan_id = $1 AND status <> 'PAID'
         RETURNING id`,
        [id]
      );
      closedEmiCount = closeResult.rowCount;
      await client.query(
        `UPDATE loans SET outstanding_principal = 0, updated_at = NOW() WHERE id = $1`,
        [id]
      );
    }

    const finalNote = status === 'CLOSED' && closedEmiCount > 0
      ? `${note ? note + ' · ' : ''}${closedEmiCount} remaining EMI${closedEmiCount === 1 ? '' : 's'} marked paid on close`
      : (note || null);

    await client.query(
      'INSERT INTO loan_status_history (loan_id, status, note) VALUES ($1, $2, $3)',
      [id, status, finalNote]
    );
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating loan status:', error.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

/* ── PUT /api/loans/:id/sanction — save terms + generate EMI plan ─── */
// EMI is *always* auto-calculated from the disbursed amount (RBI norm: interest
// accrues from disbursal, and borrowers repay only the disbursed principal).
// If disbursed_amount isn't provided yet, we fall back to sanctioned_amount so
// the schedule still generates — it'll be regenerated once disbursal is entered.
const saveSanctionDetails = async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = req.headers['x-company-id'];
    const { id } = req.params;
    const {
      sanctioned_amount, disbursed_amount, interest_rate, tenure_months,
      first_emi_date, lender_bank, loan_account_number, processing_fee,
    } = req.body;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    if (!sanctioned_amount || !interest_rate || !tenure_months || !first_emi_date) {
      return res.status(400).json({ error: 'Sanctioned amount, interest rate, tenure and first EMI date are required' });
    }

    // A lender can disburse a sanctioned facility in parts, but never more than
    // what was sanctioned.
    const sanctionedNum = parseFloat(sanctioned_amount);
    const disbursedNum = parseFloat(disbursed_amount);
    if (Number.isFinite(disbursedNum) && disbursedNum > sanctionedNum) {
      return res.status(400).json({
        error: `Disbursed amount (₹${disbursedNum.toLocaleString('en-IN')}) cannot exceed the sanctioned amount (₹${sanctionedNum.toLocaleString('en-IN')}).`,
      });
    }

    const loanCheck = await pool.query(
      'SELECT id, status FROM loans WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );
    if (loanCheck.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });

    // Repayment principal = disbursed amount when set, else sanctioned as a placeholder
    const repayPrincipal = parseFloat(disbursed_amount) > 0
      ? parseFloat(disbursed_amount)
      : parseFloat(sanctioned_amount);

    const emi = computeEmi(repayPrincipal, interest_rate, tenure_months);

    const schedule = buildEmiSchedule({
      principal: repayPrincipal,
      annualRate: interest_rate,
      tenureMonths: tenure_months,
      emiAmount: emi,
      firstEmiDate: first_emi_date,
    });
    const lastEmiDate = schedule.length > 0 ? schedule[schedule.length - 1].due_date : null;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE loans SET
         sanctioned_amount = $1, disbursed_amount = $2, interest_rate = $3, tenure_months = $4,
         emi_amount = $5, first_emi_date = $6, last_emi_date = $7, lender_bank = $8,
         loan_account_number = $9, processing_fee = $10,
         outstanding_principal = $11,
         lender = COALESCE($8, lender),
         updated_at = NOW()
       WHERE id = $12 AND company_id = $13
       RETURNING *`,
      [
        sanctioned_amount, disbursed_amount || null, interest_rate, tenure_months,
        emi, first_emi_date, lastEmiDate, lender_bank || null,
        loan_account_number || null, processing_fee || null,
        repayPrincipal,
        id, companyId,
      ]
    );

    // Regenerate the schedule from scratch (sanction terms are the source of truth)
    await client.query('DELETE FROM loan_emis WHERE loan_id = $1', [id]);
    for (const row of schedule) {
      await client.query(
        `INSERT INTO loan_emis (loan_id, emi_number, due_date, principal, interest, emi_amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, row.emi_number, row.due_date, row.principal, row.interest, row.emi_amount]
      );
    }

    // Application still in review → recording sanction terms means it's sanctioned
    if (['SUBMITTED', 'UNDER_REVIEW'].includes(loanCheck.rows[0].status)) {
      await client.query('UPDATE loans SET status = $1 WHERE id = $2', ['SANCTIONED', id]);
      await client.query(
        `INSERT INTO loan_status_history (loan_id, status, note) VALUES ($1, 'SANCTIONED', 'Sanction terms recorded')`,
        [id]
      );
      result.rows[0].status = 'SANCTIONED';
    }

    await client.query('COMMIT');
    res.json({ loan: result.rows[0], emis: schedule });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving sanction details:', error.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

/* ── PATCH /api/loans/:id/emis/:emiId — update EMI row status ─────── */
// Marking PAID auto-creates debit transactions (Loan Interest + Principal
// Repayment) so the books stay accurate without manual entry.
const updateEmiStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = req.headers['x-company-id'];
    const { id, emiId } = req.params;
    const { status, paid_amount, paid_date } = req.body;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const VALID = ['PENDING', 'PAID', 'OVERDUE', 'PARTIALLY_PAID'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid EMI status' });

    const emiResult = await pool.query(
      `SELECT e.*, l.loan_ref, l.lender, l.lender_bank, l.outstanding_principal, l.company_id
       FROM loan_emis e JOIN loans l ON l.id = e.loan_id
       WHERE e.id = $1 AND e.loan_id = $2 AND l.company_id = $3`,
      [emiId, id, companyId]
    );
    if (emiResult.rows.length === 0) return res.status(404).json({ error: 'EMI not found' });

    const emi = emiResult.rows[0];
    const prevStatus = emi.status;
    const payDate = paid_date || new Date().toISOString().slice(0, 10);
    const bankLabel = emi.lender_bank || emi.lender || 'Bank';

    await client.query('BEGIN');

    let newPaidAmount = 0;
    let newPaidDate = null;
    if (status === 'PAID') {
      newPaidAmount = round2(paid_amount || emi.emi_amount);
      newPaidDate = payDate;
    } else if (status === 'PARTIALLY_PAID') {
      newPaidAmount = round2(paid_amount || 0);
      newPaidDate = payDate;
    }

    const updated = await client.query(
      `UPDATE loan_emis SET status = $1, paid_amount = $2, paid_date = $3
       WHERE id = $4 RETURNING *`,
      [status, newPaidAmount, newPaidDate, emiId]
    );

    // Outstanding principal moves only on full payment (and its reversal)
    if (status === 'PAID' && prevStatus !== 'PAID') {
      await client.query(
        `UPDATE loans SET outstanding_principal = GREATEST(outstanding_principal - $1, 0), updated_at = NOW()
         WHERE id = $2`,
        [emi.principal, id]
      );

      // Keep the CoA aware of the loan accounts we post against
      await ensureCoaAccount(client, companyId, '5310', 'Loan Interest', 'Expense', 'Interest paid on borrowings (auto-created by Loans module)');
      await ensureCoaAccount(client, companyId, '2310', 'Loan Principal Repayment', 'Liability', 'Principal repayments on borrowings (auto-created by Loans module)');

      // Auto-post the debit entries into the Transactions module
      if (parseFloat(emi.interest) > 0) {
        await client.query(
          `INSERT INTO transactions (company_id, name, type, category, amount, date, notes)
           VALUES ($1, $2, 'expense', 'Loan Interest', $3, $4, $5)`,
          [companyId, `Loan Interest — ${emi.loan_ref} EMI #${emi.emi_number}`, emi.interest, payDate,
           `Auto-created on EMI payment to ${bankLabel}`]
        );
      }
      if (parseFloat(emi.principal) > 0) {
        await client.query(
          `INSERT INTO transactions (company_id, name, type, category, amount, date, notes)
           VALUES ($1, $2, 'expense', 'Loan Repayment', $3, $4, $5)`,
          [companyId, `Loan Principal Repayment — ${emi.loan_ref} EMI #${emi.emi_number}`, emi.principal, payDate,
           `Auto-created on EMI payment to ${bankLabel}`]
        );
      }
    } else if (prevStatus === 'PAID' && status !== 'PAID') {
      await client.query(
        `UPDATE loans SET outstanding_principal = outstanding_principal + $1, updated_at = NOW()
         WHERE id = $2`,
        [emi.principal, id]
      );
    }

    await client.query('COMMIT');

    const loanResult = await pool.query('SELECT * FROM loans WHERE id = $1', [id]);
    res.json({ emi: updated.rows[0], loan: loanResult.rows[0], transactionsCreated: status === 'PAID' && prevStatus !== 'PAID' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating EMI:', error.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

/* ── DELETE /api/loans/:id — remove an application ────────────────── */
const deleteLoan = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    const { id } = req.params;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const result = await pool.query(
      'DELETE FROM loans WHERE id = $1 AND company_id = $2 RETURNING id',
      [id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });
    res.json({ message: 'Loan deleted successfully' });
  } catch (error) {
    console.error('Error deleting loan:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getLoans,
  getLoanPrefill,
  createLoan,
  getLoan,
  updateLoanStatus,
  saveSanctionDetails,
  updateEmiStatus,
  deleteLoan,
};
