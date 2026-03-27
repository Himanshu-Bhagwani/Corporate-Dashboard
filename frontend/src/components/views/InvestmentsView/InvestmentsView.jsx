import React, { useState } from 'react';
import './InvestmentsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { DollarSign, TrendingUp, Percent, Calendar, Plus, TrendingDown, PieChart, Target, Zap, Award } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

const InvestmentsView = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [hoveredHolding, setHoveredHolding] = useState(null);
  const [hoveredAllocation, setHoveredAllocation] = useState(null);

  // Portfolio Performance Data
  const performanceData = [
    { month: 'Jan', value: 95000 },
    { month: 'Feb', value: 96500 },
    { month: 'Mar', value: 98200 },
    { month: 'Apr', value: 97200 },
    { month: 'May', value: 99500 },
    { month: 'Jun', value: 101000 },
    { month: 'Jul', value: 100247 }
  ];

  // Asset Allocation Data
  const assetAllocationData = [
    { name: 'Stocks', value: 45, amount: 45000, color: '#4169E1' },
    { name: 'Bonds', value: 25, amount: 25000, color: '#10b981' },
    { name: 'Real Estate', value: 15, amount: 15000, color: '#f59e0b' },
    { name: 'Crypto', value: 10, amount: 10000, color: '#9333ea' },
    { name: 'Cash', value: 5, amount: 5000, color: '#6B7280' }
  ];

  // Individual Holdings Data
  const holdings = [
    { symbol: 'AAPL', name: 'Apple Inc.', shares: 50, price: 178.50, value: 8925.00, change: 2.3, allocation: 8.9 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', shares: 40, price: 412.30, value: 16492.00, change: 1.8, allocation: 16.5 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', shares: 30, price: 141.80, value: 4254.00, change: -0.5, allocation: 4.3 },
    { symbol: 'TSLA', name: 'Tesla Inc.', shares: 25, price: 248.50, value: 6212.50, change: 3.2, allocation: 6.2 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', shares: 35, price: 178.25, value: 6238.75, change: 1.1, allocation: 6.2 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', shares: 15, price: 875.00, value: 13125.00, change: 5.4, allocation: 13.1 }
  ];

  const periods = ['1M', '3M', '6M', '1Y', 'ALL'];

  return (
    <>
      <EmbeddedHeader />
      <div className="investments-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Investment Portfolio</h1>
          <p className="view-subtitle">Monitor your investments and portfolio performance</p>
        </div>
        <button className="btn-primary">
          <Plus size={20} />
          Add Investment
        </button>
      </div>

      {/* Portfolio Stats Cards - Analytics Style */}
      <div className="portfolio-stats-grid-enhanced">
        <div className="portfolio-stat-card-enhanced">
          <div className="portfolio-stat-icon-wrapper blue">
            <DollarSign size={20} />
          </div>
          <div className="portfolio-stat-content">
            <div className="portfolio-stat-label">Total Value</div>
            <div className="portfolio-stat-value">$100,247</div>
            <div className="portfolio-stat-change positive">+8.2%</div>
          </div>
        </div>

        <div className="portfolio-stat-card-enhanced">
          <div className="portfolio-stat-icon-wrapper green">
            <TrendingUp size={20} />
          </div>
          <div className="portfolio-stat-content">
            <div className="portfolio-stat-label">Total Return</div>
            <div className="portfolio-stat-value">+$7,450</div>
            <div className="portfolio-stat-change positive">+8.0%</div>
          </div>
        </div>

        <div className="portfolio-stat-card-enhanced">
          <div className="portfolio-stat-icon-wrapper purple">
            <Percent size={20} />
          </div>
          <div className="portfolio-stat-content">
            <div className="portfolio-stat-label">Annual Return</div>
            <div className="portfolio-stat-value">+12.5%</div>
            <div className="portfolio-stat-sublabel">vs 9.8% benchmark</div>
          </div>
        </div>

        <div className="portfolio-stat-card-enhanced">
          <div className="portfolio-stat-icon-wrapper orange">
            <Calendar size={20} />
          </div>
          <div className="portfolio-stat-content">
            <div className="portfolio-stat-label">YTD Return</div>
            <div className="portfolio-stat-value">+5.2%</div>
            <div className="portfolio-stat-sublabel">vs 4.1% benchmark</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="investment-charts-container">
        {/* Portfolio Performance Chart */}
        <div className="investment-chart-section performance">
          <div className="investment-chart-header">
            <h2 className="investment-chart-title">Portfolio Performance</h2>
            <div className="period-selector-investment">
              {periods.map((period) => (
                <button
                  key={period}
                  className={`period-btn-investment ${selectedPeriod === period ? 'active' : ''}`}
                  onClick={() => setSelectedPeriod(period)}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          <div className="investment-chart-container">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={performanceData}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4169E1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4169E1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" stroke="#6B7280" style={{ fontSize: '0.875rem', fontWeight: 600 }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '0.875rem', fontWeight: 600 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    padding: '12px'
                  }}
                  formatter={(value) => [`$${value.toLocaleString()}`, 'Portfolio Value']}
                  labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#4169E1" 
                  strokeWidth={3}
                  dot={{ fill: '#4169E1', r: 5, strokeWidth: 2, stroke: 'white' }}
                  activeDot={{ r: 7, strokeWidth: 3 }}
                  fill="url(#portfolioGradient)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Asset Allocation Chart */}
        <div className="investment-chart-section allocation">
          <div className="investment-chart-header">
            <h2 className="investment-chart-title">Asset Allocation</h2>
          </div>
          <div className="investment-chart-container">
            <div className="pie-chart-investment-wrapper">
              <ResponsiveContainer width="100%" height={260}>
                <RechartsPieChart>
                  <Pie
                    data={assetAllocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {assetAllocationData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      padding: '12px'
                    }}
                    formatter={(value, name, props) => [`${value}%`, `$${props.payload.amount.toLocaleString()}`]}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="pie-center-investment">
                <div className="pie-total-investment">$100K</div>
                <div className="pie-label-investment">Total</div>
              </div>
            </div>
            <div className="allocation-legend-enhanced">
              {assetAllocationData.map((item, index) => (
                <div 
                  key={index} 
                  className={`allocation-legend-item ${hoveredAllocation === index ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredAllocation(index)}
                  onMouseLeave={() => setHoveredAllocation(null)}
                >
                  <div className="allocation-legend-left">
                    <div className="allocation-dot" style={{ backgroundColor: item.color }}></div>
                    <span className="allocation-name">{item.name}</span>
                  </div>
                  <div className="allocation-legend-right">
                    <span className="allocation-amount">${item.amount.toLocaleString()}</span>
                    <span className="allocation-percent">{item.value}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Individual Holdings Table */}
      <div className="holdings-section-enhanced">
        <h2 className="section-title-holdings">Individual Holdings</h2>
        <div className="holdings-table-container">
          <table className="holdings-table-enhanced">
            <thead>
              <tr>
                <th className="align-left"></th>
                <th>SYMBOL</th>
                <th>NAME</th>
                <th>SHARES</th>
                <th>PRICE</th>
                <th>VALUE</th>
                <th>CHANGE</th>
                <th>ALLOCATION</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding, index) => (
                <tr 
                  key={index}
                  className={hoveredHolding === index ? 'hovered' : ''}
                  onMouseEnter={() => setHoveredHolding(index)}
                  onMouseLeave={() => setHoveredHolding(null)}
                >
                  <td>
                    <div className="symbol-cell-enhanced">{holding.symbol}</div>
                  </td>
                  <td>
                    <div className="name-cell-enhanced">{holding.name}</div>
                  </td>
                  <td>
                    <div className="shares-cell">{holding.shares}</div>
                  </td>
                  <td>
                    <div className="price-cell">${holding.price.toFixed(2)}</div>
                  </td>
                  <td>
                    <div className="value-cell-enhanced">${holding.value.toLocaleString()}</div>
                  </td>
                  <td>
                    <div className={`change-badge-enhanced ${holding.change >= 0 ? 'positive' : 'negative'}`}>
                      {holding.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span>{holding.change >= 0 ? '+' : ''}{holding.change}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="allocation-cell">
                      <div className="allocation-bar-container">
                        <div 
                          className="allocation-bar-fill" 
                          style={{ width: `${holding.allocation * 5}%` }}
                        ></div>
                      </div>
                      <span className="allocation-text">{holding.allocation}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Investment Insights - Analytics Style */}
      <div className="investment-insights-section">
        <div className="insights-header-investment">
          <Zap size={24} className="insights-icon-investment" />
          <h3 className="section-title-holdings">Investment Insights</h3>
        </div>
        <div className="investment-insights-grid">
          <div className="investment-insight-card green">
            <div className="investment-insight-icon-wrapper">
              <TrendingUp size={24} />
            </div>
            <div className="investment-insight-content">
              <h4 className="investment-insight-title">Strong Performance</h4>
              <p className="investment-insight-text">Your portfolio is outperforming the benchmark by 2.7%. NVDA and TSLA are your top performers.</p>
            </div>
            <div className="investment-insight-badge positive">+2.7%</div>
          </div>

          <div className="investment-insight-card yellow">
            <div className="investment-insight-icon-wrapper">
              <Target size={24} />
            </div>
            <div className="investment-insight-content">
              <h4 className="investment-insight-title">Diversification Tip</h4>
              <p className="investment-insight-text">Tech stocks make up 45% of your portfolio. Consider diversifying into other sectors for better risk management.</p>
            </div>
            <div className="investment-insight-badge warning">45%</div>
          </div>

          <div className="investment-insight-card blue">
            <div className="investment-insight-icon-wrapper">
              <Award size={24} />
            </div>
            <div className="investment-insight-content">
              <h4 className="investment-insight-title">Milestone Reached</h4>
              <p className="investment-insight-text">Congratulations! Your portfolio has crossed $100K. You're 50% towards your $200K investment goal.</p>
            </div>
            <div className="investment-insight-badge">50%</div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

export default InvestmentsView;