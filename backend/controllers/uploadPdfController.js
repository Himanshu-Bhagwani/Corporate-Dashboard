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
    let identifiedCandidateRows = 0;
    let lastKnownDate = null;

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

      if (hasAmount) {
        // Must have a date
        if (!lastKnownDate) continue;

        identifiedCandidateRows++;

        // ── Column-Aware Classification ──
        let type = 'unknown';
        let absoluteAmount = 0;

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

        // Date formatting — keep raw, never inject new Date()
        let formattedDate = lastKnownDate;

        const safeName = description.trim() ? description : 'Unknown Transaction';

        const txn = {
          date: formattedDate,
          name: safeName,
          amount: absoluteAmount,
          type: type,
          notes: hasColumnMap 
            ? 'Imported via Column-Aware Extraction' 
            : 'Imported via Legacy Heuristic (no header detected)'
        };
        
        if (currentTxn) normalizedTransactions.push(currentTxn);
        currentTxn = txn;

      } else if (!hasAmount && currentTxn && description) {
        // CONTINUATION row: Append description text to the pending transaction
        // (Even if rowDate is true, without an amount it cannot be a new transaction)
        currentTxn.name = currentTxn.name + ' ' + description;
      }
    }
    
    // Finalize the last pending transaction
    if (currentTxn) normalizedTransactions.push(currentTxn);

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

    // ── Stage 6: Atomic Persistence ──────────────────────────────────────
    client = await pool.connect();
    await client.query('BEGIN');
    
    const autoCategorize = (desc) => {
      if (!desc) return 'Misc';
      const d = desc.toLowerCase();
      if (d.includes('salary') || d.includes('payroll')) return 'Salaries';
      if (d.includes('aws') || d.includes('gcp') || d.includes('azure') || d.includes('github') || d.includes('software') || d.includes('subscription')) return 'Software';
      if (d.includes('rent') || d.includes('lease')) return 'Rent';
      if (d.includes('tax') || d.includes('gst') || d.includes('tds') || d.includes('income tax')) return 'Tax';
      if (d.includes('consulting') || d.includes('advisory') || d.includes('fee')) return 'Consulting';
      if (d.includes('flight') || d.includes('hotel') || d.includes('uber') || d.includes('ola') || d.includes('irctc') || d.includes('makemytrip')) return 'Travel';
      if (d.includes('marketing') || d.includes('ads') || d.includes('facebook') || d.includes('google') || d.includes('meta')) return 'Marketing';
      if (d.includes('electricity') || d.includes('water') || d.includes('internet') || d.includes('wifi') || d.includes('airtel') || d.includes('jio')) return 'Utilities';
      if (d.includes('insurance')) return 'Insurance';
      if (d.includes('maintenance') || d.includes('repair')) return 'Maintainance';
      if (d.includes('sales') || d.includes('revenue') || d.includes('invoice')) return 'Sales';
      return 'Misc';
    };

    const created = [];
    for (const txn of normalizedTransactions) {
      const category = autoCategorize(txn.name);
      const result = await client.query(
        `INSERT INTO transactions (company_id, name, type, category, amount, date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [companyId, txn.name, txn.type, category, txn.amount, txn.date, txn.notes]
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
