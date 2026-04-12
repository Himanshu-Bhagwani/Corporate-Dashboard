import React from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { Activity, Lock, Crown, CheckCircle, TrendingUp, Users, MapPin, Package, Filter } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import './ProfitLabView.css';

const PROFIT_BY_CLIENT = [
  { name: 'Client A', profit: 9, revenue: 32, amt: 9 },
  { name: 'Client B', profit: 24, revenue: 18, amt: 24 },
  { name: 'Client C', profit: 18, revenue: 15, amt: 18 },
  { name: 'Client D', profit: 12, revenue: 10, amt: 12 },
  { name: 'Client E', profit: 15, revenue: 12, amt: 15 },
];

const PROFIT_TREND = [
  { month: 'Jan', margin: 15 },
  { month: 'Feb', margin: 16 },
  { month: 'Mar', margin: 14 },
  { month: 'Apr', margin: 18 },
  { month: 'May', margin: 19 },
  { month: 'Jun', margin: 23 },
  { month: 'Jul', margin: 21 },
];

// Heatmap mock data
const MARGIN_HEATMAP = [
  { category: 'Enterprise Software', Q1: 34, Q2: 38, Q3: 42, Q4: 45 },
  { category: 'Consulting', Q1: 22, Q2: 18, Q3: 25, Q4: 28 },
  { category: 'Support Subscriptions', Q1: 45, Q2: 44, Q3: 47, Q4: 48 },
  { category: 'Hardware Resale', Q1: 8, Q2: 12, Q3: 9, Q4: 11 },
];

const getHeatmapColor = (value) => {
  if (value > 40) return '#10b981'; // Green
  if (value > 25) return '#3b82f6'; // Blue
  if (value > 15) return '#f59e0b'; // Yellow
  return '#ef4444'; // Red
};

const ProfitLabView = () => {
  const { currentCompany } = useAuth();
  const isLaunchpad = currentCompany?.plan === 'Launchpad';

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

      <div className="profit-insight-banner">
        <div className="insight-badge">Critical Insight</div>
        <p>"<strong>Client A</strong> generates <strong>32%</strong> of your total revenue, but contributes only <strong>9%</strong> to the net profit due to high servicing costs."</p>
      </div>

      <div className="profit-grid">
        {/* Profit by Client Chart */}
        <div className="profit-card span-2">
          <div className="profit-card-header">
            <h3>Profit by Client Segment</h3>
            <span className="card-subtitle">Margin vs Revenue Volume (%)</span>
          </div>
          <div className="chart-container" style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PROFIT_BY_CLIENT} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="profit" name="Profit Margin (%)" radius={[4, 4, 0, 0]}>
                  {PROFIT_BY_CLIENT.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.profit < 10 ? '#ef4444' : 'var(--primary-color)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profit Trend Over Time */}
        <div className="profit-card span-2">
          <div className="profit-card-header">
            <h3>Profit Trend Over Time</h3>
            <span className="card-subtitle">Net Profit Margin (%)</span>
          </div>
          <div className="chart-container" style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PROFIT_TREND} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
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
          </div>
        </div>

        {/* Breakdowns Row */}
        <div className="profit-card">
          <div className="profit-card-header">
            <Users size={20} className="icon-blue" />
            <h3>Top Channel Margins</h3>
          </div>
          <ul className="breakdown-list">
            <li><span>Direct Sales</span> <span className="positive">42%</span></li>
            <li><span>Organic Search</span> <span className="positive">38%</span></li>
            <li><span>Paid Ads</span> <span className="warning">14%</span></li>
            <li><span>Affiliates</span> <span className="warning">12%</span></li>
          </ul>
        </div>

        <div className="profit-card">
          <div className="profit-card-header">
            <Package size={20} className="icon-purple" />
            <h3>Product Margins</h3>
          </div>
          <ul className="breakdown-list">
            <li><span>Enterprise Sub</span> <span className="positive">68%</span></li>
            <li><span>Basic Sub</span> <span className="positive">45%</span></li>
            <li><span>Onboarding</span> <span className="warning">22%</span></li>
            <li><span>Custom Dev</span> <span className="negative">8%</span></li>
          </ul>
        </div>

        <div className="profit-card">
          <div className="profit-card-header">
            <MapPin size={20} className="icon-orange" />
            <h3>Location Margins</h3>
          </div>
          <ul className="breakdown-list">
            <li><span>North America</span> <span className="positive">35%</span></li>
            <li><span>Europe (EU)</span> <span className="positive">28%</span></li>
            <li><span>Asia Pacific</span> <span className="warning">15%</span></li>
            <li><span>South America</span> <span className="warning">12%</span></li>
          </ul>
        </div>

        {/* Margin Heatmap Table */}
        <div className="profit-card span-3">
          <div className="profit-card-header">
            <h3>Margin Heatmap</h3>
            <span className="card-subtitle">Quarterly Profit Margins by Product Category (%)</span>
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
                {MARGIN_HEATMAP.map((row, index) => (
                  <tr key={index}>
                    <td className="category-name">{row.category}</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.Q1), color: 'white' }}>{row.Q1}%</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.Q2), color: 'white' }}>{row.Q2}%</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.Q3), color: 'white' }}>{row.Q3}%</td>
                    <td style={{ backgroundColor: getHeatmapColor(row.Q4), color: 'white' }}>{row.Q4}%</td>
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
