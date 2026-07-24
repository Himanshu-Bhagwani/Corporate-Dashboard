const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  complianceReview,
  parseInvoiceOCR,
  chatWithCFO,
  chatWithCFOStream,
  getChatHistory,
  clearChatHistory,
  exportChatPDF,
  executePlan,
  getActivePlans,
  updatePlanStatus,
  getAiProvider
} = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });
router.post('/compliance-review', authenticateToken, complianceReview);
router.post('/ocr-invoice', authenticateToken, upload.single('invoice'), parseInvoiceOCR);
router.post('/chat', authenticateToken, chatWithCFO);
router.post('/chat-stream', authenticateToken, chatWithCFOStream);
router.get('/chat-history', authenticateToken, getChatHistory);
router.delete('/chat-history', authenticateToken, clearChatHistory);
router.get('/chat-export', authenticateToken, exportChatPDF);
router.post('/execute-plan', authenticateToken, executePlan);
router.get('/active-plans', authenticateToken, getActivePlans);
router.patch('/active-plans/:id', authenticateToken, updatePlanStatus);
router.get('/provider', authenticateToken, getAiProvider);

module.exports = router;
