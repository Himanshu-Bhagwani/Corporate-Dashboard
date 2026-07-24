/**
 * Categories that move cash but are NOT operating profit-and-loss items.
 *
 * Applied symmetrically: a financing category is financing whichever direction
 * the money flows. Excluding investor money from revenue while leaving dividend
 * and distribution payouts inside expenses is what made margins read far worse
 * than reality.
 *
 * Keep in sync with backend/utils/nonOperatingCategories.js.
 */

export const FINANCING_CATEGORIES = [
  'Capital Infusion',
  'Capital',
  'Funding',
  'Investments',
  'Shares',          // dividends paid, profit distributions, ROI payouts
  'Distributions',
  'Loan Repayment',  // principal only — 'Loan Interest' IS an operating cost
];

// CapEx is capitalised and depreciated, and FCF is defined as OCF − CapEx, so
// it must not sit inside operating expenses as well.
export const CAPEX_CATEGORIES = ['Equipment'];

export const NON_OPERATING_INCOME = new Set(FINANCING_CATEGORIES);
export const NON_OPERATING_EXPENSE = new Set([...FINANCING_CATEGORIES, ...CAPEX_CATEGORIES]);
