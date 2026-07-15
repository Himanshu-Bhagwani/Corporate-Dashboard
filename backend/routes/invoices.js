const express = require('express');
const router = express.Router();
const { getInvoices, createInvoice, updateInvoice, getVolumeTrend, deleteInvoice, deleteAllInvoices } = require('../controllers/invoicesController');

router.get('/analytics/volume-trend', getVolumeTrend);
router.get('/', getInvoices);
router.post('/', createInvoice);
router.delete('/all', deleteAllInvoices);
router.delete('/:id', deleteInvoice);
router.put('/:id', updateInvoice);

module.exports = router;
