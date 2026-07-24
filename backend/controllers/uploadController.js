const multer = require('multer');
const { Readable } = require('stream');
const csvParser = require('csv-parser');
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const PROMPT = `Extract the following fields from this invoice and return ONLY a JSON object:
{
  "invoice_number": "",
  "invoice_date": "",
  "due_date": "",
  "total_amount": "",
  "subtotal": "",
  "total_discount": "",
  "cgst_total": "",
  "sgst_total": "",
  "igst_total": "",
  "cess_total": "",
  "seller_name": "",
  "seller_address": "",
  "buyer_name": "",
  "buyer_address": "",
  "gstin_seller": "",
  "gstin_buyer": "",
  "po_number": "",
  "type": "",
  "line_items": [
    { "name": "", "description": "", "hsn": "", "quantity": 0, "unit": "", "unit_price": 0, "tax_percent": 0 }
  ]
}
Rules:
- invoice_number: keep the full identifier as-is, e.g. "INV-2026-0015". Do NOT truncate it. If the header shows "#INV-2026-0015", return "INV-2026-0015".
- invoice_date and due_date must be in YYYY-MM-DD format.
- All amount fields must be plain numbers (no currency symbol, no commas). Use "TOTAL DUE" or "Grand Total" for total_amount.
- seller_name is the entity issuing the invoice (top-left, above "BILL TO"); buyer_name is under "BILL TO".
- gstin_seller / gstin_buyer are the 15-char GST numbers of seller / buyer.
- type: read the "TYPE" field. Return "receivable" for Receivable/Sales/Outward. Return "payable" for Payable/Purchase/Inward. Null if unclear.
- line_items: extract each row of the items table with its description, HSN, quantity, unit, unit price and tax %. Empty array if none.
- If a field is not found, return null (or an empty array for line_items).
Return nothing else — no markdown, no code fences, no commentary.`;

const parseAmount = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[₹$,\s]/g, '').replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const parseDate = (val) => {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
};

const regexExtract = (text) => {
  if (!text) return {};
  const out = {};
  const cleaned = text.replace(/\s+/g, ' ');

  const invMatch = cleaned.match(/#\s*((?:INV|CN|DN)[-\/][A-Z0-9]{1,10}[-\/][A-Z0-9]{1,10})/i)
                || cleaned.match(/\b((?:INV|CN|DN)[-\/][A-Z0-9]{1,10}[-\/][A-Z0-9]{1,10})\b/i)
                || cleaned.match(/INVOICE\s*(?:NO|NUMBER|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,25})/i);
  if (invMatch) out.invoice_number = invMatch[1].trim();

  const dateMatch = cleaned.match(/INVOICE\s*DATE[\s:]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i);
  if (dateMatch) out.invoice_date = dateMatch[1];

  const dueMatch = cleaned.match(/DUE\s*DATE[\s:]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i);
  if (dueMatch) out.due_date = dueMatch[1];

  const totalMatch = cleaned.match(/(?:TOTAL\s*DUE|GRAND\s*TOTAL|TOTAL\s*AMOUNT|AMOUNT\s*DUE)[\s:]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (totalMatch) out.total_amount = totalMatch[1];

  const subtotalMatch = cleaned.match(/SUBTOTAL[\s:]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (subtotalMatch) out.subtotal = subtotalMatch[1];

  const cgstMatch = cleaned.match(/CGST\s*(?:\([^)]*\))?[\s:]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (cgstMatch) out.cgst_total = cgstMatch[1];
  const sgstMatch = cleaned.match(/SGST\s*(?:\([^)]*\))?[\s:]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (sgstMatch) out.sgst_total = sgstMatch[1];
  const igstMatch = cleaned.match(/IGST\s*(?:\([^)]*\))?[\s:]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (igstMatch) out.igst_total = igstMatch[1];

  const gstinMatches = [...cleaned.matchAll(/GSTIN[\s:]*([0-9A-Z]{6,15})/gi)].map(m => m[1]);
  if (gstinMatches[0]) out.gstin_seller = gstinMatches[0];
  if (gstinMatches[1]) out.gstin_buyer = gstinMatches[1];

  const poMatch = cleaned.match(/PO\s*(?:NUMBER|NO|#)[\s:]*([A-Z0-9\-\/]{3,25})/i);
  if (poMatch) out.po_number = poMatch[1];

  const typeMatch = cleaned.match(/\bTYPE\b[\s:]*([A-Za-z]+)/i);
  if (typeMatch) {
    const t = typeMatch[1].toLowerCase();
    if (/(receivable|sales|outward|sale)/.test(t)) out.type = 'receivable';
    else if (/(payable|purchase|inward|expense)/.test(t)) out.type = 'payable';
  }

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

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastErr;
  for (const m of models) {
    try {
      return await tryModel(m);
    } catch (err) {
      lastErr = err;
      console.log(`[Upload] ${m} failed: ${err.message}`);
    }
  }
  throw lastErr || new Error('All Gemini models failed');
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
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }
};

const mergeExtractions = (...results) => {
  const keys = [
    'invoice_number', 'invoice_date', 'due_date', 'total_amount',
    'subtotal', 'total_discount', 'cgst_total', 'sgst_total', 'igst_total', 'cess_total',
    'seller_name', 'seller_address', 'buyer_name', 'buyer_address',
    'gstin_seller', 'gstin_buyer', 'po_number', 'type', 'line_items'
  ];
  const merged = {};
  for (const k of keys) {
    merged[k] = null;
    for (const r of results) {
      if (!r) continue;
      const v = r[k];
      if (k === 'line_items') {
        if (Array.isArray(v) && v.length > 0) { merged[k] = v; break; }
      } else if (v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null') {
        merged[k] = v; break;
      }
    }
  }
  return merged;
};

const isEmpty = (d) => {
  if (!d) return true;
  const meaningful = ['invoice_number', 'invoice_date', 'total_amount', 'seller_name', 'buyer_name', 'gstin_seller', 'gstin_buyer'];
  return meaningful.every(k => {
    const v = d[k];
    return v === null || v === undefined || v === '' || String(v).toLowerCase() === 'null';
  });
};

// Insert with automatic collision handling — invoice_number has a global UNIQUE
// constraint, so uploads that reuse a system-generated number (or a demo seed
// number) would otherwise fail. Retry with a short random suffix.
const insertInvoiceWithRetry = async (companyId, payload, maxRetries = 5) => {
  let attempt = 0;
  let invoiceNumber = payload.invoice_number;
  while (true) {
    try {
      const result = await pool.query(
        `INSERT INTO invoices (
          company_id, invoice_number, client_name, vendor_name, type, amount, grand_total, status,
          due_date, issue_date,
          entity_name, entity_gstin, entity_address,
          client_gstin, client_address,
          po_number,
          line_items, subtotal, cgst_total, sgst_total, igst_total, cess_total, total_discount
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15,
          $16,
          $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING *,
          TO_CHAR(due_date, 'YYYY-MM-DD') as due_date,
          TO_CHAR(issue_date, 'YYYY-MM-DD') as issue_date`,
        [
          companyId, invoiceNumber, payload.client_name, payload.client_name,
          payload.type, payload.amount, payload.amount, 'pending',
          payload.due_date, payload.issue_date,
          payload.entity_name, payload.entity_gstin, payload.entity_address,
          payload.client_gstin, payload.client_address,
          payload.po_number,
          JSON.stringify(payload.line_items || []),
          payload.subtotal, payload.cgst_total, payload.sgst_total, payload.igst_total, payload.cess_total, payload.total_discount,
        ]
      );
      return result.rows[0];
    } catch (err) {
      if (err.code === '23505' && attempt < maxRetries) {
        attempt += 1;
        const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
        invoiceNumber = `${payload.invoice_number}-${suffix}`;
        continue;
      }
      throw err;
    }
  }
};

// Turn merged extractor output into the DB payload with the right entity/client
// wiring based on invoice type.
const buildInvoicePayload = (data) => {
  const rawType = (data.type && String(data.type).trim().toLowerCase()) || '';
  const type = (rawType === 'receivable' || rawType === 'payable') ? rawType : 'payable';
  const sellerName = data.seller_name && String(data.seller_name).trim();
  const buyerName = data.buyer_name && String(data.buyer_name).trim();
  const sellerAddress = data.seller_address && String(data.seller_address).trim();
  const buyerAddress = data.buyer_address && String(data.buyer_address).trim();
  const gstinSeller = data.gstin_seller || null;
  const gstinBuyer = data.gstin_buyer || null;

  // Receivable: we are the seller. Payable: we are the buyer.
  const isReceivable = type === 'receivable';
  const entityName = (isReceivable ? sellerName : buyerName) || sellerName || buyerName || 'Your Company';
  const clientName = (isReceivable ? buyerName : sellerName) || buyerName || sellerName || 'Unknown Party';
  const entityAddress = isReceivable ? sellerAddress : buyerAddress;
  const clientAddress = isReceivable ? buyerAddress : sellerAddress;
  const entityGstin = isReceivable ? gstinSeller : gstinBuyer;
  const clientGstin = isReceivable ? gstinBuyer : gstinSeller;

  const amount = parseAmount(data.total_amount);
  const issueDate = parseDate(data.invoice_date) || new Date().toISOString().slice(0, 10);
  const dueDate = parseDate(data.due_date) || issueDate;

  let invoiceNumber = (data.invoice_number && String(data.invoice_number).trim().replace(/^#\s*/, '')) || '';
  if (!invoiceNumber || /^(inv|invoice|oice|ice)$/i.test(invoiceNumber) || invoiceNumber.length < 5) {
    invoiceNumber = `UP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  const lineItems = Array.isArray(data.line_items) ? data.line_items.map((li, idx) => ({
    id: Date.now() + idx,
    name: li.name || li.description || '',
    description: li.description || '',
    hsn: li.hsn || '',
    quantity: parseAmount(li.quantity) || 1,
    unit: li.unit || 'Nos',
    unit_price: parseAmount(li.unit_price),
    discount_percent: parseAmount(li.discount_percent),
    tax_percent: parseAmount(li.tax_percent),
    cess_percent: parseAmount(li.cess_percent),
  })) : [];

  return {
    invoice_number: invoiceNumber,
    client_name: clientName,
    type,
    amount,
    issue_date: issueDate,
    due_date: dueDate,
    entity_name: entityName,
    entity_gstin: entityGstin,
    entity_address: entityAddress,
    client_gstin: clientGstin,
    client_address: clientAddress,
    po_number: data.po_number || null,
    subtotal: parseAmount(data.subtotal) || amount,
    cgst_total: parseAmount(data.cgst_total),
    sgst_total: parseAmount(data.sgst_total),
    igst_total: parseAmount(data.igst_total),
    cess_total: parseAmount(data.cess_total),
    total_discount: parseAmount(data.total_discount),
    line_items: lineItems,
  };
};

const parseCSV = (buffer) => new Promise((resolve, reject) => {
  const rows = [];
  const stream = Readable.from(buffer.toString('utf8'));
  stream
    .pipe(csvParser({ mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_') }))
    .on('data', (row) => rows.push(row))
    .on('end', () => resolve(rows))
    .on('error', reject);
});

const csvRowToInvoice = (row) => {
  const pick = (...keys) => {
    for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k];
    return null;
  };
  return {
    invoice_number: pick('invoice_number', 'invoice_#', 'invoice_no', 'invoice_num', 'inv_no', 'number'),
    invoice_date: pick('invoice_date', 'issue_date', 'date'),
    due_date: pick('due_date', 'payment_due', 'due'),
    total_amount: pick('total_amount', 'amount', 'grand_total', 'total', 'total_due', 'total_(inr)'),
    seller_name: pick('seller_name', 'seller', 'vendor_name', 'vendor', 'from', 'supplier'),
    buyer_name: pick('buyer_name', 'buyer', 'client_name', 'client', 'bill_to', 'customer'),
    gstin_seller: pick('gstin_seller', 'seller_gstin', 'supplier_gstin'),
    gstin_buyer: pick('gstin_buyer', 'buyer_gstin', 'client_gstin'),
    type: pick('type', 'invoice_type'),
  };
};

const processUpload = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID is required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mimeType = req.file.mimetype || '';
    const originalName = (req.file.originalname || '').toLowerCase();
    const fileSize = req.file.size || (req.file.buffer && req.file.buffer.length) || 0;
    const isPDF = mimeType === 'application/pdf' || originalName.endsWith('.pdf');
    const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff)$/i.test(originalName);
    const isCSV = mimeType === 'text/csv' || originalName.endsWith('.csv');

    // ── CSV branch ─────────────────────────────────────────────────────
    if (isCSV) {
      const rows = await parseCSV(req.file.buffer);
      if (rows.length === 0) return res.status(422).json({ error: 'CSV file is empty.' });

      const created = [];
      const errors = [];
      for (let i = 0; i < rows.length; i++) {
        const raw = csvRowToInvoice(rows[i]);
        if (isEmpty(raw)) { errors.push({ row: i + 2, error: 'no recognizable fields' }); continue; }
        try {
          const payload = buildInvoicePayload(raw);
          const inv = await insertInvoiceWithRetry(companyId, payload);
          created.push(inv);
        } catch (e) {
          errors.push({ row: i + 2, error: e.message });
        }
      }

      if (created.length === 0) {
        return res.status(422).json({ error: 'No valid invoices in CSV', errors });
      }
      return res.json({
        message: `${created.length} invoice(s) imported from CSV`,
        invoice: created[created.length - 1],
        invoices: created,
        errors,
      });
    }

    if (!isPDF && !isImage) {
      return res.status(400).json({ error: 'Unsupported file type. Upload a PDF, image, or CSV.' });
    }

    // Guard against oversized files up-front. Gemini's inline data cap is 20 MB;
    // beyond that the caller sees a slow, opaque failure instead of a fast error.
    if (fileSize > 15 * 1024 * 1024) {
      return res.status(413).json({
        error: 'File is too large (>15 MB). Export smaller batches or upload a CSV of the invoices instead.'
      });
    }

    const base64Data = req.file.buffer.toString('base64');

    const [pdfText, geminiRaw] = await Promise.all([
      isPDF ? extractTextFromPDF(req.file.buffer) : Promise.resolve(''),
      runGemini(base64Data, mimeType).catch(err => {
        console.log('[Upload] Gemini extraction failed:', err.message);
        return null;
      }),
    ]);

    let geminiData = safeParseJSON(geminiRaw);
    let ollamaData = null;

    if (isEmpty(geminiData) && pdfText && pdfText.trim().length > 10) {
      try {
        const ollamaRaw = await runOllama(pdfText);
        ollamaData = safeParseJSON(ollamaRaw);
      } catch (err) {
        console.log('[Upload] Ollama extraction failed:', err.message);
      }
    }

    const regexData = regexExtract(pdfText);
    const data = mergeExtractions(geminiData, ollamaData, regexData);

    if (isEmpty(data)) {
      // Image-based PDFs (produced by html2canvas exports etc.) have no
      // selectable text — pdf-parse returns nothing, and Gemini can struggle
      // with multi-invoice pages. Give a targeted hint.
      const looksImageOnly = isPDF && (!pdfText || pdfText.trim().length < 10);
      const hint = looksImageOnly
        ? 'This PDF appears to be image-only (no selectable text). Upload the original text-based PDF, a single-invoice image, or a CSV.'
        : 'Could not extract any invoice details from the file. Try a clearer image or the original PDF.';
      return res.status(422).json({ error: hint });
    }

    const payload = buildInvoicePayload(data);
    const invoice = await insertInvoiceWithRetry(companyId, payload);
    res.json({ message: 'Invoice parsed and saved successfully', invoice, parsedData: data });
  } catch (error) {
    console.error('Upload process error:', error);
    res.status(500).json({ error: error.message || 'Failed to process and save invoice' });
  }
};

module.exports = {
  uploadMiddleware: upload.single('invoiceFile'),
  processUpload
};
