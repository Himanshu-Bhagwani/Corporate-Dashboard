const { pool } = require('../config/db');

// GET /api/dashboard/summary — 8 KPI cards
const getSummary = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

    // Revenue & Expenses — current month
    const currentMonth = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions 
       WHERE company_id = $1 AND date >= $2 GROUP BY type`,
      [companyId, thisMonthStart]
    );

    // Revenue & Expenses — last month
    const lastMonth = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions 
       WHERE company_id = $1 AND date >= $2 AND date <= $3 GROUP BY type`,
      [companyId, lastMonthStart, lastMonthEnd]
    );

    // All-time totals
    const allTime = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions 
       WHERE company_id = $1 GROUP BY type`,
      [companyId]
    );

    const getTotal = (rows, type) => parseFloat(rows.find(r => r.type === type)?.total || 0);

    const totalRevenue = getTotal(allTime.rows, 'income');
    const totalExpenses = getTotal(allTime.rows, 'expense');
    const netProfit = totalRevenue - totalExpenses;

    const curRevenue = getTotal(currentMonth.rows, 'income');
    const curExpenses = getTotal(currentMonth.rows, 'expense');
    const prevRevenue = getTotal(lastMonth.rows, 'income');
    const prevExpenses = getTotal(lastMonth.rows, 'expense');

    const pctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100).toFixed(1) : cur > 0 ? 100 : 0;

    // Cash in Bank — sum of account opening balances + net transactions
    const accountsResult = await pool.query(
      `SELECT COALESCE(SUM(opening_balance), 0) as total FROM accounts WHERE company_id = $1`,
      [companyId]
    );
    const cashInBank = parseFloat(accountsResult.rows[0].total) + netProfit;

    // Receivables (pending/overdue invoices where type = 'receivable' or we use all invoices with status pending/overdue)
    const receivables = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices 
       WHERE company_id = $1 AND status IN ('pending', 'overdue')`,
      [companyId]
    );

    // Payables
    const payables = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM invoices 
       WHERE company_id = $1 AND type = 'payable' AND status IN ('pending', 'overdue')`,
      [companyId]
    );

    // Overdue invoices
    const overdue = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM invoices 
       WHERE company_id = $1 AND status != 'paid' AND due_date < CURRENT_DATE`,
      [companyId]
    );

    // Cash Runway — cash / avg monthly expenses (last 6 months)
    const avgExpenses = await pool.query(
      `SELECT COALESCE(AVG(monthly_total), 0) as avg_expense FROM (
         SELECT DATE_TRUNC('month', date) as month, SUM(amount) as monthly_total
         FROM transactions WHERE company_id = $1 AND type = 'expense' AND date >= NOW() - INTERVAL '6 months'
         GROUP BY month
       ) sub`,
      [companyId]
    );
    const avgMonthlyExpense = parseFloat(avgExpenses.rows[0].avg_expense || 1);
    const cashRunway = avgMonthlyExpense > 0 ? (cashInBank / avgMonthlyExpense).toFixed(1) : 0;

    res.json({
      totalRevenue,
      totalExpenses,
      netProfit,
      cashInBank,
      totalReceivables: parseFloat(receivables.rows[0].total),
      receivablesCount: parseInt(receivables.rows[0].count),
      totalPayables: parseFloat(payables.rows[0].total),
      overdueInvoices: parseInt(overdue.rows[0].count),
      overdueAmount: parseFloat(overdue.rows[0].total),
      cashRunway: parseFloat(cashRunway),
      revenueChange: pctChange(curRevenue, prevRevenue),
      expensesChange: pctChange(curExpenses, prevExpenses),
      profitChange: pctChange(curRevenue - curExpenses, prevRevenue - prevExpenses),
      cashChange: 0, // Simplified
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
};

module.exports = { getSummary };
