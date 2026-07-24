import React, { useMemo } from 'react';
import './HealthScoreCard.css';
import { NON_OPERATING_INCOME, NON_OPERATING_EXPENSE } from '../../../utils/nonOperatingCategories';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const fmtMoney = (v) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
};

const pctArrow = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '•');

/* ── Build the 10 metric cards from live data ──────────────────────
 * Every metric first checks whether the data it needs actually exists.
 * If not, the card renders a "Data Required" state listing exactly
 * what's missing — we never show a fabricated number.
 * ─────────────────────────────────────────────────────────────────── */
// Financing flows and capital purchases are cash movements, not P&L items.
// Applied symmetrically — see utils/nonOperatingCategories.js for why.
const FINANCING_INCOME  = NON_OPERATING_INCOME;
const FINANCING_EXPENSE = NON_OPERATING_EXPENSE;

const buildMetrics = (s, transactions, manual) => {
  /* Monthly OPERATING revenue / expense map (completed months only) */
  const monthly = {};
  const expenseByCategory = {};
  let latestTxnDate = '';
  (transactions || []).forEach(t => {
    const key = (t.date || '').slice(0, 7);
    if (!key) return;
    if (t.date > latestTxnDate) latestTxnDate = t.date;
    if (!monthly[key]) monthly[key] = { rev: 0, exp: 0 };
    const amt = parseFloat(t.amount || 0);
    if (t.type === 'income' && !FINANCING_INCOME.has(t.category)) monthly[key].rev += amt;
    else if (t.type === 'expense' && !FINANCING_EXPENSE.has(t.category)) {
      monthly[key].exp += amt;
      const cat = t.category || 'Uncategorised';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
    }
  });
  const nowKey = new Date().toISOString().slice(0, 7);

  // The newest month in an imported statement is usually a stub — a statement
  // ending on the 1st leaves one day of data. Comparing that to a full month
  // reads as a ~100% collapse, so it is excluded from period-over-period math.
  const partialMonthKey = (() => {
    if (!latestTxnDate) return null;
    const [y, m, d] = latestTxnDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    const lastDayOfMonth = new Date(y, m, 0).getDate();
    return d < lastDayOfMonth ? latestTxnDate.slice(0, 7) : null;
  })();

  const monthKeys = Object.keys(monthly)
    .filter(k => k < nowKey && k !== partialMonthKey)
    .sort();

  // Balance-sheet inputs: a manually entered figure wins, otherwise the live
  // Chart of Accounts total. Nothing here is a proxy or a guess.
  const coaEquity      = parseFloat(s.coaEquity) || 0;
  const coaLiabilities = parseFloat(s.coaTotalLiabilities) || 0;
  const coaAssets      = parseFloat(s.coaTotalAssets) || 0;

  const manualEquity      = parseFloat(manual?.equity) || 0;
  const manualLiabilities = parseFloat(manual?.totalLiabilities) || 0;
  const manualAssets      = parseFloat(manual?.totalAssets) || 0;

  const equity      = manualEquity      > 0 ? manualEquity      : coaEquity;
  const liabilities = manualLiabilities > 0 ? manualLiabilities : coaLiabilities;
  const assets      = manualAssets      > 0 ? manualAssets      : coaAssets;
  const equitySource      = manualEquity      > 0 ? 'manual entry' : 'Chart of Accounts';
  const liabilitySource   = manualLiabilities > 0 ? 'manual entry' : 'Chart of Accounts';

  // Prefer the operating-only figures (financing excluded); fall back to raw
  // totals for older API responses that don't have them yet.
  const totalRevenue  = parseFloat(s.operatingRevenue  ?? s.totalRevenue) || 0;
  const totalExpenses = parseFloat(s.operatingExpenses ?? s.totalExpenses) || 0;
  const receivables   = parseFloat(s.totalReceivables) || 0;
  const payables      = parseFloat(s.totalPayables) || 0;

  const metrics = [];

  /* 1 ── Return on Equity — real equity from the ledger, never a proxy */
  {
    const netIncome = parseFloat(s.annualNetProfit ?? s.netProfit) || 0;
    const roe = equity > 0 ? (netIncome / equity) * 100 : null;
    if (roe === null) {
      metrics.push({
        id: 'roe', label: 'Return on Equity (ROE)', category: 'Profitability Power',
        gated: true, score: 5, status: 'gated',
        formula: 'Net Income ÷ Total Equity × 100',
        recommended: 'Above 15%',
        missing: ['Equity accounts in your Chart of Accounts'],
        hint: 'Add Equity accounts under Accounting → Chart of Accounts, or enter Equity under Financial Metrics → Additional Data.',
      });
    } else {
      metrics.push({
        id: 'roe', label: 'Return on Equity (ROE)', category: 'Profitability Power',
        displayVal: roe > 200 ? '>200%' : `${roe.toFixed(1)}%`,
        formula: 'Net Income ÷ Total Equity × 100',
        recommended: 'Above 15%',
        description: `Equity of ${fmtMoney(equity)} from ${equitySource}`,
        status: roe >= 15 ? 'green' : roe >= 10 ? 'yellow' : 'red',
        score: roe >= 15 ? 10 : roe >= 8 ? 6 : roe >= 0 ? 3 : 0,
        fill: clamp((roe / 30) * 100, 0, 100),
      });
    }
  }

  /* 2 ── Net Profit Margin — from categorized transactions (flagged as such) */
  {
    if (totalRevenue <= 0) {
      metrics.push({
        id: 'npm', label: 'Net Profit Margin', category: 'Margin Strength',
        gated: true, score: 5, status: 'gated',
        formula: '(Revenue − Expenses) ÷ Revenue × 100',
        recommended: 'Above 10%',
        missing: ['Bank statement or revenue transactions'],
        hint: 'Upload a bank statement or P&L to compute margin.',
      });
    } else {
      const npm = ((totalRevenue - totalExpenses) / totalRevenue) * 100;
      metrics.push({
        id: 'npm', label: 'Net Profit Margin', category: 'Margin Strength',
        displayVal: `${npm.toFixed(1)}%`,
        formula: '(Revenue − Expenses) ÷ Revenue × 100',
        recommended: 'Above 10%',
        description: 'Estimated from categorized transactions — upload a P&L for the exact figure',
        status: npm >= 10 ? 'green' : npm >= 7 ? 'yellow' : 'red',
        score: npm >= 20 ? 10 : npm >= 10 ? 7 : npm >= 5 ? 4 : npm >= 0 ? 2 : 0,
        fill: clamp((npm / 25) * 100, 0, 100),
      });
    }
  }

  /* 3 ── Revenue Growth — quarter-on-quarter, not month-on-month.
   *
   * SMB revenue is lumpy: one big invoice landing on the 2nd instead of the
   * 30th swings a single month by hundreds of percent. Comparing two three-month
   * blocks smooths that out — a trough month like ₹6K against a ₹38K month was
   * reporting +510% growth while the underlying trend was down. */
  const sumRev = keys => keys.reduce((a, k) => a + monthly[k].rev, 0);
  {
    if (monthKeys.length < 2) {
      metrics.push({
        id: 'revGrowth', label: 'Revenue Growth', category: 'Growth Momentum',
        gated: true, score: 5, status: 'gated',
        formula: 'Last 3 months vs the 3 before × 100',
        recommended: 'Positive and rising',
        missing: ['At least 2 months of revenue transactions'],
        hint: 'Upload more bank statement history to see growth trends.',
      });
    } else {
      // Use 3-month blocks when there is enough history, else fall back to the
      // longest symmetric pair of blocks the data supports.
      const blockSize = Math.min(3, Math.floor(monthKeys.length / 2));
      const recent = monthKeys.slice(-blockSize);
      const prior  = monthKeys.slice(-blockSize * 2, -blockSize);
      const recentSum = sumRev(recent);
      const priorSum  = sumRev(prior);
      const growth = priorSum > 0 ? ((recentSum - priorSum) / priorSum) * 100 : null;

      // YoY anchored on the latest data month (works even for older imports)
      const anchor = monthKeys[monthKeys.length - 1];
      const last12 = monthKeys.filter(k => k <= anchor).slice(-12);
      const prev12 = monthKeys.filter(k => k < last12[0]).slice(-12);
      const yoy = prev12.length >= 3 && sumRev(prev12) > 0
        ? ((sumRev(last12) - sumRev(prev12)) / sumRev(prev12)) * 100
        : null;

      if (growth === null) {
        metrics.push({
          id: 'revGrowth', label: 'Revenue Growth', category: 'Growth Momentum',
          gated: true, score: 5, status: 'gated',
          formula: 'Last 3 months vs the 3 before × 100',
          recommended: 'Positive and rising',
          missing: ['Revenue in the earlier comparison period'],
          hint: 'The earlier months have no revenue, so there is no baseline to grow from.',
        });
      } else {
        const periodLabel = blockSize === 1 ? 'month' : `${blockSize} months`;
        metrics.push({
          id: 'revGrowth', label: 'Revenue Growth', category: 'Growth Momentum',
          displayVal: `${pctArrow(growth)} ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`,
          extra: [
            { label: `Last ${periodLabel}`, value: fmtMoney(recentSum), color: '#64748b' },
            { label: `Prior ${periodLabel}`, value: fmtMoney(priorSum), color: '#94a3b8' },
            { label: 'YoY', value: yoy === null ? 'Need 12+ mo' : `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`, color: yoy === null ? '#94a3b8' : yoy >= 0 ? '#10b981' : '#ef4444' },
          ],
          formula: `Last ${periodLabel} vs the ${periodLabel} before × 100`,
          recommended: 'Positive and rising',
          description: `Compared over ${periodLabel} so one heavy or quiet month doesn't distort the trend`,
          status: growth > 0 && (yoy === null || yoy > 0) ? 'green' : growth > 0 || (yoy !== null && yoy > 0) ? 'yellow' : 'red',
          score: growth > 0 && (yoy === null || yoy > 0) ? 10 : growth > 0 ? 7 : growth > -5 ? 4 : 1,
          fill: clamp(50 + growth, 0, 100),
        });
      }
    }
  }

  /* 4 ── Debt-to-Equity — needs real liabilities + equity */
  {
    if (liabilities <= 0 || equity <= 0) {
      const missing = [];
      if (liabilities <= 0) missing.push('Liability accounts (payables, loans, GST/TDS)');
      if (equity <= 0) missing.push('Equity accounts (capital, retained earnings)');
      metrics.push({
        id: 'dte', label: 'Debt-to-Equity Ratio', category: 'Debt Load',
        gated: true, score: 5, status: 'gated',
        formula: 'Total Liabilities ÷ Total Equity',
        recommended: 'Below 1.0x',
        missing,
        hint: 'These come from your Chart of Accounts. Add them there, or override under Financial Metrics → Additional Data.',
      });
    } else {
      // Total shareholders' equity — owner capital plus retained earnings and
      // every other equity account, not owner capital on its own.
      const dte = liabilities / equity;
      metrics.push({
        id: 'dte', label: 'Debt-to-Equity Ratio', category: 'Debt Load',
        displayVal: dte > 20 ? '>20x' : `${dte.toFixed(2)}x`,
        extra: [
          { label: 'Liabilities', value: fmtMoney(liabilities), color: '#ef4444' },
          { label: 'Equity', value: fmtMoney(equity), color: '#6366f1' },
        ],
        formula: 'Total Liabilities ÷ Total Equity',
        recommended: 'Below 1.0x',
        description: `From ${liabilitySource === equitySource ? liabilitySource : `${liabilitySource} and ${equitySource}`}`,
        status: dte <= 1 ? 'green' : dte <= 1.5 ? 'yellow' : 'red',
        score: dte <= 0.5 ? 10 : dte <= 1 ? 7 : dte <= 2 ? 3 : 0,
        fill: clamp((1 - dte / 3) * 100, 0, 100),
      });
    }
  }

  /* 5 ── Interest Coverage — needs a recorded interest expense */
  {
    const ic = (s.interestCoverage !== null && s.interestCoverage !== undefined) ? parseFloat(s.interestCoverage) : null;
    if (ic === null) {
      metrics.push({
        id: 'ic', label: 'Interest Coverage Ratio', category: 'Interest Safety',
        gated: true, score: 5, status: 'gated',
        formula: 'EBIT ÷ Interest Expense',
        recommended: 'Above 3x',
        missing: ['Loan details / interest expense'],
        hint: 'Add your loans in the Loans section and mark EMIs paid — interest posts automatically. If you have no debt, this ratio doesn\'t apply.',
      });
    } else {
      metrics.push({
        id: 'ic', label: 'Interest Coverage Ratio', category: 'Interest Safety',
        displayVal: ic > 50 ? '>50x' : `${ic.toFixed(2)}x`,
        formula: 'EBIT ÷ Interest Expense',
        recommended: 'Above 3x',
        description: 'How comfortably operating earnings cover interest payments',
        status: ic >= 3 ? 'green' : ic >= 2 ? 'yellow' : 'red',
        score: ic >= 5 ? 10 : ic >= 3 ? 7 : ic >= 1.5 ? 3 : 0,
        fill: clamp((ic / 8) * 100, 0, 100),
      });
    }
  }

  /* 6 ── Current Ratio — needs payables to be meaningful */
  {
    const cr = (s.currentRatio !== null && s.currentRatio !== undefined) ? parseFloat(s.currentRatio) : null;
    if (cr === null) {
      metrics.push({
        id: 'cr', label: 'Current Ratio', category: 'Liquidity Cushion',
        gated: true, score: 5, status: 'gated',
        formula: 'Current Assets ÷ Current Liabilities',
        recommended: '1.5 – 3.0x',
        missing: ['Accounts Payable invoices'],
        hint: 'Upload payable invoices so we know your short-term obligations.',
      });
    } else {
      metrics.push({
        id: 'cr', label: 'Current Ratio', category: 'Liquidity Cushion',
        displayVal: `${cr.toFixed(2)}x`,
        formula: 'Current Assets ÷ Current Liabilities',
        recommended: '1.5 – 3.0x',
        description: 'Too low = liquidity stress; very high = idle cash',
        status: (cr >= 1.5 && cr <= 3) ? 'green' : ((cr >= 1.2 && cr < 1.5) || (cr > 3 && cr <= 5)) ? 'yellow' : 'red',
        score: (cr >= 1.5 && cr <= 3) ? 10 : ((cr >= 1.2 && cr < 1.5) || (cr > 3 && cr <= 5)) ? 7 : ((cr >= 1 && cr < 1.2) || cr > 5) ? 4 : cr >= 0.8 ? 2 : 0,
        fill: (cr >= 1.5 && cr <= 3) ? 90 : ((cr >= 1.2 && cr < 1.5) || (cr > 3 && cr <= 5)) ? 65 : ((cr >= 1 && cr < 1.2) || cr > 5) ? 40 : cr >= 0.8 ? 22 : 10,
      });
    }
  }

  /* 7 ── Burn Rate / Cash Generation — replaces Cash Flow Quality */
  {
    const recent = monthKeys.slice(-3);
    if (recent.length === 0) {
      metrics.push({
        id: 'burn', label: 'Burn Rate', category: 'Cash Flow Reality',
        gated: true, score: 5, status: 'gated',
        formula: 'Avg monthly (Revenue − Expenses)',
        recommended: 'Cash positive',
        missing: ['Bank statement transactions'],
        hint: 'Upload a bank statement to compute your monthly burn.',
      });
    } else {
      const avgNet = recent.reduce((a, k) => a + (monthly[k].rev - monthly[k].exp), 0) / recent.length;
      const avgRev = recent.reduce((a, k) => a + monthly[k].rev, 0) / recent.length;
      const positive = avgNet >= 0;
      metrics.push({
        id: 'burn',
        label: positive ? 'Positive Cash Generation' : 'Burn Rate',
        category: 'Cash Flow Reality',
        displayVal: `${fmtMoney(Math.abs(avgNet))}/mo`,
        formula: 'Avg monthly (Revenue − Expenses), last 3 months',
        recommended: 'Cash positive',
        description: positive
          ? 'You generate more cash than you spend each month'
          : 'Monthly expenses exceed revenue — you are burning cash',
        status: positive ? 'green' : 'red',
        score: positive ? 10 : avgRev > 0 && Math.abs(avgNet) < avgRev * 0.1 ? 4 : 0,
        fill: positive ? 85 : 15,
      });
    }
  }

  /* 8 ── Expense Load — what share of revenue costs eat, and where it goes.
   * Built from categorised transactions plus the unpaid-bill balance, so there
   * is no inventory or purchase-ledger data to assume. Replaces the Cash
   * Conversion Cycle, which needed DPO/DIO inputs this system never collects. */
  {
    if (totalExpenses <= 0 || totalRevenue <= 0) {
      const missing = [];
      if (totalRevenue <= 0) missing.push('Revenue transactions');
      if (totalExpenses <= 0) missing.push('Expense transactions');
      metrics.push({
        id: 'expenseLoad', label: 'Expense Load', category: 'Cost Control',
        gated: true, score: 5, status: 'gated',
        formula: 'Total Expenses ÷ Revenue × 100',
        recommended: 'Below 85% of revenue',
        missing,
        hint: 'Upload a bank statement so spending can be categorised.',
      });
    } else {
      const ratio = (totalExpenses / totalRevenue) * 100;
      const topCategories = Object.entries(expenseByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      const biggest = topCategories[0];
      const biggestShare = biggest ? (biggest[1] / totalExpenses) * 100 : 0;

      const extra = topCategories.map(([name, amount]) => ({
        label: name.length > 12 ? `${name.slice(0, 11)}…` : name,
        value: `${Math.round((amount / totalExpenses) * 100)}%`,
        color: '#64748b',
      }));
      // Unpaid bills are committed spend that hasn't left the bank yet.
      if (payables > 0) {
        extra.push({ label: 'Unpaid bills', value: fmtMoney(payables), color: '#ef4444' });
      }

      metrics.push({
        id: 'expenseLoad', label: 'Expense Load', category: 'Cost Control',
        displayVal: `${ratio.toFixed(1)}%`,
        extra,
        formula: 'Total Expenses ÷ Revenue × 100',
        recommended: 'Below 85% of revenue',
        description: biggest
          ? `₹${Math.round(ratio)} of every ₹100 earned goes out — ${biggest[0]} is the largest cost at ${Math.round(biggestShare)}% of spend`
          : `₹${Math.round(ratio)} of every ₹100 earned goes back out as costs`,
        status: ratio <= 85 ? 'green' : ratio <= 100 ? 'yellow' : 'red',
        score: ratio <= 70 ? 10 : ratio <= 85 ? 7 : ratio <= 100 ? 4 : 0,
        fill: clamp(100 - ratio, 0, 100),
      });
    }
  }


  /* 9 ── Free Cash Flow — allowed as a flagged estimate */
  {
    const fcf = parseFloat(s.freeCashFlow) || 0;
    if (totalRevenue <= 0 && totalExpenses <= 0) {
      metrics.push({
        id: 'fcf', label: 'Free Cash Flow', category: 'FCF Strength',
        gated: true, score: 5, status: 'gated',
        formula: 'Operating Cash Flow − CapEx',
        recommended: 'Positive & growing',
        missing: ['Bank statement transactions'],
        hint: 'Upload a bank statement to estimate free cash flow.',
      });
    } else {
      metrics.push({
        id: 'fcf', label: 'Free Cash Flow', category: 'FCF Strength',
        displayVal: fmtMoney(fcf),
        formula: 'Operating Cash Flow − CapEx',
        recommended: 'Positive & growing',
        description: 'Estimate from transaction data — CapEx not separately recorded',
        status: fcf > 0 ? 'green' : 'red',
        score: fcf > 0 ? 10 : 0,
        fill: fcf > 0 ? 82 : 12,
      });
    }
  }

  /* 10 ── Piotroski F-Score */
  {
    const np  = parseFloat(s.annualNetProfit ?? s.netProfit) || 0;
    const ocf = parseFloat(s.operatingCashFlow) || 0;
    const dte = liabilities > 0 && equity > 0 ? liabilities / equity : parseFloat(s.debtToEquity) || 0;
    const npm = parseFloat(s.netProfitMargin) || 0;
    const fcf = parseFloat(s.freeCashFlow) || 0;
    const roa = assets > 0 ? (np / assets) * 100 : parseFloat(s.roa) || 0;
    const cr  = (s.currentRatio !== null && s.currentRatio !== undefined) ? parseFloat(s.currentRatio) : null;
    const ic  = (s.interestCoverage !== null && s.interestCoverage !== undefined) ? parseFloat(s.interestCoverage) : null;

    const fScore = [
      np > 0, ocf > 0, roa > 0, ocf > np, dte < 1,
      cr === null || cr > 1.2, npm > 5, ic === null || ic > 3, fcf > 0,
    ].filter(Boolean).length;

    metrics.push({
      id: 'piotroski', label: 'Earnings Quality (F-Score)', category: 'Earnings Quality',
      displayVal: `${fScore} / 9`,
      formula: '9-point Piotroski checklist on profitability, leverage & efficiency',
      recommended: '7 or higher',
      description: 'Detects manipulation or weak fundamentals across 9 checks',
      status: fScore >= 7 ? 'green' : fScore >= 5 ? 'yellow' : 'red',
      score: fScore >= 7 ? 10 : fScore >= 5 ? 6 : fScore >= 3 ? 3 : 0,
      fill: Math.round((fScore / 9) * 100),
    });
  }

  return metrics;
};

const BENEFITS = [
  'Access lower-interest business loans and preferential credit lines from banks',
  'Better insurance premium rates for business and key-man insurance policies',
  'Stronger negotiating position for vendor credit terms and trade limits',
  'Eligibility for government-backed MSME schemes and subsidised credit',
  'Higher valuation multiples when raising equity or selling the business',
  'Faster invoice discounting and supply chain financing at better rates',
  'Qualify for Trade Credit Insurance covering buyer defaults',
  'Improved CIBIL / business credit score for future borrowings',
  'Preferred vendor status with large corporates and enterprise clients',
  'Lower risk of GST audit and stronger compliance posture with regulators',
];

const ScoreGauge = ({ score }) => {
  const r = 55;
  const cx = 80;
  const cy = 80;
  const pct = score / 100;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  // strokeDasharray approach — immune to degenerate SVG arc edge cases
  const C = 2 * Math.PI * r;       // full circle circumference
  const arcLen = Math.PI * r;       // semicircle length
  const label = score >= 80 ? 'STRONG' : score >= 60 ? 'DECENT' : score >= 40 ? 'WEAK' : 'RISKY';

  return (
    <svg width="160" height="105" viewBox="0 0 160 105">
      {/* rotate(180) shifts stroke start to left (9-o'clock) and goes clockwise through the top */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8ecf4" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${arcLen} ${C}`} transform={`rotate(180, ${cx}, ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${pct * arcLen} ${C}`} transform={`rotate(180, ${cx}, ${cy})`} />
      <text x="80" y="74" textAnchor="middle" fontSize="30" fontWeight="800" fill={color}>{score}</text>
      <text x="80" y="90" textAnchor="middle" fontSize="11" fill="#94a3b8">out of 100</text>
      <text x="80" y="104" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>{label}</text>
    </svg>
  );
};

const HealthScoreCard = ({ dashboardSummary, transactions, onViewLoans }) => {
  const { metrics, totalScore } = useMemo(() => {
    const s = dashboardSummary || {};
    let manual = {};
    try { manual = JSON.parse(localStorage.getItem('financialMetrics') || '{}').manual || {}; } catch {}

    const metricData = buildMetrics(s, transactions, manual);
    const totalScore = Math.round(metricData.reduce((a, m) => a + m.score, 0));
    return { metrics: metricData, totalScore };
  }, [dashboardSummary, transactions]);

  const scoreLabel = totalScore >= 80 ? 'Strong' : totalScore >= 60 ? 'Decent' : totalScore >= 40 ? 'Weak Structure' : 'Risky / Unstable';
  const scoreColor = totalScore >= 80 ? '#10b981' : totalScore >= 60 ? '#f59e0b' : totalScore >= 40 ? '#f97316' : '#ef4444';
  const scoreDesc  = totalScore >= 80
    ? 'Your business fundamentals are excellent. You qualify for preferential financing and strategic growth options.'
    : totalScore >= 60
    ? 'Solid foundation but some key metrics need attention. Focus on the red and yellow indicators below.'
    : totalScore >= 40
    ? 'Structural weaknesses detected. Address high-risk metrics urgently to avoid financial stress.'
    : 'Critical risk signals detected. Immediate action required on multiple financial health dimensions.';

  const greenCount  = metrics.filter(m => m.status === 'green').length;
  const yellowCount = metrics.filter(m => m.status === 'yellow').length;
  const redCount    = metrics.filter(m => m.status === 'red').length;
  const gatedCount  = metrics.filter(m => m.status === 'gated').length;

  return (
    <div className="hs-card">
      {/* Header */}
      <div className="hs-header">
        <div className="hs-header-left">
          <div className="hs-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <div className="hs-title">Corporate Health Score</div>
            <div className="hs-subtitle">Based on 10 financial health metrics derived from your live data</div>
          </div>
        </div>
        <div className="hs-summary-pills">
          <span className="hs-pill hs-pill-green">{greenCount} Strong</span>
          <span className="hs-pill hs-pill-yellow">{yellowCount} Watch</span>
          <span className="hs-pill hs-pill-red">{redCount} At Risk</span>
          {gatedCount > 0 && <span className="hs-pill hs-pill-gated">{gatedCount} Need Data</span>}
        </div>
      </div>

      {/* Score + Summary row */}
      <div className="hs-score-row">
        <div className="hs-gauge-wrap">
          <ScoreGauge score={totalScore} />
        </div>
        <div className="hs-score-info">
          <div className="hs-score-label" style={{ color: scoreColor }}>{scoreLabel}</div>
          <p className="hs-score-desc">{scoreDesc}</p>
          <div className="hs-score-tiers">
            {[
              { range: '80–100', label: 'Strong',  color: '#10b981' },
              { range: '60–80',  label: 'Decent',  color: '#f59e0b' },
              { range: '40–60',  label: 'Weak',    color: '#f97316' },
              { range: '< 40',   label: 'Risky',   color: '#ef4444' },
            ].map(t => (
              <span
                key={t.range}
                className="hs-tier-chip"
                style={{ color: t.color, background: `${t.color}18`, border: `1px solid ${t.color}45` }}
              >
                {t.range}: {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Breakdown */}
      <div className="hs-section-title">Metric Breakdown</div>
      <div className="hs-metrics-grid">
        {metrics.map(m => (
          <div key={m.id} className={`hs-metric-card hs-metric-${m.status}`} title={m.description || ''}>
            <div className="hs-metric-top">
              <div className="hs-metric-info">
                <div className="hs-metric-category">{m.category}</div>
                <div className="hs-metric-label">{m.label}</div>
              </div>
              <div className="hs-metric-badges">
                <span className={`hs-status-dot hs-status-${m.status}`} />
                <span className="hs-metric-score">{m.score}/10</span>
              </div>
            </div>

            {m.gated ? (
              <>
                <div className="hs-metric-values">
                  <span className="hs-metric-value hs-metric-value-gated">Data Required</span>
                  <span className="hs-metric-recommended">Ideal: {m.recommended}</span>
                </div>
                <div className="hs-req-box">
                  <div className="hs-req-title">This metric requires additional financial data:</div>
                  <ul className="hs-req-list">
                    {m.missing.map(item => <li key={item}>{item}</li>)}
                  </ul>
                  {m.hint && <div className="hs-req-hint">{m.hint}</div>}
                </div>
              </>
            ) : (
              <>
                <div className="hs-metric-values">
                  <span
                    className="hs-metric-value"
                    style={{ color: m.status === 'green' ? '#10b981' : m.status === 'yellow' ? '#d97706' : '#ef4444' }}
                  >
                    {m.displayVal}
                  </span>
                  <span className="hs-metric-recommended">Ideal: {m.recommended}</span>
                </div>

                {m.extra && (
                  <div className="hs-metric-extra">
                    {m.extra.map(e => (
                      <span key={e.label} className="hs-extra-chip">
                        <span className="hs-extra-label">{e.label}</span>
                        <span className="hs-extra-value" style={{ color: e.color }}>{e.value}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="hs-bar-track">
                  <div className={`hs-bar-fill hs-bar-${m.status}`} style={{ width: `${m.fill}%` }} />
                </div>

                <div className="hs-metric-desc">{m.description}</div>
              </>
            )}

            <div className="hs-metric-formula">{m.formula}</div>
          </div>
        ))}
      </div>

      {/* Benefits */}
      <div className="hs-benefits-section">
        <div className="hs-benefits-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Benefits of a Strong Health Score
        </div>
        <div className="hs-benefits-grid">
          {BENEFITS.map((b, i) => (
            <div key={i} className="hs-benefit-item">
              <span className="hs-benefit-dot" />
              <span>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Loans CTA */}
      {onViewLoans && (
        <div className="hs-loans-cta">
          <button className="hs-loans-btn" onClick={onViewLoans}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            View Personalised Loan Offers
          </button>
        </div>
      )}
    </div>
  );
};

export default HealthScoreCard;
