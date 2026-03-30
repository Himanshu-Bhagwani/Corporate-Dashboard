const express = require('express');
const router = express.Router();
const multer = require('multer');
const { categorizeTransactions, complianceReview, parseInvoiceOCR } = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/categorize', authenticateToken, categorizeTransactions);
router.post('/compliance-review', authenticateToken, complianceReview);
router.post('/ocr-invoice', authenticateToken, upload.single('invoice'), parseInvoiceOCR);

module.exports = router;
