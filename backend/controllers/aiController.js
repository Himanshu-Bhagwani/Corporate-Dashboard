const { pool } = require('../config/db');
const { generateResponse } = require('../services/aiService');
const Tesseract = require('tesseract.js');

const CORPORATE_CATEGORIES = [
  'Sales', 'Consulting', 'Salaries', 'Marketing', 'Software', 'Rent', 'Tax',
  'Shares', 'Professional Fees', 'Utilities', 'Misc', 'Insurance', 'Travel',
  'Training', 'Maintenance', 'Office Supplies'
];

const categorizeTransactions = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    const { transactionIds } = req.body; // Array of transaction IDs to categorize

    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Array of transactionIds required' });
    }

    // Fetch the specific transactions
    const result = await pool.query(
      `SELECT id, name, amount, type FROM transactions WHERE company_id = $1 AND id = ANY($2)`,
      [companyId, transactionIds]
    );

    const txns = result.rows;
    if (txns.length === 0) return res.json({ message: 'No valid transactions found', updated: 0 });

    // Prepare prompt
    const systemPrompt = `You are a corporate financial AI assistant. Your ONLY job is to categorize bank transactions into exactly one of the provided predefined categories.
You must respond ONLY with a valid JSON array of objects. Do not include markdown formatting or extra text.

Allowed Categories: ${CORPORATE_CATEGORIES.join(', ')}`;

    const prompt = `Categorize the following transactions. For each, output JSON with "id" and "category".
Transactions:
${JSON.stringify(txns, null, 2)}`;

    console.log('[AI] Requesting categorization from local Ollama model...');
    
    // Call Ollama
    const aiResponseRaw = await generateResponse(prompt, systemPrompt, true);
    
    // Parse the JSON array
    let aiCategories = [];
    try {
      aiCategories = JSON.parse(aiResponseRaw);
      // Sometimes models return { "transactions": [...] }
      if (!Array.isArray(aiCategories) && aiCategories.transactions) {
        aiCategories = aiCategories.transactions;
      }
    } catch (parseErr) {
      console.error('[AI] Failed to parse JSON response:', aiResponseRaw);
      return res.status(500).json({ error: 'AI returned invalid formatting' });
    }

    // Update transactions in DB
    let updateCount = 0;
    for (const item of aiCategories) {
      if (!item.id || !item.category) continue;
      // Ensure it's a valid category
      const safeCategory = CORPORATE_CATEGORIES.includes(item.category) ? item.category : 'Misc';
      
      const updateRes = await pool.query(
        `UPDATE transactions SET category = $1 WHERE id = $2 AND company_id = $3 RETURNING id`,
        [safeCategory, item.id, companyId]
      );
      if (updateRes.rowCount > 0) updateCount++;
    }

    res.json({ message: 'AI categorization complete', updated: updateCount });
  } catch (error) {
    console.error('Categorize Error:', error);
    res.status(500).json({ error: error.message });
  }
};

const complianceReview = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    // Fetch compliance records
    const eventsQuery = await pool.query(
      `SELECT title, type, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status, payment_status 
       FROM compliance_events 
       WHERE company_id = $1 
       ORDER BY due_date DESC LIMIT 10`,
      [companyId]
    );
    const events = eventsQuery.rows;

    const scoreQuery = await pool.query(
      `SELECT score FROM compliance_scores WHERE company_id = $1`,
      [companyId]
    );
    const score = scoreQuery.rows.length > 0 ? scoreQuery.rows[0].score : 'N/A';

    const systemPrompt = `You are an expert Corporate Compliance & Tax Coach. You analyze a company's recent filing history and output actionable advice to improve their Risk Score.
Your output must be formatted as raw HTML (e.g. <h3>, <p>, <ul>, <li>). Do NOT use Markdown. Do NOT include \`\`\`html code blocks. Keep it concise (max 3 short paragraphs or bullets).`;

    const prompt = `Here is the company's data:
Current Compliance Score: ${score}/100
Recent Filings: 
${JSON.stringify(events, null, 2)}

Please provide a short HTML formatted risk analysis and 3-step action plan to optimize compliance.`;

    console.log('[AI] Requesting Compliance Strategy from Ollama...');
    const aiResponseRaw = await generateResponse(prompt, systemPrompt, false);
    
    // Clean up any potential markdown wrappers the model might add despite instructions
    const cleanHtml = aiResponseRaw.replace(/\`\`\`html/g, '').replace(/\`\`\`/g, '').trim();

    res.json({ strategyHtml: cleanHtml });
  } catch (error) {
    console.error('Compliance Review Error:', error);
    res.status(500).json({ error: error.message });
  }
};

const parseInvoiceOCR = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    
    if (!req.file) return res.status(400).json({ error: 'No invoice image uploaded' });

    console.log('[AI OCR] Running Tesseract optical character recognition...');
    const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'eng');
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Could not extract any text from the provided image.' });
    }

    const systemPrompt = `You are a strict data-extraction AI for accounting. Extract these exact fields from the messy OCR text into a single JSON object.
Do not output markdown, just raw JSON. Ensure "payee" strings do not include random numbers.
Fields:
- "payee": (string)
- "amount": (number)
- "date": ("YYYY-MM-DD" format string)
- "description": (short summary string)

If a field is missing, use null.`;
    
    console.log('[AI OCR] Sending extracted text to Ollama for JSON structuring...');
    const prompt = `OCR Text:\n${text}`;
    
    const aiResponseRaw = await generateResponse(prompt, systemPrompt, true);
    
    try {
      const parsedJson = JSON.parse(aiResponseRaw);
      res.json(parsedJson);
    } catch (parseErr) {
      console.error('[AI OCR] Failed to parse JSON response:', aiResponseRaw);
      res.status(500).json({ error: 'AI returned invalid formatting', raw: aiResponseRaw });
    }

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'Failed to process invoice image' });
  }
};

module.exports = {
  categorizeTransactions,
  complianceReview,
  parseInvoiceOCR
};
