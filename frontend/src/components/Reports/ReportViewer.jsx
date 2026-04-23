import React from 'react';

const fmt = (n) =>
  '₹' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const periodText = (period) => {
  if (!period) return 'All Time';
  if (period.from && period.to) return `${period.from}  →  ${period.to}`;
  if (period.from) return `From ${period.from}`;
  if (period.to)   return `Up to ${period.to}`;
  return 'All Time';
};

// ─── Shared primitives ────────────────────────────────────────────────────────

const DocHeader = ({ title, sub, period }) => (
  <div className="rv-header">
    <div className="rv-header-left">
      <span className="rv-header-co">SODA Corporate Dashboard</span>
      <h2 className="rv-header-title">{title}</h2>
      {sub && <p className="rv-header-sub">{sub}</p>}
    </div>
    <div className="rv-header-right">
      <span className="rv-period-badge">{period}</span>
      <span className="rv-generated">Generated {new Date().toLocaleDateString('en-IN')}</span>
    </div>
  </div>
);

const SecHead = ({ label, color }) => (
  <div className="rv-sec-head" style={{ borderLeftColor: color, background: color + '12' }}>
    <span style={{ color }}>{label}</span>
  </div>
);

const LineTable = ({ rows, totalLabel, totalAmount, color }) => (
  <table className="rv-table">
    <tbody>
      {rows.map((r, i) => (
        <tr key={i} className="rv-row">
          <td className="rv-row-name">{r.category || r.name}</td>
          <td className="rv-row-amt">{fmt(r.amount)}</td>
        </tr>
      ))}
    </tbody>
    {totalLabel && (
      <tfoot>
        <tr className="rv-subtotal" style={{ '--sub-color': color }}>
          <td>{totalLabel}</td>
          <td>{fmt(totalAmount)}</td>
        </tr>
      </tfoot>
    )}
  </table>
);

const KpiFooter = ({ items }) => (
  <div className="rv-kpi-row">
    {items.map((item, i) => (
      <div key={i} className={`rv-kpi-card ${item.variant || ''}`}>
        <span className="rv-kpi-label">{item.label}</span>
        <span className="rv-kpi-value">{item.value}</span>
        {item.sub && <span className="rv-kpi-sub">{item.sub}</span>}
      </div>
    ))}
  </div>
);

const EmptyData = () => (
  <div className="rv-empty">No data available for this period.</div>
);

// ─── P&L ─────────────────────────────────────────────────────────────────────

const PnLReport = ({ data }) => {
  const { period, revenue, expenses, netProfit, netMargin } = data;
  const isProfit = netProfit >= 0;
  return (
    <div className="rv-doc">
      <DocHeader title="Profit & Loss Statement" period={periodText(period)} />
      <div className="rv-body">
        <SecHead label="REVENUE" color="#1d4ed8" />
        {revenue?.items?.length
          ? <LineTable rows={revenue.items} totalLabel="Total Revenue" totalAmount={revenue.total} color="#1d4ed8" />
          : <EmptyData />}

        <div className="rv-spacer" />

        <SecHead label="OPERATING EXPENSES" color="#dc2626" />
        {expenses?.items?.length
          ? <LineTable rows={expenses.items} totalLabel="Total Expenses" totalAmount={expenses.total} color="#dc2626" />
          : <EmptyData />}
      </div>

      <KpiFooter items={[
        { label: 'Total Revenue',    value: fmt(revenue?.total || 0),    variant: 'blue' },
        { label: 'Total Expenses',   value: fmt(expenses?.total || 0),   variant: 'red' },
        { label: 'Net Profit / Loss',value: fmt(netProfit),              variant: isProfit ? 'green' : 'red', sub: `${isProfit ? '+' : ''}${netMargin}% margin` },
      ]} />
    </div>
  );
};

// ─── Balance Sheet ────────────────────────────────────────────────────────────

const BalanceSheetReport = ({ data }) => {
  const { asOf, assets, liabilities, equity, totalLiabilitiesAndEquity } = data;
  const balanced = Math.abs((assets?.total || 0) - ((liabilities?.total || 0) + (equity?.total || 0))) < 1;
  return (
    <div className="rv-doc">
      <DocHeader title="Balance Sheet" sub={`As of ${asOf}`} period={`As of ${asOf}`} />
      <div className="rv-body rv-bs-grid">
        {/* Left: Assets */}
        <div>
          <SecHead label="ASSETS" color="#1d4ed8" />
          <LineTable
            rows={assets?.current?.items || []}
            totalLabel="TOTAL ASSETS"
            totalAmount={assets?.total || 0}
            color="#1d4ed8"
          />
        </div>
        {/* Right: Liabilities + Equity */}
        <div>
          <SecHead label="LIABILITIES" color="#dc2626" />
          <LineTable
            rows={liabilities?.current?.items || []}
            totalLabel="TOTAL LIABILITIES"
            totalAmount={liabilities?.total || 0}
            color="#dc2626"
          />
          <div className="rv-spacer-sm" />
          <SecHead label="EQUITY" color="#059669" />
          <LineTable
            rows={equity?.items || []}
            totalLabel="TOTAL EQUITY"
            totalAmount={equity?.total || 0}
            color="#059669"
          />
        </div>
      </div>

      <KpiFooter items={[
        { label: 'Total Assets',              value: fmt(assets?.total || 0),               variant: 'blue' },
        { label: 'Total Liabilities',         value: fmt(liabilities?.total || 0),          variant: 'red' },
        { label: 'Total Equity',              value: fmt(equity?.total || 0),               variant: 'green' },
        { label: 'Liabilities + Equity',      value: fmt(totalLiabilitiesAndEquity || 0),   variant: balanced ? 'green' : 'red', sub: balanced ? 'Balanced ✓' : 'Check entries' },
      ]} />
    </div>
  );
};

// ─── Cash Flow ────────────────────────────────────────────────────────────────

const CashFlowReport = ({ data }) => {
  const { period, months = [], totals } = data;
  return (
    <div className="rv-doc">
      <DocHeader title="Cash Flow Statement" period={periodText(period)} />
      <div className="rv-body">
        <SecHead label="MONTHLY CASH FLOW" color="#7c3aed" />
        {months.length === 0 ? <EmptyData /> : (
          <div className="rv-cf-wrap">
            <table className="rv-table rv-cf-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="rv-right">Inflow</th>
                  <th className="rv-right">Outflow</th>
                  <th className="rv-right">Net</th>
                  <th className="rv-right">Running Bal.</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m, i) => (
                  <tr key={i} className={`rv-row ${i % 2 === 1 ? 'rv-row-alt' : ''}`}>
                    <td className="rv-row-name">{m.label}</td>
                    <td className="rv-right rv-green">{fmt(m.inflow)}</td>
                    <td className="rv-right rv-red">{fmt(m.outflow)}</td>
                    <td className={`rv-right rv-bold ${m.net >= 0 ? 'rv-green' : 'rv-red'}`}>{fmt(m.net)}</td>
                    <td className="rv-right rv-bold">{fmt(m.running)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rv-subtotal" style={{ '--sub-color': '#7c3aed' }}>
                  <td>TOTAL</td>
                  <td className="rv-right">{fmt(totals?.inflow)}</td>
                  <td className="rv-right">{fmt(totals?.outflow)}</td>
                  <td className="rv-right">{fmt(totals?.net)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <KpiFooter items={[
        { label: 'Total Inflow',  value: fmt(totals?.inflow),  variant: 'green' },
        { label: 'Total Outflow', value: fmt(totals?.outflow), variant: 'red' },
        { label: 'Net Cash Flow', value: fmt(totals?.net),     variant: (totals?.net || 0) >= 0 ? 'green' : 'red' },
      ]} />
    </div>
  );
};

// ─── Tax ──────────────────────────────────────────────────────────────────────

const TaxReport = ({ data }) => {
  const { period, netProfit, totalRevenue, totalExpenses, incomeTax, gst, totalTaxLiability } = data;
  return (
    <div className="rv-doc">
      <DocHeader title="Tax Summary" period={periodText(period)} />
      <div className="rv-body">
        <SecHead label="INCOME TAX COMPUTATION" color="#f59e0b" />
        <table className="rv-table rv-tax-table">
          <thead><tr><th>Component</th><th className="rv-right">Rate</th><th className="rv-right">Amount</th></tr></thead>
          <tbody>
            <tr className="rv-row"><td className="rv-row-name">Net Profit (PBT)</td><td className="rv-right">—</td><td className="rv-right rv-bold">{fmt(netProfit)}</td></tr>
            <tr className="rv-row rv-row-alt"><td className="rv-row-name">Corporate Tax</td><td className="rv-right">{incomeTax?.rate}</td><td className="rv-right">{fmt(incomeTax?.baseTax)}</td></tr>
            <tr className="rv-row"><td className="rv-row-name">Surcharge</td><td className="rv-right">{incomeTax?.surchargeRate}</td><td className="rv-right">{fmt(incomeTax?.surcharge)}</td></tr>
            <tr className="rv-row rv-row-alt"><td className="rv-row-name">H&amp;E Cess</td><td className="rv-right">{incomeTax?.cessRate}</td><td className="rv-right">{fmt(incomeTax?.cess)}</td></tr>
          </tbody>
          <tfoot>
            <tr className="rv-subtotal" style={{ '--sub-color': '#f59e0b' }}>
              <td>Total Income Tax</td><td />
              <td className="rv-right">{fmt(incomeTax?.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="rv-spacer" />

        <SecHead label="GST LIABILITY" color="#f97316" />
        <table className="rv-table rv-tax-table">
          <thead><tr><th>Component</th><th className="rv-right">Rate</th><th className="rv-right">Amount</th></tr></thead>
          <tbody>
            <tr className="rv-row"><td className="rv-row-name">Output GST (on Revenue)</td><td className="rv-right">18%</td><td className="rv-right rv-red">{fmt(gst?.outputGST)}</td></tr>
            <tr className="rv-row rv-row-alt"><td className="rv-row-name">Input GST Credit (on Expenses)</td><td className="rv-right">18%</td><td className="rv-right rv-green">({fmt(gst?.inputGSTCredit)})</td></tr>
          </tbody>
          <tfoot>
            <tr className="rv-subtotal" style={{ '--sub-color': '#f97316' }}>
              <td>Net GST Payable</td><td />
              <td className="rv-right">{fmt(gst?.netPayable)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <KpiFooter items={[
        { label: 'Total Revenue',      value: fmt(totalRevenue),         variant: 'blue' },
        { label: 'Net Profit',         value: fmt(netProfit),            variant: netProfit >= 0 ? 'green' : 'red' },
        { label: 'Total Income Tax',   value: fmt(incomeTax?.total),     variant: 'amber' },
        { label: 'Net GST Payable',    value: fmt(gst?.netPayable),      variant: 'amber' },
        { label: 'Total Tax Liability',value: fmt(totalTaxLiability),    variant: 'red' },
      ]} />
    </div>
  );
};

// ─── GST ──────────────────────────────────────────────────────────────────────

const GSTReport = ({ data }) => {
  const { period, gstRate, summary, months = [] } = data;
  return (
    <div className="rv-doc">
      <DocHeader title="GST Report" sub={`Standard Rate: ${gstRate}`} period={periodText(period)} />
      <div className="rv-body">
        <SecHead label="GSTR-3B SUMMARY" color="#7c3aed" />
        <table className="rv-table rv-tax-table">
          <thead><tr><th>Component</th><th className="rv-right">CGST</th><th className="rv-right">SGST</th><th className="rv-right">Total</th></tr></thead>
          <tbody>
            <tr className="rv-row">
              <td className="rv-row-name">Output GST (Sales)</td>
              <td className="rv-right">{fmt(summary?.cgstOut)}</td>
              <td className="rv-right">{fmt(summary?.sgstOut)}</td>
              <td className="rv-right rv-bold rv-red">{fmt(summary?.outputGST)}</td>
            </tr>
            <tr className="rv-row rv-row-alt">
              <td className="rv-row-name">Input GST Credit (Purchases)</td>
              <td className="rv-right">({fmt(summary?.cgstIn)})</td>
              <td className="rv-right">({fmt(summary?.sgstIn)})</td>
              <td className="rv-right rv-bold rv-green">({fmt(summary?.inputGST)})</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="rv-subtotal" style={{ '--sub-color': '#7c3aed' }}>
              <td>Net GST Payable</td>
              <td className="rv-right">{fmt((summary?.netPayable || 0) / 2)}</td>
              <td className="rv-right">{fmt((summary?.netPayable || 0) / 2)}</td>
              <td className="rv-right">{fmt(summary?.netPayable)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="rv-spacer" />

        <SecHead label="MONTHLY GST BREAKDOWN" color="#06b6d4" />
        {months.length === 0 ? <EmptyData /> : (
          <table className="rv-table rv-cf-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="rv-right">Output GST</th>
                <th className="rv-right">Input GST</th>
                <th className="rv-right">Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={i} className={`rv-row ${i % 2 === 1 ? 'rv-row-alt' : ''}`}>
                  <td className="rv-row-name">{m.label}</td>
                  <td className="rv-right rv-red">{fmt(m.output)}</td>
                  <td className="rv-right rv-green">({fmt(m.input)})</td>
                  <td className={`rv-right rv-bold ${m.net > 0 ? 'rv-red' : 'rv-green'}`}>{fmt(m.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="rv-subtotal" style={{ '--sub-color': '#06b6d4' }}>
                <td>TOTAL</td>
                <td className="rv-right">{fmt(months.reduce((s,m)=>s+m.output,0))}</td>
                <td className="rv-right">{fmt(months.reduce((s,m)=>s+m.input,0))}</td>
                <td className="rv-right">{fmt(months.reduce((s,m)=>s+m.net,0))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <KpiFooter items={[
        { label: 'Output GST',  value: fmt(summary?.outputGST),  variant: 'red' },
        { label: 'Input Credit',value: fmt(summary?.inputGST),   variant: 'green' },
        { label: 'Net Payable', value: fmt(summary?.netPayable),  variant: summary?.netPayable > 0 ? 'amber' : 'green' },
      ]} />
    </div>
  );
};

// ─── Router ───────────────────────────────────────────────────────────────────

const ReportViewer = ({ reportKey, data }) => {
  if (!data) return null;
  if (data.error) return <div className="rv-error">Error: {data.error}</div>;

  switch (reportKey) {
    case 'pnl':           return <PnLReport data={data} />;
    case 'balance-sheet': return <BalanceSheetReport data={data} />;
    case 'cash-flow':     return <CashFlowReport data={data} />;
    case 'tax':           return <TaxReport data={data} />;
    case 'gst':           return <GSTReport data={data} />;
    default:              return null;
  }
};

export default ReportViewer;
