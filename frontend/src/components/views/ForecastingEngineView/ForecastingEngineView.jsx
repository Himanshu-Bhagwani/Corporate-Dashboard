import React, { useState, useEffect } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { LineChart, CalendarClock, Lock, Crown, CheckCircle, ArrowUpRight, ArrowDownRight, DollarSign, Wallet2, Calculator } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { dashboardAPI } from '../../../services/api';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './ForecastingEngineView.css';

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
  const [forecastData, setForecastData] = useState(null);
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
        setForecastData(data.forecast);
      } catch (error) {
        console.error('Failed to fetch forecasting insights:', error);
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

  const generateChartData = (months) => {
    if (!forecastData || !forecastData.historicalData || forecastData.historicalData.length === 0) return [];
    
    const data = [];
    let currentCash = forecastData.cashInBank || 0;
    
    const history = forecastData.historicalData;
    let baseRevenue = history[history.length - 1].revenue;
    let baseExpenses = history[history.length - 1].expenses;
    
    const revGrowth = parseFloat(forecastData.revGrowthDisplay || '0') / 100;
    const expGrowth = parseFloat(forecastData.expGrowthDisplay || '0') / 100;
    
    for (let i = 0; i <= months; i++) {
      const monthLabel = i === 0 ? 'Current' : `+${i}M`;
      const projRev = baseRevenue * Math.pow(1 + revGrowth, i);
      const projExp = baseExpenses * Math.pow(1 + expGrowth, i);
      
      data.push({
        month: monthLabel,
        cash: currentCash,
        expenses: projExp,
        revenue: projRev
      });
      
      currentCash += (projRev - projExp);
    }
    return data;
  };

  const currentData = generateChartData(timeframe);
  const runwayMonths = forecastData?.avgMonthlyExpense > 0 
    ? (forecastData.cashInBank / forecastData.avgMonthlyExpense) 
    : 99;
  
  const statusObject = runwayMonths > 12 
    ? { text: 'Secure ( > 12 Mo )', background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' } 
    : runwayMonths > 6 
      ? { text: `Caution ( ${runwayMonths.toFixed(1)} Mo )`, background: '#fffbeb', color: '#d97706', borderColor: '#fcd34d' }
      : { text: `Critical ( ${runwayMonths.toFixed(1)} Mo )`, background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' };

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
            <h3>{loading ? "..." : `${parseFloat(forecastData?.revGrowthDisplay || 0) > 0 ? '+' : ''}${forecastData?.revGrowthDisplay || 0}%`}</h3>
            <span>Baseline Trajectory</span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#fee2e2', color: '#ef4444' }}>
            <ArrowDownRight size={20} />
          </div>
          <div className="metric-content">
            <p>Expense Forecast</p>
            <h3>{loading ? "..." : `${parseFloat(forecastData?.expGrowthDisplay || 0) > 0 ? '+' : ''}${forecastData?.expGrowthDisplay || 0}%`}</h3>
            <span>Fixed \u0026 Variable</span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#dcfce7', color: '#10b981' }}>
            <Wallet2 size={20} />
          </div>
          <div className="metric-content">
            <p>Cash Flow Forecast</p>
            <h3>{loading ? "..." : parseFloat(forecastData?.revGrowthDisplay) > parseFloat(forecastData?.expGrowthDisplay) ? "Positive" : "Stable/Deficit"}</h3>
            <span>Projected Trend</span>
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Calculator size={20} />
          </div>
          <div className="metric-content">
            <p>Tax Liability Est</p>
            <h3>{loading ? "..." : `₹${((forecastData?.totalTax || 0) / 1000).toFixed(1)}K`}</h3>
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
          <div className="runway-status secure" style={{ background: statusObject.background, color: statusObject.color, borderColor: statusObject.borderColor }}>
            Status: {loading ? "Loading..." : statusObject.text}
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
