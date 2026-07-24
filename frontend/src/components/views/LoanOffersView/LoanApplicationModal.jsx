import React, { useState, useEffect } from 'react';
import {
  X, Building2, IndianRupee, BarChart3, FileUp, Check,
  ChevronLeft, ChevronRight, AlertTriangle, Paperclip, Trash2,
} from 'lucide-react';
import { loansAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const LOAN_TYPES = [
  { value: 'TERM_LOAN', label: 'Term Loan' },
  { value: 'WORKING_CAPITAL_CC', label: 'Working Capital CC' },
  { value: 'OVERDRAFT_OD', label: 'Overdraft (OD)' },
  { value: 'WCDL', label: 'WCDL' },
  { value: 'MSME_LOAN', label: 'MSME Loan' },
  { value: 'VEHICLE_LOAN', label: 'Vehicle Loan' },
  { value: 'EQUIPMENT_LOAN', label: 'Equipment Loan' },
  { value: 'OTHER', label: 'Other' },
];

const BUSINESS_TYPES = ['Pvt Ltd', 'LLP', 'Partnership'];
const PURPOSES = ['Working Capital', 'Equipment', 'Expansion', 'Other'];
const GST_STATUSES = ['Up to date', 'Partially filed', 'Not filed', 'Not registered'];

const DOC_TYPES = [
  { key: 'moa_aoa', label: 'MOA / AOA' },
  { key: 'itr_2y', label: 'Last 2 years ITR' },
  { key: 'gst_6m', label: 'GST returns (last 6 months)' },
  { key: 'bank_6m', label: 'Bank statement (last 6 months)' },
  { key: 'director_kyc', label: 'Director KYC' },
];

const STEPS = [
  { num: 1, label: 'Company Details', icon: Building2 },
  { num: 2, label: 'Loan Requirement', icon: IndianRupee },
  { num: 3, label: 'Financial Details', icon: BarChart3 },
  { num: 4, label: 'Documents', icon: FileUp },
];

// Map the company's stored entity type onto the corporate business types
const mapBusinessType = (entityType) => {
  const t = (entityType || '').toLowerCase();
  if (t.includes('llp')) return 'LLP';
  if (t.includes('partner')) return 'Partnership';
  if (t.includes('pvt') || t.includes('private')) return 'Pvt Ltd';
  return '';
};

const LoanApplicationModal = ({ existingLoans, onClose, onSubmitted, prefill }) => {
  const { currentCompany } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [profitYears, setProfitYears] = useState([]);

  const [form, setForm] = useState({
    // Step 1 — Company Details
    company_name: '', cin_number: '', date_of_incorporation: '',
    business_type: '', industry: '', annual_turnover: '',
    // Step 2 — Loan Requirement (seeded from a chosen offer if the user came in via one)
    loan_type: prefill?.loan_type || 'TERM_LOAN',
    lender: prefill?.lender || '',
    amount_required: '',
    purpose: 'Working Capital',
    tenure_preferred_months: '',
    has_existing_loans: false,
    existing_loans_outstanding: '',
    // Step 3 — Financial Details
    net_profit_y1: '', net_profit_y2: '', net_profit_y3: '',
    monthly_revenue: '', gst_filing_status: '', itr_filed: false,
    // Step 4 — Documents
    documents: DOC_TYPES.map(d => ({ key: d.key, label: d.label, fileName: null, fileSize: null })),
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // Prefill from company profile + live financial data
  useEffect(() => {
    if (!currentCompany) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await loansAPI.getPrefill(currentCompany.id);
        if (cancelled) return;
        const { company, financials, existingLoans: existing } = data;
        const years = financials.yearlyNetProfits || [];
        setProfitYears(years.map(y => y.year));
        setForm(f => ({
          ...f,
          company_name: company.name || f.company_name,
          business_type: mapBusinessType(company.entity_type),
          industry: company.industry || '',
          annual_turnover: financials.annualTurnover > 0 ? String(financials.annualTurnover) : '',
          monthly_revenue: financials.monthlyRevenue > 0 ? String(financials.monthlyRevenue) : '',
          net_profit_y1: years[0] ? String(years[0].netProfit) : '',
          net_profit_y2: years[1] ? String(years[1].netProfit) : '',
          net_profit_y3: years[2] ? String(years[2].netProfit) : '',
          gst_filing_status: financials.gstFilingStatus || '',
          itr_filed: financials.itrFiled,
          has_existing_loans: existing.count > 0,
          existing_loans_outstanding: existing.outstanding > 0 ? String(existing.outstanding) : '',
        }));
      } catch (err) {
        console.error('Loan prefill failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [currentCompany]);

  const attachDoc = (key, file) => {
    setForm(f => ({
      ...f,
      documents: f.documents.map(d =>
        d.key === key
          ? { ...d, fileName: file ? file.name : null, fileSize: file ? file.size : null }
          : d
      ),
    }));
  };

  const validateStep = () => {
    setError('');
    if (step === 1) {
      if (!form.company_name.trim()) { setError('Company name is required.'); return false; }
      if (!form.business_type) { setError('Select a business type.'); return false; }
    }
    if (step === 2) {
      if (!form.amount_required || parseFloat(form.amount_required) <= 0) { setError('Enter the loan amount required.'); return false; }
      if (!form.tenure_preferred_months || parseInt(form.tenure_preferred_months) <= 0) { setError('Enter the preferred tenure in months.'); return false; }
      if (form.has_existing_loans && !form.existing_loans_outstanding) { setError('Enter the outstanding amount on existing loans.'); return false; }
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep(s => Math.min(s + 1, 4)); };
  const back = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  // Same loan type + same lender already Under Review → warn (don't block)
  const hasDuplicateInReview = () =>
    (existingLoans || []).some(l =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes(l.status) &&
      l.loan_type === form.loan_type &&
      (l.lender || '').trim().toLowerCase() === (form.lender || '').trim().toLowerCase() &&
      (form.lender || '').trim() !== ''
    );

  const doSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await loansAPI.create({
        ...form,
        annual_turnover: form.annual_turnover || null,
        amount_required: form.amount_required,
        tenure_preferred_months: form.tenure_preferred_months || null,
        existing_loans_outstanding: form.has_existing_loans ? (form.existing_loans_outstanding || 0) : 0,
        net_profit_y1: form.net_profit_y1 || null,
        net_profit_y2: form.net_profit_y2 || null,
        net_profit_y3: form.net_profit_y3 || null,
        monthly_revenue: form.monthly_revenue || null,
        documents: form.documents.filter(d => d.fileName),
      }, currentCompany.id);
      onSubmitted();
    } catch (err) {
      setError(err.message || 'Failed to submit application.');
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!validateStep()) return;
    if (hasDuplicateInReview()) {
      setShowDuplicateWarning(true);
      return;
    }
    doSubmit();
  };

  const profitLabel = (idx) =>
    profitYears[idx] ? `Net Profit — FY ${profitYears[idx]}` : `Net Profit — Year ${idx + 1}`;

  return (
    <div className="loan-modal-overlay" onClick={onClose}>
      <div className="loan-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="loan-modal-header">
          <div>
            <h2 className="loan-modal-title">Apply for a Corporate Loan</h2>
            <p className="loan-modal-subtitle">
              {prefill?.lender
                ? `Tracking your application with ${prefill.lender} — company data pre-filled from your profile`
                : "Complete the 4 steps below — we've pre-filled your company data"}
            </p>
          </div>
          <button className="loan-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="loan-steps">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.num;
            const active = step === s.num;
            return (
              <React.Fragment key={s.num}>
                {i > 0 && <div className={`loan-step-line ${step > i ? 'done' : ''}`} />}
                <div className={`loan-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                  <div className="loan-step-circle">
                    {done ? <Check size={14} /> : <Icon size={14} />}
                  </div>
                  <span className="loan-step-label">{s.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="loan-modal-body">

          {step === 1 && (
            <div className="loan-form-grid">
              <div className="loan-field loan-field-full">
                <label>Company Name *</label>
                <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="HB devs Pvt. Ltd." />
              </div>
              <div className="loan-field">
                <label>CIN Number</label>
                <input value={form.cin_number} onChange={e => set('cin_number', e.target.value)} placeholder="U72200KA2020PTC123456" />
              </div>
              <div className="loan-field">
                <label>Date of Incorporation</label>
                <input type="date" value={form.date_of_incorporation} onChange={e => set('date_of_incorporation', e.target.value)} />
              </div>
              <div className="loan-field">
                <label>Business Type *</label>
                <select value={form.business_type} onChange={e => set('business_type', e.target.value)}>
                  <option value="" disabled>Select type</option>
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="loan-field">
                <label>Industry</label>
                <input value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="Software / IT Services" />
              </div>
              <div className="loan-field loan-field-full">
                <label>Annual Turnover (₹)</label>
                <input type="number" min="0" value={form.annual_turnover} onChange={e => set('annual_turnover', e.target.value)} placeholder="e.g. 25000000" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="loan-form-grid">
              <div className="loan-field">
                <label>Loan Type *</label>
                <select value={form.loan_type} onChange={e => set('loan_type', e.target.value)}>
                  {LOAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="loan-field">
                <label>Preferred Lender</label>
                <input value={form.lender} onChange={e => set('lender', e.target.value)} placeholder="HDFC Bank" />
              </div>
              <div className="loan-field">
                <label>Loan Amount Required (₹) *</label>
                <input type="number" min="0" value={form.amount_required} onChange={e => set('amount_required', e.target.value)} placeholder="e.g. 1000000" />
              </div>
              <div className="loan-field">
                <label>Purpose</label>
                <select value={form.purpose} onChange={e => set('purpose', e.target.value)}>
                  {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="loan-field">
                <label>Tenure Preferred (months) *</label>
                <input type="number" min="1" value={form.tenure_preferred_months} onChange={e => set('tenure_preferred_months', e.target.value)} placeholder="36" />
              </div>
              <div className="loan-field">
                <label>Existing Loans?</label>
                <div className="loan-toggle-row">
                  <button type="button" className={`loan-toggle-btn ${form.has_existing_loans ? 'active' : ''}`} onClick={() => set('has_existing_loans', true)}>Yes</button>
                  <button type="button" className={`loan-toggle-btn ${!form.has_existing_loans ? 'active' : ''}`} onClick={() => set('has_existing_loans', false)}>No</button>
                </div>
              </div>
              {form.has_existing_loans && (
                <div className="loan-field loan-field-full">
                  <label>Outstanding Amount on Existing Loans (₹)</label>
                  <input type="number" min="0" value={form.existing_loans_outstanding} onChange={e => set('existing_loans_outstanding', e.target.value)} placeholder="e.g. 500000" />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="loan-form-grid">
              <div className="loan-field">
                <label>{profitLabel(0)} (₹)</label>
                <input type="number" value={form.net_profit_y1} onChange={e => set('net_profit_y1', e.target.value)} placeholder="Latest year" />
              </div>
              <div className="loan-field">
                <label>{profitLabel(1)} (₹)</label>
                <input type="number" value={form.net_profit_y2} onChange={e => set('net_profit_y2', e.target.value)} placeholder="Previous year" />
              </div>
              <div className="loan-field">
                <label>{profitLabel(2)} (₹)</label>
                <input type="number" value={form.net_profit_y3} onChange={e => set('net_profit_y3', e.target.value)} placeholder="Year before" />
              </div>
              <div className="loan-field">
                <label>Current Monthly Revenue (₹)</label>
                <input type="number" min="0" value={form.monthly_revenue} onChange={e => set('monthly_revenue', e.target.value)} placeholder="e.g. 2000000" />
              </div>
              <div className="loan-field">
                <label>GST Filing Status</label>
                <select value={form.gst_filing_status} onChange={e => set('gst_filing_status', e.target.value)}>
                  <option value="" disabled>Select status</option>
                  {GST_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="loan-field">
                <label>ITR Filed?</label>
                <div className="loan-toggle-row">
                  <button type="button" className={`loan-toggle-btn ${form.itr_filed ? 'active' : ''}`} onClick={() => set('itr_filed', true)}>Yes</button>
                  <button type="button" className={`loan-toggle-btn ${!form.itr_filed ? 'active' : ''}`} onClick={() => set('itr_filed', false)}>No</button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="loan-docs-list">
              {form.documents.map(doc => (
                <div key={doc.key} className={`loan-doc-row ${doc.fileName ? 'attached' : ''}`}>
                  <div className="loan-doc-icon">
                    {doc.fileName ? <Check size={15} /> : <Paperclip size={15} />}
                  </div>
                  <div className="loan-doc-info">
                    <span className="loan-doc-label">{doc.label}</span>
                    {doc.fileName && <span className="loan-doc-filename">{doc.fileName}</span>}
                  </div>
                  {doc.fileName ? (
                    <button className="loan-doc-remove" onClick={() => attachDoc(doc.key, null)}>
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <label className="loan-doc-attach">
                      Attach
                      <input type="file" hidden onChange={e => attachDoc(doc.key, e.target.files[0])} />
                    </label>
                  )}
                </div>
              ))}
              <p className="loan-docs-hint">Documents are optional for this application — you can share them with the bank later.</p>
            </div>
          )}

          {error && <div className="loan-form-error"><AlertTriangle size={14} /> {error}</div>}
        </div>

        {/* Footer */}
        <div className="loan-modal-footer">
          {step > 1 ? (
            <button className="loan-btn-secondary" onClick={back}><ChevronLeft size={15} /> Back</button>
          ) : <span />}
          {step < 4 ? (
            <button className="loan-btn-primary" onClick={next}>Continue <ChevronRight size={15} /></button>
          ) : (
            <button className="loan-btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Application'} <Check size={15} />
            </button>
          )}
        </div>

        {/* Duplicate-application warning (warn, don't block) */}
        {showDuplicateWarning && (
          <div className="loan-warning-overlay">
            <div className="loan-warning-box">
              <div className="loan-warning-icon"><AlertTriangle size={22} /></div>
              <h3>Similar application in review</h3>
              <p>An application for this loan type is already under review with this lender. You can still submit if you have a valid reason to apply again.</p>
              <div className="loan-warning-actions">
                <button className="loan-btn-secondary" onClick={() => setShowDuplicateWarning(false)}>Cancel</button>
                <button className="loan-btn-primary" onClick={() => { setShowDuplicateWarning(false); doSubmit(); }} disabled={submitting}>
                  Submit Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanApplicationModal;
