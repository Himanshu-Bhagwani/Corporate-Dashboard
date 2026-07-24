/**
 * Shared health score computation utility.
 * Used by HealthScoreCard (dashboard) and LoanOffersView.
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Timely EMI payments = up to +6 bonus; missed/overdue EMIs = penalty capped at −6.
// Loans not yet in repayment don't affect the score at all.
const emiPaymentBonus = (loans = []) => {
  let paid = 0, overdue = 0, active = 0;
  for (const loan of loans) {
    if (!['DISBURSED', 'REPAYMENT_ACTIVE', 'CLOSED'].includes(loan.status)) continue;
    paid   += parseInt(loan.paid_emis)  || 0;
    active += parseInt(loan.total_emis) || 0;
  }
  // The list endpoint doesn't break out overdue count per-loan; use next-due date
  // being in the past as a signal that at least one EMI slipped.
  for (const loan of loans) {
    if (loan.next_emi_date && new Date(loan.next_emi_date) < new Date()) overdue += 1;
  }
  if (active === 0) return 0;
  const paidRatio = Math.min(paid / active, 1);
  const bonus = Math.round(paidRatio * 6) - Math.min(overdue * 2, 6);
  return Math.max(-6, Math.min(6, bonus));
};

export const computeHealthScore = (dashboardSummary, transactions = [], loans = []) => {
  const s = dashboardSummary || {};

  // Revenue Consistency — Coefficient of Variation
  const monthlyRev = {};
  (transactions || []).forEach(t => {
    if (t.type !== 'income') return;
    const key = (t.date || '').slice(0, 7);
    if (!key) return;
    monthlyRev[key] = (monthlyRev[key] || 0) + parseFloat(t.amount || 0);
  });
  const revVals = Object.values(monthlyRev);
  let revCV = 30;
  if (revVals.length >= 2) {
    const mean = revVals.reduce((a, v) => a + v, 0) / revVals.length;
    if (mean > 0) {
      const variance = revVals.reduce((a, v) => a + (v - mean) ** 2, 0) / revVals.length;
      revCV = parseFloat(((Math.sqrt(variance) / mean) * 100).toFixed(1));
    }
  }

  // Piotroski F-Score (simplified, 9-point)
  // Use annualNetProfit (trailing-12M) alongside OCF (also trailing-12M) so both are the same period.
  // Fall back to netProfit (all-time) for older API responses that lack annualNetProfit.
  const np  = parseFloat(s.annualNetProfit ?? s.netProfit) || 0;
  const ocf = parseFloat(s.operatingCashFlow) || 0;
  // Real balance-sheet figures from the Chart of Accounts win over the backend's
  // equity proxy, so this score agrees with the dashboard metric cards.
  const coaEquity      = parseFloat(s.coaEquity) || 0;
  const coaLiabilities = parseFloat(s.coaTotalLiabilities) || 0;
  const roe = coaEquity > 0
    ? (np / coaEquity) * 100
    : ((s.roe !== null && s.roe !== undefined) ? parseFloat(s.roe) : null);
  const dte = (coaEquity > 0 && coaLiabilities > 0)
    ? coaLiabilities / coaEquity
    : parseFloat(s.debtToEquity) || 0;
  const cr  = (s.currentRatio !== null && s.currentRatio !== undefined) ? parseFloat(s.currentRatio) : null;
  const npm = parseFloat(s.netProfitMargin) || 0;
  const ic  = (s.interestCoverage !== null && s.interestCoverage !== undefined) ? parseFloat(s.interestCoverage) : null;
  const fcf = parseFloat(s.freeCashFlow) || 0;
  const roa = parseFloat(s.roa) || 0;

  const piotroski = [np > 0, ocf > 0, roa > 0, ocf > np, dte < 1, cr === null || cr > 1.2, npm > 5, ic === null || ic > 3, fcf > 0]
    .filter(Boolean).length;

  const scores = [
    // ROE — null means equity proxy unreliable (all data within 12M, no opening capital) → neutral
    roe === null ? 5 : roe >= 15 ? 10 : roe >= 8 ? 6 : roe >= 0 ? 3 : 0,
    // Net Profit Margin
    npm >= 20 ? 10 : npm >= 10 ? 7 : npm >= 5 ? 4 : npm >= 0 ? 2 : 0,
    // Revenue Consistency
    revCV <= 20 ? 10 : revCV <= 35 ? 7 : revCV <= 50 ? 4 : 1,
    // Debt-to-Equity
    dte <= 0.5 ? 10 : dte <= 1 ? 7 : dte <= 2 ? 3 : 0,
    // Interest Coverage (null = no interest-bearing debt → good)
    ic === null ? 8 : ic >= 5 ? 10 : ic >= 3 ? 7 : ic >= 1.5 ? 3 : 0,
    // Current Ratio — null = no payables (excellent); high CR = excess idle cash
    cr === null ? 10 : (cr >= 1.5 && cr <= 3) ? 10 : ((cr >= 1.2 && cr < 1.5) || (cr > 3 && cr <= 5)) ? 7 : ((cr >= 1 && cr < 1.2) || cr > 5) ? 4 : cr >= 0.8 ? 2 : 0,
    // OCF Quality — when OCF equals NP exactly, the proxy has no adjustments; give neutral 5
    (() => { if (np > 0 && ocf === np) return 5; const v = np <= 0 ? (ocf > 0 ? 120 : 0) : (ocf / np) * 100; return v >= 100 ? 10 : v >= 60 ? 6 : v >= 0 ? 3 : 0; })(),
    // DSO
    (() => { const dso = parseFloat(s.daysSalesOutstanding) || 0; return dso <= 30 ? 10 : dso <= 45 ? 7 : dso <= 60 ? 4 : 0; })(),
    // FCF
    fcf > 0 ? 10 : 0,
    // Piotroski
    piotroski >= 7 ? 10 : piotroski >= 5 ? 6 : piotroski >= 3 ? 3 : 0,
  ];

  const base = Math.round(scores.reduce((a, v) => a + v, 0));
  return clamp(base + emiPaymentBonus(loans), 0, 100);
};

export const getScoreLabel = (score) =>
  score >= 80 ? 'Strong' : score >= 60 ? 'Decent' : score >= 40 ? 'Weak Structure' : 'Risky / Unstable';

export const getScoreColor = (score) =>
  score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
