import React from 'react';
import './InvoicePDFTemplate.css';

// ── Number to Words ─────────────────────────────────────────────────
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numToWords(n) {
  if (!n || isNaN(n)) return 'Zero';
  n = Math.round(n);
  if (n === 0) return 'Zero';
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
  if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
  if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
  return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
}

export function amountInWords(amount) {
  if (!amount || amount === 0) return 'Zero Rupees Only';
  const int = Math.floor(amount);
  const dec = Math.round((amount - int) * 100);
  let result = 'Rupees ' + numToWords(int);
  if (dec > 0) result += ' and ' + numToWords(dec) + ' Paise';
  return result + ' Only';
}

export function fmtINR(n) {
  if (!n || isNaN(n)) return '₹0.00';
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── PDF Preview Component ───────────────────────────────────────────
const InvoicePDFTemplate = React.forwardRef(({ form, totals, taxScheme }, ref) => {
  const invDate = form.issue_date ? new Date(form.issue_date).toLocaleDateString('en-IN') : '—';
  const dueDate = form.due_date ? new Date(form.due_date).toLocaleDateString('en-IN') : '—';
  const lineItems = Array.isArray(form.line_items) ? form.line_items : (typeof form.line_items === 'string' ? JSON.parse(form.line_items || '[]') : []);

  return (
    <div className="ci-pdf-wrapper" ref={ref}>
      <div className="ci-pdf" id="invoice-pdf-content">

        {/* Header */}
        <div className="ci-pdf-header">
          <div className="ci-pdf-logo-area">
            {form.entity_logo
              ? <img src={form.entity_logo} className="ci-pdf-logo" alt="logo" />
              : <div className="ci-pdf-logo-placeholder" />}
            <div className="ci-pdf-entity-name">{form.entity_name || 'Your Company'}</div>
            <div className="ci-pdf-entity-sub">{form.entity_address || ''}</div>
            <div className="ci-pdf-entity-meta">
              {form.entity_gstin && <div>GSTIN: {form.entity_gstin}</div>}
              {form.entity_pan && <div>PAN: {form.entity_pan}</div>}
              {form.entity_reg && <div>REG: {form.entity_reg}</div>}
            </div>
          </div>

          <div className="ci-pdf-title-area">
            <div className="ci-pdf-title">Tax Invoice</div>
            <div className="ci-pdf-inv-number" style={{ color: '#6b7280', marginBottom: 8 }}>
              #{form.invoice_number || form._invoiceNumber || 'INV-XXXX-XXXX'}
            </div>
            <div className="ci-pdf-meta-grid">
              <div className="ci-pdf-meta-row">
                <span className="ci-pdf-meta-label">Invoice Date</span>
                <span className="ci-pdf-meta-value">{invDate}</span>
              </div>
              <div className="ci-pdf-meta-row">
                <span className="ci-pdf-meta-label">Due Date</span>
                <span className="ci-pdf-meta-value">{dueDate}</span>
              </div>
              {form.po_number && <div className="ci-pdf-meta-row">
                <span className="ci-pdf-meta-label">PO Number</span>
                <span className="ci-pdf-meta-value">{form.po_number}</span>
              </div>}
              <div className="ci-pdf-meta-row">
                <span className="ci-pdf-meta-label">Type</span>
                <span className="ci-pdf-meta-value" style={{ textTransform: 'capitalize' }}>
                  {form.type === 'receivable' ? 'Receivable' : 'Payable'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <hr className="ci-pdf-divider" />

        <hr className="ci-pdf-divider" />

        {/* ACK + IRN row */}
        {(form.irn_number || form._irn) ? (
          <div className="ci-pdf-irn-box">
            <div className="ci-pdf-irn-top">
              <span className="ci-pdf-irn-badge">IRP NIC SECURE</span>
              <span className="ci-pdf-irn-status">STATUS: E-INVOICE GENERATED</span>
            </div>
            <div className="ci-pdf-irn-label">INVOICE REFERENCE NUMBER (IRN)</div>
            <div className="ci-pdf-irn-hash">{form.irn_number || form._irn}</div>
            <div className="ci-pdf-irn-meta">
              <div className="ci-pdf-ack-block">
                <span className="ci-pdf-ack-label">ACKNOWLEDGEMENT NUMBER</span>
                <span className="ci-pdf-ack-value">{form.ack_number || form._ackNumber}</span>
              </div>
              <div className="ci-pdf-ack-block">
                <span className="ci-pdf-ack-label">ACKNOWLEDGEMENT DATE</span>
                <span className="ci-pdf-ack-value">{form._ackDate || invDate}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="ci-pdf-irn-box" style={{ padding: '24px 14px', textAlign: 'center' }}>
            <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>No IRN Generated</span>
          </div>
        )}

        {/* Bill To */}
        <div className="ci-pdf-bill-area">
          <div className="ci-pdf-bill-left">
            <div className="ci-pdf-bill-label">Bill To</div>
            <div className="ci-pdf-client-name">{form.client_name || form.vendor_name || '—'}</div>
            <div className="ci-pdf-client-sub">{form.client_address || ''}</div>
            <div className="ci-pdf-client-meta">
              {form.client_gstin && <div>GSTIN: {form.client_gstin}</div>}
              {form.place_of_supply && <div>PLACE OF SUPPLY: {form.place_of_supply.toUpperCase()}</div>}
              {(form.client_contact || form.client_phone) &&
                <div>CONTACT: {[form.client_contact, form.client_phone].filter(Boolean).join(' · ')}</div>}
            </div>
          </div>
          <div className="ci-pdf-bill-right">
            {form.supplier_state && <div className="ci-pdf-tax-scheme">SUPPLIER STATE: <strong>{form.supplier_state.toUpperCase()}</strong></div>}
            <div className="ci-pdf-tax-scheme">TAX SCHEME: <strong>{taxScheme === 'IGST' ? 'IGST (INTERSTATE)' : 'CGST + SGST (INTRASTATE)'}</strong></div>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="ci-pdf-items-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>SR</th>
              <th>Description</th>
              <th>HSN / SAC</th>
              <th>QTY</th>
              <th>Rate</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 && (
              <tr><td colSpan={6} style={{ color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No line items yet</td></tr>
            )}
            {lineItems.map((item, idx) => {
              const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
              const disc = base * ((parseFloat(item.discount_percent) || 0) / 100);
              const taxable = base - disc;
              return (
                <tr key={item.id || idx}>
                  <td style={{ color: '#6b7280' }}>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.name || <span style={{ color: '#9ca3af' }}>Item name</span>}</div>
                    {item.description && <div className="ci-pdf-item-desc">{item.description}</div>}
                  </td>
                  <td style={{ color: '#6b7280' }}>{item.hsn || '—'}</td>
                  <td>{parseFloat(item.quantity) || 1} {item.unit}</td>
                  <td>{fmtINR(item.unit_price)}</td>
                  <td>{fmtINR(taxable)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <hr className="ci-pdf-thin-divider" />

        {/* Bottom: Bank + Totals */}
        <div className="ci-pdf-bottom">
          {/* Bank Details */}
          <div className="ci-pdf-bank">
            <div className="ci-pdf-bank-title">Bank Details</div>
            {form.payment_account_holder && <div className="ci-pdf-bank-line" style={{ fontWeight: 700 }}>{form.payment_account_holder}</div>}
            {form.payment_bank_name && <div className="ci-pdf-bank-line">Bank: {form.payment_bank_name}</div>}
            {form.payment_account_number && <div className="ci-pdf-bank-line">A/C No: {form.payment_account_number}</div>}
            {form.payment_ifsc && <div className="ci-pdf-bank-line">IFSC: {form.payment_ifsc}</div>}
            {form.payment_upi && <div className="ci-pdf-bank-line">UPI: {form.payment_upi}</div>}
            <div className="ci-pdf-bank-line">Mode: {form.payment_mode || 'Bank Transfer'}</div>
            {form.payment_terms && <div className="ci-pdf-bank-line">Terms: {form.payment_terms}</div>}
          </div>

          {/* Totals */}
          <div className="ci-pdf-totals">
            {/* Line-item subtotal (pre-discount, pre-tax) */}
            <div className="ci-pdf-totals-row">
              <span>Subtotal</span>
              <span>{fmtINR((totals.subtotal || 0) + (totals.totalDiscount || 0))}</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="ci-pdf-totals-row">
                <span>Discount</span>
                <span style={{ color: '#ef4444' }}>-{fmtINR(totals.totalDiscount)}</span>
              </div>
            )}
            <div className="ci-pdf-totals-row" style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 6, marginTop: 2 }}>
              <span>Taxable Value</span>
              <span>{fmtINR(totals.subtotal)}</span>
            </div>
            {taxScheme === 'IGST' ? (
              totals.igstTotal > 0 && (
                <div className="ci-pdf-totals-row">
                  <span>IGST ({totals.avgTax}%)</span>
                  <span>{fmtINR(totals.igstTotal)}</span>
                </div>
              )
            ) : (
              <>
                {totals.cgstTotal > 0 && (
                  <div className="ci-pdf-totals-row">
                    <span>CGST ({totals.avgTax / 2}%)</span>
                    <span>{fmtINR(totals.cgstTotal)}</span>
                  </div>
                )}
                {totals.sgstTotal > 0 && (
                  <div className="ci-pdf-totals-row">
                    <span>SGST ({totals.avgTax / 2}%)</span>
                    <span>{fmtINR(totals.sgstTotal)}</span>
                  </div>
                )}
              </>
            )}
            {totals.cessTotal > 0 && (
              <div className="ci-pdf-totals-row">
                <span>CESS</span>
                <span>{fmtINR(totals.cessTotal)}</span>
              </div>
            )}
            <div className="ci-pdf-totals-row total-due">
              <span>Total</span><span>{fmtINR(totals.grandTotal)}</span>
            </div>
            {parseFloat(form.debit_notes_total || 0) > 0 && (
              <div className="ci-pdf-totals-row" style={{ color: '#d97706' }}>
                <span>Debit Notes (+)</span>
                <span>+{fmtINR(form.debit_notes_total)}</span>
              </div>
            )}
            {parseFloat(form.credit_notes_total || 0) > 0 && (
              <div className="ci-pdf-totals-row" style={{ color: '#059669' }}>
                <span>Credit Notes (−)</span>
                <span>-{fmtINR(form.credit_notes_total)}</span>
              </div>
            )}
            {parseFloat(form.amount_paid || 0) > 0 && (
              <div className="ci-pdf-totals-row" style={{ color: '#3b82f6' }}>
                <span>Amount Paid</span>
                <span>-{fmtINR(form.amount_paid)}</span>
              </div>
            )}
            {(() => {
              const grand = parseFloat(totals.grandTotal) || 0;
              const dn = parseFloat(form.debit_notes_total || 0);
              const cn = parseFloat(form.credit_notes_total || 0);
              const paid = parseFloat(form.amount_paid || 0);
              const backendOutstanding = form.outstanding !== undefined ? parseFloat(form.outstanding) : null;
              const balance = backendOutstanding !== null
                ? Math.max(0, backendOutstanding)
                : Math.max(0, grand + dn - cn - paid);
              return (
                <>
                  <div className="ci-pdf-totals-row" style={{ fontWeight: 800, color: '#111827', borderTop: '1px solid #111827', paddingTop: 6, marginTop: 2 }}>
                    <span>Balance Due</span>
                    <span>{fmtINR(balance)}</span>
                  </div>
                  <div className="ci-pdf-amount-words">{amountInWords(balance)}</div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="ci-pdf-terms">
          <div className="ci-pdf-terms-title">Terms & Conditions</div>
          <div className="ci-pdf-term-item">1. Payment is due by the date specified above. Late payments may attract interest at 18% per annum.</div>
          <div className="ci-pdf-term-item">2. Goods once sold will not be taken back unless damaged or defective upon delivery.</div>
          <div className="ci-pdf-term-item">3. All disputes are subject to the jurisdiction of courts in the place of supply.</div>
          {form.payment_terms && <div className="ci-pdf-term-item">4. Payment terms: {form.payment_terms}.</div>}
          {form.notes && <div className="ci-pdf-term-item">5. {form.notes}</div>}
        </div>

        {/* Authorised Signatory */}
        <div className="ci-pdf-sig-area">
          <div className="ci-pdf-sig-line" />
          <div className="ci-pdf-sig-name">{form.entity_name || 'Company Name'}</div>
          <div className="ci-pdf-sig-role">Authorised Signatory</div>
        </div>

        <div className="ci-pdf-footer">This is a computer generated invoice. No physical signature required.</div>
      </div>
    </div>
  );
});

InvoicePDFTemplate.displayName = 'InvoicePDFTemplate';
export default InvoicePDFTemplate;
