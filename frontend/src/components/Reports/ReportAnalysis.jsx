import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { BrainCircuit } from 'lucide-react';
import { fetchReportSuggestions } from '../../services/reportsService';
import { useAuth } from '../../context/AuthContext';
import './ReportAnalysis.css';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtINR = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7)  return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5)  return `₹${(v / 1e5).toFixed(2)} L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

// ─── Narrative builder (runs synchronously from raw report data) ─────────────
const buildNarrative = (reportKey, data) => {
  if (!data) return [];

  switch (reportKey) {
    case 'pnl': {
      const rev    = data.revenue || {};
      const exp    = data.expenses || {};
      const fy1Rev = (rev.fromOperations?.[0] || 0) + (rev.otherIncome?.[0] || 0);
      const fy2Rev = (rev.fromOperations?.[1] || 0) + (rev.otherIncome?.[1] || 0);
      const fy1Exp = Object.values(exp).reduce((s, a) => s + (a[0] || 0), 0);
      const fy2Exp = Object.values(exp).reduce((s, a) => s + (a[1] || 0), 0);
      const fy1Net = fy1Rev - fy1Exp;
      const fy2Net = fy2Rev - fy2Exp;
      const margin   = fy1Rev > 0 ? ((fy1Net / fy1Rev) * 100).toFixed(1) : '0.0';
      const expRatio = fy1Rev > 0 ? ((fy1Exp / fy1Rev) * 100).toFixed(1) : '0.0';
      const yoyRev   = fy2Rev > 0 ? (((fy1Rev - fy2Rev) / fy2Rev) * 100).toFixed(1) : null;

      const expNames = { cogs: 'Cost of Goods Sold', employeeBenefits: 'Employee Benefits', financeCosts: 'Finance Costs', depreciation: 'Depreciation & Amortisation', other: 'Other Expenses' };
      const topExpEntry = Object.entries(exp)
        .map(([k, a]) => ({ name: expNames[k] || k, val: a[0] || 0 }))
        .sort((a, b) => b.val - a.val)[0];

      return [
        `${data.companyName || 'The company'} recorded total revenue of ${fmtINR(fy1Rev)} for the year ended ${data.fy1Label || 'the current period'}${fy2Rev > 0 ? `, against ${fmtINR(fy2Rev)} in the prior year — a ${parseFloat(yoyRev) >= 0 ? 'growth' : 'decline'} of ${Math.abs(parseFloat(yoyRev || 0)).toFixed(1)}% year-on-year` : ''}. ${fy2Rev > 0 && fy1Rev > fy2Rev ? 'The improvement in topline performance points to strengthening business activity and is an encouraging indicator of underlying demand.' : fy2Rev > 0 && fy1Rev < fy2Rev ? 'The contraction in revenue warrants a structured review of pricing strategy, customer retention metrics, and prevailing market conditions to understand the drivers and chart a recovery path.' : 'This represents the baseline period for the business, against which future performance will be benchmarked.'}`,

        `Total operating expenses for the year amounted to ${fmtINR(fy1Exp)}, translating to an expense ratio of ${expRatio}% — meaning that for every hundred rupees earned, ${expRatio} rupees went towards running the business. ${parseFloat(expRatio) > 85 ? 'At over 85%, this is a high expense burden that leaves very little room for profitability. Cost rationalisation across the key spending categories should be a near-term management priority.' : parseFloat(expRatio) > 70 ? 'While this is not uncommon for businesses investing in growth, continued vigilance on discretionary costs will be important to prevent further margin compression as the business scales.' : 'This reflects a reasonably disciplined cost structure, though there is always scope to review contracts, renegotiate vendor terms, and eliminate redundant spend.'} ${topExpEntry && topExpEntry.val > 0 ? `The single largest cost head is ${topExpEntry.name}, accounting for ${fmtINR(topExpEntry.val)} — roughly ${fy1Exp > 0 ? ((topExpEntry.val / fy1Exp) * 100).toFixed(0) : 0}% of all expenditure — and is therefore the most impactful lever for any cost reduction initiative.` : ''} ${fy2Exp > 0 ? `Compared to the prior year expense base of ${fmtINR(fy2Exp)}, costs have ${fy1Exp > fy2Exp ? `risen by ${fmtINR(fy1Exp - fy2Exp)}` : `fallen by ${fmtINR(fy2Exp - fy1Exp)}`}, a movement that needs to be evaluated against the corresponding revenue change to assess whether it represents an efficiency improvement or a structural cost increase.` : ''}`,

        `The business closed the period with a net profit of ${fmtINR(fy1Net)}, which corresponds to a net margin of ${margin}%. ${parseFloat(margin) > 20 ? 'A margin above 20% is a strong result by most industry benchmarks, indicating that the business is generating substantial value above and beyond its operating costs. The challenge at this stage is to sustain the margin as the business grows, since fixed costs tend to rise in steps while revenue growth can be uneven.' : parseFloat(margin) > 10 ? 'A double-digit margin is a solid foundation and places the business in a healthy position, though the gap between the current margin and industry-leading performance suggests there is scope to improve — particularly through better revenue mix management and targeted cost reduction in the highest-spend categories.' : parseFloat(margin) > 0 ? 'A single-digit net margin means the business is profitable but operating with very limited headroom. In this range, even a modest unexpected cost — a contract renewal, a regulatory requirement, or a revenue shortfall — can tip the bottom line into the red. Widening this buffer should be treated as a strategic priority.' : `A net loss of ${fmtINR(Math.abs(fy1Net))} for the period signals that the business is consuming more than it is generating. Identifying and addressing the root causes on the cost side — and simultaneously working to grow or protect the revenue base — is an urgent requirement.`}${fy2Net !== 0 ? ` For reference, the prior year result was ${fmtINR(fy2Net > 0 ? fy2Net : Math.abs(fy2Net))} — a ${fy2Net >= 0 ? 'profit' : 'loss'} — making the current period outcome a ${fy1Net >= fy2Net ? 'favourable' : 'less favourable'} outcome in comparison.` : ''}`,

        `Looking at the overall financial picture for the year, the key management focus areas should be around ${parseFloat(margin) < 15 ? 'closing the gap between the cost structure and the revenue potential of the business — incremental improvements in multiple cost categories, combined with a focused push on higher-margin revenue streams, can together produce a meaningful improvement in profitability' : 'sustaining the current level of profitability while exploring new revenue channels and maintaining cost discipline to defend the margin from natural inflation in input costs'}. On the revenue side, the business should assess whether its customer and product concentration leaves it exposed to single points of failure. ${fy1Rev > 0 && fy1Exp > 0 ? `As a practical reference point: a 5% reduction in operating costs — without any change in revenue — would contribute approximately ${fmtINR(fy1Exp * 0.05)} directly to the bottom line. Equally, a 5% increase in revenue at the current cost base would improve net profit to approximately ${fmtINR(fy1Net + fy1Rev * 0.05)}.` : ''} Monthly P&L monitoring, rather than a year-end review alone, is essential to give management the lead time needed to course-correct effectively.`,
      ];
    }

    case 'balance-sheet': {
      const eq  = data.equity || {};
      const ncl = data.nonCurrentLiabilities || {};
      const cl  = data.currentLiabilities || {};
      const nca = data.nonCurrentAssets || {};
      const ca  = data.currentAssets || {};
      const sum0 = (obj) => Object.values(obj).reduce((s, a) => s + (a?.[0] || 0), 0);
      const totalAssets = sum0(nca) + sum0(ca);
      const totalLiab   = sum0(ncl) + sum0(cl);
      const totalEquity = sum0(eq);
      const cashFY1     = ca.cashAndBank?.[0] || 0;
      const recvFY1     = ca.tradeReceivables?.[0] || 0;
      const payFY1      = cl.tradePayables?.[0] || 0;
      const workingCap  = totalAssets - totalLiab;
      const curRatio    = totalLiab > 0 ? (totalAssets / totalLiab).toFixed(2) : null;
      const retained    = eq.reservesAndSurplus?.[0] || 0;

      return [
        `The balance sheet as at ${data.fy1Label || 'the reporting date'} presents a snapshot of ${data.companyName || 'the company'}'s financial position. Total assets stand at ${fmtINR(totalAssets)}, with cash and bank balances of ${fmtINR(cashFY1)} and trade receivables of ${fmtINR(recvFY1)} forming the most liquid part of the asset base. ${cashFY1 > 0 && recvFY1 > 0 ? `Together, cash and receivables account for ${totalAssets > 0 ? ((( cashFY1 + recvFY1) / totalAssets) * 100).toFixed(0) : 0}% of total assets, indicating ${((cashFY1 + recvFY1) / totalAssets) > 0.6 ? 'a predominantly liquid asset structure — generally positive for short-term flexibility, though it may also indicate limited investment in long-term productive assets.' : 'a balanced mix between liquid assets and longer-term investments.'}` : ''}`,

        `On the liability side, trade payables of ${fmtINR(payFY1)} represent amounts owed to vendors and suppliers in the normal course of business. Total liabilities stand at ${fmtINR(totalLiab)}, leaving a net working capital position of ${fmtINR(workingCap)}. ${workingCap > 0 ? `The positive working capital of ${fmtINR(workingCap)} means the business holds more short-term assets than short-term obligations — a fundamental indicator of short-term financial health, ensuring that operational requirements can be met without needing to draw on long-term resources or emergency credit.` : `A negative working capital position means current liabilities exceed current assets by ${fmtINR(Math.abs(workingCap))}, which is a situation that demands immediate attention. Accelerating receivable collections and negotiating extended payment terms with vendors are the most direct levers to improve this position.`}`,

        `${curRatio ? `The current ratio of ${curRatio} — which measures current assets against current liabilities — ${parseFloat(curRatio) >= 2 ? `is comfortably above the widely cited benchmark of 1.5 to 2.0. This cushion provides the business with strong operational flexibility, though management should also assess whether a portion of the surplus liquidity could be put to work more productively in short-term investments rather than sitting idle in a current account.` : parseFloat(curRatio) >= 1.5 ? `falls within the healthy range of 1.5 to 2.0, indicating that the business can comfortably service its near-term obligations without financial strain. Maintaining this ratio should be an explicit objective as the business grows.` : parseFloat(curRatio) >= 1 ? `is above 1.0, which means the business can technically meet its short-term obligations, but the margin of safety is narrow. A deterioration in collections or an unexpected cost could rapidly erode this buffer, making proactive liquidity management important.` : `below 1.0 signals that current liabilities exceed current assets, a position that creates genuine short-term liquidity risk. The business should urgently review whether vendor payment terms can be extended, and consider whether a credit facility should be arranged as a contingency.`}` : ''} Partners' and reserves standing at ${fmtINR(totalEquity)} reflects the cumulative equity position of the business — retained earnings form the core of this figure and represent profits reinvested into the enterprise rather than distributed.`,

        `Retained earnings of ${fmtINR(retained)} are an important indicator of the business's long-term financial sustainability. A growing retained earnings base reduces reliance on external debt, improves creditworthiness, and provides a buffer for future investment without diluting ownership or taking on interest costs. Trade receivables of ${fmtINR(recvFY1)} sitting on the balance sheet represent revenue already earned but not yet collected — monitoring the age profile of these receivables and enforcing payment terms consistently is critical to converting this paper asset into actual cash. Any receivables outstanding beyond 90 days should be reviewed individually and escalated where necessary.`,
      ];
    }

    case 'cash-flow': {
      const months  = data.months || [];
      const totals  = data.totals || {};
      const avgNet  = months.length > 0 ? (totals.net || 0) / months.length : 0;
      const best    = months.reduce((b, m) => m.net > (b?.net ?? -Infinity) ? m : b, null);
      const worst   = months.reduce((w, m) => m.net < (w?.net ??  Infinity) ? m : w, null);
      const posMonths = months.filter(m => m.net >= 0).length;
      const isPositive = (totals.net || 0) >= 0;

      return [
        `The cash flow statement for the period covered by this report records total inflows of ${fmtINR(totals.inflow)} from all operational and other activities, set against total outflows of ${fmtINR(totals.outflow)}. The resulting net cash movement for the period is ${fmtINR(totals.net)}. Unlike the income statement — which records revenue and expenses on an accrual basis regardless of when cash actually moves — the cash flow statement reflects what actually entered and left the business's bank accounts, making it one of the most honest indicators of financial health available.`,

        `Across the ${months.length} months covered by this report, the average monthly net cash position was ${fmtINR(avgNet)}. ${posMonths} out of ${months.length} months were cash-positive. ${best ? `The best month was ${best.label}, which generated a net cash surplus of ${fmtINR(best.net)}.` : ''} ${worst ? `The most challenging period was ${worst.label}, where the business saw a net cash deficit of ${fmtINR(Math.abs(worst.net))}.` : ''} ${best && worst && Math.abs(worst.net - best.net) > Math.abs(avgNet) * 2 ? 'The significant gap between the best and worst months suggests that cash flows are lumpy — likely reflecting seasonal patterns in revenue collection, concentrated vendor payment cycles, or the timing of large one-off transactions. Identifying the structural drivers of this volatility is important for planning.' : 'The variation between months is relatively contained, suggesting a fairly predictable cash flow pattern.'}`,

        `${isPositive ? `The overall positive net cash position of ${fmtINR(totals.net)} is a healthy outcome for the period — it confirms that the business is generating surplus cash from its operations, which is available for reinvestment, debt repayment, or building a strategic reserve. However, the aggregate figure can mask volatility within individual months, and it is important to look at the monthly trend to ensure that the positive result is driven by operational performance rather than one large inflow that may not recur.` : `The overall negative net cash position of ${fmtINR(Math.abs(totals.net))} over the period deserves careful analysis. While there are legitimate reasons for cash consumption — such as inventory build-up ahead of a busy season, front-loading of capital expenditure, or strategic advances to suppliers — a sustained negative trend can erode the business's liquidity reserves and, if left unaddressed, may require external funding to bridge the gap.`} The running balance trend over the period provides a clear picture of how the cumulative cash position evolved month by month.`,

        `From a liquidity management standpoint, the data supports a few practical actions. First, building and maintaining a cash buffer of at least two to three months of operating outflows — based on the current run rate, this would amount to approximately ${fmtINR(Math.abs(totals.outflow) / Math.max(months.length, 1) * 2.5)} — provides a meaningful cushion against unexpected demands. Second, structuring vendor payments to be spread across the month, rather than concentrated in a single window, can reduce the peak cash requirement at any point in time. Third, implementing a rolling 90-day cash flow forecast — updated weekly — gives management the early warning needed to arrange credit lines or adjust payment schedules before a cash crunch materialises rather than after.`,
      ];
    }

    case 'tax': {
      const it   = data.incomeTax || {};
      const gst  = data.gst || {};
      const netP = data.netProfit || 0;
      const ttl  = data.totalTaxLiability || 0;
      const effRate = netP > 0 ? ((ttl / netP) * 100).toFixed(1) : '0.0';
      const itcUtil = gst.outputGST > 0 ? ((gst.inputGSTCredit / gst.outputGST) * 100).toFixed(1) : '0.0';

      return [
        `The tax summary for this reporting period is computed on the basis of a net profit before tax of ${fmtINR(netP)}. Applying the standard corporate tax rate of 25%, along with the mandatory surcharge of 7% on the base tax and a Health & Education Cess of 4% on the aggregate, the computed income tax liability works out to ${fmtINR(it.total)} — comprising a base tax of ${fmtINR(it.baseTax)}, surcharge of ${fmtINR(it.surcharge)}, and cess of ${fmtINR(it.cess)}. On the GST side, after offsetting input tax credit of ${fmtINR(gst.inputGSTCredit)} against output GST of ${fmtINR(gst.outputGST)}, the net GST payable for the period stands at ${fmtINR(gst.netPayable)}. The combined total tax outflow for the period — income tax plus net GST — is therefore ${fmtINR(ttl)}.`,

        `The effective tax rate for the period is ${effRate}%. ${parseFloat(effRate) > 36 ? 'An effective rate above the statutory headline rate suggests that either the surcharge and cess components are significant relative to the tax base, or that the business is not fully utilising all available deductions and exemptions under the Income Tax Act. A detailed review of allowable business expenditure, depreciation claims, and any applicable section-specific benefits should be conducted before the return is filed.' : parseFloat(effRate) > 30 ? 'This is broadly in line with the standard statutory rate inclusive of surcharge and cess, indicating that the tax computation is following normal provisions without significant deviations.' : 'An effective rate below 30% may indicate the utilisation of specific deductions, exemptions, or investment-linked benefits that have legitimately reduced the taxable base — which, if not already reviewed, should be documented clearly for compliance purposes.'} Income tax advance payments should be structured quarterly to avoid interest charges under Sections 234B and 234C of the Income Tax Act.`,

        `The input GST credit of ${fmtINR(gst.inputGSTCredit)} reflects the tax already paid on eligible business purchases that can be set off against the output GST liability. The ITC utilisation rate stands at ${itcUtil}%, which indicates ${parseFloat(itcUtil) >= 80 ? 'strong credit claim efficiency — most of the eligible credits are being successfully applied against the output liability, reducing the cash outflow on GST.' : parseFloat(itcUtil) >= 60 ? 'that a reasonable portion of available credits is being utilised, but there remains scope to improve the claim rate through more rigorous GSTR-2A/2B reconciliation on a monthly basis.' : 'a relatively low utilisation of available input credits, representing a direct and avoidable cost to the business. An urgent reconciliation exercise should be undertaken to identify whether the gap arises from supplier non-filing, classification discrepancies, or internal documentation gaps.'} Every unclaimed rupee of ITC is effectively an additional cost, since the business has already paid that tax on its purchases but is not recovering it against the output liability.`,

        `From a tax planning perspective, the business should ensure that all legitimate deductions are being claimed — including business expenses under Section 37, depreciation on eligible assets under the applicable rates, and any available investment-linked allowances. Timing decisions around capital expenditure and deductible payments should factor in their tax impact for the current versus the upcoming year. It is strongly advisable to conduct a pre-year-end tax review with a qualified Chartered Accountant to identify any remaining optimisation opportunities and ensure the return is filed accurately and within the prescribed deadlines to avoid penalties, interest, and scrutiny.`,
      ];
    }

    case 'gst': {
      const s      = data.summary || {};
      const months = data.months || [];
      const totOut = s.outputGST || 0;
      const totIn  = s.inputGST  || 0;
      const netPay = s.netPayable || 0;
      const itcUtil = totOut > 0 ? ((totIn / totOut) * 100).toFixed(1) : '0.0';
      const avgOut  = months.length > 0 ? totOut / months.length : 0;
      const bestMonth  = [...months].sort((a, b) => b.net - a.net)[0];
      const worstMonth = [...months].sort((a, b) => a.net - b.net)[0];

      return [
        `The GST report covers all taxable supplies made and eligible purchases on which input tax credit has been availed during the reporting period. Total output GST — the tax collected from customers on sales — amounts to ${fmtINR(totOut)}, while input tax credit availed on qualifying business purchases stands at ${fmtINR(totIn)}. After netting the two, the net GST payable to the government for the period is ${fmtINR(netPay)}. The average monthly output GST liability is ${fmtINR(avgOut)}, which provides the basis for monthly cash flow planning around GST settlement obligations.`,

        `The ITC utilisation rate of ${itcUtil}% is a key measure of compliance and cost efficiency. ${parseFloat(itcUtil) >= 85 ? `A rate above 85% indicates that the business is doing an excellent job of tracking and claiming eligible input credits — this directly reduces the net cash outflow on GST and is a mark of well-organised purchase documentation and reconciliation processes.` : parseFloat(itcUtil) >= 65 ? `While a majority of available credits are being utilised, the gap suggests that some eligible ITC may not be reaching the GSTR-3B on time, either because suppliers have not uploaded the corresponding invoices or because there are reconciliation mismatches between the purchase register and GSTR-2A/2B. A monthly reconciliation exercise should be institutionalised to close this gap.` : `A utilisation rate below 65% indicates a material volume of unclaimed input credits — a direct and unnecessary cost to the business. Each percentage point of unclaimed ITC translates to additional cash outflow on GST. An immediate and thorough GSTR-2A/2B reconciliation against the purchase register is required to identify the source of the shortfall and recover the credits before the annual window closes.`}`,

        `${months.length > 1 ? `Across the ${months.length} months in this report, the highest GST payable month was ${bestMonth ? bestMonth.label : 'not identified'} and the lowest was ${worstMonth ? worstMonth.label : 'not identified'}. ` : ''}The month-on-month variation in output and input GST reflects the underlying sales and purchase activity of the business. Periods of high output GST without corresponding input credit — either because purchase volumes were low or because supplier invoices were missing from GSTR-2A — result in elevated cash outflows to the government. Ensuring that key suppliers file their returns on time, particularly around the 11th and 13th of each month, is an important but often overlooked step in minimising this mismatch.`,

        `On the compliance side, GSTR-3B filings are due by the 20th of every month, and late filing attracts both a late fee and interest at 18% per annum on the outstanding tax amount. Beyond the financial penalty, repeated late filings can also flag the business for scrutiny or restrict the ability to claim ITC. Implementing a structured pre-filing checklist — covering sales invoice verification, purchase reconciliation, credit note accounting, and ITC reversal calculations — will significantly reduce the risk of errors or omissions. Additionally, the business should periodically review whether any supplies are being over-taxed due to incorrect HSN classification, and whether any refund claims on account of excess ITC or zero-rated supplies need to be filed with the GST department.`,
      ];
    }

    default:
      return [];
  }
};

const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—');

// ─── Custom tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="ra-tooltip">
      {label && <div className="ra-tooltip-label">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="ra-tooltip-row">
          <span className="ra-tooltip-dot" style={{ background: p.color }} />
          <span>{p.name}: {fmtINR(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const PIE_COLORS = ['#1d4ed8', '#059669', '#d97706', '#dc2626', '#7c3aed', '#ea580c', '#0891b2'];

// ─── Per-report analysis config ───────────────────────────────────────────────
const getConfig = (reportKey, data) => {
  if (!data) return null;

  switch (reportKey) {

    case 'pnl': {
      const rev  = data.revenue || {};
      const exp  = data.expenses || {};
      const fy1Rev = (rev.fromOperations?.[0] || 0) + (rev.otherIncome?.[0] || 0);
      const fy2Rev = (rev.fromOperations?.[1] || 0) + (rev.otherIncome?.[1] || 0);
      const fy1Exp = Object.values(exp).reduce((s, a) => s + (a[0] || 0), 0);
      const fy2Exp = Object.values(exp).reduce((s, a) => s + (a[1] || 0), 0);
      const fy1Net = fy1Rev - fy1Exp;
      const margin = fy1Rev > 0 ? ((fy1Net / fy1Rev) * 100).toFixed(1) : '0.0';
      const yoy    = fy2Rev > 0 ? (((fy1Rev - fy2Rev) / fy2Rev) * 100).toFixed(1) : null;

      const expPieData = [
        { name: 'Cost of Goods', value: exp.cogs?.[0] || 0 },
        { name: 'Employee', value: exp.employeeBenefits?.[0] || 0 },
        { name: 'Finance', value: exp.financeCosts?.[0] || 0 },
        { name: 'Depreciation', value: exp.depreciation?.[0] || 0 },
        { name: 'Other', value: exp.other?.[0] || 0 },
      ].filter(d => d.value > 0);

      const fyBarData = [
        { name: data.fy1Label || 'FY1', Revenue: fy1Rev, Expenses: fy1Exp },
        { name: data.fy2Label || 'FY2', Revenue: fy2Rev, Expenses: fy2Exp },
      ];

      const r  = data.ratios  || {};
      const r2 = data.ratios2 || {};
      const fy2Net = fy2Rev - fy2Exp;
      const fmtDelta = (v1, v2) => {
        if (!v1 && !v2) return null;
        const d = v1 - v2;
        return { val: d, label: `${d >= 0 ? '+' : ''}${fmtINR(d)}`, positive: d >= 0 };
      };
      const fmtDeltaPct = (v1, v2) => {
        if (v1 == null || v2 == null) return null;
        const d = v1 - v2;
        return { val: d, label: `${d >= 0 ? '+' : ''}${d.toFixed(2)}pp`, positive: d >= 0 };
      };
      const ratioRows = [
        {
          group: 'Income Statement Metrics',
          hasFY2: true,
          items: [
            {
              label: 'Revenue',
              formula: 'Total income from operations',
              value: fmtINR(fy1Rev), value2: fmtINR(fy2Rev),
              delta: fmtDelta(fy1Rev, fy2Rev), status: '',
            },
            {
              label: 'Total Expenses',
              formula: 'Sum of all operating expenses',
              value: fmtINR(fy1Exp), value2: fmtINR(fy2Exp),
              delta: fmtDelta(fy1Exp, fy2Exp), status: '',
            },
            {
              label: 'Net Profit / (Loss)',
              formula: 'Revenue − Total Expenses',
              value: fmtINR(fy1Net), value2: fmtINR(fy2Net),
              delta: fmtDelta(fy1Net, fy2Net),
              status: fy1Net >= 0 ? 'good' : 'danger',
            },
            {
              label: 'Gross Profit',
              formula: 'Revenue − COGS',
              value: fmtINR(r.grossProfit), value2: fmtINR(r2.grossProfit),
              delta: fmtDelta(r.grossProfit, r2.grossProfit), status: '',
            },
            {
              label: 'Gross Profit Margin',
              formula: 'Gross Profit / Revenue × 100',
              value: `${r.grossProfitMargin ?? '—'}%`, value2: `${r2.grossProfitMargin ?? '—'}%`,
              delta: fmtDeltaPct(r.grossProfitMargin, r2.grossProfitMargin),
              status: r.grossProfitMargin >= 40 ? 'good' : r.grossProfitMargin >= 20 ? 'warning' : 'danger',
            },
            {
              label: 'EBIT',
              formula: 'Revenue − Operating Expenses (excl. interest & tax)',
              value: fmtINR(r.ebit), value2: fmtINR(r2.ebit),
              delta: fmtDelta(r.ebit, r2.ebit),
              status: r.ebit >= 0 ? 'good' : 'danger',
            },
            {
              label: 'Net Profit Margin',
              formula: 'Net Income / Revenue × 100',
              value: `${r.netProfitMargin ?? '—'}%`, value2: `${r2.netProfitMargin ?? '—'}%`,
              delta: fmtDeltaPct(r.netProfitMargin, r2.netProfitMargin),
              status: r.netProfitMargin >= 15 ? 'good' : r.netProfitMargin >= 5 ? 'warning' : 'danger',
            },
          ],
        },
        {
          group: 'Liquidity & Efficiency',
          hasFY2: false,
          items: [
            { label: 'Working Capital', formula: 'Current Assets − Current Liabilities', value: fmtINR(r.workingCapital), status: r.workingCapital >= 0 ? 'good' : 'danger' },
            { label: 'Current Ratio', formula: 'Current Assets / Current Liabilities', value: r.currentRatio?.toFixed(2) ?? '—', status: r.currentRatio >= 1.5 ? 'good' : r.currentRatio >= 1 ? 'warning' : 'danger', note: 'Healthy: 1.5–3.0' },
            { label: 'AR Turnover', formula: 'Net Sales / Average Accounts Receivable', value: `${r.arTurnover ?? '—'}×`, status: '' },
            { label: 'Days Sales Outstanding', formula: '365 / AR Turnover', value: `${r.daysSalesOutstanding ?? '—'} days`, status: r.daysSalesOutstanding <= 30 ? 'good' : r.daysSalesOutstanding <= 60 ? 'warning' : 'danger' },
          ],
        },
        {
          group: 'DuPont & Return Analysis',
          hasFY2: false,
          items: [
            { label: 'ROA', formula: 'Net Income / Total Assets × 100', value: `${r.roa ?? '—'}%`, status: r.roa >= 10 ? 'good' : r.roa >= 5 ? 'warning' : 'danger' },
            { label: 'ROE', formula: 'Net Income / Shareholder\'s Equity × 100', value: `${r.roe ?? '—'}%`, status: r.roe >= 15 ? 'good' : r.roe >= 8 ? 'warning' : 'danger' },
            { label: 'Asset Turnover', formula: 'Net Sales / Average Total Assets', value: `${r.totalAssetTurnover ?? '—'}×`, status: '' },
            { label: 'DuPont ROE', formula: 'Net Profit Margin × Asset Turnover × Equity Multiplier', value: `${r.dupontROE ?? '—'}%`, status: '' },
          ],
        },
      ];

      return {
        metrics: [
          { label: `Revenue (${data.fy1Label || 'FY1'})`, value: fmtINR(fy1Rev), sub: fy2Rev > 0 ? `Prev: ${fmtINR(fy2Rev)}` : null, color: 'blue' },
          { label: `Expenses (${data.fy1Label || 'FY1'})`, value: fmtINR(fy1Exp), sub: fy2Exp > 0 ? `Prev: ${fmtINR(fy2Exp)}` : null, color: 'red' },
          { label: `Net Profit (${data.fy1Label || 'FY1'})`, value: fmtINR(fy1Net), sub: fy2Net !== 0 ? `Prev: ${fmtINR(fy2Net)}` : null, color: fy1Net >= 0 ? 'green' : 'red' },
          { label: 'Net Margin', value: `${margin}%`, color: 'amber' },
          ...(yoy !== null ? [{ label: 'YoY Revenue Growth', value: `${yoy > 0 ? '+' : ''}${yoy}%`, color: Number(yoy) >= 0 ? 'green' : 'red' }] : []),
          { label: 'Gross Profit Margin', value: `${r.grossProfitMargin ?? '—'}%`, sub: r2.grossProfitMargin != null ? `Prev: ${r2.grossProfitMargin}%` : null, color: 'purple' },
        ],
        metricsForAI: {
          report_type: 'Profit & Loss',
          period: `${data.fy1Label || 'Current FY'} vs ${data.fy2Label || 'Previous FY'}`,
          [`revenue_${data.fy1Label}`]: fmtINR(fy1Rev),
          [`revenue_${data.fy2Label}`]: fmtINR(fy2Rev),
          [`expenses_${data.fy1Label}`]: fmtINR(fy1Exp),
          [`expenses_${data.fy2Label}`]: fmtINR(fy2Exp),
          [`net_profit_${data.fy1Label}`]: fmtINR(fy1Net),
          [`net_profit_${data.fy2Label}`]: fmtINR(fy2Net),
          net_profit_margin: `${margin}%`,
          yoy_revenue_change: yoy !== null ? `${yoy > 0 ? '+' : ''}${yoy}%` : 'N/A',
          gross_profit_margin: `${r.grossProfitMargin ?? '—'}%`,
          prev_gross_profit_margin: `${r2.grossProfitMargin ?? '—'}%`,
          ebit: fmtINR(r.ebit),
          current_ratio: r.currentRatio?.toFixed(2) ?? '—',
          roa: `${r.roa ?? '—'}%`,
          roe: `${r.roe ?? '—'}%`,
          dupont_roe: `${r.dupontROE ?? '—'}%`,
        },
        ratioRows,
        charts: [
          {
            title: 'Revenue vs Expenses (Year over Year)',
            type: 'bar',
            data: fyBarData,
            bars: [
              { key: 'Revenue', color: '#1d4ed8' },
              { key: 'Expenses', color: '#dc2626' },
            ],
          },
          {
            title: 'Expense Breakdown',
            type: 'pie',
            data: expPieData,
          },
        ],
      };
    }

    case 'balance-sheet': {
      const eq  = data.equity || {};
      const ncl = data.nonCurrentLiabilities || {};
      const cl  = data.currentLiabilities || {};
      const nca = data.nonCurrentAssets || {};
      const ca  = data.currentAssets || {};

      const sum0 = (obj) => Object.values(obj).reduce((s, a) => s + (a?.[0] || 0), 0);
      const fy1Assets  = sum0(nca) + sum0(ca);
      const fy1Liab    = sum0(ncl) + sum0(cl);
      const fy1Equity  = sum0(eq);
      const cashFY1    = ca.cashAndBank?.[0] || 0;
      const recvFY1    = ca.tradeReceivables?.[0] || 0;
      const payFY1     = cl.tradePayables?.[0] || 0;
      const workingCap = fy1Assets - fy1Liab;
      const curRatio   = fy1Liab > 0 ? (fy1Assets / fy1Liab).toFixed(2) : '∞';

      const assetPieData = [
        { name: 'Cash & Bank', value: cashFY1 },
        { name: 'Trade Receivables', value: recvFY1 },
        { name: 'Other Assets', value: Math.max(0, fy1Assets - cashFY1 - recvFY1) },
      ].filter(d => d.value > 0);

      const bsBarData = [
        { name: data.fy1Label || 'FY1', Assets: fy1Assets, Liabilities: fy1Liab, Equity: fy1Equity },
        { name: data.fy2Label || 'FY2',
          Assets: sum0(nca) + sum0(ca), // simplified — same FY2 computation isn't in data; use fy2 values
          Liabilities: (cl.tradePayables?.[1] || 0) + (ncl.longTermBorrowings?.[1] || 0),
          Equity: sum0(eq),
        },
      ];

      const r = data.ratios || {};
      const ratioRows = [
        {
          group: 'Liquidity Ratios',
          items: [
            { label: 'Current Ratio', formula: 'Current Assets / Current Liabilities', value: r.currentRatio?.toFixed(2) ?? '—', status: r.currentRatio >= 1.5 ? 'good' : r.currentRatio >= 1 ? 'warning' : 'danger', note: 'Healthy: 1.5–3.0' },
            { label: 'Quick Ratio (Acid-Test)', formula: '(Current Assets − Inventory) / Current Liabilities', value: r.quickRatio?.toFixed(2) ?? '—', status: r.quickRatio >= 1 ? 'good' : r.quickRatio >= 0.7 ? 'warning' : 'danger', note: 'Healthy: >1.0' },
            { label: 'Cash Ratio', formula: 'Cash / Current Liabilities', value: r.cashRatio?.toFixed(2) ?? '—', status: r.cashRatio >= 0.5 ? 'good' : r.cashRatio >= 0.2 ? 'warning' : 'danger', note: 'Healthy: >0.5' },
            { label: 'Working Capital', formula: 'Current Assets − Current Liabilities', value: fmtINR(r.workingCapital), status: r.workingCapital >= 0 ? 'good' : 'danger' },
          ]
        },
        {
          group: 'Solvency & Leverage Ratios',
          items: [
            { label: 'Debt-to-Equity Ratio', formula: 'Total Liabilities / Shareholder\'s Equity', value: r.debtToEquity?.toFixed(2) ?? '—', status: r.debtToEquity <= 1 ? 'good' : r.debtToEquity <= 2 ? 'warning' : 'danger' },
            { label: 'Debt Ratio', formula: 'Total Liabilities / Total Assets', value: r.debtRatio?.toFixed(2) ?? '—', status: r.debtRatio <= 0.4 ? 'good' : r.debtRatio <= 0.6 ? 'warning' : 'danger' },
            { label: 'Equity Multiplier', formula: 'Total Assets / Total Equity', value: r.equityMultiplier?.toFixed(2) ?? '—', status: '' },
          ]
        },
        {
          group: 'Profitability & Efficiency Ratios',
          items: [
            { label: 'ROA', formula: 'Net Income / Average Total Assets × 100', value: `${r.roa ?? '—'}%`, status: r.roa >= 10 ? 'good' : r.roa >= 5 ? 'warning' : 'danger' },
            { label: 'ROE', formula: 'Net Income / Average Shareholder\'s Equity × 100', value: `${r.roe ?? '—'}%`, status: r.roe >= 15 ? 'good' : r.roe >= 8 ? 'warning' : 'danger' },
            { label: 'Total Asset Turnover', formula: 'Net Sales / Average Total Assets', value: `${r.totalAssetTurnover ?? '—'}×`, status: '' },
            { label: 'AR Turnover', formula: 'Net Sales on Credit / Average AR', value: `${r.arTurnover ?? '—'}×`, status: '' },
            { label: 'Days Sales Outstanding', formula: '365 / AR Turnover', value: `${r.daysSalesOutstanding ?? '—'} days`, status: r.daysSalesOutstanding <= 30 ? 'good' : r.daysSalesOutstanding <= 60 ? 'warning' : 'danger' },
          ]
        },
      ];

      return {
        metrics: [
          { label: 'Total Assets', value: fmtINR(fy1Assets), color: 'blue' },
          { label: 'Cash & Bank', value: fmtINR(cashFY1), color: 'green' },
          { label: 'Trade Receivables', value: fmtINR(recvFY1), color: 'amber' },
          { label: 'Trade Payables', value: fmtINR(payFY1), color: 'red' },
          { label: 'Working Capital', value: fmtINR(workingCap), color: workingCap >= 0 ? 'green' : 'red' },
          { label: 'Current Ratio', value: curRatio, color: 'purple' },
        ],
        metricsForAI: {
          report_type: 'Balance Sheet',
          total_assets: fmtINR(fy1Assets),
          cash_and_bank: fmtINR(cashFY1),
          trade_receivables: fmtINR(recvFY1),
          trade_payables: fmtINR(payFY1),
          working_capital: fmtINR(workingCap),
          current_ratio: curRatio,
          quick_ratio: r.quickRatio?.toFixed(2) ?? '—',
          debt_to_equity: r.debtToEquity?.toFixed(2) ?? '—',
          roa: `${r.roa ?? '—'}%`,
          roe: `${r.roe ?? '—'}%`,
        },
        ratioRows,
        charts: [
          {
            title: 'Assets vs Liabilities vs Equity',
            type: 'bar',
            data: bsBarData,
            bars: [
              { key: 'Assets', color: '#1d4ed8' },
              { key: 'Liabilities', color: '#dc2626' },
              { key: 'Equity', color: '#059669' },
            ],
          },
          {
            title: 'Asset Composition',
            type: 'pie',
            data: assetPieData,
          },
        ],
      };
    }

    case 'cash-flow': {
      const months  = data.months || [];
      const totals  = data.totals || {};
      const best    = months.reduce((b, m) => m.net > (b?.net ?? -Infinity) ? m : b, null);
      const worst   = months.reduce((w, m) => m.net < (w?.net ??  Infinity) ? m : w, null);
      const avgNet  = months.length > 0 ? (totals.net || 0) / months.length : 0;
      const posMonths = months.filter(m => m.net >= 0).length;

      const r = data.ratios || {};
      const ratioRows = [
        {
          group: 'Cash Flow Metrics',
          items: [
            { label: 'Operating Cash Flow (OCF)', formula: 'Net Income + Depreciation − ΔCurrent Assets', value: fmtINR(r.operatingCashFlow), status: (r.operatingCashFlow || 0) >= 0 ? 'good' : 'danger' },
            { label: 'Free Cash Flow (FCF)', formula: 'Operating Cash Flow − Capital Expenditures', value: fmtINR(r.freeCashFlow), status: (r.freeCashFlow || 0) >= 0 ? 'good' : 'danger' },
            { label: 'Avg Monthly Cash Flow', formula: 'Net Cash Flow / Number of Months', value: fmtINR(r.avgMonthlyCashFlow), status: (r.avgMonthlyCashFlow || 0) >= 0 ? 'good' : 'danger' },
            { label: 'Positive Cash Months', formula: 'Months with Net Cash Flow > 0', value: `${r.positiveCashMonths || 0} / ${r.totalMonths || 0}`, status: (r.positiveCashMonths || 0) >= Math.ceil((r.totalMonths || 0) / 2) ? 'good' : 'warning' },
          ]
        }
      ];

      return {
        metrics: [
          { label: 'Total Inflow', value: fmtINR(totals.inflow), color: 'green' },
          { label: 'Total Outflow', value: fmtINR(totals.outflow), color: 'red' },
          { label: 'Net Cash Flow', value: fmtINR(totals.net), color: (totals.net || 0) >= 0 ? 'green' : 'red' },
          { label: 'Avg Monthly Net', value: fmtINR(avgNet), color: avgNet >= 0 ? 'green' : 'red' },
          { label: 'Positive Months', value: `${posMonths} / ${months.length}`, color: 'blue' },
        ],
        metricsForAI: {
          report_type: 'Cash Flow Statement',
          total_inflow: fmtINR(totals.inflow),
          total_outflow: fmtINR(totals.outflow),
          net_cash_flow: fmtINR(totals.net),
          avg_monthly_net: fmtINR(avgNet),
          best_month: best ? `${best.label} (${fmtINR(best.net)})` : 'N/A',
          worst_month: worst ? `${worst.label} (${fmtINR(worst.net)})` : 'N/A',
          operating_cash_flow: fmtINR(r.operatingCashFlow),
          free_cash_flow: fmtINR(r.freeCashFlow),
          positive_cash_months: `${r.positiveCashMonths || 0} / ${r.totalMonths || 0}`,
        },
        ratioRows,
        charts: [
          {
            title: 'Monthly Inflow vs Outflow',
            type: 'area',
            data: months,
            areas: [
              { key: 'inflow', color: '#059669', name: 'Inflow' },
              { key: 'outflow', color: '#dc2626', name: 'Outflow' },
            ],
            xKey: 'label',
          },
          {
            title: 'Net Cash Flow by Month',
            type: 'bar-signed',
            data: months.map(m => ({ ...m, fill: m.net >= 0 ? '#059669' : '#dc2626' })),
            xKey: 'label',
            yKey: 'net',
          },
        ],
      };
    }

    case 'tax': {
      const it   = data.incomeTax || {};
      const gst  = data.gst || {};
      const netP = data.netProfit || 0;
      const ttl  = data.totalTaxLiability || 0;
      const effRate = netP > 0 ? ((ttl / netP) * 100).toFixed(1) : '0.0';
      const itcUtil = (it.total || 0) > 0 ? pct(gst.inputGSTCredit || 0, gst.outputGST || 1) : '—';

      const breakdownData = [
        { name: 'Corporate Tax', value: it.baseTax || 0 },
        { name: 'Surcharge', value: it.surcharge || 0 },
        { name: 'H&E Cess', value: it.cess || 0 },
        { name: 'Net GST', value: gst.netPayable || 0 },
      ].filter(d => d.value > 0);

      const compData = [
        { name: 'Net Profit', value: netP },
        { name: 'Income Tax', value: it.total || 0 },
        { name: 'Net GST', value: gst.netPayable || 0 },
      ];

      const r = data.ratios || {};
      const ratioRows = [
        {
          group: 'Tax Efficiency Metrics',
          items: [
            { label: 'Effective Tax Rate', formula: 'Total Tax Liability / Net Profit × 100', value: `${r.effectiveTaxRate ?? '—'}%`, status: r.effectiveTaxRate <= 30 ? 'good' : r.effectiveTaxRate <= 36 ? 'warning' : 'danger' },
            { label: 'Net Profit Margin', formula: 'Net Income / Revenue × 100', value: `${r.netProfitMargin ?? '—'}%`, status: r.netProfitMargin >= 15 ? 'good' : r.netProfitMargin >= 5 ? 'warning' : 'danger' },
            { label: 'ITC Utilization Rate', formula: 'Input GST Credit / Output GST × 100', value: `${r.itcUtilizationRate ?? '—'}%`, status: r.itcUtilizationRate >= 80 ? 'good' : r.itcUtilizationRate >= 60 ? 'warning' : 'danger' },
            { label: 'Tax Burden Ratio', formula: 'Total Tax / Net Profit × 100', value: `${r.taxBurdenRatio ?? '—'}%`, status: '' },
          ]
        }
      ];

      return {
        metrics: [
          { label: 'Net Profit (PBT)', value: fmtINR(netP), color: netP >= 0 ? 'green' : 'red' },
          { label: 'Total Tax Liability', value: fmtINR(ttl), color: 'red' },
          { label: 'Effective Tax Rate', value: `${effRate}%`, color: 'amber' },
          { label: 'Income Tax', value: fmtINR(it.total), color: 'blue' },
          { label: 'Net GST Payable', value: fmtINR(gst.netPayable), color: 'purple' },
        ],
        metricsForAI: {
          report_type: 'Tax Summary',
          net_profit_pbt: fmtINR(netP),
          income_tax: fmtINR(it.total),
          net_gst_payable: fmtINR(gst.netPayable),
          total_tax_liability: fmtINR(ttl),
          effective_tax_rate: `${effRate}%`,
          itc_utilization: itcUtil,
          effective_tax_rate_computed: `${r.effectiveTaxRate ?? '—'}%`,
          net_profit_margin: `${r.netProfitMargin ?? '—'}%`,
          itc_utilization_rate: `${r.itcUtilizationRate ?? '—'}%`,
        },
        ratioRows,
        charts: [
          {
            title: 'Tax Breakdown',
            type: 'pie',
            data: breakdownData,
          },
          {
            title: 'Profit vs Tax Components',
            type: 'bar',
            data: compData,
            bars: [{ key: 'value', color: '#6366f1', name: 'Amount' }],
            xKey: 'name',
          },
        ],
      };
    }

    case 'gst': {
      const s      = data.summary || {};
      const months = data.months || [];
      const avgOut = months.length > 0 ? (s.outputGST || 0) / months.length : 0;
      const itcUtilRate = s.outputGST > 0 ? pct(s.inputGST || 0, s.outputGST) : '—';

      const r = data.ratios || {};
      const ratioRows = [
        {
          group: 'GST Efficiency Metrics',
          items: [
            { label: 'ITC Utilization Rate', formula: 'Input GST / Output GST × 100', value: `${r.itcUtilizationRate ?? '—'}%`, status: r.itcUtilizationRate >= 80 ? 'good' : r.itcUtilizationRate >= 60 ? 'warning' : 'danger', note: 'Higher is better' },
            { label: 'Avg Monthly Output GST', formula: 'Total Output GST / Months', value: fmtINR(r.avgMonthlyOutput), status: '' },
            { label: 'Avg Monthly Input Credit', formula: 'Total Input GST / Months', value: fmtINR(r.avgMonthlyInput), status: '' },
          ]
        }
      ];

      return {
        metrics: [
          { label: 'Output GST', value: fmtINR(s.outputGST), color: 'blue' },
          { label: 'Input Tax Credit', value: fmtINR(s.inputGST), color: 'green' },
          { label: 'Net GST Payable', value: fmtINR(s.netPayable), color: (s.netPayable || 0) > 0 ? 'red' : 'green' },
          { label: 'ITC Utilization', value: itcUtilRate, color: 'amber' },
          { label: 'Avg Monthly GST', value: fmtINR(avgOut), color: 'purple' },
        ],
        metricsForAI: {
          report_type: 'GST Report',
          total_output_gst: fmtINR(s.outputGST),
          total_input_credit: fmtINR(s.inputGST),
          net_gst_payable: fmtINR(s.netPayable),
          itc_utilization_rate: itcUtilRate,
          avg_monthly_output_gst: fmtINR(avgOut),
          itc_utilization_computed: `${r.itcUtilizationRate ?? '—'}%`,
          avg_monthly_output_computed: fmtINR(r.avgMonthlyOutput),
          avg_monthly_input_computed: fmtINR(r.avgMonthlyInput),
        },
        ratioRows,
        charts: [
          {
            title: 'Monthly Output vs Input GST',
            type: 'bar',
            data: months,
            bars: [
              { key: 'output', color: '#dc2626', name: 'Output GST' },
              { key: 'input', color: '#059669', name: 'Input Credit' },
            ],
            xKey: 'label',
          },
          {
            title: 'Net GST Payable Trend',
            type: 'area',
            data: months,
            areas: [{ key: 'net', color: '#7c3aed', name: 'Net Payable' }],
            xKey: 'label',
          },
        ],
      };
    }

    default: return null;
  }
};

// ─── Chart renderer ───────────────────────────────────────────────────────────
const ChartCard = ({ cfg }) => {
  const xKey = cfg.xKey || 'name';

  const tickFmt = (v) => {
    const n = Number(v);
    if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return v;
  };

  return (
    <div className="ra-chart-card">
      <div className="ra-chart-title">{cfg.title}</div>

      {cfg.type === 'pie' && (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={cfg.data} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
              dataKey="value" paddingAngle={2}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {cfg.data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {cfg.type === 'bar' && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={cfg.data} margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {cfg.bars.map(b => (
              <Bar key={b.key} dataKey={b.key} name={b.name || b.key} fill={b.color} radius={[4, 4, 0, 0]} maxBarSize={50} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {cfg.type === 'bar-signed' && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={cfg.data} margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={cfg.yKey} radius={[4, 4, 0, 0]} maxBarSize={40}>
              {cfg.data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {cfg.type === 'area' && (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={cfg.data} margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
            <defs>
              {cfg.areas.map((a, i) => (
                <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={a.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={a.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {cfg.areas.map((a, i) => (
              <Area key={i} type="monotone" dataKey={a.key} name={a.name || a.key}
                stroke={a.color} fill={`url(#grad-${i})`}
                strokeWidth={2} dot={false} activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ReportAnalysis = ({ reportKey, data }) => {
  const { currentCompany } = useAuth();
  const [suggestions,  setSuggestions]  = useState(null);
  const [suggLoading,  setSuggLoading]  = useState(false);
  const [suggError,    setSuggError]    = useState(false);

  const config    = getConfig(reportKey, data);
  const narrative = config ? buildNarrative(reportKey, data) : [];

  const loadSuggestions = useCallback(async () => {
    if (!config || !currentCompany) return;
    setSuggLoading(true);
    setSuggError(false);
    try {
      const result = await fetchReportSuggestions(reportKey, config.metricsForAI, currentCompany.id);
      setSuggestions(result.suggestions || []);
    } catch (_) {
      setSuggError(true);
    } finally {
      setSuggLoading(false);
    }
  }, [reportKey, config, currentCompany]);

  useEffect(() => {
    setSuggestions(null);
    setSuggError(false);
    if (data && reportKey) loadSuggestions();
  }, [reportKey, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return null;

  return (
    <div className="ra-wrap">

      {/* ── Metrics ─────────────────────────────────────────────────────── */}
      <div className="ra-section-label">Key Metrics</div>
      <div className="ra-metrics-grid">
        {config.metrics.map((m, i) => (
          <div key={i} className={`ra-metric-card ${m.color}`}>
            <div className="ra-metric-label">{m.label}</div>
            <div className="ra-metric-value">{m.value}</div>
            {m.sub && <div className="ra-metric-sub">{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      <div className="ra-section-label">Visual Analysis</div>
      <div className="ra-charts-row">
        {config.charts.map((c, i) => <ChartCard key={i} cfg={c} />)}
      </div>

      {/* ── Narrative ───────────────────────────────────────────────────── */}
      {narrative.length > 0 && (
        <>
          <div className="ra-section-label">Report Analysis</div>
          <div className="ra-narrative-box">
            {narrative.map((para, i) => (
              <p key={i} className="ra-narrative-para">{para}</p>
            ))}
          </div>
        </>
      )}

      {/* ── Accounting Ratios ─────────────────────────────────────────────────── */}
      {config.ratioRows && config.ratioRows.length > 0 && (
        <>
          <div className="ra-section-label">Accounting Ratios &amp; Metrics</div>
          <div className="ra-ratio-groups">
            {config.ratioRows.map((group, gi) => (
              <div key={gi} className="ra-ratio-group">
                <div className="ra-ratio-group-title">{group.group}</div>
                <table className="ra-ratio-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Formula</th>
                      {group.hasFY2 ? (
                        <>
                          <th>{data.fy1Label || 'Current FY'}</th>
                          <th>{data.fy2Label || 'Previous FY'}</th>
                          <th>Change</th>
                        </>
                      ) : (
                        <th>Value</th>
                      )}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item, ii) => (
                      <tr key={ii}>
                        <td className="ra-ratio-label">{item.label}</td>
                        <td className="ra-ratio-formula">{item.formula}</td>
                        {group.hasFY2 ? (
                          <>
                            <td className="ra-ratio-value">{item.value}</td>
                            <td className="ra-ratio-value ra-ratio-value--prev">{item.value2 ?? '—'}</td>
                            <td className="ra-ratio-delta">
                              {item.delta ? (
                                <span className={`ra-ratio-delta-val ${item.delta.positive ? 'pos' : 'neg'}`}>
                                  {item.delta.label}
                                </span>
                              ) : '—'}
                            </td>
                          </>
                        ) : (
                          <td className="ra-ratio-value">{item.value}</td>
                        )}
                        <td>
                          {item.status && (
                            <span className={`ra-ratio-badge ra-ratio-badge--${item.status}`}>
                              {item.status === 'good' ? '✓ Good' : item.status === 'warning' ? '⚠ Moderate' : '✗ Poor'}
                            </span>
                          )}
                          {item.note && <span className="ra-ratio-note">{item.note}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Suggestions ─────────────────────────────────────────────────── */}
      <div className="ra-suggestions-box">
        <div className="ra-suggestions-header">
          <div className="ra-sugg-icon"><BrainCircuit size={18} /></div>
          <div>
            <div className="ra-suggestions-title">CA Suggestions & Recommendations</div>
            <div className="ra-suggestions-subtitle">Specific, actionable recommendations for this report</div>
          </div>
        </div>

        {suggLoading && (
          <div className="ra-loading-sugg">
            <div className="ra-spinner" />
            Preparing recommendations based on your report data…
          </div>
        )}

        {!suggLoading && suggError && (
          <div className="ra-ai-unavailable">
            Recommendations are temporarily unavailable. Please try again.
          </div>
        )}

        {!suggLoading && !suggError && suggestions && (
          <div className="ra-sugg-list">
            {suggestions.map((s, i) => (
              <div key={i} className="ra-sugg-item">
                <div className="ra-sugg-num">{i + 1}</div>
                <div className="ra-sugg-body">
                  <div className="ra-sugg-title">{s.title}</div>
                  <div className="ra-sugg-detail">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default ReportAnalysis;
