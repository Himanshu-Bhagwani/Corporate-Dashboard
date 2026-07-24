const express = require('express');
const router = express.Router();
const multer = require('multer');
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
  clearChartOfAccountsType,
  reconcileChartOfAccounts,
  uploadFinancialStatement,
} = require('../controllers/accountingController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Ledger
router.get('/ledger', getLedger);

// Ledger Contacts (customers/vendors management)
router.post('/contacts', createContact);
router.put('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);
router.patch('/contacts/toggle-important', toggleImportant);

// Chart of Accounts
router.get('/chart-of-accounts', getChartOfAccounts);
router.post('/upload-statement', upload.single('file'), uploadFinancialStatement);
router.post('/chart-of-accounts', createChartOfAccountsEntry);
router.post('/chart-of-accounts/reconcile', reconcileChartOfAccounts);
router.put('/chart-of-accounts/:id', updateChartOfAccountsEntry);
// Registered before /:id so "type" isn't swallowed as an id
router.delete('/chart-of-accounts/type/:accountType', clearChartOfAccountsType);
router.delete('/chart-of-accounts/:id', deleteChartOfAccountsEntry);

module.exports = router;
