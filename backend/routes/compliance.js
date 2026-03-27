const express = require('express');
const router = express.Router();
const { getFilings, markFiled } = require('../controllers/complianceController');

router.get('/', getFilings);
router.put('/:id/filed', markFiled);

module.exports = router;
