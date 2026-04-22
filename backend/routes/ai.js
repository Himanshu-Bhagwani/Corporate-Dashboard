const express = require('express');
const router = express.Router();
const multer = require('multer');
const { complianceReview, parseInvoiceOCR, chatWithCFO } = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });
router.post('/compliance-review', authenticateToken, complianceReview);
router.post('/ocr-invoice', authenticateToken, upload.single('invoice'), parseInvoiceOCR);
router.post('/chat', authenticateToken, chatWithCFO);

module.exports = router;

