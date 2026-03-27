const { pool } = require('../config/db');

// GET all compliance filings for a company
const getFilings = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const result = await pool.query(
      `SELECT id, name, type, 
              TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
              status,
              TO_CHAR(filed_date, 'YYYY-MM-DD') as filed_date,
              created_at,
              GREATEST(due_date - CURRENT_DATE, 0) as days_left
       FROM compliance_filings 
       WHERE company_id = $1 
       ORDER BY due_date ASC`,
      [companyId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get compliance filings error:', error);
    res.status(500).json({ error: 'Failed to fetch compliance filings' });
  }
};

// PUT mark a filing as filed
const markFiled = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const result = await pool.query(
      `UPDATE compliance_filings 
       SET status = 'filed', filed_date = CURRENT_DATE 
       WHERE id = $1 AND company_id = $2 
       RETURNING *`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Filing not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Mark compliance filed error:', error);
    res.status(500).json({ error: 'Failed to update filing' });
  }
};

module.exports = { getFilings, markFiled };
