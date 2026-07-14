/**
 * SODA Business — Tally Integration Routes
 * GET  /api/tally/status         → Test Tally connection
 * POST /api/tally/sync           → Run full or partial sync
 * GET  /api/tally/sync-history   → Past sync logs
 */

const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool }              = require('../config/db');
const { runFullSync, syncLedgers, syncVouchers, testConnection } = require('../services/tallyService');

router.use(authenticateToken);

// GET /status — test Tally is reachable
router.get('/status', async (req, res) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// POST /sync — trigger sync
router.post('/sync', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

    const { syncTypes, fromDate, toDate } = req.body;

    const result = await runFullSync({
      companyId,
      userId: req.user.userId,
      syncTypes: syncTypes || ['LEDGER', 'VOUCHER'],
      fromDate,
      toDate,
    });

    res.json(result);
  } catch (err) {
    console.error('[TALLY SYNC ROUTE]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /sync-history — recent sync logs
router.get('/sync-history', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

    const result = await pool.query(
      `SELECT id, sync_type, records_synced, errors, status, started_at, completed_at
       FROM tally_sync_log
       WHERE company_id = $1
       ORDER BY started_at DESC
       LIMIT 20`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync history.' });
  }
});

module.exports = router;
