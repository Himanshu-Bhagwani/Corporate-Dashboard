import React, { useState } from 'react';
import './Sidebar.css';
import { LayoutDashboard, Receipt, FileText, TrendingUp, BarChart3, FileCheck, Settings, BookOpen, BrainCircuit, Lock, Activity, CalendarClock, ArrowUpCircle, Check, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { companiesAPI } from '../../../services/api';

const PLAN_HIERARCHY = ['Launchpad', 'Growth', 'Enterprise X'];

const PLAN_DETAILS = {
  'Launchpad': {
    price: '₹12,000',
    period: '/month',
    features: ['Complete bookkeeping', 'GST & TDS compliance', 'Up to 3 users']
  },
  'Growth': {
    price: '₹20,000',
    period: '/month',
    badge: 'Recommended',
    features: ['Everything in Launchpad', 'Advanced analytics', 'Virtual CFO support', 'Up to 10 users']
  },
  'Enterprise X': {
    price: 'Custom',
    period: 'pricing',
    features: ['Everything in Growth', 'Multi-entity management', 'Dedicated account manager', 'Unlimited users']
  }
};

const Sidebar = ({ activeView, setActiveView, stats }) => {
  const { currentCompany, updateCurrentCompanyPlan } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  
  const currentPlan = currentCompany?.plan || 'Launchpad';
  const isLaunchpad = currentPlan === 'Launchpad';
  const isEnterprise = currentPlan === 'Enterprise X';
  const currentPlanIdx = PLAN_HIERARCHY.indexOf(currentPlan);
  const availableUpgrades = PLAN_HIERARCHY.filter((_, i) => i > currentPlanIdx);

  const handleUpgrade = async (plan) => {
    if (!currentCompany) return;
    setUpgrading(true);
    setUpgradeError('');
    try {
      await companiesAPI.upgradePlan(currentCompany.id, plan);
      updateCurrentCompanyPlan(plan);
      setUpgradeOpen(false);
    } catch (err) {
      setUpgradeError(err.message || 'Failed to upgrade plan');
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="account-info">
          <div className="account-avatar">
            <LayoutDashboard size={24} />
          </div>
          <div className="account-details">
            <h1 className="app-logo">Dashboard</h1>
            <p className="account-type">Corporate Account</p>
          </div>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        <button 
          className={`nav-button ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveView('transactions')}
        >
          <Receipt size={20} />
          <span>Transactions</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'accounting' ? 'active' : ''}`}
          onClick={() => setActiveView('accounting')}
        >
          <BookOpen size={20} />
          <span>Accounting</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveView('invoices')}
        >
          <FileText size={20} />
          <span>Invoices</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'cashflow' ? 'active' : ''}`}
          onClick={() => setActiveView('cashflow')}
        >
          <TrendingUp size={20} />
          <span>Cash Flow</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveView('reports')}
        >
          <BarChart3 size={20} />
          <span>Reports</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'compliance' ? 'active' : ''}`}
          onClick={() => setActiveView('compliance')}
        >
          <FileCheck size={20} />
          <span>Compliance</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'aicfo' ? 'active' : ''}`}
          onClick={() => setActiveView('aicfo')}
        >
          <BrainCircuit size={20} />
          <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            AI CFO
            {isLaunchpad && <Lock size={14} style={{ marginLeft: 'auto', color: '#94a3b8' }} />}
          </span>
        </button>
        <button 
          className={`nav-button ${activeView === 'profitlab' ? 'active' : ''}`}
          onClick={() => setActiveView('profitlab')}
        >
          <Activity size={20} />
          <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            Profit Lab
            {isLaunchpad && <Lock size={14} style={{ marginLeft: 'auto', color: '#94a3b8' }} />}
          </span>
        </button>
        <button 
          className={`nav-button ${activeView === 'forecasting' ? 'active' : ''}`}
          onClick={() => setActiveView('forecasting')}
        >
          <CalendarClock size={20} />
          <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            Forecasting
            {isLaunchpad && <Lock size={14} style={{ marginLeft: 'auto', color: '#94a3b8' }} />}
          </span>
        </button>
        <button 
          className={`nav-button ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveView('settings')}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>

      {/* Current Plan & Upgrade Section */}
      <div className="sidebar-plan-section">
        <div className="current-plan-label">
          <Sparkles size={12} />
          <span>{currentPlan}</span>
        </div>

        {!isEnterprise && (
          <>
            <button
              className="upgrade-plan-btn"
              onClick={() => setUpgradeOpen(!upgradeOpen)}
            >
              <ArrowUpCircle size={16} />
              <span>Upgrade Plan</span>
            </button>

            {upgradeOpen && (
              <div className="upgrade-panel">
                <div className="upgrade-panel-header">
                  <span>Available Plans</span>
                  <button className="upgrade-close-btn" onClick={() => setUpgradeOpen(false)}>
                    <X size={14} />
                  </button>
                </div>
                {upgradeError && <div className="upgrade-error">{upgradeError}</div>}
                {availableUpgrades.map(plan => (
                  <div key={plan} className="upgrade-card">
                    {PLAN_DETAILS[plan].badge && (
                      <div className="upgrade-badge">{PLAN_DETAILS[plan].badge}</div>
                    )}
                    <div className="upgrade-card-header">
                      <h4>{plan}</h4>
                      <div className="upgrade-price">
                        {PLAN_DETAILS[plan].price}
                        <span>{PLAN_DETAILS[plan].period}</span>
                      </div>
                    </div>
                    <ul className="upgrade-features">
                      {PLAN_DETAILS[plan].features.map((f, i) => (
                        <li key={i}><Check size={12} />{f}</li>
                      ))}
                    </ul>
                    <button
                      className="upgrade-confirm-btn"
                      onClick={() => handleUpgrade(plan)}
                      disabled={upgrading}
                    >
                      {upgrading ? 'Upgrading...' : `Upgrade to ${plan}`}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </aside>
  );
};

export default Sidebar;
