/**
 * TDS Routes — /api/tds
 *
 * GET  /sections               → all TDS section definitions
 * POST /calculate              → compute TDS (no DB write)
 * GET  /                       → list recorded deductions (paginated, filterable)
 * POST /                       → record a TDS deduction
 * PUT  /:id/challan            → update challan/deposit details
 * GET  /summary                → quarter-wise summary for 26Q
 * GET  /overdue                → deductions past deposit deadline
 * POST /mark-overdue           → admin: mark stale pending as overdue
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  calculateTDS, recordDeduction, getDeductions,
  getQuarterSummary, markOverdue, updateChallan, getSections, getFY,
} = require('../services/tdsService');

// All routes require auth
router.use(authenticateToken);

// ── GET /sections ─────────────────────────────────────────────────────────────
router.get('/sections', async (req, res) => {
  try {
    res.json(await getSections());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /calculate ───────────────────────────────────────────────────────────
router.post('/calculate', async (req, res) => {
  try {
    const { section, paymentAmount, paymentDate, pan, deducteeName, isCompany } = req.body;
    const companyId = req.headers['x-company-id'];
    if (!section || !paymentAmount || !paymentDate) {
      return res.status(400).json({ error: 'section, paymentAmount, paymentDate are required' });
    }
    const result = await calculateTDS({
      section, paymentAmount: parseFloat(paymentAmount), paymentDate,
      pan, companyId, deducteeName, isCompany: !!isCompany,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { quarter, fy, section, status, page, limit } = req.query;
    const result = await getDeductions(companyId, {
      quarter, fy, section, status,
      page: parseInt(page || '1', 10),
      limit: Math.min(500, parseInt(limit || '100', 10)),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST / — record a deduction ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { section, deducteeName, paymentDate, paymentAmount } = req.body;
    if (!section || !deducteeName || !paymentDate || !paymentAmount) {
      return res.status(400).json({ error: 'section, deducteeName, paymentDate, paymentAmount required' });
    }
    // Auto-calculate if tdsAmount not provided
    let tdsData = req.body;
    if (!req.body.tdsAmount) {
      const calc = await calculateTDS({
        section, paymentAmount: parseFloat(paymentAmount),
        paymentDate, pan: req.body.deducteePan,
        companyId, deducteeName, isCompany: !!req.body.isCompany,
      });
      tdsData = { ...req.body, tdsRate: calc.rate, tdsAmount: calc.tdsAmount,
                  tdsAmountPaise: calc.tdsAmountPaise, netTdsPayable: calc.netTdsPayable };
    }
    const row = await recordDeduction(companyId, req.user?.userId, tdsData);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id/challan ──────────────────────────────────────────────────────────
router.put('/:id/challan', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    const { challanNo, challanDate, depositDate } = req.body;
    if (!challanNo || !depositDate) {
      return res.status(400).json({ error: 'challanNo and depositDate required' });
    }
    const row = await updateChallan(req.params.id, companyId, { challanNo, challanDate, depositDate });
    if (!row) return res.status(404).json({ error: 'Deduction not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /summary ──────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const fy = req.query.fy || getFY(new Date().toISOString());
    res.json(await getQuarterSummary(companyId, fy));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /overdue ──────────────────────────────────────────────────────────────
router.get('/overdue', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { pool } = require('../config/db');
    const result = await pool.query(
      `SELECT d.*, s.description as section_description
       FROM tds_deductions d
       LEFT JOIN tds_sections s ON s.section = d.section
       WHERE d.company_id = $1 AND d.status IN ('pending','overdue')
       ORDER BY d.payment_date ASC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /mark-overdue ────────────────────────────────────────────────────────
router.post('/mark-overdue', async (req, res) => {
  try {
    const updated = await markOverdue();
    res.json({ updated: updated.length, records: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
