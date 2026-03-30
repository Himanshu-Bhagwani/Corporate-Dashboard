const { pool } = require('../config/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { generateResponse } = require('../services/aiService');

const getCompanyId = (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) throw new Error('Company ID required');
  return companyId;
};

const getPnL = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const result = await pool.query(`
      SELECT type, SUM(amount) as total
      FROM transactions
      WHERE company_id = $1
      GROUP BY type
    `, [companyId]);
    
    let income = 0;
    let expense = 0;
    result.rows.forEach(r => {
      if(r.type === 'income') income = parseFloat(r.total);
      if(r.type === 'expense') expense = parseFloat(r.total);
    });
    
    res.json({ income, expense, netProfit: income - expense });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getBalanceSheet = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const result = await pool.query(`
      SELECT a.id, a.name, a.type, a.opening_balance, 
             COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) as net
      FROM accounts a
      LEFT JOIN transactions t ON a.id = t.account_id
      WHERE a.company_id = $1
      GROUP BY a.id, a.name, a.type, a.opening_balance
    `, [companyId]);
    
    const assets = result.rows.map(r => ({
      name: r.name,
      balance: parseFloat(r.opening_balance) + parseFloat(r.net)
    }));
    
    res.json({ assets, liabilities: [], equity: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCashFlow = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const result = await pool.query(`
      SELECT TO_CHAR(date, 'YYYY-MM') as month, type, SUM(amount) as total
      FROM transactions
      WHERE company_id = $1
      GROUP BY month, type
      ORDER BY month ASC
    `, [companyId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTax = async (req, res) => {
  res.json({ estimatedTax: 5000, details: 'Calculated as simple estimation for demo' });
};

const getGST = async (req, res) => {
  res.json({ inputGST: 1500, outputGST: 2500, netLiability: 1000 });
};

const exportReport = async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    const { type = 'pnl', format = 'pdf' } = req.query;
    const reportType = type.toLowerCase();

    // Reusable Data Fetchers
    const fetchPnL = async () => {
      const pnlRes = await pool.query(`SELECT type, SUM(amount) as total FROM transactions WHERE company_id = $1 GROUP BY type`, [companyId]);
      let income = 0, expense = 0;
      pnlRes.rows.forEach(r => {
        if (r.type === 'income') income = parseFloat(r.total);
        if (r.type === 'expense') expense = parseFloat(r.total);
      });
      return { income, expense, net: income - expense };
    };

    const fetchCashflow = async () => {
      const cfRes = await pool.query(`SELECT TO_CHAR(date, 'YYYY-MM') as month, type, SUM(amount) as total FROM transactions WHERE company_id = $1 GROUP BY month, type ORDER BY month ASC`, [companyId]);
      const months = {};
      cfRes.rows.forEach(r => {
        if(!months[r.month]) months[r.month] = { income:0, expense:0 };
        if(r.type==='income') months[r.month].income = parseFloat(r.total);
        if(r.type==='expense') months[r.month].expense = parseFloat(r.total);
      });
      return months; // { '2024-03': { income, expense } }
    };

    const fetchTransactions = async () => {
      const txRes = await pool.query(`SELECT date, name, category, amount, type FROM transactions WHERE company_id = $1 ORDER BY date DESC LIMIT 250`, [companyId]);
      return txRes.rows;
    };

    if (format === 'pdf') {
       const doc = new PDFDocument({ margin: 50 });
       res.setHeader('Content-Type', 'application/pdf');
       res.setHeader('Content-Disposition', `attachment; filename=report-${reportType}.pdf`);
       doc.pipe(res);
       
       doc.fontSize(22).fillColor('#1E3A8A').text(`SODA Corporate Dashboard`, { align: 'center' });
       doc.fontSize(16).fillColor('#4A5568').text(`Report: ${reportType.toUpperCase()}`, { align: 'center' });
       doc.fontSize(10).fillColor('#A0AEC0').text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`, { align: 'center' });
       doc.moveDown(2);
       
       doc.fillColor('#1a202c');

       if (req.query.ai === 'true') {
         doc.fontSize(16).fillColor('#6366F1').text('AI Executive Summary', { underline: true }).moveDown();
         doc.fontSize(11).fillColor('#334155');
         
         const systemPrompt = `You are a Chartered Accountant writing a board-ready Executive Summary for a corporate financial report.

CRITICAL RULES:
1. You MUST ONLY reference the EXACT numbers provided below. NEVER invent, estimate, or hallucinate any financial figures.
2. Write exactly 2 concise paragraphs in plain text. No Markdown, no headers, no bullet points, no code blocks.
3. Use the Indian Rupee symbol (Rs.) when referencing amounts.
4. Provide professional qualitative analysis: comment on margins, burn rate sustainability, spending patterns, and actionable recommendations.
5. Sound like a seasoned financial advisor presenting to a CEO.`;
         
         let dataContext = '';
         if (reportType === 'pnl' || reportType === 'profit-loss') {
           const pnl = await fetchPnL();
           dataContext = `Report Type: Profit & Loss Statement
Total Income: Rs.${pnl.income.toLocaleString('en-IN')}
Total Expenses: Rs.${pnl.expense.toLocaleString('en-IN')}
Net Profit: Rs.${pnl.net.toLocaleString('en-IN')}
Profit Margin: ${pnl.income > 0 ? ((pnl.net / pnl.income) * 100).toFixed(1) : 0}%`;
         } else if (reportType === 'cashflow') {
           const months = await fetchCashflow();
           const lines = Object.entries(months).map(([m, d]) => 
             `${m}: Inflow Rs.${d.income.toLocaleString('en-IN')}, Outflow Rs.${d.expense.toLocaleString('en-IN')}, Net Rs.${(d.income - d.expense).toLocaleString('en-IN')}`
           );
           dataContext = `Report Type: Cash Flow Statement\n${lines.join('\n')}`;
         } else {
           dataContext = 'Report Type: General Financial Report. No specific numeric data available for this report type.';
         }

         const prompt = `Write an Executive Summary based STRICTLY on these verified figures:\n\n${dataContext}`;
         
         try {
           console.log('[AI Reports] Generating executive summary...');
           const summaryText = await generateResponse(prompt, systemPrompt, false);
           const cleaned = summaryText.replace(/```/g, '').replace(/#{1,6}\s/g, '').trim();
           doc.text(cleaned, { align: 'justify', lineGap: 4 });
           doc.moveDown(2);
         } catch (err) {
           doc.text('AI Summary generation failed or timed out.').moveDown(2);
         }
         doc.addPage();
         doc.fillColor('#1a202c');
       }

       if (reportType === 'pnl' || reportType === 'profit-loss') {
         const { income, expense, net } = await fetchPnL();
         doc.fontSize(14).text('Profit & Loss Summary', { underline: true }).moveDown();
         doc.fontSize(12).text(`Total Income: Rs. ${income.toLocaleString('en-IN')}`);
         doc.text(`Total Expenses: Rs. ${expense.toLocaleString('en-IN')}`);
         doc.moveDown().fontSize(14).fillColor(net >= 0 ? '#10B981' : '#EF4444').text(`Net Profit: Rs. ${net.toLocaleString('en-IN')}`);
       } 
       else if (reportType === 'cashflow') {
         const months = await fetchCashflow();
         doc.fontSize(14).text('Monthly Cash Flow', { underline: true }).moveDown();
         doc.fontSize(11);
         for (const [m, data] of Object.entries(months)) {
            doc.text(`${m}  |  Inflow: Rs. ${data.income.toLocaleString('en-IN')}  |  Outflow: Rs. ${data.expense.toLocaleString('en-IN')}  |  Net: Rs. ${(data.income - data.expense).toLocaleString('en-IN')}`);
            doc.moveDown(0.5);
         }
       } 
       else if (reportType === 'transactions') {
         const txns = await fetchTransactions();
         doc.fontSize(14).text('Recent Transactions', { underline: true }).moveDown();
         doc.fontSize(10);
         txns.forEach(t => {
           let d = new Date(t.date).toLocaleDateString() || '-';
           doc.text(`${d} | ${t.name} (${t.category}) | ${t.type === 'income'?'+':'-'} Rs. ${parseFloat(t.amount).toLocaleString('en-IN')}`);
           doc.moveDown(0.2);
         });
       } 
       else {
         doc.fontSize(12).text('Detailed records for this report type are automatically aggregated. Showing standard output.');
       }
       
       doc.end();
       return;
    } 
    
    if (format === 'excel') {
       const workbook = new ExcelJS.Workbook();
       const sheet = workbook.addWorksheet(reportType.toUpperCase());
       
       if (req.query.ai === 'true') {
         const aiSheet = workbook.addWorksheet('AI Executive Summary');
         const systemPrompt = `You are a Chartered Accountant writing a board-ready Executive Summary for a corporate financial report.

CRITICAL RULES:
1. You MUST ONLY reference the EXACT numbers provided below. NEVER invent, estimate, or hallucinate any financial figures.
2. Write exactly 2 concise paragraphs in plain text. No Markdown, no headers, no bullet points, no code blocks.
3. Use the Indian Rupee symbol (Rs.) when referencing amounts.
4. Provide professional qualitative analysis: comment on margins, burn rate sustainability, spending patterns, and actionable recommendations.
5. Sound like a seasoned financial advisor presenting to a CEO.`;
         
         let dataContext = '';
         if (reportType === 'pnl' || reportType === 'profit-loss') {
           const pnl = await fetchPnL();
           dataContext = `Report Type: Profit & Loss Statement
Total Income: Rs.${pnl.income.toLocaleString('en-IN')}
Total Expenses: Rs.${pnl.expense.toLocaleString('en-IN')}
Net Profit: Rs.${pnl.net.toLocaleString('en-IN')}
Profit Margin: ${pnl.income > 0 ? ((pnl.net / pnl.income) * 100).toFixed(1) : 0}%`;
         } else if (reportType === 'cashflow') {
           const months = await fetchCashflow();
           const lines = Object.entries(months).map(([m, d]) => 
             `${m}: Inflow Rs.${d.income.toLocaleString('en-IN')}, Outflow Rs.${d.expense.toLocaleString('en-IN')}, Net Rs.${(d.income - d.expense).toLocaleString('en-IN')}`
           );
           dataContext = `Report Type: Cash Flow Statement\n${lines.join('\n')}`;
         } else {
           dataContext = 'Report Type: General Financial Report. No specific numeric data available for this report type.';
         }

         const prompt = `Write an Executive Summary based STRICTLY on these verified figures:\n\n${dataContext}`;
         
         try {
           console.log('[AI Reports] Generating executive summary for Excel...');
           const summaryText = await generateResponse(prompt, systemPrompt, false);
           const cleaned = summaryText.replace(/```/g, '').replace(/#{1,6}\s/g, '').trim();
           aiSheet.addRow(['AI Executive Summary']);
           aiSheet.addRow(['']);
           aiSheet.addRow([cleaned]);
           aiSheet.getColumn(1).width = 100;
           aiSheet.getRow(3).height = 100;
           aiSheet.getRow(3).alignment = { wrapText: true, vertical: 'top' };
         } catch (err) {
           aiSheet.addRow(['AI Summary generation failed or timed out.']);
         }
       }
       
       if (reportType === 'pnl' || reportType === 'profit-loss') {
         sheet.columns = [ { header: 'Metric', key: 'metric', width: 30 }, { header: 'Value (INR)', key: 'val', width: 25 } ];
         const { income, expense, net } = await fetchPnL();
         sheet.addRow({ metric: 'Total Income', val: income });
         sheet.addRow({ metric: 'Total Expenses', val: expense });
         sheet.addRow({});
         sheet.addRow({ metric: 'Net Profit', val: net });
       } 
       else if (reportType === 'cashflow') {
         sheet.columns = [ { header: 'Month', key: 'm', width: 15 }, { header: 'Inflow', key: 'inf', width: 20 }, { header: 'Outflow', key: 'out', width: 20 }, { header: 'Net', key: 'net', width: 20 } ];
         const months = await fetchCashflow();
         for (const [m, data] of Object.entries(months)) {
            sheet.addRow({ m, inf: data.income, out: data.expense, net: data.income - data.expense });
         }
       } 
       else if (reportType === 'transactions') {
         sheet.columns = [
           { header: 'Date', key: 'date', width: 15 },
           { header: 'Name', key: 'name', width: 35 },
           { header: 'Category', key: 'cat', width: 20 },
           { header: 'Type', key: 'type', width: 15 },
           { header: 'Amount', key: 'amt', width: 15 }
         ];
         const txns = await fetchTransactions();
         txns.forEach(t => {
           sheet.addRow({ date: new Date(t.date).toLocaleDateString(), name: t.name, cat: t.category, type: t.type, amt: parseFloat(t.amount) });
         });
       } 
       else {
         sheet.columns = [ { header: 'Report Type', key: 'col1', width: 30 }, { header: 'Generated On', key: 'col2', width: 30 } ];
         sheet.addRow({ col1: reportType.toUpperCase(), col2: new Date().toLocaleString() });
       }
       
       res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
       res.setHeader('Content-Disposition', `attachment; filename=report-${reportType}.xlsx`);
       await workbook.xlsx.write(res);
       res.end();
       return;
    }
    
    res.status(400).json({ error: 'Unsupported format' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getPnL, getBalanceSheet, getCashFlow, getTax, getGST, exportReport
};
