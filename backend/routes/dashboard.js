const express = require('express');
const router = express.Router();
const { getSummary, getInsightsData } = require('../controllers/dashboardController');

router.get('/summary', getSummary);
router.get('/insights', getInsightsData);

module.exports = router;
