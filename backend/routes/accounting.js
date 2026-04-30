const express = require('express');
const router = express.Router();
const {
  getLedger,
  createContact,
  updateContact,
  deleteContact,
  toggleImportant,
  getChartOfAccounts,
  createChartOfAccountsEntry,
  updateChartOfAccountsEntry,
  deleteChartOfAccountsEntry,
} = require('../controllers/accountingController');

// Ledger
router.get('/ledger', getLedger);

// Ledger Contacts (customers/vendors management)
router.post('/contacts', createContact);
router.put('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);
router.patch('/contacts/toggle-important', toggleImportant);

// Chart of Accounts
router.get('/chart-of-accounts', getChartOfAccounts);
router.post('/chart-of-accounts', createChartOfAccountsEntry);
router.put('/chart-of-accounts/:id', updateChartOfAccountsEntry);
router.delete('/chart-of-accounts/:id', deleteChartOfAccountsEntry);

module.exports = router;
