/**
 * Categories that move cash but are NOT operating profit-and-loss items.
 *
 * These must be applied SYMMETRICALLY. The previous lists excluded financing
 * *inflows* from revenue while leaving financing *outflows* in expenses, which
 * made margins read far worse than reality: the importer files dividends,
 * profit distributions and return-of-investment payouts under "Shares", and
 * that name was missing from the expense list entirely.
 *
 * Keep in sync with frontend/src/utils/nonOperatingCategories.js.
 */

// Investor money in, and money paid back out to investors/lenders. Neither is
// earned or consumed by trading, so both stay out of margin and growth maths.
const FINANCING_CATEGORIES = [
  'Capital Infusion',
  'Capital',
  'Funding',
  'Investments',
  'Shares',          // dividends paid, profit distributions, ROI payouts
  'Distributions',
  'Loan Repayment',  // principal only — 'Loan Interest' IS an operating cost
];

// Capital expenditure: buying an asset, not consuming a service. Under the
// standard formulas CapEx is capitalised and depreciated, and Free Cash Flow is
// defined as OCF − CapEx, so it must not also sit inside operating expenses.
const CAPEX_CATEGORIES = [
  'Equipment',
];

// Everything kept out of the operating P&L, per side.
const NON_OPERATING_INCOME = [...FINANCING_CATEGORIES];
const NON_OPERATING_EXPENSE = [...FINANCING_CATEGORIES, ...CAPEX_CATEGORIES];

module.exports = {
  FINANCING_CATEGORIES,
  CAPEX_CATEGORIES,
  NON_OPERATING_INCOME,
  NON_OPERATING_EXPENSE,
};
