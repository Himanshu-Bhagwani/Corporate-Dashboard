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
// SHARED: Intent detection — route the question to the right data section
// ══════════════════════════════════════════════════════════════════════════════
const detectIntents = (message) => {
  const m = (message || '').toLowerCase();
  const intents = new Set();

  if (/invoice|receivab|payab|outstanding|bill(s|ing)?\b|due date|deadline|client owes|owe|collection|credit note|debit note|irn/.test(m)) {
    intents.add('invoices');
  }
  if (/complian|gst|tds|filing|roc|tax return|deadline|due filing|penalt/.test(m)) {
    intents.add('compliance');
  }
  if (/account(ing)?\b|ledger|chart of accounts|journal|coa\b|contact|customer|vendor/.test(m)) {
    intents.add('accounting');
  }
  if (/transaction|expense|spend|income|cost|categor|cash ?flow|salary|salaries|purchase/.test(m)) {
    intents.add('transactions');
  }
  return intents;
};

// Fetch section-specific live data blocks based on detected intents.
const buildSectionContext = async (companyId, intents) => {
  const blocks = [];
  const fmt = (n) => '₹' + (parseFloat(n) || 0).toLocaleString('en-IN');

  if (intents.has('invoices')) {
    let invRes;
    try {
      invRes = await pool.query(
        `SELECT i.invoice_number, i.client_name, i.type, i.status,
                COALESCE(i.grand_total, i.amount) AS total,
                TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due_date,
                TO_CHAR(i.issue_date, 'YYYY-MM-DD') AS issue_date,
                COALESCE(adj.payments, 0) AS paid,
                COALESCE(adj.dn, 0) AS dn_total,
                COALESCE(adj.cn, 0) AS cn_total
         FROM invoices i
         LEFT JOIN (
           SELECT invoice_id,
                  SUM(CASE WHEN kind = 'payment' THEN total_amount ELSE 0 END) AS payments,
                  SUM(CASE WHEN kind = 'debit_note' THEN total_amount ELSE 0 END) AS dn,
                  SUM(CASE WHEN kind = 'credit_note' THEN total_amount ELSE 0 END) AS cn
           FROM invoice_adjustments GROUP BY invoice_id
         ) adj ON adj.invoice_id = i.id
         WHERE i.company_id = $1
         ORDER BY i.due_date ASC NULLS LAST
         LIMIT 40`,
        [companyId]
      );
    } catch (e) {
      // invoice_adjustments may not exist on an un-migrated DB — degrade gracefully.
      invRes = await pool.query(
        `SELECT invoice_number, client_name, type, status,
                COALESCE(grand_total, amount) AS total,
                TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date,
                TO_CHAR(issue_date, 'YYYY-MM-DD') AS issue_date,
                COALESCE(amount_paid, 0) AS paid,
                0 AS dn_total, 0 AS cn_total
         FROM invoices WHERE company_id = $1
         ORDER BY due_date ASC NULLS LAST LIMIT 40`,
        [companyId]
      );
    }

    let recOut = 0, payOut = 0, recCount = 0, payCount = 0, settledCount = 0;
    const overdueLines = [], upcomingLines = [], openLines = [];
    const today = new Date().toISOString().slice(0, 10);

    invRes.rows.forEach(r => {
      const total = parseFloat(r.total) || 0;
      const outstanding = Math.max(0, total + parseFloat(r.dn_total) - parseFloat(r.cn_total) - parseFloat(r.paid));
      const isRec = (r.type || 'receivable').toLowerCase() === 'receivable';

      // Only an invoice with a real remaining balance is "open". Fully-settled
      // (outstanding = 0) or zero-value invoices must NOT inflate the totals.
      if (outstanding <= 0 || r.status === 'paid') {
        settledCount++;
        return;
      }

      if (isRec) { recOut += outstanding; recCount++; } else { payOut += outstanding; payCount++; }
      openLines.push(`  ${r.invoice_number} | ${isRec ? 'RECEIVABLE' : 'PAYABLE'} | ${r.client_name} | total ${fmt(total)} | paid ${fmt(r.paid)} | OUTSTANDING ${fmt(outstanding)} | due ${r.due_date || '-'} | status ${r.status}`);

      if (r.due_date && r.due_date < today) {
        overdueLines.push(`  - ${r.invoice_number} (${isRec ? 'receivable from' : 'payable to'} ${r.client_name}): ${fmt(outstanding)} was due ${r.due_date} — OVERDUE`);
      } else if (r.due_date) {
        upcomingLines.push(`  - ${r.invoice_number} (${isRec ? 'receivable from' : 'payable to'} ${r.client_name}): ${fmt(outstanding)} due ${r.due_date}`);
      }
    });

    // These are the ONLY totals the model may quote — pre-summed here so the
    // model never has to add anything itself.
    blocks.push(`
INVOICES SECTION (live data — authoritative; use ONLY these rows and these pre-computed totals for invoice questions):
>> PRE-COMPUTED TOTALS (quote these verbatim — DO NOT recompute or re-add them):
   Total OUTSTANDING RECEIVABLES (money clients owe us): ${fmt(recOut)} across ${recCount} open invoice(s)
   Total OUTSTANDING PAYABLES (money we owe vendors): ${fmt(payOut)} across ${payCount} open bill(s)
   Fully settled / zero-balance invoices (excluded from the totals above): ${settledCount}
OPEN INVOICES (outstanding > 0 — these are the only ones that count toward the totals):
${openLines.join('\n') || '  (none — everything is settled)'}
${overdueLines.length ? 'OVERDUE:\n' + overdueLines.join('\n') : 'No overdue invoices.'}
${upcomingLines.length ? 'UPCOMING DUE DATES:\n' + upcomingLines.slice(0, 10).join('\n') : ''}`.trim());
  }

  if (intents.has('compliance')) {
    const compRes = await pool.query(
      `SELECT title, type, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, status, payment_status
       FROM compliance_events WHERE company_id = $1 ORDER BY due_date ASC LIMIT 25`,
      [companyId]
    );
    const lines = compRes.rows.map(r =>
      `  ${r.title} [${r.type}] due ${r.due_date} — ${r.status}${r.payment_status && r.payment_status !== 'NOT_APPLICABLE' ? ' / payment ' + r.payment_status : ''}`
    );
    blocks.push(`
COMPLIANCE SECTION (live filings data — authoritative for compliance questions):
${lines.join('\n') || '  (no compliance events recorded)'}`.trim());
  }

  if (intents.has('accounting')) {
    // Aggregate the customer/vendor ledger the SAME way the Accounting view does:
    // group transactions by counterparty name, sum the total, count the txns,
    // and capture first/last dates so we can describe frequency. This is the
    // authoritative "biggest customer / vendor" data — NOT individual txns.
    const [custRes, vendRes] = await Promise.all([
      pool.query(
        `SELECT t.name AS counterparty,
                COUNT(t.id) AS txn_count,
                SUM(t.amount) AS total_amount,
                TO_CHAR(MIN(t.date), 'YYYY-MM-DD') AS first_date,
                TO_CHAR(MAX(t.date), 'YYYY-MM-DD') AS last_date
         FROM transactions t
         WHERE t.company_id = $1 AND t.type = 'income'
         GROUP BY t.name
         ORDER BY total_amount DESC
         LIMIT 10`,
        [companyId]
      ),
      pool.query(
        `SELECT t.name AS counterparty,
                COUNT(t.id) AS txn_count,
                SUM(t.amount) AS total_amount,
                TO_CHAR(MIN(t.date), 'YYYY-MM-DD') AS first_date,
                TO_CHAR(MAX(t.date), 'YYYY-MM-DD') AS last_date,
                MODE() WITHIN GROUP (ORDER BY t.category) AS primary_category
         FROM transactions t
         WHERE t.company_id = $1 AND t.type = 'expense'
         GROUP BY t.name
         ORDER BY total_amount DESC
         LIMIT 10`,
        [companyId]
      ),
    ]);

    // Frequency measured SINCE the first transaction (when they became a
    // customer/vendor) up to today — i.e. across their whole relationship.
    const today = new Date();
    const freq = (count, first) => {
      const n = parseInt(count);
      const days = Math.max(1, Math.round((today - new Date(first)) / 86400000));
      const monthsSince = (days / 30).toFixed(1);
      if (n <= 1) return `1 txn since first on ${first} (${monthsSince} months ago) — new relationship / one-off so far`;
      const avgGap = Math.round(days / n);
      const perMonth = (n / (days / 30)).toFixed(1);
      return `${n} txns since first on ${first} (${monthsSince} months as a relationship) — about one every ${avgGap} days (~${perMonth} per month)`;
    };

    const fmtRow = (r, withCat) => {
      const total = parseFloat(r.total_amount) || 0;
      return `  ${r.counterparty}${withCat && r.primary_category ? ' [' + r.primary_category + ']' : ''}: total ₹${total.toLocaleString('en-IN')} | ${freq(r.txn_count, r.first_date)} | last txn ${r.last_date}`;
    };

    const custLines = custRes.rows.map(r => fmtRow(r, false));
    const vendLines = vendRes.rows.map(r => fmtRow(r, true));

    blocks.push(`
ACCOUNTING / LEDGER SECTION (authoritative for customer & vendor questions — each row is the TOTAL across all that party's transactions, already summed; the list is sorted biggest-first. NEVER quote a single transaction as the party's total).
When you describe a party's frequency, phrase it as "<name>'s transaction frequency has been <rate> since their first transaction on <first date>" — the frequency is measured from their first transaction (when they became a customer/vendor):
TOP CUSTOMERS (by total money received, income transactions):
${custLines.join('\n') || '  (no customer transactions yet)'}
TOP VENDORS (by total money spent, expense transactions):
${vendLines.join('\n') || '  (no vendor transactions yet)'}`.trim());
  }

  if (intents.has('transactions')) {
    const catRes = await pool.query(
      `SELECT type, category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM transactions WHERE company_id = $1
       GROUP BY type, category ORDER BY total DESC LIMIT 25`,
      [companyId]
    );
    const lines = catRes.rows.map(r =>
      `  ${r.type} | ${r.category || 'Uncategorized'}: ₹${parseFloat(r.total).toLocaleString('en-IN')} (${r.cnt} txns)`
    );
    blocks.push(`
TRANSACTIONS SECTION (category breakdown — authoritative for expense/income questions):
${lines.join('\n') || '  (no transactions)'}`.trim());
  }

  return blocks;
};

// ══════════════════════════════════════════════════════════════════════════════
// SHARED: Build financial context from DB for chat prompts
// ══════════════════════════════════════════════════════════════════════════════
const buildFinancialContext = async (companyId) => {
  const [
    revExpRes, topExpensesRes, topRevenuesRes, monthlyTrendRes,
    accountsRes, receivablesRes, payablesRes, recentTxnRes
  ] = await Promise.all([
    pool.query(`SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 GROUP BY type`, [companyId]),
    pool.query(`SELECT category, SUM(amount) as total, COUNT(*) as cnt FROM transactions WHERE company_id = $1 AND type = 'expense' GROUP BY category ORDER BY total DESC LIMIT 5`, [companyId]),
    pool.query(`SELECT category, SUM(amount) as total, COUNT(*) as cnt FROM transactions WHERE company_id = $1 AND type = 'income'  GROUP BY category ORDER BY total DESC LIMIT 5`, [companyId]),
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
    .map(r => `${r.category || 'Uncategorized'}: ₹${parseFloat(r.total).toLocaleString('en-IN')} (${r.cnt} txns)`)
    .join(', ');

  const topRevenues = topRevenuesRes.rows
    .map(r => `${r.category || 'Uncategorized'}: ₹${parseFloat(r.total).toLocaleString('en-IN')} (${r.cnt} txns)`)
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

  // Cash runway: months of cash left at the average monthly burn (expenses).
  const monthCount = Math.max(1, Object.keys(months).length);
  const avgMonthlyExpenses = totalExpenses / monthCount;
  const cashRunwayMonths = avgMonthlyExpenses > 0 ? (cashInBank / avgMonthlyExpenses) : null;

  // Ratio formatter: plain number with healthy-range annotation. Never a ₹ value.
  const ratioStr = (val, healthy) => val === null || val === undefined
    ? 'N/A (no open payables — liquidity is not constrained)'
    : `${val}${healthy ? ` (healthy range: ${healthy})` : ''}`;

  // ── Health alerts: metrics outside healthy levels ────────────────────────
  const alerts = [];
  if (netProfit < 0) alerts.push(`NET LOSS: expenses exceed revenue by ₹${Math.abs(netProfit).toLocaleString('en-IN')}. Cut costs or grow revenue urgently.`);
  if (ratios.currentRatio !== null && ratios.currentRatio < 1.5) alerts.push(`LOW CURRENT RATIO (${ratios.currentRatio}, healthy 1.5–3.0): short-term obligations may strain liquidity.`);
  if (ratios.currentRatio !== null && ratios.currentRatio > 3.0) alerts.push(`HIGH CURRENT RATIO (${ratios.currentRatio}): idle cash — consider investing surplus.`);
  if (cashRunwayMonths !== null && cashRunwayMonths < 3) alerts.push(`SHORT CASH RUNWAY (${cashRunwayMonths.toFixed(1)} months, healthy ≥ 6): at current burn the bank balance runs out soon.`);
  if (ratios.daysSalesOutstanding > 45) alerts.push(`HIGH DSO (${ratios.daysSalesOutstanding} days, healthy ≤ 45): collections are slow — chase receivables.`);
  if (ratios.netProfitMargin !== null && ratios.netProfitMargin < 10 && totalRevenue > 0) alerts.push(`THIN NET MARGIN (${ratios.netProfitMargin}%, healthy ≥ 10%): pricing or cost structure needs attention.`);
  if (ratios.debtToEquity > 2) alerts.push(`HIGH DEBT-TO-EQUITY (${ratios.debtToEquity}, healthy ≤ 2): leverage risk.`);
  if (cashInBank < 0) alerts.push(`NEGATIVE CASH POSITION: ₹${cashInBank.toLocaleString('en-IN')}.`);

  return `
COMPANY FINANCIAL SNAPSHOT (dashboard metrics — all figures are real user data):
• Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
• Total Expenses: ₹${totalExpenses.toLocaleString('en-IN')}
• Net Profit (Net Income): ₹${netProfit.toLocaleString('en-IN')}
• Cash in Bank: ₹${cashInBank.toLocaleString('en-IN')}
• Cash Runway: ${cashRunwayMonths === null ? 'N/A (no expenses recorded)' : cashRunwayMonths.toFixed(1) + ' months at average burn of ₹' + Math.round(avgMonthlyExpenses).toLocaleString('en-IN') + '/month (healthy: ≥ 6 months)'}
• Outstanding Receivables (clients owe us): ₹${totalReceivables.toLocaleString('en-IN')} (${receivablesRes.rows[0].count} open invoices)
• Outstanding Payables (we owe vendors): ₹${totalPayables.toLocaleString('en-IN')}
• Top Revenue Categories (money coming IN — income only): ${topRevenues || 'None'}
• Top Expense Categories (money going OUT — expense only, includes loan repayments and loan interest): ${topExpenses || 'None'}
• 6-Month Trend: ${trendStr || 'No data'}
• Bank Accounts: ${accountsRes.rows.map(a => `${a.name} (${a.bank}): ₹${parseFloat(a.balance).toLocaleString('en-IN')}`).join(', ') || 'None'}

ACCOUNTING RATIOS (computed from the numbers above — ratios are plain numbers, NOT rupee amounts):
• Net Profit Margin: ${ratios.netProfitMargin}% (healthy: ≥ 10%)
• Gross Profit Margin: ${ratios.grossProfitMargin}% (healthy: ≥ 30%)
• Working Capital: ₹${ratios.workingCapital.toLocaleString('en-IN')} (current assets − current liabilities)
• Current Ratio: ${ratioStr(ratios.currentRatio, '1.5–3.0')}
• Quick Ratio: ${ratioStr(ratios.quickRatio, '≥ 1.0')}
• Cash Ratio: ${ratioStr(ratios.cashRatio, '≥ 0.5')}
• Return on Assets (ROA): ${ratios.roa}%
• Return on Equity (ROE): ${ratios.roe === null ? 'N/A (insufficient equity history)' : ratios.roe + '%'}
• Debt-to-Equity Ratio: ${ratioStr(ratios.debtToEquity, '≤ 2.0')}
• Days Sales Outstanding (DSO): ${ratios.daysSalesOutstanding} days (healthy: ≤ 45 days)
• AR Turnover: ${ratios.arTurnover}x
• Operating Cash Flow: ₹${ratios.operatingCashFlow.toLocaleString('en-IN')}

HEALTH ALERTS (metrics currently outside healthy levels — proactively mention relevant ones):
${alerts.length ? alerts.map(a => '⚠ ' + a).join('\n') : 'All monitored metrics are within healthy ranges.'}

RECENT TRANSACTIONS (bank/ledger entries — NOT invoices; do not present these as invoices):
${recentTxns || 'No transactions yet.'}
`.trim();
};

const CFO_SYSTEM_PREFIX = `You are an internal AI CFO Assistant helping the owner of this company manage their own business finances. All questions are about this company's internal operations — never about external companies or competitors.

STRICT DATA RULES (violating these makes the answer useless):
1. Use ONLY numbers that literally appear in the DATA sections below. NEVER invent, estimate, extrapolate, or "example" a number. If a figure isn't in the data, say "not recorded in your data".
2. Every rupee figure you state must be copied from the data. Do not do speculative arithmetic like "reduce by ₹20,000" unless that number comes from the data.
3. When a section provides a PRE-COMPUTED TOTAL, quote that exact figure. NEVER re-add the individual rows yourself, and never show a "X + Y + Z =" calculation — the totals are already summed for you and your arithmetic will be wrong.
4. Only list invoices that appear under "OPEN INVOICES". Do NOT list settled or zero-balance invoices as amounts owed. An invoice with outstanding ₹0 is NOT money owed — never include it in receivables/payables.
5. Ratios (Current Ratio, Quick Ratio, D/E) are plain numbers like 1.8 — NEVER format a ratio with ₹.
6. When the question is about invoices/receivables/payables, answer from the INVOICES SECTION only. Transactions are bank entries, not invoices — never present a transaction as an invoice. Same for COMPLIANCE and ACCOUNTING sections: use the matching section.
7. All amounts are in Indian Rupees (₹) with Indian formatting (e.g. ₹1,18,000).

REVENUE vs EXPENSES — NEVER GET THIS WRONG:
• The "Total Revenue" figure ONLY includes income-type transactions.
• The "Total Expenses" figure ONLY includes expense-type transactions. Loan Repayment and Loan Interest are ALWAYS expenses — they are money going OUT — and appear in Top Expense Categories, never in Top Revenue Categories.
• Do NOT invent a "Top Revenue Categories" list. Only quote it if it is explicitly present in the data section.
• Net Profit is PRE-COMPUTED for you (Revenue − Expenses). NEVER recompute or restate it with different arithmetic. If you need "how much revenue exceeds expenses", quote the Net Profit figure verbatim — do not subtract yourself.
• A HIGH revenue-to-expenses ratio is GOOD (the business is profitable). A LOW ratio (< 1.0) means expenses exceed revenue = a LOSS. Never describe a high revenue/expense ratio as an "imbalance" or "cash-flow risk" — that reading is backwards.
• If Total Expenses > Total Revenue, the company is at a NET LOSS — say so plainly and reference the pre-computed Net Profit figure.

ANSWER STRUCTURE (use markdown, be thorough but organized):
1. **Direct answer** — lead with the number(s) the user asked for.
2. **Breakdown** — itemize the relevant records from the data (invoice numbers, parties, amounts, due dates).
3. **Financial health impact** — connect to the ratios provided: how does this affect Current Ratio, DSO, Cash Runway, Working Capital? Quote the current values from the data and explain in one line what each means.
4. **Alerts** — if any HEALTH ALERTS in the data relate to the question, surface them prominently.
5. **Action plan** — 3-5 specific, practical steps ranked by impact, each tied to the actual data (e.g. "chase the ₹X overdue invoice from Y first").

Never refuse a finance question. Explain jargon in plain words the first time you use it.

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

    const intents = detectIntents(message);
    const [financialContext, sectionBlocks] = await Promise.all([
      buildFinancialContext(companyId),
      buildSectionContext(companyId, intents),
    ]);
    const systemPrompt = CFO_SYSTEM_PREFIX + financialContext +
      (sectionBlocks.length ? '\n\n' + sectionBlocks.join('\n\n') : '');

    // Generous timeout — a local Ollama model on CPU can take 20-30s for a
    // detailed answer; 8s was cutting off nearly every response.
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 45000)
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

    // Persist to chat history so refreshes keep the conversation
    try {
      await pool.query(
        `INSERT INTO chat_history (company_id, role, message) VALUES ($1, 'user', $2), ($1, 'ai', $3)`,
        [companyId, message.trim(), reply.trim()]
      );
    } catch (e) {
      console.error('Failed to persist chat:', e.message);
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

    const intents = detectIntents(message);
    const [financialContext, sectionBlocks] = await Promise.all([
      buildFinancialContext(companyId),
      buildSectionContext(companyId, intents),
    ]);
    const systemPrompt = CFO_SYSTEM_PREFIX + financialContext +
      (sectionBlocks.length ? '\n\n' + sectionBlocks.join('\n\n') : '');

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
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID required' });
  const { plan_type, plan_title, steps } = req.body;
  if (!plan_type || !plan_title || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'plan_type, plan_title, and steps are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO action_plans (company_id, plan_type, plan_title, steps)
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
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID required' });
  try {
    const result = await pool.query(
      `SELECT * FROM action_plans WHERE company_id = $1 ORDER BY created_at DESC`,
      [companyId]
    );
    res.json({ plans: result.rows });
  } catch (error) {
    console.error('Get Active Plans Error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
};

const updatePlanStatus = async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID required' });
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'status must be active or completed' });
  }
  try {
    const result = await pool.query(
      `UPDATE action_plans SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *`,
      [status, id, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: result.rows[0] });
  } catch (error) {
    console.error('Update Plan Status Error:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
};

// Report which AI provider will actually serve chat requests so the UI can
// label the assistant with the real model name instead of a generic "AI".
const getAiProvider = (req, res) => {
  if (process.env.GEMINI_API_KEY) {
    return res.json({
      provider: 'gemini',
      label: 'Gemini',
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    });
  }
  return res.json({
    provider: 'ollama',
    label: 'Llama 3.2',
    model: process.env.OLLAMA_MODEL || 'llama3.2:1b',
  });
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
  updatePlanStatus,
  getAiProvider,
};
