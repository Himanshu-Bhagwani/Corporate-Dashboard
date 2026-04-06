/**
 * Column Detector — Identifies Debit/Credit/Balance columns from PDF header rows.
 * Uses x-coordinate proximity to classify numeric values into the correct column.
 * 
 * Supports:
 *   - Separate Debit/Credit columns (standard Indian bank format)
 *   - Single "Amount" column with +/- signs
 *   - Common aliases across Indian and international banks
 */

// ── Column header aliases ────────────────────────────────────────────────────
// These are matched as EXACT cell content (after lowercasing/trimming),
// OR the cell text must START or END with the alias to avoid false positives
// like "Credit Card" matching "credit".

const DEBIT_ALIASES = [
  'debit', 'dr', 'dr.', 'withdrawal', 'withdrawals',
  'debit(₹)', 'debit (₹)', 'debit amount', 'debit(rs)', 'debit (rs)',
  'debit(rs.)', 'debit (rs.)', 'payments', 'paid out', 'expenditure',
  'debit(inr)', 'debit (inr)'
];

const CREDIT_ALIASES = [
  'credit', 'cr', 'cr.', 'deposit', 'deposits',
  'credit(₹)', 'credit (₹)', 'credit amount', 'credit(rs)', 'credit(rs.)',
  'credit (rs)', 'credit (rs.)', 'receipts', 'paid in', 'received',
  'credit(inr)', 'credit (inr)'
];

const BALANCE_ALIASES = [
  'balance', 'bal', 'bal.', 'balance(₹)', 'balance (₹)',
  'closing balance', 'running balance', 'balance(rs)', 'balance (rs)',
  'balance(rs.)', 'balance (rs.)', 'running bal',
  'balance(inr)', 'balance (inr)'
];

// Single-column formats where debit & credit share one "Amount" column
const AMOUNT_ALIASES = [
  'amount', 'amount(₹)', 'amount (₹)', 'amount(rs)', 'amount (rs)',
  'transaction amount', 'txn amount', 'txn amt',
  'amount(inr)', 'amount (inr)'
];

// ── Words that disqualify a cell as a column header ──────────────────────────
// e.g., "Credit Card", "Debit Card", "Credit Account No" should NOT match
const DISQUALIFY_SUFFIXES = [
  'card', 'account', 'number', 'no', 'no.', 'type', 'name', 'holder',
  'limit', 'score', 'rating', 'line', 'facility'
];

/**
 * Strict alias matching — the cell text must either:
 * 1. Exactly equal one of the aliases, OR
 * 2. Start with an alias (e.g., "Debit (₹)" starts with "debit"), AND
 *    not be followed by a disqualifying word (e.g., "Credit Card")
 */
function matchesAliasStrict(text, aliases) {
  const t = text.toLowerCase().trim();
  if (!t) return false;

  // Exact match first
  if (aliases.includes(t)) return true;

  // Check if cell starts with an alias and doesn't have a disqualifying suffix
  for (const alias of aliases) {
    if (t.startsWith(alias)) {
      const remainder = t.slice(alias.length).trim();
      // Empty remainder = exact or close match (e.g., "debit" or "debit ")
      if (!remainder) return true;
      // Check if remainder starts with a valid continuation: (, [, ₹, rs, etc.
      if (/^[(\[₹$€]/.test(remainder)) return true;
      // Disqualify if remainder is a known non-header word
      const firstWord = remainder.split(/\s+/)[0].replace(/[^a-z]/g, '');
      if (DISQUALIFY_SUFFIXES.includes(firstWord)) return false;
      // If remainder is short (like "s" for "credits"), accept it
      if (remainder.length <= 2) return true;
    }
  }

  return false;
}

/**
 * Scans coordinate-aware rows to detect the header row and extract column x-positions.
 *
 * @param {Array} rows - Array of rows from groupIntoRowsWithCoords.
 *   Each row is Array<{ text: string, x: number }>.
 * @returns {Object|null} Column map with x-positions, or null if no header detected.
 */
function detectColumns(rows) {
  const scanLimit = Math.min(rows.length, 40);

  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 3) continue;

    let debitX = null;
    let creditX = null;
    let balanceX = null;
    let amountX = null;

    // Log each candidate row's content for debugging
    const rowContent = row.map(c => `"${(c.text||'').trim()}"@x${c.x.toFixed(0)}`).join(', ');

    for (const cell of row) {
      const text = (cell.text || '').trim();
      if (!text) continue;

      if (debitX === null && matchesAliasStrict(text, DEBIT_ALIASES)) {
        debitX = cell.x;
      } else if (creditX === null && matchesAliasStrict(text, CREDIT_ALIASES)) {
        creditX = cell.x;
      } else if (balanceX === null && matchesAliasStrict(text, BALANCE_ALIASES)) {
        balanceX = cell.x;
      } else if (amountX === null && matchesAliasStrict(text, AMOUNT_ALIASES)) {
        amountX = cell.x;
      }
    }

    // ── Case 1: Standard format — require ALL THREE: Debit + Credit + Balance ──
    // This prevents false positives from stray mentions like "Credit Card" in metadata
    if (debitX !== null && creditX !== null && balanceX !== null) {
      // Sanity check: Debit and Credit should be to the RIGHT of the description area
      // and Credit should be AFTER Debit (standard table layout)
      // If Credit x-position is way before Debit, it's a false positive
      if (creditX < debitX - 50) {
        console.log(`[ColumnDetector] Row ${i} rejected: CreditX(${creditX.toFixed(1)}) is before DebitX(${debitX.toFixed(1)}) — likely false positive.`);
        console.log(`[ColumnDetector] Row ${i} content: [${rowContent}]`);
        continue;
      }

      console.log(
        `[ColumnDetector] Header found at row ${i}. ` +
        `DebitX=${debitX.toFixed(1)}, CreditX=${creditX.toFixed(1)}, BalanceX=${balanceX.toFixed(1)}`
      );
      console.log(`[ColumnDetector] Row ${i} content: [${rowContent}]`);
      return {
        debitX,
        creditX,
        balanceX,
        amountX: null,
        tolerance: 40,
        isSingleAmountColumn: false,
        headerRowIndex: i
      };
    }

    // ── Case 1b: Debit + Credit found but no Balance — still accept if positions make sense ──
    if (debitX !== null && creditX !== null && balanceX === null) {
      if (creditX > debitX) {
        console.log(
          `[ColumnDetector] Header found at row ${i} (no Balance column). ` +
          `DebitX=${debitX.toFixed(1)}, CreditX=${creditX.toFixed(1)}`
        );
        console.log(`[ColumnDetector] Row ${i} content: [${rowContent}]`);
        return {
          debitX,
          creditX,
          balanceX: null,
          amountX: null,
          tolerance: 40,
          isSingleAmountColumn: false,
          headerRowIndex: i
        };
      }
    }

    // ── Case 2: Single "Amount" column ──
    if (amountX !== null && (balanceX !== null || (debitX === null && creditX === null))) {
      console.log(
        `[ColumnDetector] Single-column format detected at row ${i}. ` +
        `AmountX=${amountX.toFixed(1)}, BalanceX=${balanceX !== null ? balanceX.toFixed(1) : 'N/A'}`
      );
      console.log(`[ColumnDetector] Row ${i} content: [${rowContent}]`);
      return {
        debitX: null,
        creditX: null,
        balanceX,
        amountX,
        tolerance: 40,
        isSingleAmountColumn: true,
        headerRowIndex: i
      };
    }
  }

  console.warn('[ColumnDetector] No header row detected in first 40 rows.');
  return null;
}

/**
 * Classifies a numeric value's x-position into a column type.
 *
 * @param {number} x - The x-coordinate of the numeric value.
 * @param {Object} columnMap - The column map from detectColumns().
 * @returns {'debit'|'credit'|'balance'|'amount'|'unknown'}
 */
function classifyByColumn(x, columnMap) {
  if (!columnMap || x === undefined || x === null) return 'unknown';

  const { tolerance } = columnMap;

  if (columnMap.isSingleAmountColumn) {
    if (columnMap.amountX !== null && Math.abs(x - columnMap.amountX) <= tolerance) return 'amount';
    if (columnMap.balanceX !== null && Math.abs(x - columnMap.balanceX) <= tolerance) return 'balance';
    return 'unknown';
  }

  // Multi-column: find the closest matching column header
  const candidates = [];
  if (columnMap.debitX !== null) candidates.push({ type: 'debit', dist: Math.abs(x - columnMap.debitX) });
  if (columnMap.creditX !== null) candidates.push({ type: 'credit', dist: Math.abs(x - columnMap.creditX) });
  if (columnMap.balanceX !== null) candidates.push({ type: 'balance', dist: Math.abs(x - columnMap.balanceX) });

  if (candidates.length === 0) return 'unknown';

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0].dist <= tolerance ? candidates[0].type : 'unknown';
}

/**
 * Given column-classified numeric cells for a row, determines the transaction type and amount.
 *
 * @param {Array<{value: number, x: number, column: string}>} classifiedValues
 * @param {Object} columnMap - from detectColumns()
 * @returns {{ type: 'income'|'expense'|'unknown', amount: number }}
 */
function resolveTransactionType(classifiedValues, columnMap) {
  if (!classifiedValues || classifiedValues.length === 0) {
    return { type: 'unknown', amount: 0 };
  }

  // ── Single "Amount" column: rely on sign ──
  if (columnMap && columnMap.isSingleAmountColumn) {
    const amountCell = classifiedValues.find(v => v.column === 'amount');
    if (amountCell) {
      return {
        type: amountCell.value >= 0 ? 'income' : 'expense',
        amount: Math.abs(amountCell.value)
      };
    }
    const nonBalance = classifiedValues.filter(v => v.column !== 'balance');
    if (nonBalance.length > 0) {
      return {
        type: nonBalance[0].value >= 0 ? 'income' : 'expense',
        amount: Math.abs(nonBalance[0].value)
      };
    }
  }

  // ── Separate Debit/Credit columns ──
  const debitCell = classifiedValues.find(v => v.column === 'debit');
  const creditCell = classifiedValues.find(v => v.column === 'credit');

  if (debitCell && !creditCell) {
    return { type: 'expense', amount: Math.abs(debitCell.value) };
  }
  if (creditCell && !debitCell) {
    return { type: 'income', amount: Math.abs(creditCell.value) };
  }
  if (debitCell && creditCell) {
    // Both present — pick the non-zero one
    if (Math.abs(debitCell.value) > 0 && Math.abs(creditCell.value) === 0) {
      return { type: 'expense', amount: Math.abs(debitCell.value) };
    }
    if (Math.abs(creditCell.value) > 0 && Math.abs(debitCell.value) === 0) {
      return { type: 'income', amount: Math.abs(creditCell.value) };
    }
    // Both non-zero (unusual) — use larger
    return Math.abs(debitCell.value) >= Math.abs(creditCell.value)
      ? { type: 'expense', amount: Math.abs(debitCell.value) }
      : { type: 'income', amount: Math.abs(creditCell.value) };
  }

  // ── Fallback: no debit/credit found — use first non-balance value ──
  const nonBalance = classifiedValues.filter(v => v.column !== 'balance');
  if (nonBalance.length > 0) {
    return { type: 'unknown', amount: Math.abs(nonBalance[0].value) };
  }

  return { type: 'unknown', amount: 0 };
}

module.exports = { detectColumns, classifyByColumn, resolveTransactionType };
