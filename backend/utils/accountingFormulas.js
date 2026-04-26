// Standard Accounting Formulas Guide — all formulas as pure functions
// Source: Standard Accounting Formulas Guide (PDF)

const safeDiv = (num, den) => (typeof den === 'number' && den !== 0 ? num / den : 0);
const pct = (val) => Math.round(val * 100) / 100;

// ─── 3. Income Statement ──────────────────────────────────────────────────────

// 3.1  COGS = Opening Inventory + Purchases − Closing Inventory
//      For service/mixed businesses: COGS ≈ direct/variable costs (non-overhead expenses)
//      When inventory data unavailable, purchases = direct expense transactions
const cogs = (openingInventory = 0, purchases = 0, closingInventory = 0) =>
  openingInventory + purchases - closingInventory;

// 3.2  Gross Profit = Revenue − COGS
const grossProfit = (revenue, cogsVal) => revenue - cogsVal;

// 3.3  Gross Profit Margin = (Gross Profit / Sales) × 100
const grossProfitMargin = (gp, revenue) => pct(safeDiv(gp, revenue) * 100);

// 3.4  Operating Profit (EBIT) = Revenue − Operating Expenses (before Interest & Taxes)
//      EBIT = Earnings Before Interest and Taxes
//      From user data: EBIT = Total Revenue − (Total Expenses − Interest Expense − Tax Expense)
//      i.e. add back interest and tax since they are non-operating deductions
const ebit = (revenue, totalExpenses, interestExpense = 0, taxExpense = 0) =>
  revenue - (totalExpenses - interestExpense - taxExpense);

// 3.4b Operating Profit = Gross Profit − Operating Expenses (opex = non-COGS expenses)
const operatingProfit = (gp, opex) => gp - opex;

// 3.5  Net Income = Revenue − All Expenses (Operating, Interest, Taxes)
const netIncome = (revenue, allExpenses) => revenue - allExpenses;

// 3.6  EPS = Net Income / Shares Outstanding
const eps = (ni, shares) => pct(safeDiv(ni, shares));

// ─── 2. Balance Sheet ─────────────────────────────────────────────────────────

// 2.1  Current Assets = Cash + Accounts Receivable + Inventory + Prepaid Expenses
const currentAssetsTotal = (cash, ar, inventory = 0, prepaid = 0) => cash + ar + inventory + prepaid;

// 2.2  Net Fixed Assets = Fixed Assets at Cost − Accumulated Depreciation
const netFixedAssets = (fixedAtCost, accumulatedDepreciation) => fixedAtCost - accumulatedDepreciation;

// 2.3  Total Assets = Current Assets + Non-Current Assets + Net Fixed Assets
const totalAssetsCalc = (currentA, nonCurrent = 0, netFixed = 0) => currentA + nonCurrent + netFixed;

// 2.4  Current Liabilities = Accounts Payable + Accrued Expenses + Current Portion of Long-term Debt
const currentLiabilitiesCalc = (accountsPayable = 0, accruedExpenses = 0, currentDebtPortion = 0) =>
  accountsPayable + accruedExpenses + currentDebtPortion;

// 2.5  Shareholder's Equity = Capital Stock + Retained Earnings
const shareholderEquity = (capitalStock, retainedEarn) => capitalStock + retainedEarn;

// 2.6  Retained Earnings (Ending) = Beginning Balance + Net Income − Dividends Paid
const retainedEarningsCalc = (beginning, ni, dividends = 0) => beginning + ni - dividends;

// 4.1  Working Capital = Current Assets − Current Liabilities
const workingCapital = (currentA, currentL) => currentA - currentL;

// ─── 6. Liquidity Ratios ──────────────────────────────────────────────────────

// 6.1  Current Ratio = Current Assets / Current Liabilities  (healthy: 1.5–3.0)
const currentRatio = (currentA, currentL) => pct(safeDiv(currentA, currentL));

// 6.2  Quick Ratio (Acid-Test) = (Current Assets − Inventory) / Current Liabilities
const quickRatio = (currentA, inventory, currentL) => pct(safeDiv(currentA - inventory, currentL));

// 6.3  Cash Ratio = Cash / Current Liabilities
const cashRatio = (cash, currentL) => pct(safeDiv(cash, currentL));

// ─── 5. Profitability Ratios ──────────────────────────────────────────────────

// 5.1  Net Profit Margin = (Net Income / Revenue) × 100
const netProfitMargin = (ni, revenue) => pct(safeDiv(ni, revenue) * 100);

// 5.2  ROA = (Net Income / Average Total Assets) × 100
const roa = (ni, avgTotalAssets) => pct(safeDiv(ni, avgTotalAssets) * 100);

// 5.3  ROE = (Net Income / Average Shareholder's Equity) × 100
const roe = (ni, avgEquity) => pct(safeDiv(ni, avgEquity) * 100);

// 5.4  ROI = (Net Profit / Cost of Investment) × 100
const roi = (netProfit, costOfInvestment) => pct(safeDiv(netProfit, costOfInvestment) * 100);

// ─── 7. Solvency & Leverage Ratios ───────────────────────────────────────────

// 7.1  Debt-to-Equity = Total Liabilities / Shareholder's Equity
const debtToEquity = (totalLiabilities, equity) => pct(safeDiv(totalLiabilities, equity));

// 7.2  Debt Ratio = Total Liabilities / Total Assets
const debtRatio = (totalLiabilities, totalAssets) => pct(safeDiv(totalLiabilities, totalAssets));

// 7.3  Equity Multiplier = Total Assets / Total Equity
const equityMultiplier = (totalAssets, totalEquity) => pct(safeDiv(totalAssets, totalEquity));

// 7.4  Interest Coverage = EBIT / Interest Expense
const interestCoverage = (ebit, interestExpense) => pct(safeDiv(ebit, interestExpense));

// ─── 8. Efficiency & Turnover Ratios ─────────────────────────────────────────

// 8.1  Inventory Turnover = COGS / Average Inventory
const inventoryTurnover = (cogs, avgInventory) => pct(safeDiv(cogs, avgInventory));

// 8.2  DIO = 365 / Inventory Turnover Ratio
const daysInventoryOutstanding = (invTurnover) => invTurnover > 0 ? pct(365 / invTurnover) : 0;

// 8.3  AR Turnover = Net Sales on Credit / Average Accounts Receivable
const arTurnover = (netSales, avgAR) => pct(safeDiv(netSales, avgAR));

// 8.4  DSO = 365 / AR Turnover Ratio
const daysSalesOutstanding = (arTurn) => arTurn > 0 ? pct(365 / arTurn) : 0;

// 8.5  Total Asset Turnover = Net Sales / Average Total Assets
const totalAssetTurnover = (netSales, avgTotalAssets) => pct(safeDiv(netSales, avgTotalAssets));

// ─── 4. Cash Flow ─────────────────────────────────────────────────────────────

// 4.2  OCF = Net Income + Depreciation + Amortization − ΔCurrentAssets + ΔCurrentLiabilities
const operatingCashFlow = (ni, depreciation = 0, amortization = 0, deltaCA = 0, deltaCL = 0) =>
  ni + depreciation + amortization - deltaCA + deltaCL;

// 4.3  Free Cash Flow = OCF − Capital Expenditures
const freeCashFlow = (ocf, capEx = 0) => ocf - capEx;

// ─── 9. Break-Even Analysis ───────────────────────────────────────────────────

// 9.3  Contribution Margin = Selling Price − Variable Cost
const contributionMargin = (sellingPrice, variableCost) => sellingPrice - variableCost;

// 9.4  Contribution Margin Ratio = (CM / Selling Price) × 100
const contributionMarginRatio = (cm, sellingPrice) => pct(safeDiv(cm, sellingPrice) * 100);

// 9.1  Break-Even Units = Fixed Costs / Contribution Margin
const breakEvenUnits = (fixedCosts, cm) => pct(safeDiv(fixedCosts, cm));

// 9.2  Break-Even Revenue = Fixed Costs / Contribution Margin Ratio
const breakEvenRevenue = (fixedCosts, cmRatio) => pct(safeDiv(fixedCosts, cmRatio / 100));

// ─── 10. DuPont Analysis ─────────────────────────────────────────────────────

// ROE = Net Profit Margin × Asset Turnover × Equity Multiplier
const dupontROE = (netProfMarginPct, assetTurnover, equityMult) =>
  pct((netProfMarginPct / 100) * assetTurnover * equityMult * 100);

// ─── Convenience: compute all standard ratios from core financials ────────────
/**
 * computeAllRatios — derives all key accounting ratios from real user data inputs.
 *
 * @param {object} inputs
 *   revenue          - Total income transactions (all-time)
 *   expenses         - Total expense transactions (all-time)
 *   cash             - Cash in bank (account balances + net profit)
 *   receivables      - Pending/overdue receivable invoices
 *   payables         - Pending/overdue payable invoices (= Accounts Payable)
 *   inventory        - Inventory value (0 for service businesses)
 *   interestExpense  - Expense transactions categorised as 'interest' or 'bank charges'
 *   taxExpense       - Expense transactions categorised as 'tax' or 'GST' or 'TDS'
 *   cogsAmount       - Direct cost transactions (purchases, raw materials, direct labour)
 *                      Falls back to expenses * 0.6 (rough COGS proxy) if not provided
 */
const computeAllRatios = ({
  revenue = 0,
  expenses = 0,
  cash = 0,
  receivables = 0,
  payables = 0,
  inventory = 0,
  interestExpense = 0,
  taxExpense = 0,
  cogsAmount = null,         // null = auto-derive
}) => {
  // ── Core income statement values ──────────────────────────────────────────
  const ni = netIncome(revenue, expenses);

  // COGS: use provided cogsAmount, else proxy as 60% of expenses (for mixed businesses)
  // Formula 3.1: COGS = Opening Inventory + Purchases − Closing Inventory
  // In a transaction-based system: cogsAmount = sum of direct/COGS-category expenses
  const cogsVal = cogsAmount !== null ? cogsAmount : expenses * 0.6;

  const gp = grossProfit(revenue, cogsVal);
  const gpMargin = grossProfitMargin(gp, revenue);

  // EBIT = Earnings Before Interest and Taxes
  // Formula 3.4: EBIT = Revenue − Operating Expenses (excl. interest & taxes)
  // From user data: EBIT = Total Revenue − (Total Expenses − interestExpense − taxExpense)
  const ebitVal = ebit(revenue, expenses, interestExpense, taxExpense);

  // Net Profit Margin uses actual net income (after all deductions)
  const npmVal = netProfitMargin(ni, revenue);

  // ── Balance Sheet ─────────────────────────────────────────────────────────
  const currentA = currentAssetsTotal(cash, receivables, inventory);
  // Current Liabilities = Accounts Payable (payables) + accrued expenses (proxy: monthly expenses/12)
  // Formula 2.4: Current Liabilities = AP + Accrued Expenses + Current Portion of LT Debt
  const accruedExpenses = expenses > 0 ? expenses / 12 : 0;  // monthly accrual proxy
  const currentL = currentLiabilitiesCalc(payables, accruedExpenses, 0);
  const totalAssets = totalAssetsCalc(currentA);

  // Equity proxy: when no balance sheet capital data, equity ≈ retained earnings = net income
  // In a real balance sheet: Equity = Total Assets − Total Liabilities
  const totalLiabilities = Math.max(0, currentL);
  const equity = Math.max(1, totalAssets - totalLiabilities);

  // ── Derived ratios ────────────────────────────────────────────────────────
  const arTurnoverVal = arTurnover(revenue, Math.max(1, receivables));
  const dupontNPM = pct(safeDiv(ni, revenue) * 100);          // net profit margin %
  const assetTurn = totalAssetTurnover(revenue, Math.max(1, totalAssets));
  const eqMult    = equityMultiplier(totalAssets, equity);
  const dupontVal = dupontROE(dupontNPM, assetTurn, eqMult);

  return {
    // ── Income Statement ──────────────────────────────────────────────────
    cogs: cogsVal,                                              // 3.1
    grossProfit: gp,                                            // 3.2
    grossProfitMargin: gpMargin,                                // 3.3
    ebit: ebitVal,                                              // 3.4 EBIT (Earnings Before Interest & Taxes)
    netIncome: ni,                                              // 3.5
    netProfitMargin: npmVal,                                    // 5.1
    // ── Balance Sheet ────────────────────────────────────────────────────
    workingCapital: workingCapital(currentA, currentL),         // 4.1
    currentAssets: currentA,
    currentLiabilities: currentL,
    // ── Liquidity Ratios ─────────────────────────────────────────────────
    currentRatio: currentRatio(currentA, currentL),             // 6.1
    quickRatio: quickRatio(currentA, inventory, currentL),      // 6.2
    cashRatio: cashRatio(cash, currentL),                       // 6.3
    // ── Profitability Ratios ─────────────────────────────────────────────
    roa: roa(ni, totalAssets),                                  // 5.2
    roe: roe(ni, equity),                                       // 5.3
    // ── Leverage / Solvency ───────────────────────────────────────────────
    debtToEquity: debtToEquity(totalLiabilities, equity),       // 7.1
    debtRatio: debtRatio(totalLiabilities, totalAssets),        // 7.2
    equityMultiplier: eqMult,                                   // 7.3
    interestCoverage: interestCoverage(ebitVal, Math.max(1, interestExpense)), // 7.4
    // ── Efficiency / Turnover ─────────────────────────────────────────────
    arTurnover: arTurnoverVal,                                  // 8.3
    daysSalesOutstanding: daysSalesOutstanding(arTurnoverVal),  // 8.4
    totalAssetTurnover: assetTurn,                              // 8.5
    // ── Cash Flow ────────────────────────────────────────────────────────
    operatingCashFlow: operatingCashFlow(ni),                   // 4.2
    freeCashFlow: freeCashFlow(ni),                             // 4.3
    // ── DuPont Analysis ──────────────────────────────────────────────────
    dupontROE: dupontVal,                                       // 10. ROE = NPM × Asset Turnover × Equity Multiplier
  };
};

module.exports = {
  safeDiv, pct,
  // Income Statement
  cogs, grossProfit, grossProfitMargin, ebit, operatingProfit, netIncome, netProfitMargin, eps,
  // Balance Sheet
  currentAssetsTotal, currentLiabilitiesCalc, netFixedAssets, totalAssetsCalc,
  shareholderEquity, retainedEarningsCalc, workingCapital,
  // Liquidity
  currentRatio, quickRatio, cashRatio,
  // Profitability
  roa, roe, roi,
  // Leverage
  debtToEquity, debtRatio, equityMultiplier, interestCoverage,
  // Efficiency
  inventoryTurnover, daysInventoryOutstanding, arTurnover, daysSalesOutstanding, totalAssetTurnover,
  // Cash Flow
  operatingCashFlow, freeCashFlow,
  // Break-Even
  contributionMargin, contributionMarginRatio, breakEvenUnits, breakEvenRevenue,
  // DuPont
  dupontROE,
  // Convenience
  computeAllRatios,
};
