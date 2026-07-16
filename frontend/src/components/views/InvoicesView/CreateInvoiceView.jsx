import React, { useState, useRef, useCallback } from 'react';
import './CreateInvoiceView.css';
import {
  ArrowLeft, Download, Save, Plus, Trash2, Building2, User, FileText,
  List, Calculator, CreditCard, StickyNote, Image
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ── Indian State Codes ──────────────────────────────────────────────
const INDIAN_STATES = [
  'Jammu & Kashmir (01)', 'Himachal Pradesh (02)', 'Punjab (03)', 'Chandigarh (04)',
  'Uttarakhand (05)', 'Haryana (06)', 'Delhi (07)', 'Rajasthan (08)', 'Uttar Pradesh (09)',
  'Bihar (10)', 'Sikkim (11)', 'Arunachal Pradesh (12)', 'Nagaland (13)', 'Manipur (14)',
  'Mizoram (15)', 'Tripura (16)', 'Meghalaya (17)', 'Assam (18)', 'West Bengal (19)',
  'Jharkhand (20)', 'Odisha (21)', 'Chhattisgarh (22)', 'Madhya Pradesh (23)',
  'Gujarat (24)', 'Daman & Diu (25)', 'Dadra & Nagar Haveli (26)', 'Maharashtra (27)',
  'Andhra Pradesh (28)', 'Karnataka (29)', 'Goa (30)', 'Lakshadweep (31)',
  'Kerala (32)', 'Tamil Nadu (33)', 'Puducherry (34)', 'Andaman & Nicobar Islands (35)',
  'Telangana (36)', 'Andhra Pradesh (New) (37)', 'Ladakh (38)'
];

const TAX_RATES = [0, 5, 12, 18, 28];
const UNITS = ['Nos', 'Kg', 'L', 'M', 'Sq.M', 'Hrs', 'Pcs', 'Boxes', 'Sets'];
const PAYMENT_TERMS = ['Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt'];
const PAYMENT_MODES = ['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'Online'];

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

function amountInWords(amount) {
  if (!amount || amount === 0) return 'Zero Rupees Only';
  const int = Math.floor(amount);
  const dec = Math.round((amount - int) * 100);
  let result = 'Rupees ' + numToWords(int);
  if (dec > 0) result += ' and ' + numToWords(dec) + ' Paise';
  return result + ' Only';
}

function fmtINR(n) {
  if (!n || isNaN(n)) return '₹0.00';
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => {
  const dt = new Date(d); dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

const defaultLineItem = () => ({
  id: Date.now(),
  name: '', description: '', hsn: '',
  quantity: 1, unit: 'Nos', unit_price: 0,
  discount_percent: 0, tax_percent: 18, cess_percent: 0
});

// ── Compute line item amount ────────────────────────────────────────
function lineAmount(item) {
  const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  const disc = base * ((parseFloat(item.discount_percent) || 0) / 100);
  const taxable = base - disc;
  const tax = taxable * ((parseFloat(item.tax_percent) || 0) / 100);
  const cess = taxable * ((parseFloat(item.cess_percent) || 0) / 100);
  return taxable + tax + cess;
}

// ── PDF Preview Component ───────────────────────────────────────────
const InvoicePDF = React.forwardRef(({ form, totals, taxScheme }, ref) => {
  const invDate = form.issue_date ? new Date(form.issue_date).toLocaleDateString('en-IN') : '—';
  const dueDate = form.due_date ? new Date(form.due_date).toLocaleDateString('en-IN') : '—';

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
              #{form._invoiceNumber || 'INV-XXXX-XXXX'}
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

        {/* ACK + IRN row */}
        <div className="ci-pdf-ack-row">
          <div className="ci-pdf-ack-block">
            <span className="ci-pdf-ack-label">ACK Number</span>
            <span className="ci-pdf-ack-value">{form._ackNumber || 'ACK-XXXX-INV-XXXXX'}</span>
          </div>
          <div className="ci-pdf-ack-block">
            <span className="ci-pdf-ack-label">Acknowledgement Date</span>
            <span className="ci-pdf-ack-value">{invDate}</span>
          </div>
          <div className="ci-pdf-ack-block" style={{ flex: 1 }}>
            <span className="ci-pdf-ack-label">IRN</span>
            <span className="ci-pdf-ack-value" style={{ fontSize: 9, wordBreak: 'break-all' }}>
              {form._irn || '(generated on save)'}
            </span>
          </div>
        </div>

        {/* Bill To */}
        <div className="ci-pdf-bill-area">
          <div className="ci-pdf-bill-left">
            <div className="ci-pdf-bill-label">Bill To</div>
            <div className="ci-pdf-client-name">{form.client_name || '—'}</div>
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
            {form.line_items.length === 0 && (
              <tr><td colSpan={6} style={{ color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No line items yet</td></tr>
            )}
            {form.line_items.map((item, idx) => {
              const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
              const disc = base * ((parseFloat(item.discount_percent) || 0) / 100);
              const taxable = base - disc;
              return (
                <tr key={item.id}>
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
            <div className="ci-pdf-totals-row"><span>Subtotal</span><span>{fmtINR(totals.subtotal)}</span></div>
            {totals.totalDiscount > 0 && <div className="ci-pdf-totals-row"><span>Total Discount</span><span style={{ color: '#ef4444' }}>-{fmtINR(totals.totalDiscount)}</span></div>}
            {taxScheme === 'IGST' ? (
              totals.igstTotal > 0 && <div className="ci-pdf-totals-row"><span>IGST</span><span>{fmtINR(totals.igstTotal)}</span></div>
            ) : (
              <>
                {totals.cgstTotal > 0 && <div className="ci-pdf-totals-row"><span>CGST ({totals.avgTax / 2}%)</span><span>{fmtINR(totals.cgstTotal)}</span></div>}
                {totals.sgstTotal > 0 && <div className="ci-pdf-totals-row"><span>SGST ({totals.avgTax / 2}%)</span><span>{fmtINR(totals.sgstTotal)}</span></div>}
              </>
            )}
            {totals.cessTotal > 0 && <div className="ci-pdf-totals-row"><span>Cess</span><span>{fmtINR(totals.cessTotal)}</span></div>}
            <div className="ci-pdf-totals-row total-due">
              <span>Total Due</span><span>{fmtINR(totals.grandTotal)}</span>
            </div>
            <div className="ci-pdf-amount-words">{amountInWords(totals.grandTotal)}</div>
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
InvoicePDF.displayName = 'InvoicePDF';

// ── Main Component ──────────────────────────────────────────────────
const CreateInvoiceView = ({ onBack, onCreateInvoice, currentCompany }) => {
  const pdfRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const [form, setForm] = useState({
    type: 'receivable',
    // Entity
    entity_name: currentCompany?.name || '',
    entity_gstin: currentCompany?.gstin || '',
    entity_pan: currentCompany?.pan || '',
    entity_reg: '',
    entity_address: currentCompany?.address || '',
    supplier_state: 'Maharashtra (27)',
    entity_logo: null,
    // Client
    client_name: '',
    client_email: '',
    client_address: '',
    place_of_supply: 'Maharashtra (27)',
    client_gstin: '',
    client_contact: '',
    client_phone: '',
    // Invoice meta
    issue_date: today(),
    due_date: addDays(today(), 15),
    currency: 'INR',
    po_number: '',
    payment_terms: 'Net 15',
    // Line items
    line_items: [defaultLineItem()],
    // Amount paid
    amount_paid: 0,
    // Payment details
    payment_account_holder: '',
    payment_bank_name: '',
    payment_account_number: '',
    payment_ifsc: '',
    payment_upi: '',
    payment_mode: 'Bank Transfer',
    // Notes
    notes: '',
    // Placeholders for preview
    _invoiceNumber: `INV-${new Date().getFullYear()}-XXXX`,
    _ackNumber: '',
    _irn: '',
  });

  // Update form helper
  const upd = useCallback((key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      // Auto-compute due date from payment terms
      if (key === 'payment_terms' && next.issue_date) {
        const days = parseInt(val.replace('Net ', '')) || 15;
        if (!isNaN(days)) next.due_date = addDays(next.issue_date, days);
      }
      if (key === 'issue_date' && next.payment_terms) {
        const days = parseInt(next.payment_terms.replace('Net ', '')) || 15;
        if (!isNaN(days)) next.due_date = addDays(val, days);
      }
      return next;
    });
  }, []);

  const updItem = useCallback((id, key, val) => {
    setForm(prev => ({
      ...prev,
      line_items: prev.line_items.map(item => item.id === id ? { ...item, [key]: val } : item)
    }));
  }, []);

  const addItem = () => setForm(prev => ({ ...prev, line_items: [...prev.line_items, defaultLineItem()] }));
  const removeItem = (id) => setForm(prev => ({ ...prev, line_items: prev.line_items.filter(i => i.id !== id) }));

  // Compute totals
  const totals = React.useMemo(() => {
    let subtotal = 0, totalDiscount = 0, igstTotal = 0, cgstTotal = 0, sgstTotal = 0, cessTotal = 0;
    let taxableTotal = 0, totalTaxPercent = 0;

    form.line_items.forEach(item => {
      const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
      const disc = base * ((parseFloat(item.discount_percent) || 0) / 100);
      const taxable = base - disc;
      const taxPct = parseFloat(item.tax_percent) || 0;
      const cessPct = parseFloat(item.cess_percent) || 0;
      const tax = taxable * (taxPct / 100);
      const cess = taxable * (cessPct / 100);

      subtotal += base;
      totalDiscount += disc;
      taxableTotal += taxable;
      totalTaxPercent += taxPct;
      cessTotal += cess;

      const isInterstate = form.supplier_state !== form.place_of_supply;
      if (isInterstate) {
        igstTotal += tax;
      } else {
        cgstTotal += tax / 2;
        sgstTotal += tax / 2;
      }
    });

    const grandTotal = taxableTotal + igstTotal + cgstTotal + sgstTotal + cessTotal;
    const balanceDue = Math.max(0, grandTotal - (parseFloat(form.amount_paid) || 0));
    const avgTax = form.line_items.length ? totalTaxPercent / form.line_items.length : 0;

    return { subtotal, totalDiscount, igstTotal, cgstTotal, sgstTotal, cessTotal, grandTotal, balanceDue, avgTax };
  }, [form.line_items, form.supplier_state, form.place_of_supply, form.amount_paid]);

  const taxScheme = form.supplier_state !== form.place_of_supply ? 'IGST' : 'CGST+SGST';

  // Logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => upd('entity_logo', ev.target.result);
    reader.readAsDataURL(file);
  };

  // Download PDF
  const handleDownload = async () => {
    if (!pdfRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const invName = form._invoiceNumber || `invoice-${Date.now()}`;
      pdf.save(`${invName}.pdf`);
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  // Save invoice
  const handleSave = async () => {
    if (!form.client_name.trim()) return setError('Client / Vendor name is required.');
    if (form.line_items.length === 0) return setError('Add at least one line item.');
    if (!form.issue_date) return setError('Issue date is required.');

    setSubmitting(true);
    setError('');
    try {
      await onCreateInvoice({
        type: form.type,
        client_name: form.client_name.trim(),
        vendor_name: form.type === 'payable' ? form.client_name.trim() : undefined,
        issue_date: form.issue_date,
        due_date: form.due_date,
        notes: form.notes,
        // Entity
        entity_name: form.entity_name,
        entity_gstin: form.entity_gstin,
        entity_pan: form.entity_pan,
        entity_reg: form.entity_reg,
        entity_address: form.entity_address,
        supplier_state: form.supplier_state,
        entity_logo: form.entity_logo,
        // Client
        client_email: form.client_email,
        client_address: form.client_address,
        place_of_supply: form.place_of_supply,
        client_gstin: form.client_gstin,
        client_contact: form.client_contact,
        client_phone: form.client_phone,
        // Meta
        currency: form.currency,
        po_number: form.po_number,
        payment_terms: form.payment_terms,
        // Line items & totals
        line_items: form.line_items.map(({ id, ...rest }) => rest),
        subtotal: totals.subtotal,
        total_discount: totals.totalDiscount,
        cgst_total: totals.cgstTotal,
        sgst_total: totals.sgstTotal,
        igst_total: totals.igstTotal,
        cess_total: totals.cessTotal,
        grand_total: totals.grandTotal,
        amount: totals.grandTotal,
        amount_paid: parseFloat(form.amount_paid) || 0,
        balance_due: totals.balanceDue,
        tax_scheme: taxScheme,
        // Payment
        payment_account_holder: form.payment_account_holder,
        payment_bank_name: form.payment_bank_name,
        payment_account_number: form.payment_account_number,
        payment_ifsc: form.payment_ifsc,
        payment_upi: form.payment_upi,
        payment_mode: form.payment_mode,
      });
      onBack();
    } catch (err) {
      setError('Failed to save invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ci-page">
      {/* ── LEFT: Form ── */}
      <div className="ci-form-panel">
        {/* Top bar */}
        <div className="ci-form-topbar">
          <div className="ci-form-topbar-left">
            <button className="ci-back-btn" onClick={onBack}><ArrowLeft size={15} /> Back</button>
            <span className="ci-form-title">New Invoice</span>
          </div>
          <div className="ci-form-actions">
            <button className="ci-btn-cancel" onClick={onBack}>Cancel</button>
            <button className="ci-btn-save" onClick={handleSave} disabled={submitting}>
              <Save size={15} style={{ marginRight: 5 }} />
              {submitting ? 'Saving...' : 'Save Invoice'}
            </button>
          </div>
        </div>

        <div className="ci-form-body">
          {error && <div className="ci-error-bar">{error}</div>}

          {/* Type Toggle */}
          <div className="ci-type-toggle">
            <button
              className={`ci-type-btn ${form.type === 'receivable' ? 'active-rec' : ''}`}
              onClick={() => upd('type', 'receivable')}>
              Receivable (Sales)
            </button>
            <button
              className={`ci-type-btn ${form.type === 'payable' ? 'active-pay' : ''}`}
              onClick={() => upd('type', 'payable')}>
              Payable (Purchase)
            </button>
          </div>

          {/* ── Section 1: Entity Details ── */}
          <div className="ci-section">
            <div className="ci-section-header">
              <Building2 size={16} className="ci-section-icon" />
              <span className="ci-section-title">Your Entity Details</span>
            </div>

            {/* Logo Uploader */}
            <label className="ci-logo-uploader">
              {form.entity_logo
                ? <img src={form.entity_logo} className="ci-logo-preview" alt="logo" />
                : <div className="ci-logo-placeholder"><Image size={20} /><span style={{ marginTop: 4, fontSize: 9 }}>Upload Logo</span></div>}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Company Logo</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>PNG, JPG — appears on PDF</div>
              </div>
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
            </label>

            <div className="ci-grid-2">
              <div className="ci-field">
                <label>Entity Name <span className="req">*</span></label>
                <input value={form.entity_name} onChange={e => upd('entity_name', e.target.value)} placeholder="Your company name" />
              </div>
              <div className="ci-field">
                <label>GSTIN</label>
                <input value={form.entity_gstin} onChange={e => upd('entity_gstin', e.target.value)} placeholder="29ABCDE1234F1Z5" />
              </div>
              <div className="ci-field">
                <label>PAN</label>
                <input value={form.entity_pan} onChange={e => upd('entity_pan', e.target.value)} placeholder="ABCDE1234F" />
              </div>
              <div className="ci-field">
                <label>Registration Number</label>
                <input value={form.entity_reg} onChange={e => upd('entity_reg', e.target.value)} placeholder="e.g. MH2024ABC1234" />
              </div>
            </div>
            <div className="ci-grid-2" style={{ marginTop: 14 }}>
              <div className="ci-field">
                <label>Billing Address</label>
                <input value={form.entity_address} onChange={e => upd('entity_address', e.target.value)} placeholder="Full address" />
              </div>
              <div className="ci-field">
                <label>Supplier State Code <span className="req">*</span></label>
                <select value={form.supplier_state} onChange={e => upd('supplier_state', e.target.value)}>
                  {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 2: Client Details ── */}
          <div className="ci-section">
            <div className="ci-section-header">
              <User size={16} className="ci-section-icon" />
              <span className="ci-section-title">{form.type === 'payable' ? 'Vendor Details' : 'Client Details'}</span>
            </div>
            <div className="ci-grid-2">
              <div className="ci-field">
                <label>{form.type === 'payable' ? 'Vendor Name' : 'Client Name'} <span className="req">*</span></label>
                <input value={form.client_name} onChange={e => upd('client_name', e.target.value)}
                  placeholder={form.type === 'payable' ? 'Vendor name' : 'Client name'} />
              </div>
              <div className="ci-field">
                <label>Email Address</label>
                <input type="email" value={form.client_email} onChange={e => upd('client_email', e.target.value)} placeholder="client@example.com" />
              </div>
            </div>
            <div className="ci-grid-1" style={{ marginTop: 14 }}>
              <div className="ci-field">
                <label>Billing Address</label>
                <input value={form.client_address} onChange={e => upd('client_address', e.target.value)} placeholder="Client's full address" />
              </div>
            </div>
            <div className="ci-grid-2" style={{ marginTop: 14 }}>
              <div className="ci-field">
                <label>Place of Supply (State Code) <span className="req">*</span></label>
                <select value={form.place_of_supply} onChange={e => upd('place_of_supply', e.target.value)}>
                  {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="ci-field">
                <label>Client GSTIN</label>
                <input value={form.client_gstin} onChange={e => upd('client_gstin', e.target.value)} placeholder="Client GSTIN" />
              </div>
              <div className="ci-field">
                <label>Contact Person</label>
                <input value={form.client_contact} onChange={e => upd('client_contact', e.target.value)} placeholder="Contact name" />
              </div>
              <div className="ci-field">
                <label>Phone Number</label>
                <input value={form.client_phone} onChange={e => upd('client_phone', e.target.value)} placeholder="+91 98765 43210" />
              </div>
            </div>
          </div>

          {/* ── Section 3: Invoice Details ── */}
          <div className="ci-section">
            <div className="ci-section-header">
              <FileText size={16} className="ci-section-icon" />
              <span className="ci-section-title">Invoice Details</span>
            </div>
            <div className="ci-grid-3">
              <div className="ci-field">
                <label>Invoice Number</label>
                <input value={form._invoiceNumber} readOnly style={{ background: '#f1f5f9', color: '#94a3b8' }}
                  placeholder="Auto-generated on save" />
              </div>
              <div className="ci-field">
                <label>Issue Date <span className="req">*</span></label>
                <input type="date" value={form.issue_date} onChange={e => upd('issue_date', e.target.value)} />
              </div>
              <div className="ci-field">
                <label>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => upd('due_date', e.target.value)} />
              </div>
              <div className="ci-field">
                <label>Currency</label>
                <select value={form.currency} onChange={e => upd('currency', e.target.value)}>
                  <option>INR</option><option>USD</option><option>EUR</option><option>GBP</option>
                </select>
              </div>
              <div className="ci-field">
                <label>PO Number</label>
                <input value={form.po_number} onChange={e => upd('po_number', e.target.value)} placeholder="Optional" />
              </div>
              <div className="ci-field">
                <label>Payment Terms <span className="req">*</span></label>
                <select value={form.payment_terms} onChange={e => upd('payment_terms', e.target.value)}>
                  {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 4: Line Items ── */}
          <div className="ci-section">
            <div className="ci-section-header">
              <List size={16} className="ci-section-icon" />
              <span className="ci-section-title">Line Items</span>
              <div className={`ci-tax-scheme ${taxScheme === 'IGST' ? 'igst' : 'cgst'}`} style={{ marginLeft: 'auto' }}>
                {taxScheme === 'IGST' ? '⚡ INTERSTATE — IGST' : '✓ INTRASTATE — CGST + SGST'}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="ci-line-items-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Item & Description</th>
                    <th style={{ width: '10%' }}>HSN/SAC</th>
                    <th style={{ width: '7%' }}>QTY</th>
                    <th style={{ width: '9%' }}>Unit</th>
                    <th style={{ width: '11%' }}>Unit Price</th>
                    <th style={{ width: '8%' }}>Disc %</th>
                    <th style={{ width: '9%' }}>Tax %</th>
                    <th style={{ width: '8%' }}>Cess %</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.line_items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <input className="ci-li-input" value={item.name}
                          onChange={e => updItem(item.id, 'name', e.target.value)} placeholder="Item name" />
                        <input className="ci-li-input" value={item.description} style={{ marginTop: 4, fontSize: 11 }}
                          onChange={e => updItem(item.id, 'description', e.target.value)} placeholder="Description (optional)" />
                      </td>
                      <td><input className="ci-li-input" value={item.hsn}
                        onChange={e => updItem(item.id, 'hsn', e.target.value)} placeholder="HSN" /></td>
                      <td><input className="ci-li-input" type="number" min="0" value={item.quantity}
                        onChange={e => updItem(item.id, 'quantity', e.target.value)} /></td>
                      <td>
                        <select className="ci-li-input" value={item.unit}
                          onChange={e => updItem(item.id, 'unit', e.target.value)}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td><input className="ci-li-input" type="number" min="0" value={item.unit_price}
                        onChange={e => updItem(item.id, 'unit_price', e.target.value)} /></td>
                      <td><input className="ci-li-input" type="number" min="0" max="100" value={item.discount_percent}
                        onChange={e => updItem(item.id, 'discount_percent', e.target.value)} /></td>
                      <td>
                        <select className="ci-li-input" value={item.tax_percent}
                          onChange={e => updItem(item.id, 'tax_percent', parseFloat(e.target.value))}>
                          {TAX_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td><input className="ci-li-input" type="number" min="0" value={item.cess_percent}
                        onChange={e => updItem(item.id, 'cess_percent', e.target.value)} /></td>
                      <td className="ci-li-amount">{fmtINR(lineAmount(item))}</td>
                      <td>
                        <button className="ci-remove-item-btn" onClick={() => removeItem(item.id)}
                          disabled={form.line_items.length === 1} title="Remove item">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ci-add-item-btn" onClick={addItem}><Plus size={15} /> Add Line Item</button>
          </div>

          {/* ── Section 5: Totals ── */}
          <div className="ci-section">
            <div className="ci-section-header">
              <Calculator size={16} className="ci-section-icon" />
              <span className="ci-section-title">Totals & Summary</span>
            </div>
            <div className="ci-grid-2">
              <div>
                <div className="ci-totals-box">
                  <div className="ci-totals-row"><span>Subtotal</span><span>{fmtINR(totals.subtotal)}</span></div>
                  {totals.totalDiscount > 0 && <div className="ci-totals-row"><span>Total Discount</span><span style={{ color: '#ef4444' }}>-{fmtINR(totals.totalDiscount)}</span></div>}
                  {taxScheme === 'IGST'
                    ? <div className="ci-totals-row"><span>IGST</span><span>{fmtINR(totals.igstTotal)}</span></div>
                    : <>
                      <div className="ci-totals-row"><span>CGST</span><span>{fmtINR(totals.cgstTotal)}</span></div>
                      <div className="ci-totals-row"><span>SGST</span><span>{fmtINR(totals.sgstTotal)}</span></div>
                    </>}
                  {totals.cessTotal > 0 && <div className="ci-totals-row"><span>Cess</span><span>{fmtINR(totals.cessTotal)}</span></div>}
                  <div className="ci-totals-row grand"><span>Grand Total</span><span>{fmtINR(totals.grandTotal)}</span></div>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
                  {amountInWords(totals.grandTotal)}
                </div>
              </div>
              <div>
                <div className="ci-field" style={{ marginBottom: 12 }}>
                  <label>Amount Paid (₹)</label>
                  <input type="number" min="0" value={form.amount_paid}
                    onChange={e => upd('amount_paid', e.target.value)}
                    placeholder="0" />
                </div>
                <div className="ci-totals-box">
                  <div className="ci-totals-row balance">
                    <span>Balance Due</span>
                    <span>{fmtINR(totals.balanceDue)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 6: Payment Details ── */}
          <div className="ci-section">
            <div className="ci-section-header">
              <CreditCard size={16} className="ci-section-icon" />
              <span className="ci-section-title">Payment Details</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Your bank account — printed on the invoice PDF
            </div>
            <div className="ci-grid-2">
              <div className="ci-field">
                <label>Account Holder Name</label>
                <input value={form.payment_account_holder} onChange={e => upd('payment_account_holder', e.target.value)} placeholder="e.g. Acme Solutions Pvt Ltd" />
              </div>
              <div className="ci-field">
                <label>Bank Name</label>
                <input value={form.payment_bank_name} onChange={e => upd('payment_bank_name', e.target.value)} placeholder="e.g. HDFC Bank" />
              </div>
              <div className="ci-field">
                <label>Account Number</label>
                <input value={form.payment_account_number} onChange={e => upd('payment_account_number', e.target.value)} placeholder="50200001234567" />
              </div>
              <div className="ci-field">
                <label>IFSC Code</label>
                <input value={form.payment_ifsc} onChange={e => upd('payment_ifsc', e.target.value)} placeholder="HDFC0001234" />
              </div>
              <div className="ci-field">
                <label>UPI ID (Optional)</label>
                <input value={form.payment_upi} onChange={e => upd('payment_upi', e.target.value)} placeholder="acme@hdfc" />
              </div>
              <div className="ci-field">
                <label>Preferred Payment Mode</label>
                <select value={form.payment_mode} onChange={e => upd('payment_mode', e.target.value)}>
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 7: Notes ── */}
          <div className="ci-section">
            <div className="ci-section-header">
              <StickyNote size={16} className="ci-section-icon" />
              <span className="ci-section-title">Notes & Terms</span>
            </div>
            <div className="ci-field">
              <label>Notes / Additional Terms</label>
              <textarea value={form.notes} onChange={e => upd('notes', e.target.value)}
                placeholder="Any special instructions, terms, or notes printed on the invoice..." rows={3} />
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: PDF Preview ── */}
      <div className="ci-preview-panel">
        <div className="ci-preview-topbar">
          <span className="ci-preview-label">📄 Live PDF Preview</span>
          <button className="ci-btn-download" onClick={handleDownload} disabled={downloading}>
            <Download size={15} />
            {downloading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
        <InvoicePDF ref={pdfRef} form={form} totals={totals} taxScheme={taxScheme} />
      </div>
    </div>
  );
};

export default CreateInvoiceView;
