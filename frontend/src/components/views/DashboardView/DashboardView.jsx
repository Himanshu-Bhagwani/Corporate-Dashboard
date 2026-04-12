import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import './DashboardView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';

const formatCurrency = (val) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val.toFixed(0)}`;
};

const CORPORATE_CATEGORIES_COLORS = {
  'Sales': '#4F46E5',
  'Consulting': '#7C3AED',
  'Salaries': '#EC4899',
  'Marketing': '#F59E0B',
  'Software': '#3B82F6',
  'Rent': '#c882dd96',
  'Tax': '#e73737d2',
  'Shares': '#10B981',
  'Professional Fees': '#06B6D4',
  'Utilities': '#F97316',
  'Misc': '#4e504cff',
  'Insurance': '#12a795a2',
  'Travel': '#095227ff',
  'Training': '#D946EF',
  'Maintenance': '#fd3254ff',
  'Office Supplies': '#fdcf44ff',
};

const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#1a202c" fontSize="16" fontWeight="700">
        {formatCurrency(value)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#718096" fontSize="12">
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8}
        startAngle={startAngle} endAngle={endAngle} fill={fill}
        style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }}
      />
      <Sector
        cx={cx} cy={cy} innerRadius={outerRadius + 12} outerRadius={outerRadius + 16}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.3}
      />
    </g>
  );
};

const DashboardView = ({
  transactions = [],
  accounts = [],
  stats = {},
  dashboardSummary,
  invoices = [],
  compliance = [],
  onCreateInvoice,
  onMarkFiled,
  setActiveView,
}) => {
  const [activeExpenseIndex, setActiveExpenseIndex] = useState(0);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ client_name: '', amount: '', due_date: '' });
  const [revenueTimeframe, setRevenueTimeframe] = useState(6);

  // Local state for Income Tax & TDS items
  const [incomeTaxItems, setIncomeTaxItems] = useState([
    { id: 'tds-q4', name: 'TDS Return - Q4 FY25-26', dueDate: '2026-03-31', status: 'Pending' },
    { id: 'tds-pay', name: 'TDS Payment - Feb 2026', dueDate: '2026-03-07', status: 'Pending' },
    { id: 'adv-tax', name: 'Advance Tax - Q4', dueDate: '2026-03-15', status: 'Pending' },
    { id: 'itr', name: 'ITR Filing - AY 2025-26', dueDate: '2026-07-31', status: 'Pending' },
  ]);

  // 10 hardcoded risk alerts for compliance
  const [dashboardAlerts, setDashboardAlerts] = useState([
    { id: 'ra-1', name: 'GSTR-1 Filing - Feb 2026', due_date: '2026-03-11', status: 'Pending' },
    { id: 'ra-2', name: 'GSTR-3B Filing - Feb 2026', due_date: '2026-03-20', status: 'Pending' },
    { id: 'ra-3', name: 'Annual GST Return - FY 2025-26', due_date: '2026-12-31', status: 'Pending' },
    { id: 'ra-4', name: 'TDS Return - Q4 FY25-26', due_date: '2026-03-31', status: 'Pending' },
    { id: 'ra-5', name: 'TDS Payment - Feb 2026', due_date: '2026-03-07', status: 'Pending' },
    { id: 'ra-6', name: 'Advance Tax - Q4', due_date: '2026-03-15', status: 'Pending' },
    { id: 'ra-7', name: 'GSTR-1 Filing - Mar 2026', due_date: '2026-04-11', status: 'Pending' },
    { id: 'ra-8', name: 'GSTR-3B Filing - Mar 2026', due_date: '2026-04-20', status: 'Pending' },
    { id: 'ra-9', name: 'TDS Payment - Mar 2026', due_date: '2026-04-07', status: 'Pending' },
    { id: 'ra-10', name: 'ITR Filing - AY 2025-26', due_date: '2026-07-31', status: 'Pending' },
  ]);

  // GST Reconciliation data
  const gstRecon = useMemo(() => ({
    salesMatch: 98.5,
    itcAvailable: 346212,
    netTaxPayable: 166338,
  }), []);

  const formatINR = (value) => `₹${(Number(value) || 0).toLocaleString('en-IN')}`;

  // Handle marking a dashboard alert as filed
  const handleMarkAlertFiled = (alertId) => {
    setDashboardAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'Filed' } : a));
  };

  // Dashboard alert stats computed from dashboardAlerts local state
  const dashboardAlertStats = useMemo(() => {
    const total = dashboardAlerts.length;
    const filed = dashboardAlerts.filter(a => a.status === 'Filed').length;
    const score = total > 0 ? Math.round((filed / total) * 100) : 0;
    const pending = dashboardAlerts.filter(a => a.status !== 'Filed').length;
    const overdue = dashboardAlerts.filter(a => {
      if (a.status === 'Filed') return false;
      const d = new Date(a.due_date);
      return d.getTime() < Date.now();
    }).length;
    const upcoming30 = dashboardAlerts.filter(a => {
      if (a.status === 'Filed') return false;
      const d = new Date(a.due_date);
      const diff = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 30;
    }).length;
    return { score, pending, overdue, upcoming30 };
  }, [dashboardAlerts]);

  // KPI data from backend summary
  const summary = dashboardSummary || {};

  // === REVENUE VS EXPENSES CHART — computed from transactions prop ===
  const revenueExpensesData = useMemo(() => {
    let anchorDate = new Date();
    if (transactions.length > 0) {
      const validDates = transactions.map(t => t.date).filter(Boolean).sort();
      if (validDates.length > 0) {
        anchorDate = new Date(validDates[validDates.length - 1]);
      }
    }

    const monthlyData = {};
    // Initialize months
    for (let i = revenueTimeframe - 1; i >= 0; i--) {
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthlyData[key] = { name: label, revenue: 0, expenses: 0 };
    }
    transactions.forEach(t => {
      const monthKey = (t.date || '').slice(0, 7);
      if (monthlyData[monthKey]) {
        if (t.type === 'income') monthlyData[monthKey].revenue += parseFloat(t.amount);
        else if (t.type === 'expense') monthlyData[monthKey].expenses += parseFloat(t.amount);
      }
    });
    return Object.values(monthlyData);
  }, [transactions, revenueTimeframe]);

  // === EXPENSE BREAKDOWN — computed from transactions prop ===
  const expenseBreakdown = useMemo(() => {
    const catMap = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Misc';
      catMap[cat] = (catMap[cat] || 0) + parseFloat(t.amount);
    });
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  // === CASH FLOW — computed from transactions prop ===
  const cashFlowData = useMemo(() => {
    let anchorDate = new Date();
    if (transactions.length > 0) {
      const validDates = transactions.map(t => t.date).filter(Boolean).sort();
      if (validDates.length > 0) {
        anchorDate = new Date(validDates[validDates.length - 1]);
      }
    }

    const monthlyData = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      monthlyData[key] = { name: label, inflow: 0, outflow: 0, net: 0 };
    }
    transactions.forEach(t => {
      const monthKey = (t.date || '').slice(0, 7);
      if (monthlyData[monthKey]) {
        if (t.type === 'income') monthlyData[monthKey].inflow += parseFloat(t.amount);
        else monthlyData[monthKey].outflow += parseFloat(t.amount);
      }
    });
    // Include invoice effects for cash flow perspective (paid => inflow, overdue => small outflow impact)
    invoices.forEach(inv => {
      const invMonthKey = (inv.issue_date || inv.due_date || '').slice(0, 7);
      if (!invMonthKey || !monthlyData[invMonthKey]) return;
      const amount = Number(inv.amount) || 0;
      if (amount <= 0) return;
      if (inv.status === 'paid') monthlyData[invMonthKey].inflow += amount;
      else if (inv.status === 'overdue') monthlyData[invMonthKey].outflow += amount * 0.02;
    });
    return Object.values(monthlyData).map(m => ({
      ...m,
      net: m.inflow - m.outflow,
    }));
  }, [transactions, invoices]);

  const totalInflow = cashFlowData.reduce((s, m) => s + m.inflow, 0);
  const totalOutflow = cashFlowData.reduce((s, m) => s + m.outflow, 0);

  // 30-day projection
  const avgMonthlyNet = cashFlowData.length > 0
    ? cashFlowData.reduce((s, m) => s + m.net, 0) / cashFlowData.length
    : 0;
  const projectedCash = (summary.cashInBank || 0) + avgMonthlyNet;

  const formatDateShort = (isoDate) => {
    if (!isoDate) return '-';
    const parts = String(isoDate).split('-');
    if (parts.length < 3) return isoDate;
    const [y, m, d] = parts;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
    return `${parseInt(d, 10)} ${monthNames[idx]} ${y}`;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const toRiskDate = (iso) => {
    const d = new Date(iso);
    // If parsing fails, keep it very far in the future so it won't be marked overdue
    return Number.isNaN(d.getTime()) ? new Date('9999-12-31') : d;
  };

  const riskAlerts = useMemo(() => {
    const sorted = (compliance || [])
      .filter((f) => String(f.status || '').toLowerCase() !== 'filed')
      .slice()
      .sort((a, b) => {
        const da = toRiskDate(a.due_date).getTime();
        const db = toRiskDate(b.due_date).getTime();
        return da - db;
      });
    return sorted;
  }, [compliance]);

  const complianceStats = useMemo(() => {
    const all = compliance || [];
    const total = all.length;
    const filed = all.filter((f) => String(f.status || '').toLowerCase() === 'filed').length;
    const score = total > 0 ? Math.round((filed / total) * 100) : 0;

    const pending = riskAlerts.filter((f) => toRiskDate(f.due_date).getTime() >= today.getTime()).length;
    const overdue = riskAlerts.filter((f) => toRiskDate(f.due_date).getTime() < today.getTime()).length;

    const upcoming30 = riskAlerts.filter((f) => {
      const dueMs = toRiskDate(f.due_date).getTime();
      const diffDays = Math.floor((dueMs - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }).length;

    return { score, pending, overdue, upcoming30 };
  }, [compliance, riskAlerts, today]);

  // Handle invoice creation
  const handleSubmitInvoice = async () => {
    if (!invoiceForm.client_name || !invoiceForm.amount || !invoiceForm.due_date) return;
    try {
      await onCreateInvoice(invoiceForm);
      setShowInvoiceModal(false);
      setInvoiceForm({ client_name: '', amount: '', due_date: '' });
    } catch (err) {
      console.error('Failed to create invoice:', err);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      paid: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
      pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
      overdue: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    };
    const s = colors[status] || colors.pending;
    return (
      <span style={{
        padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
        background: s.bg, color: s.color, textTransform: 'capitalize'
      }}>
        {status}
      </span>
    );
  };

  return (
    <div className="dashboard-view">
      <EmbeddedHeader />
      {/* === 8 KPI STATS CARDS (2 rows x 4) === */}
      <div className="stats-grid-4">
        <div className="stat-card-new">
          <div className="stat-icon-wrapper green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Total Revenue</span>
              {summary.revenueChange > 0 && <span className="stat-change positive">+{summary.revenueChange}%</span>}
            </div>
            <div className="stat-value-new">{formatCurrency(summary.totalRevenue || stats.totalIncome || 0)}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper red">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Total Debits</span>
              {summary.expensesChange > 0 && <span className="stat-change negative">+{summary.expensesChange}%</span>}
            </div>
            <div className="stat-value-new">{formatCurrency(summary.totalExpenses || stats.totalExpenses || 0)}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Net Profit</span>
              {summary.profitChange > 0 && <span className="stat-change positive">+{summary.profitChange}%</span>}
            </div>
            <div className="stat-value-new">{formatCurrency(summary.netProfit || stats.netTotal || 0)}</div>
          </div>
        </div>

        <div
          className="stat-card-new"
          onClick={() => setActiveView && setActiveView('accounts')}
          style={{ cursor: 'pointer' }}
          title="Click to view Bank Accounts"
        >
          <div className="stat-icon-wrapper purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Cash in Bank</span>
            </div>
            <div className="stat-value-new">{formatCurrency(summary.cashInBank || 0)}</div>
          </div>
        </div>
      </div>

      <div className="stats-grid-4">
        <div className="stat-card-new">
          <div className="stat-icon-wrapper blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Total Receivables</span>
              <span className="stat-change positive">{summary.receivablesCount || 0} invoices</span>
            </div>
            <div className="stat-value-new">{formatCurrency(summary.totalReceivables || 0)}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper red">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /><line x1="7" y1="15" x2="7.01" y2="15" /><line x1="11" y1="15" x2="17" y2="15" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Total Payables</span>
            </div>
            <div className="stat-value-new">{formatCurrency(summary.totalPayables || 0)}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper red">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Overdue Invoices</span>
              <span className="stat-change negative">{summary.overdueInvoices || 0}</span>
            </div>
            <div className="stat-value-new">{formatCurrency(summary.overdueAmount || 0)}</div>
          </div>
        </div>

        <div className="stat-card-new">
          <div className="stat-icon-wrapper green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div className="stat-content-new">
            <div className="stat-header-row">
              <span className="stat-label-new">Cash Runway</span>
            </div>
            <div className="stat-value-new">{summary.cashRunway || 0} months</div>
          </div>
        </div>
      </div>

      {/* === CHARTS SECTION === */}
      <div className="charts-section">
        {/* Revenue vs Debits Line Chart */}
        <div className="chart-container">
          <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="chart-title">Revenue vs Debits</div>
              <div className="chart-subtitle">Monthly comparison</div>
            </div>
            <select
              value={revenueTimeframe}
              onChange={(e) => setRevenueTimeframe(parseInt(e.target.value))}
              style={{
                padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                fontSize: '13px', color: '#4a5568', background: '#f7fafc', cursor: 'pointer'
              }}
            >
              <option value={3}>Last 3 months</option>
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
            </select>
          </div>
          {revenueExpensesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueExpensesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#718096' }} />
                <YAxis tick={{ fontSize: 12, fill: '#718096' }} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                <Line type="monotone" dataKey="expenses" name="Debits" stroke="#EF4444" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data-placeholder">No transaction data available</div>
          )}
        </div>

        {/* Debit Breakdown Pie Chart */}
        <div className="chart-container">
          <div className="chart-header">
            <div className="chart-title">Debit Breakdown</div>
            <div className="chart-subtitle">By category</div>
          </div>
          {expenseBreakdown.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '2rem', height: '100%' }}>
              <div style={{ flex: '0 0 280px', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      activeIndex={activeExpenseIndex}
                      activeShape={renderActiveShape}
                      data={expenseBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      dataKey="value"
                      onMouseEnter={(_, index) => setActiveExpenseIndex(index)}
                    >
                      {expenseBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CORPORATE_CATEGORIES_COLORS[entry.name] || '#6B7280'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{
                flex: 1,
                maxWidth: '300px',   // 👈 ADD THIS LINE HERE
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                borderLeft: '1px solid rgba(226,232,240,0.6)',
                paddingLeft: '1.5rem',
                maxHeight: '280px',
                overflowY: 'auto',
                minWidth: '180px',
              }}>
                {expenseBreakdown.map((entry, index) => (
                  <div
                    key={entry.name}
                    onClick={() => setActiveExpenseIndex(index)}
                    onMouseEnter={() => setActiveExpenseIndex(index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 14px',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      background: index === activeExpenseIndex ? 'rgba(79,70,229,0.08)' : 'rgba(247,250,252,0.8)',
                      border: `1px solid ${index === activeExpenseIndex ? 'rgba(79,70,229,0.3)' : '#e2e8f0'}`,
                      transition: 'all 0.2s ease',
                      transform: index === activeExpenseIndex ? 'translateX(4px)' : 'none',
                      boxShadow: index === activeExpenseIndex ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      backgroundColor: CORPORATE_CATEGORIES_COLORS[entry.name] || '#6B7280',
                      transform: index === activeExpenseIndex ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.2s ease',
                    }} />
                    <span style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: index === activeExpenseIndex ? '#2d3748' : '#4a5568',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '120px',
                      display: 'inline-block'
                    }} title={entry.name}>{entry.name}</span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#718096',
                    }}>{formatCurrency(entry.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="no-data-placeholder">No debit data available</div>
          )}
        </div>
      </div>

      {/* === CASH FLOW OVERVIEW === */}
      <div className="financial-health-section">
        <div className="health-header">
          <div className="health-header-left">
            <div className="health-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div>
              <div className="health-title">Cash Flow Overview</div>
              <div className="health-subtitle">Monthly inflow vs outflow with 30-day projection</div>
            </div>
          </div>
        </div>

        {/* Cash Flow Summary Cards */}
        <div className="stats-grid-4" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card-new">
            <div className="stat-icon-wrapper green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /></svg>
            </div>
            <div className="stat-content-new">
              <span className="stat-label-new">Total Inflow</span>
              <div className="stat-value-new" style={{ fontSize: '1.25rem' }}>{formatCurrency(totalInflow)}</div>
            </div>
          </div>
          <div className="stat-card-new">
            <div className="stat-icon-wrapper red">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /></svg>
            </div>
            <div className="stat-content-new">
              <span className="stat-label-new">Total Outflow</span>
              <div className="stat-value-new" style={{ fontSize: '1.25rem' }}>{formatCurrency(totalOutflow)}</div>
            </div>
          </div>
          <div className="stat-card-new">
            <div className="stat-icon-wrapper blue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </div>
            <div className="stat-content-new">
              <span className="stat-label-new">Net Cash Flow</span>
              <div className="stat-value-new" style={{ fontSize: '1.25rem', color: totalInflow - totalOutflow >= 0 ? '#10b981' : '#ef4444' }}>
                {formatCurrency(Math.abs(totalInflow - totalOutflow))}
              </div>
            </div>
          </div>
          <div className="stat-card-new">
            <div className="stat-icon-wrapper purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div className="stat-content-new">
              <span className="stat-label-new">30-Day Projection</span>
              <div className="stat-value-new" style={{ fontSize: '1.25rem', color: projectedCash >= 0 ? '#10b981' : '#ef4444' }}>
                {formatCurrency(Math.abs(projectedCash))}
              </div>
            </div>
          </div>
        </div>

        {/* Cash Flow Trend (bar chart) */}
        {cashFlowData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={cashFlowData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#718096' }} />
              <YAxis tick={{ fontSize: 12, fill: '#718096' }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                formatter={(v) => formatCurrency(v)}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Legend />
              <Bar dataKey="inflow" name="Inflow" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" name="Outflow" fill="#EF4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Net Cash" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="no-data-placeholder">No cash flow data available</div>
        )}
      </div>

      {/* === RECEIVABLES SUMMARY + COMPLIANCE TRACKER === */}
      <div className="dashboard-grid">
        {/* Receivables Summary */}
        <div className="dashboard-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c' }}>Receivables Summary</h3>
            <button
              onClick={() => setShowInvoiceModal(true)}
              style={{
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(79,70,229,0.4)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,70,229,0.3)'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Create Invoice
            </button>
          </div>

          <div className="receivables-table-wrapper">
            <table className="receivables-table">
              <thead>
                <tr>
                  <th>Client Name</th>
                  <th>Invoice Amount</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(invoices || []).slice(0, 5).map((inv, idx) => (
                  <tr key={inv.id || idx}>
                    <td style={{ fontWeight: 600, color: '#1a202c' }}>{inv.client_name || '-'}</td>
                    <td style={{ fontWeight: 600, color: '#4F46E5' }}>{formatCurrency(Number(inv.amount) || 0)}</td>
                    <td style={{ color: '#4a5568' }}>{formatDateShort(inv.due_date)}</td>
                    <td>{getStatusBadge(inv.status || 'pending')}</td>
                  </tr>
                ))}
                {(!invoices || invoices.length === 0) && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: '#a0aec0', padding: '2rem' }}>No invoices found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '13px', color: '#718096', fontWeight: 500 }}>Showing {Math.min((invoices || []).length, 5)} invoices</span>
            <button
              onClick={() => setActiveView && setActiveView('invoices')}
              style={{
                background: 'none', border: 'none', color: '#4F46E5', fontSize: '13px',
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => { e.target.style.color = '#7C3AED'; }}
              onMouseOut={(e) => { e.target.style.color = '#4F46E5'; }}
            >
              View all receivables →
            </button>
          </div>
        </div>

        {/* Compliance Tracker */}
        <div className="dashboard-section">
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c', marginBottom: '4px' }}>Compliance Tracker</h3>
          <p style={{ fontSize: '13px', color: '#718096', marginBottom: '1.5rem' }}>Due filings & deadlines</p>

          {/* Compliance KPI Cards */}
          <div className="compliance-kpi-grid">
            <div className="compliance-kpi-card">
              <div className="compliance-kpi-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                Compliance Score
              </div>
              <div className="compliance-kpi-value">{dashboardAlertStats.score}/100</div>
              <div className="compliance-kpi-sub">{dashboardAlertStats.score < 50 ? 'Needs Attention' : dashboardAlertStats.score < 80 ? 'Improving' : 'Good Standing'}</div>
            </div>
          </div>

          {/* Risk Alerts - scrollable, show 4 visible */}
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#1a202c', marginBottom: '0.75rem' }}>Risk Alerts</h4>
          <div className="dashboard-risk-alerts" style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
            {dashboardAlerts.sort((a, b) => {
              if (a.status === 'Filed' && b.status !== 'Filed') return 1;
              if (a.status !== 'Filed' && b.status === 'Filed') return -1;
              return new Date(a.due_date) - new Date(b.due_date);
            }).map((alert) => {
              const isFiled = alert.status === 'Filed';
              return (
                <div key={alert.id} className={`dashboard-risk-alert-row ${isFiled ? 'filed' : ''}`}>
                  <div className="risk-alert-left">
                    <div className={`risk-alert-icon ${isFiled ? 'filed' : ''}`}>
                      {isFiled ? '✓' : '⏰'}
                    </div>
                    <div>
                      <div className="risk-alert-title">{alert.name}</div>
                      <div className="risk-alert-meta">Due: {formatDateShort(alert.due_date)}</div>
                    </div>
                  </div>
                  <div className="risk-alert-right">
                    {isFiled ? (
                      <span className="filed-badge">Filed</span>
                    ) : (
                      <>
                        <span className="due-soon-badge">Due Soon</span>
                        <button className="mark-filed-btn" onClick={() => handleMarkAlertFiled(alert.id)}>Mark as Filed</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* === CREATE INVOICE MODAL === */}
      {showInvoiceModal && (
        <div className="modal-overlay" onClick={() => setShowInvoiceModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{
            background: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '480px', width: '90%',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)', position: 'relative'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '1.5rem', color: '#1a202c' }}>Create Invoice</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '6px' }}>Client Name</label>
                <input
                  type="text" value={invoiceForm.client_name}
                  onChange={(e) => setInvoiceForm(p => ({ ...p, client_name: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '6px' }}>Amount (₹)</label>
                <input
                  type="number" value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm(p => ({ ...p, amount: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="e.g. 250000"
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '6px' }}>Due Date</label>
                <input
                  type="date" value={invoiceForm.due_date}
                  onChange={(e) => setInvoiceForm(p => ({ ...p, due_date: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvoiceModal(false)} style={{
                padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white',
                color: '#4a5568', fontSize: '14px', fontWeight: 600, cursor: 'pointer'
              }}>Cancel</button>
              <button onClick={handleSubmitInvoice} style={{
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.3)'
              }}>Create Invoice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;