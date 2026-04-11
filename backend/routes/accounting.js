const express = require('express');
const router = express.Router();
const {
  getLedger,
  getChartOfAccounts,
  createChartOfAccountsEntry,
  updateChartOfAccountsEntry,
  deleteChartOfAccountsEntry,
} = require('../controllers/accountingController');

// Ledger
router.get('/ledger', getLedger);

// Chart of Accounts
router.get('/chart-of-accounts', getChartOfAccounts);
router.post('/chart-of-accounts', createChartOfAccountsEntry);
router.put('/chart-of-accounts/:id', updateChartOfAccountsEntry);
router.delete('/chart-of-accounts/:id', deleteChartOfAccountsEntry);

module.exports = router;
