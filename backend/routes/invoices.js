const express = require('express');
const router = express.Router();
const {
  getInvoices, createInvoice, updateInvoice, getVolumeTrend, deleteInvoice, deleteAllInvoices,
  getNextNumber, generateIRN,
  recordPayment, recordCreditNote, recordDebitNote, getInvoiceAdjustments,
} = require('../controllers/invoicesController');
const { uploadMiddleware, processUpload } = require('../controllers/uploadController');

router.post('/upload', uploadMiddleware, processUpload);
router.get('/analytics/volume-trend', getVolumeTrend);
router.get('/next-number', getNextNumber);
router.post('/generate-irn', generateIRN);
router.get('/', getInvoices);
router.post('/', createInvoice);
router.delete('/all', deleteAllInvoices);
router.get('/:id/adjustments', getInvoiceAdjustments);
router.post('/:id/payment', recordPayment);
router.post('/:id/credit-note', recordCreditNote);
router.post('/:id/debit-note', recordDebitNote);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

module.exports = router;
