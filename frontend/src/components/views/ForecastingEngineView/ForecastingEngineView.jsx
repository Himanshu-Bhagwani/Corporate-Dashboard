import React, { useState } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { LineChart, CalendarClock, Lock, Crown, CheckCircle, ArrowUpRight, ArrowDownRight, DollarSign, Wallet2, Calculator } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './ForecastingEngineView.css';

// Generic runway data simulation based on Timeframe filter
const RUNWAY_DATA = {
  3: [
    { month: 'Current', cash: 450000, expenses: 85000, revenue: 110000, runway: 5.2 },
    { month: '+1M', cash: 475000, expenses: 88000, revenue: 115000, runway: 5.3 },
    { month: '+2M', cash: 502000, expenses: 90000, revenue: 118000, runway: 5.5 },
    { month: '+3M', cash: 530000, expenses: 92000, revenue: 125000, runway: 5.7 }
  ],
  6: [
    { month: 'Current', cash: 450000, expenses: 85000, revenue: 110000 },
    { month: '+2M', cash: 502000, expenses: 90000, revenue: 118000 },
    { month: '+4M', cash: 565000, expenses: 105000, revenue: 140000 },
    { month: '+6M', cash: 620000, expenses: 120000, revenue: 160000 }
  ],
  12: [
    { month: 'Q1', cash: 450000, expenses: 260000, revenue: 340000 },
    { month: 'Q2', cash: 530000, expenses: 290000, revenue: 390000 },
    { month: 'Q3', cash: 630000, expenses: 330000, revenue: 450000 },
    { month: 'Q4', cash: 750000, expenses: 380000, revenue: 520000 }
  ]
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="forecast-tooltip">
        <p className="tooltip-label">{label}</p>
        <p className="tooltip-data cash">Cash Reserve: ₹{(payload[0].value / 1000).toFixed(0)}K</p>
        <p className="tooltip-data revenue">Projc. Revenue: ₹{(payload[2].value / 1000).toFixed(0)}K</p>
        <p className="tooltip-data expenses">Projc. Expense: ₹{(payload[1].value / 1000).toFixed(0)}K</p>
      </div>
    );
  }
  return null;
};

const ForecastingEngineView = () => {
  const { currentCompany } = useAuth();
  const isLaunchpad = currentCompany?.plan === 'Launchpad';
  const [timeframe, setTimeframe] = useState(6);

  if (isLaunchpad) {
    return (
      <>
        <EmbeddedHeader />
        <div className="view-header forecast-header">
          <div>
            <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CalendarClock size={28} style={{ color: 'var(--primary-color)' }} />
              Forecasting Engine
            </h1>
            <p className="view-subtitle">Predictive cash runway and predictive metric generation powered by AI</p>
          </div>
        </div>
        
        <div className="aicfo-paywall-container">
          <div className="aicfo-paywall-card">
            <div className="aicfo-paywall-icon">
              <Lock size={48} />
            </div>
            <h2>Unlock the Forecasting Engine</h2>
            <p>Upgrade to the <strong>Growth</strong> or <strong>Enterprise</strong> plan to generate future visibility modules and avoid cash crises.</p>
            <div className="aicfo-paywall-features">
              <ul>
                <li><CheckCircle size={16} /> Cash Runway Projection Graphs</li>
                <li><CheckCircle size={16} /> Revenue \u0026 Expense Forecasts</li>
                <li><CheckCircle size={16} /> Tax Liability Projections</li>
                <li><CheckCircle size={16} /> 3, 6, and 12 Month Views</li>
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

  const currentData = RUNWAY_DATA[timeframe];

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header forecast-header">
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CalendarClock size={28} style={{ color: 'var(--primary-color)' }} />
            Forecasting Engine
          </h1>
          <p className="view-subtitle">Predictive cash runway \u0026 future visibility spanning up to 12 months</p>
        </div>
        <div className="timeframe-toggles">
          <button className={`toggle-btn ${timeframe === 3 ? 'active' : ''}`} onClick={() => setTimeframe(3)}>3 Months</button>
          <button className={`toggle-btn ${timeframe === 6 ? 'active' : ''}`} onClick={() => setTimeframe(6)}>6 Months</button>
          <button className={`toggle-btn ${timeframe === 12 ? 'active' : ''}`} onClick={() => setTimeframe(12)}>12 Months</button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="forecast-metrics-grid">
        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#e0e7ff', color: '#4f46e5' }}>
            <ArrowUpRight size={20} />
          </div>
          <div className="metric-content">
            <p>Revenue Forecast</p>
            <h3>+18%</h3>
            <span>Baseline Trajectory</span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#fee2e2', color: '#ef4444' }}>
            <ArrowDownRight size={20} />
          </div>
          <div className="metric-content">
            <p>Expense Forecast</p>
            <h3>+5%</h3>
            <span>Fixed \u0026 Variable</span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#dcfce7', color: '#10b981' }}>
            <Wallet2 size={20} />
          </div>
          <div className="metric-content">
            <p>Cash Flow Forecast</p>
            <h3>Stable</h3>
            <span>No expected deficits</span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Calculator size={20} />
          </div>
          <div className="metric-content">
            <p>Tax Liability Forecast</p>
            <h3>₹1.8L</h3>
            <span>Estimated Provision</span>
          </div>
        </div>
      </div>

      {/* Main Runway Chart */}
      <div className="runway-card">
        <div className="runway-card-header">
          <div>
            <h3>Cash Runway Projection</h3>
            <p className="card-subtitle">Aggregated view of capital reserves vs burning rate to foresee \u0026 avoid cash crises.</p>
          </div>
          <div className="runway-status secure">
            Status: Secure ( \u003e 12 Mo )
          </div>
        </div>
        
        <div className="chart-container" style={{ height: '400px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={currentData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <defs>
                <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
              <YAxis yAxisId="left" tickFormatter={(v) => `₹${v/1000}k`} axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dx={-10} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              
              <Area yAxisId="left" type="monotone" dataKey="cash" name="Total Cash Reserves" fill="url(#colorCash)" stroke="#10b981" strokeWidth={3} />
              <Line yAxisId="left" type="monotone" dataKey="expenses" name="Projected Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
              <Line yAxisId="left" type="monotone" dataKey="revenue" name="Projected Revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
};

export default ForecastingEngineView;
