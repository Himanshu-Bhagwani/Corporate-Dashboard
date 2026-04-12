import React, { useState } from 'react';
import './AnalyticsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { TrendingUp, TrendingDown, PieChart, Calendar, DollarSign, Target, Zap, Award } from 'lucide-react';

const AnalyticsView = ({ stats }) => {
  const [selectedMonth, setSelectedMonth] = useState('Last 6 Months');
  const [hoveredBar, setHoveredBar] = useState(null);
  const [hoveredCategory, setHoveredCategory] = useState(null);

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header">
        <div>
          <h1 className="view-title">Analytics</h1>
          <p className="view-subtitle">Visualize your financial patterns and trends</p>
        </div>
        <div className="time-filter">
          <Calendar size={18} />
          <select
            className="filter-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option>Last 6 Months</option>
            <option>Last Month</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid-4">
        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-analytics green">
            <TrendingUp size={20} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Avg Credit</div>
            <div className="stat-value-analytics">$5,214</div>
            <div className="stat-sublabel">per month</div>
          </div>
        </div>

        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-analytics red">
            <TrendingDown size={20} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Avg Debits</div>
            <div className="stat-value-analytics">$3,929</div>
            <div className="stat-sublabel">per month</div>
          </div>
        </div>

        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-analytics blue">
            <Target size={20} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Savings Rate</div>
            <div className="stat-value-analytics">24.7%</div>
            <div className="stat-sublabel">of credit</div>
          </div>
        </div>

        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-analytics purple">
            <Award size={20} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Net Worth</div>
            <div className="stat-value-analytics">$24,567</div>
            <div className="stat-sublabel positive">+12.3% growth</div>
          </div>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="main-charts-container">
        {/* Credit vs Debits Chart */}
        <div className="chart-section-income-expenses">
          <div className="chart-header">
            <h3 className="chart-title">Credit vs Debits</h3>
            <div className="chart-legend">
              <div className="legend-item-chart">
                <span className="legend-dot green"></span>
                <span>Credit</span>
              </div>
              <div className="legend-item-chart">
                <span className="legend-dot red"></span>
                <span>Debits</span>
              </div>
            </div>
          </div>
          <div className="chart-content">
            <div className="line-chart-container">
              <svg viewBox="0 0 600 250" className="line-chart-svg">
                {/* Grid lines */}
                <line x1="0" y1="50" x2="600" y2="50" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                <line x1="0" y1="100" x2="600" y2="100" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                <line x1="0" y1="150" x2="600" y2="150" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                <line x1="0" y1="200" x2="600" y2="200" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />

                {/* Income line gradient */}
                <defs>
                  <linearGradient id="incomeGradient" x1="0%" y1="0%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="expenseGradient" x1="0%" y1="0%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Income area */}
                <path
                  d="M 0,80 L 100,60 L 200,70 L 300,55 L 400,45 L 500,40 L 600,50 L 600,250 L 0,250 Z"
                  fill="url(#incomeGradient)"
                />

                {/* Expense area */}
                <path
                  d="M 0,120 L 100,130 L 200,115 L 300,125 L 400,110 L 500,120 L 600,115 L 600,250 L 0,250 Z"
                  fill="url(#expenseGradient)"
                />

                {/* Income line */}
                <polyline
                  points="0,80 100,60 200,70 300,55 400,45 500,40 600,50"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Expense line */}
                <polyline
                  points="0,120 100,130 200,115 300,125 400,110 500,120 600,115"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data points - Income */}
                <circle cx="0" cy="80" r="6" fill="#10b981" className="chart-dot" />
                <circle cx="100" cy="60" r="6" fill="#10b981" className="chart-dot" />
                <circle cx="200" cy="70" r="6" fill="#10b981" className="chart-dot" />
                <circle cx="300" cy="55" r="6" fill="#10b981" className="chart-dot" />
                <circle cx="400" cy="45" r="6" fill="#10b981" className="chart-dot" />
                <circle cx="500" cy="40" r="6" fill="#10b981" className="chart-dot" />
                <circle cx="600" cy="50" r="6" fill="#10b981" className="chart-dot" />

                {/* Data points - Expenses */}
                <circle cx="0" cy="120" r="6" fill="#ef4444" className="chart-dot" />
                <circle cx="100" cy="130" r="6" fill="#ef4444" className="chart-dot" />
                <circle cx="200" cy="115" r="6" fill="#ef4444" className="chart-dot" />
                <circle cx="300" cy="125" r="6" fill="#ef4444" className="chart-dot" />
                <circle cx="400" cy="110" r="6" fill="#ef4444" className="chart-dot" />
                <circle cx="500" cy="120" r="6" fill="#ef4444" className="chart-dot" />
                <circle cx="600" cy="115" r="6" fill="#ef4444" className="chart-dot" />
              </svg>
              <div className="chart-x-labels">
                <span>Jul</span>
                <span>Aug</span>
                <span>Sep</span>
                <span>Oct</span>
                <span>Nov</span>
                <span>Dec</span>
                <span>Jan</span>
              </div>
            </div>
          </div>
        </div>

        {/* Spending by Category */}
        <div className="chart-section-spending">
          <div className="chart-header">
            <h3 className="chart-title">Spending by Category</h3>
          </div>
          <div className="chart-content">
            <div className="pie-chart-wrapper">
              <svg viewBox="0 0 240 240" className="pie-chart-svg">
                {/* Donut Chart Slices */}
                <circle cx="120" cy="120" r="90" fill="none" stroke="#3b82f6" strokeWidth="40"
                  strokeDasharray="169.65 565.49" strokeDashoffset="0" transform="rotate(-90 120 120)"
                  className="pie-slice" data-index="0" />
                <circle cx="120" cy="120" r="90" fill="none" stroke="#10b981" strokeWidth="40"
                  strokeDasharray="118.51 565.49" strokeDashoffset="-169.65" transform="rotate(-90 120 120)"
                  className="pie-slice" data-index="1" />
                <circle cx="120" cy="120" r="90" fill="none" stroke="#8b5cf6" strokeWidth="40"
                  strokeDasharray="90.48 565.49" strokeDashoffset="-288.16" transform="rotate(-90 120 120)"
                  className="pie-slice" data-index="2" />
                <circle cx="120" cy="120" r="90" fill="none" stroke="#ec4899" strokeWidth="40"
                  strokeDasharray="62.20 565.49" strokeDashoffset="-378.64" transform="rotate(-90 120 120)"
                  className="pie-slice" data-index="3" />
                <circle cx="120" cy="120" r="90" fill="none" stroke="#ef4444" strokeWidth="40"
                  strokeDasharray="56.55 565.49" strokeDashoffset="-440.84" transform="rotate(-90 120 120)"
                  className="pie-slice" data-index="4" />
                <circle cx="120" cy="120" r="90" fill="none" stroke="#f59e0b" strokeWidth="40"
                  strokeDasharray="45.24 565.49" strokeDashoffset="-497.39" transform="rotate(-90 120 120)"
                  className="pie-slice" data-index="5" />
                <circle cx="120" cy="120" r="90" fill="none" stroke="#6b7280" strokeWidth="40"
                  strokeDasharray="22.62 565.49" strokeDashoffset="-542.63" transform="rotate(-90 120 120)"
                  className="pie-slice" data-index="6" />

                {/* White circle in center for donut effect */}
                <circle cx="120" cy="120" r="65" fill="white" />
              </svg>
              <div className="pie-center-text">
                <div className="pie-total">$3,929</div>
                <div className="pie-label-center">Total Spent</div>
              </div>
            </div>
            <div className="category-list">
              {[
                { name: 'Food & Dining', amount: 1179, percent: 30, color: '#3b82f6' },
                { name: 'Shopping', amount: 825, percent: 21, color: '#10b981' },
                { name: 'Transportation', amount: 629, percent: 16, color: '#8b5cf6' },
                { name: 'Entertainment', amount: 432, percent: 11, color: '#ec4899' },
                { name: 'Health', amount: 393, percent: 10, color: '#ef4444' },
                { name: 'Utilities', amount: 314, percent: 8, color: '#f59e0b' },
                { name: 'Other', amount: 157, percent: 4, color: '#6b7280' }
              ].map((category, index) => (
                <div
                  key={index}
                  className={`category-item ${hoveredCategory === index ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredCategory(index)}
                  onMouseLeave={() => setHoveredCategory(null)}
                >
                  <div className="category-info">
                    <span className="category-dot" style={{ background: category.color }}></span>
                    <span className="category-name">{category.name}</span>
                  </div>
                  <div className="category-stats">
                    <span className="category-amount">${category.amount}</span>
                    <span className="category-percent">{category.percent}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Charts */}
      <div className="secondary-charts-grid">
        {/* Monthly Savings Trend */}
        <div className="chart-section-bar">
          <div className="chart-header">
            <h3 className="chart-title">Monthly Savings Trend</h3>
            <div className="chart-value-display">
              {hoveredBar !== null && (
                <span className="hover-value">${[850, 1020, 900, 900, 720, 1020, 900][hoveredBar]}</span>
              )}
            </div>
          </div>
          <div className="bar-chart-enhanced">
            {['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'].map((month, i) => {
              const heights = [70, 85, 75, 75, 60, 85, 75];
              const amounts = [850, 1020, 900, 900, 720, 1020, 900];
              return (
                <div
                  key={month}
                  className="bar-wrapper-enhanced"
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  <div className="bar-container">
                    <div
                      className={`bar-fill blue ${hoveredBar === i ? 'active' : ''}`}
                      style={{ height: `${heights[i]}%` }}
                    >
                      <div className="bar-glow"></div>
                    </div>
                  </div>
                  <div className="bar-label">{month}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily Spending Pattern */}
        <div className="chart-section-bar">
          <div className="chart-header">
            <h3 className="chart-title">Daily Spending Pattern</h3>
          </div>
          <div className="bar-chart-enhanced">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
              const heights = [45, 35, 65, 50, 70, 90, 55];
              return (
                <div key={day} className="bar-wrapper-enhanced">
                  <div className="bar-container">
                    <div
                      className="bar-fill purple"
                      style={{ height: `${heights[i]}%` }}
                    >
                      <div className="bar-glow"></div>
                    </div>
                  </div>
                  <div className="bar-label">{day}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Financial Insights */}
      <div className="insights-section-enhanced">
        <div className="section-header-insights">
          <Zap size={24} className="insights-icon" />
          <h3 className="section-title-simple">Financial Insights</h3>
        </div>
        <div className="insights-grid-enhanced">
          <div className="insight-card-enhanced green">
            <div className="insight-icon-wrapper">
              <TrendingUp size={24} />
            </div>
            <div className="insight-content-enhanced">
              <h4 className="insight-title-enhanced">Positive Trend</h4>
              <p className="insight-text-enhanced">Your savings rate has increased by 8% compared to last period. Keep up the good work!</p>
            </div>
            <div className="insight-badge">+8%</div>
          </div>

          <div className="insight-card-enhanced yellow">
            <div className="insight-icon-wrapper">
              <DollarSign size={24} />
            </div>
            <div className="insight-content-enhanced">
              <h4 className="insight-title-enhanced">Spending Alert</h4>
              <p className="insight-text-enhanced">Food & Dining spending is 25% higher than your average. Consider reducing dining out.</p>
            </div>
            <div className="insight-badge warning">+25%</div>
          </div>

          <div className="insight-card-enhanced blue">
            <div className="insight-icon-wrapper">
              <Target size={24} />
            </div>
            <div className="insight-content-enhanced">
              <h4 className="insight-title-enhanced">Goal Progress</h4>
              <p className="insight-text-enhanced">You're 85% towards your monthly savings goal. Just $150 more to reach your target!</p>
            </div>
            <div className="insight-badge">85%</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AnalyticsView;