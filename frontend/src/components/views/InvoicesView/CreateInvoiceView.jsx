import React, { useState, useRef, useCallback, useEffect } from 'react';
import './CreateInvoiceView.css';
import {
  ArrowLeft, Download, Save, Plus, Trash2, Building2, User, FileText,
  List, Calculator, CreditCard, StickyNote, Image, RefreshCw, AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { invoicesAPI } from '../../../services/api';
import InvoicePDFTemplate, { amountInWords, fmtINR } from '../../common/InvoicePDFTemplate';
import { useApeilo } from '../../../context/ApeiloContext';
import {
  MAX,
  sanitiseText, sanitiseMultiline, sanitiseAlphaNumUpper, sanitiseDigits,
  sanitisePhone, sanitiseEmail, sanitiseUpi, sanitiseAmount,
  validateGSTIN, validatePAN, validateIFSC, validateAccountNumber,
  validateEmail, validatePhone, validateUPI, validateHSN, gstinContainsPan,
} from '../../../utils/validation';

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



// Field wrapper that reserves room for a validation message, so the layout
// doesn't jump when an error appears while typing.
const Field = ({ label, error, required, children }) => (
  <div className="ci-field">
    <label>{label} {required && <span className="req">*</span>}</label>
    {children}
    {error && <span className="ci-field-error">{error}</span>}
  </div>
);

// ── Main Component ──────────────────────────────────────────────────
const CreateInvoiceView = ({ onBack, onCreateInvoice, onUpdateInvoice, currentCompany, initialInvoice }) => {
  const apeilo = useApeilo();
  const pdfRef = useRef(null);
  const isEditMode = Boolean(initialInvoice && initialInvoice.id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const buildInitialForm = () => {
    if (!initialInvoice) {
      return {
        type: 'receivable',
        entity_name: currentCompany?.name || '',
        entity_gstin: currentCompany?.gstin || '',
        entity_pan: currentCompany?.pan || '',
        entity_reg: '',
        entity_address: currentCompany?.address || '',
        supplier_state: 'Maharashtra (27)',
        entity_logo: null,
        client_name: '',
        client_email: '',
        client_address: '',
        place_of_supply: 'Maharashtra (27)',
        client_gstin: '',
        client_contact: '',
        client_phone: '',
        issue_date: today(),
        due_date: addDays(today(), 15),
        currency: 'INR',
        po_number: '',
        payment_terms: 'Net 15',
        line_items: [defaultLineItem()],
        amount_paid: 0,
        payment_account_holder: '',
        payment_bank_name: '',
        payment_account_number: '',
        payment_ifsc: '',
        payment_upi: '',
        payment_mode: 'Bank Transfer',
        notes: '',
        _invoiceNumber: 'Loading...',
        _ackNumber: '',
        _ackDate: '',
        _irn: '',
        _irnLoading: false,
      };
    }
    const inv = initialInvoice;
    const items = Array.isArray(inv.line_items)
      ? inv.line_items
      : (typeof inv.line_items === 'string' ? (() => { try { return JSON.parse(inv.line_items); } catch { return []; } })() : []);
    const normalizedItems = items.length > 0
      ? items.map((li, idx) => ({ ...defaultLineItem(), ...li, id: li.id || Date.now() + idx }))
      : [defaultLineItem()];
    return {
      type: inv.type || 'receivable',
      entity_name: inv.entity_name || '',
      entity_gstin: inv.entity_gstin || '',
      entity_pan: inv.entity_pan || '',
      entity_reg: inv.entity_reg || '',
      entity_address: inv.entity_address || '',
      supplier_state: inv.supplier_state || 'Maharashtra (27)',
      entity_logo: inv.entity_logo || null,
      client_name: inv.client_name || inv.vendor_name || '',
      client_email: inv.client_email || '',
      client_address: inv.client_address || '',
      place_of_supply: inv.place_of_supply || 'Maharashtra (27)',
      client_gstin: inv.client_gstin || '',
      client_contact: inv.client_contact || '',
      client_phone: inv.client_phone || '',
      issue_date: inv.issue_date || today(),
      due_date: inv.due_date || addDays(inv.issue_date || today(), 15),
      currency: inv.currency || 'INR',
      po_number: inv.po_number || '',
      payment_terms: inv.payment_terms || 'Net 15',
      line_items: normalizedItems,
      amount_paid: parseFloat(inv.amount_paid) || 0,
      payment_account_holder: inv.payment_account_holder || '',
      payment_bank_name: inv.payment_bank_name || '',
      payment_account_number: inv.payment_account_number || '',
      payment_ifsc: inv.payment_ifsc || '',
      payment_upi: inv.payment_upi || '',
      payment_mode: inv.payment_mode || 'Bank Transfer',
      notes: inv.notes || '',
      _invoiceNumber: inv.invoice_number || 'Loading...',
      _ackNumber: inv.ack_number || '',
      _ackDate: '',
      _irn: inv.irn_number || '',
      _irnLoading: false,
    };
  };

  const [form, setForm] = useState(buildInitialForm);

  // Fetch next invoice number (skipped in edit mode — we keep the existing one)
  useEffect(() => {
    if (isEditMode) return;
    const fetchNextNumber = async () => {
      try {
        const companyId = currentCompany?.id || localStorage.getItem('companyId');
        if (!companyId) return;
        const res = await invoicesAPI.getNextNumber(form.type, companyId);
        if (res && res.invoiceNumber) {
          setForm(prev => ({ ...prev, _invoiceNumber: res.invoiceNumber }));
        }
      } catch (err) {
        console.error('Failed to fetch next invoice number:', err);
      }
    };
    fetchNextNumber();
  }, [form.type, currentCompany, isEditMode]);

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

  // Per-field errors. Format checks only — an empty optional field is valid, so
  // nothing goes red until the user actually types something wrong.
  const fieldErrors = React.useMemo(() => {
    const e = {};
    e.entity_gstin = validateGSTIN(form.entity_gstin);
    e.entity_pan = validatePAN(form.entity_pan);
    if (!e.entity_gstin && !e.entity_pan && !gstinContainsPan(form.entity_gstin, form.entity_pan)) {
      e.entity_pan = 'PAN does not match the PAN inside your GSTIN';
    }
    e.client_gstin = validateGSTIN(form.client_gstin);
    e.client_email = validateEmail(form.client_email);
    e.client_phone = validatePhone(form.client_phone);
    e.payment_account_number = validateAccountNumber(form.payment_account_number);
    e.payment_ifsc = validateIFSC(form.payment_ifsc);
    e.payment_upi = validateUPI(form.payment_upi);

    const paid = parseFloat(form.amount_paid) || 0;
    if (paid > totals.grandTotal + 0.01) {
      e.amount_paid = 'Amount paid cannot exceed the invoice total';
    }
    if (form.due_date && form.issue_date && form.due_date < form.issue_date) {
      e.due_date = 'Due date cannot be before the issue date';
    }
    Object.keys(e).forEach(k => { if (!e[k]) delete e[k]; });
    return e;
  }, [form, totals.grandTotal]);

  // Line-item errors are keyed by item id so each row can flag its own cell.
  const itemErrors = React.useMemo(() => {
    const map = {};
    form.line_items.forEach(item => {
      const errs = {};
      const hsn = validateHSN(item.hsn);
      if (hsn) errs.hsn = hsn;
      if ((parseFloat(item.quantity) || 0) <= 0) errs.quantity = 'Qty must be greater than 0';
      if (parseFloat(item.discount_percent) > 100) errs.discount_percent = 'Discount cannot exceed 100%';
      if (Object.keys(errs).length) map[item.id] = errs;
    });
    return map;
  }, [form.line_items]);

  const hasBlockingErrors =
    Object.keys(fieldErrors).length > 0 || Object.keys(itemErrors).length > 0;

  // Logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => upd('entity_logo', ev.target.result);
    reader.readAsDataURL(file);
  };

  const removeLogo = (e) => {
    e.preventDefault();
    upd('entity_logo', null);
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

  // Generate IRN manually
  const handleGenerateIRN = async () => {
    if (!form.entity_gstin) return setError('Entity GSTIN is required to generate IRN.');
    if (!form._invoiceNumber || form._invoiceNumber.includes('Loading')) return setError('Invoice number is not ready yet.');
    
    setForm(prev => ({ ...prev, _irnLoading: true }));
    setError('');
    
    try {
      const companyId = currentCompany?.id || localStorage.getItem('companyId');
      const res = await invoicesAPI.generateIRN({
        gstin: form.entity_gstin,
        invoiceNumber: form._invoiceNumber,
        issueDate: form.issue_date
      }, companyId);
      
      setForm(prev => ({
        ...prev,
        _irn: res.irn,
        _ackNumber: res.ackNumber,
        _ackDate: res.ackDate,
        _irnLoading: false
      }));
    } catch (err) {
      setError('Failed to generate IRN.');
      setForm(prev => ({ ...prev, _irnLoading: false }));
    }
  };

  // Save invoice
  const handleSave = async () => {
    if (!form.entity_name.trim()) return setError('Entity name is required.');
    if (!form.client_name.trim()) return setError('Client / Vendor name is required.');
    if (form.line_items.length === 0) return setError('Add at least one line item.');
    if (!form.issue_date) return setError('Issue date is required.');
    if (form.line_items.every(i => !String(i.name).trim())) {
      return setError('Give at least one line item a description.');
    }
    if (hasBlockingErrors) {
      const first = Object.values(fieldErrors)[0]
        || Object.values(Object.values(itemErrors)[0] || {})[0];
      return setError(first || 'Please correct the highlighted fields.');
    }

    setSubmitting(true);
    setError('');
    try {
      const submitFn = isEditMode && typeof onUpdateInvoice === 'function'
        ? (payload) => onUpdateInvoice(initialInvoice.id, payload)
        : onCreateInvoice;
      await submitFn({
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

      // Score this invoice for fraud on Apeilo (fire-and-forget — the invoice
      // is already saved; tracking must never block or break the flow).
      apeilo.trackTransaction({
        amount: totals.grandTotal,
        isInternational: !!form.currency && form.currency !== 'INR',
      }).catch(() => {});

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
            <span className="ci-form-title">{isEditMode ? 'Edit Invoice' : 'New Invoice'}</span>
          </div>
          <div className="ci-form-actions">
            <button className="ci-btn-cancel" onClick={onBack}>Cancel</button>
            <button className="ci-btn-save" onClick={handleSave} disabled={submitting || hasBlockingErrors}
              title={hasBlockingErrors ? 'Correct the highlighted fields first' : ''}>
              <Save size={15} style={{ marginRight: 5 }} />
              {submitting ? 'Saving...' : (isEditMode ? 'Update Invoice' : 'Save Invoice')}
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
            <div className={`ci-nic-box ${form._irn ? 'active' : ''}`}>
              <div className="ci-nic-top">
                <div className="ci-nic-title">
                  <RefreshCw size={14} /> E-INVOICE STATUS (NIC SANDBOX V1.03)
                </div>
                <div className="ci-nic-status">
                  {form._irn ? 'ACTIVE & REGISTERED' : 'PENDING VERIFICATION'}
                </div>
              </div>
              
              {!form._irn ? (
                <div className="ci-nic-bottom">
                  <div className="ci-nic-desc">Mandatory registration required before invoice dispatch.</div>
                  <button className="ci-btn-irn" onClick={handleGenerateIRN} disabled={form._irnLoading}>
                    {form._irnLoading ? 'Generating...' : 'Generate IRN'}
                  </button>
                </div>
              ) : (
                <div className="ci-irn-display">
                  <div className="ci-irn-label">INVOICE REFERENCE NUMBER (IRN)</div>
                  <div className="ci-irn-hash">{form._irn}</div>
                  <div className="ci-irn-meta">
                    <div className="ci-irn-meta-block">
                      <span className="ci-irn-meta-label">ACK NUMBER</span>
                      <span className="ci-irn-meta-value">{form._ackNumber}</span>
                    </div>
                    <div className="ci-irn-meta-block" style={{ marginRight: '30px' }}>
                      <span className="ci-irn-meta-label">ACK DATE</span>
                      <span className="ci-irn-meta-value">{form._ackDate}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="ci-section-header" style={{ borderBottom: 'none', marginBottom: 20 }}>
              <Building2 size={16} className="ci-section-icon" />
              <span className="ci-section-title">Your Entity Details</span>
            </div>

            <div className="ci-compliance-box">
              <div className="ci-compliance-left">
                <AlertCircle size={16} className="ci-compliance-icon" />
                <div>
                  <div className="ci-compliance-title">e-Invoicing Compliance Settings</div>
                  <div className="ci-compliance-desc">Mandatory under Rule 48(4) for aggregate turnover exceeding ₹5 Crores.</div>
                </div>
              </div>
              <div className="ci-compliance-right">
                <span className="ci-compliance-label">ANNUAL TURNOVER:</span>
                <select className="ci-compliance-select">
                  <option>Above ₹5 Crore (Mandatory)</option>
                  <option>Below ₹5 Crore (Optional)</option>
                </select>
              </div>
            </div>

            <div className="ci-entity-layout">
              {/* Logo Uploader */}
              <div className="ci-entity-left">
                <label className="ci-logo-uploader">
                  {form.entity_logo ? (
                    <img src={form.entity_logo} className="ci-logo-preview" alt="logo" />
                  ) : (
                    <div className="ci-logo-placeholder">
                      <Image size={24} color="#64748b" />
                      <span>Upload Logo</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </label>
                {form.entity_logo && (
                  <div className="ci-logo-remove" onClick={removeLogo}>Remove logo</div>
                )}
              </div>

              {/* Grid Details */}
              <div className="ci-entity-right">
                <div className="ci-grid-2">
                  <div className="ci-field">
                    <label>Entity Name <span className="req">*</span></label>
                    <input value={form.entity_name} maxLength={MAX.companyName}
                      onChange={e => upd('entity_name', sanitiseText(e.target.value, MAX.companyName))}
                      placeholder="Your company name" />
                  </div>
                  <Field label="GSTIN" error={fieldErrors.entity_gstin}>
                    <input value={form.entity_gstin} maxLength={MAX.gstin}
                      className={fieldErrors.entity_gstin ? 'ci-input-error' : ''}
                      onChange={e => upd('entity_gstin', sanitiseAlphaNumUpper(e.target.value, MAX.gstin))}
                      placeholder="29ABCDE1234F1Z5" />
                  </Field>
                  <Field label="PAN" error={fieldErrors.entity_pan}>
                    <input value={form.entity_pan} maxLength={MAX.pan}
                      className={fieldErrors.entity_pan ? 'ci-input-error' : ''}
                      onChange={e => upd('entity_pan', sanitiseAlphaNumUpper(e.target.value, MAX.pan))}
                      placeholder="ABCDE1234F" />
                  </Field>
                  <div className="ci-field">
                    <label>Registration Number</label>
                    <input value={form.entity_reg} maxLength={MAX.registration}
                      onChange={e => upd('entity_reg', sanitiseAlphaNumUpper(e.target.value, MAX.registration))}
                      placeholder="e.g. MH2024ABC1234" />
                  </div>
                </div>
                <div className="ci-grid-2" style={{ marginTop: 14 }}>
                  <div className="ci-field">
                    <label>Billing Address</label>
                    <input value={form.entity_address} maxLength={MAX.address}
                      onChange={e => upd('entity_address', sanitiseText(e.target.value, MAX.address))}
                      placeholder="Full address" />
                  </div>
                  <div className="ci-field">
                    <label>Supplier State Code <span className="req">*</span></label>
                    <select value={form.supplier_state} onChange={e => upd('supplier_state', e.target.value)}>
                      {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
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
                <input value={form.client_name} maxLength={MAX.companyName}
                  onChange={e => upd('client_name', sanitiseText(e.target.value, MAX.companyName))}
                  placeholder={form.type === 'payable' ? 'Vendor name' : 'Client name'} />
              </div>
              <Field label="Email Address" error={fieldErrors.client_email}>
                <input type="email" value={form.client_email} maxLength={MAX.email}
                  className={fieldErrors.client_email ? 'ci-input-error' : ''}
                  onChange={e => upd('client_email', sanitiseEmail(e.target.value))}
                  placeholder="client@example.com" />
              </Field>
            </div>
            <div className="ci-grid-1" style={{ marginTop: 14 }}>
              <div className="ci-field">
                <label>Billing Address</label>
                <input value={form.client_address} maxLength={MAX.address}
                  onChange={e => upd('client_address', sanitiseText(e.target.value, MAX.address))}
                  placeholder="Client's full address" />
              </div>
            </div>
            <div className="ci-grid-2" style={{ marginTop: 14 }}>
              <div className="ci-field">
                <label>Place of Supply (State Code) <span className="req">*</span></label>
                <select value={form.place_of_supply} onChange={e => upd('place_of_supply', e.target.value)}>
                  {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <Field label="Client GSTIN" error={fieldErrors.client_gstin}>
                <input value={form.client_gstin} maxLength={MAX.gstin}
                  className={fieldErrors.client_gstin ? 'ci-input-error' : ''}
                  onChange={e => upd('client_gstin', sanitiseAlphaNumUpper(e.target.value, MAX.gstin))}
                  placeholder="29ABCDE1234F1Z5" />
              </Field>
              <div className="ci-field">
                <label>Contact Person</label>
                <input value={form.client_contact} maxLength={MAX.contactPerson}
                  onChange={e => upd('client_contact', sanitiseText(e.target.value, MAX.contactPerson))}
                  placeholder="Contact name" />
              </div>
              <Field label="Phone Number" error={fieldErrors.client_phone}>
                <input type="tel" inputMode="numeric" value={form.client_phone} maxLength={MAX.phone}
                  className={fieldErrors.client_phone ? 'ci-input-error' : ''}
                  onChange={e => upd('client_phone', sanitisePhone(e.target.value))}
                  placeholder="+91 98765 43210" />
              </Field>
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
              <Field label="Due Date" error={fieldErrors.due_date}>
                <input type="date" value={form.due_date} min={form.issue_date || undefined}
                  className={fieldErrors.due_date ? 'ci-input-error' : ''}
                  onChange={e => upd('due_date', e.target.value)} />
              </Field>
              <div className="ci-field">
                <label>Currency</label>
                <select value={form.currency} onChange={e => upd('currency', e.target.value)}>
                  <option>INR</option><option>USD</option><option>EUR</option><option>GBP</option>
                </select>
              </div>
              <div className="ci-field">
                <label>PO Number</label>
                <input value={form.po_number} maxLength={MAX.poNumber}
                  onChange={e => upd('po_number', sanitiseText(e.target.value, MAX.poNumber))}
                  placeholder="Optional" />
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
              <datalist id="hsn-list">
                <option value="998311">Management Consulting Services</option>
                <option value="998313">Information Technology Services</option>
                <option value="998314">Software Development Services</option>
                <option value="998713">Technical Support Services</option>
                <option value="998222">Accounting & Auditing Services</option>
                <option value="998319">Other Professional Technical Services</option>
              </datalist>
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
                        <input className="ci-li-input" value={item.name} maxLength={MAX.lineItemName}
                          onChange={e => updItem(item.id, 'name', sanitiseText(e.target.value, MAX.lineItemName))}
                          placeholder="Item name" />
                        <input className="ci-li-input" value={item.description} maxLength={MAX.lineItemDesc}
                          style={{ marginTop: 4, fontSize: 11 }}
                          onChange={e => updItem(item.id, 'description', sanitiseText(e.target.value, MAX.lineItemDesc))}
                          placeholder="Description (optional)" />
                      </td>
                      <td>
                        <input className={`ci-li-input ${itemErrors[item.id]?.hsn ? 'ci-input-error' : ''}`}
                          list="hsn-list" value={item.hsn} maxLength={MAX.hsn} inputMode="numeric"
                          title={itemErrors[item.id]?.hsn || ''}
                          onChange={e => updItem(item.id, 'hsn', sanitiseDigits(e.target.value, MAX.hsn))}
                          placeholder="HSN" />
                      </td>
                      <td><input className={`ci-li-input ${itemErrors[item.id]?.quantity ? 'ci-input-error' : ''}`}
                        inputMode="decimal" value={item.quantity}
                        title={itemErrors[item.id]?.quantity || ''}
                        onChange={e => updItem(item.id, 'quantity', sanitiseAmount(e.target.value, { maxDecimals: 3 }))} /></td>
                      <td>
                        <select className="ci-li-input" value={item.unit}
                          onChange={e => updItem(item.id, 'unit', e.target.value)}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td><input className="ci-li-input" inputMode="decimal" value={item.unit_price}
                        onChange={e => updItem(item.id, 'unit_price', sanitiseAmount(e.target.value))} /></td>
                      <td><input className={`ci-li-input ${itemErrors[item.id]?.discount_percent ? 'ci-input-error' : ''}`}
                        inputMode="decimal" value={item.discount_percent}
                        title={itemErrors[item.id]?.discount_percent || ''}
                        onChange={e => updItem(item.id, 'discount_percent', sanitiseAmount(e.target.value))} /></td>
                      <td>
                        <select className="ci-li-input" value={item.tax_percent}
                          onChange={e => updItem(item.id, 'tax_percent', parseFloat(e.target.value))}>
                          {TAX_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td><input className="ci-li-input" inputMode="decimal" value={item.cess_percent}
                        onChange={e => updItem(item.id, 'cess_percent', sanitiseAmount(e.target.value))} /></td>
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
                <div style={{ marginBottom: 12 }}>
                  <Field label="Amount Paid (₹)" error={fieldErrors.amount_paid}>
                    <input type="text" inputMode="decimal" value={form.amount_paid}
                      className={fieldErrors.amount_paid ? 'ci-input-error' : ''}
                      onChange={e => upd('amount_paid', sanitiseAmount(e.target.value))}
                      placeholder="0" />
                  </Field>
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
                <input value={form.payment_account_holder} maxLength={MAX.accountHolder}
                  onChange={e => upd('payment_account_holder', sanitiseText(e.target.value, MAX.accountHolder))}
                  placeholder="" />
              </div>
              <div className="ci-field">
                <label>Bank Name</label>
                <input value={form.payment_bank_name} maxLength={MAX.bankName}
                  onChange={e => upd('payment_bank_name', sanitiseText(e.target.value, MAX.bankName))}
                  placeholder="e.g. HDFC Bank" />
              </div>
              <Field label="Account Number" error={fieldErrors.payment_account_number}>
                <input inputMode="numeric" value={form.payment_account_number} maxLength={MAX.accountNumber}
                  className={fieldErrors.payment_account_number ? 'ci-input-error' : ''}
                  onChange={e => upd('payment_account_number', sanitiseDigits(e.target.value, MAX.accountNumber))}
                  placeholder="50200001234567" />
              </Field>
              <Field label="IFSC Code" error={fieldErrors.payment_ifsc}>
                <input value={form.payment_ifsc} maxLength={MAX.ifsc}
                  className={fieldErrors.payment_ifsc ? 'ci-input-error' : ''}
                  onChange={e => upd('payment_ifsc', sanitiseAlphaNumUpper(e.target.value, MAX.ifsc))}
                  placeholder="HDFC0001234" />
              </Field>
              <Field label="UPI ID (Optional)" error={fieldErrors.payment_upi}>
                <input value={form.payment_upi} maxLength={MAX.upi}
                  className={fieldErrors.payment_upi ? 'ci-input-error' : ''}
                  onChange={e => upd('payment_upi', sanitiseUpi(e.target.value))}
                  placeholder="name@bank" />
              </Field>
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
              <textarea value={form.notes} maxLength={MAX.notes}
                onChange={e => upd('notes', sanitiseMultiline(e.target.value, MAX.notes))}
                placeholder="Any special instructions, terms, or notes printed on the invoice..." rows={3} />
              <span className="ci-field-counter">{(form.notes || '').length} / {MAX.notes}</span>
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
        <InvoicePDFTemplate ref={pdfRef} form={form} totals={totals} taxScheme={taxScheme} />
      </div>
    </div>
  );
};

export default CreateInvoiceView;
