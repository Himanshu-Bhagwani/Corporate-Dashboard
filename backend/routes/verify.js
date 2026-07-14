/**
 * SODA Business — Government Verification Routes
 * POST /api/verify/gstin  → GSTIN verification
 * POST /api/verify/pan    → PAN verification
 * POST /api/verify/cin    → CIN / MCA21 lookup
 * GET  /api/verify/status → Verification status for a company
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { govtApiLimiter }    = require('../middleware/security');
const { pool }              = require('../config/db');
const {
  verifyGstin,
  verifyPan,
  verifyCin,
} = require('../services/govtApiService');

// All verify routes require auth + govt API rate limit
router.use(authenticateToken, govtApiLimiter);

// ─── POST /gstin ──────────────────────────────────────────────
router.post('/gstin', async (req, res) => {
  try {
    const { gstin } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!gstin) return res.status(400).json({ error: 'GSTIN is required.' });

    const result = await verifyGstin({ gstin, companyId, userId: req.user.userId });

    // Auto-update company record if verified
    if (result.ok && companyId && result.legalName) {
      pool.query(
        `UPDATE companies SET gstin = $1 WHERE id = $2`,
        [gstin.toUpperCase().trim(), companyId]
      ).catch(() => {});
    }

    res.json(result);
  } catch (err) {
    console.error('[VERIFY GSTIN]', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ─── POST /pan ────────────────────────────────────────────────
router.post('/pan', async (req, res) => {
  try {
    const { pan } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!pan) return res.status(400).json({ error: 'PAN is required.' });

    const result = await verifyPan({ pan, companyId, userId: req.user.userId });

    if (result.ok && companyId) {
      pool.query(
        `UPDATE companies SET pan = $1 WHERE id = $2`,
        [pan.toUpperCase().trim(), companyId]
      ).catch(() => {});
    }

    res.json(result);
  } catch (err) {
    console.error('[VERIFY PAN]', err);
    res.status(500).json({ error: 'PAN verification failed.' });
  }
});

// ─── POST /cin ────────────────────────────────────────────────
router.post('/cin', async (req, res) => {
  try {
    const { cin } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!cin) return res.status(400).json({ error: 'CIN is required.' });

    const result = await verifyCin({ cin, companyId, userId: req.user.userId });
    res.json(result);
  } catch (err) {
    console.error('[VERIFY CIN]', err);
    res.status(500).json({ error: 'CIN verification failed.' });
  }
});

// ─── GET /status ──────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

    const result = await pool.query(
      `SELECT verify_type, input_value, status, legal_name, address, verified_at, expires_at
       FROM govt_verifications
       WHERE company_id = $1
       ORDER BY verified_at DESC`,
      [companyId]
    );

    // Compute overall badge
    const records = result.rows;
    const hasVerified = records.some((r) => r.status === 'VERIFIED');
    const hasMismatch = records.some((r) => r.status === 'MISMATCH' || r.status === 'FAILED');
    const badge = hasMismatch ? 'RED' : hasVerified ? 'GREEN' : 'AMBER';

    res.json({ badge, verifications: records });
  } catch (err) {
    console.error('[VERIFY STATUS]', err);
    res.status(500).json({ error: 'Failed to fetch verification status.' });
  }
});

// ─── GET /audit ───────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

    const result = await pool.query(
      `SELECT gv.*, u.full_name as verified_by_name
       FROM govt_verifications gv
       LEFT JOIN users u ON u.id = gv.verified_by
       WHERE gv.company_id = $1
       ORDER BY gv.verified_at DESC
       LIMIT 50`,
      [companyId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit log.' });
  }
});

module.exports = router;
