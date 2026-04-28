const express = require('express');
const router = express.Router();
const { upload, getDocuments, uploadDocument, viewDocument, downloadDocument, deleteDocument } = require('../controllers/documentsController');

router.get('/', getDocuments);
router.post('/upload', upload.single('file'), uploadDocument);
router.get('/:id/view', viewDocument);
router.get('/:id/download', downloadDocument);
router.delete('/:id', deleteDocument);

module.exports = router;
