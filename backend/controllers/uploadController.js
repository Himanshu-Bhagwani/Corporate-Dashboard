const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const { pool } = require('../config/db');
const pdfParse = require('pdf-parse');

const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (e) {
    return '';
  }
};

const upload = multer({ storage: multer.memoryStorage() });

const processUpload = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let extractedText = null;

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

    // 1. Try Ollama Locally First
    try {
      const pdfText = await extractTextFromPDF(req.file.buffer);
      if (pdfText && pdfText.trim().length > 10) {
        const ollamaPrompt = `${prompt}\n\nInvoice Text:\n${pdfText}`;
        
        const ollamaRes = await fetch(process.env.OLLAMA_URL || 'http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3',
            prompt: ollamaPrompt,
            stream: false,
            format: 'json'
          }),
          signal: AbortSignal.timeout(8000)
        });
        
        if (ollamaRes.ok) {
          const ollamaData = await ollamaRes.json();
          extractedText = ollamaData.response;
        }
      }
    } catch (ollamaErr) {
      console.log('Ollama failed/skipped, falling back to Gemini:', ollamaErr.message);
    }

    // 2. Fallback to Gemini
    if (!extractedText) {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing and Ollama fallback failed.' });
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const tryGeminiModel = async (modelName) => {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            { inlineData: { data: base64Data, mimeType } },
            prompt
          ],
          config: { responseMimeType: 'application/json' }
        });
        return response.text;
      };

      try {
        extractedText = await tryGeminiModel('gemini-1.5-flash');
      } catch (err) {
        console.log('gemini-1.5-flash failed, trying gemini-1.5-pro...', err.message);
        extractedText = await tryGeminiModel('gemini-1.5-pro');
      }
    }

    if (!extractedText) throw new Error('Failed to extract data using Ollama and Gemini.');
    
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
    res.status(500).json({ error: error.message || 'Failed to process and save invoice' });
  }
};

module.exports = {
  uploadMiddleware: upload.single('invoiceFile'),
  processUpload
};
