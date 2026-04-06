const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Get all companies for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, uc.role 
       FROM companies c
       JOIN user_companies uc ON c.id = uc.company_id
       WHERE uc.user_id = $1
       ORDER BY COALESCE(uc.last_selected_at, uc.created_at, c.created_at) DESC`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Remember the last selected company for the current user
router.put('/active/:companyId', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const result = await pool.query(
      `UPDATE user_companies
       SET last_selected_at = NOW()
       WHERE user_id = $1 AND company_id = $2
       RETURNING company_id`,
      [req.user.userId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company link not found for user' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Set active company error:', error);
    res.status(500).json({ error: 'Failed to set active company' });
  }
});

// Create new company
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, industry, taxId, address, gstin, pan, entityType, plan, teamInvites } = req.body;

    // Create company
    const companyResult = await pool.query(
      'INSERT INTO companies (name, industry, tax_id, address, gstin, pan, entity_type, plan) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, industry, taxId, address, gstin, pan, entityType, plan]
    );

    const company = companyResult.rows[0];

    // Link user to company as owner
    await pool.query(
      'INSERT INTO user_companies (user_id, company_id, role, last_selected_at) VALUES ($1, $2, $3, NOW())',
      [req.user.userId, company.id, 'owner']
    );

    // Add team invites
    if (teamInvites && Array.isArray(teamInvites) && teamInvites.length > 0) {
      for (const invite of teamInvites) {
        if (invite.email && invite.role) {
          await pool.query(
            'INSERT INTO team_invites (company_id, email, role, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [company.id, invite.email, invite.role, 'pending']
          );
        }
      }
    }

    res.json(company);
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// Update company
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, industry, taxId, address } = req.body;

    const result = await pool.query(
      'UPDATE companies SET name = $1, industry = $2, tax_id = $3, address = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
      [name, industry, taxId, address, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

module.exports = router;
