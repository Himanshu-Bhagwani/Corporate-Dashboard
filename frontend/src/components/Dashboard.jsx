import React, { useState } from 'react';
import './Dashboard.css';
import { 
  PlusCircle, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  BarChart3, 
  PieChart, 
  Filter, 
  Search, 
  Download, 
  Edit2, 
  Trash2, 
  Eye,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Receipt,
  Link2,
  CreditCard,
  RefreshCw,
  MessageCircle
} from 'lucide-react';

const Dashboard = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    transaction: '',
    category: '',
    account: '',
    amount: '',
    type: 'expense',
    notes: ''
  });

  // Sample data
  const [transactions, setTransactions] = useState([
    { id: 1, name: 'Grocery Shopping', category: 'Food & Dining', account: 'Chase Checking', date: '2026-01-12', amount: -125.50, type: 'expense' },
    { id: 2, name: 'Salary Deposit', category: 'Income', account: 'Chase Checking', date: '2026-01-10', amount: 4500.00, type: 'income' },
    { id: 3, name: 'Netflix Subscription', category: 'Entertainment', account: 'Credit Card', date: '2026-01-09', amount: -15.99, type: 'expense' },
    { id: 4, name: 'Freelance Project', category: 'Income', account: 'Chase Checking', date: '2026-01-08', amount: 850.00, type: 'income' },
  ]);

  const accounts = [
    { id: 1, name: 'Chase Checking', type: 'Checking', bank: 'Chase Bank', accountNumber: '****1234', balance: 8450.23, connected: true, lastSync: '2 hours ago' },
    { id: 2, name: 'Savings Account', type: 'Savings', bank: 'Chase Bank', accountNumber: '****5678', balance: 15890.00, connected: true, lastSync: '2 hours ago' },
    { id: 3, name: 'Chase Freedom Credit Card', type: 'Credit', bank: 'Chase Bank', accountNumber: '****9012', balance: -1234.56, connected: true, lastSync: '2 hours ago' },
  ];

  const stats = {
    totalIncome: 12450,
    totalExpenses: 8234,
    savings: 15890,
    investments: 32145,
    netTotal: 4978.63,
    totalBalance: 56486.01,
    totalDebt: 1234.56,
    connectedAccounts: 4
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    const newTransaction = {
      id: transactions.length + 1,
      name: formData.transaction,
      category: formData.category,
      account: formData.account,
      date: new Date().toISOString().split('T')[0],
      amount: formData.type === 'income' ? parseFloat(formData.amount) : -parseFloat(formData.amount),
      type: formData.type
    };
    setTransactions([newTransaction, ...transactions]);
    setShowAddModal(false);
    setFormData({ transaction: '', category: '', account: '', amount: '', type: 'expense', notes: '' });
  };

  const filteredTransactions = transactions.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.account.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Dashboard View
  const DashboardView = () => (
    <>
      <div className="view-header">
        <div>
          <h1 className="view-title">Dashboard</h1>
          <p className="view-subtitle">Welcome back! Here's your financial overview</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid-4">
        <div className="stat-card-new">
          <div className="stat-icon-wrapper green">
            <TrendingUp size={20} />
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Total Income</span>
              <span className="stat-change positive">+12.5%</span>
            </div>
            <div className="stat-value-new">${stats.totalIncome.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper red">
            <TrendingDown size={20} />
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Total Expenses</span>
              <span className="stat-change negative">-3.2%</span>
            </div>
            <div className="stat-value-new">${stats.totalExpenses.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper blue">
            <PieChart size={20} />
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Savings</span>
              <span className="stat-change positive">+8.1%</span>
            </div>
            <div className="stat-value-new">${stats.savings.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper purple">
            <TrendingUp size={20} />
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Investments</span>
              <span className="stat-change positive">+15.3%</span>
            </div>
            <div className="stat-value-new">${stats.investments.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Recent Transactions */}
        <div className="dashboard-section">
          <div className="section-header-simple">
            <h2 className="section-title-simple">Recent Transactions</h2>
            <button className="link-button" onClick={() => setActiveView('transactions')}>View All</button>
          </div>
          
          <div className="transactions-list">
            {transactions.slice(0, 4).map(transaction => (
              <div key={transaction.id} className="transaction-item">
                <div className="transaction-icon-wrapper">
                  {transaction.type === 'income' ? (
                    <TrendingUp size={20} className="icon-green" />
                  ) : (
                    <TrendingDown size={20} className="icon-red" />
                  )}
                </div>
                <div className="transaction-details">
                  <div className="transaction-name">{transaction.name}</div>
                  <div className="transaction-category">{transaction.category}</div>
                </div>
                <div className="transaction-right">
                  <div className={`transaction-amount ${transaction.type === 'income' ? 'positive' : 'negative'}`}>
                    {transaction.type === 'income' ? '+' : '-'}${Math.abs(transaction.amount).toFixed(2)}
                  </div>
                  <div className="transaction-date">{transaction.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Accounts */}
        <div className="dashboard-section">
          <div className="section-header-simple">
            <h2 className="section-title-simple">Accounts</h2>
          </div>
          
          <div className="accounts-list">
            {accounts.slice(0, 3).map(account => (
              <div key={account.id} className="account-item">
                <div className="account-icon-wrapper">
                  <CreditCard size={20} />
                </div>
                <div className="account-details">
                  <div className="account-name">{account.name}</div>
                  <div className="account-type">{account.type}</div>
                </div>
                <div className="account-balance">${Math.abs(account.balance).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // Transactions View
  const TransactionsView = () => (
    <>
      <div className="view-header">
        <div>
          <h1 className="view-title">Transactions</h1>
          <p className="view-subtitle">Track and manage your income and expenses</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          <PlusCircle size={20} />
          Add Transaction
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid-3">
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small green">
            <TrendingUp size={18} />
          </div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Total Income</div>
            <div className="stat-value-simple green">${stats.totalIncome.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small red">
            <TrendingDown size={18} />
          </div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Total Expenses</div>
            <div className="stat-value-simple red">${stats.totalExpenses.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small blue">
            <Calendar size={18} />
          </div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Net Total</div>
            <div className="stat-value-simple green">${stats.netTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search transactions..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select className="filter-select">
          <option>All Types</option>
          <option>Income</option>
          <option>Expense</option>
        </select>
        <select className="filter-select">
          <option>All Time</option>
          <option>This Month</option>
          <option>Last Month</option>
        </select>
        <div className="transaction-count">{filteredTransactions.length} transactions</div>
      </div>

      {/* Transactions Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>TRANSACTION</th>
              <th>CATEGORY</th>
              <th>ACCOUNT</th>
              <th>DATE</th>
              <th className="align-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map(transaction => (
              <tr key={transaction.id}>
                <td>
                  <div className="table-cell-with-icon">
                    <div className={`table-icon ${transaction.type === 'income' ? 'green' : 'red'}`}>
                      {transaction.type === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                    <span className="table-main-text">{transaction.name}</span>
                  </div>
                </td>
                <td><span className="table-secondary-text">{transaction.category}</span></td>
                <td><span className="table-secondary-text">{transaction.account}</span></td>
                <td><span className="table-secondary-text">{transaction.date}</span></td>
                <td className="align-right">
                  <span className={`table-amount ${transaction.type === 'income' ? 'positive' : 'negative'}`}>
                    {transaction.type === 'income' ? '+' : ''}${transaction.amount.toFixed(2)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  // Analytics View
  const AnalyticsView = () => (
    <>
      <div className="view-header">
        <div>
          <h1 className="view-title">Analytics</h1>
          <p className="view-subtitle">Visualize your financial patterns and trends</p>
        </div>
        <div className="time-filter">
          <Calendar size={18} />
          <select className="filter-select">
            <option>Last 6 Months</option>
            <option>Last Month</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid-4">
        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-small green">
            <TrendingUp size={18} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Avg Income</div>
            <div className="stat-value-analytics">$5214</div>
            <div className="stat-sublabel">per month</div>
          </div>
        </div>

        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-small red">
            <TrendingDown size={18} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Avg Expenses</div>
            <div className="stat-value-analytics">$3929</div>
            <div className="stat-sublabel">per month</div>
          </div>
        </div>

        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-small blue">
            <PieChart size={18} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Savings Rate</div>
            <div className="stat-value-analytics">24.7%</div>
            <div className="stat-sublabel">of income</div>
          </div>
        </div>

        <div className="stat-card-analytics">
          <div className="stat-icon-wrapper-small purple">
            <TrendingUp size={18} />
          </div>
          <div className="stat-content-analytics">
            <div className="stat-label-analytics">Net Worth</div>
            <div className="stat-value-analytics">$24,567</div>
            <div className="stat-sublabel positive">+12.3% growth</div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Income vs Expenses Chart */}
        <div className="chart-section-large">
          <div className="chart-header">
            <h3 className="chart-title">Income vs Expenses</h3>
          </div>
          <div className="chart-placeholder">
            <div className="chart-legend">
              <div className="legend-item-chart">
                <span className="legend-dot red"></span>
                <span>Expenses</span>
              </div>
              <div className="legend-item-chart">
                <span className="legend-dot green"></span>
                <span>Income</span>
              </div>
            </div>
            <div className="line-chart-placeholder">
              {/* Line chart would go here */}
              <svg viewBox="0 0 600 200" className="line-chart-svg">
                <polyline
                  points="0,80 100,60 200,70 300,55 400,45 500,40 600,50"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                />
                <polyline
                  points="0,120 100,130 200,115 300,125 400,110 500,120 600,115"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="3"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Spending by Category */}
        <div className="chart-section-small">
          <div className="chart-header">
            <h3 className="chart-title">Spending by Category</h3>
          </div>
          <div className="pie-chart-container">
            <svg viewBox="0 0 200 200" className="pie-chart-svg">
              <circle cx="100" cy="100" r="80" fill="#3b82f6" stroke="white" strokeWidth="2" />
              <circle cx="100" cy="100" r="80" fill="#8b5cf6" stroke="white" strokeWidth="2"
                strokeDasharray="150 502" strokeDashoffset="0" transform="rotate(-90 100 100)" />
              <circle cx="100" cy="100" r="80" fill="#ec4899" stroke="white" strokeWidth="2"
                strokeDasharray="55 502" strokeDashoffset="-150" transform="rotate(-90 100 100)" />
              <circle cx="100" cy="100" r="80" fill="#f59e0b" stroke="white" strokeWidth="2"
                strokeDasharray="40 502" strokeDashoffset="-205" transform="rotate(-90 100 100)" />
              <circle cx="100" cy="100" r="80" fill="#10b981" stroke="white" strokeWidth="2"
                strokeDasharray="105 502" strokeDashoffset="-245" transform="rotate(-90 100 100)" />
              <circle cx="100" cy="100" r="80" fill="#ef4444" stroke="white" strokeWidth="2"
                strokeDasharray="50 502" strokeDashoffset="-350" transform="rotate(-90 100 100)" />
              <circle cx="100" cy="100" r="80" fill="#6b7280" stroke="white" strokeWidth="2"
                strokeDasharray="25 502" strokeDashoffset="-400" transform="rotate(-90 100 100)" />
            </svg>
            <div className="pie-chart-labels">
              <div className="pie-label"><span className="pie-dot" style={{background: '#3b82f6'}}></span>Food & Dining 30%</div>
              <div className="pie-label"><span className="pie-dot" style={{background: '#8b5cf6'}}></span>Transportation 16%</div>
              <div className="pie-label"><span className="pie-dot" style={{background: '#ec4899'}}></span>Entertainment 11%</div>
              <div className="pie-label"><span className="pie-dot" style={{background: '#f59e0b'}}></span>Utilities 8%</div>
              <div className="pie-label"><span className="pie-dot" style={{background: '#10b981'}}></span>Shopping 21%</div>
              <div className="pie-label"><span className="pie-dot" style={{background: '#ef4444'}}></span>Health 10%</div>
              <div className="pie-label"><span className="pie-dot" style={{background: '#6b7280'}}></span>Other 5%</div>
            </div>
          </div>
        </div>

        {/* Monthly Savings Trend */}
        <div className="chart-section-medium">
          <div className="chart-header">
            <h3 className="chart-title">Monthly Savings Trend</h3>
          </div>
          <div className="bar-chart-simple">
            {['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'].map((month, i) => {
              const heights = [70, 85, 75, 75, 60, 85, 75];
              return (
                <div key={month} className="bar-wrapper">
                  <div className="bar-blue" style={{height: `${heights[i]}%`}}></div>
                  <div className="bar-label">{month}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily Spending Pattern */}
        <div className="chart-section-medium">
          <div className="chart-header">
            <h3 className="chart-title">Daily Spending Pattern</h3>
          </div>
          <div className="bar-chart-simple">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
              const heights = [45, 35, 65, 50, 70, 90, 55];
              return (
                <div key={day} className="bar-wrapper">
                  <div className="bar-purple" style={{height: `${heights[i]}%`}}></div>
                  <div className="bar-label">{day}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Financial Insights */}
      <div className="insights-section-full">
        <h3 className="section-title-simple">Financial Insights</h3>
        <div className="insights-grid-full">
          <div className="insight-card-full green">
            <div className="insight-icon-full">
              <TrendingUp size={24} />
            </div>
            <div className="insight-content-full">
              <h4 className="insight-title">Positive Trend</h4>
              <p className="insight-text">Your savings rate has increased by 8% compared to last period. Keep up the good work!</p>
            </div>
          </div>

          <div className="insight-card-full yellow">
            <div className="insight-icon-full">
              <TrendingDown size={24} />
            </div>
            <div className="insight-content-full">
              <h4 className="insight-title">Spending Alert</h4>
              <p className="insight-text">Food & Dining spending is 25% higher than your average. Consider reducing dining out.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // Accounts View
  const AccountsView = () => (
    <>
      <div className="view-header">
        <div>
          <h1 className="view-title">Bank Accounts</h1>
          <p className="view-subtitle">Manage and sync your connected accounts</p>
        </div>
        <button className="btn-primary">
          <PlusCircle size={20} />
          Connect Account
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid-3">
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small blue">
            <CreditCard size={18} />
          </div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Total Balance</div>
            <div className="stat-value-simple">${stats.totalBalance.toLocaleString()}</div>
            <div className="stat-sublabel-simple">Across all accounts</div>
          </div>
        </div>

        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small red">
            <CreditCard size={18} />
          </div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Total Debt</div>
            <div className="stat-value-simple red">${stats.totalDebt.toLocaleString()}</div>
            <div className="stat-sublabel-simple">Credit card balance</div>
          </div>
        </div>

        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small green">
            <Link2 size={18} />
          </div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Connected Accounts</div>
            <div className="stat-value-simple">{stats.connectedAccounts}</div>
            <div className="stat-sublabel-simple">Active connections</div>
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="accounts-section">
        {accounts.map(account => (
          <div key={account.id} className="account-card">
            <div className="account-card-header">
              <div className="account-card-left">
                <div className="account-card-icon">
                  <CreditCard size={24} />
                </div>
                <div className="account-card-info">
                  <div className="account-card-name">{account.name}</div>
                  <div className="account-card-meta">
                    <span className="account-bank">Bank</span>
                    <span className="account-bank-name">{account.bank}</span>
                  </div>
                  <div className="account-sync">
                    <RefreshCw size={12} />
                    <span>Last synced {account.lastSync}</span>
                  </div>
                </div>
              </div>
              <div className="account-status-badge">
                <span className="status-dot"></span>
                Connected
              </div>
            </div>
            <div className="account-card-body">
              <div className="account-detail">
                <span className="detail-label">Account Number</span>
                <span className="detail-value">{account.accountNumber}</span>
              </div>
              <div className="account-detail">
                <span className="detail-label">Type</span>
                <span className="detail-value">{account.type}</span>
              </div>
              <div className="account-detail-balance">
                <span className="detail-label">Balance</span>
                <div className="balance-amount">${Math.abs(account.balance).toLocaleString()}</div>
                <button className="sync-button">
                  <RefreshCw size={14} />
                  Sync Now
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="app-wrapper">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-logo">FinanceTrack</h1>
          <p className="app-tagline">Smart Money Management</p>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-button ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </button>
          <button 
            className={`nav-button ${activeView === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveView('transactions')}
          >
            <Receipt size={20} />
            <span>Transactions</span>
          </button>
          <button 
            className={`nav-button ${activeView === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveView('analytics')}
          >
            <BarChart3 size={20} />
            <span>Analytics</span>
          </button>
          <button 
            className={`nav-button ${activeView === 'accounts' ? 'active' : ''}`}
            onClick={() => setActiveView('accounts')}
          >
            <CreditCard size={20} />
            <span>Accounts</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="total-balance-card">
            <div className="balance-label">Total Balance</div>
            <div className="balance-value">${stats.totalBalance.toLocaleString()}</div>
            <div className="balance-change">+2.5% from last month</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'transactions' && <TransactionsView />}
        {activeView === 'analytics' && <AnalyticsView />}
        {activeView === 'accounts' && <AccountsView />}
      </main>

      {/* Floating Chat Button 
      <button className="chat-button">
        <MessageCircle size={24} />
      </button> */}

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Transaction</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Transaction Type</label>
                <div className="radio-group">
                  <label className={`radio-option ${formData.type === 'expense' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="type"
                      value="expense"
                      checked={formData.type === 'expense'}
                      onChange={handleInputChange}
                    />
                    <span>Expense</span>
                  </label>
                  <label className={`radio-option ${formData.type === 'income' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="type"
                      value="income"
                      checked={formData.type === 'income'}
                      onChange={handleInputChange}
                    />
                    <span>Income</span>
                  </label>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Transaction Name</label>
                  <input
                    type="text"
                    name="transaction"
                    value={formData.transaction}
                    onChange={handleInputChange}
                    placeholder="e.g., Grocery Shopping"
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    placeholder="e.g., Food & Dining"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Account</label>
                  <select name="account" value={formData.account} onChange={handleInputChange}>
                    <option value="">Select Account</option>
                    <option value="Chase Checking">Chase Checking</option>
                    <option value="Savings Account">Savings Account</option>
                    <option value="Credit Card">Credit Card</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount</label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes (Optional)</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  placeholder="Add any additional notes..."
                  rows="3"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSubmit}>
                Add Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;