/**
 * ROC Deadline Routes — /api/roc
 *
 * GET  /templates              → all standard form templates
 * POST /seed                   → seed standard deadlines for company + FY
 * GET  /                       → list deadlines (filterable)
 * POST /                       → add custom/event-based deadline
 * PUT  /:id                    → update status / filing details
 * GET  /reminders              → upcoming deadlines in next 30d
 * GET  /penalty/:id            → compute penalty for an overdue filing
 * POST /mark-overdue           → mark past-due as overdue
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const {
  seedCompanyDeadlines, getDeadlines, addDeadline, updateDeadline,
  getUpcomingReminders, markOverdueDeadlines, calcPenalty,
} = require('../services/rocService');

router.use(authenticateToken);

// ── GET /templates ────────────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roc_form_templates ORDER BY form_name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /seed ────────────────────────────────────────────────────────────────
router.post('/seed', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const fy = req.body.fy || (() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
    })();
    const inserted = await seedCompanyDeadlines(companyId, fy);
    res.json({ seeded: inserted.length, fy, items: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { fy, status, upcoming_days } = req.query;
    const rows = await getDeadlines(companyId, { fy, status, upcoming_days });
    // Annotate with days_remaining and penalty
    const today = new Date();
    const annotated = rows.map(r => ({
      ...r,
      days_remaining: Math.ceil((new Date(r.due_date) - today) / (1000 * 60 * 60 * 24)),
      penalty_accrued: r.status === 'overdue' ? calcPenalty(r) : 0,
    }));
    res.json(annotated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { formName, dueDate } = req.body;
    if (!formName || !dueDate) return res.status(400).json({ error: 'formName and dueDate required' });
    const row = await addDeadline(companyId, req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    const row = await updateDeadline(req.params.id, companyId, req.body);
    if (!row) return res.status(404).json({ error: 'Deadline not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /reminders ────────────────────────────────────────────────────────────
router.get('/reminders', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const all  = await getUpcomingReminders(days);
    // Filter to requesting company if header set
    const companyId = req.headers['x-company-id'];
    const rows = companyId ? all.filter(r => String(r.company_id) === String(companyId)) : all;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /penalty/:id ──────────────────────────────────────────────────────────
router.get('/penalty/:id', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    const result = await pool.query(
      'SELECT * FROM roc_deadlines WHERE id=$1 AND company_id=$2', [req.params.id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    const today = new Date();
    const due   = new Date(row.due_date);
    const daysLate = Math.max(0, Math.ceil((today - due) / (1000 * 60 * 60 * 24)));
    res.json({
      form_name:        row.form_name,
      due_date:         row.due_date,
      status:           row.status,
      days_late:        daysLate,
      penalty_per_day:  row.penalty_per_day,
      total_penalty:    calcPenalty(row),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /mark-overdue ────────────────────────────────────────────────────────
router.post('/mark-overdue', async (req, res) => {
  try {
    const updated = await markOverdueDeadlines();
    res.json({ updated: updated.length, records: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
