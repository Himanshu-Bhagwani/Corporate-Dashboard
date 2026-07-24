import React, { useState, useRef } from 'react';
import { X, Upload, Check, ArrowRight, ArrowLeft, Plus } from 'lucide-react';
import AuthDoodles from '../auth/AuthDoodles';
import '../auth/Auth.css';
import './CreateCompanyModal.css';

const ALL_STEPS = [
  { id: 1, label: 'Business Info' },
  { id: 2, label: 'Documents' },
  { id: 3, label: 'Team Invite' },
  { id: 4, label: 'Select Plan' },
];

const STEPS_NO_PLAN = ALL_STEPS.slice(0, 3);

const ENTITY_TYPES = [
  'Sole Proprietorship',
  'Partnership',
  'Limited Liability Partnership (LLP)',
  'Private Limited Company',
  'Public Limited Company',
  'One Person Company (OPC)',
];

const ROLES = ['Admin', 'Finance Manager', 'Accountant', 'Auditor'];

const ROLE_PERMISSIONS = {
  'Admin': 'Full access to all features',
  'Finance Manager': 'Manage finances, reports, and budgets',
  'Accountant': 'Manage transactions and ledgers',
  'Auditor': 'Read-only access for compliance review',
};

// skipPlanStep=true  → Enterprise X "Add New Company" flow (3 steps, auto Enterprise X)
// skipPlanStep=false → first-time signup flow (4 steps, user picks plan)
const CreateCompanyModal = ({ onClose, onSubmit, skipPlanStep = false }) => {
  const STEPS = skipPlanStep ? STEPS_NO_PLAN : ALL_STEPS;
  const maxStep = STEPS.length;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    gstin: '',
    pan: '',
    entityType: '',
    documents: [],
    teamInvites: [{ email: '', role: 'Accountant' }],
    plan: skipPlanStep ? 'Enterprise X' : 'Growth',
  });

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.name || !formData.gstin || !formData.pan || !formData.entityType) {
        setError('Please fill in all required fields.');
        return;
      }
    }
    setError('');
    setCurrentStep(prev => Math.min(prev + 1, maxStep));
  };

  const handleBack = () => {
    setError('');
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        industry: '',
        taxId: formData.gstin,
        address: '',
        gstin: formData.gstin,
        pan: formData.pan,
        entityType: formData.entityType,
        plan: formData.plan,
        teamInvites: formData.teamInvites.filter(i => i.email && i.role),
      };
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = () => fileInputRef.current?.click();

  const handleFileChange = (e) => handleFilesAdded(Array.from(e.target.files));

  const handleDrop = (e) => {
    e.preventDefault();
    handleFilesAdded(Array.from(e.dataTransfer.files));
  };

  const handleFilesAdded = (files) => {
    const valid = files.filter(f =>
      ['application/pdf', 'image/jpeg', 'image/png'].includes(f.type) &&
      f.size <= 10 * 1024 * 1024
    );
    if (valid.length !== files.length) {
      setError('Some files were rejected. Ensure they are PDF, JPG, or PNG and under 10MB.');
    } else {
      setError('');
    }
    setFormData(prev => ({ ...prev, documents: [...prev.documents, ...valid] }));
  };

  const handleInviteChange = (index, field, value) => {
    const updated = [...formData.teamInvites];
    updated[index][field] = value;
    setFormData({ ...formData, teamInvites: updated });
  };

  const addInvite = () => {
    setFormData({ ...formData, teamInvites: [...formData.teamInvites, { email: '', role: 'Accountant' }] });
  };

  const renderStepIndicator = () => (
    <div className="wizard-progress">
      {STEPS.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="step-item">
            <div className={`step-circle ${currentStep > step.id ? 'completed' : ''} ${currentStep === step.id ? 'active' : ''}`}>
              {currentStep > step.id ? <Check size={16} /> : step.id}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
          {index < STEPS.length - 1 && (
            <div className={`step-line ${currentStep > step.id ? 'completed-line' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <AuthDoodles />
      <div className="wizard-modal" onClick={e => e.stopPropagation()}>
        {renderStepIndicator()}

        {error && <div className="modal-error">{error}</div>}

        <div className="wizard-body">
          {/* Step 1 — Business Info */}
          {currentStep === 1 && (
            <div className="wizard-step">
              <div className="form-group">
                <label>Company Name <span>*</span></label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="HB devs Pvt. Ltd." />
              </div>
              <div className="form-row">
                <div className="form-group half-width">
                  <label>GSTIN <span>*</span></label>
                  <input type="text" name="gstin" value={formData.gstin} onChange={handleChange} placeholder="29XXXXX1234X1ZX" />
                </div>
                <div className="form-group half-width">
                  <label>PAN <span>*</span></label>
                  <input type="text" name="pan" value={formData.pan} onChange={handleChange} placeholder="AAAAA1234A" />
                </div>
              </div>
              <div className="form-group">
                <label>Entity Type <span>*</span></label>
                <select name="entityType" value={formData.entityType} onChange={handleChange}>
                  <option value="" disabled>Select entity type</option>
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 2 — Documents */}
          {currentStep === 2 && (
            <div className="wizard-step">
              <h3 className="step-title">Upload Documents</h3>
              <div className="dropzone" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
                <Upload size={32} />
                <p>Drag and drop files here, or click to browse</p>
                <span className="supported-text">Supported: PDF, JPG, PNG (Max 10MB each)</span>
                <button type="button" className="btn-browse" onClick={handleFileClick}>Choose Files</button>
                <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} />
              </div>
              {formData.documents.length > 0 && (
                <div className="uploaded-files">
                  {formData.documents.map((file, i) => <span key={i} className="file-chip">{file.name}</span>)}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Team Invite */}
          {currentStep === 3 && (
            <div className="wizard-step">
              <h3 className="step-title">Invite Team Members</h3>
              {formData.teamInvites.map((invite, index) => (
                <div className="invite-row" key={index}>
                  <input
                    type="email"
                    placeholder="team@company.com"
                    value={invite.email}
                    onChange={e => handleInviteChange(index, 'email', e.target.value)}
                  />
                  <select value={invite.role} onChange={e => handleInviteChange(index, 'role', e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ))}
              <button type="button" className="btn-add-text" onClick={addInvite}>
                <Plus size={16} /> Add Another Member
              </button>
              <div className="role-permissions-card">
                <h4>Role Permissions</h4>
                {Object.entries(ROLE_PERMISSIONS).map(([role, desc]) => (
                  <p key={role}><strong>{role}:</strong> {desc}</p>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 — Select Plan (first-time signup only) */}
          {currentStep === 4 && !skipPlanStep && (
            <div className="wizard-step">
              <h3 className="step-title">Choose Your Plan</h3>
              <div className="plans-container">
                <div
                  className={`plan-card ${formData.plan === 'Launchpad' ? 'selected' : ''}`}
                  onClick={() => setFormData({ ...formData, plan: 'Launchpad' })}
                >
                  {formData.plan === 'Launchpad' && <div className="plan-check"><Check size={14} /></div>}
                  <h4>Launchpad</h4>
                  <div className="plan-price">₹12,000<span>/month</span></div>
                  <div className="plan-setup">+ ₹10,000 (+18% GST) Setup Fee</div>
                  <ul className="plan-features">
                    <li><Check size={14} /> Complete bookkeeping</li>
                    <li><Check size={14} /> GST & TDS compliance</li>
                    <li><Check size={14} /> Standard reports</li>
                    <li><Check size={14} /> Up to 3 users</li>
                    <li><Check size={14} /> Up to 10K transactions/month</li>
                    <li><Check size={14} /> Email support</li>
                  </ul>
                </div>

                <div
                  className={`plan-card ${formData.plan === 'Growth' ? 'selected' : ''}`}
                  onClick={() => setFormData({ ...formData, plan: 'Growth' })}
                >
                  <div className="plan-badge">Recommended</div>
                  {formData.plan === 'Growth' && <div className="plan-check"><Check size={14} /></div>}
                  <h4>Growth</h4>
                  <div className="plan-price">₹20,000<span>/month</span></div>
                  <div className="plan-setup">+ ₹10,000 (+18% GST) Setup Fee</div>
                  <ul className="plan-features">
                    <li><Check size={14} /> Everything in Launchpad</li>
                    <li><Check size={14} /> Advanced analytics</li>
                    <li><Check size={14} /> Cash flow forecasting</li>
                    <li><Check size={14} /> Virtual CFO support</li>
                    <li><Check size={14} /> Up to 10 users</li>
                    <li><Check size={14} /> Up to 50K transactions/month</li>
                    <li><Check size={14} /> Priority support</li>
                  </ul>
                </div>

                <div
                  className={`plan-card ${formData.plan === 'Enterprise X' ? 'selected' : ''}`}
                  onClick={() => setFormData({ ...formData, plan: 'Enterprise X' })}
                >
                  {formData.plan === 'Enterprise X' && <div className="plan-check"><Check size={14} /></div>}
                  <h4>Enterprise X</h4>
                  <div className="plan-price">Custom<span>pricing</span></div>
                  <div className="plan-setup">Contact us for setup fee</div>
                  <ul className="plan-features">
                    <li><Check size={14} /> Everything in Growth</li>
                    <li><Check size={14} /> Multi-entity management</li>
                    <li><Check size={14} /> Dedicated account manager</li>
                    <li><Check size={14} /> API access</li>
                    <li><Check size={14} /> Unlimited users & transactions</li>
                    <li><Check size={14} /> 24/7 support</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          {currentStep > 1 ? (
            <button type="button" className="btn-back" onClick={handleBack}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : <div />}

          {currentStep < maxStep ? (
            <button type="button" className="btn-next" onClick={handleNext}>
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="btn-next complete" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Processing...' : <><>Complete Setup</> <ArrowRight size={16} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateCompanyModal;
