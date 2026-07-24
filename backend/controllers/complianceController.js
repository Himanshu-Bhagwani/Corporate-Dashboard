const { pool } = require('../config/db');

const getCompanyId = (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) throw new Error('Company ID required');
  return companyId;
};

const calculateScoreInternal = async (companyId) => {
  const result = await pool.query(`
    SELECT
      SUM(CASE WHEN status = 'OVERDUE' THEN 1 ELSE 0 END) as overdue_count,
      SUM(CASE WHEN status = 'PENDING' AND due_date <= CURRENT_DATE + INTERVAL '7 days' AND due_date >= CURRENT_DATE THEN 1 ELSE 0 END) as due_soon_count,
      SUM(CASE WHEN status = 'PENDING' AND due_date > CURRENT_DATE + INTERVAL '7 days' THEN 1 ELSE 0 END) as pending_count
    FROM compliance_events
    WHERE company_id = $1
  `, [companyId]);

  const overdue = parseInt(result.rows[0].overdue_count || 0, 10);
  const dueSoon = parseInt(result.rows[0].due_soon_count || 0, 10);
  const pending = parseInt(result.rows[0].pending_count || 0, 10);

  let score = 100 - (15 * overdue) - (5 * dueSoon) - (2 * pending);
  if (score < 0) score = 0;

  await pool.query(`
    INSERT INTO compliance_scores (company_id, score, last_calculated)
    VALUES ($1, $2, NOW())
    ON CONFLICT (company_id) DO UPDATE SET score = $2, last_calculated = NOW()
  `, [companyId, score]);

  return score;
};

const getEvents = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const result = await pool.query(`
      SELECT id, type, title, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status, payment_status,
             COALESCE(sales_amount, 0) as sales_amount,
             COALESCE(net_tax_payable, 0) as net_tax_payable,
             COALESCE(itc_available, 0) as itc_available,
             COALESCE(advance_tax_paid, 0) as advance_tax_paid,
             tds_form, tds_quarter, tds_fy, tan, tds_section,
             COALESCE(deductee_count, 0) as deductee_count,
             COALESCE(amount_paid, 0) as amount_paid,
             COALESCE(tds_deducted, 0) as tds_deducted,
             COALESCE(tds_deposited, 0) as tds_deposited,
             challan_no, TO_CHAR(challan_date, 'YYYY-MM-DD') as challan_date, bsr_code,
             COALESCE(late_fee, 0) as late_fee,
             created_at
      FROM compliance_events
      WHERE company_id = $1
      ORDER BY due_date ASC
    `, [companyId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const {
      type, title, due_date,
      status = 'PENDING', payment_status = 'UNPAID',
      sales_amount = 0, net_tax_payable = 0,
      itc_available = 0, advance_tax_paid = 0,
      // TDS / TCS filing details
      tds_form = null, tds_quarter = null, tds_fy = null, tan = null, tds_section = null,
      deductee_count = 0, amount_paid = 0, tds_deducted = 0, tds_deposited = 0,
      challan_no = null, challan_date = null, bsr_code = null, late_fee = 0,
    } = req.body;

    // For a TDS filing the outstanding liability is what was deducted but not
    // yet deposited, plus the 234E late fee. Chart of Accounts reads
    // net_tax_payable, so derive it here rather than trusting the client.
    //
    // Section 234E caps the ₹200/day fee at the total TDS amount of the return,
    // so a filing with no TDS deducted cannot carry a late fee at all.
    let netPayable = net_tax_payable || 0;
    let cappedLateFee = parseFloat(late_fee) || 0;
    if (type === 'TDS') {
      const deducted = parseFloat(tds_deducted) || 0;
      const deposited = parseFloat(tds_deposited) || 0;
      cappedLateFee = Math.min(cappedLateFee, deducted);
      netPayable = Math.max(deducted - deposited + cappedLateFee, 0);
    }

    const result = await pool.query(`
      INSERT INTO compliance_events
        (company_id, type, title, due_date, status, payment_status,
         sales_amount, net_tax_payable, itc_available, advance_tax_paid,
         tds_form, tds_quarter, tds_fy, tan, tds_section,
         deductee_count, amount_paid, tds_deducted, tds_deposited,
         challan_no, challan_date, bsr_code, late_fee)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id, type, title, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
                status, payment_status,
                COALESCE(sales_amount, 0) as sales_amount,
                COALESCE(net_tax_payable, 0) as net_tax_payable,
                COALESCE(itc_available, 0) as itc_available,
                COALESCE(advance_tax_paid, 0) as advance_tax_paid,
                tds_form, tds_quarter, tds_fy, tan, tds_section,
                COALESCE(deductee_count, 0) as deductee_count,
                COALESCE(amount_paid, 0) as amount_paid,
                COALESCE(tds_deducted, 0) as tds_deducted,
                COALESCE(tds_deposited, 0) as tds_deposited,
                challan_no, TO_CHAR(challan_date, 'YYYY-MM-DD') as challan_date, bsr_code,
                COALESCE(late_fee, 0) as late_fee
    `, [companyId, type, title, due_date, status, payment_status,
        sales_amount || 0, netPayable, itc_available || 0, advance_tax_paid || 0,
        tds_form, tds_quarter, tds_fy, tan, tds_section,
        parseInt(deductee_count, 10) || 0, amount_paid || 0, tds_deducted || 0, tds_deposited || 0,
        challan_no, challan_date || null, bsr_code, cappedLateFee]);

    await calculateScoreInternal(companyId);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const { id } = req.params;
    const { status, payment_status } = req.body;

    const result = await pool.query(`
      UPDATE compliance_events
      SET status = COALESCE($1, status),
          payment_status = COALESCE($2, payment_status)
      WHERE id = $3 AND company_id = $4
      RETURNING *
    `, [status, payment_status, id, companyId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });

    await calculateScoreInternal(companyId);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM compliance_events WHERE id = $1 AND company_id = $2 RETURNING *',
      [id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });

    await calculateScoreInternal(companyId);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCalendar = async (req, res) => {
  return getEvents(req, res);
};

const getScore = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const score = await calculateScoreInternal(companyId);
    res.json({ score });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAlerts = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const result = await pool.query(`
      SELECT id, type, title, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status, payment_status
      FROM compliance_events
      WHERE company_id = $1
        AND status != 'FILED'
        AND (due_date <= CURRENT_DATE + INTERVAL '5 days' OR status = 'OVERDUE')
      ORDER BY due_date ASC
    `, [companyId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getEvents, createEvent, updateEvent, deleteEvent, getCalendar, getScore, getAlerts,
};
