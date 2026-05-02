/**
 * Shared health score computation utility.
 * Used by HealthScoreCard (dashboard) and LoanOffersView.
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const computeHealthScore = (dashboardSummary, transactions = []) => {
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
  const np  = parseFloat(s.netProfit) || 0;
  const ocf = parseFloat(s.operatingCashFlow) || 0;
  const roe = parseFloat(s.roe) || 0;
  const dte = parseFloat(s.debtToEquity) || 0;
  const cr  = parseFloat(s.currentRatio) || 0;
  const npm = parseFloat(s.netProfitMargin) || 0;
  const ic  = parseFloat(s.interestCoverage) || 0;
  const fcf = parseFloat(s.freeCashFlow) || 0;
  const roa = parseFloat(s.roa) || 0;

  const piotroski = [np > 0, ocf > 0, roa > 0, ocf > np, dte < 1, cr > 1.2, npm > 5, ic > 3, fcf > 0]
    .filter(Boolean).length;

  const scores = [
    // ROE
    parseFloat(s.roe) >= 15 ? 10 : parseFloat(s.roe) >= 8 ? 6 : parseFloat(s.roe) >= 0 ? 3 : 0,
    // Net Profit Margin
    npm >= 20 ? 10 : npm >= 10 ? 7 : npm >= 5 ? 4 : npm >= 0 ? 2 : 0,
    // Revenue Consistency
    revCV <= 20 ? 10 : revCV <= 35 ? 7 : revCV <= 50 ? 4 : 1,
    // Debt-to-Equity
    dte <= 0.5 ? 10 : dte <= 1 ? 7 : dte <= 2 ? 3 : 0,
    // Interest Coverage
    ic >= 5 ? 10 : ic >= 3 ? 7 : ic >= 1.5 ? 3 : 0,
    // Current Ratio
    (cr >= 1.2 && cr <= 2) ? 10 : ((cr >= 1 && cr < 1.2) || (cr > 2 && cr <= 2.5)) ? 6 : cr >= 0.8 ? 3 : 0,
    // OCF Quality
    (() => { const v = np <= 0 ? (ocf > 0 ? 120 : 0) : (ocf / np) * 100; return v >= 100 ? 10 : v >= 60 ? 6 : v >= 0 ? 3 : 0; })(),
    // DSO
    (() => { const dso = parseFloat(s.daysSalesOutstanding) || 0; return dso <= 30 ? 10 : dso <= 45 ? 7 : dso <= 60 ? 4 : 0; })(),
    // FCF
    fcf > 0 ? 10 : 0,
    // Piotroski
    piotroski >= 7 ? 10 : piotroski >= 5 ? 6 : piotroski >= 3 ? 3 : 0,
  ];

  return Math.round(scores.reduce((a, v) => a + v, 0));
};

export const getScoreLabel = (score) =>
  score >= 80 ? 'Strong' : score >= 60 ? 'Decent' : score >= 40 ? 'Weak Structure' : 'Risky / Unstable';

export const getScoreColor = (score) =>
  score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
