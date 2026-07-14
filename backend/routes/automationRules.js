/**
 * SODA Business — Automation Rules Routes
 * GET    /api/automation-rules        → list rules
 * POST   /api/automation-rules        → create rule
 * PUT    /api/automation-rules/:id    → update rule
 * DELETE /api/automation-rules/:id    → delete rule
 * POST   /api/automation-rules/test   → dry-run a rule against sample transaction
 */

const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getRules, createRule, updateRule, deleteRule, applyRules, suggestCategory,
} = require('../services/automationEngine');

router.use(authenticateToken);

const getCompanyId = (req) => {
  const id = req.headers['x-company-id'];
  if (!id) throw new Error('Company ID required.');
  return id;
};

// GET / — list all rules
router.get('/', async (req, res) => {
  try {
    const rules = await getRules(getCompanyId(req));
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create a rule
router.post('/', async (req, res) => {
  try {
    const { name, conditions, actions, priority } = req.body;
    if (!name || !conditions || !actions) {
      return res.status(400).json({ error: 'name, conditions, and actions are required.' });
    }
    const rule = await createRule(getCompanyId(req), req.user.userId, { name, conditions, actions, priority });
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update rule
router.put('/:id', async (req, res) => {
  try {
    const rule = await updateRule(getCompanyId(req), req.params.id, req.body);
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete rule
router.delete('/:id', async (req, res) => {
  try {
    await deleteRule(getCompanyId(req), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /test — dry-run rules against a sample transaction
router.post('/test', async (req, res) => {
  try {
    const { transaction } = req.body;
    if (!transaction) return res.status(400).json({ error: 'transaction object required.' });

    const result = await applyRules(getCompanyId(req), transaction, true /* dryRun */);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /suggest-category?name=... — pattern-based category suggestion
router.get('/suggest-category', async (req, res) => {
  try {
    const { name } = req.query;
    const category = await suggestCategory(getCompanyId(req), name);
    res.json({ category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
