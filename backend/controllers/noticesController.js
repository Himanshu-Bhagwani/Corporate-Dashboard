const { pool } = require('../config/db');

const getCompanyId = (req) => {
  const id = req.headers['x-company-id'];
  if (!id) throw new Error('Company ID required');
  return id;
};

const autoMarkOverdue = async (companyId) => {
  await pool.query(
    `UPDATE compliance_notices
     SET status = 'Overdue'
     WHERE company_id = $1 AND status = 'Open' AND due_date < CURRENT_DATE`,
    [companyId]
  );
};

const getNotices = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    await autoMarkOverdue(companyId);

    const result = await pool.query(
      `SELECT id, title, department,
              TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
              description, priority, status,
              TO_CHAR(created_at, 'YYYY-MM-DD') as created_at
       FROM compliance_notices
       WHERE company_id = $1
       ORDER BY
         CASE WHEN status = 'Overdue' THEN 0 WHEN status = 'Open' THEN 1 ELSE 2 END,
         due_date ASC`,
      [companyId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createNotice = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { title, department, due_date, description, priority = 'Medium' } = req.body;

    if (!title || !department || !due_date) {
      return res.status(400).json({ error: 'Title, department, and due date are required' });
    }

    const dueDate = new Date(due_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const initialStatus = dueDate < today ? 'Overdue' : 'Open';

    const result = await pool.query(
      `INSERT INTO compliance_notices (company_id, title, department, due_date, description, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, department,
                 TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
                 description, priority, status,
                 TO_CHAR(created_at, 'YYYY-MM-DD') as created_at`,
      [companyId, title, department, due_date, description || '', priority, initialStatus]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateNotice = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      `UPDATE compliance_notices
       SET status = COALESCE($1, status)
       WHERE id = $2 AND company_id = $3
       RETURNING id, title, department,
                 TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
                 description, priority, status,
                 TO_CHAR(created_at, 'YYYY-MM-DD') as created_at`,
      [status, id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Notice not found' });

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteNotice = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM compliance_notices WHERE id = $1 AND company_id = $2 RETURNING *',
      [id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Notice not found' });

    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getNotices, createNotice, updateNotice, deleteNotice };
