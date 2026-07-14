const { pool } = require('../config/db');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');

// On Vercel serverless /tmp is the only writable directory.
// On local dev, use a persistent uploads directory.
const isVercel = process.env.VERCEL === '1';
const UPLOADS_DIR = isVercel
  ? os.tmpdir()
  : path.join(__dirname, '../uploads/compliance-documents');

if (!isVercel && !fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  },
});

const getCompanyId = (req) => {
  const id = req.headers['x-company-id'] || req.query.company_id;
  if (!id) throw new Error('Company ID required');
  return id;
};

const getDocuments = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const result = await pool.query(
      `SELECT id, name, category, file_path, file_size, mime_type,
              TO_CHAR(expiry_date, 'YYYY-MM-DD') as expiry_date,
              TO_CHAR(created_at, 'YYYY-MM-DD') as upload_date
       FROM compliance_documents
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const uploadDocument = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { name, category, expiry_date } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileSizeKB = Math.round(file.size / 1024);
    const fileSizeStr = fileSizeKB > 1024 ? `${(fileSizeKB / 1024).toFixed(1)} MB` : `${fileSizeKB} KB`;

    // Store just the filename, not the full path, for portability
    const result = await pool.query(
      `INSERT INTO compliance_documents (company_id, name, category, file_path, file_size, mime_type, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, category, file_path, file_size, mime_type,
                 TO_CHAR(expiry_date, 'YYYY-MM-DD') as expiry_date,
                 TO_CHAR(created_at, 'YYYY-MM-DD') as upload_date`,
      [companyId, name || file.originalname, category || 'Other', file.filename, fileSizeStr, file.mimetype, expiry_date || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[Documents] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

const resolveFilePath = (filename) => {
  return path.join(UPLOADS_DIR, filename);
};

const viewDocument = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM compliance_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const filePath = resolveFilePath(doc.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server. Note: files uploaded to Vercel are temporary and may have expired.' });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.name}"`);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM compliance_documents WHERE id = $1 AND company_id = $2',
      [id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const filePath = resolveFilePath(doc.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server. Note: files uploaded to Vercel are temporary and may have expired.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${doc.name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM compliance_documents WHERE id = $1 AND company_id = $2 RETURNING *',
      [id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const filePath = resolveFilePath(result.rows[0].file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { upload, getDocuments, uploadDocument, viewDocument, downloadDocument, deleteDocument };
