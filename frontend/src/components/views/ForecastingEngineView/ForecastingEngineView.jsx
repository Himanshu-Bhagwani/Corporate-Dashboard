import React, { useState, useEffect, useMemo } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { CalendarClock, Lock, Crown, CheckCircle, TrendingUp, TrendingDown, Wallet2, Flame, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { dashboardAPI } from '../../../services/api';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import './ForecastingEngineView.css';

const fmtINR = (n) => {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="forecast-tooltip">
      <p className="tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '4px 0', fontSize: 13, color: p.color, fontWeight: 500 }}>
          {p.name}: {fmtINR(p.value)}
        </p>
      ))}
    </div>
  );
};

const Paywall = () => (
  <>
    <EmbeddedHeader />
    <div className="view-header forecast-header">
      <div>
        <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarClock size={28} style={{ color: 'var(--primary-color)' }} />
          Forecasting Engine
        </h1>
        <p className="view-subtitle">Predictive cash runway and scenario modeling powered by your real data</p>
      </div>
    </div>
    <div className="aicfo-paywall-container">
      <div className="aicfo-paywall-card">
        <div className="aicfo-paywall-icon"><Lock size={48} /></div>
        <h2>Unlock the Forecasting Engine</h2>
        <p>Upgrade to <strong>Growth</strong> or <strong>Enterprise</strong> to access forward-looking financial intelligence.</p>
        <div className="aicfo-paywall-features">
          <ul>
            <li><CheckCircle size={16} /> Cash Runway Projection (3/6/12 months)</li>
            <li><CheckCircle size={16} /> Revenue &amp; Expense Trend Lines</li>
            <li><CheckCircle size={16} /> What-If Scenario Modeler</li>
            <li><CheckCircle size={16} /> Burn Rate &amp; Runway Alerts</li>
          </ul>
        </div>
        <button className="aicfo-paywall-btn"><Crown size={18} /> Upgrade to Growth</button>
      </div>
    </div>
  </>
);

const ForecastingEngineView = () => {
  const { currentCompany } = useAuth();
  const isLaunchpad = currentCompany?.plan === 'Launchpad';

  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [timeframe, setTimeframe]       = useState(6);

  const [revAdj,      setRevAdj]      = useState(0);
  const [costAdj,     setCostAdj]     = useState(0);
  const [showScenario, setShowScenario] = useState(false);

  useEffect(() => {
    if (!currentCompany || isLaunchpad) { setLoading(false); return; }
    dashboardAPI.getInsights(currentCompany.id)
      .then(data => setForecastData(data.forecast))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentCompany, isLaunchpad]);

  const chartData = useMemo(() => {
    if (!forecastData) return [];

    // Base: stable average monthly run-rate (not a single volatile month)
    const baseRev = forecastData.avgMonthlyRevenue || 0;
    const baseExp = forecastData.avgMonthlyExpense || 0;

    // True MoM growth rates computed from user's actual transaction history
    const momRevGrowth = forecastData.momRevGrowth ?? (parseFloat(forecastData.revGrowthDisplay || 0) / 100);
    const momExpGrowth = forecastData.momExpGrowth ?? (parseFloat(forecastData.expGrowthDisplay || 0) / 100);

    // Scenario adjustments are additive monthly % on top of baseline trend
    const scenRevGrowth = momRevGrowth + revAdj  / 100;
    const scenExpGrowth = momExpGrowth + costAdj / 100;

    let cashBase = forecastData.cashInBank || 0;
    let cashScen = cashBase;

    return Array.from({ length: timeframe + 1 }, (_, i) => {
      const label = i === 0 ? 'Now' : `+${i}M`;

      // Compound projection from the average base
      const projRevBase = baseRev * Math.pow(1 + momRevGrowth, i);
      const projExpBase = baseExp * Math.pow(1 + momExpGrowth, i);
      const projRevScen = baseRev * Math.pow(1 + scenRevGrowth, i);
      const projExpScen = baseExp * Math.pow(1 + scenExpGrowth, i);

      if (i > 0) {
        cashBase += projRevBase - projExpBase;
        cashScen += projRevScen - projExpScen;
      }

      return {
        label,
        cash:         cashBase,
        scenarioCash: showScenario ? cashScen : undefined,
        revenue:      projRevBase,
        expenses:     projExpBase,
      };
    });
  }, [forecastData, timeframe, revAdj, costAdj, showScenario]);

  if (isLaunchpad) return <Paywall />;

  const fd     = forecastData;
  const runway = fd ? parseFloat(fd.runway || 0) : 0;
  const runwayStatus = runway > 12
    ? { text: `${runway.toFixed(1)} mo — Secure`,   bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' }
    : runway > 6
    ? { text: `${runway.toFixed(1)} mo — Caution`,  bg: '#fffbeb', color: '#d97706', border: '#fcd34d' }
    : { text: `${runway.toFixed(1)} mo — Critical`, bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' };

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header forecast-header">
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CalendarClock size={28} style={{ color: 'var(--primary-color)' }} />
            Forecasting Engine
          </h1>
          <p className="view-subtitle">Cash runway, revenue trends &amp; scenario planning — based on your transaction history</p>
        </div>
        <div className="timeframe-toggles">
          {[3, 6, 12].map(t => (
            <button key={t} className={`toggle-btn ${timeframe === t ? 'active' : ''}`} onClick={() => setTimeframe(t)}>
              {t} Months
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="forecast-metrics-grid">
        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            <TrendingUp size={20} />
          </div>
          <div className="metric-content">
            <p>Avg Monthly Revenue</p>
            <h3>{loading ? '…' : fmtINR(fd?.avgMonthlyRevenue)}</h3>
            <span style={{ color: parseFloat(fd?.revGrowthDisplay) >= 0 ? '#059669' : '#dc2626' }}>
              {parseFloat(fd?.revGrowthDisplay) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(fd?.revGrowthDisplay || 0))}% MoM trend
            </span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <Flame size={20} />
          </div>
          <div className="metric-content">
            <p>Monthly Burn Rate</p>
            <h3>{loading ? '…' : fmtINR(fd?.avgMonthlyExpense)}</h3>
            <span style={{ color: parseFloat(fd?.expGrowthDisplay) >= 0 ? '#dc2626' : '#059669' }}>
              {parseFloat(fd?.expGrowthDisplay) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(fd?.expGrowthDisplay || 0))}% MoM trend
            </span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#dcfce7', color: '#059669' }}>
            <Wallet2 size={20} />
          </div>
          <div className="metric-content">
            <p>Cash in Bank</p>
            <h3>{loading ? '…' : fmtINR(fd?.cashInBank)}</h3>
            <span>Current balance</span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
            <CalendarClock size={20} />
          </div>
          <div className="metric-content">
            <p>Cash Runway</p>
            <h3 style={{ color: runway < 6 ? '#dc2626' : runway < 12 ? '#d97706' : '#059669' }}>
              {loading ? '…' : `${runway.toFixed(1)} mo`}
            </h3>
            <span>{loading ? '' : runwayStatus.text.split('—')[1]?.trim()}</span>
          </div>
        </div>
      </div>

      {/* Runway Chart */}
      <div className="runway-card">
        <div className="runway-card-header">
          <div>
            <h3>Cash Runway Projection</h3>
            <p className="card-subtitle">Forward visibility of cash reserves against projected burn</p>
          </div>
          {!loading && (
            <div className="runway-status" style={{
              background: runwayStatus.bg, color: runwayStatus.color, border: `1px solid ${runwayStatus.border}`
            }}>
              {runwayStatus.text}
            </div>
          )}
        </div>

        {!loading && fd?.projectionBasis && (
          <div style={{ padding: '0 0 12px', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', flexShrink: 0 }} />
            Projection basis: {fd.projectionBasis} · MoM growth {parseFloat(fd.revGrowthDisplay) >= 0 ? '+' : ''}{fd.revGrowthDisplay}% rev / {parseFloat(fd.expGrowthDisplay) >= 0 ? '+' : ''}{fd.expGrowthDisplay}% costs
          </div>
        )}

        <div className="chart-container" style={{ height: 380 }}>
          {loading ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              Loading forecast data…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="scenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickFormatter={fmtINR} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={72} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 16 }} />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
                <Area dataKey="cash" name="Cash (Baseline)" fill="url(#cashGrad)" stroke="#10b981" strokeWidth={3} dot={false} />
                {showScenario && (
                  <Area dataKey="scenarioCash" name="Cash (Scenario)" fill="url(#scenGrad)" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                )}
                <Line dataKey="revenue"  name="Proj. Revenue"  stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line dataKey="expenses" name="Proj. Expenses" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Scenario Modeler */}
      <div className="scenario-card">
        <div className="scenario-header" onClick={() => setShowScenario(s => !s)}>
          <div className="scenario-title">
            <SlidersHorizontal size={20} style={{ color: '#6366f1' }} />
            <h3>What-If Scenario Modeler</h3>
            <span className="scenario-badge">Interactive</span>
          </div>
          <span className="scenario-toggle-hint">{showScenario ? '▲ Hide' : '▼ Model a scenario'}</span>
        </div>

        {showScenario && (
          <div className="scenario-body">
            <p className="scenario-desc">
              Adjust sliders to model a different trajectory. The purple dashed line on the chart shows your scenario vs the green baseline.
            </p>
            <div className="scenario-sliders">
              <div className="slider-row">
                <div className="slider-label">
                  <TrendingUp size={15} style={{ color: '#059669' }} />
                  <span>Revenue Growth Adjustment</span>
                  <strong className={revAdj >= 0 ? 'pos' : 'neg'}>{revAdj >= 0 ? '+' : ''}{revAdj}% / mo</strong>
                </div>
                <input type="range" min={-30} max={30} step={1} value={revAdj}
                  onChange={e => setRevAdj(Number(e.target.value))} className="scenario-slider rev" />
                <div className="slider-bounds"><span>−30%</span><span>0</span><span>+30%</span></div>
              </div>
              <div className="slider-row">
                <div className="slider-label">
                  <TrendingDown size={15} style={{ color: '#dc2626' }} />
                  <span>Cost Increase Adjustment</span>
                  <strong className={costAdj <= 0 ? 'pos' : 'neg'}>{costAdj >= 0 ? '+' : ''}{costAdj}% / mo</strong>
                </div>
                <input type="range" min={-30} max={30} step={1} value={costAdj}
                  onChange={e => setCostAdj(Number(e.target.value))} className="scenario-slider cost" />
                <div className="slider-bounds"><span>−30%</span><span>0</span><span>+30%</span></div>
              </div>
            </div>

            {(revAdj !== 0 || costAdj !== 0) && (
              <div className="scenario-impact">
                <span className="impact-label">Scenario at +{timeframe} months:</span>
                <div className="impact-chips">
                  <span className="impact-chip blue">Revenue {revAdj >= 0 ? '+' : ''}{revAdj}% vs baseline</span>
                  <span className="impact-chip red">Costs {costAdj >= 0 ? '+' : ''}{costAdj}% vs baseline</span>
                  <span className={`impact-chip ${(revAdj - costAdj) >= 0 ? 'green' : 'red'}`}>
                    {(revAdj - costAdj) >= 0 ? 'Improved' : 'Worse'} net trajectory
                  </span>
                </div>
                <button className="reset-scenario" onClick={() => { setRevAdj(0); setCostAdj(0); }}>Reset to baseline</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historical Table */}
      <div className="runway-card" style={{ marginTop: 24 }}>
        <div className="runway-card-header">
          <div>
            <h3>Monthly P&amp;L History</h3>
            <p className="card-subtitle">Historical actuals used to compute the projections above</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Month', 'Revenue', 'Expenses', 'Net Profit', 'Margin'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Month' ? 'left' : 'right', color: '#64748b', fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(fd?.historicalData || []).map((m, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafe' : 'white' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: '#374151' }}>{m.name}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmtINR(m.revenue)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtINR(m.expenses)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: m.netProfit >= 0 ? '#1a202c' : '#dc2626' }}>{fmtINR(m.netProfit)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: parseFloat(m.margin) > 20 ? '#059669' : parseFloat(m.margin) > 0 ? '#d97706' : '#dc2626' }}>{m.margin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default ForecastingEngineView;
