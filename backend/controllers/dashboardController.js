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

// GET /api/dashboard/insights — Data for AI CFO, Forecasting, and Profit Lab
const getInsightsData = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    // 1. AI CFO Data
    // Cost Optimization - Top expense category
    const topExpenseRes = await pool.query(`
      SELECT category, SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND type = 'expense'
      GROUP BY category
      ORDER BY total DESC
      LIMIT 1
    `, [companyId]);
    const topExpense = topExpenseRes.rows[0];

    const totalExpenseRes = await pool.query(`
      SELECT SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND type = 'expense'
    `, [companyId]);
    const totalExpense = parseFloat(totalExpenseRes.rows[0]?.total || 0);

    const costOptimization = topExpense ? {
      category: topExpense.category,
      amount: parseFloat(topExpense.total),
      savings: parseFloat(topExpense.total) * 0.12, // 12% savings
      percentOfTotal: (parseFloat(topExpense.total) / totalExpense) * 100
    } : null;

    // Tax Optimization
    const taxExpenseRes = await pool.query(`
      SELECT SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND type = 'expense' AND category ILIKE '%tax%'
    `, [companyId]);
    const totalTax = parseFloat(taxExpenseRes.rows[0]?.total || 0);
    const taxOptimization = {
      totalTax,
      monthlyAverage: totalTax / 12 // Simplified
    };

    // Cash Flow - Avg days between income, longest gap
    const incomeDatesRes = await pool.query(`
      SELECT date
      FROM transactions
      WHERE company_id = $1 AND type = 'income'
      ORDER BY date ASC
    `, [companyId]);
    
    let longestGap = 0;
    let totalGaps = 0;
    let gapsCount = 0;
    
    if (incomeDatesRes.rows.length > 1) {
      for (let i = 1; i < incomeDatesRes.rows.length; i++) {
        const d1 = new Date(incomeDatesRes.rows[i-1].date);
        const d2 = new Date(incomeDatesRes.rows[i].date);
        const diffDays = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diffDays > longestGap) longestGap = diffDays;
        totalGaps += diffDays;
        gapsCount++;
      }
    }
    const cashFlow = {
      longestGap,
      avgGap: gapsCount > 0 ? (totalGaps / gapsCount).toFixed(1) : 0
    };

    // Growth - Idle cash (Cash in bank - liabilities)
    // First get cash in bank
    const accountsResult = await pool.query(
      `SELECT COALESCE(SUM(opening_balance), 0) as total FROM accounts WHERE company_id = $1`,
      [companyId]
    );
    const allTime = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions 
       WHERE company_id = $1 GROUP BY type`,
      [companyId]
    );
    const getTotal = (rows, type) => parseFloat(rows.find(r => r.type === type)?.total || 0);
    const totalRevenue = getTotal(allTime.rows, 'income');
    const totalExpenses = getTotal(allTime.rows, 'expense');
    const netProfit = totalRevenue - totalExpenses;
    const cashInBank = parseFloat(accountsResult.rows[0].total) + netProfit;
    
    // Get payables
    const payablesRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM invoices 
       WHERE company_id = $1 AND type = 'payable' AND status IN ('pending', 'overdue')`,
      [companyId]
    );
    const totalPayables = parseFloat(payablesRes.rows[0].total);
    const idleCash = Math.max(0, cashInBank - totalPayables);
    const riskFreeRate = 0.07; // 7% T-bill
    
    const growth = {
      idleCash,
      estimatedReturn: idleCash * riskFreeRate
    };

    // 2. Forecasting Data (Last 6 months monthly trend)
    const monthlyTrendRes = await pool.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', date), 'Mon YYYY') as month_str,
        DATE_TRUNC('month', date) as month_val,
        type,
        SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND date >= NOW() - INTERVAL '6 months'
      GROUP BY month_str, month_val, type
      ORDER BY month_val ASC
    `, [companyId]);

    const historicalMonths = {};
    monthlyTrendRes.rows.forEach(r => {
      if (!historicalMonths[r.month_str]) {
        historicalMonths[r.month_str] = { name: r.month_str, revenue: 0, expenses: 0 };
      }
      if (r.type === 'income') historicalMonths[r.month_str].revenue = parseFloat(r.total);
      if (r.type === 'expense') historicalMonths[r.month_str].expenses = parseFloat(r.total);
    });
    
    const historicalData = Object.values(historicalMonths);
    
    // Calculate growth rates
    let revGrowth = 0;
    let expGrowth = 0;
    if (historicalData.length >= 2) {
      const first = historicalData[0];
      const last = historicalData[historicalData.length - 1];
      if (first.revenue > 0) revGrowth = (last.revenue - first.revenue) / first.revenue / historicalData.length;
      if (first.expenses > 0) expGrowth = (last.expenses - first.expenses) / first.expenses / historicalData.length;
    }
    
    const avgMonthlyExpense = historicalData.reduce((sum, m) => sum + m.expenses, 0) / (historicalData.length || 1);

    const forecast = {
      historicalData,
      revGrowthDisplay: (revGrowth * 100).toFixed(1),
      expGrowthDisplay: (expGrowth * 100).toFixed(1),
      cashInBank,
      avgMonthlyExpense,
      totalTax
    };

    // 3. Profit Lab Data
    // Profit by Client Segment (Approximated using Income Categories vs Expenses)
    // To make it interesting, we'll map Income Categories as "Segments"
    const segmentRes = await pool.query(`
      SELECT category as name, SUM(amount) as revenue
      FROM transactions
      WHERE company_id = $1 AND type = 'income'
      GROUP BY category
      ORDER BY revenue DESC
    `, [companyId]);
    
    // We'll simulate margin for segments by subtracting a proportional amount of total expense
    const segments = segmentRes.rows.map(r => {
      const rev = parseFloat(r.revenue);
      const revShare = totalRevenue > 0 ? rev / totalRevenue : 0;
      const allocatedExpense = totalExpense * revShare;
      const profit = rev - allocatedExpense;
      const profitMargin = rev > 0 ? (profit / rev) * 100 : 0;
      return {
        name: r.name || 'Uncategorized',
        revenue: rev,
        profitMargin: Math.max(0, profitMargin).toFixed(1) // Keep positive for display
      };
    });

    // Top Expense Categories
    const topExpensesRes = await pool.query(`
      SELECT category as name, SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND type = 'expense'
      GROUP BY category
      ORDER BY total DESC
      LIMIT 8
    `, [companyId]);

    const profitLab = {
      segments,
      topExpenses: topExpensesRes.rows,
      historicalData // Reuse for Profit Trend over time
    };

    res.json({
      aiCfo: { costOptimization, taxOptimization, cashFlow, growth },
      forecast,
      profitLab
    });
  } catch (error) {
    console.error('Insights data error:', error);
    res.status(500).json({ error: 'Failed to fetch insights data' });
  }
};

module.exports = { getSummary, getInsightsData };
