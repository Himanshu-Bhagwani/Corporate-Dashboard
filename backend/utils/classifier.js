/**
 * Classifies a transaction row as 'income' or 'expense'.
 * Priority: Debit/Credit columns > Amount sign > Keywords.
 */
function classifyTransaction(row, colMap) {
  if (!Array.isArray(row) || !colMap) return 'expense';

  const { amountIndex, debitIndex, creditIndex, descriptionIndex } = colMap;
  const keywords = {
    income: ['credit', 'cr', 'deposit', 'received', 'salary', 'refund', 'interest', 'transfer from', 'paid in', 'receipt'],
    expense: ['debit', 'dr', 'withdrawal', 'paid', 'purchase', 'payment to', 'transfer to', 'fee', 'charge', 'paid out']
  };

  const cleanVal = (val) => {
    if (!val) return 0;
    const s = val.toString().trim().replace(/[₹$€,]/g, '');
    return parseFloat(s) || 0;
  };

  try {
    // 1. Explicit Debit/Credit Column Check
    if (debitIndex !== -1 && creditIndex !== -1 && debitIndex < row.length && creditIndex < row.length) {
      const debit = cleanVal(row[debitIndex]);
      const credit = cleanVal(row[creditIndex]);

      if (credit > 0 && debit === 0) return 'income';
      if (debit > 0 && credit === 0) return 'expense';
      
      // If both somehow have values
      if (credit > 0 && debit > 0) {
        if (credit > debit) return 'income';
        return 'expense';
      }
    }

    // 2. Single Amount Column Check
    if (amountIndex !== -1 && amountIndex < row.length) {
      const val = row[amountIndex] || '';
      const num = parseFloat(val.toString().replace(/[^\d.-]/g, '')) || 0;
      
      if (num < 0) return 'expense';
      if (num > 0) {
        const desc = (row[descriptionIndex] || '').toString().toLowerCase();
        if (keywords.income.some(k => desc.includes(k))) return 'income';
        if (keywords.expense.some(k => desc.includes(k))) return 'expense';
        return 'unknown';
      }
    }

    // 3. Keyword Fallback
    const desc = (row[descriptionIndex] || '').toString().toLowerCase();
    if (keywords.income.some(k => desc.includes(k))) return 'income';
    if (keywords.expense.some(k => desc.includes(k))) return 'expense';
  } catch (err) {
    console.error('[classifier] Non-critical Error:', err);
  }
  
  return 'unknown'; // Safe lossless fallback
}

module.exports = { classifyTransaction };
