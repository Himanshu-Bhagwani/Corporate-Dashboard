import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Clock, Download, FileText, DollarSign, ArrowDownRight, ArrowUpRight,
  UserPlus, ShieldCheck, RefreshCcw, FilePlus,
} from 'lucide-react';
import { invoicesAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const fmtINR = (n) => {
  const val = parseFloat(n || 0);
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
};

const fmtShortDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const agingLabel = (dueDate, status) => {
  if (status === 'paid') return 'Paid';
  if (!dueDate) return 'Current';
  const due = new Date(dueDate);
  const now = new Date();
  const days = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Current';
  if (days <= 30) return `1-30 days overdue`;
  if (days <= 60) return `31-60 days overdue`;
  if (days <= 90) return `61-90 days overdue`;
  return `${days} days overdue`;
};

const AUDIT_KINDS = new Set(['created', 'edited', 'payment', 'credit_note', 'debit_note']);

const InvoiceDetailDrawer = ({ invoice, onClose, onDownloadPDF, onOpenPayment, onOpenCreditNote, onOpenDebitNote, refreshKey }) => {
  const { currentCompany } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoice) return;
    setLoading(true);
    try {
      const companyId = currentCompany?.id || invoice.company_id || localStorage.getItem('companyId');
      const res = await invoicesAPI.getAdjustments(invoice.id, companyId);
      setData(res);
    } catch (err) {
      console.error('Failed to load adjustments:', err);
      setData({ adjustments: [], outstanding: parseFloat(invoice.outstanding ?? invoice.amount) || 0 });
    } finally {
      setLoading(false);
    }
  }, [invoice, currentCompany]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!invoice) return null;

  const adjustments = (data?.adjustments) || [];
  const txns = adjustments.filter(a => a.kind === 'payment' || a.kind === 'credit_note' || a.kind === 'debit_note');
  const auditEvents = adjustments.filter(a => AUDIT_KINDS.has(a.kind));

  const originalAmount = parseFloat(invoice.grand_total || invoice.amount) || 0;
  const outstanding = data?.outstanding !== undefined
    ? parseFloat(data.outstanding)
    : (parseFloat(invoice.outstanding) || 0);
  const payments = data?.payments !== undefined ? parseFloat(data.payments) : parseFloat(invoice.amount_paid || 0);

  let runningBalance = originalAmount;
  const txnRows = txns.map(t => {
    const total = parseFloat(t.total_amount || 0);
    if (t.kind === 'debit_note') runningBalance += total;
    else if (t.kind === 'credit_note') runningBalance -= total;
    else if (t.kind === 'payment') runningBalance -= total;
    return { ...t, balance_after: Math.max(0, runningBalance) };
  });

  const auditIcon = (kind) => {
    switch (kind) {
      case 'created': return <UserPlus size={14} />;
      case 'edited': return <RefreshCcw size={14} />;
      case 'payment': return <DollarSign size={14} />;
      case 'credit_note': return <ArrowDownRight size={14} />;
      case 'debit_note': return <ArrowUpRight size={14} />;
      default: return <ShieldCheck size={14} />;
    }
  };

  const auditTitle = (a) => {
    if (a.kind === 'created') return a.reason || 'System created invoice';
    if (a.kind === 'edited') return a.reason || 'Invoice details updated';
    if (a.kind === 'payment') return `Payment received — ${fmtINR(a.total_amount)}`;
    if (a.kind === 'credit_note') return `Credit Note ${a.reference} against ${invoice.invoice_number} — ${fmtINR(a.total_amount)}`;
    if (a.kind === 'debit_note') return `Debit Note ${a.reference} against ${invoice.invoice_number} — ${fmtINR(a.total_amount)}`;
    return a.kind;
  };

  const statusLabel = (s) => {
    if (!s) return '—';
    if (s === 'paid') return 'Paid';
    if (s === 'overdue') return 'Overdue';
    return 'Sent';
  };

  return (
    <div className="invoice-drawer-overlay" onClick={onClose}>
      <div className="invoice-drawer" onClick={e => e.stopPropagation()}>
        <div className="invoice-drawer-header">
          <button className="invoice-drawer-close" onClick={onClose}><X size={18} /></button>
          <div className="invoice-drawer-amount">{fmtINR(originalAmount)}</div>
          <div className="invoice-drawer-subtitle">
            <span>{invoice.client_name || invoice.vendor_name || '—'}</span>
            <span className="inv-num-chip">{invoice.invoice_number}</span>
          </div>
        </div>

        <div className="invoice-drawer-section">
          <div className="invoice-drawer-section-title">
            Overview
            <button className="section-action" onClick={() => window.print && window.print()}>
              <FileText size={12} /> Statement of Account
            </button>
          </div>
          <div className="invoice-drawer-grid">
            <div>
              <div className="invoice-drawer-field-label">Due Date</div>
              <div className="invoice-drawer-field-value"><Clock size={13} color="#94a3b8" /> {fmtDate(invoice.due_date)}</div>
            </div>
            <div>
              <div className="invoice-drawer-field-label">Status</div>
              <div className="invoice-drawer-field-value" style={{ textTransform: 'capitalize' }}>{statusLabel(invoice.status)}</div>
            </div>
            <div>
              <div className="invoice-drawer-field-label">Aging</div>
              <div className="invoice-drawer-field-value" style={{ color: invoice.status === 'overdue' ? '#ef4444' : '#1e293b' }}>{agingLabel(invoice.due_date, invoice.status)}</div>
            </div>
            <div>
              <div className="invoice-drawer-field-label">Invoice Preview</div>
              <div className="invoice-drawer-field-value">
                <a onClick={onDownloadPDF}><FileText size={13} /> Download PDF</a>
              </div>
            </div>
          </div>
          {invoice.irn_number && (
            <div style={{ marginTop: 16 }}>
              <div className="invoice-drawer-irn-label">IRN</div>
              <div className="invoice-drawer-irn">{invoice.irn_number}</div>
            </div>
          )}
        </div>

        <div className="invoice-drawer-section">
          <div className="invoice-drawer-section-title">
            Transactions & Adjustments
            <button className="section-action" onClick={onOpenPayment}>
              <FilePlus size={12} /> Record Payment
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: '#64748b' }}>Original Invoice Amount</span>
            <b style={{ color: '#1e293b' }}>{fmtINR(originalAmount)}</b>
          </div>

          {txnRows.length > 0 ? (
            <table className="invoice-drawer-txn-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Balance After</th>
                </tr>
              </thead>
              <tbody>
                {txnRows.map((t) => {
                  const isDebit = t.kind === 'debit_note';
                  const isPayment = t.kind === 'payment';
                  const sign = isDebit ? '+' : '-';
                  const color = isDebit ? '#d97706' : (isPayment ? '#3b82f6' : '#10b981');
                  return (
                    <tr key={t.id}>
                      <td><span className={`txn-kind-badge ${t.kind}`}>{t.kind.replace('_', ' ')}</span></td>
                      <td>
                        <div style={{ color: '#4F46E5', fontWeight: 500 }}>{t.reference || '—'}</div>
                        {(t.kind === 'credit_note' || t.kind === 'debit_note') && (
                          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                            for {invoice.invoice_number}
                          </div>
                        )}
                      </td>
                      <td style={{ color: '#64748b' }}>{fmtShortDate(t.event_date)}</td>
                      <td style={{ textAlign: 'right', color, fontWeight: 600 }}>{sign}{fmtINR(t.total_amount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtINR(t.balance_after)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0', textAlign: 'center' }}>No transactions yet.</div>
          )}

          <div className="invoice-drawer-outstanding">
            <span className="invoice-drawer-outstanding-label">Current Outstanding</span>
            <span className="invoice-drawer-outstanding-value">{fmtINR(outstanding)}</span>
          </div>
        </div>

        <div className="invoice-drawer-section">
          <div className="invoice-drawer-section-title">Credit / Debit Notes (CGST Sec 34)</div>
          <div className="invoice-drawer-note-actions">
            <button className="invoice-drawer-note-btn" onClick={onOpenCreditNote}>
              <FilePlus size={16} className="note-icon credit" /> Raise Credit Note
            </button>
            <button className="invoice-drawer-note-btn" onClick={onOpenDebitNote}>
              <FilePlus size={16} className="note-icon debit" /> Raise Debit Note
            </button>
          </div>
        </div>

        <div className="invoice-drawer-section" style={{ paddingBottom: '2rem' }}>
          <div className="invoice-drawer-section-title">Audit Log</div>
          {loading ? (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</div>
          ) : (
            <div className="invoice-drawer-audit">
              {auditEvents.length === 0 && (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>No events logged yet.</div>
              )}
              {auditEvents.map(a => (
                <div key={a.id} className="invoice-drawer-audit-item">
                  <div className="invoice-drawer-audit-dot">{auditIcon(a.kind)}</div>
                  <div className="invoice-drawer-audit-body">
                    <div className="audit-title">{auditTitle(a)}</div>
                    <div className="audit-time">{fmtDateTime(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetailDrawer;
