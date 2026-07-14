const { pool } = require('../config/db');
const { generateResponse, generateStreamResponse } = require('../services/aiService');
const Tesseract = require('tesseract.js');
const PDFDocument = require('pdfkit');
const formulas = require('../utils/accountingFormulas');

const CORPORATE_CATEGORIES = [
  'Sales', 'Consulting', 'Salaries', 'Marketing', 'Software', 'Rent', 'Tax',
  'Shares', 'Professional Fees', 'Utilities', 'Misc', 'Insurance', 'Travel',
  'Training', 'Maintainance', 'Office supplies'
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
Focus specifically on intelligently categorizing expenses into the correct expense category based on context.
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

    // Use the score visible on the frontend (passed from the overview tab)
    const { visibleScore, pendingCount, overdueCount } = req.body || {};

    // Fetch compliance records from DB for context
    const eventsQuery = await pool.query(
      `SELECT title, type, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status, payment_status 
       FROM compliance_events 
       WHERE company_id = $1 
       ORDER BY due_date DESC LIMIT 10`,
      [companyId]
    );
    const events = eventsQuery.rows;

    // Use the frontend-visible score; fallback to DB if not provided
    let score = visibleScore;
    if (score == null) {
      const scoreQuery = await pool.query(
        `SELECT score FROM compliance_scores WHERE company_id = $1`,
        [companyId]
      );
      score = scoreQuery.rows.length > 0 ? scoreQuery.rows[0].score : 'N/A';
    }

    const systemPrompt = `You are a Senior Corporate Compliance Officer and Analyst. You critically analyze a company's recent filing history to provide an accurate, objective, and highly professional risk analysis.
Your output must be formatted as raw HTML (e.g. <h3>, <p>, <ul>, <li>). Do NOT use Markdown. Do NOT include \`\`\`html code blocks. Do NOT include any inline CSS, <style> tags, or <font> tags. Use strictly standard structural tags so the text inherits the application's default sans-serif font styling. Keep it concise (max 3 short paragraphs or bullets).`;

    const prompt = `Here is the company's data:
Current Compliance Score: ${score}/100
Pending Filings: ${pendingCount != null ? pendingCount : 'unknown'}
Overdue Filings: ${overdueCount != null ? overdueCount : 'unknown'}
Recent Filings from Database: 
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

// ══════════════════════════════════════════════════════════════════════════════
// SHARED: Build financial context from DB for chat prompts
// ══════════════════════════════════════════════════════════════════════════════
const buildFinancialContext = async (companyId) => {
  const [
    revExpRes, topExpensesRes, monthlyTrendRes,
    accountsRes, receivablesRes, payablesRes, recentTxnRes
  ] = await Promise.all([
    pool.query(`SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 GROUP BY type`, [companyId]),
    pool.query(`SELECT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'expense' GROUP BY category ORDER BY total DESC LIMIT 5`, [companyId]),
    pool.query(`SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YYYY') as month, type, SUM(amount) as total FROM transactions WHERE company_id = $1 AND date >= NOW() - INTERVAL '6 months' GROUP BY month, DATE_TRUNC('month', date), type ORDER BY DATE_TRUNC('month', date) ASC`, [companyId]),
    pool.query(`SELECT name, type, bank, COALESCE(opening_balance, 0) as balance FROM accounts WHERE company_id = $1`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices WHERE company_id = $1 AND status IN ('pending', 'overdue')`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE company_id = $1 AND type = 'payable' AND status IN ('pending', 'overdue')`, [companyId]),
    pool.query(`SELECT name, type, category, amount, TO_CHAR(date, 'YYYY-MM-DD') as date FROM transactions WHERE company_id = $1 ORDER BY date DESC LIMIT 10`, [companyId])
  ]);

  const getTotal = (rows, type) => parseFloat(rows.find(r => r.type === type)?.total || 0);
  const totalRevenue = getTotal(revExpRes.rows, 'income');
  const totalExpenses = getTotal(revExpRes.rows, 'expense');
  const netProfit = totalRevenue - totalExpenses;
  const openingBal = accountsRes.rows.reduce((s, a) => s + parseFloat(a.balance), 0);
  const cashInBank = openingBal + netProfit;

  const topExpenses = topExpensesRes.rows
    .map(r => `${r.category || 'Uncategorized'}: ₹${parseFloat(r.total).toLocaleString()}`)
    .join(', ');

  const months = {};
  monthlyTrendRes.rows.forEach(r => {
    if (!months[r.month]) months[r.month] = { revenue: 0, expenses: 0 };
    if (r.type === 'income') months[r.month].revenue = parseFloat(r.total);
    if (r.type === 'expense') months[r.month].expenses = parseFloat(r.total);
  });
  const trendStr = Object.entries(months)
    .map(([m, v]) => `${m}: Rev ₹${v.revenue.toLocaleString()}, Exp ₹${v.expenses.toLocaleString()}`)
    .join(' | ');

  const recentTxns = recentTxnRes.rows
    .map(t => `${t.date} ${t.type} ₹${parseFloat(t.amount).toLocaleString()} ${t.name} [${t.category || '-'}]`)
    .join('\n');

  const totalReceivables = parseFloat(receivablesRes.rows[0].total);
  const totalPayables = parseFloat(payablesRes.rows[0].total);

  // Compute accounting formula ratios from real data
  const ratios = formulas.computeAllRatios({
    revenue: totalRevenue,
    expenses: totalExpenses,
    cash: cashInBank,
    receivables: totalReceivables,
    payables: totalPayables,
  });

  return `
COMPANY FINANCIAL SNAPSHOT:
• Total Revenue: ₹${totalRevenue.toLocaleString()}
• Total Expenses: ₹${totalExpenses.toLocaleString()}
• Net Profit (Net Income): ₹${netProfit.toLocaleString()}
• Cash in Bank: ₹${cashInBank.toLocaleString()}
• Receivables: ₹${totalReceivables.toLocaleString()} (${receivablesRes.rows[0].count} pending)
• Payables: ₹${totalPayables.toLocaleString()}
• Top Expenses: ${topExpenses || 'None'}
• 6-Month Trend: ${trendStr || 'No data'}
• Accounts: ${accountsRes.rows.map(a => `${a.name} (${a.bank}): ₹${parseFloat(a.balance).toLocaleString()}`).join(', ') || 'None'}

ACCOUNTING RATIOS (computed from real data):
• Net Profit Margin: ${ratios.netProfitMargin}%
• Gross Profit Margin: ${ratios.grossProfitMargin}%
• Working Capital: ₹${ratios.workingCapital.toLocaleString()}
• Current Ratio: ${ratios.currentRatio} (healthy: 1.5–3.0)
• Quick Ratio: ${ratios.quickRatio}
• Cash Ratio: ${ratios.cashRatio}
• Return on Assets (ROA): ${ratios.roa}%
• Return on Equity (ROE): ${ratios.roe}%
• Debt-to-Equity Ratio: ${ratios.debtToEquity}
• Debt Ratio: ${ratios.debtRatio}
• AR Turnover: ${ratios.arTurnover}x
• Days Sales Outstanding (DSO): ${ratios.daysSalesOutstanding} days
• Total Asset Turnover: ${ratios.totalAssetTurnover}x
• Operating Cash Flow: ₹${ratios.operatingCashFlow.toLocaleString()}

RECENT TRANSACTIONS:
${recentTxns || 'No transactions yet.'}
`.trim();
};

const CFO_SYSTEM_PREFIX = `You are an internal AI CFO Assistant helping the owner of this company manage their own business finances. All questions are about this company's internal operations — never about external companies or competitors.

Your role: answer every finance-related question helpfully. Never refuse. Never say you cannot help. If the owner asks about reducing costs, improving cash flow, managing taxes, or any financial action plan — always provide clear, numbered, practical steps they can take inside their own business.

Keep answers to 3-5 sentences or a short numbered list. Use ₹ for currency. Reference the actual numbers from the data when relevant.

`;

// ── AI CFO Chatbot (non-streaming, kept as fallback) ────────────────────────
const chatWithCFO = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const financialContext = await buildFinancialContext(companyId);
    const systemPrompt = CFO_SYSTEM_PREFIX + financialContext;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 8000)
    );
    let reply;
    try {
      reply = await Promise.race([
        generateResponse(message, systemPrompt, false),
        timeoutPromise
      ]);
    } catch (err) {
      if (err.message === 'TIMEOUT') {
        return res.json({ reply: 'The analysis is taking longer than expected. Please try a simpler question or try again shortly.' });
      }
      throw err;
    }
    res.json({ reply: reply.trim() });
  } catch (error) {
    console.error('Chat CFO Error:', error);
    res.status(500).json({ error: 'Failed to process your question' });
  }
};

// ── AI CFO Chatbot — Streaming (SSE) ────────────────────────────────────────
const chatWithCFOStream = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const financialContext = await buildFinancialContext(companyId);
    const systemPrompt = CFO_SYSTEM_PREFIX + financialContext;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx
    res.flushHeaders();

    const tokenStream = await generateStreamResponse(message, systemPrompt);
    let fullReply = '';

    tokenStream.on('data', (chunk) => {
      const token = chunk.toString();
      fullReply += token;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    });

    tokenStream.on('end', async () => {
      res.write(`data: [DONE]\n\n`);

      // Persist to chat history
      try {
        await pool.query(
          `INSERT INTO chat_history (company_id, role, message) VALUES ($1, 'user', $2), ($1, 'ai', $3)`,
          [companyId, message.trim(), fullReply.trim()]
        );
      } catch (e) {
        console.error('Failed to persist chat:', e.message);
      }

      res.end();
    });

    tokenStream.on('error', (err) => {
      console.error('Stream error:', err);
      res.write(`data: ${JSON.stringify({ token: '\n\nSorry, the analysis encountered an error.' })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });

    // Client disconnect cleanup
    req.on('close', () => {
      tokenStream.destroy();
    });
  } catch (error) {
    console.error('Stream Chat CFO Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process your question' });
    }
  }
};

// ── Chat History ────────────────────────────────────────────────────────────
const getChatHistory = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const result = await pool.query(
      `SELECT role, message as text, created_at FROM chat_history WHERE company_id = $1 ORDER BY created_at ASC LIMIT 50`,
      [companyId]
    );
    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Get Chat History Error:', error);
    res.json({ messages: [] }); // Graceful fallback if table doesn't exist
  }
};

const clearChatHistory = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    await pool.query(`DELETE FROM chat_history WHERE company_id = $1`, [companyId]);
    res.json({ message: 'Chat history cleared' });
  } catch (error) {
    console.error('Clear Chat History Error:', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
};

// ── Export Chat as PDF ──────────────────────────────────────────────────────
const exportChatPDF = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    // Fetch company name
    const companyRes = await pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId]);
    const companyName = companyRes.rows[0]?.name || 'Company';

    // Fetch chat history
    const historyRes = await pool.query(
      `SELECT role, message, TO_CHAR(created_at, 'DD Mon YYYY, HH12:MI AM') as timestamp FROM chat_history WHERE company_id = $1 ORDER BY created_at ASC`,
      [companyId]
    );

    if (historyRes.rows.length === 0) {
      return res.status(400).json({ error: 'No chat history to export' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AI_CFO_Report_${companyName.replace(/\s+/g, '_')}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#4f46e5')
      .text('AI CFO Conversation Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').fillColor('#64748b')
      .text(`${companyName}  •  Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(1);

    // Messages
    for (const msg of historyRes.rows) {
      const isUser = msg.role === 'user';
      const label = isUser ? 'You' : 'AI CFO';
      const color = isUser ? '#3b82f6' : '#4f46e5';

      doc.fontSize(9).font('Helvetica').fillColor('#94a3b8').text(msg.timestamp);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(color).text(label);
      doc.fontSize(10).font('Helvetica').fillColor('#1e293b').text(msg.message, { lineGap: 3 });
      doc.moveDown(0.8);

      // Page break safety
      if (doc.y > 720) doc.addPage();
    }

    // Footer
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
      .text('SODA Corporate Dashboard — AI CFO Module', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Export Chat PDF Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export chat' });
    }
  }
};

const executePlan = async (req, res) => {
  const companyId = req.companyId;
  const { plan_type, plan_title, steps } = req.body;
  if (!plan_type || !plan_title || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'plan_type, plan_title, and steps are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO executed_plans (company_id, plan_type, plan_title, steps)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
      [companyId, plan_type, plan_title, JSON.stringify(steps)]
    );
    res.json({ plan: result.rows[0] });
  } catch (error) {
    console.error('Execute Plan Error:', error);
    res.status(500).json({ error: 'Failed to save plan' });
  }
};

const getActivePlans = async (req, res) => {
  const companyId = req.companyId;
  try {
    const result = await pool.query(
      `SELECT * FROM executed_plans WHERE company_id = $1 ORDER BY created_at DESC`,
      [companyId]
    );
    res.json({ plans: result.rows });
  } catch (error) {
    console.error('Get Active Plans Error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
};

const updatePlanStatus = async (req, res) => {
  const companyId = req.companyId;
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'status must be active or completed' });
  }
  try {
    const result = await pool.query(
      `UPDATE executed_plans SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *`,
      [status, id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: result.rows[0] });
  } catch (error) {
    console.error('Update Plan Status Error:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
};

module.exports = {
  categorizeTransactions,
  complianceReview,
  parseInvoiceOCR,
  chatWithCFO,
  chatWithCFOStream,
  getChatHistory,
  clearChatHistory,
  exportChatPDF,
  executePlan,
  getActivePlans,
  updatePlanStatus
};
