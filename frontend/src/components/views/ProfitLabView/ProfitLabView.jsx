import React, { useState, useEffect } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { Activity, Lock, Crown, CheckCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { dashboardAPI } from '../../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area, ComposedChart, Line
} from 'recharts';
import './ProfitLabView.css';

const fmtINR = (n) => {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

const heatColor = (val) => {
  if (val === null || val === undefined) return '#e2e8f0';
  if (val > 40) return '#059669';
  if (val > 25) return '#3b82f6';
  if (val > 10) return '#f59e0b';
  return '#ef4444';
};

const Paywall = () => (
  <>
    <EmbeddedHeader />
    <div className="view-header profit-header">
      <div>
        <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={28} style={{ color: 'var(--primary-color)' }} />
          Profit Lab
        </h1>
        <p className="view-subtitle">Margin intelligence and multi-dimensional profit analysis</p>
      </div>
    </div>
    <div className="aicfo-paywall-container">
      <div className="aicfo-paywall-card">
        <div className="aicfo-paywall-icon"><Lock size={48} /></div>
        <h2>Unlock the Profit Lab</h2>
        <p>Upgrade to <strong>Growth</strong> or <strong>Enterprise</strong> to unlock margin insights, segment breakdowns, and cost intelligence.</p>
        <div className="aicfo-paywall-features">
          <ul>
            <li><CheckCircle size={16} /> Quarterly Margin Heatmap</li>
            <li><CheckCircle size={16} /> Revenue &amp; Expense Trend (12 months)</li>
            <li><CheckCircle size={16} /> Income Segment Profitability</li>
            <li><CheckCircle size={16} /> Cost Centre Breakdown</li>
          </ul>
        </div>
        <button className="aicfo-paywall-btn"><Crown size={18} /> Upgrade to Growth</button>
      </div>
    </div>
  </>
);

const ProfitLabView = () => {
  const { currentCompany } = useAuth();
  const isLaunchpad = currentCompany?.plan === 'Launchpad';
  const [labData, setLabData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentCompany || isLaunchpad) { setLoading(false); return; }
    dashboardAPI.getInsights(currentCompany.id)
      .then(data => setLabData(data.profitLab))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentCompany, isLaunchpad]);

  if (isLaunchpad) return <Paywall />;

  const ld          = labData || {};
  const segments    = ld.segments    || [];
  const topExpenses = ld.topExpenses || [];
  const history     = ld.historicalData || [];

  // Heatmap: only show segments that have at least one real quarterly margin
  const heatmapSegments = segments.filter(s =>
    s.Q1 !== null || s.Q2 !== null || s.Q3 !== null || s.Q4 !== null
  ).slice(0, 6);

  // Monthly P&L for chart — last 12 months
  const monthlyChartData = history.map(m => ({
    name:      m.name?.split(' ')[0] || '',
    revenue:   m.revenue,
    expenses:  m.expenses,
    netProfit: m.netProfit ?? (m.revenue - m.expenses),
    margin:    parseFloat(m.margin ?? 0)
  }));

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header profit-header">
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={28} style={{ color: 'var(--primary-color)' }} />
            Profit Lab
          </h1>
          <p className="view-subtitle">Deep-dive margin intelligence built from your last 12 months of actuals</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="pl-kpi-strip">
        <div className="pl-kpi">
          <span className="pl-kpi-label">Total Revenue</span>
          <span className="pl-kpi-value blue">{loading ? '…' : fmtINR(ld.totalRevenue)}</span>
        </div>
        <div className="pl-kpi">
          <span className="pl-kpi-label">Total Expenses</span>
          <span className="pl-kpi-value red">{loading ? '…' : fmtINR(ld.totalExpense)}</span>
        </div>
        <div className="pl-kpi">
          <span className="pl-kpi-label">Net Profit</span>
          <span className={`pl-kpi-value ${(ld.netProfit || 0) >= 0 ? 'green' : 'red'}`}>{loading ? '…' : fmtINR(ld.netProfit)}</span>
        </div>
        <div className="pl-kpi">
          <span className="pl-kpi-label">Gross Margin</span>
          <span className={`pl-kpi-value ${parseFloat(ld.grossMargin) > 20 ? 'green' : 'amber'}`}>{loading ? '…' : `${ld.grossMargin}%`}</span>
        </div>
        <div className="pl-kpi">
          <span className="pl-kpi-label">Monthly Burn</span>
          <span className="pl-kpi-value amber">{loading ? '…' : fmtINR(ld.burnRate)}</span>
        </div>
      </div>

      {/* Monthly P&L Trend */}
      <div className="profit-card">
        <div className="profit-card-header">
          <h3>Revenue vs Expenses vs Net Profit</h3>
          <span className="card-subtitle">Last 12 months — actual ₹ amounts</span>
        </div>
        <div style={{ height: 320 }}>
          {loading ? (
            <div className="pl-loading">Loading…</div>
          ) : monthlyChartData.length === 0 ? (
            <div className="pl-loading">No transaction data found.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyChartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickFormatter={fmtINR} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={72} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(val, name) => [fmtINR(val), name]}
                />
                <Area dataKey="revenue" name="Revenue" fill="url(#revGrad)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Bar  dataKey="expenses" name="Expenses" fill="#fca5a5" radius={[3, 3, 0, 0]} />
                <Line dataKey="netProfit" name="Net Profit" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#059669' }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="profit-grid">
        {/* Segment profitability */}
        <div className="profit-card span-2">
          <div className="profit-card-header">
            <h3>Income Segment Profitability</h3>
            <span className="card-subtitle">Revenue &amp; net margin % by income category</span>
          </div>
          <div style={{ height: 280 }}>
            {loading ? <div className="pl-loading">Loading…</div> : segments.length === 0 ? (
              <div className="pl-loading">No income data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segments.slice(0, 8)} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(val, name) => [name === 'profitMargin' ? `${val}%` : fmtINR(val), name === 'profitMargin' ? 'Margin %' : 'Revenue']}
                  />
                  <Bar dataKey="profitMargin" name="profitMargin" radius={[4, 4, 0, 0]}>
                    {segments.slice(0, 8).map((s, i) => (
                      <Cell key={i} fill={heatColor(s.profitMargin)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {!loading && segments.length > 0 && (
            <div className="pl-legend-row">
              <span className="pl-legend-chip" style={{ background: '#dcfce7', color: '#059669' }}>{'> 40%'} Excellent</span>
              <span className="pl-legend-chip" style={{ background: '#dbeafe', color: '#1d4ed8' }}>25–40% Good</span>
              <span className="pl-legend-chip" style={{ background: '#fef3c7', color: '#d97706' }}>10–25% Average</span>
              <span className="pl-legend-chip" style={{ background: '#fee2e2', color: '#dc2626' }}>{'< 10%'} Low</span>
            </div>
          )}
        </div>

        {/* Top Cost Centres */}
        <div className="profit-card span-2">
          <div className="profit-card-header">
            <h3>Cost Centre Breakdown</h3>
            <span className="card-subtitle">All-time expense by category</span>
          </div>
          {loading ? <div className="pl-loading">Loading…</div> : (
            <div className="pl-cost-list">
              {topExpenses.map((exp, i) => (
                <div key={i} className="pl-cost-row">
                  <div className="pl-cost-rank">{i + 1}</div>
                  <div className="pl-cost-name">{exp.name}</div>
                  <div className="pl-cost-bar-wrap">
                    <div className="pl-cost-bar" style={{ width: `${exp.percent}%`, background: i === 0 ? '#ef4444' : i < 3 ? '#f97316' : '#94a3b8' }} />
                  </div>
                  <div className="pl-cost-pct">{exp.percent}%</div>
                  <div className="pl-cost-amt">{fmtINR(exp.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quarterly Margin Heatmap */}
        <div className="profit-card" style={{ gridColumn: '1 / -1' }}>
          <div className="profit-card-header">
            <h3>Quarterly Margin Heatmap</h3>
            <span className="card-subtitle">Net profit margin % by income category × fiscal quarter (Indian FY: Q1=Apr–Jun, Q4=Jan–Mar)</span>
          </div>
          {loading ? <div className="pl-loading">Loading…</div> : heatmapSegments.length === 0 ? (
            <div className="pl-loading">Not enough quarterly data — add more transactions to see the heatmap.</div>
          ) : (
            <div className="heatmap-container">
              <table className="heatmap-table">
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th>Q1 (Apr–Jun)</th>
                    <th>Q2 (Jul–Sep)</th>
                    <th>Q3 (Oct–Dec)</th>
                    <th>Q4 (Jan–Mar)</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapSegments.map((s, i) => (
                    <tr key={i}>
                      <td className="category-name">{s.name}</td>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                        <td key={q}
                          style={{
                            background: heatColor(s[q]),
                            color: s[q] === null ? '#94a3b8' : '#fff',
                            textAlign: 'center',
                            fontWeight: 600,
                            padding: '10px 8px',
                            fontSize: 13
                          }}>
                          {s[q] === null ? '—' : `${s[q]}%`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="heatmap-legend">
                <span style={{ background: '#059669', color: '#fff' }}>&gt;40% Excellent</span>
                <span style={{ background: '#3b82f6', color: '#fff' }}>25–40% Good</span>
                <span style={{ background: '#f59e0b', color: '#fff' }}>10–25% Average</span>
                <span style={{ background: '#ef4444', color: '#fff' }}>&lt;10% Low</span>
                <span style={{ background: '#e2e8f0', color: '#94a3b8' }}>— No data</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly margin trend as area chart */}
      <div className="profit-card">
        <div className="profit-card-header">
          <TrendingUp size={18} style={{ color: '#10b981' }} />
          <h3>Net Profit Margin Trend</h3>
          <span className="card-subtitle">%</span>
        </div>
        <div style={{ height: 220 }}>
          {loading ? <div className="pl-loading">Loading…</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyChartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={48} />
                <Tooltip formatter={v => [`${v}%`, 'Margin']} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Area type="monotone" dataKey="margin" name="Margin %" stroke="#10b981" strokeWidth={2.5} fill="url(#marginGrad)" dot={{ r: 3, fill: '#10b981' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
};

export default ProfitLabView;
