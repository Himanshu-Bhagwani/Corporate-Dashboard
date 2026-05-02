import React, { useMemo } from 'react';
import './HealthScoreCard.css';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const METRIC_DEFS = [
  {
    id: 'roe',
    label: 'Return on Equity (ROE)',
    category: 'Profitability Power',
    getVal: (s) => parseFloat(s.roe) || 0,
    format: (v) => v > 500 ? '>500%' : v < -100 ? 'N/A' : `${v.toFixed(1)}%`,
    recommended: 'Above 15%',
    description: 'Measures how well capital is turned into profit',
    getStatus: (v) => v >= 15 ? 'green' : v >= 10 ? 'yellow' : 'red',
    getScore: (v) => v >= 15 ? 10 : v >= 8 ? 6 : v >= 0 ? 3 : 0,
    getFill: (v) => clamp((v / 30) * 100, 0, 100),
  },
  {
    id: 'npm',
    label: 'Net Profit Margin',
    category: 'Margin Strength',
    getVal: (s) => parseFloat(s.netProfitMargin) || 0,
    format: (v) => `${v.toFixed(1)}%`,
    recommended: 'Above 10%',
    description: 'Shows pricing power and cost control efficiency',
    getStatus: (v) => v >= 10 ? 'green' : v >= 7 ? 'yellow' : 'red',
    getScore: (v) => v >= 20 ? 10 : v >= 10 ? 7 : v >= 5 ? 4 : v >= 0 ? 2 : 0,
    getFill: (v) => clamp((v / 25) * 100, 0, 100),
  },
  {
    id: 'revConsistency',
    label: 'Revenue Consistency',
    category: 'Revenue Stability',
    getVal: null,
    format: (v) => `CV ${v.toFixed(0)}%`,
    recommended: 'CV below 25%',
    description: 'Stable or rising revenue > volatile spikes',
    getStatus: (v) => v <= 25 ? 'green' : v <= 40 ? 'yellow' : 'red',
    getScore: (v) => v <= 20 ? 10 : v <= 35 ? 7 : v <= 50 ? 4 : 1,
    getFill: (v) => clamp((1 - v / 80) * 100, 0, 100),
  },
  {
    id: 'dte',
    label: 'Debt-to-Equity Ratio',
    category: 'Debt Load',
    getVal: (s) => parseFloat(s.debtToEquity) || 0,
    format: (v) => v < 0 ? 'N/A' : v > 20 ? '>20x' : `${v.toFixed(2)}x`,
    recommended: 'Below 1.0x',
    description: 'High debt is a silent pressure on your business',
    getStatus: (v) => v <= 1 ? 'green' : v <= 1.5 ? 'yellow' : 'red',
    getScore: (v) => v <= 0.5 ? 10 : v <= 1 ? 7 : v <= 2 ? 3 : 0,
    getFill: (v) => clamp((1 - v / 3) * 100, 0, 100),
  },
  {
    id: 'ic',
    label: 'Interest Coverage Ratio',
    category: 'Interest Safety',
    getVal: (s) => parseFloat(s.interestCoverage) || 0,
    format: (v) => v < 0 ? 'N/A' : v > 50 ? '>50x' : `${v.toFixed(2)}x`,
    recommended: 'Above 3x',
    description: 'EBIT / Interest — how easily you service debt',
    getStatus: (v) => v >= 3 ? 'green' : v >= 2 ? 'yellow' : 'red',
    getScore: (v) => v >= 5 ? 10 : v >= 3 ? 7 : v >= 1.5 ? 3 : 0,
    getFill: (v) => clamp((v / 8) * 100, 0, 100),
  },
  {
    id: 'cr',
    label: 'Current Ratio',
    category: 'Liquidity Cushion',
    getVal: (s) => parseFloat(s.currentRatio) || 0,
    format: (v) => `${v.toFixed(2)}x`,
    recommended: '1.2 – 2.0x',
    description: 'Too low = stress, too high = idle inefficiency',
    getStatus: (v) => (v >= 1.2 && v <= 2.5) ? 'green' : (v >= 1.0 || v > 2.5) ? 'yellow' : 'red',
    getScore: (v) => (v >= 1.2 && v <= 2) ? 10 : ((v >= 1 && v < 1.2) || (v > 2 && v <= 2.5)) ? 6 : v >= 0.8 ? 3 : 0,
    getFill: (v) => {
      if (v >= 1.2 && v <= 2) return 90;
      if ((v >= 1 && v < 1.2) || (v > 2 && v <= 2.5)) return 65;
      if (v >= 0.8) return 35;
      return 15;
    },
  },
  {
    id: 'ocfQuality',
    label: 'Cash Flow Quality',
    category: 'Cash Flow Reality',
    getVal: (s) => {
      const ocf = parseFloat(s.operatingCashFlow) || 0;
      const np = parseFloat(s.netProfit) || 0;
      if (np <= 0) return ocf > 0 ? 120 : 0;
      return parseFloat(((ocf / np) * 100).toFixed(1));
    },
    format: (v) => `${Math.max(0, v).toFixed(0)}% of NP`,
    recommended: '≥ 100% of Net Profit',
    description: 'OCF ≥ Net Profit = real, clean earnings (not paper profits)',
    getStatus: (v) => v >= 100 ? 'green' : v >= 60 ? 'yellow' : 'red',
    getScore: (v) => v >= 100 ? 10 : v >= 60 ? 6 : v >= 0 ? 3 : 0,
    getFill: (v) => clamp(Math.max(0, v), 0, 100),
  },
  {
    id: 'dso',
    label: 'Receivable Days (DSO)',
    category: 'Working Capital Efficiency',
    getVal: (s) => parseFloat(s.daysSalesOutstanding) || 0,
    format: (v) => `${Math.round(v)} days`,
    recommended: 'Below 45 days',
    description: 'Lower DSO = faster cash cycle, less capital stuck',
    getStatus: (v) => v <= 45 ? 'green' : v <= 60 ? 'yellow' : 'red',
    getScore: (v) => v <= 30 ? 10 : v <= 45 ? 7 : v <= 60 ? 4 : 0,
    getFill: (v) => clamp(((120 - v) / 105) * 100, 0, 100),
  },
  {
    id: 'fcf',
    label: 'Free Cash Flow',
    category: 'FCF Strength',
    getVal: (s) => parseFloat(s.freeCashFlow) || 0,
    format: (v) => {
      const abs = Math.abs(v);
      const sign = v < 0 ? '-' : '';
      if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
      if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(1)}L`;
      if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(1)}K`;
      return `${sign}₹${abs.toFixed(0)}`;
    },
    recommended: 'Positive & growing',
    description: 'Cash left after capex = real wealth creation',
    getStatus: (v) => v > 0 ? 'green' : 'red',
    getScore: (v) => v > 0 ? 10 : 0,
    getFill: (v) => v > 0 ? 82 : 12,
  },
  {
    id: 'piotroski',
    label: 'Earnings Quality (F-Score)',
    category: 'Earnings Quality',
    getVal: null,
    format: (v) => `${v} / 9`,
    recommended: '7 or higher',
    description: 'Piotroski F-Score: detects manipulation or weak fundamentals',
    getStatus: (v) => v >= 7 ? 'green' : v >= 5 ? 'yellow' : 'red',
    getScore: (v) => v >= 7 ? 10 : v >= 5 ? 6 : v >= 3 ? 3 : 0,
    getFill: (v) => Math.round((v / 9) * 100),
  },
];

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

    // Revenue Consistency — Coefficient of Variation from all available months
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

    // Piotroski F-Score (simplified 9-point)
    const np  = parseFloat(s.netProfit) || 0;
    const ocf = parseFloat(s.operatingCashFlow) || 0;
    const roe = parseFloat(s.roe) || 0;
    const dte = parseFloat(s.debtToEquity) || 0;
    const cr  = parseFloat(s.currentRatio) || 0;
    const npm = parseFloat(s.netProfitMargin) || 0;
    const ic  = parseFloat(s.interestCoverage) || 0;
    const fcf = parseFloat(s.freeCashFlow) || 0;
    const roa = parseFloat(s.roa) || 0;

    const piotroskiScore = [
      np > 0,
      ocf > 0,
      roa > 0,
      ocf > np,
      dte < 1,
      cr > 1.2,
      npm > 5,
      ic > 3,
      fcf > 0,
    ].filter(Boolean).length;

    const metricData = METRIC_DEFS.map(m => {
      let val;
      if (m.id === 'revConsistency') val = revCV;
      else if (m.id === 'piotroski')  val = piotroskiScore;
      else val = m.getVal(s);

      const status  = m.getStatus(val);
      const score   = m.getScore(val);
      const fill    = m.getFill(val);
      const displayVal = m.format(val);

      return { ...m, value: val, displayVal, status, score, fill };
    });

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
          <div key={m.id} className={`hs-metric-card hs-metric-${m.status}`}>
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

            <div className="hs-metric-values">
              <span
                className="hs-metric-value"
                style={{ color: m.status === 'green' ? '#10b981' : m.status === 'yellow' ? '#d97706' : '#ef4444' }}
              >
                {m.displayVal}
              </span>
              <span className="hs-metric-recommended">Ideal: {m.recommended}</span>
            </div>

            <div className="hs-bar-track">
              <div className={`hs-bar-fill hs-bar-${m.status}`} style={{ width: `${m.fill}%` }} />
            </div>

            <div className="hs-metric-desc">{m.description}</div>
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
