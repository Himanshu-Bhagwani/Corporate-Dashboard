import React from 'react';

const fmt = (n) =>
  n == null ? '-' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtShort = (n) => {
  if (n == null) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
  fontFamily: '"Times New Roman", serif',
  color: '#1a202c',
};

const thStyle = {
  border: '1px solid #94a3b8',
  padding: '6px 10px',
  background: '#f1f5f9',
  fontWeight: 'bold',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const td = (extra = {}) => ({
  border: '1px solid #cbd5e1',
  padding: '5px 10px',
  verticalAlign: 'top',
  ...extra,
});

const numTd = (extra = {}) => td({ textAlign: 'right', whiteSpace: 'nowrap', ...extra });

const sectionHead = (label) => (
  <tr key={label}>
    <td colSpan={4} style={{ ...td(), background: '#f1f5f9', fontWeight: 'bold', paddingTop: '8px', paddingBottom: '8px' }}>
      {label}
    </td>
  </tr>
);

const subHead = (label) => (
  <tr key={label}>
    <td colSpan={4} style={{ ...td(), fontWeight: '600', paddingLeft: '20px', background: '#fafafa' }}>
      {label}
    </td>
  </tr>
);

const row = (label, note, fy1, fy2, indent = 30, bold = false) => (
  <tr key={label}>
    <td style={{ ...td(), paddingLeft: indent, fontWeight: bold ? 'bold' : 'normal' }}>{label}</td>
    <td style={{ ...td(), textAlign: 'center', color: '#64748b' }}>{note || ''}</td>
    <td style={numTd({ fontWeight: bold ? 'bold' : 'normal' })}>{fmt(fy1)}</td>
    <td style={numTd({ fontWeight: bold ? 'bold' : 'normal' })}>{fmt(fy2)}</td>
  </tr>
);

const totalRow = (label, fy1, fy2) => (
  <tr key={label + '-total'} style={{ borderTop: '2px solid #475569' }}>
    <td style={{ ...td(), fontWeight: 'bold', paddingLeft: 30 }}>{label}</td>
    <td style={td({ textAlign: 'center' })}></td>
    <td style={numTd({ fontWeight: 'bold', borderTop: '2px solid #475569' })}>{fmt(fy1)}</td>
    <td style={numTd({ fontWeight: 'bold', borderTop: '2px solid #475569' })}>{fmt(fy2)}</td>
  </tr>
);

const blankRow = (key) => (
  <tr key={key || Math.random()}>
    <td colSpan={4} style={{ ...td(), padding: '3px' }}></td>
  </tr>
);

// ─── Balance Sheet ──────────────────────────────────────────────────────────
const BalanceSheetTable = ({ data, fy1Label, fy2Label }) => {
  const eq  = data.equity || {};
  const ncl = data.nonCurrentLiabilities || {};
  const cl  = data.currentLiabilities || {};
  const nca = data.nonCurrentAssets || {};
  const ca  = data.currentAssets || {};

  const sum = (obj) =>
    Object.values(obj).reduce((acc, arr) => [acc[0] + (arr[0] || 0), acc[1] + (arr[1] || 0)], [0, 0]);

  const eqTot    = sum(eq);
  const nclTot   = sum(ncl);
  const clTot    = sum(cl);
  const liabTotal = [eqTot[0] + nclTot[0] + clTot[0], eqTot[1] + nclTot[1] + clTot[1]];

  const ncaTot   = sum(nca);
  const caTot    = sum(ca);
  const assetTotal = [ncaTot[0] + caTot[0], ncaTot[1] + caTot[1]];

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...thStyle, width: '45%', textAlign: 'left' }}>Particulars</th>
          <th style={{ ...thStyle, width: '8%' }}>Note</th>
          <th style={thStyle}>{fy1Label}</th>
          <th style={thStyle}>{fy2Label}</th>
        </tr>
      </thead>
      <tbody>
        {sectionHead('I.  EQUITY AND LIABILITIES')}

        {subHead('1. Partners\' Funds')}
        {row('(a) Partners\' Capital Account', '3a', eq.partnersContribution?.[0], eq.partnersContribution?.[1])}
        {row('(b) Partners\' Contribution', '3b', null, null)}
        {row('(c) Partners\' Current Account', '3c', eq.partnersCurrentAccount?.[0], eq.partnersCurrentAccount?.[1])}
        {row('(d) Reserves and Surplus', '4', eq.reservesAndSurplus?.[0], eq.reservesAndSurplus?.[1])}

        {subHead('2. Non-current liabilities')}
        {row('(a) Long-term borrowings', '5', ncl.longTermBorrowings?.[0], ncl.longTermBorrowings?.[1])}
        {row('(b) Deferred tax liabilities (Net)', '6', ncl.deferredTaxLiabilities?.[0], ncl.deferredTaxLiabilities?.[1])}
        {row('(c) Other long-term liabilities', '7', ncl.otherLongTermLiabilities?.[0], ncl.otherLongTermLiabilities?.[1])}
        {row('(d) Long-term provisions', '8', ncl.longTermProvisions?.[0], ncl.longTermProvisions?.[1])}

        {subHead('3. Current liabilities')}
        {row('(a) Short-term borrowings', '5', cl.shortTermBorrowings?.[0], cl.shortTermBorrowings?.[1])}
        {row('(b) Trade payables', '10', cl.tradePayables?.[0], cl.tradePayables?.[1])}
        {row('(c) Other current liabilities', '9', cl.otherCurrentLiabilities?.[0], cl.otherCurrentLiabilities?.[1])}
        {row('(d) Short-term provisions', '8', cl.shortTermProvisions?.[0], cl.shortTermProvisions?.[1])}

        {totalRow('Total', liabTotal[0], liabTotal[1])}
        {blankRow('bs-sep')}

        {sectionHead('II.  ASSETS')}

        {subHead('1. Non-current assets')}
        {row('(a) Property, Plant and Equipment and Intangible assets', '', null, null, 20)}
        {row('(i)   Property, Plant and Equipment', '11', nca.ppe?.[0], nca.ppe?.[1], 40)}
        {row('(ii)  Intangible assets', '11', nca.intangibleAssets?.[0], nca.intangibleAssets?.[1], 40)}
        {row('(iii) Capital work in progress', '11', nca.capitalWIP?.[0], nca.capitalWIP?.[1], 40)}
        {row('(iv)  Intangible assets under development', '11', nca.intangibleUnderDev?.[0], nca.intangibleUnderDev?.[1], 40)}
        {row('(b) Non-current investments', '12', nca.nonCurrentInvestments?.[0], nca.nonCurrentInvestments?.[1])}
        {row('(c) Deferred tax assets', '12', nca.deferredTaxAssets?.[0], nca.deferredTaxAssets?.[1])}
        {row('(d) Long Term Loans and Advances', '13', nca.longTermLoans?.[0], nca.longTermLoans?.[1])}
        {row('(e) Other non-current assets', '14', nca.otherNonCurrent?.[0], nca.otherNonCurrent?.[1])}

        {subHead('2. Current assets')}
        {row('(a) Current investments', '12', ca.currentInvestments?.[0], ca.currentInvestments?.[1])}
        {row('(b) Inventories', '15', ca.inventories?.[0], ca.inventories?.[1])}
        {row('(c) Trade receivables', '16', ca.tradeReceivables?.[0], ca.tradeReceivables?.[1])}
        {row('(d) Cash and bank balances', '13', ca.cashAndBank?.[0], ca.cashAndBank?.[1])}
        {row('(e) Short Term Loans and Advances', '13', ca.shortTermLoans?.[0], ca.shortTermLoans?.[1])}
        {row('(f) Other current assets', '18', ca.otherCurrent?.[0], ca.otherCurrent?.[1])}

        {totalRow('Total', assetTotal[0], assetTotal[1])}
        {blankRow('bs-sep2')}

        <tr>
          <td colSpan={4} style={{ ...td(), fontStyle: 'italic', color: '#64748b', paddingLeft: 10 }}>
            Brief about the Entity — Note 1 &nbsp;|&nbsp; Summary of significant accounting policies — Note 2
          </td>
        </tr>
        <tr>
          <td colSpan={4} style={{ ...td(), fontStyle: 'italic', color: '#64748b', paddingLeft: 10 }}>
            The accompanying notes are an integral part of the financial statements
          </td>
        </tr>
      </tbody>
    </table>
  );
};

// ─── Profit & Loss ──────────────────────────────────────────────────────────
const PnLTable = ({ data, fy1Label, fy2Label }) => {
  const rev = data.revenue || {};
  const exp = data.expenses || {};

  const revFY1 = (rev.fromOperations?.[0] || 0) + (rev.otherIncome?.[0] || 0);
  const revFY2 = (rev.fromOperations?.[1] || 0) + (rev.otherIncome?.[1] || 0);

  const totalExpFY1 = Object.values(exp).reduce((s, a) => s + (a[0] || 0), 0);
  const totalExpFY2 = Object.values(exp).reduce((s, a) => s + (a[1] || 0), 0);

  const profitFY1 = revFY1 - totalExpFY1;
  const profitFY2 = revFY2 - totalExpFY2;

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...thStyle, width: '45%', textAlign: 'left' }}>Particulars</th>
          <th style={{ ...thStyle, width: '8%' }}>Note</th>
          <th style={thStyle}>{fy1Label}</th>
          <th style={thStyle}>{fy2Label}</th>
        </tr>
      </thead>
      <tbody>
        {row('I.   Revenue from operations', '19', rev.fromOperations?.[0], rev.fromOperations?.[1], 10)}
        {row('II.  Other Income', '20', rev.otherIncome?.[0], rev.otherIncome?.[1], 10)}
        {totalRow('III. Total Revenue (I+II)', revFY1, revFY2)}
        {blankRow('pnl-b1')}

        {sectionHead('IV.  Expenses:')}
        {row('(a) Cost of goods sold', '21', exp.cogs?.[0], exp.cogs?.[1])}
        {row('(b) Employee benefits expense', '22', exp.employeeBenefits?.[0], exp.employeeBenefits?.[1])}
        {row('(c) Finance costs', '23', exp.financeCosts?.[0], exp.financeCosts?.[1])}
        {row('(d) Depreciation and amortization expense', '24', exp.depreciation?.[0], exp.depreciation?.[1])}
        {row('(e) Other expenses', '25', exp.other?.[0], exp.other?.[1])}
        {totalRow('Total expenses', totalExpFY1, totalExpFY2)}
        {blankRow('pnl-b2')}

        {row('V.   Profit/(loss) before exceptional and extraordinary items, partners\' remuneration and tax (III-IV)', '', profitFY1, profitFY2, 10, true)}
        {blankRow('pnl-b3')}
        {row('VI.  Exceptional items (specify nature & provide note — delete if none)', '', null, null, 10)}
        {blankRow('pnl-b4')}
        {row('VII. Profit/(loss) before extraordinary items and tax (V-VI)', '', profitFY1, profitFY2, 10, true)}
        {blankRow('pnl-b5')}
        {row('VIII. Extraordinary items (specify nature & provide note — delete if none)', '', null, null, 10)}
        {blankRow('pnl-b6')}
        {row('IX.  Partners\' Remuneration', '30', null, null, 10)}
        {blankRow('pnl-b7')}
        {row('X.   Profit before Partners\' Remuneration and tax (VII-VIII-IX)', '', profitFY1, profitFY2, 10, true)}
        {subHead('     Tax expense:')}
        {row('(a) Current tax', '', null, null)}
        {row('(b) Excess/ Short provision of tax relating to earlier years', '', null, null)}
        {row('(c) Deferred tax charge/ (benefit)', '', null, null)}
        {blankRow('pnl-b8')}
        {row('XIII. Profit/(loss) for the period from continuing operations', '', profitFY1, profitFY2, 10, true)}
        {row('XIV.  Profit/(loss) from discontinuing operations', '', null, null, 10)}
        {row('XV.   Tax expense of discontinuing operations', '', null, null, 10)}
        {row('XVI.  Profit/(loss) from discontinuing operations (after tax) (XIV-XV)', '', null, null, 10)}
        {blankRow('pnl-b9')}
        {totalRow('XVII. Profit/(loss) for the year (XIII+XVI)', profitFY1, profitFY2)}
        {blankRow('pnl-b10')}
        <tr>
          <td colSpan={4} style={{ ...td(), fontStyle: 'italic', color: '#64748b', paddingLeft: 10 }}>
            The accompanying notes are an integral part of the financial statements
          </td>
        </tr>
      </tbody>
    </table>
  );
};

// ─── Cash Flow ──────────────────────────────────────────────────────────────
const CashFlowTable = ({ data }) => {
  const months = data.months || [];
  const totals = data.totals || {};
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: 'left', width: '22%' }}>Month</th>
          <th style={thStyle}>Inflow</th>
          <th style={thStyle}>Outflow</th>
          <th style={thStyle}>Net</th>
          <th style={thStyle}>Running Balance</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={m.label}>
            <td style={td()}>{m.label}</td>
            <td style={numTd({ color: '#059669' })}>{fmt(m.inflow)}</td>
            <td style={numTd({ color: '#dc2626' })}>{fmt(m.outflow)}</td>
            <td style={numTd({ color: m.net >= 0 ? '#059669' : '#dc2626', fontWeight: '600' })}>{fmt(m.net)}</td>
            <td style={numTd()}>{fmt(m.running)}</td>
          </tr>
        ))}
        {months.length === 0 && (
          <tr><td colSpan={5} style={{ ...td(), textAlign: 'center', color: '#94a3b8' }}>No data for selected period</td></tr>
        )}
      </tbody>
      <tfoot>
        <tr style={{ borderTop: '2px solid #475569', background: '#f1f5f9' }}>
          <td style={{ ...td(), fontWeight: 'bold' }}>Total</td>
          <td style={numTd({ fontWeight: 'bold', color: '#059669' })}>{fmt(totals.inflow)}</td>
          <td style={numTd({ fontWeight: 'bold', color: '#dc2626' })}>{fmt(totals.outflow)}</td>
          <td style={numTd({ fontWeight: 'bold', color: (totals.net || 0) >= 0 ? '#059669' : '#dc2626' })}>{fmt(totals.net)}</td>
          <td style={numTd()}></td>
        </tr>
      </tfoot>
    </table>
  );
};

// ─── Tax Summary ─────────────────────────────────────────────────────────────
const TaxTable = ({ data }) => {
  const it  = data.incomeTax || {};
  const gst = data.gst || {};
  return (
    <div>
      <table style={{ ...tableStyle, marginBottom: '24px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '55%' }}>P&amp;L Overview</th>
            <th style={thStyle}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={td()}>Total Revenue</td><td style={numTd()}>{fmt(data.totalRevenue)}</td></tr>
          <tr><td style={td()}>Total Expenses</td><td style={numTd()}>{fmt(data.totalExpenses)}</td></tr>
          <tr style={{ borderTop: '2px solid #475569' }}>
            <td style={{ ...td(), fontWeight: 'bold' }}>Net Profit (PBT)</td>
            <td style={numTd({ fontWeight: 'bold', color: (data.netProfit || 0) >= 0 ? '#059669' : '#dc2626' })}>{fmt(data.netProfit)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...tableStyle, marginBottom: '24px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '45%' }}>Income Tax Computation</th>
            <th style={{ ...thStyle, width: '10%' }}>Rate</th>
            <th style={thStyle}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={td()}>Corporate Tax</td><td style={{ ...td(), textAlign: 'center' }}>{it.rate}</td><td style={numTd()}>{fmt(it.baseTax)}</td></tr>
          <tr><td style={td()}>Surcharge</td><td style={{ ...td(), textAlign: 'center' }}>{it.surchargeRate}</td><td style={numTd()}>{fmt(it.surcharge)}</td></tr>
          <tr><td style={td()}>Health &amp; Education Cess</td><td style={{ ...td(), textAlign: 'center' }}>{it.cessRate}</td><td style={numTd()}>{fmt(it.cess)}</td></tr>
          <tr style={{ borderTop: '2px solid #475569' }}>
            <td style={{ ...td(), fontWeight: 'bold' }} colSpan={2}>Total Income Tax</td>
            <td style={numTd({ fontWeight: 'bold' })}>{fmt(it.total)}</td>
          </tr>
        </tbody>
      </table>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '45%' }}>GST Liability</th>
            <th style={{ ...thStyle, width: '10%' }}>Rate</th>
            <th style={thStyle}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={td()}>Output GST (on Revenue)</td><td style={{ ...td(), textAlign: 'center' }}>18%</td><td style={numTd()}>{fmt(gst.outputGST)}</td></tr>
          <tr><td style={td()}>Input GST Credit (on Expenses)</td><td style={{ ...td(), textAlign: 'center' }}>18%</td><td style={numTd()}>{fmt(gst.inputGSTCredit)}</td></tr>
          <tr style={{ borderTop: '2px solid #475569' }}>
            <td style={{ ...td(), fontWeight: 'bold' }} colSpan={2}>Net GST Payable</td>
            <td style={numTd({ fontWeight: 'bold' })}>{fmt(gst.netPayable)}</td>
          </tr>
          <tr style={{ background: '#dbeafe' }}>
            <td style={{ ...td(), fontWeight: 'bold', color: '#1e3a8a' }} colSpan={2}>Total Tax Liability</td>
            <td style={numTd({ fontWeight: 'bold', color: '#1e3a8a' })}>{fmt(data.totalTaxLiability)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ─── GST Report ───────────────────────────────────────────────────────────────
const GSTTable = ({ data }) => {
  const s      = data.summary || {};
  const months = data.months || [];
  return (
    <div>
      <table style={{ ...tableStyle, marginBottom: '24px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '35%' }}>Component</th>
            <th style={thStyle}>CGST</th>
            <th style={thStyle}>SGST</th>
            <th style={thStyle}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td()}>Output GST (Sales)</td>
            <td style={numTd()}>{fmt(s.cgstOut)}</td>
            <td style={numTd()}>{fmt(s.sgstOut)}</td>
            <td style={numTd({ fontWeight: '600' })}>{fmt(s.outputGST)}</td>
          </tr>
          <tr>
            <td style={td()}>Input GST Credit (Purchases)</td>
            <td style={numTd()}>{fmt(s.cgstIn)}</td>
            <td style={numTd()}>{fmt(s.sgstIn)}</td>
            <td style={numTd({ fontWeight: '600' })}>{fmt(s.inputGST)}</td>
          </tr>
          <tr style={{ borderTop: '2px solid #475569', background: s.netPayable > 0 ? '#fee2e2' : '#dcfce7' }}>
            <td style={{ ...td(), fontWeight: 'bold' }}>Net GST Payable</td>
            <td style={numTd({ fontWeight: 'bold' })}>{fmt((s.cgstOut || 0) - (s.cgstIn || 0))}</td>
            <td style={numTd({ fontWeight: 'bold' })}>{fmt((s.sgstOut || 0) - (s.sgstIn || 0))}</td>
            <td style={numTd({ fontWeight: 'bold', color: s.netPayable > 0 ? '#dc2626' : '#059669' })}>{fmt(s.netPayable || s.netRefundable)}</td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontWeight: '600', marginBottom: '8px', color: '#334155' }}>Monthly Breakdown</p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '22%' }}>Month</th>
            <th style={thStyle}>Output GST</th>
            <th style={thStyle}>Input GST</th>
            <th style={thStyle}>Net Payable</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.label}>
              <td style={td()}>{m.label}</td>
              <td style={numTd()}>{fmt(m.output)}</td>
              <td style={numTd()}>{fmt(m.input)}</td>
              <td style={numTd({ color: m.net > 0 ? '#dc2626' : '#059669', fontWeight: '600' })}>{fmt(m.net)}</td>
            </tr>
          ))}
          {months.length === 0 && (
            <tr><td colSpan={4} style={{ ...td(), textAlign: 'center', color: '#94a3b8' }}>No data for selected period</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #475569', background: '#f1f5f9' }}>
            <td style={{ ...td(), fontWeight: 'bold' }}>Total</td>
            <td style={numTd({ fontWeight: 'bold' })}>{fmt(s.outputGST)}</td>
            <td style={numTd({ fontWeight: 'bold' })}>{fmt(s.inputGST)}</td>
            <td style={numTd({ fontWeight: 'bold', color: s.netPayable > 0 ? '#dc2626' : '#059669' })}>{fmt(s.netPayable)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── KPI Card helper ─────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color = 'blue' }) => (
  <div className={`rv-kpi-card ${color}`}>
    <div className="rv-kpi-label">{label}</div>
    <div className="rv-kpi-value">{value}</div>
    {sub && <div className="rv-kpi-sub">{sub}</div>}
  </div>
);

// ─── Main component ─────────────────────────────────────────────────────────
const ReportViewer = ({ reportKey, title, data }) => {
  if (!data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
        Select a report to view details.
      </div>
    );
  }

  if (data.error) {
    return <div className="rv-error">{data.error}</div>;
  }

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const companyName = data?.companyName || '';
  const periodLabel = data?.fy1Label
    ? `Year ended ${data.fy1Label}`
    : data?.period?.from || data?.period?.to
      ? [data.period.from && `From ${data.period.from}`, data.period.to && `To ${data.period.to}`].filter(Boolean).join(' · ')
      : 'All Time';

  const wrapper = (content, kpiCards = null) => (
    <div className="rv-doc" style={{ marginTop: '2rem' }}>
      <div className="rv-header">
        <div className="rv-header-left">
          {companyName && <span className="rv-header-co">{companyName}</span>}
          <div className="rv-header-title">{title}</div>
          <div className="rv-header-sub">{periodLabel} &nbsp;·&nbsp; Amount in ₹</div>
        </div>
        <div className="rv-header-right">
          <span className="rv-generated">Generated {today}</span>
        </div>
      </div>
      <div className="rv-body" style={{ overflowX: 'auto' }}>
        {content}
      </div>
      {kpiCards && <div className="rv-kpi-row">{kpiCards}</div>}
    </div>
  );

  if (reportKey === 'balance-sheet') {
    const eq  = data.equity || {};
    const ncl = data.nonCurrentLiabilities || {};
    const cl  = data.currentLiabilities || {};
    const nca = data.nonCurrentAssets || {};
    const ca  = data.currentAssets || {};
    const sum = (obj) =>
      Object.values(obj).reduce((acc, arr) => [acc[0] + (arr[0] || 0), acc[1] + (arr[1] || 0)], [0, 0]);
    const liabTot  = sum({ ...eq, ...ncl, ...cl });
    const assetTot = sum({ ...nca, ...ca });
    const cashFY1  = ca.cashAndBank?.[0] || 0;
    const recvFY1  = ca.tradeReceivables?.[0] || 0;
    const payFY1   = cl.tradePayables?.[0] || 0;

    return wrapper(
      <BalanceSheetTable data={data} fy1Label={data.fy1Label} fy2Label={data.fy2Label} />,
      <>
        <KpiCard label="Total Assets" value={fmtShort(assetTot[0])} color="blue" />
        <KpiCard label="Cash & Bank" value={fmtShort(cashFY1)} color="green" />
        <KpiCard label="Trade Receivables" value={fmtShort(recvFY1)} color="amber" />
        <KpiCard label="Trade Payables" value={fmtShort(payFY1)} color="red" />
      </>
    );
  }

  if (reportKey === 'pnl') {
    const rev = data.revenue || {};
    const exp = data.expenses || {};
    const revFY1 = (rev.fromOperations?.[0] || 0) + (rev.otherIncome?.[0] || 0);
    const expFY1 = Object.values(exp).reduce((s, a) => s + (a[0] || 0), 0);
    const profitFY1 = revFY1 - expFY1;
    const margin = revFY1 > 0 ? ((profitFY1 / revFY1) * 100).toFixed(1) : '0.0';

    return wrapper(
      <PnLTable data={data} fy1Label={data.fy1Label} fy2Label={data.fy2Label} />,
      <>
        <KpiCard label="Revenue" value={fmtShort(revFY1)} color="blue" />
        <KpiCard label="Total Expenses" value={fmtShort(expFY1)} color="red" />
        <KpiCard label="Net Profit" value={fmtShort(profitFY1)} color={profitFY1 >= 0 ? 'green' : 'red'} />
        <KpiCard label="Net Margin" value={`${margin}%`} color="amber" />
      </>
    );
  }

  if (reportKey === 'cash-flow') {
    const totals = data.totals || {};
    return wrapper(
      <CashFlowTable data={data} />,
      <>
        <KpiCard label="Total Inflow" value={fmtShort(totals.inflow)} color="green" />
        <KpiCard label="Total Outflow" value={fmtShort(totals.outflow)} color="red" />
        <KpiCard label="Net Cash Flow" value={fmtShort(totals.net)} color={(totals.net || 0) >= 0 ? 'green' : 'red'} />
      </>
    );
  }

  if (reportKey === 'tax') {
    return wrapper(
      <TaxTable data={data} />,
      <>
        <KpiCard label="Net Profit (PBT)" value={fmtShort(data.netProfit)} color={(data.netProfit || 0) >= 0 ? 'green' : 'red'} />
        <KpiCard label="Income Tax" value={fmtShort(data.incomeTax?.total)} color="amber" />
        <KpiCard label="Net GST Payable" value={fmtShort(data.gst?.netPayable)} color="amber" />
        <KpiCard label="Total Tax Liability" value={fmtShort(data.totalTaxLiability)} color="red" />
      </>
    );
  }

  if (reportKey === 'gst') {
    const s = data.summary || {};
    return wrapper(
      <GSTTable data={data} />,
      <>
        <KpiCard label="Output GST" value={fmtShort(s.outputGST)} color="blue" />
        <KpiCard label="Input GST Credit" value={fmtShort(s.inputGST)} color="green" />
        <KpiCard label="Net GST Payable" value={fmtShort(s.netPayable)} color={s.netPayable > 0 ? 'red' : 'green'} sub={data.gstRate} />
      </>
    );
  }

  return wrapper(
    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', color: '#2d3748' }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
};

export default ReportViewer;
