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

    // 2. Forecasting Data — 12 months of history
    const monthlyTrendRes = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', date), 'Mon YYYY') as month_str,
        DATE_TRUNC('month', date) as month_val,
        type,
        SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND date >= NOW() - INTERVAL '12 months'
      GROUP BY month_str, month_val, type
      ORDER BY month_val ASC
    `, [companyId]);

    const historicalMonths = {};
    monthlyTrendRes.rows.forEach(r => {
      if (!historicalMonths[r.month_str]) {
        historicalMonths[r.month_str] = { name: r.month_str, revenue: 0, expenses: 0 };
      }
      if (r.type === 'income')  historicalMonths[r.month_str].revenue  = parseFloat(r.total);
      if (r.type === 'expense') historicalMonths[r.month_str].expenses = parseFloat(r.total);
    });

    const historicalData = Object.values(historicalMonths).map(m => ({
      ...m,
      netProfit: m.revenue - m.expenses,
      margin: m.revenue > 0 ? ((m.revenue - m.expenses) / m.revenue * 100).toFixed(1) : '0.0'
    }));

    // Average monthly revenue & expense — use last 3 completed months (exclude current partial month)
    const completedMonths = historicalData.filter(m => m.revenue > 0 || m.expenses > 0);
    const recent = completedMonths.slice(-3);
    const avgMonthlyRevenue = recent.length > 0
      ? recent.reduce((s, m) => s + m.revenue, 0)  / recent.length : 0;
    const avgMonthlyExpense = recent.length > 0
      ? recent.reduce((s, m) => s + m.expenses, 0) / recent.length : 0;

    // True month-over-month growth rate: average of individual MoM changes
    // This is what gets applied per-month in the compound projection formula.
    const momRevChanges = [];
    const momExpChanges = [];
    for (let i = 1; i < completedMonths.length; i++) {
      const prev = completedMonths[i - 1];
      const curr = completedMonths[i];
      if (prev.revenue  > 0) momRevChanges.push((curr.revenue  - prev.revenue)  / prev.revenue);
      if (prev.expenses > 0) momExpChanges.push((curr.expenses - prev.expenses) / prev.expenses);
    }
    // Trim outlier months (top & bottom 10%) when we have enough data
    const trimmedAvg = (arr) => {
      if (arr.length < 4) return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const cut = Math.floor(sorted.length * 0.1);
      const trimmed = sorted.slice(cut, sorted.length - cut);
      return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    };
    const momRevGrowth = trimmedAvg(momRevChanges); // e.g. 0.02 = 2% per month
    const momExpGrowth = trimmedAvg(momExpChanges);

    const runway = avgMonthlyExpense > 0 ? cashInBank / avgMonthlyExpense : 99;

    const forecast = {
      historicalData,
      // true MoM rates sent to frontend for compound projection
      momRevGrowth,
      momExpGrowth,
      // human-readable display (for KPI cards)
      revGrowthDisplay: (momRevGrowth * 100).toFixed(1),
      expGrowthDisplay: (momExpGrowth * 100).toFixed(1),
      cashInBank,
      avgMonthlyRevenue,
      avgMonthlyExpense,
      runway: runway.toFixed(1),
      totalTax,
      // basis label shown to user
      projectionBasis: `Avg of last ${recent.length} month${recent.length !== 1 ? 's' : ''}: ₹${Math.round(avgMonthlyRevenue).toLocaleString('en-IN')} revenue / mo`
    };

    // 3. Profit Lab Data
    // All-time segment revenue
    const segmentRes = await pool.query(`
      SELECT COALESCE(category,'Uncategorized') as name, SUM(amount) as revenue
      FROM transactions
      WHERE company_id = $1 AND type = 'income'
      GROUP BY COALESCE(category,'Uncategorized') ORDER BY revenue DESC
    `, [companyId]);

    // Quarterly income per segment (Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar)
    const qSegmentRes = await pool.query(`
      SELECT
        COALESCE(category,'Uncategorized') as segment,
        CASE
          WHEN EXTRACT(MONTH FROM date) IN (4,5,6)   THEN 'Q1'
          WHEN EXTRACT(MONTH FROM date) IN (7,8,9)   THEN 'Q2'
          WHEN EXTRACT(MONTH FROM date) IN (10,11,12) THEN 'Q3'
          ELSE 'Q4'
        END as quarter,
        SUM(amount) as revenue
      FROM transactions
      WHERE company_id = $1 AND type = 'income' AND date >= NOW() - INTERVAL '12 months'
      GROUP BY COALESCE(category,'Uncategorized'),
               CASE
                 WHEN EXTRACT(MONTH FROM date) IN (4,5,6)    THEN 'Q1'
                 WHEN EXTRACT(MONTH FROM date) IN (7,8,9)    THEN 'Q2'
                 WHEN EXTRACT(MONTH FROM date) IN (10,11,12) THEN 'Q3'
                 ELSE 'Q4'
               END
    `, [companyId]);

    // Quarterly expenses overall
    const qExpenseRes = await pool.query(`
      SELECT
        CASE
          WHEN EXTRACT(MONTH FROM date) IN (4,5,6)   THEN 'Q1'
          WHEN EXTRACT(MONTH FROM date) IN (7,8,9)   THEN 'Q2'
          WHEN EXTRACT(MONTH FROM date) IN (10,11,12) THEN 'Q3'
          ELSE 'Q4'
        END as quarter,
        SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND type = 'expense' AND date >= NOW() - INTERVAL '12 months'
      GROUP BY CASE
                 WHEN EXTRACT(MONTH FROM date) IN (4,5,6)    THEN 'Q1'
                 WHEN EXTRACT(MONTH FROM date) IN (7,8,9)    THEN 'Q2'
                 WHEN EXTRACT(MONTH FROM date) IN (10,11,12) THEN 'Q3'
                 ELSE 'Q4'
               END
    `, [companyId]);

    // Build quarterly revenue totals map
    const qRevTotals = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    const qExpTotals = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    qExpenseRes.rows.forEach(r => { qExpTotals[r.quarter] = parseFloat(r.total); });

    // Per-segment quarterly revenue
    const segQMap = {}; // { segmentName: { Q1: rev, Q2: rev, ... } }
    qSegmentRes.rows.forEach(r => {
      if (!segQMap[r.segment]) segQMap[r.segment] = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      segQMap[r.segment][r.quarter] = parseFloat(r.revenue);
      qRevTotals[r.quarter] += parseFloat(r.revenue);
    });

    // Compute margin per segment per quarter (proportional expense allocation)
    const segments = segmentRes.rows.map(r => {
      const rev       = parseFloat(r.revenue);
      const revShare  = totalRevenue > 0 ? rev / totalRevenue : 0;
      const alloc     = totalExpense * revShare;
      const profit    = rev - alloc;
      const margin    = rev > 0 ? (profit / rev * 100) : 0;
      const qData     = segQMap[r.name] || { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

      const qMargin = (q) => {
        const qRev = qData[q];
        if (!qRev || !qRevTotals[q]) return null;
        const qShare  = qRev / qRevTotals[q];
        const qExpAll = qExpTotals[q] * qShare;
        const m       = qRev > 0 ? ((qRev - qExpAll) / qRev * 100) : 0;
        return parseFloat(m.toFixed(1));
      };

      return {
        name: r.name,
        revenue: rev,
        profitMargin: parseFloat(Math.max(0, margin).toFixed(1)),
        Q1: qMargin('Q1'),
        Q2: qMargin('Q2'),
        Q3: qMargin('Q3'),
        Q4: qMargin('Q4')
      };
    });

    // Top expense categories with % of total
    const topExpensesRes = await pool.query(`
      SELECT COALESCE(category,'Uncategorized') as name, SUM(amount) as total
      FROM transactions
      WHERE company_id = $1 AND type = 'expense'
      GROUP BY COALESCE(category,'Uncategorized') ORDER BY total DESC LIMIT 8
    `, [companyId]);

    const topExpenses = topExpensesRes.rows.map(r => ({
      name:    r.name,
      total:   parseFloat(r.total),
      percent: totalExpense > 0 ? ((parseFloat(r.total) / totalExpense) * 100).toFixed(1) : '0.0'
    }));

    const grossMargin    = totalRevenue > 0 ? ((totalRevenue - totalExpense) / totalRevenue * 100).toFixed(1) : '0.0';
    const burnRate       = avgMonthlyExpense;
    const profitLab = {
      segments,
      topExpenses,
      historicalData,
      grossMargin,
      burnRate,
      totalRevenue,
      totalExpense,
      netProfit: totalRevenue - totalExpense
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
