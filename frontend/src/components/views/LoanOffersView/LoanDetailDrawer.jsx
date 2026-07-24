import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Landmark, FileText, CalendarClock, CheckCircle2, Circle,
  BadgeCheck, AlertTriangle, ChevronDown, ChevronUp, Percent,
  IndianRupee, Clock, Banknote, ReceiptText, Info,
} from 'lucide-react';
import { loansAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const fmtINR = (n) => {
  const val = parseFloat(n || 0);
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const STAGES = ['SUBMITTED', 'UNDER_REVIEW', 'SANCTIONED', 'DISBURSED', 'REPAYMENT_ACTIVE', 'CLOSED'];

export const STATUS_META = {
  SUBMITTED:        { label: 'Submitted',        color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  UNDER_REVIEW:     { label: 'Under Review',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  SANCTIONED:       { label: 'Sanctioned',       color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
  DISBURSED:        { label: 'Disbursed',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  REPAYMENT_ACTIVE: { label: 'Repayment Active', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  CLOSED:           { label: 'Closed',           color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
  REJECTED:         { label: 'Rejected',         color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
};

export const LOAN_TYPE_LABELS = {
  TERM_LOAN: 'Term Loan', WORKING_CAPITAL_CC: 'Working Capital CC', OVERDRAFT_OD: 'Overdraft (OD)',
  WCDL: 'WCDL', MSME_LOAN: 'MSME Loan', VEHICLE_LOAN: 'Vehicle Loan', EQUIPMENT_LOAN: 'Equipment Loan', OTHER: 'Other',
};

const EMI_STATUS_META = {
  PENDING:        { label: 'Pending',        color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  PAID:           { label: 'Paid',           color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  OVERDUE:        { label: 'Overdue',        color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  PARTIALLY_PAID: { label: 'Partially Paid', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
};

// Standard reducing-balance EMI — mirrors the backend formula for live preview
const computeEmi = (principal, annualRate, tenureMonths) => {
  const P = parseFloat(principal) || 0;
  const n = parseInt(tenureMonths) || 0;
  const r = (parseFloat(annualRate) || 0) / 12 / 100;
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return Math.round((P / n) * 100) / 100;
  return Math.round(((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) * 100) / 100;
};

/* ── Sanction Details Form ─────────────────────────────────────────── */
// EMI is *always* auto-calculated on the disbursed amount (interest accrues from
// disbursal, borrowers repay only disbursed principal). If disbursement hasn't
// happened yet, we preview from sanctioned as a placeholder.
const SanctionForm = ({ loan, onSaved }) => {
  const { currentCompany } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    sanctioned_amount: loan.sanctioned_amount || loan.amount_required || '',
    disbursed_amount: loan.disbursed_amount || '',
    interest_rate: loan.interest_rate || '',
    tenure_months: loan.tenure_months || loan.tenure_preferred_months || '',
    first_emi_date: loan.first_emi_date ? String(loan.first_emi_date).slice(0, 10) : '',
    lender_bank: loan.lender_bank || loan.lender || '',
    loan_account_number: loan.loan_account_number || '',
    processing_fee: loan.processing_fee || '',
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // Live EMI preview — recalculates as user types disbursed amount / rate / tenure
  const repayPrincipal = parseFloat(form.disbursed_amount) > 0
    ? parseFloat(form.disbursed_amount)
    : parseFloat(form.sanctioned_amount) || 0;
  const usingDisbursed = parseFloat(form.disbursed_amount) > 0;
  // A facility can be drawn down in parts, never beyond what was sanctioned.
  const overDisbursed =
    parseFloat(form.disbursed_amount) > 0 &&
    parseFloat(form.sanctioned_amount) > 0 &&
    parseFloat(form.disbursed_amount) > parseFloat(form.sanctioned_amount);
  const autoEmi = useMemo(
    () => computeEmi(repayPrincipal, form.interest_rate, form.tenure_months),
    [repayPrincipal, form.interest_rate, form.tenure_months]
  );

  const save = async () => {
    setError('');
    if (!form.sanctioned_amount || !form.interest_rate || !form.tenure_months || !form.first_emi_date) {
      setError('Sanctioned amount, interest rate, tenure and first EMI date are required.');
      return;
    }
    if (overDisbursed) {
      setError('Disbursed amount cannot exceed the sanctioned amount.');
      return;
    }
    setSaving(true);
    try {
      await loansAPI.saveSanction(loan.id, form, currentCompany.id);
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save sanction details.');
      setSaving(false);
    }
  };

  return (
    <div className="loan-sanction-form">
      <div className="loan-form-grid">
        <div className="loan-field">
          <label>Sanctioned Amount (₹) *</label>
          <input type="number" min="0" value={form.sanctioned_amount} onChange={e => set('sanctioned_amount', e.target.value)} placeholder="1000000" />
          <span className="loan-field-hint">Total approved limit from the bank</span>
        </div>
        <div className="loan-field">
          <label>Disbursed Amount (₹)</label>
          <input
            type="number"
            min="0"
            max={form.sanctioned_amount || undefined}
            value={form.disbursed_amount}
            onChange={e => set('disbursed_amount', e.target.value)}
            placeholder="After processing fee"
            style={overDisbursed ? { borderColor: '#ef4444' } : undefined}
          />
          <span className="loan-field-hint" style={overDisbursed ? { color: '#ef4444' } : undefined}>
            {overDisbursed
              ? 'Cannot exceed the sanctioned amount'
              : 'Amount actually released — EMI is calculated on this'}
          </span>
        </div>
        <div className="loan-field">
          <label>Interest Rate (% p.a.) *</label>
          <input type="number" min="0" step="0.01" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} placeholder="9.25" />
        </div>
        <div className="loan-field">
          <label>Tenure (months) *</label>
          <input type="number" min="1" value={form.tenure_months} onChange={e => set('tenure_months', e.target.value)} placeholder="36" />
        </div>
        <div className="loan-field loan-field-full">
          <div className="loan-emi-preview">
            <span className="loan-emi-preview-label">Auto-calculated EMI</span>
            <span className="loan-emi-preview-value">
              {autoEmi > 0 ? `${fmtINR(autoEmi)}/month` : '—'}
            </span>
            <span className="loan-emi-preview-note">
              {autoEmi > 0
                ? `On ${usingDisbursed ? 'disbursed' : 'sanctioned (placeholder)'} amount of ${fmtINR(repayPrincipal)} · updates live as you change rate/tenure`
                : 'Fill amount, rate and tenure to see the EMI'}
            </span>
          </div>
        </div>
        <div className="loan-field">
          <label>First EMI Date *</label>
          <input type="date" value={form.first_emi_date} onChange={e => set('first_emi_date', e.target.value)} />
        </div>
        <div className="loan-field">
          <label>Lender Bank</label>
          <input value={form.lender_bank} onChange={e => set('lender_bank', e.target.value)} placeholder="HDFC Bank" />
        </div>
        <div className="loan-field">
          <label>Loan Account Number</label>
          <input value={form.loan_account_number} onChange={e => set('loan_account_number', e.target.value)} placeholder="HDFC00291837" />
        </div>
        <div className="loan-field loan-field-full">
          <label>Processing Fee Paid (₹)</label>
          <input type="number" min="0" value={form.processing_fee} onChange={e => set('processing_fee', e.target.value)} placeholder="15000" />
        </div>
      </div>
      {error && <div className="loan-form-error"><AlertTriangle size={14} /> {error}</div>}
      <button className="loan-btn-primary" onClick={save} disabled={saving || overDisbursed} style={{ marginTop: '0.75rem' }}>
        {saving ? 'Saving…' : 'Save Sanction Details & Generate EMI Schedule'} <BadgeCheck size={15} />
      </button>
    </div>
  );
};

/* ── Main Drawer ───────────────────────────────────────────────────── */
const LoanDetailDrawer = ({ loanId, onClose, onChanged, onTransactionsChanged }) => {
  const { currentCompany } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusDraft, setStatusDraft] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showApplication, setShowApplication] = useState(false);
  const [showSanctionForm, setShowSanctionForm] = useState(false);
  const [showAllEmis, setShowAllEmis] = useState(false);
  const [emiBusy, setEmiBusy] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!loanId || !currentCompany) return;
    try {
      const res = await loansAPI.getOne(loanId, currentCompany.id);
      setData(res);
    } catch (err) {
      console.error('Failed to load loan:', err);
    } finally {
      setLoading(false);
    }
  }, [loanId, currentCompany]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!loanId) return null;

  const loan = data?.loan;
  const history = data?.history || [];
  const emis = data?.emis || [];

  const currentStageIdx = loan ? STAGES.indexOf(loan.status) : -1;
  const isRejected = loan?.status === 'REJECTED';
  const hasSanction = loan && parseFloat(loan.sanctioned_amount) > 0;
  const paidCount = emis.filter(e => e.status === 'PAID').length;

  // Group history entries by stage so notes appear under the right node
  const historyByStage = history.reduce((acc, h) => {
    (acc[h.status] = acc[h.status] || []).push(h);
    return acc;
  }, {});

  const updateStatus = async () => {
    if (!statusDraft) return;
    setUpdatingStatus(true);
    try {
      await loansAPI.updateStatus(loan.id, statusDraft, statusNote, currentCompany.id);
      setStatusDraft('');
      setStatusNote('');
      if (statusDraft === 'SANCTIONED' && !hasSanction) setShowSanctionForm(true);
      await load();
      onChanged();
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const setEmiStatus = async (emi, status) => {
    setEmiBusy(emi.id);
    try {
      const res = await loansAPI.updateEmi(loan.id, emi.id, { status }, currentCompany.id);
      if (res.transactionsCreated) {
        setToast(`EMI #${emi.emi_number} marked paid — debit entries added to Transactions`);
        if (onTransactionsChanged) onTransactionsChanged();
      }
      await load();
      onChanged();
    } catch (err) {
      console.error('EMI update failed:', err);
    } finally {
      setEmiBusy(null);
    }
  };

  const meta = loan ? (STATUS_META[loan.status] || STATUS_META.SUBMITTED) : STATUS_META.SUBMITTED;

  return (
    <div className="loan-drawer-overlay" onClick={onClose}>
      <div className="loan-drawer" onClick={e => e.stopPropagation()}>

        {loading && <div className="loan-drawer-loading">Loading loan details…</div>}

        {!loading && loan && (
          <>
            {/* Header */}
            <div className="loan-drawer-header">
              <div className="loan-drawer-title-wrap">
                <div className="loan-drawer-bank-icon"><Landmark size={20} /></div>
                <div>
                  <div className="loan-drawer-ref">{loan.loan_ref}</div>
                  <div className="loan-drawer-sub">
                    {LOAN_TYPE_LABELS[loan.loan_type] || loan.loan_type}
                    {(loan.lender_bank || loan.lender) && <> · {loan.lender_bank || loan.lender}</>}
                  </div>
                </div>
              </div>
              <div className="loan-drawer-header-right">
                <span className="loan-status-badge" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                <button className="loan-modal-close" onClick={onClose}><X size={18} /></button>
              </div>
            </div>

            {/* Key figures */}
            <div className="loan-drawer-stats">
              <div className="loan-drawer-stat">
                <span className="loan-drawer-stat-label"><IndianRupee size={12} /> {hasSanction ? 'Sanctioned' : 'Requested'}</span>
                <span className="loan-drawer-stat-value">{fmtINR(hasSanction ? loan.sanctioned_amount : loan.amount_required)}</span>
              </div>
              <div className="loan-drawer-stat">
                <span className="loan-drawer-stat-label"><Banknote size={12} /> Outstanding</span>
                <span className="loan-drawer-stat-value">{hasSanction ? fmtINR(loan.outstanding_principal) : '—'}</span>
              </div>
              <div className="loan-drawer-stat">
                <span className="loan-drawer-stat-label"><Percent size={12} /> Interest</span>
                <span className="loan-drawer-stat-value">{loan.interest_rate ? `${parseFloat(loan.interest_rate)}% p.a.` : '—'}</span>
              </div>
              <div className="loan-drawer-stat">
                <span className="loan-drawer-stat-label"><Clock size={12} /> Tenure</span>
                <span className="loan-drawer-stat-value">{loan.tenure_months ? `${loan.tenure_months} months` : loan.tenure_preferred_months ? `${loan.tenure_preferred_months} mo (pref.)` : '—'}</span>
              </div>
            </div>

            <div className="loan-drawer-body">

              {/* ── Status Timeline ─────────────────────────────── */}
              <div className="loan-drawer-section">
                <h3 className="loan-drawer-section-title"><CalendarClock size={15} /> Application Status</h3>
                <div className="loan-timeline">
                  {STAGES.map((stage, idx) => {
                    const sMeta = STATUS_META[stage];
                    const done = !isRejected && idx < currentStageIdx;
                    const current = !isRejected && idx === currentStageIdx;
                    const entries = historyByStage[stage] || [];
                    return (
                      <div key={stage} className={`loan-timeline-item ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                        <div className="loan-timeline-rail">
                          <div className="loan-timeline-dot" style={current || done ? { borderColor: sMeta.color, background: current ? sMeta.color : '#fff', color: done ? sMeta.color : '#fff' } : {}}>
                            {done ? <CheckCircle2 size={15} /> : current ? <Circle size={9} fill="currentColor" /> : <Circle size={9} />}
                          </div>
                          {idx < STAGES.length - 1 && <div className={`loan-timeline-line ${done ? 'done' : ''}`} />}
                        </div>
                        <div className="loan-timeline-content">
                          <span className="loan-timeline-label" style={current ? { color: sMeta.color } : {}}>{sMeta.label}</span>
                          {entries.map(h => (
                            <div key={h.id} className="loan-timeline-entry">
                              <span className="loan-timeline-date">{fmtDateTime(h.created_at)}</span>
                              {h.note && <span className="loan-timeline-note">{h.note}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {isRejected && (
                    <div className="loan-timeline-item current rejected">
                      <div className="loan-timeline-rail">
                        <div className="loan-timeline-dot" style={{ borderColor: '#ef4444', background: '#ef4444', color: '#fff' }}>
                          <X size={13} />
                        </div>
                      </div>
                      <div className="loan-timeline-content">
                        <span className="loan-timeline-label" style={{ color: '#ef4444' }}>Rejected</span>
                        {(historyByStage.REJECTED || []).map(h => (
                          <div key={h.id} className="loan-timeline-entry">
                            <span className="loan-timeline-date">{fmtDateTime(h.created_at)}</span>
                            {h.note && <span className="loan-timeline-note">{h.note}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual status update */}
                {loan.status !== 'CLOSED' && (
                  <div className="loan-status-update">
                    <div className="loan-status-update-row">
                      <select value={statusDraft} onChange={e => setStatusDraft(e.target.value)}>
                        <option value="" disabled>Move to status…</option>
                        {[...STAGES, 'REJECTED'].filter(s => s !== loan.status).map(s => (
                          <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                      <button className="loan-btn-primary" onClick={updateStatus} disabled={!statusDraft || updatingStatus}>
                        {updatingStatus ? 'Updating…' : 'Update'}
                      </button>
                    </div>
                    <input
                      className="loan-status-note-input"
                      placeholder='Add a note (e.g. "Bank asked for additional documents")'
                      value={statusNote}
                      onChange={e => setStatusNote(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* ── Sanction Details ────────────────────────────── */}
              {(currentStageIdx >= 2 || hasSanction || showSanctionForm) && !isRejected && (
                <div className="loan-drawer-section">
                  <div className="loan-drawer-section-head">
                    <h3 className="loan-drawer-section-title"><ReceiptText size={15} /> Sanction Details</h3>
                    {hasSanction && (
                      <button className="loan-link-btn" onClick={() => setShowSanctionForm(v => !v)}>
                        {showSanctionForm ? 'Cancel edit' : 'Edit'}
                      </button>
                    )}
                  </div>

                  {(!hasSanction || showSanctionForm) ? (
                    <>
                      {!hasSanction && (
                        <p className="loan-drawer-hint"><Info size={13} /> Enter the terms from the bank's sanction letter — the EMI repayment schedule generates automatically.</p>
                      )}
                      <SanctionForm loan={loan} onSaved={() => { setShowSanctionForm(false); load(); onChanged(); }} />
                    </>
                  ) : (
                    <div className="loan-sanction-grid">
                      {[
                        ['Sanctioned Amount', fmtINR(loan.sanctioned_amount)],
                        ['Disbursed Amount', loan.disbursed_amount ? fmtINR(loan.disbursed_amount) : '—'],
                        ['Interest Rate', `${parseFloat(loan.interest_rate)}% p.a.`],
                        ['Tenure', `${loan.tenure_months} months`],
                        ['EMI Amount', `${fmtINR(loan.emi_amount)}/month`],
                        ['First EMI Date', fmtDate(loan.first_emi_date)],
                        ['Last EMI Date', fmtDate(loan.last_emi_date)],
                        ['Lender Bank', loan.lender_bank || '—'],
                        ['Loan Account No.', loan.loan_account_number || '—'],
                        ['Processing Fee', loan.processing_fee ? fmtINR(loan.processing_fee) : '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="loan-sanction-item">
                          <span className="loan-sanction-label">{label}</span>
                          <span className="loan-sanction-value">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── EMI Repayment Schedule ──────────────────────── */}
              {emis.length > 0 && (() => {
                const WINDOW = 5;
                // Rolling window: anchor on the first unpaid EMI so the visible
                // rows "move" with time. If all paid, show the last 5.
                let visibleEmis = emis;
                let windowStart = 0;
                if (!showAllEmis && emis.length > WINDOW) {
                  const firstUnpaidIdx = emis.findIndex(e => e.status !== 'PAID');
                  if (firstUnpaidIdx === -1) {
                    windowStart = emis.length - WINDOW;
                  } else {
                    // Show 1 already-paid row for context + the next 4 upcoming
                    windowStart = Math.max(0, Math.min(firstUnpaidIdx - 1, emis.length - WINDOW));
                  }
                  visibleEmis = emis.slice(windowStart, windowStart + WINDOW);
                }
                const hiddenBefore = windowStart;
                const hiddenAfter = emis.length - (windowStart + visibleEmis.length);
                const canCollapse = emis.length > WINDOW;

                return (
                  <div className="loan-drawer-section">
                    <div className="loan-drawer-section-head">
                      <h3 className="loan-drawer-section-title"><CalendarClock size={15} /> EMI Repayment Schedule</h3>
                      <span className="loan-emi-progress">{paidCount}/{emis.length} paid</span>
                    </div>
                    <div className="loan-emi-progress-bar">
                      <div className="loan-emi-progress-fill" style={{ width: `${(paidCount / emis.length) * 100}%` }} />
                    </div>
                    <div className="loan-emi-table-wrap">
                      <table className="loan-emi-table">
                        <thead>
                          <tr>
                            <th>#</th><th>Due Date</th><th>Principal</th><th>Interest</th><th>EMI</th><th>Status</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {!showAllEmis && hiddenBefore > 0 && (
                            <tr className="loan-emi-hidden-row">
                              <td colSpan="7">
                                <span>{hiddenBefore} earlier EMI{hiddenBefore === 1 ? '' : 's'} paid</span>
                              </td>
                            </tr>
                          )}
                          {visibleEmis.map(emi => {
                            const eMeta = EMI_STATUS_META[emi.status] || EMI_STATUS_META.PENDING;
                            return (
                              <tr key={emi.id} className={emi.status === 'PAID' ? 'paid-row' : ''}>
                                <td>{emi.emi_number}</td>
                                <td>{fmtDate(emi.due_date)}</td>
                                <td>{fmtINR(emi.principal)}</td>
                                <td>{fmtINR(emi.interest)}</td>
                                <td className="loan-emi-amount">{fmtINR(emi.emi_amount)}</td>
                                <td>
                                  <span className="loan-emi-status" style={{ background: eMeta.bg, color: eMeta.color }}>{eMeta.label}</span>
                                </td>
                                <td className="loan-emi-actions">
                                  {emi.status !== 'PAID' ? (
                                    <button
                                      className="loan-emi-pay-btn"
                                      disabled={emiBusy === emi.id}
                                      onClick={() => setEmiStatus(emi, 'PAID')}
                                    >
                                      {emiBusy === emi.id ? '…' : 'Mark Paid'}
                                    </button>
                                  ) : (
                                    <button
                                      className="loan-emi-undo-btn"
                                      disabled={emiBusy === emi.id}
                                      onClick={() => setEmiStatus(emi, 'PENDING')}
                                    >
                                      Undo
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {!showAllEmis && hiddenAfter > 0 && (
                            <tr className="loan-emi-hidden-row">
                              <td colSpan="7">
                                <span>{hiddenAfter} upcoming EMI{hiddenAfter === 1 ? '' : 's'} scheduled</span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {canCollapse && (
                      <button className="loan-emi-expand-btn" onClick={() => setShowAllEmis(v => !v)}>
                        {showAllEmis ? (<><ChevronUp size={14} /> Show current 5 only</>) : (<><ChevronDown size={14} /> Show all {emis.length} EMIs</>)}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* ── Application Data ────────────────────────────── */}
              <div className="loan-drawer-section">
                <button className="loan-collapse-btn" onClick={() => setShowApplication(v => !v)}>
                  <FileText size={15} /> Application Details
                  {showApplication ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showApplication && (
                  <div className="loan-sanction-grid" style={{ marginTop: '0.85rem' }}>
                    {[
                      ['Company Name', loan.company_name || '—'],
                      ['CIN Number', loan.cin_number || '—'],
                      ['Incorporated', fmtDate(loan.date_of_incorporation)],
                      ['Business Type', loan.business_type || '—'],
                      ['Industry', loan.industry || '—'],
                      ['Annual Turnover', loan.annual_turnover ? fmtINR(loan.annual_turnover) : '—'],
                      ['Amount Required', fmtINR(loan.amount_required)],
                      ['Purpose', loan.purpose || '—'],
                      ['Preferred Tenure', loan.tenure_preferred_months ? `${loan.tenure_preferred_months} months` : '—'],
                      ['Existing Loans', loan.has_existing_loans ? `Yes — ${fmtINR(loan.existing_loans_outstanding)} outstanding` : 'No'],
                      ['Monthly Revenue', loan.monthly_revenue ? fmtINR(loan.monthly_revenue) : '—'],
                      ['GST Filing', loan.gst_filing_status || '—'],
                      ['ITR Filed', loan.itr_filed ? 'Yes' : 'No'],
                      ['Net Profit (3 yrs)', [loan.net_profit_y1, loan.net_profit_y2, loan.net_profit_y3].filter(v => v != null).map(fmtINR).join(' · ') || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="loan-sanction-item">
                        <span className="loan-sanction-label">{label}</span>
                        <span className="loan-sanction-value">{value}</span>
                      </div>
                    ))}
                    {Array.isArray(loan.documents) && loan.documents.length > 0 && (
                      <div className="loan-sanction-item" style={{ gridColumn: '1 / -1' }}>
                        <span className="loan-sanction-label">Documents Attached</span>
                        <span className="loan-sanction-value">{loan.documents.map(d => d.label).join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {toast && <div className="loan-toast"><BadgeCheck size={15} /> {toast}</div>}
          </>
        )}
      </div>
    </div>
  );
};

export default LoanDetailDrawer;
