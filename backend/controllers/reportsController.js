const { pool } = require('../config/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { generateResponse } = require('../services/aiService');
const formulas = require('../utils/accountingFormulas');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getCompanyId = (req) => {
  const id = req.headers['x-company-id'];
  if (!id) throw new Error('Company ID required');
  return id;
};

const fmtINR = (n) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const buildDateFilter = (from, to) => {
  const parts = [];
  const params = [];
  let idx = 2;
  if (from) { parts.push(`date >= $${idx++}`); params.push(from); }
  if (to)   { parts.push(`date <= $${idx++}`); params.push(to); }
  return { sql: parts.length ? `AND ${parts.join(' AND ')}` : '', params };
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const toMonthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};

// Indian FY runs April 1 → March 31; returns two most recently completed FYs
const getFYRanges = () => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const fy1EndYear = month >= 3 ? year : year - 1;
  return {
    fy1Start: `${fy1EndYear - 1}-04-01`,
    fy1End:   `${fy1EndYear}-03-31`,
    fy2Start: `${fy1EndYear - 2}-04-01`,
    fy2End:   `${fy1EndYear - 1}-03-31`,
    fy1Label: `31 March ${fy1EndYear}`,
    fy2Label: `31 March ${fy1EndYear - 1}`
  };
};

// ─── PDF helpers ──────────────────────────────────────────────────────────────

const M = 50;
const BLUE = '#1E3A8A';
const ALT  = '#f8fafc';

const pdfPageHeader = (doc, reportTitle, periodLabel) => {
  doc.rect(M, M, doc.page.width - M * 2, 64).fill(BLUE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15)
     .text('SODA Corporate Dashboard', M + 14, M + 10, { lineBreak: false });
  doc.fillColor('#93c5fd').font('Helvetica').fontSize(10)
     .text(reportTitle, M + 14, M + 32, { lineBreak: false });
  if (periodLabel) {
    doc.fillColor('#bfdbfe').font('Helvetica').fontSize(9)
       .text(periodLabel, doc.page.width - M - 180, M + 18, { width: 170, align: 'right', lineBreak: false });
  }
  doc.fillColor('#e2e8f0').font('Helvetica').fontSize(8)
     .text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
           doc.page.width - M - 180, M + 36, { width: 170, align: 'right', lineBreak: false });
  return M + 82;
};

const pdfSectionTitle = (doc, title, y) => {
  doc.rect(M, y, doc.page.width - M * 2, 22).fill('#eff6ff');
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10)
     .text(title, M + 8, y + 6, { lineBreak: false });
  return y + 30;
};

const drawTable = (doc, { headers, rows, colWidths, startY, rowH = 26 }) => {
  const startX = M;
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  let y = startY;

  doc.rect(startX, y, totalW, rowH).fill(BLUE);
  let x = startX;
  headers.forEach((h, i) => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
       .text(h, x + 6, y + 8, { width: colWidths[i] - 12, lineBreak: false, align: i === 0 ? 'left' : 'right' });
    x += colWidths[i];
  });
  y += rowH;

  rows.forEach((row, ri) => {
    if (y + rowH > doc.page.height - M - 20) {
      doc.addPage();
      y = M;
    }
    if (row._sep) {
      doc.moveTo(startX, y).lineTo(startX + totalW, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      y += 6;
      return;
    }
    const isTotal = !!row._total;
    const isHL    = !!row._hl;

    if (isTotal) doc.rect(startX, y, totalW, rowH).fill('#e8f0fe');
    else if (isHL) doc.rect(startX, y, totalW, rowH).fill('#dbeafe');
    else if (ri % 2 === 1) doc.rect(startX, y, totalW, rowH).fill(ALT);

    x = startX;
    (row.cells || []).forEach((cell, ci) => {
      const txt   = String(cell?.text ?? cell ?? '');
      const bold  = cell?.bold || isTotal || isHL;
      const color = isHL ? BLUE : (cell?.color || '#1a202c');
      doc.fillColor(color)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(isTotal || isHL ? 10 : 9)
         .text(txt, x + 6, y + 8, {
           width: colWidths[ci] - 12,
           lineBreak: false,
           align: ci === 0 ? 'left' : 'right'
         });
      x += colWidths[ci];
    });
    y += rowH;
  });

  doc.moveTo(startX, y).lineTo(startX + totalW, y).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
  return y + 14;
};

// ─── Excel helpers ────────────────────────────────────────────────────────────

const XL_FMT = '#,##0.00';

const xlHeader = (row, count) => {
  row.height = 28;
  for (let i = 1; i <= count; i++) {
    const c = row.getCell(i);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'right' };
  }
};

const xlTotal = (row, count) => {
  for (let i = 1; i <= count; i++) {
    const c = row.getCell(i);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    c.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
    c.border = {
      top:    { style: 'medium', color: { argb: 'FF1E3A8A' } },
      bottom: { style: 'double', color: { argb: 'FF1E3A8A' } }
    };
    if (i > 1) c.numFmt = XL_FMT;
    c.alignment = { horizontal: i === 1 ? 'left' : 'right' };
  }
};

const xlSheetHeader = (sheet, title, subtitle) => {
  sheet.addRow([title]).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  sheet.getRow(1).height = 28;
  if (subtitle) { sheet.addRow([subtitle]).font = { size: 10, color: { argb: 'FF64748B' } }; }
  sheet.addRow([`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`])
       .font = { size: 9, color: { argb: 'FF94A3B8' } };
  sheet.addRow([]);
};

// ─── Report data fetchers ─────────────────────────────────────────────────────

const fetchPnLData = async (companyId, dateSQL, baseParams) => {
  const [revR, expR] = await Promise.all([
    pool.query(`SELECT COALESCE(category,'Uncategorized') AS cat, SUM(amount) AS total
                FROM transactions WHERE company_id = $1 AND type = 'income' ${dateSQL}
                GROUP BY cat ORDER BY total DESC`, baseParams),
    pool.query(`SELECT COALESCE(category,'Uncategorized') AS cat, SUM(amount) AS total
                FROM transactions WHERE company_id = $1 AND type = 'expense' ${dateSQL}
                GROUP BY cat ORDER BY total DESC`, baseParams)
  ]);
  const totalRev = revR.rows.reduce((s, r) => s + parseFloat(r.total), 0);
  const totalExp = expR.rows.reduce((s, r) => s + parseFloat(r.total), 0);

  const interestExp = expR.rows
    .filter(r => /interest|bank charge|finance|loan/i.test(r.cat))
    .reduce((s, r) => s + parseFloat(r.total), 0);
  const taxExp = expR.rows
    .filter(r => /tax|gst|tds|cess/i.test(r.cat))
    .reduce((s, r) => s + parseFloat(r.total), 0);
  const cogsExp = expR.rows
    .filter(r => /purchase|cogs|cost of goods|raw material|direct|inventory/i.test(r.cat))
    .reduce((s, r) => s + parseFloat(r.total), 0);

  const cogsVal = cogsExp > 0 ? cogsExp : totalExp * 0.6;
  const net = formulas.netIncome(totalRev, totalExp);
  const gp = formulas.grossProfit(totalRev, cogsVal);
  const ebitVal = formulas.ebit(totalRev, totalExp, interestExp, taxExp);
  return {
    revenue: revR.rows, expenses: expR.rows, totalRev, totalExp,
    net,
    grossProfit: gp,
    grossProfitMargin: formulas.grossProfitMargin(gp, totalRev),
    netProfitMargin: formulas.netProfitMargin(net, totalRev),
    ebit: ebitVal,
    operatingProfit: ebitVal,
    interestCoverage: formulas.interestCoverage(ebitVal, Math.max(1, interestExp)),
  };
};

const fetchCashFlowData = async (companyId, dateSQL, baseParams) => {
  const result = await pool.query(`
    SELECT TO_CHAR(date,'YYYY-MM') AS month, type, SUM(amount) AS total
    FROM transactions WHERE company_id = $1 ${dateSQL}
    GROUP BY month, type ORDER BY month ASC`, baseParams);
  const monthMap = {};
  result.rows.forEach(r => {
    if (!monthMap[r.month]) monthMap[r.month] = { inflow: 0, outflow: 0 };
    if (r.type === 'income')  monthMap[r.month].inflow  = parseFloat(r.total);
    if (r.type === 'expense') monthMap[r.month].outflow = parseFloat(r.total);
  });
  let running = 0;
  return Object.entries(monthMap).map(([k, d]) => {
    const net = d.inflow - d.outflow;
    running += net;
    return { label: toMonthLabel(k), inflow: d.inflow, outflow: d.outflow, net, running };
  });
};

const fetchTaxData = async (companyId, dateSQL, baseParams) => {
  const r = await pool.query(`SELECT type, SUM(amount) AS total FROM transactions
    WHERE company_id = $1 ${dateSQL} GROUP BY type`, baseParams);
  let income = 0, expense = 0;
  r.rows.forEach(x => {
    if (x.type === 'income')  income  = parseFloat(x.total);
    if (x.type === 'expense') expense = parseFloat(x.total);
  });
  const net  = income - expense;
  const base = Math.max(0, net * 0.25);
  const sc   = base * 0.07;
  const cess = (base + sc) * 0.04;
  return {
    income, expense, net, baseTax: base, surcharge: sc, cess,
    totalTax: base + sc + cess,
    outputGST: income * 0.18,
    inputGST:  expense * 0.18,
    netGST:    Math.max(0, income * 0.18 - expense * 0.18)
  };
};

const fetchGSTData = async (companyId, dateSQL, baseParams) => {
  const result = await pool.query(`
    SELECT TO_CHAR(date,'YYYY-MM') AS month, type, SUM(amount) AS total
    FROM transactions WHERE company_id = $1 ${dateSQL}
    GROUP BY month, type ORDER BY month ASC`, baseParams);
  const monthMap = {};
  result.rows.forEach(r => {
    if (!monthMap[r.month]) monthMap[r.month] = { inc: 0, exp: 0 };
    if (r.type === 'income')  monthMap[r.month].inc = parseFloat(r.total);
    if (r.type === 'expense') monthMap[r.month].exp = parseFloat(r.total);
  });
  return Object.entries(monthMap).map(([k, d]) => ({
    label:  toMonthLabel(k),
    output: d.inc * 0.18,
    input:  d.exp * 0.18,
    net:    Math.max(0, d.inc * 0.18 - d.exp * 0.18)
  }));
};

const fetchBalanceSheetData = async (companyId, dateSQL, baseParams) => {
  const acct = await pool.query(`SELECT opening_balance FROM accounts WHERE company_id = $1`, [companyId]);
  const bankOpening = acct.rows.reduce((s, r) => s + parseFloat(r.opening_balance || 0), 0);
  const txn = await pool.query(`SELECT type, SUM(amount) AS total FROM transactions
    WHERE company_id = $1 ${dateSQL} GROUP BY type`, baseParams);
  let inc = 0, exp = 0;
  txn.rows.forEach(r => {
    if (r.type === 'income')  inc = parseFloat(r.total);
    if (r.type === 'expense') exp = parseFloat(r.total);
  });
  const recv = await pool.query(`SELECT COALESCE(SUM(amount),0) AS t FROM invoices
    WHERE company_id = $1 AND type = 'receivable' AND status IN ('pending','overdue')`, [companyId]);
  const pay = await pool.query(`SELECT COALESCE(SUM(amount),0) AS t FROM invoices
    WHERE company_id = $1 AND type = 'payable' AND status IN ('pending','overdue')`, [companyId]);
  const coa = await pool.query(`SELECT account_type, name, opening_balance FROM chart_of_accounts
    WHERE company_id = $1`, [companyId]);

  const coaByType = { Asset: [], Liability: [], Equity: [] };
  coa.rows.forEach(r => {
    if (coaByType[r.account_type]) {
      coaByType[r.account_type].push({ name: r.name, amount: parseFloat(r.opening_balance || 0) });
    }
  });

  const cash = Math.max(0, bankOpening + inc - exp);
  const receivables = parseFloat(recv.rows[0]?.t || 0);
  const payables = parseFloat(pay.rows[0]?.t || 0);
  const retainedEarnings = inc - exp;
  const currentA = formulas.currentAssetsTotal(cash, receivables);
  const currentL = payables;
  return {
    cash, receivables, payables, retainedEarnings,
    coaAssets:      coaByType.Asset.filter(a => a.amount > 0),
    coaLiabilities: coaByType.Liability.filter(a => a.amount > 0),
    coaEquity:      coaByType.Equity.filter(a => a.amount !== 0),
    workingCapital:  formulas.workingCapital(currentA, currentL),
    currentRatio:    formulas.currentRatio(currentA, currentL),
    quickRatio:      formulas.quickRatio(currentA, 0, currentL),
    debtRatio:       formulas.debtRatio(currentL, currentA),
    debtToEquity:    formulas.debtToEquity(currentL, Math.max(1, retainedEarnings)),
  };
};

// ─── API endpoints ────────────────────────────────────────────────────────────

// Returns statutory two-FY format consumed by the P&L viewer
const getPnL = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { fy1Start, fy1End, fy2Start, fy2End, fy1Label, fy2Label } = getFYRanges();

    const companyRes = await pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId]);
    const companyName = companyRes.rows[0]?.name || '';

    const revRes = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 THEN amount END), 0) as fy1,
        COALESCE(SUM(CASE WHEN date >= $4 AND date <= $5 THEN amount END), 0) as fy2
      FROM transactions WHERE company_id = $1 AND type = 'income'
    `, [companyId, fy1Start, fy1End, fy2Start, fy2End]);

    const allRevRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 AND type = 'income'`,
      [companyId]
    );
    const allExpRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 AND type = 'expense'`,
      [companyId]
    );

    const expRes = await pool.query(`
      SELECT
        COALESCE(category, 'Other') as category,
        COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 THEN amount END), 0) as fy1,
        COALESCE(SUM(CASE WHEN date >= $4 AND date <= $5 THEN amount END), 0) as fy2
      FROM transactions
      WHERE company_id = $1 AND type = 'expense'
      GROUP BY COALESCE(category, 'Other')
    `, [companyId, fy1Start, fy1End, fy2Start, fy2End]);

    const buckets = { cogs: [0, 0], employee: [0, 0], finance: [0, 0], depreciation: [0, 0], other: [0, 0] };
    expRes.rows.forEach(r => {
      const cat = (r.category || '').toLowerCase();
      const v1 = parseFloat(r.fy1 || 0);
      const v2 = parseFloat(r.fy2 || 0);
      let bucket;
      if (/salary|salaries|payroll|wages|stipend|employee/.test(cat))                bucket = 'employee';
      else if (/purchase|cogs|cost of goods|raw material|direct|inventory/.test(cat)) bucket = 'cogs';
      else if (/interest|bank charge|finance|loan/.test(cat))                         bucket = 'finance';
      else if (/depreciation|amortization/.test(cat))                                 bucket = 'depreciation';
      else                                                                             bucket = 'other';
      buckets[bucket][0] += v1;
      buckets[bucket][1] += v2;
    });

    const revFY1 = parseFloat(revRes.rows[0]?.fy1 || 0);
    const revFY2 = parseFloat(revRes.rows[0]?.fy2 || 0);

    res.json({
      companyName,
      fy1Label,
      fy2Label,
      revenue: {
        fromOperations: [revFY1, revFY2],
        otherIncome:    [0, 0]
      },
      expenses: {
        cogs:             buckets.cogs,
        employeeBenefits: buckets.employee,
        financeCosts:     buckets.finance,
        depreciation:     buckets.depreciation,
        other:            buckets.other
      },
      income:    parseFloat(allRevRes.rows[0]?.total || 0),
      expense:   parseFloat(allExpRes.rows[0]?.total || 0),
      netProfit: parseFloat(allRevRes.rows[0]?.total || 0) - parseFloat(allExpRes.rows[0]?.total || 0)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// Returns statutory two-FY format consumed by the Balance Sheet viewer
const getBalanceSheet = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { fy1Start, fy1End, fy2Start, fy2End, fy1Label, fy2Label } = getFYRanges();

    const companyRes = await pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId]);
    const companyName = companyRes.rows[0]?.name || '';

    const profitRes = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' AND date >= $2 AND date <= $3 THEN amount
                          WHEN type = 'expense' AND date >= $2 AND date <= $3 THEN -amount END), 0) as fy1_net,
        COALESCE(SUM(CASE WHEN type = 'income' AND date >= $4 AND date <= $5 THEN amount
                          WHEN type = 'expense' AND date >= $4 AND date <= $5 THEN -amount END), 0) as fy2_net
      FROM transactions WHERE company_id = $1
    `, [companyId, fy1Start, fy1End, fy2Start, fy2End]);

    const fy1Net = parseFloat(profitRes.rows[0]?.fy1_net || 0);
    const fy2Net = parseFloat(profitRes.rows[0]?.fy2_net || 0);

    const accountsRes = await pool.query(
      `SELECT COALESCE(SUM(opening_balance), 0) as total FROM accounts WHERE company_id = $1`,
      [companyId]
    );
    const allTimeNetRes = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as net
      FROM transactions WHERE company_id = $1
    `, [companyId]);

    const openingBal = parseFloat(accountsRes.rows[0]?.total || 0);
    const allTimeNet = parseFloat(allTimeNetRes.rows[0]?.net || 0);
    const cashFY1    = openingBal + allTimeNet;
    const cashFY2    = cashFY1 - fy1Net;

    const recRes = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM invoices
      WHERE company_id = $1 AND type = 'receivable' AND status IN ('pending', 'overdue')
    `, [companyId]);
    const tradeRec = parseFloat(recRes.rows[0]?.total || 0);

    const payRes = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM invoices
      WHERE company_id = $1 AND type = 'payable' AND status IN ('pending', 'overdue')
    `, [companyId]);
    const tradePay = parseFloat(payRes.rows[0]?.total || 0);

    const totalAssetsFY1 = cashFY1 + tradeRec;
    const totalAssetsFY2 = cashFY2;
    const partnersFY1    = totalAssetsFY1 - tradePay - fy1Net;
    const partnersFY2    = totalAssetsFY2 - fy2Net;

    const acctRes = await pool.query(`
      SELECT a.id, a.name, a.type, a.opening_balance,
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) as net
      FROM accounts a
      LEFT JOIN transactions t ON a.id = t.account_id AND t.company_id = $1
      WHERE a.company_id = $1
      GROUP BY a.id, a.name, a.type, a.opening_balance
    `, [companyId]);

    res.json({
      companyName,
      fy1Label,
      fy2Label,
      equity: {
        partnersContribution:   [Math.max(0, partnersFY1), Math.max(0, partnersFY2)],
        partnersCurrentAccount: [0, 0],
        reservesAndSurplus:     [fy1Net, fy2Net]
      },
      nonCurrentLiabilities: {
        longTermBorrowings:       [0, 0],
        deferredTaxLiabilities:   [0, 0],
        otherLongTermLiabilities: [0, 0],
        longTermProvisions:       [0, 0]
      },
      currentLiabilities: {
        shortTermBorrowings:     [0, 0],
        tradePayables:           [tradePay, 0],
        otherCurrentLiabilities: [0, 0],
        shortTermProvisions:     [0, 0]
      },
      nonCurrentAssets: {
        ppe:                   [0, 0],
        intangibleAssets:      [0, 0],
        capitalWIP:            [0, 0],
        intangibleUnderDev:    [0, 0],
        nonCurrentInvestments: [0, 0],
        deferredTaxAssets:     [0, 0],
        longTermLoans:         [0, 0],
        otherNonCurrent:       [0, 0]
      },
      currentAssets: {
        currentInvestments: [0, 0],
        inventories:        [0, 0],
        tradeReceivables:   [tradeRec, 0],
        cashAndBank:        [cashFY1, cashFY2],
        shortTermLoans:     [0, 0],
        otherCurrent:       [0, 0]
      },
      assets: acctRes.rows.map(r => ({
        name: r.name,
        balance: parseFloat(r.opening_balance) + parseFloat(r.net)
      })),
      liabilities:   [],
      equity_legacy: []
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const getCashFlow = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { from, to } = req.query;
    const { sql, params } = buildDateFilter(from, to);
    const base = [companyId, ...params];
    const [months, companyRes] = await Promise.all([
      fetchCashFlowData(companyId, sql, base),
      pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId])
    ]);
    res.json({
      companyName: companyRes.rows[0]?.name || '',
      period: { from: from || null, to: to || null },
      months,
      totals: {
        inflow:  months.reduce((s, m) => s + m.inflow, 0),
        outflow: months.reduce((s, m) => s + m.outflow, 0),
        net:     months.reduce((s, m) => s + m.net, 0)
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const getTax = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { from, to } = req.query;
    const { sql, params } = buildDateFilter(from, to);
    const [d, companyRes] = await Promise.all([
      fetchTaxData(companyId, sql, [companyId, ...params]),
      pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId])
    ]);
    res.json({
      companyName: companyRes.rows[0]?.name || '',
      period: { from: from || null, to: to || null },
      totalRevenue: d.income, totalExpenses: d.expense, netProfit: d.net,
      incomeTax: { baseTax: d.baseTax, rate: '25%', surcharge: d.surcharge, surchargeRate: '7%', cess: d.cess, cessRate: '4%', total: d.totalTax },
      gst: { outputGST: d.outputGST, inputGSTCredit: d.inputGST, netPayable: d.netGST },
      totalTaxLiability: d.totalTax + d.netGST
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const getGST = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { from, to } = req.query;
    const { sql, params } = buildDateFilter(from, to);
    const base = [companyId, ...params];
    const months = await fetchGSTData(companyId, sql, base);
    const totOut = months.reduce((s, m) => s + m.output, 0);
    const totIn  = months.reduce((s, m) => s + m.input, 0);
    res.json({
      period: { from: from || null, to: to || null },
      gstRate: '18%',
      summary: {
        outputGST: totOut, cgstOut: totOut / 2, sgstOut: totOut / 2,
        inputGST:  totIn,  cgstIn:  totIn / 2,  sgstIn:  totIn / 2,
        netPayable:    Math.max(0, totOut - totIn),
        netRefundable: Math.max(0, totIn - totOut)
      },
      months
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ─── Export ───────────────────────────────────────────────────────────────────

const exportReport = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { type = 'pnl', format = 'pdf', from, to } = req.query;
    const reportType  = type.toLowerCase();
    const { sql, params } = buildDateFilter(from, to);
    const baseParams  = [companyId, ...params];
    const periodLabel = from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Up to ${to}` : 'All Time';

    const TITLE_MAP = {
      pnl:             'Profit & Loss Statement',
      'balance-sheet': 'Balance Sheet',
      'cash-flow':     'Cash Flow Statement',
      tax:             'Tax Summary',
      gst:             'GST Report'
    };
    const reportTitle = TITLE_MAP[reportType] || reportType.toUpperCase();

    let aiNarrative = null;
    if (req.query.ai === 'true') {
      const sysPrompt = `You are a Chartered Accountant writing a board-ready Executive Summary. Write exactly 2 concise paragraphs in plain text. No Markdown, no headers. Use Rs. for rupees. Sound like a seasoned financial advisor.`;
      try {
        let ctx = '';
        if (reportType === 'pnl') {
          const d = await fetchPnLData(companyId, sql, baseParams);
          ctx = `P&L: Revenue Rs.${fmtINR(d.totalRev)}, Expenses Rs.${fmtINR(d.totalExp)}, Net Profit Rs.${fmtINR(d.net)}, Net Margin ${d.totalRev > 0 ? ((d.net/d.totalRev)*100).toFixed(1) : 0}%`;
        } else if (reportType === 'cash-flow') {
          const rows = await fetchCashFlowData(companyId, sql, baseParams);
          const ti = rows.reduce((s,r)=>s+r.inflow,0), to2 = rows.reduce((s,r)=>s+r.outflow,0);
          ctx = `Cash Flow: Total Inflow Rs.${fmtINR(ti)}, Total Outflow Rs.${fmtINR(to2)}, Net Rs.${fmtINR(ti-to2)}`;
        }
        if (ctx) {
          const text = await generateResponse(`Write an Executive Summary:\n${ctx}`, sysPrompt, false);
          aiNarrative = text.replace(/```/g,'').replace(/#{1,6}\s/g,'').trim();
        }
      } catch (e) { aiNarrative = 'AI summary unavailable.'; }
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: M, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report.pdf`);
      doc.pipe(res);

      let y = pdfPageHeader(doc, reportTitle, `Period: ${periodLabel}`);

      if (aiNarrative) {
        y = pdfSectionTitle(doc, 'AI EXECUTIVE NARRATIVE', y);
        doc.fillColor('#334155').font('Helvetica').fontSize(10)
           .text(aiNarrative, M, y, { width: doc.page.width - M * 2, align: 'justify', lineGap: 3 });
        y = doc.y + 24;
        doc.addPage();
        y = M;
      }

      if (reportType === 'pnl') {
        const d = await fetchPnLData(companyId, sql, baseParams);
        y = pdfSectionTitle(doc, 'REVENUE', y);
        const revRows = d.revenue.map(r => ({ cells: [r.cat, `₹${fmtINR(r.total)}`] }));
        revRows.push({ _sep: true });
        revRows.push({ _total: true, cells: ['Total Revenue', `₹${fmtINR(d.totalRev)}`] });
        y = drawTable(doc, { headers: ['Category', 'Amount (₹)'], rows: revRows, colWidths: [370, 140], startY: y });

        y += 12;
        y = pdfSectionTitle(doc, 'OPERATING EXPENSES', y);
        const expRows = d.expenses.map(r => ({ cells: [r.cat, `₹${fmtINR(r.total)}`] }));
        expRows.push({ _sep: true });
        expRows.push({ _total: true, cells: ['Total Expenses', `₹${fmtINR(d.totalExp)}`] });
        y = drawTable(doc, { headers: ['Category', 'Amount (₹)'], rows: expRows, colWidths: [370, 140], startY: y });

        y += 20;
        const margin = d.totalRev > 0 ? `${((d.net / d.totalRev) * 100).toFixed(1)}%` : '—';
        drawTable(doc, {
          headers: ['Summary', 'Value'],
          rows: [
            { _hl: true, cells: ['NET PROFIT / (LOSS)', `₹${fmtINR(d.net)}`] },
            { cells: ['Net Profit Margin', margin] }
          ],
          colWidths: [370, 140], startY: y
        });

      } else if (reportType === 'balance-sheet') {
        const d = await fetchBalanceSheetData(companyId, sql, baseParams);
        const totalAssets = d.cash + d.receivables + d.coaAssets.reduce((s,a)=>s+a.amount,0);
        const totalLiab   = d.payables + d.coaLiabilities.reduce((s,a)=>s+a.amount,0);
        const totalEq     = d.retainedEarnings + d.coaEquity.reduce((s,a)=>s+a.amount,0);

        y = pdfSectionTitle(doc, 'ASSETS', y);
        const assetRows = [
          { cells: ['Cash & Bank Balances', `₹${fmtINR(d.cash)}`] },
          { cells: ['Accounts Receivable',  `₹${fmtINR(d.receivables)}`] },
          ...d.coaAssets.map(a => ({ cells: [a.name, `₹${fmtINR(a.amount)}`] })),
          { _sep: true },
          { _total: true, cells: ['TOTAL ASSETS', `₹${fmtINR(totalAssets)}`] }
        ];
        y = drawTable(doc, { headers: ['Asset', 'Amount (₹)'], rows: assetRows, colWidths: [370, 140], startY: y });

        y += 12;
        y = pdfSectionTitle(doc, 'LIABILITIES', y);
        const liabRows = [
          { cells: ['Accounts Payable', `₹${fmtINR(d.payables)}`] },
          ...d.coaLiabilities.map(a => ({ cells: [a.name, `₹${fmtINR(a.amount)}`] })),
          { _sep: true },
          { _total: true, cells: ['TOTAL LIABILITIES', `₹${fmtINR(totalLiab)}`] }
        ];
        y = drawTable(doc, { headers: ['Liability', 'Amount (₹)'], rows: liabRows, colWidths: [370, 140], startY: y });

        y += 12;
        y = pdfSectionTitle(doc, 'EQUITY', y);
        const eqRows = [
          { cells: ['Retained Earnings', `₹${fmtINR(d.retainedEarnings)}`] },
          ...d.coaEquity.map(a => ({ cells: [a.name, `₹${fmtINR(a.amount)}`] })),
          { _sep: true },
          { _total: true, cells: ['TOTAL EQUITY', `₹${fmtINR(totalEq)}`] }
        ];
        y = drawTable(doc, { headers: ['Equity', 'Amount (₹)'], rows: eqRows, colWidths: [370, 140], startY: y });

        y += 20;
        drawTable(doc, {
          headers: ['Balance Check', 'Amount (₹)'],
          rows: [{ _hl: true, cells: ['TOTAL LIABILITIES + EQUITY', `₹${fmtINR(totalLiab + totalEq)}`] }],
          colWidths: [370, 140], startY: y
        });

      } else if (reportType === 'cash-flow') {
        const rows = await fetchCashFlowData(companyId, sql, baseParams);
        y = pdfSectionTitle(doc, 'MONTHLY CASH FLOW STATEMENT', y);
        const dataRows = rows.map(r => ({
          cells: [r.label, `₹${fmtINR(r.inflow)}`, `₹${fmtINR(r.outflow)}`, `₹${fmtINR(r.net)}`, `₹${fmtINR(r.running)}`]
        }));
        const ti = rows.reduce((s,r)=>s+r.inflow,0);
        const to2 = rows.reduce((s,r)=>s+r.outflow,0);
        const tn = rows.reduce((s,r)=>s+r.net,0);
        dataRows.push({ _sep: true });
        dataRows.push({ _total: true, cells: ['TOTAL', `₹${fmtINR(ti)}`, `₹${fmtINR(to2)}`, `₹${fmtINR(tn)}`, ''] });
        drawTable(doc, {
          headers: ['Month', 'Inflow (₹)', 'Outflow (₹)', 'Net (₹)', 'Running Bal. (₹)'],
          rows: dataRows, colWidths: [90, 110, 110, 100, 100], startY: y
        });

      } else if (reportType === 'tax') {
        const d = await fetchTaxData(companyId, sql, baseParams);
        y = pdfSectionTitle(doc, 'INCOME TAX COMPUTATION', y);
        y = drawTable(doc, {
          headers: ['Component', 'Rate', 'Amount (₹)'],
          rows: [
            { cells: ['Net Profit (PBT)', '', `₹${fmtINR(d.net)}`] },
            { cells: ['Corporate Tax',    '25%', `₹${fmtINR(d.baseTax)}`] },
            { cells: ['Surcharge',        '7%',  `₹${fmtINR(d.surcharge)}`] },
            { cells: ['H&E Cess',         '4%',  `₹${fmtINR(d.cess)}`] },
            { _sep: true },
            { _total: true, cells: ['Total Income Tax', '', `₹${fmtINR(d.totalTax)}`] }
          ],
          colWidths: [250, 80, 180], startY: y
        });
        y += 12;
        y = pdfSectionTitle(doc, 'GST LIABILITY', y);
        y = drawTable(doc, {
          headers: ['Component', 'Rate', 'Amount (₹)'],
          rows: [
            { cells: ['Output GST (Revenue)',        '18%', `₹${fmtINR(d.outputGST)}`] },
            { cells: ['Input GST Credit (Expenses)', '18%', `₹${fmtINR(d.inputGST)}`] },
            { _sep: true },
            { _total: true, cells: ['Net GST Payable', '', `₹${fmtINR(d.netGST)}`] }
          ],
          colWidths: [250, 80, 180], startY: y
        });
        y += 20;
        drawTable(doc, {
          headers: ['Summary', '', ''],
          rows: [{ _hl: true, cells: ['TOTAL TAX LIABILITY', '', `₹${fmtINR(d.totalTax + d.netGST)}`] }],
          colWidths: [250, 80, 180], startY: y
        });

      } else if (reportType === 'gst') {
        const months = await fetchGSTData(companyId, sql, baseParams);
        const totOut = months.reduce((s,m)=>s+m.output,0);
        const totIn  = months.reduce((s,m)=>s+m.input,0);
        const totNet = months.reduce((s,m)=>s+m.net,0);
        y = pdfSectionTitle(doc, 'GST SUMMARY', y);
        y = drawTable(doc, {
          headers: ['Component', 'CGST (₹)', 'SGST (₹)', 'Total (₹)'],
          rows: [
            { cells: ['Output GST (Sales)',           `₹${fmtINR(totOut/2)}`, `₹${fmtINR(totOut/2)}`, `₹${fmtINR(totOut)}`] },
            { cells: ['Input GST Credit (Purchases)', `₹${fmtINR(totIn/2)}`,  `₹${fmtINR(totIn/2)}`,  `₹${fmtINR(totIn)}`] },
            { _sep: true },
            { _total: true, cells: ['Net GST Payable', `₹${fmtINR(totNet/2)}`, `₹${fmtINR(totNet/2)}`, `₹${fmtINR(totNet)}`] }
          ],
          colWidths: [180, 110, 110, 110], startY: y
        });
        y += 12;
        y = pdfSectionTitle(doc, 'MONTHLY GST BREAKDOWN', y);
        const mRows = months.map(m => ({
          cells: [m.label, `₹${fmtINR(m.output)}`, `₹${fmtINR(m.input)}`, `₹${fmtINR(m.net)}`]
        }));
        mRows.push({ _sep: true });
        mRows.push({ _total: true, cells: ['Total', `₹${fmtINR(totOut)}`, `₹${fmtINR(totIn)}`, `₹${fmtINR(totNet)}`] });
        drawTable(doc, {
          headers: ['Month', 'Output GST (₹)', 'Input GST (₹)', 'Net Payable (₹)'],
          rows: mRows, colWidths: [130, 130, 130, 120], startY: y
        });
      }

      const fy = doc.page.height - 30;
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
         .text('SODA Corporate Dashboard  |  Confidential  |  For internal use only',
               M, fy, { width: doc.page.width - M * 2, align: 'center', lineBreak: false });
      doc.end();
      return;
    }

    // ── Excel ────────────────────────────────────────────────────────────────
    if (format === 'excel') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'SODA Corporate Dashboard';
      wb.created = new Date();

      if (aiNarrative) {
        const ai = wb.addWorksheet('AI Summary');
        xlSheetHeader(ai, 'AI Executive Narrative', reportTitle);
        const aiRow = ai.addRow([aiNarrative]);
        aiRow.getCell(1).alignment = { wrapText: true };
        aiRow.height = 120;
        ai.getColumn(1).width = 120;
      }

      if (reportType === 'pnl') {
        const sh = wb.addWorksheet('P&L');
        xlSheetHeader(sh, 'Profit & Loss Statement', `Period: ${periodLabel}`);
        sh.columns = [{ key: 'cat', width: 42 }, { key: 'amt', width: 26 }];
        const d = await fetchPnLData(companyId, sql, baseParams);

        sh.addRow(['REVENUE']).font = { bold: true, size: 12, color: { argb: 'FF1D4ED8' } };
        xlHeader(sh.addRow(['Category', 'Amount (₹)']), 2);
        d.revenue.forEach((r, i) => {
          const row = sh.addRow([r.cat, parseFloat(r.total)]);
          row.getCell(2).numFmt = XL_FMT;
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        xlTotal(sh.addRow(['Total Revenue', d.totalRev]), 2);
        sh.addRow([]);

        sh.addRow(['OPERATING EXPENSES']).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
        xlHeader(sh.addRow(['Category', 'Amount (₹)']), 2);
        d.expenses.forEach((r, i) => {
          const row = sh.addRow([r.cat, parseFloat(r.total)]);
          row.getCell(2).numFmt = XL_FMT;
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        xlTotal(sh.addRow(['Total Expenses', d.totalExp]), 2);
        sh.addRow([]);

        const netRow = sh.addRow(['NET PROFIT / (LOSS)', d.net]);
        netRow.font = { bold: true, size: 13 };
        netRow.getCell(2).numFmt = XL_FMT;
        netRow.getCell(2).font = { bold: true, size: 13, color: { argb: d.net >= 0 ? 'FF059669' : 'FFDC2626' } };
        netRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
        sh.addRow(['Net Profit Margin', d.totalRev > 0 ? `${((d.net/d.totalRev)*100).toFixed(1)}%` : '—'])
          .font = { size: 11, color: { argb: 'FF334155' } };

      } else if (reportType === 'balance-sheet') {
        const sh = wb.addWorksheet('Balance Sheet');
        xlSheetHeader(sh, 'Balance Sheet', `Period: ${periodLabel}`);
        sh.columns = [{ key: 'name', width: 42 }, { key: 'amt', width: 26 }];
        const d = await fetchBalanceSheetData(companyId, sql, baseParams);
        const totalAssets = d.cash + d.receivables + d.coaAssets.reduce((s,a)=>s+a.amount,0);
        const totalLiab   = d.payables + d.coaLiabilities.reduce((s,a)=>s+a.amount,0);
        const totalEq     = d.retainedEarnings + d.coaEquity.reduce((s,a)=>s+a.amount,0);

        [
          { title: 'ASSETS',      color: 'FF1E3A8A', rows: [['Cash & Bank Balances', d.cash], ['Accounts Receivable', d.receivables], ...d.coaAssets.map(a=>[a.name,a.amount])], total: ['TOTAL ASSETS', totalAssets] },
          { title: 'LIABILITIES', color: 'FFDC2626', rows: [['Accounts Payable', d.payables], ...d.coaLiabilities.map(a=>[a.name,a.amount])], total: ['TOTAL LIABILITIES', totalLiab] },
          { title: 'EQUITY',      color: 'FF059669', rows: [['Retained Earnings', d.retainedEarnings], ...d.coaEquity.map(a=>[a.name,a.amount])], total: ['TOTAL EQUITY', totalEq] }
        ].forEach(sec => {
          sh.addRow([sec.title]).font = { bold: true, size: 12, color: { argb: sec.color } };
          xlHeader(sh.addRow(['Name', 'Amount (₹)']), 2);
          sec.rows.forEach(r => { const row = sh.addRow(r); row.getCell(2).numFmt = XL_FMT; });
          xlTotal(sh.addRow(sec.total), 2);
          sh.addRow([]);
        });

      } else if (reportType === 'cash-flow') {
        const sh = wb.addWorksheet('Cash Flow');
        xlSheetHeader(sh, 'Cash Flow Statement', `Period: ${periodLabel}`);
        sh.columns = [{ key: 'm', width: 20 }, { key: 'in', width: 22 }, { key: 'out', width: 22 }, { key: 'net', width: 22 }, { key: 'run', width: 26 }];
        const rows = await fetchCashFlowData(companyId, sql, baseParams);
        xlHeader(sh.addRow(['Month', 'Inflow (₹)', 'Outflow (₹)', 'Net (₹)', 'Running Balance (₹)']), 5);
        rows.forEach((r, i) => {
          const row = sh.addRow([r.label, r.inflow, r.outflow, r.net, r.running]);
          [2,3,4,5].forEach(c => { row.getCell(c).numFmt = XL_FMT; });
          row.getCell(4).font = { color: { argb: r.net >= 0 ? 'FF059669' : 'FFDC2626' } };
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        xlTotal(sh.addRow(['TOTAL', rows.reduce((s,r)=>s+r.inflow,0), rows.reduce((s,r)=>s+r.outflow,0), rows.reduce((s,r)=>s+r.net,0), '']), 5);

      } else if (reportType === 'tax') {
        const sh = wb.addWorksheet('Tax Summary');
        xlSheetHeader(sh, 'Tax Summary', `Period: ${periodLabel}`);
        sh.columns = [{ key: 'comp', width: 42 }, { key: 'rate', width: 15 }, { key: 'amt', width: 26 }];
        const d = await fetchTaxData(companyId, sql, baseParams);
        xlHeader(sh.addRow(['Component', 'Rate', 'Amount (₹)']), 3);
        [['Net Profit (PBT)','',d.net],['Corporate Tax','25%',d.baseTax],['Surcharge','7%',d.surcharge],['H&E Cess','4%',d.cess]].forEach(r => {
          sh.addRow(r).getCell(3).numFmt = XL_FMT;
        });
        xlTotal(sh.addRow(['Total Income Tax','',d.totalTax]), 3);
        sh.addRow([]);
        xlHeader(sh.addRow(['GST Component','Rate','Amount (₹)']), 3);
        [['Output GST','18%',d.outputGST],['Input GST Credit','18%',d.inputGST],['Net GST Payable','',d.netGST]].forEach(r => {
          sh.addRow(r).getCell(3).numFmt = XL_FMT;
        });
        sh.addRow([]);
        const fr = sh.addRow(['TOTAL TAX LIABILITY', '', d.totalTax + d.netGST]);
        fr.font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
        fr.getCell(3).numFmt = XL_FMT;
        fr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

      } else if (reportType === 'gst') {
        const sh = wb.addWorksheet('GST Report');
        xlSheetHeader(sh, 'GST Report', `Period: ${periodLabel}`);
        sh.columns = [{ key: 'm', width: 20 }, { key: 'out', width: 26 }, { key: 'inp', width: 26 }, { key: 'net', width: 26 }];
        const months = await fetchGSTData(companyId, sql, baseParams);
        xlHeader(sh.addRow(['Month', 'Output GST (₹)', 'Input GST (₹)', 'Net Payable (₹)']), 4);
        months.forEach((m, i) => {
          const row = sh.addRow([m.label, m.output, m.input, m.net]);
          [2,3,4].forEach(c => { row.getCell(c).numFmt = XL_FMT; });
          row.getCell(4).font = { color: { argb: m.net > 0 ? 'FFDC2626' : 'FF059669' } };
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        xlTotal(sh.addRow(['TOTAL', months.reduce((s,m)=>s+m.output,0), months.reduce((s,m)=>s+m.input,0), months.reduce((s,m)=>s+m.net,0)]), 4);
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report.xlsx`);
      await wb.xlsx.write(res);
      res.end();
      return;
    }

    res.status(400).json({ error: 'Unsupported format. Use pdf or excel.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = { getPnL, getBalanceSheet, getCashFlow, getTax, getGST, exportReport };
