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

const PROMPT = `Extract the following fields from this invoice and return ONLY a JSON object:
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
Rules:
- invoice_date and due_date must be in YYYY-MM-DD format.
- total_amount must be a plain number (no currency symbol, no commas). If the invoice shows "TOTAL DUE" or "Grand Total", use that.
- seller_name is the entity issuing the invoice (usually near the top, above "BILL TO").
- buyer_name is the entity in the "BILL TO" section.
- gstin_seller / gstin_buyer are the 15-char GST numbers of seller / buyer respectively.
- If a field is not found, return null.
Return nothing else — no markdown, no code fences, no commentary.`;

// Parse an amount string that may be in Indian format (1,18,000.00) or plain (118000.00)
const parseAmount = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[₹$,\s]/g, '').replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Try to coerce a date-like string to YYYY-MM-DD
const parseDate = (val) => {
  if (!val) return null;
  const s = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
};

// Regex-based extraction on raw text as a last-resort safety net
const regexExtract = (text) => {
  if (!text) return {};
  const out = {};
  const cleaned = text.replace(/\s+/g, ' ');

  // Invoice number: #INV-2026-0015 or Invoice No: INV/2026/0015 etc
  const invMatch = cleaned.match(/#?\s*(?:INV|INVOICE(?:\s*(?:NO|NUMBER|#))?)[\s:#-]*([A-Z0-9][A-Z0-9\-\/]{3,25})/i);
  if (invMatch) out.invoice_number = invMatch[1].trim();

  // Invoice date
  const dateMatch = cleaned.match(/INVOICE\s*DATE[\s:]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i);
  if (dateMatch) out.invoice_date = dateMatch[1];

  // Due date
  const dueMatch = cleaned.match(/DUE\s*DATE[\s:]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i);
  if (dueMatch) out.due_date = dueMatch[1];

  // Total: TOTAL DUE ₹1,18,000.00 or Grand Total 118000
  const totalMatch = cleaned.match(/(?:TOTAL\s*DUE|GRAND\s*TOTAL|TOTAL\s*AMOUNT|AMOUNT\s*DUE)[\s:]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (totalMatch) out.total_amount = totalMatch[1];

  // GSTINs (15 chars). Grab all occurrences.
  const gstinMatches = [...cleaned.matchAll(/GSTIN[\s:]*([0-9A-Z]{6,15})/gi)].map(m => m[1]);
  if (gstinMatches[0]) out.gstin_seller = gstinMatches[0];
  if (gstinMatches[1]) out.gstin_buyer = gstinMatches[1];

  return out;
};

const runGemini = async (base64Data, mimeType) => {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const tryModel = async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        PROMPT
      ],
      config: { responseMimeType: 'application/json' }
    });
    return response.text;
  };

  try {
    return await tryModel('gemini-1.5-flash');
  } catch (err) {
    console.log('[Upload] gemini-1.5-flash failed, trying gemini-1.5-pro...', err.message);
    return await tryModel('gemini-1.5-pro');
  }
};

const runOllama = async (pdfText) => {
  const ollamaPrompt = `${PROMPT}\n\nInvoice Text:\n${pdfText}`;
  const ollamaRes = await fetch(process.env.OLLAMA_URL || 'http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.2:1b',
      prompt: ollamaPrompt,
      stream: false,
      format: 'json'
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!ollamaRes.ok) throw new Error(`Ollama returned ${ollamaRes.status}`);
  const ollamaData = await ollamaRes.json();
  return ollamaData.response;
};

const safeParseJSON = (raw) => {
  if (!raw) return null;
  const cleaned = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to isolate the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    return null;
  }
};

// Merge extractor outputs, preferring the first non-null value per field
const mergeExtractions = (...results) => {
  const keys = ['invoice_number', 'invoice_date', 'due_date', 'total_amount', 'seller_name', 'buyer_name', 'gstin_seller', 'gstin_buyer'];
  const merged = {};
  for (const k of keys) {
    merged[k] = null;
    for (const r of results) {
      if (!r) continue;
      const v = r[k];
      if (v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null') {
        merged[k] = v;
        break;
      }
    }
  }
  return merged;
};

const processUpload = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID is required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mimeType = req.file.mimetype;
    const base64Data = req.file.buffer.toString('base64');
    const isPDF = mimeType === 'application/pdf' || (req.file.originalname || '').toLowerCase().endsWith('.pdf');
    const isImage = mimeType.startsWith('image/');

    // Pull raw text from the PDF (used for Ollama + regex fallback)
    let pdfText = '';
    if (isPDF) {
      pdfText = await extractTextFromPDF(req.file.buffer);
    }

    let geminiData = null;
    let ollamaData = null;

    // 1) Gemini first — multimodal, handles PDFs and images natively and is far
    //    more reliable than a 1B local model for structured invoice extraction.
    if (isPDF || isImage) {
      try {
        const geminiRaw = await runGemini(base64Data, mimeType);
        geminiData = safeParseJSON(geminiRaw);
      } catch (err) {
        console.log('[Upload] Gemini extraction failed:', err.message);
      }
    }

    // 2) Ollama fallback (only if Gemini didn't give us anything usable and we
    //    actually have text to feed it).
    const isEmpty = (d) => !d || Object.values(d).every(v => v === null || v === '' || String(v).toLowerCase() === 'null');
    if (isEmpty(geminiData) && pdfText && pdfText.trim().length > 10) {
      try {
        const ollamaRaw = await runOllama(pdfText);
        ollamaData = safeParseJSON(ollamaRaw);
      } catch (err) {
        console.log('[Upload] Ollama extraction failed:', err.message);
      }
    }

    // 3) Regex safety net on raw PDF text — fills gaps left by the models.
    const regexData = regexExtract(pdfText);

    const data = mergeExtractions(geminiData, ollamaData, regexData);

    if (isEmpty(data)) {
      return res.status(422).json({ error: 'Could not extract any invoice details from the file.' });
    }

    // Normalize fields
    const type = 'payable';
    const sellerName = data.seller_name && String(data.seller_name).trim();
    const buyerName = data.buyer_name && String(data.buyer_name).trim();
    const clientName = sellerName || buyerName || 'Unknown Vendor';
    const amount = parseAmount(data.total_amount);

    let issueDate = parseDate(data.invoice_date) || new Date().toISOString().slice(0, 10);
    let dueDate = parseDate(data.due_date) || issueDate;

    const invoiceNumber = (data.invoice_number && String(data.invoice_number).trim()) || `UP-${Date.now()}`;

    const invResult = await pool.query(
      `INSERT INTO invoices (
        company_id, invoice_number, client_name, vendor_name, type, amount, grand_total, status,
        due_date, issue_date, entity_gstin, client_gstin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *,
        TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
        TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
      [
        companyId,
        invoiceNumber,
        clientName,
        clientName,
        type,
        amount,
        amount,
        'pending',
        dueDate,
        issueDate,
        data.gstin_seller || null,
        data.gstin_buyer || null,
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
