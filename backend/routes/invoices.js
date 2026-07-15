const express = require('express');
const router = express.Router();
const { getInvoices, createInvoice, updateInvoice, getVolumeTrend } = require('../controllers/invoicesController');

router.get('/analytics/volume-trend', getVolumeTrend);
router.get('/', getInvoices);
router.post('/', createInvoice);
router.put('/:id', updateInvoice);

module.exports = router;
