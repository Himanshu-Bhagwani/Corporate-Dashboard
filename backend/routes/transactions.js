const express = require('express');
const router = express.Router();
const {
  getTransactions,
  createTransaction,
  bulkCreateTransactions,
  updateTransaction,
  deleteTransaction,
  getAnalytics,
  uploadCSV,
  upload,
} = require('../controllers/transactionsController');

router.get('/', getTransactions);
router.post('/', createTransaction);
router.post('/bulk', bulkCreateTransactions);
router.post('/upload-csv', upload.single('file'), uploadCSV);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);
router.get('/analytics', getAnalytics);

module.exports = router;