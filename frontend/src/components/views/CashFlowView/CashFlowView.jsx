import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import './CashFlowView.css';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toMonthKey = (dateValue) => {
  if (!dateValue) return null;
  return String(dateValue).slice(0, 7);
};

const formatMonthLabel = (monthKey) => {
  if (!monthKey || !monthKey.includes('-')) return '-';
  const [year, month] = monthKey.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
};

const formatCompactINR = (value) => {
  const abs = Math.abs(Number(value) || 0);
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${(Number(value) || 0).toFixed(0)}`;
};

const createMonthRange = (startKey, endKey) => {
  if (!startKey || !endKey || startKey > endKey) return [];
  const [startYear, startMonth] = startKey.split('-').map(Number);
  const [endYear, endMonth] = endKey.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  const list = [];
  let pointer = new Date(start);

  while (pointer <= end) {
    const key = `${pointer.getFullYear()}-${String(pointer.getMonth() + 1).padStart(2, '0')}`;
    list.push(key);
    pointer = new Date(pointer.getFullYear(), pointer.getMonth() + 1, 1);
  }
  return list;
};

const CashFlowView = ({ transactions = [], invoices = [] }) => {
  const allMonths = useMemo(() => {
    const monthSet = new Set();
    transactions.forEach((t) => {
      const key = toMonthKey(t.date);
      if (key) monthSet.add(key);
    });
    invoices.forEach((i) => {
      const key = toMonthKey(i.issue_date || i.due_date);
      if (key) monthSet.add(key);
    });
    return [...monthSet].sort();
  }, [transactions, invoices]);

  const defaultFrom = allMonths[0] || '';
  const defaultTo = allMonths[allMonths.length - 1] || '';

  const [fromMonth, setFromMonth] = useState(defaultFrom);
  const [toMonth, setToMonth] = useState(defaultTo);
  const [openingBalance, setOpeningBalance] = useState(3000000);
  const [showAllSummary, setShowAllSummary] = useState(false);

  const normalizedFrom = fromMonth || defaultFrom;
  const normalizedTo = toMonth || defaultTo;

  const monthKeysInRange = useMemo(
    () => createMonthRange(normalizedFrom, normalizedTo),
    [normalizedFrom, normalizedTo]
  );

  const monthlySummary = useMemo(() => {
    const base = monthKeysInRange.reduce((acc, monthKey) => {
      acc[monthKey] = {
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      return acc;
    }, {});

    transactions.forEach((t) => {
      const monthKey = toMonthKey(t.date);
      if (!monthKey || !base[monthKey]) return;
      const amount = Number(t.amount) || 0;
      if (t.type === 'income') {
        base[monthKey].inflow += amount;
      } else if (t.type === 'expense') {
        base[monthKey].outflow += amount;
      }
    });

    invoices.forEach((inv) => {
      const monthKey = toMonthKey(inv.issue_date || inv.due_date);
      if (!monthKey || !base[monthKey]) return;
      const amount = Number(inv.amount) || 0;
      if (amount <= 0) return;

      if (inv.status === 'paid') {
        base[monthKey].inflow += amount;
      } else if (inv.status === 'overdue') {
        base[monthKey].outflow += amount * 0.02;
      }
    });

    return Object.values(base).map((m) => ({
      ...m,
      net: m.inflow - m.outflow,
    }));
  }, [monthKeysInRange, transactions, invoices]);

  const totals = useMemo(() => {
    const inflow = monthlySummary.reduce((sum, row) => sum + row.inflow, 0);
    const outflow = monthlySummary.reduce((sum, row) => sum + row.outflow, 0);
    const net = inflow - outflow;
    const closing = (Number(openingBalance) || 0) + net;
    return { inflow, outflow, net, closing };
  }, [monthlySummary, openingBalance]);

  const displayedSummary = showAllSummary ? monthlySummary : monthlySummary.slice(-6);

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header">
        <div>
          <h1 className="view-title">Cash Flow</h1>
          <p className="view-subtitle">Track your cash inflows and outflows</p>
        </div>
      </div>

      <div className="cashflow-controls">
        <div className="cashflow-control-group">
          <label>From Month</label>
          <input
            type="month"
            className="filter-select"
            value={normalizedFrom}
            onChange={(e) => setFromMonth(e.target.value)}
            style={{ minWidth: 'auto', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}
          />
        </div>
        <div className="cashflow-control-group">
          <label>To Month</label>
          <input
            type="month"
            className="filter-select"
            value={normalizedTo}
            onChange={(e) => setToMonth(e.target.value)}
            style={{ minWidth: 'auto', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div className="cashflow-balance-card">
        <div className="cashflow-opening">
          <label htmlFor="opening-balance">Opening Balance (₹)</label>
          <input
            id="opening-balance"
            type="number"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </div>
        <div className="cashflow-balance-metrics">
          <div className="metric-item">
            <span>Total Period Inflow</span>
            <strong className="green">{formatCompactINR(totals.inflow)}</strong>
          </div>
          <div className="metric-item">
            <span>Total Period Outflow</span>
            <strong className="red">{formatCompactINR(totals.outflow)}</strong>
          </div>
          <div className="metric-item">
            <span>Closing Balance</span>
            <strong className="blue">{formatCompactINR(totals.closing)}</strong>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="cashflow-table-title" style={{ margin: 0 }}>Monthly Summary</div>
          {monthlySummary.length > 6 && !showAllSummary && (
            <button 
              onClick={() => setShowAllSummary(true)} 
              style={{ 
                background: 'none', border: 'none', color: '#3b82f6', 
                fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
                padding: '0'
              }}
            >
              See all
            </button>
          )}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="align-right">Inflow</th>
              <th className="align-right">Outflow</th>
              <th className="align-right">Net Cash</th>
              <th className="align-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {displayedSummary.map((row) => (
              <tr key={row.monthKey}>
                <td><span className="table-main-text">{row.monthLabel}</span></td>
                <td className="align-right"><span className="table-amount positive">+{formatCompactINR(row.inflow)}</span></td>
                <td className="align-right"><span className="table-amount negative">-{formatCompactINR(row.outflow)}</span></td>
                <td className="align-right"><span className={`table-amount ${row.net >= 0 ? 'positive' : 'negative'}`}>{formatCompactINR(row.net)}</span></td>
                <td className="align-right">
                  <span className={`trend-badge ${row.net >= 0 ? 'up' : 'down'}`}>{row.net >= 0 ? '↗' : '↘'}</span>
                </td>
              </tr>
            ))}
            <tr className="cashflow-total-row">
              <td><strong>Total</strong></td>
              <td className="align-right"><strong className="green">+{formatCompactINR(totals.inflow)}</strong></td>
              <td className="align-right"><strong className="red">-{formatCompactINR(totals.outflow)}</strong></td>
              <td className="align-right"><strong>{formatCompactINR(totals.net)}</strong></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="dashboard-section cashflow-chart-section">
        <div className="section-header-simple">
          <h2 className="section-title-simple">Cash Flow Trend</h2>
        </div>
        <ResponsiveContainer width="100%" height={290}>
          <LineChart data={monthlySummary}>
            <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#718096' }} />
            <YAxis tick={{ fontSize: 12, fill: '#718096' }} tickFormatter={formatCompactINR} />
            <Tooltip formatter={(value) => formatCompactINR(value)} />
            <Legend />
            <Line type="monotone" dataKey="inflow" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} name="Inflow" />
            <Line type="monotone" dataKey="outflow" stroke="#EF4444" strokeWidth={3} dot={{ r: 4 }} name="Outflow" />
            <Line type="monotone" dataKey="net" stroke="#1E3A8A" strokeWidth={3} dot={{ r: 4 }} name="Net Cash" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default CashFlowView;
