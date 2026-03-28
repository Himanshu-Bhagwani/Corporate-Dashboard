const express = require('express');
const router = express.Router();
const { getPnL, getBalanceSheet, getCashFlow, getTax, getGST, exportReport } = require('../controllers/reportsController');

router.get('/pnl', getPnL);
router.get('/balance-sheet', getBalanceSheet);
router.get('/cash-flow', getCashFlow);
router.get('/tax', getTax);
router.get('/gst', getGST);
router.get('/export', exportReport);

module.exports = router;
