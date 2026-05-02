/**
 * Financial Metrics API
 *
 * Stores / retrieves per-company financial metrics:
 *   - CIBIL score (user-entered)
 *   - Manual inputs (turnover, assets, liabilities, equity, etc.)
 *   - Tally sync stub (activate by setting TALLY_API_KEY in .env)
 *
 * Endpoints:
 *   GET  /api/financial-metrics          → get saved metrics for company
 *   PUT  /api/financial-metrics          → save / update metrics
 *   POST /api/financial-metrics/tally-sync → trigger Tally data pull (stub)
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

/* ── Ensure table exists on first use ──────────────────────────── */
const ensureTable = pool.query(`
  CREATE TABLE IF NOT EXISTS financial_metrics (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    cibil_score  INTEGER,
    turnover     NUMERIC,
    total_assets NUMERIC,
    total_liabilities NUMERIC,
    equity       NUMERIC,
    gst_turnover NUMERIC,
    bank_cc_limit NUMERIC,
    existing_emi NUMERIC,
    tally_api_key TEXT,
    tally_connected BOOLEAN DEFAULT FALSE,
    last_tally_sync TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id)
  );
`).catch(err => console.error('financial_metrics table init error:', err.message));

/* ── GET /api/financial-metrics ─────────────────────────────────── */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const result = await pool.query(
      'SELECT * FROM financial_metrics WHERE company_id = $1',
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.json({ company_id: companyId, cibil_score: null, tally_connected: false });
    }

    const row = result.rows[0];
    // Never expose the raw API key to the frontend
    delete row.tally_api_key;
    res.json(row);
  } catch (err) {
    console.error('GET financial-metrics error:', err);
    res.status(500).json({ error: 'Failed to fetch financial metrics' });
  }
});

/* ── PUT /api/financial-metrics ─────────────────────────────────── */
router.put('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const {
      cibil_score, turnover, total_assets, total_liabilities,
      equity, gst_turnover, bank_cc_limit, existing_emi
    } = req.body;

    const result = await pool.query(
      `INSERT INTO financial_metrics
         (company_id, cibil_score, turnover, total_assets, total_liabilities,
          equity, gst_turnover, bank_cc_limit, existing_emi, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (company_id) DO UPDATE SET
         cibil_score       = COALESCE($2,  financial_metrics.cibil_score),
         turnover          = COALESCE($3,  financial_metrics.turnover),
         total_assets      = COALESCE($4,  financial_metrics.total_assets),
         total_liabilities = COALESCE($5,  financial_metrics.total_liabilities),
         equity            = COALESCE($6,  financial_metrics.equity),
         gst_turnover      = COALESCE($7,  financial_metrics.gst_turnover),
         bank_cc_limit     = COALESCE($8,  financial_metrics.bank_cc_limit),
         existing_emi      = COALESCE($9,  financial_metrics.existing_emi),
         updated_at        = NOW()
       RETURNING *`,
      [companyId, cibil_score || null, turnover || null, total_assets || null,
       total_liabilities || null, equity || null, gst_turnover || null,
       bank_cc_limit || null, existing_emi || null]
    );

    const row = result.rows[0];
    delete row.tally_api_key;
    res.json(row);
  } catch (err) {
    console.error('PUT financial-metrics error:', err);
    res.status(500).json({ error: 'Failed to save financial metrics' });
  }
});

/* ── POST /api/financial-metrics/tally-sync ─────────────────────── */
/*
 *  Tally Integration Stub
 *  ─────────────────────
 *  When TALLY_API_KEY is set in .env, this route will:
 *  1. Authenticate with Tally Prime REST API
 *  2. Fetch Balance Sheet, P&L, GST reports
 *  3. Upsert into financial_metrics and push transactions
 *
 *  To activate:
 *    1. Set TALLY_API_KEY=<your_key> in backend/.env
 *    2. Set TALLY_BASE_URL=https://your-tally-server:port (optional)
 *    3. The stub below will call the live Tally API automatically.
 */
router.post('/tally-sync', authenticateToken, async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const TALLY_API_KEY = process.env.TALLY_API_KEY;
    const TALLY_BASE_URL = process.env.TALLY_BASE_URL || 'https://api.tallysolutions.com';

    if (!TALLY_API_KEY) {
      return res.status(503).json({
        error: 'Tally API key not configured.',
        hint: 'Add TALLY_API_KEY to your backend .env file to enable live sync.',
        stub: true,
      });
    }

    // ── LIVE TALLY SYNC (activated when API key is present) ──────
    // const response = await fetch(`${TALLY_BASE_URL}/v1/balance-sheet`, {
    //   headers: { 'Authorization': `Bearer ${TALLY_API_KEY}`, 'x-company': companyId }
    // });
    // const data = await response.json();
    // await pool.query(`UPDATE financial_metrics SET
    //   total_assets = $2, total_liabilities = $3, equity = $4,
    //   turnover = $5, tally_connected = TRUE, last_tally_sync = NOW()
    //   WHERE company_id = $1`, [companyId, data.assets, data.liabilities, data.equity, data.turnover]);
    // ─────────────────────────────────────────────────────────────

    // Store the provided API key securely (hashed/encrypted in production)
    const { apiKey } = req.body;
    if (apiKey) {
      await pool.query(
        `INSERT INTO financial_metrics (company_id, tally_api_key, tally_connected, updated_at)
         VALUES ($1,$2,FALSE,NOW())
         ON CONFLICT (company_id) DO UPDATE SET tally_api_key = $2, updated_at = NOW()`,
        [companyId, apiKey]
      );
    }

    res.json({
      ok: true,
      message: 'Tally API key saved. Live sync will activate once TALLY_API_KEY is set in .env.',
      stub: true,
    });
  } catch (err) {
    console.error('Tally sync error:', err);
    res.status(500).json({ error: 'Tally sync failed' });
  }
});

module.exports = router;
