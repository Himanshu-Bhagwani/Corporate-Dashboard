const express = require('express');
const router = express.Router();
const { getPnL, getBalanceSheet, getCashFlow, getTax, getGST, exportReport, getReportSuggestions } = require('../controllers/reportsController');

router.get('/pnl', getPnL);
router.get('/balance-sheet', getBalanceSheet);
router.get('/cash-flow', getCashFlow);
router.get('/tax', getTax);
router.get('/gst', getGST);
router.get('/export', exportReport);
router.post('/suggestions', getReportSuggestions);

module.exports = router;
