import React, { useState } from 'react';
import './ManageSubscriptionView.css';
import '../SettingsView/SettingsView.css';
import '../CompanySettingsView/CompanySettingsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import {
  CreditCard, Check, Crown, Zap, Building2, ArrowUpCircle,
  AlertCircle, CheckCircle2, X, ChevronRight, Shield, Users,
  BarChart3, BrainCircuit, CalendarClock, Infinity, Phone,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { companiesAPI } from '../../../services/api';

const PLANS = [
  {
    id: 'Launchpad',
    label: 'Launchpad',
    price: '₹12,000',
    period: '/month',
    setup: '+ ₹10,000 setup fee',
    color: '#4169e1',
    colorBg: 'rgba(65,105,225,0.1)',
    icon: <Zap size={22} />,
    description: 'Essential accounting and compliance for early-stage businesses.',
    features: [
      'Complete bookkeeping',
      'GST & TDS compliance',
      'Standard financial reports',
      'Up to 3 users',
      'Up to 10K transactions/month',
      'Email support',
    ],
    locked: ['AI CFO', 'Profit Lab', 'Forecasting Engine', 'Multi-entity'],
  },
  {
    id: 'Growth',
    label: 'Growth',
    price: '₹20,000',
    period: '/month',
    setup: '+ ₹10,000 setup fee',
    badge: 'Recommended',
    color: '#10b981',
    colorBg: 'rgba(16,185,129,0.1)',
    icon: <BarChart3 size={22} />,
    description: 'Advanced analytics and virtual CFO support for scaling businesses.',
    features: [
      'Everything in Launchpad',
      'Advanced analytics',
      'Cash flow forecasting',
      'Virtual CFO support (AI CFO)',
      'Profit Lab intelligence',
      'Forecasting Engine',
      'Up to 10 users',
      'Up to 50K transactions/month',
      'Priority support',
    ],
    locked: ['Multi-entity management', 'Dedicated account manager'],
  },
  {
    id: 'Enterprise X',
    label: 'Enterprise X',
    price: 'Custom',
    period: 'pricing',
    setup: 'Contact us for setup',
    color: '#9333ea',
    colorBg: 'rgba(147,51,234,0.1)',
    icon: <Crown size={22} />,
    description: 'Full-suite platform for enterprises with multi-entity needs.',
    features: [
      'Everything in Growth',
      'Multi-entity management',
      'Add multiple companies',
      'Dedicated account manager',
      'API access',
      'Unlimited users & transactions',
      'Custom reporting',
      '24/7 priority support',
    ],
    locked: [],
  },
];

const ManageSubscriptionView = () => {
  const { currentCompany, updateCurrentCompanyPlan } = useAuth();
  const currentPlan = currentCompany?.plan || 'Launchpad';
  const token = localStorage.getItem('token');

  const [changingTo, setChangingTo] = useState(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showAutopay, setShowAutopay] = useState(false);
  const [toast, setToast] = useState(null);

  // Autopay form state
  const [autopayForm, setAutopayForm] = useState({ card: '', expiry: '', cvv: '', name: '' });
  const [autopayLoading, setAutopayLoading] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleChangePlan = async (planId) => {
    if (planId === currentPlan) return;
    setChangingTo(planId);
    try {
      await companiesAPI.upgradePlan(currentCompany.id, planId);
      updateCurrentCompanyPlan(planId);
      showToast(`Plan changed to ${planId} successfully`);
    } catch (err) {
      showToast(err.message || 'Failed to change plan', 'error');
    } finally {
      setChangingTo(null);
    }
  };

  const handleAutopay = async (e) => {
    e.preventDefault();
    setAutopayLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setAutopayLoading(false);
    setShowAutopay(false);
    showToast('Autopay method saved successfully');
  };

  const handleCancel = async () => {
    setShowCancel(false);
    showToast('Cancellation request submitted. You will receive a confirmation email.', 'error');
  };

  const currentPlanData = PLANS.find(p => p.id === currentPlan) || PLANS[0];
  const PLAN_HIERARCHY = ['Launchpad', 'Growth', 'Enterprise X'];
  const currentIdx = PLAN_HIERARCHY.indexOf(currentPlan);

  return (
    <>
      <EmbeddedHeader />
      <div className="settings-view">
        <div className="view-header">
          <div>
            <h1 className="view-title">Manage Subscription</h1>
            <p className="view-subtitle">View your plan, compare features, and manage billing settings</p>
          </div>
        </div>

        {/* Current Plan Summary */}
        <div className="settings-section account-section">
          <div className="section-header-with-icon">
            <div className="section-icon-wrapper blue-wrapper">
              <CreditCard size={24} />
            </div>
            <div>
              <h2 className="section-title-simple">Current Subscription</h2>
              <p className="section-description">Your active plan and billing overview</p>
            </div>
          </div>

          <div className="sub-current-card" style={{ '--plan-color': currentPlanData.color, '--plan-bg': currentPlanData.colorBg }}>
            <div className="sub-current-left">
              <div className="sub-plan-icon" style={{ background: currentPlanData.colorBg, color: currentPlanData.color }}>
                {currentPlanData.icon}
              </div>
              <div>
                <div className="sub-plan-name">{currentPlanData.label}</div>
                <div className="sub-plan-price">
                  {currentPlanData.price}
                  <span>{currentPlanData.period}</span>
                </div>
                <div className="sub-plan-desc">{currentPlanData.description}</div>
              </div>
            </div>
            <div className="sub-current-right">
              <div className="sub-status-pill">Active</div>
              <button
                className="sub-autopay-btn"
                onClick={() => setShowAutopay(true)}
              >
                <CreditCard size={15} /> Setup Autopay
              </button>
              {currentPlan !== 'Launchpad' && (
                <button
                  className="sub-cancel-btn"
                  onClick={() => setShowCancel(true)}
                >
                  Cancel Plan
                </button>
              )}
            </div>
          </div>

          {/* What's included */}
          <div className="sub-included">
            <h4 className="sub-included-title">What's included in your plan</h4>
            <div className="sub-features-grid">
              {currentPlanData.features.map((f, i) => (
                <div key={i} className="sub-feature-item">
                  <div className="sub-feature-check" style={{ background: currentPlanData.colorBg, color: currentPlanData.color }}>
                    <Check size={13} />
                  </div>
                  <span>{f}</span>
                </div>
              ))}
              {currentPlanData.locked.map((f, i) => (
                <div key={i} className="sub-feature-item locked">
                  <div className="sub-feature-check locked-check">
                    <X size={13} />
                  </div>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Plan Comparison */}
        <div className="settings-section notifications-section">
          <div className="section-header-with-icon">
            <div className="section-icon-wrapper orange-wrapper">
              <Crown size={24} />
            </div>
            <div>
              <h2 className="section-title-simple">Available Plans</h2>
              <p className="section-description">Compare plans and upgrade or downgrade your subscription</p>
            </div>
          </div>

          <div className="sub-plans-grid">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              const planIdx = PLAN_HIERARCHY.indexOf(plan.id);
              const isUpgrade = planIdx > currentIdx;
              const isDowngrade = planIdx < currentIdx;

              return (
                <div
                  key={plan.id}
                  className={`sub-plan-card ${isCurrent ? 'sub-plan-current' : ''}`}
                  style={{ '--card-color': plan.color, '--card-bg': plan.colorBg }}
                >
                  {plan.badge && <div className="sub-plan-badge">{plan.badge}</div>}
                  {isCurrent && <div className="sub-plan-active-badge"><Check size={12} /> Current Plan</div>}

                  <div className="sub-plan-card-icon" style={{ background: plan.colorBg, color: plan.color }}>
                    {plan.icon}
                  </div>
                  <h3 className="sub-plan-card-name">{plan.label}</h3>
                  <div className="sub-plan-card-price">
                    {plan.price}<span>{plan.period}</span>
                  </div>
                  <div className="sub-plan-card-setup">{plan.setup}</div>

                  <ul className="sub-plan-card-features">
                    {plan.features.map((f, i) => (
                      <li key={i}>
                        <Check size={13} style={{ color: plan.color }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="sub-plan-card-btn current-btn">
                      <Shield size={15} /> Your Current Plan
                    </div>
                  ) : (
                    <button
                      className={`sub-plan-card-btn ${isUpgrade ? 'upgrade-btn' : 'downgrade-btn'}`}
                      onClick={() => handleChangePlan(plan.id)}
                      disabled={changingTo === plan.id}
                      style={isUpgrade ? { background: plan.color } : {}}
                    >
                      {changingTo === plan.id ? (
                        'Updating…'
                      ) : isUpgrade ? (
                        <><ArrowUpCircle size={15} /> Upgrade to {plan.label}</>
                      ) : (
                        <><ChevronRight size={15} /> Switch to {plan.label}</>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Billing & Contact */}
        <div className="settings-section security-section">
          <div className="section-header-with-icon">
            <div className="section-icon-wrapper red-wrapper">
              <Phone size={24} />
            </div>
            <div>
              <h2 className="section-title-simple">Billing &amp; Support</h2>
              <p className="section-description">Payment methods and subscription support</p>
            </div>
          </div>

          <div className="security-list">
            <div className="security-item" onClick={() => setShowAutopay(true)}>
              <div className="security-left">
                <div className="security-icon-wrapper"><CreditCard size={20} /></div>
                <div className="security-content">
                  <h3 className="security-title">Payment Method</h3>
                  <p className="security-description">Add or update your autopay card or bank account</p>
                </div>
              </div>
              <ChevronRight size={20} className="security-arrow" />
            </div>

            <div className="security-item">
              <div className="security-left">
                <div className="security-icon-wrapper"><Users size={20} /></div>
                <div className="security-content">
                  <h3 className="security-title">Billing History</h3>
                  <p className="security-description">View past invoices and payment receipts</p>
                </div>
              </div>
              <ChevronRight size={20} className="security-arrow" />
            </div>

            {currentPlan !== 'Launchpad' && (
              <div className="security-item" onClick={() => setShowCancel(true)}>
                <div className="security-left">
                  <div className="security-icon-wrapper" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                    <X size={20} />
                  </div>
                  <div className="security-content">
                    <h3 className="security-title" style={{ color: '#ef4444' }}>Cancel Subscription</h3>
                    <p className="security-description">Cancel your current plan and downgrade to free</p>
                  </div>
                </div>
                <ChevronRight size={20} className="security-arrow" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Autopay Modal */}
      {showAutopay && (
        <div className="sub-modal-overlay" onClick={() => setShowAutopay(false)}>
          <div className="sub-modal" onClick={e => e.stopPropagation()}>
            <div className="sub-modal-header">
              <div className="sub-modal-title">
                <CreditCard size={20} />
                <h3>Setup Autopay</h3>
              </div>
              <button className="sub-modal-close" onClick={() => setShowAutopay(false)}><X size={18} /></button>
            </div>
            <form className="sub-modal-body" onSubmit={handleAutopay}>
              <div className="sub-field">
                <label>Cardholder Name</label>
                <input
                  placeholder="As on card"
                  value={autopayForm.name}
                  onChange={e => setAutopayForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="sub-field">
                <label>Card Number</label>
                <input
                  placeholder="1234 5678 9012 3456"
                  value={autopayForm.card}
                  onChange={e => setAutopayForm(f => ({ ...f, card: e.target.value }))}
                  maxLength={19}
                  required
                />
              </div>
              <div className="sub-field-row">
                <div className="sub-field">
                  <label>Expiry</label>
                  <input
                    placeholder="MM / YY"
                    value={autopayForm.expiry}
                    onChange={e => setAutopayForm(f => ({ ...f, expiry: e.target.value }))}
                    maxLength={7}
                    required
                  />
                </div>
                <div className="sub-field">
                  <label>CVV</label>
                  <input
                    placeholder="•••"
                    type="password"
                    value={autopayForm.cvv}
                    onChange={e => setAutopayForm(f => ({ ...f, cvv: e.target.value }))}
                    maxLength={4}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="sub-modal-btn" disabled={autopayLoading}>
                {autopayLoading ? 'Saving…' : <><CreditCard size={15} /> Save Payment Method</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancel && (
        <div className="sub-modal-overlay" onClick={() => setShowCancel(false)}>
          <div className="sub-modal sub-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="sub-modal-header">
              <div className="sub-modal-title">
                <AlertCircle size={20} style={{ color: '#ef4444' }} />
                <h3>Cancel Subscription?</h3>
              </div>
              <button className="sub-modal-close" onClick={() => setShowCancel(false)}><X size={18} /></button>
            </div>
            <div className="sub-modal-body">
              <p className="sub-cancel-warning">
                You are about to cancel your <strong>{currentPlan}</strong> plan. You'll keep access until the end of your current billing period.
              </p>
              <div className="sub-cancel-actions">
                <button className="sub-cancel-no" onClick={() => setShowCancel(false)}>
                  Keep My Plan
                </button>
                <button className="sub-cancel-yes" onClick={handleCancel}>
                  Yes, Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`cs-toast ${toast.type === 'error' ? 'cs-toast-error' : 'cs-toast-success'}`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}
    </>
  );
};

export default ManageSubscriptionView;
