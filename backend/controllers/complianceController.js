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
    } = req.body;

    const result = await pool.query(`
      INSERT INTO compliance_events
        (company_id, type, title, due_date, status, payment_status,
         sales_amount, net_tax_payable, itc_available, advance_tax_paid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, type, title, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
                status, payment_status,
                COALESCE(sales_amount, 0) as sales_amount,
                COALESCE(net_tax_payable, 0) as net_tax_payable,
                COALESCE(itc_available, 0) as itc_available,
                COALESCE(advance_tax_paid, 0) as advance_tax_paid
    `, [companyId, type, title, due_date, status, payment_status,
        sales_amount || 0, net_tax_payable || 0, itc_available || 0, advance_tax_paid || 0]);

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
