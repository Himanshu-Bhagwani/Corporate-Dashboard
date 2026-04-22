const { pool } = require('../config/db');

/**
 * GET /api/notifications
 * Generates real-time notifications for the current company.
 * Notifications are a computed view — they reflect live data:
 *   1. Upcoming invoices (due within 7 days)
 *   2. Upcoming compliance events (with date)
 *   3. Pending/overdue compliance (how many days)
 *   4. Upcoming/Pending payables (days till or days overdue)
 *   5. High cash outflow or low cash runway (≤ 2.5 months)
 *   6. Low compliance score (< 70)
 *
 * Dismissed notifications are stored in `notification_dismissals`.
 */
const getNotifications = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const notifications = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Get dismissed notification keys
    let dismissedKeys = new Set();
    try {
      const dismissed = await pool.query(
        `SELECT notification_key FROM notification_dismissals WHERE company_id = $1`,
        [companyId]
      );
      dismissedKeys = new Set(dismissed.rows.map(r => r.notification_key));
    } catch (e) {
      // Table may not exist yet, that's fine
    }

    // ─── 1. UPCOMING INVOICES (due within 7 days, not paid) ───
    const upcomingInvoices = await pool.query(
      `SELECT id, invoice_number, client_name, vendor_name, amount, type,
              TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status
       FROM invoices 
       WHERE company_id = $1 
         AND status IN ('pending')
         AND due_date >= CURRENT_DATE 
         AND due_date <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY due_date ASC`,
      [companyId]
    );

    for (const inv of upcomingInvoices.rows) {
      const key = `upcoming-invoice-${inv.id}`;
      if (dismissedKeys.has(key)) continue;
      const dueDate = new Date(inv.due_date);
      const daysLeft = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: key,
        type: 'invoice',
        severity: daysLeft <= 2 ? 'warning' : 'info',
        title: `Invoice ${inv.invoice_number} due ${daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}`,
        description: `${inv.client_name || inv.vendor_name || 'Unknown'} — ₹${Number(inv.amount).toLocaleString('en-IN')}`,
        date: inv.due_date,
        category: 'Invoices',
        actionView: 'invoices',
      });
    }

    // ─── 2. UPCOMING COMPLIANCE (due within 14 days, PENDING) ───
    const upcomingCompliance = await pool.query(
      `SELECT id, type, title, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status
       FROM compliance_events 
       WHERE company_id = $1 
         AND status = 'PENDING'
         AND due_date >= CURRENT_DATE 
         AND due_date <= CURRENT_DATE + INTERVAL '14 days'
       ORDER BY due_date ASC`,
      [companyId]
    );

    for (const ev of upcomingCompliance.rows) {
      const key = `upcoming-compliance-${ev.id}`;
      if (dismissedKeys.has(key)) continue;
      const dueDate = new Date(ev.due_date);
      const daysLeft = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: key,
        type: 'compliance',
        severity: daysLeft <= 3 ? 'warning' : 'info',
        title: `${ev.title} due ${daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}`,
        description: `Compliance filing deadline — ${ev.due_date}`,
        date: ev.due_date,
        category: 'Compliance',
        actionView: 'compliance',
      });
    }

    // ─── 3. PENDING/OVERDUE COMPLIANCE ───
    const overdueCompliance = await pool.query(
      `SELECT id, type, title, TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status
       FROM compliance_events 
       WHERE company_id = $1 
         AND status = 'OVERDUE'
       ORDER BY due_date ASC`,
      [companyId]
    );

    for (const ev of overdueCompliance.rows) {
      const key = `overdue-compliance-${ev.id}`;
      if (dismissedKeys.has(key)) continue;
      const dueDate = new Date(ev.due_date);
      const daysPending = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: key,
        type: 'compliance',
        severity: 'critical',
        title: `${ev.title} — ${daysPending} day${daysPending !== 1 ? 's' : ''} overdue`,
        description: `Was due on ${ev.due_date}. File urgently to avoid penalties.`,
        date: ev.due_date,
        category: 'Compliance',
        actionView: 'compliance',
      });
    }

    // ─── 4. UPCOMING/PENDING PAYABLES ───
    const payables = await pool.query(
      `SELECT id, invoice_number, vendor_name, client_name, amount, type,
              TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, status
       FROM invoices 
       WHERE company_id = $1 
         AND type = 'payable'
         AND status IN ('pending', 'overdue')
       ORDER BY due_date ASC`,
      [companyId]
    );

    for (const inv of payables.rows) {
      const key = `payable-${inv.id}`;
      if (dismissedKeys.has(key)) continue;
      const dueDate = new Date(inv.due_date);
      const diff = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      
      if (diff < 0) {
        // Overdue payable
        notifications.push({
          id: key,
          type: 'payable',
          severity: 'critical',
          title: `Payable ${inv.invoice_number} — ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`,
          description: `${inv.vendor_name || inv.client_name || 'Vendor'} — ₹${Number(inv.amount).toLocaleString('en-IN')}`,
          date: inv.due_date,
          category: 'Payables',
          actionView: 'invoices',
        });
      } else if (diff <= 7) {
        // Upcoming payable
        notifications.push({
          id: key,
          type: 'payable',
          severity: diff <= 2 ? 'warning' : 'info',
          title: `Payable ${inv.invoice_number} due ${diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `in ${diff} days`}`,
          description: `${inv.vendor_name || inv.client_name || 'Vendor'} — ₹${Number(inv.amount).toLocaleString('en-IN')}`,
          date: inv.due_date,
          category: 'Payables',
          actionView: 'invoices',
        });
      }
    }

    // ─── 5. HIGH CASH OUTFLOW / LOW CASH RUNWAY ≤ 2.5 months ───
    try {
      // Calculate cash runway
      const accountsResult = await pool.query(
        `SELECT COALESCE(SUM(opening_balance), 0) as total FROM accounts WHERE company_id = $1`,
        [companyId]
      );
      const allTime = await pool.query(
        `SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 GROUP BY type`,
        [companyId]
      );
      const getTotal = (rows, type) => parseFloat(rows.find(r => r.type === type)?.total || 0);
      const netProfit = getTotal(allTime.rows, 'income') - getTotal(allTime.rows, 'expense');
      const cashInBank = parseFloat(accountsResult.rows[0].total) + netProfit;

      const avgExpenses = await pool.query(
        `SELECT COALESCE(AVG(monthly_total), 0) as avg_expense FROM (
           SELECT DATE_TRUNC('month', date) as month, SUM(amount) as monthly_total
           FROM transactions WHERE company_id = $1 AND type = 'expense' AND date >= NOW() - INTERVAL '6 months'
           GROUP BY month
         ) sub`,
        [companyId]
      );
      const avgMonthlyExpense = parseFloat(avgExpenses.rows[0].avg_expense || 1);
      const cashRunway = avgMonthlyExpense > 0 ? (cashInBank / avgMonthlyExpense) : 999;

      if (cashRunway <= 2.5 && cashRunway >= 0) {
        const key = `low-cash-runway`;
        if (!dismissedKeys.has(key)) {
          notifications.push({
            id: key,
            type: 'metric',
            severity: cashRunway <= 1 ? 'critical' : 'warning',
            title: `Low cash runway — ${cashRunway.toFixed(1)} months remaining`,
            description: `At current expense rate of ₹${Math.round(avgMonthlyExpense).toLocaleString('en-IN')}/mo, funds may run low.`,
            date: today,
            category: 'Financial Health',
            actionView: 'dashboard',
          });
        }
      }

      // Check for high cash outflow (current month expenses > 120% of average)
      const currentMonthExpenses = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE company_id = $1 AND type = 'expense' AND date >= DATE_TRUNC('month', CURRENT_DATE)`,
        [companyId]
      );
      const curMonthExp = parseFloat(currentMonthExpenses.rows[0].total);
      if (avgMonthlyExpense > 0 && curMonthExp > avgMonthlyExpense * 1.2) {
        const key = `high-cash-outflow`;
        if (!dismissedKeys.has(key)) {
          const pctAbove = (((curMonthExp / avgMonthlyExpense) - 1) * 100).toFixed(0);
          notifications.push({
            id: key,
            type: 'metric',
            severity: 'warning',
            title: `High cash outflow this month — ${pctAbove}% above average`,
            description: `₹${Math.round(curMonthExp).toLocaleString('en-IN')} vs avg ₹${Math.round(avgMonthlyExpense).toLocaleString('en-IN')}/mo`,
            date: today,
            category: 'Financial Health',
            actionView: 'analytics',
          });
        }
      }
    } catch (e) {
      console.error('Metrics notification error:', e.message);
    }

    // ─── 6. LOW COMPLIANCE SCORE (< 70) ───
    try {
      const scoreResult = await pool.query(
        `SELECT score FROM compliance_scores WHERE company_id = $1`,
        [companyId]
      );
      if (scoreResult.rows.length > 0) {
        const score = parseInt(scoreResult.rows[0].score);
        if (score < 70) {
          const key = `low-compliance-score`;
          if (!dismissedKeys.has(key)) {
            notifications.push({
              id: key,
              type: 'compliance',
              severity: score < 50 ? 'critical' : 'warning',
              title: `Low compliance score — ${score}%`,
              description: `Your compliance score is below the recommended threshold. Review pending filings.`,
              date: today,
              category: 'Compliance',
              actionView: 'compliance',
            });
          }
        }
      }
    } catch (e) {
      // compliance_scores may not exist yet
    }

    // ─── 7. AI CFO — EXPENSE SPIKE (>30% vs last month in any category) ───
    try {
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

      const curCatExp = await pool.query(
        `SELECT category, SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'expense' AND date >= $2 GROUP BY category ORDER BY total DESC LIMIT 1`,
        [companyId, thisMonthStart]
      );
      if (curCatExp.rows.length > 0) {
        const topCat = curCatExp.rows[0];
        const prevCatExp = await pool.query(
          `SELECT SUM(amount) as total FROM transactions WHERE company_id = $1 AND type = 'expense' AND category = $2 AND date >= $3 AND date <= $4`,
          [companyId, topCat.category, lastMonthStart, lastMonthEnd]
        );
        const prevTotal = parseFloat(prevCatExp.rows[0]?.total || 0);
        const curTotal = parseFloat(topCat.total);
        if (prevTotal > 0 && curTotal > prevTotal * 1.3) {
          const pct = (((curTotal / prevTotal) - 1) * 100).toFixed(0);
          const key = `aicfo-expense-spike`;
          if (!dismissedKeys.has(key)) {
            notifications.push({
              id: key,
              type: 'metric',
              severity: pct > 50 ? 'critical' : 'warning',
              title: `${topCat.category || 'Uncategorized'} expenses spiked ${pct}%`,
              description: `₹${Math.round(curTotal).toLocaleString('en-IN')} this month vs ₹${Math.round(prevTotal).toLocaleString('en-IN')} last month`,
              date: today,
              category: 'AI CFO Insight',
              actionView: 'aicfo',
            });
          }
        }
      }
    } catch (e) {
      console.error('Expense spike notification error:', e.message);
    }

    // ─── 8. AI CFO — REVENUE DECLINE (>20% drop vs last month) ───
    try {
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

      const curRev = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 AND type = 'income' AND date >= $2`,
        [companyId, thisMonthStart]
      );
      const prevRev = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 AND type = 'income' AND date >= $2 AND date <= $3`,
        [companyId, lastMonthStart, lastMonthEnd]
      );
      const curRevTotal = parseFloat(curRev.rows[0].total);
      const prevRevTotal = parseFloat(prevRev.rows[0].total);
      if (prevRevTotal > 0 && curRevTotal < prevRevTotal * 0.8) {
        const dropPct = (((prevRevTotal - curRevTotal) / prevRevTotal) * 100).toFixed(0);
        const key = `aicfo-revenue-decline`;
        if (!dismissedKeys.has(key)) {
          notifications.push({
            id: key,
            type: 'metric',
            severity: dropPct > 40 ? 'critical' : 'warning',
            title: `Revenue dropped ${dropPct}% vs last month`,
            description: `₹${Math.round(curRevTotal).toLocaleString('en-IN')} this month vs ₹${Math.round(prevRevTotal).toLocaleString('en-IN')} last month`,
            date: today,
            category: 'AI CFO Insight',
            actionView: 'aicfo',
          });
        }
      }
    } catch (e) {
      console.error('Revenue decline notification error:', e.message);
    }

    // ─── 9. AI CFO — LOW PROFIT MARGIN (<10%) ───
    try {
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthTotals = await pool.query(
        `SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 AND date >= $2 GROUP BY type`,
        [companyId, thisMonthStart]
      );
      const getT = (rows, type) => parseFloat(rows.find(r => r.type === type)?.total || 0);
      const mRev = getT(monthTotals.rows, 'income');
      const mExp = getT(monthTotals.rows, 'expense');
      if (mRev > 0) {
        const margin = ((mRev - mExp) / mRev) * 100;
        if (margin < 10) {
          const key = `aicfo-margin-warning`;
          if (!dismissedKeys.has(key)) {
            notifications.push({
              id: key,
              type: 'metric',
              severity: margin < 0 ? 'critical' : 'warning',
              title: `Profit margin at ${margin.toFixed(1)}% this month`,
              description: margin < 0 ? 'You are operating at a loss this month.' : 'Margin is below the 10% healthy threshold.',
              date: today,
              category: 'AI CFO Insight',
              actionView: 'aicfo',
            });
          }
        }
      }
    } catch (e) {
      console.error('Margin warning notification error:', e.message);
    }

    // Sort by severity (critical > warning > info) then by date
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
      if (sevDiff !== 0) return sevDiff;
      return new Date(a.date) - new Date(b.date);
    });

    res.json({ notifications, total: notifications.length });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/**
 * POST /api/notifications/dismiss
 * Dismiss a notification by its key. Stores in DB so it stays dismissed.
 */
const dismissNotification = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { notificationKey } = req.body;
    if (!notificationKey) return res.status(400).json({ error: 'Notification key required' });

    await pool.query(
      `INSERT INTO notification_dismissals (company_id, notification_key) 
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [companyId, notificationKey]
    );

    res.json({ message: 'Notification dismissed' });
  } catch (error) {
    console.error('Dismiss notification error:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
};

/**
 * DELETE /api/notifications/dismiss-all
 * Clear all dismissed notifications (reset). Or dismiss all current ones.
 */
const dismissAllNotifications = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    const { keys } = req.body;
    if (keys && keys.length > 0) {
      // Dismiss specific keys
      for (const key of keys) {
        await pool.query(
          `INSERT INTO notification_dismissals (company_id, notification_key) 
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [companyId, key]
        );
      }
    }

    res.json({ message: 'All notifications dismissed' });
  } catch (error) {
    console.error('Dismiss all notifications error:', error);
    res.status(500).json({ error: 'Failed to dismiss notifications' });
  }
};

module.exports = { getNotifications, dismissNotification, dismissAllNotifications };
