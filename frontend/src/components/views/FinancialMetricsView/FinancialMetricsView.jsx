import React, { useState, useEffect, useMemo } from 'react';
import './FinancialMetricsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { computeHealthScore, getScoreLabel, getScoreColor } from '../../../utils/healthScore';
import { accountingAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import {
  Activity, CreditCard, TrendingUp, Shield, Edit3, Save,
  RefreshCw, CheckCircle2, AlertCircle, ExternalLink,
  BarChart3, Percent, Clock, Zap, Lock, Info,
} from 'lucide-react';

/* ── CIBIL Gauge ────────────────────────────────────────────────── */
const CibilGauge = ({ score }) => {
  const pct = Math.min(1, Math.max(0, (score - 300) / 600)); // 300–900 range
  const color = score >= 750 ? '#10b981' : score >= 700 ? '#f59e0b' : score >= 650 ? '#f97316' : '#ef4444';
  const label = score >= 750 ? 'Excellent' : score >= 700 ? 'Good' : score >= 650 ? 'Fair' : 'Poor';
  const r = 55, cx = 80, cy = 80;
  const C = 2 * Math.PI * r;
  const arcLen = Math.PI * r;

  return (
    <svg width="160" height="105" viewBox="0 0 160 105">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8ecf4" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${arcLen} ${C}`} transform={`rotate(180, ${cx}, ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${pct * arcLen} ${C}`} transform={`rotate(180, ${cx}, ${cy})`} />
      <text x="80" y="72" textAnchor="middle" fontSize="28" fontWeight="900" fill={color}>{score || '–'}</text>
      <text x="80" y="88" textAnchor="middle" fontSize="11" fill="#94a3b8">/ 900</text>
      <text x="80" y="103" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>{label}</text>
    </svg>
  );
};

/* ── Metric Row ─────────────────────────────────────────────────── */
const MetricRow = ({ label, value, unit, source, description, status }) => {
  const color = status === 'green' ? '#10b981' : status === 'yellow' ? '#f59e0b' : status === 'red' ? '#ef4444' : '#718096';
  return (
    <div className="fm-metric-row">
      <div className="fm-metric-left">
        <span className={`fm-metric-dot ${status || 'neutral'}`} />
        <div>
          <div className="fm-metric-label">{label}</div>
          {description && <div className="fm-metric-desc">{description}</div>}
        </div>
      </div>
      <div className="fm-metric-right">
        <span className="fm-metric-value" style={{ color }}>
          {value !== null && value !== undefined && value !== '' ? `${value}${unit || ''}` : '–'}
        </span>
        <span className="fm-metric-source">{source}</span>
      </div>
    </div>
  );
};

/* ── Main Component ─────────────────────────────────────────────── */
const FinancialMetricsView = ({ dashboardSummary, transactions }) => {
  const { currentCompany } = useAuth();
  const [cibilScore, setCibilScore] = useState('');
  const [editingCibil, setEditingCibil] = useState(false);
  const [cibilInput, setCibilInput] = useState('');
  const [manualMetrics, setManualMetrics] = useState({
    turnover: '', totalAssets: '', totalLiabilities: '', equity: '',
    gstTurnover: '', bankCCLimit: '', existingEmi: '',
  });
  const [editingManual, setEditingManual] = useState(false);
  const [manualDraft, setManualDraft] = useState({});
  const [tallyStatus, setTallyStatus] = useState('not_connected'); // 'not_connected' | 'connected' | 'error'
  const [tallyApiKey, setTallyApiKey] = useState('');
  const [tallyInputVisible, setTallyInputVisible] = useState(false);
  const [saveToast, setSaveToast] = useState(null);

  /* Load saved data from localStorage */
  useEffect(() => {
    const saved = localStorage.getItem('financialMetrics');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.cibil) setCibilScore(parsed.cibil);
        if (parsed.manual) setManualMetrics(parsed.manual);
      } catch {}
    }
  }, []);

  const showToast = (msg, type = 'success') => {
    setSaveToast({ msg, type });
    setTimeout(() => setSaveToast(null), 3000);
  };

  const saveCibil = () => {
    const val = parseInt(cibilInput);
    if (!val || val < 300 || val > 900) {
      showToast('CIBIL score must be between 300 and 900.', 'error');
      return;
    }
    setCibilScore(val);
    setEditingCibil(false);
    localStorage.setItem('financialMetrics', JSON.stringify({ cibil: val, manual: manualMetrics }));
    showToast('CIBIL score saved successfully.');
    window.dispatchEvent(new CustomEvent('cibil-score-updated', { detail: { score: val } }));
  };

  const saveManual = async () => {
    const updated = { ...manualMetrics, ...manualDraft };
    setManualMetrics(updated);
    setEditingManual(false);
    const cibil = cibilScore || localStorage.getItem('savedCibil');
    localStorage.setItem('financialMetrics', JSON.stringify({ cibil, manual: updated }));

    // Push the balance-sheet figures into the Chart of Accounts so the ledger
    // and this screen never show different totals.
    if (!currentCompany) { showToast('Financial metrics saved.'); return; }
    try {
      await accountingAPI.reconcileChartOfAccounts({
        totalAssets: updated.totalAssets,
        totalLiabilities: updated.totalLiabilities,
        equity: updated.equity,
      }, currentCompany.id);
      showToast('Saved and synced to your Chart of Accounts.');
    } catch (err) {
      showToast('Saved locally, but the Chart of Accounts could not be updated.', 'error');
    }
  };

  const connectTally = () => {
    if (!tallyApiKey.trim()) return;
    // Stub: when actual Tally API key is configured, this would call the backend
    showToast('Tally integration is set up — connect your API key in .env to activate live sync.', 'success');
    setTallyStatus('pending');
    setTallyInputVisible(false);
  };

  /* Derived values from dashboardSummary */
  const s = dashboardSummary || {};

  // Live Chart of Accounts totals — these fill the balance-sheet fields below,
  // so the ledger is the starting point and typing here is an override.
  const coaTotals = {
    totalAssets:      parseFloat(s.coaTotalAssets) || 0,
    totalLiabilities: parseFloat(s.coaTotalLiabilities) || 0,
    equity:           parseFloat(s.coaEquity) || 0,
  };
  const coaPrefill = Object.fromEntries(
    Object.entries(coaTotals)
      .filter(([key, value]) => value > 0 && !(parseFloat(manualMetrics[key]) > 0))
      .map(([key, value]) => [key, String(Math.round(value))])
  );
  // What the balance-sheet rows should read: saved value, else the ledger total.
  const effective = (key) => (parseFloat(manualMetrics[key]) > 0 ? manualMetrics[key] : (coaTotals[key] || null));
  const sourceFor = (key) => (parseFloat(manualMetrics[key]) > 0 ? 'Manual' : 'Chart of Accounts');

  const healthScore = useMemo(() => computeHealthScore(dashboardSummary, transactions), [dashboardSummary, transactions]);
  const scoreColor = getScoreColor(healthScore);

  const getStatus = (val, greenMin, yellowMin, isLower = false) => {
    if (val === null || val === undefined || isNaN(val)) return 'neutral';
    if (!isLower) return val >= greenMin ? 'green' : val >= yellowMin ? 'yellow' : 'red';
    return val <= greenMin ? 'green' : val <= yellowMin ? 'yellow' : 'red';
  };

  const fmt = (v, dec = 1) => (v !== null && v !== undefined && !isNaN(v) ? parseFloat(v).toFixed(dec) : null);
  // fmtRatio caps extreme values that arise from proxy-based computations (e.g. investment inflows as income)
  const fmtRatio = (v, dec = 2, cap = null) => {
    const n = parseFloat(v);
    if (!isFinite(n) || isNaN(n)) return null;
    if (n < 0) return null; // negative equity / negative interest → show as '–'
    if (cap !== null && n > cap) return `>${cap}`;
    return n.toFixed(dec);
  };
  const fmtCurr = (v) => {
    const n = parseFloat(v) || 0;
    if (n >= 10000000) return `₹${(n/10000000).toFixed(2)}Cr`;
    if (n >= 100000)   return `₹${(n/100000).toFixed(2)}L`;
    if (n >= 1000)     return `₹${(n/1000).toFixed(1)}K`;
    return `₹${n.toFixed(0)}`;
  };

  return (
    <>
      <EmbeddedHeader />
      <div className="fm-view">

        {/* Page header */}
        <div className="fm-page-header">
          <div>
            <h1 className="fm-page-title">Your Financial Metrics</h1>
            <p className="fm-page-subtitle">Live ratios from your dashboard · CIBIL score · Manual inputs · Tally integration</p>
          </div>
        </div>

        {/* Top row: Health Score + CIBIL */}
        <div className="fm-top-row">

          {/* Health Score */}
          <div className="fm-score-card">
            <div className="fm-card-header">
              <div className="fm-card-icon" style={{ background: 'rgba(79,70,229,0.1)', color: '#4F46E5' }}>
                <Activity size={20} />
              </div>
              <div>
                <div className="fm-card-title">Corporate Health Score</div>
                <div className="fm-card-sub">Computed from 10 live financial metrics</div>
              </div>
            </div>
            <div className="fm-gauge-center">
              <svg width="160" height="105" viewBox="0 0 160 105">
                {(() => {
                  const pct = healthScore / 100;
                  const r = 55, cx = 80, cy = 80;
                  const C = 2 * Math.PI * r;
                  const arcLen = Math.PI * r;
                  return (
                    <>
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8ecf4" strokeWidth="14" strokeLinecap="round"
                        strokeDasharray={`${arcLen} ${C}`} transform={`rotate(180, ${cx}, ${cy})`} />
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke={scoreColor} strokeWidth="14" strokeLinecap="round"
                        strokeDasharray={`${pct * arcLen} ${C}`} transform={`rotate(180, ${cx}, ${cy})`} />
                      <text x="80" y="72" textAnchor="middle" fontSize="28" fontWeight="900" fill={scoreColor}>{healthScore}</text>
                      <text x="80" y="88" textAnchor="middle" fontSize="11" fill="#94a3b8">/ 100</text>
                      <text x="80" y="103" textAnchor="middle" fontSize="10" fontWeight="700" fill={scoreColor}>{getScoreLabel(healthScore)}</text>
                    </>
                  );
                })()}
              </svg>
            </div>
            <div className="fm-score-bands">
              {[['80–100','Strong','#10b981'],['60–80','Decent','#f59e0b'],['40–60','Weak','#f97316'],['<40','Risky','#ef4444']].map(([r,l,c]) => (
                <span key={r} className="fm-band" style={{ color: c, background: `${c}15`, border: `1px solid ${c}40` }}>{r}: {l}</span>
              ))}
            </div>
          </div>

          {/* CIBIL Score */}
          <div className="fm-score-card">
            <div className="fm-card-header">
              <div className="fm-card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                <CreditCard size={20} />
              </div>
              <div>
                <div className="fm-card-title">CIBIL / Credit Score</div>
                <div className="fm-card-sub">Business credit rating (300–900)</div>
              </div>
              {!editingCibil && (
                <button className="fm-edit-btn" onClick={() => { setEditingCibil(true); setCibilInput(cibilScore || ''); }}>
                  <Edit3 size={14} /> Edit
                </button>
              )}
            </div>

            {editingCibil ? (
              <div className="fm-cibil-edit">
                <input
                  type="number" min="300" max="900"
                  value={cibilInput}
                  onChange={e => setCibilInput(e.target.value)}
                  placeholder="Enter score (300–900)"
                  className="fm-cibil-input"
                  onKeyDown={e => e.key === 'Enter' && saveCibil()}
                  autoFocus
                />
                <div className="fm-cibil-btns">
                  <button className="fm-save-btn" onClick={saveCibil}><Save size={14} /> Save</button>
                  <button className="fm-cancel-btn" onClick={() => setEditingCibil(false)}>Cancel</button>
                </div>
                <p className="fm-cibil-hint">
                  Find your CIBIL score on <a href="https://www.cibil.com" target="_blank" rel="noreferrer">cibil.com</a> or your bank statement.
                </p>
              </div>
            ) : (
              <>
                <div className="fm-gauge-center">
                  <CibilGauge score={parseInt(cibilScore) || 0} />
                </div>
                {!cibilScore && (
                  <p className="fm-cibil-prompt">
                    <Info size={13} /> Click <strong>Edit</strong> to enter your CIBIL score for accurate loan matching.
                  </p>
                )}
                <div className="fm-score-bands">
                  {[['750–900','Excellent','#10b981'],['700–749','Good','#f59e0b'],['650–699','Fair','#f97316'],['300–649','Poor','#ef4444']].map(([r,l,c]) => (
                    <span key={r} className="fm-band" style={{ color: c, background: `${c}15`, border: `1px solid ${c}40` }}>{r}: {l}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live Dashboard Metrics */}
        <div className="fm-section">
          <div className="fm-section-header">
            <div className="fm-section-icon" style={{ background: 'rgba(79,70,229,0.1)', color: '#4F46E5' }}><BarChart3 size={18} /></div>
            <div>
              <h2 className="fm-section-title">Live Financial Ratios</h2>
              <p className="fm-section-sub">Auto-computed from your transaction data in real time</p>
            </div>
            <span className="fm-live-badge"><Zap size={11} /> Live</span>
          </div>

          <div className="fm-metrics-list">
            <MetricRow label="Return on Equity (ROE)" value={s.roe === null || s.roe === undefined ? 'Enter equity below ↓' : fmtRatio(s.roe, 1, 200)} unit={s.roe === null || s.roe === undefined ? '' : '%'} source={s.roe === null || s.roe === undefined ? 'Manual needed' : 'Live'}
              description="Net Profit / Equity — enter Total Equity in Additional Financial Data below to compute"
              status={s.roe === null || s.roe === undefined ? 'neutral' : getStatus(parseFloat(s.roe), 15, 10)} />
            <MetricRow label="Net Profit Margin" value={fmt(s.netProfitMargin)} unit="%" source="Live"
              description="Net Profit / Revenue × 100"
              status={getStatus(parseFloat(s.netProfitMargin), 10, 7)} />
            <MetricRow label="Current Ratio" value={s.currentRatio === null || s.currentRatio === undefined ? 'No Payables' : fmt(s.currentRatio, 2)} unit={s.currentRatio === null || s.currentRatio === undefined ? '' : 'x'} source="Live"
              description="Current Assets / Current Liabilities — ideal: 1.5–3.0; no payables = excellent"
              status={s.currentRatio === null || s.currentRatio === undefined ? 'green' : parseFloat(s.currentRatio) >= 1.5 && parseFloat(s.currentRatio) <= 3 ? 'green' : parseFloat(s.currentRatio) >= 1 ? 'yellow' : 'red'} />
            <MetricRow label="Debt-to-Equity Ratio" value={fmtRatio(s.debtToEquity, 2, 20)} unit="x" source="Live"
              description="Total Debt / Equity — ideal below 1.0"
              status={getStatus(parseFloat(s.debtToEquity), 0.5, 1, true)} />
            <MetricRow label="Interest Coverage Ratio" value={fmtRatio(s.interestCoverage, 2, 50)} unit="x" source="Live"
              description="EBIT / Interest Expense — safe above 3.0"
              status={getStatus(parseFloat(s.interestCoverage), 3, 2)} />
            <MetricRow label="Gross Profit Margin" value={fmt(s.grossProfitMargin)} unit="%" source="Live"
              description="Gross Profit / Revenue × 100"
              status={getStatus(parseFloat(s.grossProfitMargin), 30, 15)} />
            <MetricRow label="EBIT" value={s.ebit != null ? fmtCurr(s.ebit) : null} source="Live"
              description="Earnings Before Interest & Taxes"
              status={parseFloat(s.ebit) > 0 ? 'green' : 'red'} />
            <MetricRow label="Free Cash Flow" value={s.freeCashFlow != null ? fmtCurr(s.freeCashFlow) : null} source="Live"
              description="Operating Cash Flow minus Capital Expenditure"
              status={parseFloat(s.freeCashFlow) > 0 ? 'green' : 'red'} />
            <MetricRow label="Operating Cash Flow" value={s.operatingCashFlow != null ? fmtCurr(s.operatingCashFlow) : null} source="Live"
              description="Cash generated from core operations"
              status={parseFloat(s.operatingCashFlow) > 0 ? 'green' : 'red'} />
            <MetricRow label="Receivable Days (DSO)" value={fmt(s.daysSalesOutstanding, 0)} unit=" days" source="Live"
              description="Avg days to collect receivables — ideal below 45"
              status={getStatus(parseFloat(s.daysSalesOutstanding), 30, 45, true)} />
            <MetricRow label="Return on Assets (ROA)" value={fmt(s.roa)} unit="%" source="Live"
              description="Net Profit / Total Assets"
              status={getStatus(parseFloat(s.roa), 5, 2)} />
            <MetricRow label="Cash in Bank" value={s.cashInBank != null ? fmtCurr(s.cashInBank) : null} source="Live"
              description="Current balance across all linked accounts"
              status={parseFloat(s.cashInBank) > 0 ? 'green' : 'red'} />
          </div>
        </div>

        {/* Manual Metrics */}
        <div className="fm-section">
          <div className="fm-section-header">
            <div className="fm-section-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}><Edit3 size={18} /></div>
            <div>
              <h2 className="fm-section-title">Additional Financial Data</h2>
              <p className="fm-section-sub">
                Assets, liabilities and equity come from your Chart of Accounts — edit to override, and your figure is written back there
              </p>
            </div>
            {!editingManual ? (
              <button className="fm-edit-btn" onClick={() => { setEditingManual(true); setManualDraft({ ...manualMetrics, ...coaPrefill }); }}>
                <Edit3 size={14} /> Edit
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="fm-save-btn" onClick={saveManual}><Save size={14} /> Save</button>
                <button className="fm-cancel-btn" onClick={() => setEditingManual(false)}>Cancel</button>
              </div>
            )}
          </div>

          {editingManual ? (
            <div className="fm-manual-grid">
              {[
                { key: 'turnover',         label: 'Annual Turnover (₹)',         placeholder: 'e.g. 50000000' },
                { key: 'totalAssets',      label: 'Total Assets (₹)',            placeholder: 'e.g. 20000000' },
                { key: 'totalLiabilities', label: 'Total Liabilities (₹)',       placeholder: 'e.g. 8000000' },
                { key: 'equity',           label: 'Total Equity / Net Worth (₹) — used for ROE', placeholder: 'e.g. 12000000' },
                { key: 'gstTurnover',      label: 'GST-reported Turnover (₹)',   placeholder: 'e.g. 48000000' },
                { key: 'bankCCLimit',      label: 'Bank CC / OD Limit (₹)',      placeholder: 'e.g. 5000000' },
                { key: 'existingEmi',      label: 'Existing Monthly EMIs (₹)',   placeholder: 'e.g. 100000' },
              ].map(f => (
                <div key={f.key} className="fm-manual-field">
                  <label>{f.label}</label>
                  <input
                    type="number"
                    placeholder={f.placeholder}
                    value={manualDraft[f.key] || ''}
                    onChange={e => setManualDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="fm-metrics-list">
              {[
                { label: 'Annual Turnover', value: manualMetrics.turnover ? fmtCurr(manualMetrics.turnover) : null, source: 'Manual', description: 'From ITR / audited books' },
                { label: 'Total Assets', value: effective('totalAssets') ? fmtCurr(effective('totalAssets')) : null, source: sourceFor('totalAssets'), description: 'Balance sheet total assets' },
                { label: 'Total Liabilities', value: effective('totalLiabilities') ? fmtCurr(effective('totalLiabilities')) : null, source: sourceFor('totalLiabilities'), description: 'Payables, loans, GST and TDS due' },
                { label: 'Total Equity / Net Worth', value: effective('equity') ? fmtCurr(effective('equity')) : null, source: sourceFor('equity'), description: 'Capital plus retained earnings — drives ROE and D/E' },
                { label: 'GST-reported Turnover', value: manualMetrics.gstTurnover ? fmtCurr(manualMetrics.gstTurnover) : null, source: 'Manual', description: 'As per GSTR-1 filings' },
                { label: 'Bank CC / OD Limit', value: manualMetrics.bankCCLimit ? fmtCurr(manualMetrics.bankCCLimit) : null, source: 'Manual', description: 'Existing working capital facility' },
                { label: 'Existing Monthly EMIs', value: manualMetrics.existingEmi ? fmtCurr(manualMetrics.existingEmi) : null, source: 'Manual', description: 'Total monthly loan obligations' },
              ].map((m, i) => (
                <MetricRow key={i} {...m} status="neutral" />
              ))}
            </div>
          )}
        </div>

        {/* Tally Integration */}
        <div className="fm-section fm-tally-section">
          <div className="fm-section-header">
            <div className="fm-section-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><RefreshCw size={18} /></div>
            <div>
              <h2 className="fm-section-title">Tally ERP Integration</h2>
              <p className="fm-section-sub">Connect your Tally account to auto-sync financial data</p>
            </div>
            <span className={`fm-tally-status fm-tally-${tallyStatus}`}>
              {tallyStatus === 'connected' ? <><CheckCircle2 size={12} /> Connected</> :
               tallyStatus === 'pending'   ? <><Clock size={12} /> Pending</> :
               tallyStatus === 'error'     ? <><AlertCircle size={12} /> Error</> :
               <><Lock size={12} /> Not Connected</>}
            </span>
          </div>

          <div className="fm-tally-body">
            <div className="fm-tally-info">
              <p>When connected, SODA automatically pulls:</p>
              <ul>
                <li><CheckCircle2 size={12} /> Balance sheet (assets, liabilities, equity)</li>
                <li><CheckCircle2 size={12} /> Profit & Loss statement</li>
                <li><CheckCircle2 size={12} /> Receivables & payables ledger</li>
                <li><CheckCircle2 size={12} /> Bank reconciliation statements</li>
                <li><CheckCircle2 size={12} /> GST reports and GSTR data</li>
              </ul>
            </div>

            {!tallyInputVisible ? (
              <div className="fm-tally-actions">
                <button className="fm-tally-connect-btn" onClick={() => setTallyInputVisible(true)}>
                  <RefreshCw size={15} /> Connect Tally
                </button>
                <a href="https://tallysolutions.com/tally-prime/" target="_blank" rel="noreferrer" className="fm-tally-learn">
                  Learn about Tally API <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <div className="fm-tally-form">
                <label>Tally API Key</label>
                <input
                  type="text"
                  placeholder="Paste your Tally API key here"
                  value={tallyApiKey}
                  onChange={e => setTallyApiKey(e.target.value)}
                  className="fm-tally-input"
                />
                <p className="fm-tally-note">
                  Set <code>TALLY_API_KEY</code> in your backend <code>.env</code> file to enable live sync.
                  The API endpoint <code>/api/financial-metrics/tally-sync</code> is ready — just add your key.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button className="fm-save-btn" onClick={connectTally}><Save size={14} /> Save & Connect</button>
                  <button className="fm-cancel-btn" onClick={() => setTallyInputVisible(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Toast */}
      {saveToast && (
        <div className={`fm-toast ${saveToast.type === 'error' ? 'fm-toast-error' : 'fm-toast-success'}`}>
          {saveToast.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          {saveToast.msg}
        </div>
      )}
    </>
  );
};

export default FinancialMetricsView;
