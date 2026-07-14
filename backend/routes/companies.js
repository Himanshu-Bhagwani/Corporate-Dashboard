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

    // Automatically seed demo data for new companies so they have preloaded data!
    try {
      const { seedCompanyData } = require('../seed-on-start');
      await seedCompanyData(company.id);
      console.log(`Auto-seeded new company ID ${company.id} for user ID ${req.user.userId}`);
    } catch (seedErr) {
      console.error('Failed to auto-seed new company:', seedErr.message);
    }

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

// Update company (full settings update including GSTIN, PAN, entity_type)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, industry, taxId, address, gstin, pan, entityType, email } = req.body;

    // Verify user belongs to this company
    const memberCheck = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.user.userId, id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           industry = COALESCE($2, industry),
           tax_id = COALESCE($3, tax_id),
           address = COALESCE($4, address),
           gstin = COALESCE($5, gstin),
           pan = COALESCE($6, pan),
           entity_type = COALESCE($7, entity_type),
           updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, industry, taxId, address, gstin || null, pan || null, entityType || null, id]
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

// Get team invites for a company
router.get('/:id/team', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const memberCheck = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.user.userId, id]
    );
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await pool.query(
      'SELECT * FROM team_invites WHERE company_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Invite a new team member
router.post('/:id/team', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;

    if (!email || !role) return res.status(400).json({ error: 'Email and role required' });

    const memberCheck = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.user.userId, id]
    );
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await pool.query(
      `INSERT INTO team_invites (company_id, email, role, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (company_id, email) DO UPDATE SET role = $3, status = 'pending', created_at = NOW()
       RETURNING *`,
      [id, email, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// Remove a team invite
router.delete('/:id/team/:inviteId', authenticateToken, async (req, res) => {
  try {
    const { id, inviteId } = req.params;
    const memberCheck = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.user.userId, id]
    );
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    await pool.query('DELETE FROM team_invites WHERE id = $1 AND company_id = $2', [inviteId, id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Upgrade company plan
router.put('/:id/plan', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body;

    const VALID_PLANS = ['Launchpad', 'Growth', 'Enterprise X'];
    if (!plan || !VALID_PLANS.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be Launchpad, Growth, or Enterprise X.' });
    }

    // Verify the user owns (or belongs to) this company
    const memberCheck = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.user.userId, id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get current plan
    const currentResult = await pool.query('SELECT plan FROM companies WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const currentPlan = currentResult.rows[0].plan;
    const currentIdx = VALID_PLANS.indexOf(currentPlan);
    const newIdx = VALID_PLANS.indexOf(plan);

    if (newIdx <= currentIdx) {
      return res.status(400).json({ error: 'Can only upgrade to a higher plan.' });
    }

    const result = await pool.query(
      'UPDATE companies SET plan = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [plan, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Upgrade plan error:', error);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
});

module.exports = router;
