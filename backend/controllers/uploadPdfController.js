const { pool } = require('../config/db');
const { extractTextWithCoords } = require('../utils/pdfExtractor');
const { groupIntoRowsWithCoords } = require('../utils/rowGrouper');
const { detectColumns, classifyByColumn, resolveTransactionType } = require('../utils/columnDetector');

/**
 * Handles PDF bank statement upload and ingestion.
 * Uses column-aware classification (Debit/Credit/Balance) based on header detection.
 * Falls back to sign-based heuristic when no header is found.
 */
const uploadPdfStatement = async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID required' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let client = null;

  try {
    // ── Stage 1: Extraction ──────────────────────────────────────────────
    const items = await extractTextWithCoords(req.file.buffer);
    
    // ── Stage 2: Grouping (with coordinates preserved) ───────────────────
    const rows = groupIntoRowsWithCoords(items);

    // ── Stage 3: Column Detection ────────────────────────────────────────
    const columnMap = detectColumns(rows);
    const hasColumnMap = columnMap !== null;

    if (hasColumnMap) {
      console.log(`[PDF Parser] Column detection succeeded. Mode: ${columnMap.isSingleAmountColumn ? 'Single Amount Column' : 'Separate Debit/Credit Columns'}`);
    } else {
      console.warn('[PDF Parser] Column detection failed — falling back to legacy heuristic.');
    }

    // ── Stage 4: Intelligent Row-Level Extraction ────────────────────────
    const normalizedTransactions = [];
    let currentTxn = null;
    let pendingDescriptions = [];
    let identifiedCandidateRows = 0;
    let lastKnownDate = null;
    let pendingDescription = ''; // buffer for narration rows that appear before/between amount rows

    const datePattern = /(\d{1,2}[\s\/\-.]{1,3}(?:\d{1,2}|[A-Za-z]{3,8})[\s\/\-.]{1,3}\d{2,4})|(\d{4}[\s\/\-.]{1,3}\d{1,2}[\s\/\-.]{1,3}\d{1,2})/;
    const noiseKeywords = [
      'opening balance', 'closing balance', 'brought forward', 'carried forward',
      'statement total', 'page total', 'grand total', 'total debit', 'total credit',
      'total amount', 'sum total', 'totals',
      'auto generated statement', 'requires no signature', 'page',
      'review the information', 'call us', 'email', 'website', 'branch address',
      'this is a computer generated', 'does not require', 'disclaimer'
    ];

    console.log(`[PDF Parser Stage 4] Starting row processing. Total grouped rows: ${rows.length}`);

    // Helper functions
    const parseNumber = (val) => {
      const s = val.toString().trim().replace(/[₹$€,]/g, '');
      const num = parseFloat(s);
      return isNaN(num) ? null : num;
    };
    
    const isCurrencyFormat = (val) => {
      const s = val.toString().trim().replace(/[₹$€,]/g, '');
      return /^-?\d+(\.\d{2})?$/.test(s);
    };

    // Start processing after the header row (if detected)
    const startRow = hasColumnMap ? columnMap.headerRowIndex + 1 : 0;

    for (let rowIdx = startRow; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      if (!Array.isArray(row)) continue;

      // Build plain text for noise check
      const rowText = row.map(cell => (cell.text || '')).join(' ').toLowerCase();
      if (noiseKeywords.some(kw => rowText.includes(kw))) {
        continue;
      }
      
      // Dynamic arrays for this row
      let rowDate = null;
      let textComponents = [];
      let numericValues = []; // { value, x, index }

      for (let i = 0; i < row.length; i++) {
        const cell = row[i];
        if (!cell) continue;
        const cleanText = (cell.text || '').toString().trim();
        const cellX = cell.x;

        let processedText = cleanText;

        // Check if it's a date
        if (datePattern.test(processedText)) {
          if (!rowDate) {
            // Extract just the date string matching the pattern
            rowDate = processedText.match(datePattern)[0];
          }
          // Strip date string(s) from text so they don't appear in the description
          processedText = processedText.replace(new RegExp(datePattern, 'g'), ' ').replace(/\s+/g, ' ').trim();
          if (processedText.length === 0) continue; // Cell was entirely a date
        }

        // Strip reference numbers (6+ digits without decimal) from text without dropping surrounding characters
        if (/\d{6,}/.test(processedText) && !processedText.includes('.')) {
          processedText = processedText.replace(/(?:[-/:]+)?\d{6,}(?:[-/:]+)?/g, ' ').replace(/\s+/g, ' ').trim();
          if (processedText.length === 0) continue; // Cell was entirely a reference number
        }

        // Check if processed text is numeric/currency
        if (isCurrencyFormat(processedText)) {
          const num = parseNumber(processedText);
          // Filter: >= 10 to skip noise, and <= 10,00,00,000 (10 crore) as sanity max
          if (num !== null && Math.abs(num) >= 10 && Math.abs(num) <= 1000000000) {
            numericValues.push({ value: num, x: cellX, index: i });
          }
          continue;
        }

        // Otherwise, it's text
        if (processedText.length > 0) {
          textComponents.push(processedText);
        }
      }

      if (rowDate) lastKnownDate = rowDate;

      const hasAmount = numericValues.length > 0;
      const description = textComponents.join(' ');

        // ── Column-Aware Classification ──
        let type = 'unknown';
        let absoluteAmount = 0;

      if (hasAmount) {
        // Must have a date
        if (!lastKnownDate) continue;

        identifiedCandidateRows++;

        if (hasColumnMap) {
          // Classify each numeric value by its x-coordinate
          const classifiedValues = numericValues.map(nv => ({
            value: nv.value,
            x: nv.x,
            column: classifyByColumn(nv.x, columnMap)
          }));

          // Log classification details for debugging
          const classLog = classifiedValues.map(v => `${v.column}=${v.value}@x${v.x.toFixed(0)}`).join(', ');
          console.log(`[PDF Parser Row ${rowIdx}] Classified: [${classLog}]`);

          // ── TOTALS ROW GUARD ──
          // If a row has BOTH a debit and credit value, it's the summary/totals row
          // at the end of the statement (e.g., "Total Debits: 459954.66  Total Credits: 478659")
          // Real transaction rows only ever have a value in ONE of debit/credit columns.
          const hasDebit = classifiedValues.some(v => v.column === 'debit');
          const hasCredit = classifiedValues.some(v => v.column === 'credit');
          const hasBalance = classifiedValues.some(v => v.column === 'balance');
          if (hasDebit && hasCredit) {
            console.log(`[PDF Parser Row ${rowIdx}] SKIPPED — totals row (both debit & credit present)`);
            identifiedCandidateRows--; // Don't count as candidate
            continue;
          }

          // ── BALANCE-ONLY ROW GUARD ──
          // If the only classified value is balance (no debit/credit), skip it
          if (hasBalance && !hasDebit && !hasCredit) {
            const nonBalanceNonUnknown = classifiedValues.filter(v => v.column !== 'balance' && v.column !== 'unknown');
            if (nonBalanceNonUnknown.length === 0) {
              console.log(`[PDF Parser Row ${rowIdx}] SKIPPED — balance-only row`);
              identifiedCandidateRows--;
              continue;
            }
          }

          const resolved = resolveTransactionType(classifiedValues, columnMap);
          type = resolved.type;
          absoluteAmount = resolved.amount;
        } else {
          // ── Legacy Fallback (no header detected) ──
          // Use the old size-comparison heuristic as last resort
          let bestAmtObj = numericValues[0];
          let maxAmtObj = numericValues[0];
          
          for (const obj of numericValues) {
            if (Math.abs(obj.value) < Math.abs(bestAmtObj.value)) bestAmtObj = obj;
            if (Math.abs(obj.value) > Math.abs(maxAmtObj.value)) maxAmtObj = obj;
          }

          if (bestAmtObj.index < maxAmtObj.index) {
            type = 'expense';
          } else if (bestAmtObj.index > maxAmtObj.index) {
            type = 'income';
          }

          absoluteAmount = Math.abs(bestAmtObj.value);
        }

        if (currentTxn) {
          // Flush the previous transaction — continuation lines between two amount rows belong to it
          const combinedName = [currentTxn.name, ...pendingDescriptions].filter(Boolean).join(' ').trim().substring(0, 250);
          currentTxn.name = combinedName || 'Unknown Transaction';
          normalizedTransactions.push(currentTxn);
          currentTxn = null;
          pendingDescriptions = []; // consumed by previous transaction — clear before building new one
        }

        // pendingDescriptions is now either empty (post-flush) or holds pre-amount description lines
        const initialDesc = [...pendingDescriptions, description].join(' ').trim();
        pendingDescriptions = [];
        // Use "" as interim — 'Unknown Transaction' is applied only at final flush/finalize
        // so that continuation lines appended later aren't prefixed with it
        const safeName = initialDesc.substring(0, 250);

        const txn = {
          date: lastKnownDate,
          name: safeName,
          amount: absoluteAmount,
          type: type,
          notes: hasColumnMap 
            ? 'Imported via Column-Aware Extraction' 
            : 'Imported via Legacy Heuristic (no header detected)'
        };
        
        currentTxn = txn;

      } else {
        // No amount on this row
        if (rowDate) {
           // A new date with no amount marks the start of a new transaction context
           if (currentTxn) {
               const combinedName = [currentTxn.name, ...pendingDescriptions].filter(Boolean).join(' ').trim().substring(0, 250);
               currentTxn.name = combinedName || 'Unknown Transaction';
               normalizedTransactions.push(currentTxn);
               currentTxn = null;
               pendingDescriptions = []; // same fix — these belonged to the flushed transaction
           }
        }

        if (description.trim()) {
           pendingDescriptions.push(description.trim());
        }
      }
    }
    
    // Finalize the last pending transaction
    if (currentTxn) {
       const combinedName = [currentTxn.name, ...pendingDescriptions].filter(Boolean).join(' ').trim().substring(0, 250);
       currentTxn.name = combinedName || 'Unknown Transaction';
       normalizedTransactions.push(currentTxn);
    }

    // ── Stage 5: Validation ──────────────────────────────────────────────
    const validCount = normalizedTransactions.length;
    const confidence = identifiedCandidateRows > 0 ? validCount / identifiedCandidateRows : 0;
    
    // Count income vs expense for logging
    const incomeCount = normalizedTransactions.filter(t => t.type === 'income').length;
    const expenseCount = normalizedTransactions.filter(t => t.type === 'expense').length;
    const unknownCount = normalizedTransactions.filter(t => t.type === 'unknown').length;
    
    console.log(`[PDF Parser Validation] Valid: ${validCount} | Candidates: ${identifiedCandidateRows} | Total Rows: ${rows.length}`);
    console.log(`[PDF Parser Breakdown] Income: ${incomeCount} | Expense: ${expenseCount} | Unknown: ${unknownCount}`);
    console.log(`[PDF Parser Score] Confidence: ${(confidence * 100).toFixed(1)}%`);
    
    if (confidence < 0.7 && validCount > 0) {
      console.warn(`[PDF Parser Warning] Confidence is low (${(confidence * 100).toFixed(1)}%). Proceeding with lossless import anyway.`);
    } else if (validCount === 0) {
      return res.status(400).json({ 
        error: 'Parsing Error', 
        details: 'NO_DATA',
        message: 'No transactions found. Please check the PDF format.' 
      });
    }

    // ── Stage 6: Categorisation ──────────────────────────────────────────
    const autoCategorize = (desc) => {
      if (!desc) return 'Misc';
      const d = desc.toLowerCase();

      if (d.includes('salary') || d.includes('salaries') || d.includes('payroll') ||
          d.includes('wages') || d.includes('stipend') || d.includes('payslip') ||
          d.includes('employee payment') || d.includes('staff payment')) return 'Salaries';

      if (d.includes('aws') || d.includes('amazon web') || d.includes('gcp') ||
          d.includes('google cloud') || d.includes('azure') || d.includes('github') ||
          d.includes('gitlab') || d.includes('software') || d.includes('subscription') ||
          d.includes('saas') || d.includes('netflix') || d.includes('spotify') ||
          d.includes('zoom') || d.includes('slack') || d.includes('notion') ||
          d.includes('figma') || d.includes('adobe') || d.includes('microsoft') ||
          d.includes('office 365') || d.includes('shopify') || d.includes('hubspot') ||
          d.includes('razorpay') || d.includes('cashfree') || d.includes('stripe') ||
          d.includes('twilio') || d.includes('sendgrid') || d.includes('digitalocean') ||
          d.includes('heroku') || d.includes('hosting') || d.includes('domain') ||
          d.includes('licence') || d.includes('license')) return 'Software';

      if (d.includes('rent') || d.includes('lease') || d.includes('landlord') ||
          d.includes('society maintenance') || d.includes('premises')) return 'Rent';

      if (d.includes('income tax') || d.includes('income-tax') || d.includes('gst') ||
          d.includes('tds') || d.includes('advance tax') || d.includes('tax payment') ||
          d.includes('cess') || d.includes('customs') || d.includes('nsdl') ||
          d.includes('traces') || d.includes('challan') || d.includes('itns') ||
          d.includes('professional tax') || d.includes('pt ')) return 'Tax';

      if (d.includes('consulting') || d.includes('advisory') || d.includes('consultant')) return 'Consulting';

      if (d.includes('professional fee') || d.includes('legal fee') || d.includes('legal fees') ||
          d.includes('lawyer') || d.includes('advocate') || d.includes('audit fee') ||
          d.includes('chartered accountant') || d.includes('retainer') ||
          d.includes('law firm') || d.includes('notary')) return 'Professional Fees';

      if (d.includes('flight') || d.includes('airline') || d.includes(' air ') ||
          d.includes('hotel') || d.includes('uber') || d.includes('ola ') ||
          d.includes('irctc') || d.includes('makemytrip') || d.includes('cleartrip') ||
          d.includes('yatra') || d.includes('booking.com') || d.includes('airbnb') ||
          d.includes('rapido') || d.includes('taxi') || d.includes('cab ') ||
          d.includes('indigo') || d.includes('spicejet') || d.includes('air india') ||
          d.includes('vistara') || d.includes('akasa') || d.includes('travel')) return 'Travel';

      if (d.includes('marketing') || d.includes('advertising') || d.includes(' ads') ||
          d.includes('facebook') || d.includes('google ads') || d.includes('meta ads') ||
          d.includes('linkedin ads') || d.includes('twitter') || d.includes('seo') ||
          d.includes('campaign') || d.includes('branding') || d.includes('promotion') ||
          d.includes('influencer')) return 'Marketing';

      if (d.includes('electricity') || d.includes('electric bill') || d.includes('power bill') ||
          d.includes('water bill') || d.includes('internet') || d.includes('broadband') ||
          d.includes('wifi') || d.includes('airtel') || d.includes('jio') ||
          d.includes('bsnl') || d.includes('vodafone') || d.includes('vi ') ||
          d.includes('telecom') || d.includes('tata sky') || d.includes('dth') ||
          d.includes('msedcl') || d.includes('bses') || d.includes('bescom') ||
          d.includes('tneb') || d.includes('gas bill') || d.includes('cng') ||
          d.includes('utility') || d.includes('recharge')) return 'Utilities';

      if (d.includes('insurance') || d.includes('insur') || d.includes('lic premium') ||
          d.includes('lic ') || d.includes('health cover') || d.includes('policy') ||
          d.includes('icici pru') || d.includes('hdfc life') || d.includes('max life') ||
          d.includes('bajaj allianz') || d.includes('star health') ||
          d.includes('mediclaim') || d.includes('premium payment')) return 'Insurance';

      if (d.includes('training') || d.includes('workshop') || d.includes('seminar') ||
          d.includes('conference') || d.includes('course') || d.includes('certification') ||
          d.includes('udemy') || d.includes('coursera') || d.includes('education')) return 'Training';

      // Capital purchases before consumables — see transactionsController.
      if (d.includes('equipment') || d.includes('machinery') || d.includes('vehicle') ||
          d.includes('furniture') || d.includes('laptop') || d.includes('computer') ||
          d.includes('hardware') || d.includes('capex')) return 'Equipment';

      if (d.includes('stationery') || d.includes('office supply') || d.includes('supplies') ||
          d.includes('printer') || d.includes('cartridge') ||
          d.includes('amazon') || d.includes('flipkart') ||
          d.includes('material')) return 'Office supplies';

      if (d.includes('maintenance') || d.includes('repair') || d.includes('service charge') ||
          d.includes('amc') || d.includes('annual maintenance') || d.includes('housekeeping') ||
          d.includes('cleaning') || d.includes('security')) return 'Maintainance';

      if (d.includes('sales') || d.includes('revenue') || d.includes('invoice') ||
          d.includes('payment received') || d.includes('collection') ||
          d.includes('receivable') || d.includes('refund') || d.includes('cashback') ||
          d.includes('credit from') || d.includes('inward neft') || d.includes('inward rtgs') ||
          d.includes('inward imps') || d.includes('incoming') || d.includes('cr-')) return 'Sales';

      if (d.includes('share') || d.includes('equity') || d.includes('dividend') ||
          d.includes('mutual fund') || d.includes('zerodha') || d.includes('groww') ||
          d.includes('upstox') || d.includes('demat') || d.includes('nse') ||
          d.includes('bse') || d.includes('stock') || d.includes('investment') ||
          d.includes('mf ')) return 'Shares';

      return 'Misc';
    };

    // ── Stage 6.5: Normalize dates to ISO (YYYY-MM-DD) ──────────────────
    // Postgres DATE columns can't parse formats like "13/07/2026" or
    // "13 Jul 2026" under the default datestyle, which caused a 500.
    const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
    const normalizeDate = (raw) => {
      if (!raw) return null;
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      const dmy = s.match(/^(\d{1,2})[\s\/\-.](\d{1,2})[\s\/\-.](\d{2,4})$/);
      if (dmy) {
        const d = dmy[1].padStart(2, '0');
        const m = dmy[2].padStart(2, '0');
        let y = dmy[3];
        if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
        return `${y}-${m}-${d}`;
      }
      // DD MMM YYYY or DD-MMM-YY
      const dmyName = s.match(/^(\d{1,2})[\s\/\-.]([A-Za-z]{3,9})[\s\/\-.](\d{2,4})$/);
      if (dmyName) {
        const d = dmyName[1].padStart(2, '0');
        const m = MONTHS[dmyName[2].toLowerCase().slice(0, 3)];
        if (!m) return null;
        let y = dmyName[3];
        if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
        return `${y}-${String(m).padStart(2, '0')}-${d}`;
      }
      const parsed = new Date(s);
      if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
      return null;
    };

    // ── Stage 7: Atomic Persistence ──────────────────────────────────────
    client = await pool.connect();
    await client.query('BEGIN');

    const accountId = req.body.account_id || null;
    const created = [];
    const skipped = [];
    for (const txn of normalizedTransactions) {
      const isoDate = normalizeDate(txn.date);
      if (!isoDate) { skipped.push({ ...txn, reason: 'invalid_date' }); continue; }
      // Fallback for indeterminate type — 'unknown' isn't useful downstream.
      const safeType = (txn.type === 'income' || txn.type === 'expense') ? txn.type : 'expense';
      const category = autoCategorize(txn.name);
      const result = await client.query(
        `INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [companyId, txn.name, safeType, category, accountId, txn.amount, isoDate, txn.notes]
      );
      created.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ 
      message: 'Successfully imported transactions from PDF',
      count: created.length,
      confidence: confidence.toFixed(2),
      breakdown: { income: incomeCount, expense: expenseCount, unknown: unknownCount },
      detectionMode: hasColumnMap 
        ? (columnMap.isSingleAmountColumn ? 'single-amount-column' : 'debit-credit-columns')
        : 'legacy-fallback'
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rbErr) { console.error('Rollback failed:', rbErr); }
    }

    const message = error.message || 'Unknown error';
    const isStandardized = message.includes('_FAILED');
    
    console.error('[PDF Parser Critical Error]:', {
      message,
      stack: error.stack,
      stage: isStandardized ? message.split(':')[0] : 'CONTROLLER_RUNTIME'
    });

    res.status(isStandardized ? 400 : 500).json({ 
      error: isStandardized ? 'Parsing failed' : 'Internal Server Error',
      details: isStandardized ? message.split(':')[0] : 'UNKNOWN_CRASH',
      message: isStandardized ? message.split(': ')[1] : 'A critical failure occurred during PDF processing.'
    });
  } finally {
    if (client) client.release();
  }
};

module.exports = { uploadPdfStatement };
