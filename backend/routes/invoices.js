const express = require('express');
const router = express.Router();
const { getInvoices, createInvoice, updateInvoice } = require('../controllers/invoicesController');

router.get('/', getInvoices);
router.post('/', createInvoice);
router.put('/:id', updateInvoice);

module.exports = router;
