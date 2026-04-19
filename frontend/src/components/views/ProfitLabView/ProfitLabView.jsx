import React, { useState, useEffect } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { Activity, Lock, Crown, CheckCircle, TrendingUp, Users, MapPin, Package, Filter } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { dashboardAPI } from '../../../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import './ProfitLabView.css';

const getHeatmapColor = (value) => {
  if (value > 40) return '#10b981'; // Green
  if (value > 25) return '#3b82f6'; // Blue
  if (value > 15) return '#f59e0b'; // Yellow
  return '#ef4444'; // Red
};

const ProfitLabView = () => {
  const { currentCompany } = useAuth();
  const isLaunchpad = currentCompany?.plan === 'Launchpad';
  const [labData, setLabData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      if (!currentCompany || isLaunchpad) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await dashboardAPI.getInsights(currentCompany.id);
        setLabData(data.profitLab);
      } catch (error) {
        console.error('Failed to fetch profit lab insights:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [currentCompany, isLaunchpad]);

  if (isLaunchpad) {
    return (
      <>
        <EmbeddedHeader />
        <div className="view-header profit-header">
          <div>
            <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={28} style={{ color: 'var(--primary-color)' }} />
              Profit Lab
            </h1>
            <p className="view-subtitle">Deep dive into margin intelligence and multi-dimensional profit analysis</p>
          </div>
        </div>
        
        <div className="aicfo-paywall-container">
          <div className="aicfo-paywall-card">
            <div className="aicfo-paywall-icon">
              <Lock size={48} />
            </div>
            <h2>Unlock the Profit Lab</h2>
            <p>Upgrade to the <strong>Growth</strong> or <strong>Enterprise</strong> plan to unlock predictive margins, segment breakdowns, and hidden profit intelligence tools.</p>
            <div className="aicfo-paywall-features">
              <ul>
                <li><CheckCircle size={16} /> Margin Heatmaps</li>
                <li><CheckCircle size={16} /> Customer Profitability Matrices</li>
                <li><CheckCircle size={16} /> Geographic \u0026 Channel Segments</li>
                <li><CheckCircle size={16} /> Real-Time Profit Trends</li>
              </ul>
            </div>
            <button className="aicfo-paywall-btn">
              <Crown size={18} /> Upgrade to Growth
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header profit-header">
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={28} style={{ color: 'var(--primary-color)' }} />
            Profit Lab
          </h1>
          <p className="view-subtitle">Deep dive into margin intelligence and multi-dimensional profit analysis</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary">
            <Filter size={16} />
            Filters
          </button>
        </div>
      </div>



      <div className="profit-grid">
        {/* Profit by Client Chart */}
        <div className="profit-card span-2">
          <div className="profit-card-header">
            <h3>Profit by Income Segment</h3>
            <span className="card-subtitle">Margin vs Revenue Volume (%)</span>
          </div>
          <div className="chart-container" style={{ height: '300px' }}>
            {loading ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={labData?.segments || []} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="profitMargin" name="Profit Margin (%)" radius={[4, 4, 0, 0]}>
                    {(labData?.segments || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.profitMargin < 10 ? '#ef4444' : 'var(--primary-color)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Profit Trend Over Time */}
        <div className="profit-card span-2">
          <div className="profit-card-header">
            <h3>Profit Trend Over Time</h3>
            <span className="card-subtitle">Net Profit Margin (%)</span>
          </div>
          <div className="chart-container" style={{ height: '300px' }}>
            {loading ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={(labData?.historicalData || []).map(h => ({ month: h.name.split(' ')[0], margin: Math.max(0, (h.revenue > 0 ? ((h.revenue - h.expenses) / h.revenue) * 100 : 0)).toFixed(1) }))} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorMargin)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Breakdowns Row */}
        <div className="profit-card span-2">
          <div className="profit-card-header">
            <Users size={20} className="icon-blue" />
            <h3>Top Expense Centers</h3>
          </div>
          <ul className="breakdown-list">
            {loading ? <li>Loading...</li> : 
              (labData?.topExpenses || []).slice(0, 4).map((exp, idx) => (
                <li key={idx}><span>{exp.name}</span> <span className="warning">₹{parseFloat(exp.total).toLocaleString()}</span></li>
              ))
            }
          </ul>
        </div>

        {/* Margin Heatmap Table */}
        <div className="profit-card span-3">
          <div className="profit-card-header">
            <h3>Margin Heatmap</h3>
            <span className="card-subtitle">Simulated Quarterly Profit Margins by Product Category (%)</span>
          </div>
          <div className="heatmap-container">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="5">Loading...</td></tr> : 
                  (labData?.segments || []).slice(0, 4).map(s => {
                    const base = parseFloat(s.profitMargin);
                    const q1 = Math.max(0, (base + (Math.random() * 5 - 2.5)).toFixed(1));
                    const q2 = Math.max(0, (base + (Math.random() * 5 - 2.5)).toFixed(1));
                    const q3 = Math.max(0, (base + (Math.random() * 5 - 2.5)).toFixed(1));
                    const q4 = Math.max(0, (base + (Math.random() * 5 - 2.5)).toFixed(1));
                    return { category: s.name, q1, q2, q3, q4 };
                  }).map((row, index) => (
                  <tr key={index}>
                    <td className="category-name">{row.category}</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.q1), color: 'white' }}>{row.q1}%</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.q2), color: 'white' }}>{row.q2}%</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.q3), color: 'white' }}>{row.q3}%</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.q4), color: 'white' }}>{row.q4}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfitLabView;
