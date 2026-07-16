const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const { pool } = require('../config/db');

const upload = multer({ storage: multer.memoryStorage() });

const processUpload = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Initialize Gemini API
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in the backend.' });
    }

    const mimeType = req.file.mimetype;
    const base64Data = req.file.buffer.toString('base64');

    const prompt = `Extract the following fields from this invoice and return ONLY a JSON object:
{
  "invoice_number": "",
  "invoice_date": "",
  "due_date": "",
  "total_amount": "",
  "seller_name": "",
  "buyer_name": "",
  "gstin_seller": "",
  "gstin_buyer": ""
}
If a field is not found, return null. Return nothing else.`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        prompt
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    let extractedText = response.text;
    if (!extractedText) throw new Error('Failed to extract data');
    
    // Clean potential markdown blocks
    extractedText = extractedText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(extractedText);

    // Save immediately to DB
    const type = 'payable'; // Assuming uploaded invoices are payables (expenses) by default
    const clientName = data.seller_name || data.buyer_name || 'Unknown Vendor';
    const amount = parseFloat(data.total_amount) || 0;
    
    let issueDate = data.invoice_date;
    if (issueDate) {
      // try parsing date
      const d = new Date(issueDate);
      if (!isNaN(d)) issueDate = d.toISOString().slice(0, 10);
      else issueDate = new Date().toISOString().slice(0, 10);
    } else {
      issueDate = new Date().toISOString().slice(0, 10);
    }
    
    let dueDate = data.due_date;
    if (dueDate) {
      const d = new Date(dueDate);
      if (!isNaN(d)) dueDate = d.toISOString().slice(0, 10);
      else dueDate = issueDate;
    } else {
      dueDate = issueDate;
    }

    const invResult = await pool.query(
      `INSERT INTO invoices (
        company_id, invoice_number, client_name, vendor_name, type, amount, grand_total, status,
        due_date, issue_date, entity_gstin, client_gstin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        companyId,
        data.invoice_number || `UP-${Date.now()}`,
        clientName, // In payable context, the vendor is the client_name field
        clientName,
        type,
        amount,
        amount,
        'pending',
        dueDate,
        issueDate,
        data.gstin_buyer,
        data.gstin_seller
      ]
    );

    res.json({ message: 'Invoice parsed and saved successfully', invoice: invResult.rows[0], parsedData: data });

  } catch (error) {
    console.error('Upload process error:', error);
    res.status(500).json({ error: 'Failed to process and save invoice' });
  }
};

module.exports = {
  uploadMiddleware: upload.single('invoiceFile'),
  processUpload
};
