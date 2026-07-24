import React from 'react';
import {
  Landmark, Plus, ChevronRight, Wallet, CalendarClock,
  Percent, CheckCircle2, Layers,
} from 'lucide-react';
import { STATUS_META, LOAN_TYPE_LABELS } from './LoanDetailDrawer';

const fmtINR = (n) => {
  const val = parseFloat(n || 0);
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* ── Summary strip across all active loans ─────────────────────────── */
const SummaryStrip = ({ summary }) => {
  const cards = [
    {
      label: 'Total Active Loans', icon: Layers, color: '#4F46E5', bg: 'rgba(79,70,229,0.1)',
      value: summary.totalActive,
    },
    {
      label: 'Outstanding Principal', icon: Wallet, color: '#ef4444', bg: 'rgba(239,68,68,0.1)',
      value: fmtINR(summary.totalOutstanding),
    },
    {
      label: 'Next EMI Due', icon: CalendarClock, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',
      value: summary.nextEmi ? fmtINR(summary.nextEmi.emi_amount) : '—',
      sub: summary.nextEmi ? `${fmtDate(summary.nextEmi.due_date)} · ${summary.nextEmi.loan_ref}` : 'No EMIs scheduled',
    },
    {
      label: 'Interest Paid to Date', icon: Percent, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',
      value: fmtINR(summary.totalInterestPaid),
    },
    {
      label: 'Loans Closed', icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.1)',
      value: summary.totalClosed,
    },
  ];

  return (
    <div className="myloans-summary-strip">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="myloans-summary-card">
            <div className="myloans-summary-icon" style={{ background: card.bg, color: card.color }}>
              <Icon size={17} />
            </div>
            <div className="myloans-summary-info">
              <span className="myloans-summary-label">{card.label}</span>
              <span className="myloans-summary-value" style={{ color: card.color }}>{card.value}</span>
              {card.sub && <span className="myloans-summary-sub">{card.sub}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ── Loans list ────────────────────────────────────────────────────── */
const MyLoans = ({ loans, summary, loading, onApply, onOpenLoan }) => {
  if (loading) {
    return <div className="myloans-loading">Loading your loans…</div>;
  }

  return (
    <div className="myloans">
      {summary && <SummaryStrip summary={summary} />}

      <div className="loans-section-header">
        <div className="loans-section-left">
          <div className="loans-section-icon" style={{ background: 'rgba(79,70,229,0.1)', color: '#4F46E5' }}>
            <Landmark size={18} />
          </div>
          <div>
            <h2 className="loans-section-title">Loan Applications & Facilities</h2>
            <p className="loans-section-sub">A company can run multiple credit facilities — each loan is tracked independently</p>
          </div>
        </div>
        <button className="myloans-apply-btn" onClick={onApply}>
          <Plus size={15} /> Apply New Loan
        </button>
      </div>

      {loans.length === 0 ? (
        <div className="myloans-empty">
          <div className="myloans-empty-icon"><Landmark size={30} /></div>
          <h3>No loan applications yet</h3>
          <p>Apply for your first corporate loan in 4 quick steps — your company and financial data is pre-filled automatically.</p>
          <button className="myloans-apply-btn" onClick={onApply}>
            <Plus size={15} /> Apply for a Loan
          </button>
        </div>
      ) : (
        <div className="myloans-list">
          {loans.map((loan, i) => {
            const meta = STATUS_META[loan.status] || STATUS_META.SUBMITTED;
            const hasSanction = parseFloat(loan.sanctioned_amount) > 0;
            const emiProgress = loan.total_emis > 0 ? `${loan.paid_emis}/${loan.total_emis} EMIs` : null;
            return (
              <div
                key={loan.id}
                className="myloans-row"
                style={{ animationDelay: `${i * 0.05}s` }}
                onClick={() => onOpenLoan(loan.id)}
              >
                <div className="myloans-row-icon" style={{ background: meta.bg, color: meta.color }}>
                  <Landmark size={18} />
                </div>
                <div className="myloans-row-main">
                  <div className="myloans-row-top">
                    <span className="myloans-row-ref">{loan.loan_ref}</span>
                    <span className="myloans-row-type">{LOAN_TYPE_LABELS[loan.loan_type] || loan.loan_type}</span>
                  </div>
                  <span className="myloans-row-lender">{loan.lender_bank || loan.lender || 'Lender not set'}</span>
                </div>
                <div className="myloans-row-stat">
                  <span className="myloans-row-stat-label">{hasSanction ? 'Sanctioned' : 'Requested'}</span>
                  <span className="myloans-row-stat-value">{fmtINR(hasSanction ? loan.sanctioned_amount : loan.amount_required)}</span>
                </div>
                <div className="myloans-row-stat">
                  <span className="myloans-row-stat-label">Outstanding</span>
                  <span className="myloans-row-stat-value">{hasSanction ? fmtINR(loan.outstanding_principal) : '—'}</span>
                </div>
                <div className="myloans-row-stat">
                  <span className="myloans-row-stat-label">Next EMI</span>
                  <span className="myloans-row-stat-value">
                    {loan.next_emi_date ? fmtDate(loan.next_emi_date) : '—'}
                  </span>
                  {emiProgress && <span className="myloans-row-stat-sub">{emiProgress} paid</span>}
                </div>
                <span className="loan-status-badge" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                <ChevronRight size={17} className="myloans-row-chevron" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyLoans;
