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

// Indian FY runs April 1 → March 31; returns two FYs ending in fy1EndYear (defaults to most recent completed)
const getFYRanges = (fyEndYear = null) => {
  if (!fyEndYear) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    fyEndYear = month >= 3 ? year : year - 1;
  }
  const fy1EndYear = fyEndYear;
  const toShortYear = (y) => String(y).slice(-2);
  return {
    fy1Start: `${fy1EndYear - 1}-04-01`,
    fy1End:   `${fy1EndYear}-03-31`,
    fy2Start: `${fy1EndYear - 2}-04-01`,
    fy2End:   `${fy1EndYear - 1}-03-31`,
    fy1Label: `FY ${fy1EndYear - 1}-${toShortYear(fy1EndYear)}`,
    fy2Label: `FY ${fy1EndYear - 2}-${toShortYear(fy1EndYear - 1)}`
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
       .text(h, x + 6, y + 8, { width: colWidths[i] - 12, lineBreak: false, align: i === 0 ? 'left' : (i === 1 ? 'center' : 'right') });
    x += colWidths[i];
  });
  y += rowH;

  rows.forEach((row, ri) => {
    if (row._sep) {
      if (y + 6 > doc.page.height - M - 20) { doc.addPage(); y = M; }
      doc.moveTo(startX, y).lineTo(startX + totalW, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      y += 6; return;
    }
    if (row._blank) { y += 10; return; }

    const isTotal   = !!row._total;
    const isHL      = !!row._hl;
    const isSection = !!row._section;
    const isSubhead = !!row._subhead;
    const rH = isSection ? rowH + 2 : rowH;

    if (y + rH > doc.page.height - M - 20) { doc.addPage(); y = M; }

    if (isSection)      doc.rect(startX, y, totalW, rH).fill('#dbeafe');
    else if (isTotal)   doc.rect(startX, y, totalW, rH).fill('#e8f0fe');
    else if (isHL)      doc.rect(startX, y, totalW, rH).fill('#dbeafe');
    else if (isSubhead) doc.rect(startX, y, totalW, rH).fill('#f8fafc');
    else if (ri % 2 === 1) doc.rect(startX, y, totalW, rH).fill(ALT);

    x = startX;
    (row.cells || []).forEach((cell, ci) => {
      const txt    = String(cell?.text ?? cell ?? '');
      const indent = (ci === 0 && cell?.indent != null) ? cell.indent : 6;
      const bold   = !!(cell?.bold || isTotal || isHL || isSection || isSubhead);
      const color  = (isSection || isHL) ? BLUE : (cell?.color || '#1a202c');
      const align  = ci === 0 ? 'left' : (ci === 1 ? 'center' : 'right');
      const fSize  = isSection ? 9.5 : (isTotal || isHL) ? 10 : 9;
      doc.fillColor(color)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(fSize)
         .text(txt, x + indent, y + 8, { width: colWidths[ci] - indent - 4, lineBreak: false, align });
      x += colWidths[ci];
    });
    y += rH;
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


// ─── Shared query helpers (used by GET handlers and export) ──────────────────

const queryPnL = async (companyId, fyEndYear = null) => {
  const { fy1Start, fy1End, fy2Start, fy2End, fy1Label, fy2Label } = getFYRanges(fyEndYear);
  const [coRes, revRes, allRevRes, allExpRes, expRes, accRes, allNetRes, recRes, payRes] = await Promise.all([
    pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId]),
    pool.query(`SELECT
      COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 THEN amount END), 0) as fy1,
      COALESCE(SUM(CASE WHEN date >= $4 AND date <= $5 THEN amount END), 0) as fy2
      FROM transactions WHERE company_id = $1 AND type = 'income'`,
      [companyId, fy1Start, fy1End, fy2Start, fy2End]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 AND type = 'income'`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = $1 AND type = 'expense'`, [companyId]),
    pool.query(`SELECT COALESCE(category, 'Other') as category,
      COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 THEN amount END), 0) as fy1,
      COALESCE(SUM(CASE WHEN date >= $4 AND date <= $5 THEN amount END), 0) as fy2
      FROM transactions WHERE company_id = $1 AND type = 'expense'
      GROUP BY COALESCE(category, 'Other')`,
      [companyId, fy1Start, fy1End, fy2Start, fy2End]),
    pool.query(`SELECT COALESCE(SUM(opening_balance), 0) as total FROM accounts WHERE company_id = $1`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as net FROM transactions WHERE company_id = $1`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE company_id = $1 AND type = 'receivable' AND status IN ('pending','overdue')`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE company_id = $1 AND type = 'payable' AND status IN ('pending','overdue')`, [companyId]),
  ]);
  const buckets = { cogs: [0,0], employee: [0,0], finance: [0,0], depreciation: [0,0], other: [0,0] };
  expRes.rows.forEach(r => {
    const cat = (r.category || '').toLowerCase();
    const v1 = parseFloat(r.fy1 || 0), v2 = parseFloat(r.fy2 || 0);
    let b;
    if (/salary|salaries|payroll|wages|stipend|employee/.test(cat))                b = 'employee';
    else if (/purchase|cogs|cost of goods|raw material|direct|inventory/.test(cat)) b = 'cogs';
    else if (/interest|bank charge|finance|loan/.test(cat))                         b = 'finance';
    else if (/depreciation|amortization/.test(cat))                                 b = 'depreciation';
    else                                                                             b = 'other';
    buckets[b][0] += v1; buckets[b][1] += v2;
  });
  const fy1Rev = parseFloat(revRes.rows[0]?.fy1||0);
  const fy2Rev = parseFloat(revRes.rows[0]?.fy2||0);
  const fy1ExpTotal = buckets.cogs[0] + buckets.employee[0] + buckets.finance[0] + buckets.depreciation[0] + buckets.other[0];
  const fy2ExpTotal = buckets.cogs[1] + buckets.employee[1] + buckets.finance[1] + buckets.depreciation[1] + buckets.other[1];
  const cashFY1 = parseFloat(accRes.rows[0]?.total||0) + parseFloat(allNetRes.rows[0]?.net||0);
  const receivables = parseFloat(recRes.rows[0]?.total||0);
  const payables = parseFloat(payRes.rows[0]?.total||0);
  const ratios = formulas.computeAllRatios({
    revenue: fy1Rev,
    expenses: fy1ExpTotal,
    cash: cashFY1,
    receivables,
    payables,
    cogsAmount: buckets.cogs[0],
    interestExpense: buckets.finance[0],
  });
  // FY2 ratios — income-statement metrics only (no historical balance sheet data available)
  const fy2Net = fy2Rev - fy2ExpTotal;
  const ratios2 = {
    grossProfit:       formulas.grossProfit(fy2Rev, buckets.cogs[1]),
    grossProfitMargin: formulas.grossProfitMargin(formulas.grossProfit(fy2Rev, buckets.cogs[1]), fy2Rev),
    ebit:              formulas.ebit(fy2Rev, fy2ExpTotal, buckets.finance[1], 0),
    netIncome:         fy2Net,
    netProfitMargin:   formulas.netProfitMargin(fy2Net, fy2Rev),
  };
  return {
    companyName: coRes.rows[0]?.name || '',
    fy1Label, fy2Label,
    revenue: { fromOperations: [fy1Rev, fy2Rev], otherIncome: [0, 0] },
    expenses: { cogs: buckets.cogs, employeeBenefits: buckets.employee, financeCosts: buckets.finance, depreciation: buckets.depreciation, other: buckets.other },
    income: parseFloat(allRevRes.rows[0]?.total||0),
    expense: parseFloat(allExpRes.rows[0]?.total||0),
    netProfit: parseFloat(allRevRes.rows[0]?.total||0) - parseFloat(allExpRes.rows[0]?.total||0),
    ratios,
    ratios2,
  };
};

const queryBalanceSheet = async (companyId, fyEndYear = null) => {
  const { fy1Start, fy1End, fy2Start, fy2End, fy1Label, fy2Label } = getFYRanges(fyEndYear);
  const [coRes, profitRes, accountsRes, allTimeNetRes, recRes, payRes, coaRes] = await Promise.all([
    pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId]),
    pool.query(`SELECT
      COALESCE(SUM(CASE WHEN type='income' AND date>=$2 AND date<=$3 THEN amount WHEN type='expense' AND date>=$2 AND date<=$3 THEN -amount END),0) as fy1_net,
      COALESCE(SUM(CASE WHEN type='income' AND date>=$4 AND date<=$5 THEN amount WHEN type='expense' AND date>=$4 AND date<=$5 THEN -amount END),0) as fy2_net
      FROM transactions WHERE company_id = $1`,
      [companyId, fy1Start, fy1End, fy2Start, fy2End]),
    pool.query(`SELECT COALESCE(SUM(opening_balance),0) as total FROM accounts WHERE company_id=$1`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) as net FROM transactions WHERE company_id=$1`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM invoices WHERE company_id=$1 AND type='receivable' AND status IN ('pending','overdue')`, [companyId]),
    pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM invoices WHERE company_id=$1 AND type='payable' AND status IN ('pending','overdue')`, [companyId]),
    pool.query(`SELECT account_type, name, opening_balance FROM chart_of_accounts WHERE company_id=$1`, [companyId]),
  ]);
  const fy1Net = parseFloat(profitRes.rows[0]?.fy1_net||0);
  const fy2Net = parseFloat(profitRes.rows[0]?.fy2_net||0);
  const openingBal = parseFloat(accountsRes.rows[0]?.total||0);
  const allTimeNet = parseFloat(allTimeNetRes.rows[0]?.net||0);
  const cashFY1 = openingBal + allTimeNet;
  const cashFY2 = cashFY1 - fy1Net;
  const tradeRec = parseFloat(recRes.rows[0]?.total||0);
  const tradePay = parseFloat(payRes.rows[0]?.total||0);
  const totalAssetsFY1 = cashFY1 + tradeRec;
  const totalAssetsFY2 = cashFY2;
  const partnersFY1 = totalAssetsFY1 - tradePay - fy1Net;
  const partnersFY2 = totalAssetsFY2 - fy2Net;
  return {
    companyName: coRes.rows[0]?.name || '',
    fy1Label, fy2Label,
    equity: { partnersContribution: [Math.max(0,partnersFY1), Math.max(0,partnersFY2)], partnersCurrentAccount: [0,0], reservesAndSurplus: [fy1Net, fy2Net] },
    nonCurrentLiabilities: { longTermBorrowings: [0,0], deferredTaxLiabilities: [0,0], otherLongTermLiabilities: [0,0], longTermProvisions: [0,0] },
    currentLiabilities: { shortTermBorrowings: [0,0], tradePayables: [tradePay, 0], otherCurrentLiabilities: [0,0], shortTermProvisions: [0,0] },
    nonCurrentAssets: { ppe: [0,0], intangibleAssets: [0,0], capitalWIP: [0,0], intangibleUnderDev: [0,0], nonCurrentInvestments: [0,0], deferredTaxAssets: [0,0], longTermLoans: [0,0], otherNonCurrent: [0,0] },
    currentAssets: { currentInvestments: [0,0], inventories: [0,0], tradeReceivables: [tradeRec, 0], cashAndBank: [cashFY1, cashFY2], shortTermLoans: [0,0], otherCurrent: [0,0] },
  };
};

// ─── API endpoints ────────────────────────────────────────────────────────────

// Returns statutory two-FY format consumed by the P&L viewer
const getPnL = async (req, res) => {
  try {
    const fyEndYear = req.query.fy ? parseInt(req.query.fy, 10) : null;
    res.json(await queryPnL(getCompanyId(req), fyEndYear));
  }
  catch (e) { res.status(500).json({ error: e.message }); }
};

// Returns statutory two-FY format consumed by the Balance Sheet viewer
const getBalanceSheet = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const fyEndYear = req.query.fy ? parseInt(req.query.fy, 10) : null;
    const { fy1Start, fy1End, fy2Start, fy2End, fy1Label, fy2Label } = getFYRanges(fyEndYear);

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

    const [revQ, expQ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 THEN amount END), 0) as total FROM transactions WHERE company_id = $1 AND type = 'income'`, [companyId, fy1Start, fy1End]),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 THEN amount END), 0) as total FROM transactions WHERE company_id = $1 AND type = 'expense'`, [companyId, fy1Start, fy1End]),
    ]);
    const fy1Rev = parseFloat(revQ.rows[0]?.total||0);
    const fy1Exp = parseFloat(expQ.rows[0]?.total||0);
    const ratios = formulas.computeAllRatios({
      revenue: fy1Rev,
      expenses: fy1Exp,
      cash: cashFY1,
      receivables: tradeRec,
      payables: tradePay,
      cogsAmount: fy1Exp * 0.6,
      interestExpense: fy1Exp * 0.05,
    });

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
      equity_legacy: [],
      ratios,
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
    const totals = {
      inflow:  months.reduce((s, m) => s + m.inflow, 0),
      outflow: months.reduce((s, m) => s + m.outflow, 0),
      net:     months.reduce((s, m) => s + m.net, 0)
    };
    const totalNet = totals.net;
    const depAmt = 0; // no depreciation data in cash flow
    const ocf = formulas.operatingCashFlow(totalNet, depAmt);
    const fcf = formulas.freeCashFlow(ocf, 0);
    res.json({
      companyName: companyRes.rows[0]?.name || '',
      period: { from: from || null, to: to || null },
      months,
      totals,
      ratios: {
        operatingCashFlow: ocf,
        freeCashFlow: fcf,
        avgMonthlyCashFlow: months.length > 0 ? totalNet / months.length : 0,
        positiveCashMonths: months.filter(m => m.net >= 0).length,
        totalMonths: months.length,
      },
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
    const effTaxRate = d.net > 0 ? formulas.pct((d.totalTax + d.netGST) / d.net * 100) : 0;
    const itcUtil = d.outputGST > 0 ? formulas.pct(d.inputGST / d.outputGST * 100) : 0;
    const npm = d.income > 0 ? formulas.pct(d.net / d.income * 100) : 0;
    res.json({
      companyName: companyRes.rows[0]?.name || '',
      period: { from: from || null, to: to || null },
      totalRevenue: d.income, totalExpenses: d.expense, netProfit: d.net,
      incomeTax: { baseTax: d.baseTax, rate: '25%', surcharge: d.surcharge, surchargeRate: '7%', cess: d.cess, cessRate: '4%', total: d.totalTax },
      gst: { outputGST: d.outputGST, inputGSTCredit: d.inputGST, netPayable: d.netGST },
      totalTaxLiability: d.totalTax + d.netGST,
      ratios: {
        effectiveTaxRate: effTaxRate,
        itcUtilizationRate: itcUtil,
        netProfitMargin: npm,
        taxBurdenRatio: effTaxRate,
      },
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
    const itcUtil = totOut > 0 ? formulas.pct(totIn / totOut * 100) : 0;
    const netPay = Math.max(0, totOut - totIn);
    res.json({
      period: { from: from || null, to: to || null },
      gstRate: '18%',
      summary: {
        outputGST: totOut, cgstOut: totOut / 2, sgstOut: totOut / 2,
        inputGST:  totIn,  cgstIn:  totIn / 2,  sgstIn:  totIn / 2,
        netPayable:    netPay,
        netRefundable: Math.max(0, totIn - totOut)
      },
      months,
      ratios: {
        itcUtilizationRate: itcUtil,
        netGSTRate: itcUtil,
        avgMonthlyOutput: months.length > 0 ? totOut / months.length : 0,
        avgMonthlyInput: months.length > 0 ? totIn / months.length : 0,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ─── Analysis helpers ─────────────────────────────────────────────────────────

const fmtAI = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct   = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—');

const buildMetricsForAI = (reportType, d) => {
  switch (reportType) {
    case 'pnl': {
      const margin = d.totalRev > 0 ? ((d.net / d.totalRev) * 100).toFixed(1) : '0.0';
      const yoy    = d.totalRev > 0 && d.revenue?.fromOperations?.[1] > 0
        ? (((d.totalRev - d.revenue.fromOperations[1]) / d.revenue.fromOperations[1]) * 100).toFixed(1)
        : null;
      return {
        report_type: 'Profit & Loss',
        total_revenue: fmtAI(d.totalRev),
        total_expenses: fmtAI(d.totalExp),
        net_profit: fmtAI(d.net),
        net_profit_margin: `${margin}%`,
        expense_ratio: pct(d.totalExp, d.totalRev),
        yoy_revenue_change: yoy ? `${yoy > 0 ? '+' : ''}${yoy}%` : 'N/A',
      };
    }
    case 'balance-sheet': {
      const totalAssets = d.cash + d.receivables + d.coaAssets.reduce((s, a) => s + a.amount, 0);
      const totalLiab   = d.payables + d.coaLiabilities.reduce((s, a) => s + a.amount, 0);
      return {
        report_type: 'Balance Sheet',
        total_assets: fmtAI(totalAssets),
        cash_and_bank: fmtAI(d.cash),
        trade_receivables: fmtAI(d.receivables),
        trade_payables: fmtAI(d.payables),
        working_capital: fmtAI(totalAssets - totalLiab),
        current_ratio: totalLiab > 0 ? (totalAssets / totalLiab).toFixed(2) : '∞',
        retained_earnings: fmtAI(d.retainedEarnings),
      };
    }
    case 'cash-flow': {
      const rows    = Array.isArray(d) ? d : (d.months || []);
      const inflow  = rows.reduce((s, r) => s + r.inflow, 0);
      const outflow = rows.reduce((s, r) => s + r.outflow, 0);
      const net     = inflow - outflow;
      const best    = rows.reduce((b, r) => r.net > (b?.net ?? -Infinity) ? r : b, null);
      const worst   = rows.reduce((w, r) => r.net < (w?.net ??  Infinity) ? r : w, null);
      return {
        report_type: 'Cash Flow Statement',
        total_inflow: fmtAI(inflow),
        total_outflow: fmtAI(outflow),
        net_cash_flow: fmtAI(net),
        avg_monthly_net: fmtAI(rows.length ? net / rows.length : 0),
        best_month: best ? `${best.label} (${fmtAI(best.net)})` : 'N/A',
        worst_month: worst ? `${worst.label} (${fmtAI(worst.net)})` : 'N/A',
      };
    }
    case 'tax': {
      const totalTaxLiab = d.totalTax + d.netGST;
      const effRate      = d.net > 0 ? ((totalTaxLiab / d.net) * 100).toFixed(1) : '0.0';
      return {
        report_type: 'Tax Summary',
        net_profit_pbt: fmtAI(d.net),
        corporate_tax: fmtAI(d.baseTax),
        surcharge: fmtAI(d.surcharge),
        cess: fmtAI(d.cess),
        total_income_tax: fmtAI(d.totalTax),
        output_gst: fmtAI(d.outputGST),
        input_gst_credit: fmtAI(d.inputGST),
        net_gst_payable: fmtAI(d.netGST),
        total_tax_liability: fmtAI(totalTaxLiab),
        effective_tax_rate: `${effRate}%`,
      };
    }
    case 'gst': {
      const rows   = Array.isArray(d) ? d : (d.months || []);
      const totOut = rows.reduce((s, r) => s + r.output, 0);
      const totIn  = rows.reduce((s, r) => s + r.input, 0);
      const net    = Math.max(0, totOut - totIn);
      return {
        report_type: 'GST Report',
        total_output_gst: fmtAI(totOut),
        total_input_credit: fmtAI(totIn),
        net_gst_payable: fmtAI(net),
        itc_utilization_rate: pct(totIn, totOut),
        avg_monthly_output: fmtAI(rows.length ? totOut / rows.length : 0),
      };
    }
    default: return {};
  }
};

const buildFallbackNarrative = (type, metrics) => {
  const m = metrics || {};

  if (type === 'pnl') {
    const yoy = m.yoy_revenue_change && m.yoy_revenue_change !== 'N/A'
      ? 'On a year-on-year basis, revenue has moved by ' + m.yoy_revenue_change + ', which ' +
        (m.yoy_revenue_change.startsWith('+') ? 'reflects positive business momentum and strengthening demand.' :
         'calls for a careful review of the factors behind the revenue softness — whether market-driven, pricing-related, or a result of customer churn.')
      : 'This is the first period on record, providing a baseline for future comparison.';
    const costComment = parseFloat(m.expense_ratio) > 85
      ? 'At over 85%, this ratio leaves very limited room for profitability and suggests that cost rationalisation should be a management priority — even a 5-10% reduction in discretionary expenditure could produce a material improvement in the bottom line.'
      : parseFloat(m.expense_ratio) > 70
        ? 'A ratio in this range is not uncommon for growth-stage businesses, but continued focus on cost efficiency will be important to prevent margin erosion as the business scales.'
        : 'This reflects a reasonably well-managed cost structure relative to the revenue base, which is a positive indicator of operational discipline.';
    const marginComment = parseFloat(m.net_profit_margin) > 20
      ? 'Margins above 20% are strong by most industry measures, indicating the business is generating meaningful value above its cost base. Sustaining this performance will require continued discipline on costs while maintaining revenue growth.'
      : parseFloat(m.net_profit_margin) > 10
        ? 'A double-digit margin is a solid foundation, but there is clear scope to push profitability further. Small improvements in revenue mix, vendor pricing, or process efficiency can cumulatively have a significant impact on the margin trajectory.'
        : parseFloat(m.net_profit_margin) > 0
          ? 'A single-digit margin indicates that the business is profitable but operating with a narrow buffer. Any unforeseen cost escalation or revenue shortfall could quickly push results into loss territory, making proactive margin management a priority.'
          : 'A negative net profit margin signals that the business is consuming more than it is generating. Immediate attention is required to identify the root causes and chart a credible path back to profitability.';
    return [
      m.total_revenue + ' was the total revenue recorded for the reporting period, set against total operating expenses of ' + m.total_expenses + ', yielding a net profit of ' + m.net_profit + '. ' + yoy + ' The topline performance sets the context within which all cost and profitability decisions need to be evaluated.',
      'On the cost side, the expense ratio stands at ' + m.expense_ratio + ', indicating how much of every rupee earned is absorbed by operating costs. ' + costComment + ' Management should review each expense head for contracts due for renewal, productivity improvements, and any costs that have grown disproportionately relative to revenue.',
      'The reported net profit margin of ' + m.net_profit_margin + ' is a key indicator of the business\'s financial health. ' + marginComment,
      'Looking ahead, the priority should be to build on the revenue base while maintaining rigorous oversight of the cost structure. Regular P&L reviews at a monthly frequency — not just at year-end — will give management the visibility needed to course-correct in a timely manner. The business should also consider whether its revenue diversification is adequate, as concentration in a small number of customers or categories can make performance volatile and difficult to forecast accurately.',
    ].join('\n\n');
  }

  if (type === 'balance-sheet') {
    const wcComment = m.working_capital && m.working_capital.includes('-')
      ? 'A negative working capital position is a warning sign — current obligations exceed the liquid resources available to meet them. Steps to reduce the receivable collection period or negotiate extended payment terms with vendors would be advisable.'
      : 'A positive working capital position means the business has more short-term assets than short-term obligations, giving it the operational flexibility to manage day-to-day cash demands without resorting to emergency borrowing.';
    const crVal = parseFloat(m.current_ratio || 0);
    const crComment = crVal >= 2
      ? 'indicates a very comfortable liquidity cushion. While generally positive, an excessively high ratio may also suggest that cash is sitting idle — management may want to consider short-term investment options for surplus liquidity.'
      : crVal >= 1.5
        ? 'reflects a healthy short-term liquidity position, well within the benchmark range of 1.5 to 2.0. The business can comfortably meet near-term obligations with room to spare.'
        : crVal >= 1
          ? 'is above the minimum threshold but offers limited buffer. Any unexpected payment demand or slowdown in receivable collections could quickly create a liquidity squeeze, warranting close monitoring.'
          : 'falls below 1.0, meaning that current liabilities exceed current assets — a serious liquidity concern. Management should prioritise accelerating receivable collections and consider arranging a credit facility as a contingency.';
    return [
      'The balance sheet as at the reporting date presents a snapshot of the company\'s financial position. Total assets stand at ' + m.total_assets + ', comprising primarily cash and bank balances of ' + m.cash_and_bank + ' and trade receivables of ' + m.trade_receivables + '. These two items together reflect the company\'s most liquid and near-liquid resources — the currency of day-to-day operations.',
      'On the liabilities side, trade payables amount to ' + m.trade_payables + ', representing obligations to vendors and suppliers typically due within a short window. Working capital — the difference between current assets and current liabilities — works out to ' + m.working_capital + '. ' + wcComment,
      'The current ratio of ' + m.current_ratio + ' ' + crComment + ' Retained earnings of ' + m.retained_earnings + ' represent equity accumulated from profitable operations and form the backbone of the company\'s net worth — a strong base here reduces reliance on external funding and provides a cushion against future losses.',
      'Monitoring the age profile of trade receivables of ' + m.trade_receivables + ' and maintaining a disciplined collections process is essential to converting this balance sheet asset into actual cash in a timely manner. Any receivables outstanding beyond 90 days should be reviewed individually and escalated where necessary. A growing retained earnings base, sustained by profitable operations, is the most reliable indicator of long-term financial health.',
    ].join('\n\n');
  }

  if (type === 'cash-flow') {
    const netPositive = m.net_cash_flow && !m.net_cash_flow.includes('-');
    const netComment = netPositive
      ? 'The overall positive net cash position confirms that the business is generating surplus liquidity from its operations. This surplus, if sustained, provides the foundation for debt repayment, investment in growth, or building a strategic cash reserve.'
      : 'The overall negative net cash position deserves careful attention. While there are legitimate reasons for cash consumption — inventory build-up, capital expenditure, or front-loading of vendor payments — a persistent negative trend can erode liquidity reserves and may require external funding to bridge the gap.';
    return [
      'The cash flow statement for the reporting period records total inflows of ' + m.total_inflow + ' from all operational activities, against total outflows of ' + m.total_outflow + ', resulting in a net cash movement of ' + m.net_cash_flow + '. Unlike the income statement — which records revenue and expenses on an accrual basis — the cash flow statement reflects what actually entered and left the bank accounts, making it one of the most reliable indicators of business health.',
      'On a monthly basis, average net cash flow stands at ' + m.avg_monthly_net + '. The strongest month was ' + m.best_month + ' while ' + m.worst_month + ' represented the most significant period of cash pressure. The gap between the best and worst months often reflects seasonal patterns in revenue collection, concentrated vendor payment cycles, or the timing of large one-off transactions — all of which can be managed with better planning.',
      netComment + ' Understanding the difference between cash generated from core operations versus one-time or financing activities is crucial to forming an accurate view of the underlying business health.',
      'From a liquidity management standpoint, the business would benefit from maintaining a cash buffer equivalent to two to three months of operating outflows. Building this buffer through improved receivable collections, structured payment scheduling, and proactive credit facility management will ensure the business remains operationally resilient even in periods of cash stress. A rolling 90-day cash flow forecast, updated weekly, is a widely adopted best practice for businesses at this stage.',
    ].join('\n\n');
  }

  if (type === 'tax') {
    const effRateVal = parseFloat(m.effective_tax_rate || 0);
    const effComment = effRateVal > 35
      ? 'An effective rate exceeding 35% suggests the business may not be fully utilising all available deductions and exemptions. A detailed review of allowable business expenditure and applicable section-specific benefits should be conducted before the return is filed.'
      : 'This is broadly in line with the standard statutory rate inclusive of surcharge and cess, indicating the tax computation is following normal provisions.';
    const itcVal = parseFloat(m.itc_utilization || 0);
    const itcComment = itcVal >= 80
      ? 'Strong credit claim efficiency — most eligible credits are being successfully applied against the output liability, reducing the net cash outflow on GST.'
      : itcVal >= 60
        ? 'A reasonable portion of available credits is being utilised, but there remains scope to improve the claim rate through more rigorous GSTR-2A/2B reconciliation on a monthly basis.'
        : 'A relatively low utilisation of available input credits represents a direct and avoidable cost to the business. An urgent reconciliation exercise should be undertaken to identify and recover the gap before the annual window closes.';
    return [
      'The tax summary for this reporting period is computed on the basis of a net profit before tax of ' + m.net_profit_pbt + '. Applying the corporate tax rate of 25% with the mandatory surcharge of 7% and Health and Education Cess of 4%, the computed income tax liability amounts to ' + m.income_tax + '. In parallel, GST obligations — after netting output tax against eligible input tax credit — give rise to a net GST payable of ' + m.net_gst_payable + '. The combined total tax outflow for the period stands at ' + m.total_tax_liability + '.',
      'The effective tax rate for the period is ' + m.effective_tax_rate + '. ' + effComment + ' The input GST credit of ' + m.input_gst_credit + ' reflects tax already paid on qualifying business purchases — ensuring this is fully and accurately claimed each month is a basic but critical compliance step that directly reduces the net GST cash outflow.',
      'GST compliance involves both the financial obligation and the procedural discipline of timely and accurate filing. The net GST payable of ' + m.net_gst_payable + ' should be settled before the due date to avoid the statutory interest charge of 18% per annum on late payments. ITC utilisation comment: ' + itcComment,
      'From a tax planning standpoint, the business should evaluate investment decisions or expense timing adjustments that could legitimately reduce the taxable base — for example, accelerated depreciation on qualifying assets or advance payment of deductible expenses before year-end. All planning steps should be taken within applicable law and in consultation with a qualified Chartered Accountant to ensure both compliance and efficiency.',
    ].join('\n\n');
  }

  if (type === 'gst') {
    const itcUtilVal = parseFloat(m.itc_utilization_rate || 0);
    const itcComment = itcUtilVal >= 85
      ? 'A utilisation rate above 85% indicates that the business is doing an excellent job of tracking and claiming eligible input credits — a mark of well-organised purchase documentation and reconciliation processes.'
      : itcUtilVal >= 65
        ? 'While a majority of available credits are being utilised, the gap suggests that some eligible ITC may not be reaching GSTR-3B on time, either because suppliers have not uploaded invoices or because of reconciliation mismatches. A monthly reconciliation exercise should be institutionalised to close this gap.'
        : 'A utilisation rate below 65% indicates a material volume of unclaimed input credits — a direct and unnecessary cost to the business. An immediate and thorough GSTR-2A/2B reconciliation against the purchase register is required.';
    return [
      'The GST report for the period covers all taxable supplies made and eligible purchases on which input tax credit has been availed. Total output GST collected on sales amounts to ' + m.total_output_gst + ', while input tax credit of ' + m.total_input_credit + ' has been availed on qualifying purchases. After netting the two, the net GST payable for the period stands at ' + m.net_gst_payable + '. The average monthly output GST liability is ' + m.avg_monthly_output_gst + ', providing a useful benchmark for monthly cash flow planning.',
      'The ITC utilisation rate of ' + m.itc_utilization_rate + ' provides a measure of how efficiently available input credits are being applied. ' + itcComment,
      'GSTR-3B filings are due by the 20th of each month for the previous month\'s transactions. Late filing attracts a late fee of Rs. 50 per day along with 18% per annum interest on the outstanding tax amount. Implementing a structured pre-filing checklist — covering sales invoice verification, purchase reconciliation, and credit note accounting — will significantly reduce the risk of errors or omissions and prevent costly compliance lapses.',
      'The business should periodically review whether any supplies qualify for a lower GST rate or exemption not currently being applied. Under certain conditions, a refund claim may also be available if input credits consistently exceed output tax — particularly relevant for businesses with significant zero-rated or export sales. Any such refund opportunity should be evaluated and acted upon promptly, as unclaimed refunds represent working capital unnecessarily tied up with the tax department.',
    ].join('\n\n');
  }

  return 'A detailed analysis is not available for this report type.';
};

const getFallbackSuggestions = (type, metrics) => {
  const m = metrics || {};
  switch (type) {
    case 'pnl':
      return [
        { title: 'Reduce Largest Expense', detail: `Review your highest expense category for a 10-15% reduction target to directly improve net margins beyond the current ${m.net_profit_margin || 'level'}.` },
        { title: 'Improve Net Margin', detail: `Current margin of ${m.net_profit_margin || '—'} can be improved by tightening variable costs and renegotiating vendor contracts on high-volume items.` },
        { title: 'Diversify Revenue Streams', detail: 'Reduce revenue concentration risk by targeting at least two new client segments or product lines in the next quarter.' },
        { title: 'Review Finance Costs', detail: 'Evaluate refinancing options for existing credit lines to reduce interest expense and improve EBITDA without affecting operations.' },
        { title: 'Accelerate Revenue Collection', detail: 'Shorten the accounts receivable cycle to 30 days with automated invoicing and early payment incentives to improve working capital turnover.' },
      ];
    case 'balance-sheet':
      return [
        { title: 'Strengthen Working Capital', detail: `Working capital of ${m.working_capital || '—'} should cover at least 3 months of operating expenses. Reduce payables cycle to free up liquidity.` },
        { title: 'Collect Receivables Faster', detail: `Trade receivables of ${m.trade_receivables || '—'} represent capital tied up outside the business. Implement 30-day payment terms with automated follow-ups.` },
        { title: 'Optimize Cash Reserves', detail: `Cash balance of ${m.cash_and_bank || '—'} should be partially deployed into short-term liquid instruments to earn risk-free returns while maintaining liquidity.` },
        { title: 'Clear Trade Payables', detail: `Outstanding payables of ${m.trade_payables || '—'} should be scheduled for timely clearance to protect vendor relationships and avoid penalty charges.` },
        { title: 'Improve Current Ratio', detail: `A current ratio of ${m.current_ratio || '—'} indicates short-term solvency. Target a ratio above 1.5 by converting long-term assets or reducing short-term borrowings.` },
      ];
    case 'cash-flow':
      return [
        { title: 'Smooth Monthly Cash Inflows', detail: `Total inflow of ${m.total_inflow || '—'} should be distributed evenly. Negotiate milestone-based billing with key clients to reduce volatility.` },
        { title: 'Reduce Outflow Concentration', detail: 'Stagger vendor payments across the month rather than concentrating them in a single week to avoid temporary cash crunches.' },
        { title: 'Build a Cash Buffer', detail: 'Maintain a minimum reserve of 2-3 months of operating expenses in a liquid account to handle unexpected outflows or delayed collections.' },
        { title: 'Address Worst Month Pattern', detail: `The worst performing month (${m.worst_month || '—'}) signals a recurring dip. Plan for it with pre-approved credit lines or prepaid vendor discounts.` },
        { title: 'Improve Net Cash Position', detail: `Net cash flow of ${m.net_cash_flow || '—'} can be improved by targeting a 10% increase in collections and a 5% deferral of discretionary expenditures.` },
      ];
    case 'tax':
      return [
        { title: 'Maximize Business Deductions', detail: `With taxable income of ${m.net_profit_pbt || '—'}, ensure all eligible deductions under Sec 37 are fully claimed to reduce the tax base before year-end.` },
        { title: 'Claim ITC Promptly', detail: `Input GST credit of ${m.input_gst_credit || '—'} must be reconciled with GSTR-2A/2B monthly to ensure accurate and timely ITC utilization.` },
        { title: 'Lower Effective Tax Rate', detail: `Your effective rate of ${m.effective_tax_rate || '—'} can be reduced by investing in depreciation-eligible assets or R&D expenses qualifying under Sec 35.` },
        { title: 'Optimize GST Classification', detail: 'Review product/service HSN codes and GST rates to ensure correct classification and avoid mismatched ITC claims or excess output tax payments.' },
        { title: 'Plan Advance Tax Payments', detail: 'Structure quarterly advance tax payments to avoid interest under Sec 234B/C and free up working capital during low-revenue quarters.' },
      ];
    case 'gst':
      return [
        { title: 'Maximize ITC Utilization', detail: `ITC utilization of ${m.itc_utilization_rate || '—'} can be improved by ensuring all purchase invoices are uploaded by suppliers before the GSTR-2A reconciliation deadline.` },
        { title: 'Reconcile GSTR-2A Monthly', detail: 'Reconcile input credit in GSTR-2A against your purchase register every month. Unreconciled credits cannot be claimed after the financial year ends.' },
        { title: 'Audit Output GST Rates', detail: `Output GST of ${m.total_output_gst || '—'} should be audited quarterly to verify correct rates are applied, especially for goods with multiple applicable slabs.` },
        { title: 'File Returns Before Deadline', detail: 'Late filing of GSTR-3B incurs Rs. 50/day interest plus 18% p.a. on unpaid tax. Set automated reminders 10 days before the 20th of each month.' },
        { title: 'Evaluate GST Refund Claims', detail: `If input credit consistently exceeds output tax, file for a GST refund under Rule 89 to recover cash and improve working capital.` },
      ];
    default:
      return Array(5).fill({ title: 'Consult Your CA', detail: 'Review the report metrics with a Chartered Accountant for personalized optimization recommendations.' });
  }
};

const getReportSuggestions = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { type, metrics } = req.body;
    if (!type || !metrics) return res.status(400).json({ error: 'type and metrics required' });

    const reportLabels = {
      pnl:             'Profit & Loss Statement',
      'balance-sheet': 'Balance Sheet',
      'cash-flow':     'Cash Flow Statement',
      tax:             'Tax Summary',
      gst:             'GST Report',
    };
    const reportLabel = reportLabels[type] || type;

    let suggestions = getFallbackSuggestions(type, metrics);

    const systemPrompt = `You are a senior Chartered Accountant. Based ONLY on the provided ${reportLabel} metrics, generate exactly 5 specific, actionable suggestions.
Output ONLY valid JSON with this structure (no markdown, no extra text):
{"suggestions":[{"title":"Short title (max 6 words)","detail":"1-2 sentences referencing the exact figures."},{"title":"...","detail":"..."},{"title":"...","detail":"..."},{"title":"...","detail":"..."},{"title":"...","detail":"..."}]}`;

    const prompt = `${reportLabel} Metrics:\n${JSON.stringify(metrics, null, 2)}`;

    try {
      const raw    = await generateResponse(prompt, systemPrompt, true);
      const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 3) {
        suggestions = parsed.suggestions.slice(0, 5);
        const fallback = getFallbackSuggestions(type, metrics);
        while (suggestions.length < 5) suggestions.push(fallback[suggestions.length]);
      }
    } catch (_) { /* Ollama unavailable — use rule-based fallback */ }

    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────

const exportReport = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { type = 'pnl', format = 'pdf', from, to, fy } = req.query;
    const reportType  = type.toLowerCase();
    const fyEndYear   = fy ? parseInt(fy, 10) : null;
    const { sql, params } = buildDateFilter(from, to);
    const baseParams  = [companyId, ...params];
    const fyRanges    = getFYRanges(fyEndYear);
    const periodLabel = (reportType === 'pnl' || reportType === 'balance-sheet')
      ? `${fyRanges.fy1Label} vs ${fyRanges.fy2Label}`
      : from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Up to ${to}` : 'All Time';

    const TITLE_MAP = {
      pnl:             'Profit & Loss Statement',
      'balance-sheet': 'Balance Sheet',
      'cash-flow':     'Cash Flow Statement',
      tax:             'Tax Summary',
      gst:             'GST Report'
    };
    const reportTitle = TITLE_MAP[reportType] || reportType.toUpperCase();

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: M, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report.pdf`);
      doc.pipe(res);

      let y = pdfPageHeader(doc, reportTitle, `Period: ${periodLabel}`);

      if (reportType === 'pnl') {
        const d = await queryPnL(companyId, fyEndYear);
        const rev = d.revenue || {};
        const exp = d.expenses || {};
        const revFY1 = (rev.fromOperations?.[0] || 0) + (rev.otherIncome?.[0] || 0);
        const revFY2 = (rev.fromOperations?.[1] || 0) + (rev.otherIncome?.[1] || 0);
        const totalExpFY1 = Object.values(exp).reduce((s, a) => s + (a[0] || 0), 0);
        const totalExpFY2 = Object.values(exp).reduce((s, a) => s + (a[1] || 0), 0);
        const profitFY1 = revFY1 - totalExpFY1;
        const profitFY2 = revFY2 - totalExpFY2;
        const f = (n) => n == null ? '-' : `Rs.${fmtINR(n)}`;
        const COLW_PNL = [270, 45, 90, 90];
        drawTable(doc, {
          headers: ['Particulars', 'Note', d.fy1Label, d.fy2Label],
          colWidths: COLW_PNL, startY: y,
          rows: [
            { cells: [{ text: 'I.   Revenue from operations', indent: 10 }, '19', f(rev.fromOperations?.[0]), f(rev.fromOperations?.[1])] },
            { cells: [{ text: 'II.  Other Income', indent: 10 }, '20', f(rev.otherIncome?.[0]), f(rev.otherIncome?.[1])] },
            { _total: true, cells: ['III. Total Revenue (I+II)', '', f(revFY1), f(revFY2)] },
            { _blank: true },
            { _section: true, cells: ['IV.  Expenses:', '', '', ''] },
            { cells: ['(a) Cost of goods sold', '21', f(exp.cogs?.[0]), f(exp.cogs?.[1])] },
            { cells: ['(b) Employee benefits expense', '22', f(exp.employeeBenefits?.[0]), f(exp.employeeBenefits?.[1])] },
            { cells: ['(c) Finance costs', '23', f(exp.financeCosts?.[0]), f(exp.financeCosts?.[1])] },
            { cells: ['(d) Depreciation and amortization expense', '24', f(exp.depreciation?.[0]), f(exp.depreciation?.[1])] },
            { cells: ['(e) Other expenses', '25', f(exp.other?.[0]), f(exp.other?.[1])] },
            { _total: true, cells: ['Total Expenses', '', f(totalExpFY1), f(totalExpFY2)] },
            { _blank: true },
            { cells: [{ text: 'V.   Profit before exceptional items, partners\' remuneration and tax (III-IV)', bold: true, indent: 10 }, '', f(profitFY1), f(profitFY2)] },
            { _blank: true },
            { cells: [{ text: 'VI.  Exceptional items', indent: 10 }, '', '-', '-'] },
            { _blank: true },
            { cells: [{ text: 'VII. Profit before extraordinary items and tax (V-VI)', bold: true, indent: 10 }, '', f(profitFY1), f(profitFY2)] },
            { _blank: true },
            { cells: [{ text: 'VIII. Extraordinary items', indent: 10 }, '', '-', '-'] },
            { _blank: true },
            { cells: [{ text: 'IX.  Partners\' Remuneration', indent: 10 }, '30', '-', '-'] },
            { _blank: true },
            { cells: [{ text: 'X.   Profit before Partners\' Remuneration and tax (VII-VIII-IX)', bold: true, indent: 10 }, '', f(profitFY1), f(profitFY2)] },
            { _subhead: true, cells: ['     Tax expense:', '', '', ''] },
            { cells: ['(a) Current tax', '', '-', '-'] },
            { cells: ['(b) Deferred tax charge/(benefit)', '', '-', '-'] },
            { _blank: true },
            { cells: [{ text: 'XIII. Profit/(loss) for the period from continuing operations', bold: true, indent: 10 }, '', f(profitFY1), f(profitFY2)] },
            { _blank: true },
            { _total: true, cells: ['XVII. Profit/(loss) for the year', '', f(profitFY1), f(profitFY2)] },
          ]
        });

        // Draw ratios section for P&L PDF
        const pnlRatios = formulas.computeAllRatios({
          revenue: revFY1,
          expenses: totalExpFY1,
          cash: 0,
          receivables: 0,
          payables: 0,
          cogsAmount: exp.cogs?.[0] || 0,
          interestExpense: exp.financeCosts?.[0] || 0,
        });
        y = doc.y + 14;
        y = pdfSectionTitle(doc, 'Key Accounting Ratios & Metrics', y + 10);
        y = drawTable(doc, {
          headers: ['Metric', 'Formula / Description', 'Value'],
          colWidths: [185, 210, 100],
          startY: y,
          rows: [
            { cells: ['Gross Profit', 'Revenue − COGS', `Rs.${fmtINR(pnlRatios.grossProfit)}`] },
            { cells: ['Gross Profit Margin', 'Gross Profit / Revenue × 100', `${pnlRatios.grossProfitMargin}%`] },
            { cells: ['EBIT (Operating Profit)', 'Revenue − Operating Expenses (excl. interest & tax)', `Rs.${fmtINR(pnlRatios.ebit)}`] },
            { cells: ['Net Profit Margin', 'Net Income / Revenue × 100', `${pnlRatios.netProfitMargin}%`] },
            { _sep: true },
            { cells: ['Working Capital', 'Current Assets − Current Liabilities', `Rs.${fmtINR(pnlRatios.workingCapital)}`] },
            { cells: ['Current Ratio', 'Current Assets / Current Liabilities', pnlRatios.currentRatio.toString()] },
            { cells: ['AR Turnover', 'Net Sales / Average Accounts Receivable', `${pnlRatios.arTurnover}×`] },
            { cells: ['Days Sales Outstanding', '365 / AR Turnover', `${pnlRatios.daysSalesOutstanding} days`] },
            { _sep: true },
            { cells: ['ROA', 'Net Income / Total Assets × 100', `${pnlRatios.roa}%`] },
            { cells: ['ROE', 'Net Income / Shareholder\'s Equity × 100', `${pnlRatios.roe}%`] },
            { cells: ['Total Asset Turnover', 'Net Sales / Average Total Assets', `${pnlRatios.totalAssetTurnover}×`] },
            { cells: ['DuPont ROE', 'Net Profit Margin × Asset Turnover × Equity Multiplier', `${pnlRatios.dupontROE}%`] },
          ],
        });

      } else if (reportType === 'balance-sheet') {
        const d = await queryBalanceSheet(companyId, fyEndYear);
        const eq  = d.equity || {};
        const ncl = d.nonCurrentLiabilities || {};
        const cl  = d.currentLiabilities || {};
        const nca = d.nonCurrentAssets || {};
        const ca  = d.currentAssets || {};
        const sum2 = (obj) => Object.values(obj).reduce((acc, arr) => [acc[0] + (arr[0] || 0), acc[1] + (arr[1] || 0)], [0, 0]);
        const eqTot      = sum2(eq);
        const nclTot     = sum2(ncl);
        const clTot      = sum2(cl);
        const liabTotal  = [eqTot[0] + nclTot[0] + clTot[0], eqTot[1] + nclTot[1] + clTot[1]];
        const ncaTot     = sum2(nca);
        const caTot      = sum2(ca);
        const assetTotal = [ncaTot[0] + caTot[0], ncaTot[1] + caTot[1]];
        const f = (n) => n == null ? '-' : `Rs.${fmtINR(n)}`;
        const COLW_BS = [270, 45, 90, 90];
        drawTable(doc, {
          headers: ['Particulars', 'Note', d.fy1Label, d.fy2Label],
          colWidths: COLW_BS, startY: y,
          rows: [
            { _section: true, cells: ['I.  EQUITY AND LIABILITIES', '', '', ''] },
            { _subhead: true, cells: ['1. Partners\' Funds', '', '', ''] },
            { cells: ['(a) Partners\' Capital Account', '3a', f(eq.partnersContribution?.[0]), f(eq.partnersContribution?.[1])] },
            { cells: ['(b) Partners\' Contribution', '3b', '-', '-'] },
            { cells: ['(c) Partners\' Current Account', '3c', f(eq.partnersCurrentAccount?.[0]), f(eq.partnersCurrentAccount?.[1])] },
            { cells: ['(d) Reserves and Surplus', '4', f(eq.reservesAndSurplus?.[0]), f(eq.reservesAndSurplus?.[1])] },
            { _blank: true },
            { _subhead: true, cells: ['2. Non-current liabilities', '', '', ''] },
            { cells: ['(a) Long-term borrowings', '5', f(ncl.longTermBorrowings?.[0]), f(ncl.longTermBorrowings?.[1])] },
            { cells: ['(b) Deferred tax liabilities (Net)', '6', f(ncl.deferredTaxLiabilities?.[0]), f(ncl.deferredTaxLiabilities?.[1])] },
            { cells: ['(c) Other long-term liabilities', '7', f(ncl.otherLongTermLiabilities?.[0]), f(ncl.otherLongTermLiabilities?.[1])] },
            { cells: ['(d) Long-term provisions', '8', f(ncl.longTermProvisions?.[0]), f(ncl.longTermProvisions?.[1])] },
            { _blank: true },
            { _subhead: true, cells: ['3. Current liabilities', '', '', ''] },
            { cells: ['(a) Short-term borrowings', '5', f(cl.shortTermBorrowings?.[0]), f(cl.shortTermBorrowings?.[1])] },
            { cells: ['(b) Trade payables', '10', f(cl.tradePayables?.[0]), f(cl.tradePayables?.[1])] },
            { cells: ['(c) Other current liabilities', '9', f(cl.otherCurrentLiabilities?.[0]), f(cl.otherCurrentLiabilities?.[1])] },
            { cells: ['(d) Short-term provisions', '8', f(cl.shortTermProvisions?.[0]), f(cl.shortTermProvisions?.[1])] },
            { _blank: true },
            { _total: true, cells: ['Total', '', f(liabTotal[0]), f(liabTotal[1])] },
            { _blank: true },
            { _section: true, cells: ['II.  ASSETS', '', '', ''] },
            { _subhead: true, cells: ['1. Non-current assets', '', '', ''] },
            { cells: ['(a) Property, Plant and Equipment and Intangible assets', '', '', ''] },
            { cells: [{ text: '(i)   Property, Plant and Equipment', indent: 40 }, '11', f(nca.ppe?.[0]), f(nca.ppe?.[1])] },
            { cells: [{ text: '(ii)  Intangible assets', indent: 40 }, '11', f(nca.intangibleAssets?.[0]), f(nca.intangibleAssets?.[1])] },
            { cells: [{ text: '(iii) Capital work in progress', indent: 40 }, '11', f(nca.capitalWIP?.[0]), f(nca.capitalWIP?.[1])] },
            { cells: [{ text: '(iv)  Intangible assets under development', indent: 40 }, '11', f(nca.intangibleUnderDev?.[0]), f(nca.intangibleUnderDev?.[1])] },
            { cells: ['(b) Non-current investments', '12', f(nca.nonCurrentInvestments?.[0]), f(nca.nonCurrentInvestments?.[1])] },
            { cells: ['(c) Deferred tax assets', '12', f(nca.deferredTaxAssets?.[0]), f(nca.deferredTaxAssets?.[1])] },
            { cells: ['(d) Long Term Loans and Advances', '13', f(nca.longTermLoans?.[0]), f(nca.longTermLoans?.[1])] },
            { cells: ['(e) Other non-current assets', '14', f(nca.otherNonCurrent?.[0]), f(nca.otherNonCurrent?.[1])] },
            { _blank: true },
            { _subhead: true, cells: ['2. Current assets', '', '', ''] },
            { cells: ['(a) Current investments', '12', f(ca.currentInvestments?.[0]), f(ca.currentInvestments?.[1])] },
            { cells: ['(b) Inventories', '15', f(ca.inventories?.[0]), f(ca.inventories?.[1])] },
            { cells: ['(c) Trade receivables', '16', f(ca.tradeReceivables?.[0]), f(ca.tradeReceivables?.[1])] },
            { cells: ['(d) Cash and bank balances', '13', f(ca.cashAndBank?.[0]), f(ca.cashAndBank?.[1])] },
            { cells: ['(e) Short Term Loans and Advances', '13', f(ca.shortTermLoans?.[0]), f(ca.shortTermLoans?.[1])] },
            { cells: ['(f) Other current assets', '18', f(ca.otherCurrent?.[0]), f(ca.otherCurrent?.[1])] },
            { _blank: true },
            { _total: true, cells: ['Total', '', f(assetTotal[0]), f(assetTotal[1])] },
          ]
        });

        // Draw ratios section for Balance Sheet PDF
        const cashBS = ca.cashAndBank?.[0] || 0;
        const recBS  = ca.tradeReceivables?.[0] || 0;
        const payBS  = cl.tradePayables?.[0] || 0;
        const fy1NetBS = eq.reservesAndSurplus?.[0] || 0;
        const bsRatios = formulas.computeAllRatios({
          revenue: 0,
          expenses: 0,
          cash: cashBS,
          receivables: recBS,
          payables: payBS,
          cogsAmount: 0,
          interestExpense: 0,
        });
        y = doc.y + 14;
        y = pdfSectionTitle(doc, 'Key Accounting Ratios & Metrics', y + 10);
        y = drawTable(doc, {
          headers: ['Metric', 'Formula / Description', 'Value'],
          colWidths: [185, 210, 100],
          startY: y,
          rows: [
            { cells: ['Current Ratio', 'Current Assets / Current Liabilities', bsRatios.currentRatio.toString()] },
            { cells: ['Quick Ratio (Acid-Test)', '(Current Assets − Inventory) / Current Liabilities', bsRatios.quickRatio.toString()] },
            { cells: ['Cash Ratio', 'Cash / Current Liabilities', bsRatios.cashRatio.toString()] },
            { cells: ['Working Capital', 'Current Assets − Current Liabilities', `Rs.${fmtINR(bsRatios.workingCapital)}`] },
            { _sep: true },
            { cells: ['Debt-to-Equity Ratio', 'Total Liabilities / Shareholder\'s Equity', bsRatios.debtToEquity.toString()] },
            { cells: ['Debt Ratio', 'Total Liabilities / Total Assets', bsRatios.debtRatio.toString()] },
            { cells: ['Equity Multiplier', 'Total Assets / Total Equity', bsRatios.equityMultiplier.toString()] },
          ],
        });

      } else if (reportType === 'cash-flow') {
        const rows = await fetchCashFlowData(companyId, sql, baseParams);
        y = pdfSectionTitle(doc, 'MONTHLY CASH FLOW STATEMENT', y);
        const dataRows = rows.map(r => ({
          cells: [r.label, `Rs.${fmtINR(r.inflow)}`, `Rs.${fmtINR(r.outflow)}`, `Rs.${fmtINR(r.net)}`, `Rs.${fmtINR(r.running)}`]
        }));
        const ti = rows.reduce((s,r)=>s+r.inflow,0);
        const to2 = rows.reduce((s,r)=>s+r.outflow,0);
        const tn = rows.reduce((s,r)=>s+r.net,0);
        dataRows.push({ _sep: true });
        dataRows.push({ _total: true, cells: ['TOTAL', `Rs.${fmtINR(ti)}`, `Rs.${fmtINR(to2)}`, `Rs.${fmtINR(tn)}`, ''] });
        drawTable(doc, {
          headers: ['Month', 'Inflow (Rs.)', 'Outflow (Rs.)', 'Net (Rs.)', 'Running Bal. (Rs.)'],
          rows: dataRows, colWidths: [90, 110, 110, 100, 100], startY: y
        });

      } else if (reportType === 'tax') {
        const d = await fetchTaxData(companyId, sql, baseParams);
        y = pdfSectionTitle(doc, 'INCOME TAX COMPUTATION', y);
        y = drawTable(doc, {
          headers: ['Component', 'Rate', 'Amount (Rs.)'],
          rows: [
            { cells: ['Net Profit (PBT)', '', `Rs.${fmtINR(d.net)}`] },
            { cells: ['Corporate Tax',    '25%', `Rs.${fmtINR(d.baseTax)}`] },
            { cells: ['Surcharge',        '7%',  `Rs.${fmtINR(d.surcharge)}`] },
            { cells: ['H&E Cess',         '4%',  `Rs.${fmtINR(d.cess)}`] },
            { _sep: true },
            { _total: true, cells: ['Total Income Tax', '', `Rs.${fmtINR(d.totalTax)}`] }
          ],
          colWidths: [250, 80, 180], startY: y
        });
        y += 12;
        y = pdfSectionTitle(doc, 'GST LIABILITY', y);
        y = drawTable(doc, {
          headers: ['Component', 'Rate', 'Amount (Rs.)'],
          rows: [
            { cells: ['Output GST (Revenue)',        '18%', `Rs.${fmtINR(d.outputGST)}`] },
            { cells: ['Input GST Credit (Expenses)', '18%', `Rs.${fmtINR(d.inputGST)}`] },
            { _sep: true },
            { _total: true, cells: ['Net GST Payable', '', `Rs.${fmtINR(d.netGST)}`] }
          ],
          colWidths: [250, 80, 180], startY: y
        });
        y += 20;
        drawTable(doc, {
          headers: ['Summary', '', ''],
          rows: [{ _hl: true, cells: ['TOTAL TAX LIABILITY', '', `Rs.${fmtINR(d.totalTax + d.netGST)}`] }],
          colWidths: [250, 80, 180], startY: y
        });

      } else if (reportType === 'gst') {
        const months = await fetchGSTData(companyId, sql, baseParams);
        const totOut = months.reduce((s,m)=>s+m.output,0);
        const totIn  = months.reduce((s,m)=>s+m.input,0);
        const totNet = months.reduce((s,m)=>s+m.net,0);
        y = pdfSectionTitle(doc, 'GST SUMMARY', y);
        y = drawTable(doc, {
          headers: ['Component', 'CGST (Rs.)', 'SGST (Rs.)', 'Total (Rs.)'],
          rows: [
            { cells: ['Output GST (Sales)',           `Rs.${fmtINR(totOut/2)}`, `Rs.${fmtINR(totOut/2)}`, `Rs.${fmtINR(totOut)}`] },
            { cells: ['Input GST Credit (Purchases)', `Rs.${fmtINR(totIn/2)}`,  `Rs.${fmtINR(totIn/2)}`,  `Rs.${fmtINR(totIn)}`] },
            { _sep: true },
            { _total: true, cells: ['Net GST Payable', `Rs.${fmtINR(totNet/2)}`, `Rs.${fmtINR(totNet/2)}`, `Rs.${fmtINR(totNet)}`] }
          ],
          colWidths: [180, 110, 110, 110], startY: y
        });
        y += 12;
        y = pdfSectionTitle(doc, 'MONTHLY GST BREAKDOWN', y);
        const mRows = months.map(m => ({
          cells: [m.label, `Rs.${fmtINR(m.output)}`, `Rs.${fmtINR(m.input)}`, `Rs.${fmtINR(m.net)}`]
        }));
        mRows.push({ _sep: true });
        mRows.push({ _total: true, cells: ['Total', `Rs.${fmtINR(totOut)}`, `Rs.${fmtINR(totIn)}`, `Rs.${fmtINR(totNet)}`] });
        drawTable(doc, {
          headers: ['Month', 'Output GST (Rs.)', 'Input GST (Rs.)', 'Net Payable (Rs.)'],
          rows: mRows, colWidths: [130, 130, 130, 120], startY: y
        });
      }

      // ── Analysis & Suggestions page ────────────────────────────────────────
      doc.addPage();
      let ay = pdfPageHeader(doc, `${reportTitle} — Analysis & Insights`, `Period: ${periodLabel}`);

      let rawAnal = null;
      if (reportType === 'pnl')            rawAnal = await fetchPnLData(companyId, sql, baseParams);
      else if (reportType === 'balance-sheet') rawAnal = await fetchBalanceSheetData(companyId, sql, baseParams);
      else if (reportType === 'cash-flow') rawAnal = await fetchCashFlowData(companyId, sql, baseParams);
      else if (reportType === 'tax')       rawAnal = await fetchTaxData(companyId, sql, baseParams);
      else if (reportType === 'gst')       rawAnal = await fetchGSTData(companyId, sql, baseParams);

      const analMetrics = rawAnal ? buildMetricsForAI(reportType, rawAnal) : {};

      // Verbal narrative section
      const pdfNarrative = buildFallbackNarrative(reportType, analMetrics);
      ay = pdfSectionTitle(doc, 'FINANCIAL ANALYSIS', ay);
      pdfNarrative.split('\n\n').forEach((para, pi) => {
        if (ay + 50 > doc.page.height - M - 40) { doc.addPage(); ay = M + 10; }
        doc.fillColor('#1e293b').font('Helvetica').fontSize(9.5)
           .text(para.trim(), M, ay, { width: doc.page.width - M * 2, align: 'justify', lineGap: 3 });
        ay = doc.y + (pi === 0 ? 14 : 8);
      });

      // Key metrics table
      if (ay + 40 > doc.page.height - M - 40) { doc.addPage(); ay = M + 10; }
      ay += 6;
      const metricRows  = Object.entries(analMetrics)
        .filter(([k]) => k !== 'report_type')
        .map(([k, v]) => ({ cells: [
          k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), v
        ] }));

      ay = pdfSectionTitle(doc, 'KEY FINANCIAL METRICS', ay);
      ay = drawTable(doc, { headers: ['Metric', 'Value'], rows: metricRows, colWidths: [300, 210], startY: ay });

      // AI suggestions (prefer Ollama; fallback to rule-based)
      let exportSugg = getFallbackSuggestions(reportType, analMetrics);
      if (req.query.ai === 'true') {
        try {
          const sRaw = await generateResponse(
            `${reportTitle} Metrics:\n${JSON.stringify(analMetrics, null, 2)}`,
            `You are a senior CA. Output ONLY JSON with exactly 5 suggestions: {"suggestions":[{"title":"Short title","detail":"1-2 sentences with numbers."},{"title":"...","detail":"..."},{"title":"...","detail":"..."},{"title":"...","detail":"..."},{"title":"...","detail":"..."}]}`,
            true
          );
          const sp = JSON.parse(sRaw);
          if (Array.isArray(sp.suggestions) && sp.suggestions.length >= 3) exportSugg = sp.suggestions.slice(0, 5);
        } catch (_) {}
      }

      ay += 20;
      ay = pdfSectionTitle(doc, 'CA SUGGESTIONS & RECOMMENDATIONS', ay);
      exportSugg.forEach((s, i) => {
        if (ay + 60 > doc.page.height - M - 40) { doc.addPage(); ay = M + 10; }
        doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10)
           .text(`${i + 1}.  ${s.title}`, M, ay, { width: doc.page.width - M * 2 });
        ay = doc.y + 4;
        doc.fillColor('#334155').font('Helvetica').fontSize(9)
           .text(s.detail, M + 16, ay, { width: doc.page.width - M * 2 - 16, align: 'justify', lineGap: 2 });
        ay = doc.y + 14;
      });

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

      if (reportType === 'pnl') {
        const sh = wb.addWorksheet('P&L');
        xlSheetHeader(sh, 'Profit & Loss Statement', `Period: ${periodLabel}`);
        sh.columns = [{ key: 'cat', width: 42 }, { key: 'amt', width: 26 }];
        const d = await fetchPnLData(companyId, sql, baseParams);

        sh.addRow(['REVENUE']).font = { bold: true, size: 12, color: { argb: 'FF1D4ED8' } };
        xlHeader(sh.addRow(['Category', 'Amount (Rs.)']), 2);
        d.revenue.forEach((r, i) => {
          const row = sh.addRow([r.cat, parseFloat(r.total)]);
          row.getCell(2).numFmt = XL_FMT;
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        xlTotal(sh.addRow(['Total Revenue', d.totalRev]), 2);
        sh.addRow([]);

        sh.addRow(['OPERATING EXPENSES']).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
        xlHeader(sh.addRow(['Category', 'Amount (Rs.)']), 2);
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

        // Ratios sheet for P&L Excel
        const xlPnLRatios = formulas.computeAllRatios({
          revenue: d.totalRev,
          expenses: d.totalExp,
          cash: 0,
          receivables: 0,
          payables: 0,
          cogsAmount: d.expenses.reduce((s, r) => /purchase|cogs|cost of goods|raw material|direct|inventory/i.test(r.cat) ? s + parseFloat(r.total) : s, 0) || d.totalExp * 0.6,
          interestExpense: d.expenses.reduce((s, r) => /interest|bank charge|finance|loan/i.test(r.cat) ? s + parseFloat(r.total) : s, 0),
        });
        const rsh = wb.addWorksheet('Ratios');
        xlSheetHeader(rsh, 'Key Accounting Ratios & Metrics', `Period: ${periodLabel}`);
        rsh.columns = [{ key: 'metric', width: 36 }, { key: 'formula', width: 48 }, { key: 'value', width: 20 }];
        xlHeader(rsh.addRow(['Metric', 'Formula / Description', 'Value']), 3);
        [
          ['Gross Profit', 'Revenue − COGS', `Rs.${fmtINR(xlPnLRatios.grossProfit)}`],
          ['Gross Profit Margin', 'Gross Profit / Revenue × 100', `${xlPnLRatios.grossProfitMargin}%`],
          ['EBIT (Operating Profit)', 'Revenue − Operating Expenses (excl. interest & tax)', `Rs.${fmtINR(xlPnLRatios.ebit)}`],
          ['Net Profit Margin', 'Net Income / Revenue × 100', `${xlPnLRatios.netProfitMargin}%`],
          ['Working Capital', 'Current Assets − Current Liabilities', `Rs.${fmtINR(xlPnLRatios.workingCapital)}`],
          ['Current Ratio', 'Current Assets / Current Liabilities', xlPnLRatios.currentRatio.toString()],
          ['AR Turnover', 'Net Sales / Average Accounts Receivable', `${xlPnLRatios.arTurnover}×`],
          ['Days Sales Outstanding', '365 / AR Turnover', `${xlPnLRatios.daysSalesOutstanding} days`],
          ['ROA', 'Net Income / Total Assets × 100', `${xlPnLRatios.roa}%`],
          ['ROE', 'Net Income / Shareholder\'s Equity × 100', `${xlPnLRatios.roe}%`],
          ['Total Asset Turnover', 'Net Sales / Average Total Assets', `${xlPnLRatios.totalAssetTurnover}×`],
          ['DuPont ROE', 'Net Profit Margin × Asset Turnover × Equity Multiplier', `${xlPnLRatios.dupontROE}%`],
        ].forEach((r, i) => {
          const row = rsh.addRow(r);
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });

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
          xlHeader(sh.addRow(['Name', 'Amount (Rs.)']), 2);
          sec.rows.forEach(r => { const row = sh.addRow(r); row.getCell(2).numFmt = XL_FMT; });
          xlTotal(sh.addRow(sec.total), 2);
          sh.addRow([]);
        });

        // Ratios sheet for Balance Sheet Excel
        const xlBSRatios = formulas.computeAllRatios({
          revenue: 0,
          expenses: 0,
          cash: d.cash,
          receivables: d.receivables,
          payables: d.payables,
          cogsAmount: 0,
          interestExpense: 0,
        });
        const bsRsh = wb.addWorksheet('Ratios');
        xlSheetHeader(bsRsh, 'Key Accounting Ratios & Metrics', `Period: ${periodLabel}`);
        bsRsh.columns = [{ key: 'metric', width: 36 }, { key: 'formula', width: 48 }, { key: 'value', width: 20 }];
        xlHeader(bsRsh.addRow(['Metric', 'Formula / Description', 'Value']), 3);
        [
          ['Current Ratio', 'Current Assets / Current Liabilities', xlBSRatios.currentRatio.toString()],
          ['Quick Ratio (Acid-Test)', '(Current Assets − Inventory) / Current Liabilities', xlBSRatios.quickRatio.toString()],
          ['Cash Ratio', 'Cash / Current Liabilities', xlBSRatios.cashRatio.toString()],
          ['Working Capital', 'Current Assets − Current Liabilities', `Rs.${fmtINR(xlBSRatios.workingCapital)}`],
          ['Debt-to-Equity Ratio', 'Total Liabilities / Shareholder\'s Equity', xlBSRatios.debtToEquity.toString()],
          ['Debt Ratio', 'Total Liabilities / Total Assets', xlBSRatios.debtRatio.toString()],
          ['Equity Multiplier', 'Total Assets / Total Equity', xlBSRatios.equityMultiplier.toString()],
          ['ROA', 'Net Income / Total Assets × 100', `${xlBSRatios.roa}%`],
          ['ROE', 'Net Income / Shareholder\'s Equity × 100', `${xlBSRatios.roe}%`],
          ['Total Asset Turnover', 'Net Sales / Average Total Assets', `${xlBSRatios.totalAssetTurnover}×`],
          ['AR Turnover', 'Net Sales on Credit / Average AR', `${xlBSRatios.arTurnover}×`],
          ['Days Sales Outstanding', '365 / AR Turnover', `${xlBSRatios.daysSalesOutstanding} days`],
        ].forEach((r, i) => {
          const row = bsRsh.addRow(r);
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });

      } else if (reportType === 'cash-flow') {
        const sh = wb.addWorksheet('Cash Flow');
        xlSheetHeader(sh, 'Cash Flow Statement', `Period: ${periodLabel}`);
        sh.columns = [{ key: 'm', width: 20 }, { key: 'in', width: 22 }, { key: 'out', width: 22 }, { key: 'net', width: 22 }, { key: 'run', width: 26 }];
        const rows = await fetchCashFlowData(companyId, sql, baseParams);
        xlHeader(sh.addRow(['Month', 'Inflow (Rs.)', 'Outflow (Rs.)', 'Net (Rs.)', 'Running Balance (Rs.)']), 5);
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
        xlHeader(sh.addRow(['Component', 'Rate', 'Amount (Rs.)']), 3);
        [['Net Profit (PBT)','',d.net],['Corporate Tax','25%',d.baseTax],['Surcharge','7%',d.surcharge],['H&E Cess','4%',d.cess]].forEach(r => {
          sh.addRow(r).getCell(3).numFmt = XL_FMT;
        });
        xlTotal(sh.addRow(['Total Income Tax','',d.totalTax]), 3);
        sh.addRow([]);
        xlHeader(sh.addRow(['GST Component','Rate','Amount (Rs.)']), 3);
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
        xlHeader(sh.addRow(['Month', 'Output GST (Rs.)', 'Input GST (Rs.)', 'Net Payable (Rs.)']), 4);
        months.forEach((m, i) => {
          const row = sh.addRow([m.label, m.output, m.input, m.net]);
          [2,3,4].forEach(c => { row.getCell(c).numFmt = XL_FMT; });
          row.getCell(4).font = { color: { argb: m.net > 0 ? 'FFDC2626' : 'FF059669' } };
          if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        xlTotal(sh.addRow(['TOTAL', months.reduce((s,m)=>s+m.output,0), months.reduce((s,m)=>s+m.input,0), months.reduce((s,m)=>s+m.net,0)]), 4);
      }

      // ── Analysis & Suggestions sheet ─────────────────────────────────────────
      let xlRawAnal = null;
      if (reportType === 'pnl')            xlRawAnal = await fetchPnLData(companyId, sql, baseParams);
      else if (reportType === 'balance-sheet') xlRawAnal = await fetchBalanceSheetData(companyId, sql, baseParams);
      else if (reportType === 'cash-flow') xlRawAnal = await fetchCashFlowData(companyId, sql, baseParams);
      else if (reportType === 'tax')       xlRawAnal = await fetchTaxData(companyId, sql, baseParams);
      else if (reportType === 'gst')       xlRawAnal = await fetchGSTData(companyId, sql, baseParams);

      const xlMetrics   = xlRawAnal ? buildMetricsForAI(reportType, xlRawAnal) : {};
      const xlSugg      = getFallbackSuggestions(reportType, xlMetrics);
      const xlNarrative = buildFallbackNarrative(reportType, xlMetrics);

      const ash = wb.addWorksheet('Analysis & Insights');
      xlSheetHeader(ash, `${reportTitle} — Analysis`, `Period: ${periodLabel}`);
      ash.columns = [{ key: 'a', width: 80 }, { key: 'b', width: 20 }];

      // Narrative section
      ash.addRow(['FINANCIAL ANALYSIS', '']).font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
      ash.addRow([]);
      xlNarrative.split('\n\n').forEach(para => {
        const pr = ash.addRow([para.trim(), '']);
        pr.getCell(1).alignment = { wrapText: true };
        pr.height = 70;
        pr.font = { size: 10.5, color: { argb: 'FF1E293B' } };
        ash.addRow([]);
      });
      ash.addRow([]);

      ash.columns = [{ key: 'a', width: 38 }, { key: 'b', width: 40 }];
      ash.addRow(['KEY FINANCIAL METRICS', '']).font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
      xlHeader(ash.addRow(['Metric', 'Value']), 2);
      Object.entries(xlMetrics).filter(([k]) => k !== 'report_type').forEach(([k, v], i) => {
        const r = ash.addRow([k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), v]);
        if (i % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });

      ash.addRow([]);
      ash.addRow(['CA SUGGESTIONS & RECOMMENDATIONS', '']).font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
      ash.addRow([]);
      xlSugg.forEach((s, i) => {
        const tr = ash.addRow([`${i + 1}. ${s.title}`, '']);
        tr.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
        const dr = ash.addRow([s.detail, '']);
        dr.getCell(1).alignment = { wrapText: true };
        dr.height = 48;
        ash.addRow([]);
      });

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

module.exports = { getPnL, getBalanceSheet, getCashFlow, getTax, getGST, exportReport, getReportSuggestions };
