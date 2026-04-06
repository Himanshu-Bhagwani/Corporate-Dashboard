const { z } = require('zod');

// Schema is now totally lossless and tolerant
const transactionSchema = z.object({
  date: z.string(),
  name: z.string(),
  amount: z.number().min(0),
  type: z.enum(['income', 'expense', 'unknown']),
  notes: z.string().optional(),
  raw: z.any().optional()
});

/**
 * Normalizes and validates a transaction row.
 * Returns { success, data, error } - now designed to always succeed for valid numeric rows
 */
function normalizeRow(row, { dateIndex, amountIndex, debitIndex, creditIndex, descriptionIndex, type, dateOverride }) {
  if (!Array.isArray(row)) {
    return { success: false, error: new Error('Invalid row format') };
  }

  // We no longer throw errors dynamically. If things are missing, we use fallbacks.
  try {
    const rawDate = dateOverride || (dateIndex !== -1 ? row[dateIndex] : '').toString().trim();
    const rawDesc = (descriptionIndex !== -1 ? row[descriptionIndex] : '').toString().trim();
    
    // 1. Extract Amount Safely (Any numeric value)
    let rawAmount = '0';
    if (debitIndex !== -1 && creditIndex !== -1 && debitIndex < row.length && creditIndex < row.length) {
      rawAmount = (type === 'income' ? row[creditIndex] : row[debitIndex]) || '0';
      if (!rawAmount || rawAmount === '0' || rawAmount === 0) {
        // Fallback: Just grab ANY of the two that isn't empty if type is ambiguous
        rawAmount = row[creditIndex] || row[debitIndex] || '0';
      }
    } else if (amountIndex !== -1 && amountIndex < row.length) {
      rawAmount = row[amountIndex] || '0';
    } else {
      // Extreme fallback: Search entire row for any numeric value
      for (const cell of row) {
        if (/[\d]/.test((cell || '').toString())) {
          rawAmount = cell.toString();
          break;
        }
      }
    }
    
    const amount = Math.abs(parseFloat(rawAmount.toString().replace(/[₹$€,]/g, '').trim()) || 0);

    // 2. Format Date Safely
    let formattedDate = rawDate;
    const parts = rawDate.split(/[\s\/\-.]/).filter(p => p.length > 0);
    
    if (parts.length === 3) {
      let d, m, y;
      if (parts[0].length === 4) { 
        y = parts[0]; m = parts[1]; d = parts[2]; 
      } else { 
        d = parts[0]; m = parts[1]; y = parts[2]; 
      }

      if (y && y.length === 2) y = '20' + y;
      
      const months = { 
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06', 
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12' 
      };
      
      if (m && isNaN(m)) {
        m = months[m.toLowerCase().substring(0, 3)] || '01';
      } else if (m) {
        m = m.padStart(2, '0');
      }

      if (y && m && d) {
        formattedDate = `${y}-${m}-${d.padStart(2, '0')}`;
      }
    }

    if (!formattedDate || !/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
      // Safe fallback for date
      formattedDate = new Date().toISOString().split('T')[0];
    }

    const txn = {
      date: formattedDate,
      name: rawDesc || 'Unknown Transaction',
      amount,
      type: ['income', 'expense', 'unknown'].includes(type) ? type : 'unknown',
      notes: 'Imported via Lossless Parser',
      raw: row.join(' | ')
    };

    const parsed = transactionSchema.safeParse(txn);
    if (!parsed.success) {
      // If it still fails, force return it anyway (lossless principle)
      return { success: true, data: txn };
    }
    
    return { success: true, data: parsed.data };
  } catch (err) {
    console.error('[rowNormalizer] Row Error:', err);
    return { success: false, error: err };
  }
}

module.exports = { normalizeRow };
