import React, { useState } from 'react';
import { X } from 'lucide-react';
import { invoicesAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const fmtINR = (n) => {
  const val = parseFloat(n || 0);
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const today = () => new Date().toISOString().slice(0, 10);

// line_items comes back as JSON text from Postgres on some routes and as a
// parsed array on others, so normalise before reading it.
const parseLineItems = (invoice) => {
  if (!invoice) return [];
  const raw = invoice.line_items;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

// Value of one line, net of its discount and excluding GST — a credit note is
// raised on the taxable value, with tax reversed separately.
const lineTaxableValue = (item) => {
  const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  return base - base * ((parseFloat(item.discount_percent) || 0) / 100);
};

const lineLabel = (item, idx) => {
  const name = String(item.name || item.description || `Line ${idx + 1}`).trim() || `Line ${idx + 1}`;
  const qty = parseFloat(item.quantity) || 0;
  const unit = item.unit || '';
  const hsn = item.hsn ? ` · HSN ${item.hsn}` : '';
  return `${name}${hsn} — ${qty} ${unit} @ ${fmtINR(item.unit_price || 0)} = ${fmtINR(lineTaxableValue(item))}`;
};

// Derive the invoice's applicable tax percent from its line items.
const inferTaxPercent = (invoice) => {
  const items = parseLineItems(invoice);
  const first = items[0];
  if (first && first.tax_percent !== undefined && first.tax_percent !== null && first.tax_percent !== '') {
    return parseFloat(first.tax_percent) || 0;
  }
  return 18;
};

/**
 * Picker for the line items a note is raised against.
 *
 * Only the parent invoice's own lines are listed — a credit note can never
 * reference something that was not billed. Selecting lines also fills in the
 * amount from their taxable value, and the per-line tax rate is what gets
 * reversed, rather than assuming the first line's rate applies to everything.
 */
const LineItemPicker = ({ items, selected, onToggle, emptyHint }) => {
  if (items.length === 0) {
    return (
      <div className="invoice-mini-empty-lines">
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="invoice-mini-lineitems">
      {items.map((item, idx) => {
        const id = item.id ?? idx;
        const checked = selected.includes(id);
        return (
          <label key={id} className={`invoice-mini-lineitem ${checked ? 'selected' : ''}`}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(id)} />
            <span>
              {lineLabel(item, idx)}
              {item.tax_percent !== undefined && item.tax_percent !== '' && (
                <em> · GST {parseFloat(item.tax_percent) || 0}%</em>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
};

// ── Record Payment ────────────────────────────────────────────────────
export const PaymentModal = ({ invoice, outstanding, onClose, onSaved }) => {
  const { currentCompany } = useAuth();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState('NEFT');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return setError('Amount must be positive.');
    setError('');
    setSubmitting(true);
    try {
      const companyId = currentCompany?.id || invoice.company_id || localStorage.getItem('companyId');
      await invoicesAPI.recordPayment(invoice.id, {
        amount: n, event_date: date, mode, reference,
      }, companyId);
      onSaved && await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="invoice-mini-modal" onClick={e => e.stopPropagation()}>
        <div className="invoice-mini-modal-header">
          <h3>Record Payment</h3>
          <button className="invoice-mini-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        {error && <div className="invoice-modal-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="invoice-mini-field">
          <label>Amount Paid</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`Outstanding: ${fmtINR(outstanding)}`}
          />
        </div>
        <div className="invoice-mini-field">
          <label>Payment Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="invoice-mini-field">
          <label>Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option>NEFT</option>
            <option>RTGS</option>
            <option>UPI</option>
            <option>Cheque</option>
            <option>Cash</option>
            <option>Other</option>
          </select>
        </div>
        <div className="invoice-mini-field">
          <label>Reference Number (UTR / Chq No)</label>
          <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. UTR-90238491" />
        </div>
        <button className="invoice-mini-submit" onClick={submit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Payment'}
        </button>
      </div>
    </div>
  );
};

// ── Raise Credit Note (Section 34(1)) ────────────────────────────────
export const CreditNoteModal = ({ invoice, outstanding, onClose, onSaved }) => {
  const { currentCompany } = useAuth();
  const lineItems = React.useMemo(() => parseLineItems(invoice), [invoice]);
  const [selectedLines, setSelectedLines] = useState([]);
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [reason, setReason] = useState('Return of goods');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const chosen = lineItems.filter((it, idx) => selectedLines.includes(it.id ?? idx));

  // Selected lines drive the amount and the tax rate. Falls back to the
  // invoice-level rate when the note isn't tied to specific lines.
  const selectedValue = chosen.reduce((s, it) => s + lineTaxableValue(it), 0);
  const taxPct = chosen.length > 0
    ? (chosen.reduce((s, it) => s + lineTaxableValue(it) * (parseFloat(it.tax_percent) || 0), 0) /
        (selectedValue || 1))
    : inferTaxPercent(invoice);

  const toggleLine = (id) => {
    setSelectedLines(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      // Keep the amount in step with the selection until the user overrides it.
      if (!amountTouched) {
        const val = lineItems
          .filter((it, idx) => next.includes(it.id ?? idx))
          .reduce((s, it) => s + lineTaxableValue(it), 0);
        setAmount(val > 0 ? String(Number(val.toFixed(2))) : '');
      }
      return next;
    });
  };

  const base = parseFloat(amount) || 0;
  const tax = base * (taxPct / 100);
  const total = base + tax;
  const overCredit = selectedValue > 0 && base > selectedValue + 0.01;

  const submit = async () => {
    if (base <= 0) return setError('Amount must be positive.');
    if (overCredit) return setError('Credit cannot exceed the value of the selected line items.');
    setError('');
    setSubmitting(true);
    try {
      const companyId = currentCompany?.id || invoice.company_id || localStorage.getItem('companyId');
      // Record which lines were reversed alongside any free-text note, so the
      // audit trail shows exactly what the credit relates to.
      const lineSummary = chosen.length > 0
        ? `Lines reversed: ${chosen.map((it, i) => it.name || it.description || `Line ${i + 1}`).join(', ')}`
        : '';
      await invoicesAPI.recordCreditNote(invoice.id, {
        amount: base,
        tax_percent: Number(taxPct.toFixed(4)),
        reason,
        notes: [lineSummary, notes].filter(Boolean).join(' — '),
        line_item_refs: chosen.map((it, i) => ({
          name: it.name || it.description || `Line ${i + 1}`,
          hsn: it.hsn || null,
          taxable_value: Number(lineTaxableValue(it).toFixed(2)),
          tax_percent: parseFloat(it.tax_percent) || 0,
        })),
      }, companyId);
      onSaved && await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to raise credit note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="invoice-mini-modal" onClick={e => e.stopPropagation()}>
        <div className="invoice-mini-modal-header">
          <h3>Raise Credit Note (Section 34(1))</h3>
          <button className="invoice-mini-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="invoice-mini-modal-info">
          <b>CGST Section 34 Compliance</b><br />
          GST entry and taxable values will be reversed for this invoice. Linked in both directions.
        </div>
        {error && <div className="invoice-modal-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="invoice-mini-field">
          <label>GST Reason Code</label>
          <select value={reason} onChange={e => setReason(e.target.value)}>
            <option>Return of goods</option>
            <option>Post-sale discount</option>
            <option>Deficiency in service</option>
            <option>Correction of over-invoiced value</option>
            <option>Other</option>
          </select>
        </div>
        <div className="invoice-mini-field">
          <label>Line items being reversed</label>
          <LineItemPicker
            items={lineItems}
            selected={selectedLines}
            onToggle={toggleLine}
            emptyHint={`Invoice ${invoice?.invoice_number || ''} has no saved line items, so enter the credit amount directly below.`}
          />
          {selectedValue > 0 && (
            <span className="invoice-mini-hint">
              Selected value {fmtINR(selectedValue)} — the credit amount is filled in from this, and can be reduced for a partial credit.
            </span>
          )}
        </div>
        <div className="invoice-mini-field">
          <label>Additional notes (optional)</label>
          <textarea rows="2" value={notes} maxLength={500}
            onChange={e => setNotes(e.target.value.replace(/[<>{}\\`$]/g, '').slice(0, 500))}
            placeholder="Any further explanation for this credit note…" />
        </div>
        <div className="invoice-mini-field">
          <label>Credit Note Amount (excluding GST)</label>
          <input type="text" inputMode="decimal" value={amount}
            className={overCredit ? 'invoice-mini-input-error' : ''}
            onChange={e => {
              setAmountTouched(true);
              const v = e.target.value.replace(/[^\d.]/g, '');
              const dot = v.indexOf('.');
              setAmount(dot === -1 ? v.slice(0, 12) : v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2));
            }}
            placeholder="e.g. 500" />
          {overCredit && (
            <span className="invoice-mini-error-text">
              Cannot exceed the selected line value of {fmtINR(selectedValue)}
            </span>
          )}
        </div>
        {base > 0 && (
          <div className="invoice-mini-modal-preview">
            <div>Base amount: <b>{fmtINR(base)}</b></div>
            <div>GST reversal ({Number(taxPct.toFixed(2))}%): <b>-{fmtINR(tax)}</b></div>
            <div>Total CN value: <b>{fmtINR(total)}</b></div>
            <div>New outstanding: <b>{fmtINR(Math.max(0, outstanding - total))}</b></div>
          </div>
        )}
        <button className="invoice-mini-submit credit" onClick={submit} disabled={submitting || overCredit}>
          {submitting ? 'Posting…' : 'Post Reverse Journal Entry'}
        </button>
      </div>
    </div>
  );
};

// ── Raise Debit Note (Section 34(3)) ────────────────────────────────
export const DebitNoteModal = ({ invoice, outstanding, onClose, onSaved }) => {
  const { currentCompany } = useAuth();
  const lineItems = React.useMemo(() => parseLineItems(invoice), [invoice]);
  const [selectedLines, setSelectedLines] = useState([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Supplementary Invoice');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const chosen = lineItems.filter((it, idx) => selectedLines.includes(it.id ?? idx));
  const selectedValue = chosen.reduce((s, it) => s + lineTaxableValue(it), 0);

  // A debit note ADDS value, so the amount is not prefilled from the selection —
  // the lines only say which items are being topped up, and set the GST rate.
  const taxPct = chosen.length > 0
    ? (chosen.reduce((s, it) => s + lineTaxableValue(it) * (parseFloat(it.tax_percent) || 0), 0) /
        (selectedValue || 1))
    : inferTaxPercent(invoice);

  const toggleLine = (id) => setSelectedLines(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const base = parseFloat(amount) || 0;
  const tax = base * (taxPct / 100);
  const total = base + tax;

  const submit = async () => {
    if (base <= 0) return setError('Amount must be positive.');
    setError('');
    setSubmitting(true);
    try {
      const companyId = currentCompany?.id || invoice.company_id || localStorage.getItem('companyId');
      const lineSummary = chosen.length > 0
        ? `Lines revised: ${chosen.map((it, i) => it.name || it.description || `Line ${i + 1}`).join(', ')}`
        : '';
      await invoicesAPI.recordDebitNote(invoice.id, {
        amount: base,
        tax_percent: Number(taxPct.toFixed(4)),
        reason,
        notes: [lineSummary, notes].filter(Boolean).join(' — '),
        line_item_refs: chosen.map((it, i) => ({
          name: it.name || it.description || `Line ${i + 1}`,
          hsn: it.hsn || null,
          taxable_value: Number(lineTaxableValue(it).toFixed(2)),
          tax_percent: parseFloat(it.tax_percent) || 0,
        })),
      }, companyId);
      onSaved && await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to raise debit note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="invoice-mini-modal" onClick={e => e.stopPropagation()}>
        <div className="invoice-mini-modal-header">
          <h3>Raise Debit Note (Section 34(3))</h3>
          <button className="invoice-mini-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="invoice-mini-modal-info" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', color: '#1d4ed8' }}>
          <b>Supplementary Billing Compliance</b><br />
          An additional debit note will be raised, expanding the taxable value and liability for this invoice.
        </div>
        {error && <div className="invoice-modal-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="invoice-mini-field">
          <label>Supplementary Reason Code</label>
          <select value={reason} onChange={e => setReason(e.target.value)}>
            <option>Supplementary Invoice</option>
            <option>Under-charged in original invoice</option>
            <option>Additional service / goods</option>
            <option>Rate revision</option>
            <option>Other</option>
          </select>
        </div>
        <div className="invoice-mini-field">
          <label>Line items being revised</label>
          <LineItemPicker
            items={lineItems}
            selected={selectedLines}
            onToggle={toggleLine}
            emptyHint={`Invoice ${invoice?.invoice_number || ''} has no saved line items, so enter the additional amount directly below.`}
          />
          {selectedValue > 0 && (
            <span className="invoice-mini-hint">
              Currently billed at {fmtINR(selectedValue)} on the selected lines — enter the extra amount below.
            </span>
          )}
        </div>
        <div className="invoice-mini-field">
          <label>Additional adjustment details (optional)</label>
          <textarea rows="2" value={notes} maxLength={500}
            onChange={e => setNotes(e.target.value.replace(/[<>{}\\`$]/g, '').slice(0, 500))}
            placeholder="Any further explanation for this debit note…" />
        </div>
        <div className="invoice-mini-field">
          <label>Debit Note Amount (excluding GST)</label>
          <input type="text" inputMode="decimal" value={amount}
            onChange={e => {
              const v = e.target.value.replace(/[^\d.]/g, '');
              const dot = v.indexOf('.');
              setAmount(dot === -1 ? v.slice(0, 12) : v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2));
            }}
            placeholder="e.g. 500" />
        </div>
        {base > 0 && (
          <div className="invoice-mini-modal-preview">
            <div>Base amount: <b>{fmtINR(base)}</b></div>
            <div>GST addition ({Number(taxPct.toFixed(2))}%): <b>+{fmtINR(tax)}</b></div>
            <div>Total DN value: <b>{fmtINR(total)}</b></div>
            <div>New outstanding: <b>{fmtINR(outstanding + total)}</b></div>
          </div>
        )}
        <button className="invoice-mini-submit debit" onClick={submit} disabled={submitting}>
          {submitting ? 'Posting…' : 'Post Additional Ledger Entry'}
        </button>
      </div>
    </div>
  );
};
