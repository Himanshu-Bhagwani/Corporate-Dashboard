import React, { useState } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { 
  TrendingDown, 
  PiggyBank, 
  Wallet, 
  Rocket, 
  BrainCircuit, 
  ArrowRight,
  TrendingUp,
  X,
  CheckCircle,
  Zap,
  Lock,
  Crown
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import './AiCfoView.css';
const AiCfoView = () => {
  const { currentCompany } = useAuth();
  const [activeModal, setActiveModal] = useState(null);

  const isLaunchpad = currentCompany?.plan === 'Launchpad';

  const getModalContent = (type) => {
    switch (type) {
      case 'cost':
        return {
          title: 'Cost Optimization Strategy',
          intro: 'Execution plan to reduce marketing spend without impacting lead generation.',
          steps: [
            'Pause underperforming LinkedIn outbound campaigns',
            'Re-allocate 12% ad budget to Q4 cash reserve',
            'Estimated monthly savings: ₹25,830'
          ]
        };
      case 'tax':
        return {
          title: 'Tax Optimization Protocol',
          intro: 'Quarterly payment execution steps to boost short-term liquidity.',
          steps: [
            'Consult CPA regarding quarterly safe-harbor requirements',
            'Calculate rolling quarterly average tax liability',
            'Automate cash sweep into designated tax-reserve accounts'
          ]
        };
      case 'cash':
        return {
          title: 'Working Capital Recovery',
          intro: 'Automated follow-up sequence for Client XYZ (Avg delay: 52 days).',
          steps: [
            'Configure automated Dunning emails at 30 and 45 days',
            'Send standardized late-fee warning notice',
            'Restrict future major shipments until balance is cleared'
          ]
        };
      case 'growth':
        return {
          title: 'Excess Capital Allocation',
          intro: 'Safe-yield strategy for compounding dormant cash reserves.',
          steps: [
            'Identify dormant funds in operational checking accounts',
            'Transition capital to 6-month laddered Treasury Bills',
            'Achieve estimated ~4.5% risk-free annualized return'
          ]
        };
      default:
        return null;
    }
  };

  const modalData = activeModal ? getModalContent(activeModal) : null;

  if (isLaunchpad) {
    return (
      <>
        <EmbeddedHeader />
        <div className="view-header aicfo-header">
          <div>
            <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BrainCircuit size={28} style={{ color: 'var(--primary-color)' }} />
              AI CFO Module
            </h1>
            <p className="view-subtitle">Strategic financial insights and optimization plans powered by AI</p>
          </div>
        </div>
        
        <div className="aicfo-paywall-container">
          <div className="aicfo-paywall-card">
            <div className="aicfo-paywall-icon">
              <Lock size={48} />
            </div>
            <h2>Unlock the AI CFO Module</h2>
            <p>Upgrade to the <strong>Growth</strong> or <strong>Enterprise</strong> plan to unlock strategic cost, tax, and cash flow insights powered by our Virtual AI CFO.</p>
            <div className="aicfo-paywall-features">
              <ul>
                <li><CheckCircle size={16} /> Automated Cost Reduction Plans</li>
                <li><CheckCircle size={16} /> Real-time Tax Liquidity Alerts</li>
                <li><CheckCircle size={16} /> Predictive Cash Flow Sequencing</li>
                <li><CheckCircle size={16} /> Growth Capital Strategies</li>
              </ul>
            </div>
            <button className="aicfo-paywall-btn">
              <Crown size={18} /> Upgrade to Growth
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header aicfo-header">
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BrainCircuit size={28} style={{ color: 'var(--primary-color)' }} />
            AI CFO Module
          </h1>
          <p className="view-subtitle">Strategic financial insights and optimization plans powered by AI</p>
        </div>
      </div>

      <div className="aicfo-grid">
        {/* Cost Optimization */}
        <div className="aicfo-card">
          <div className="aicfo-card-header">
            <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.15))', color: '#ef4444' }}>
              <TrendingDown size={24} />
            </div>
            <h2 className="aicfo-card-title">Cost Optimization</h2>
          </div>
          <p className="aicfo-card-desc">AI-driven opportunities to reduce overarching business expenses without sacrificing operational efficiency.</p>
          <div className="aicfo-suggestion-box">
            <div className="suggestion-badge" style={{ background: '#fef2f2', color: '#ef4444' }}>High Priority</div>
            <p className="suggestion-text">"Reducing marketing spend by 12% increases net profit by ₹3.1L annually."</p>
            <button className="aicfo-action-btn" onClick={() => setActiveModal('cost')}>
              View Strategy Plan <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Tax Optimization */}
        <div className="aicfo-card">
          <div className="aicfo-card-header">
            <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(124, 58, 237, 0.15))', color: '#8b5cf6' }}>
              <PiggyBank size={24} />
            </div>
            <h2 className="aicfo-card-title">Tax Optimization</h2>
          </div>
          <p className="aicfo-card-desc">Proactive structural and payment cadence adjustments aimed at maximizing tax benefits.</p>
          <div className="aicfo-suggestion-box">
            <div className="suggestion-badge" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>Liquidity Boost</div>
            <p className="suggestion-text">"Switch to quarterly tax payments to improve overall liquidity."</p>
            <button className="aicfo-action-btn" onClick={() => setActiveModal('tax')}>
              Review Liabilities <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Cash Flow Improvement */}
        <div className="aicfo-card">
          <div className="aicfo-card-header">
            <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.15))', color: '#f59e0b' }}>
              <Wallet size={24} />
            </div>
            <h2 className="aicfo-card-title">Cash Flow Improvement</h2>
          </div>
          <p className="aicfo-card-desc">Actionable alerts identifying delayed inflows and identifying working capital acceleration solutions.</p>
          <div className="aicfo-suggestion-box">
            <div className="suggestion-badge" style={{ background: '#fffbeb', color: '#d97706' }}>Action Required</div>
            <p className="suggestion-text">"Client XYZ payment delay average: 52 days. Consider automated reminders."</p>
            <button className="aicfo-action-btn" onClick={() => setActiveModal('cash')}>
              Automate Follow-ups <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Growth Suggestions */}
        <div className="aicfo-card">
          <div className="aicfo-card-header">
            <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.15))', color: '#10b981' }}>
              <Rocket size={24} />
            </div>
            <h2 className="aicfo-card-title">Growth Suggestions</h2>
          </div>
          <p className="aicfo-card-desc">Calculated capital allocation recommendations designed to compound and sustainably accelerate growth metrics.</p>
          <div className="aicfo-suggestion-box">
            <div className="suggestion-badge" style={{ background: '#ecfdf5', color: '#10b981' }}>Opportunity</div>
            <p className="suggestion-text">"Allocating excess cash to short-term T-bills adds an estimated 4.5% risk-free return on dormant capital."</p>
            <button className="aicfo-action-btn" onClick={() => setActiveModal('growth')}>
              Explore Investments <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {activeModal && modalData && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="aicfo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="aicfo-modal-header">
              <div className="aicfo-modal-title-row">
                <BrainCircuit size={24} style={{ color: 'var(--primary-color)' }} />
                <h3>{modalData.title}</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="aicfo-modal-body">
              <p className="aicfo-modal-intro">{modalData.intro}</p>
              
              <div className="aicfo-action-steps">
                <h4>Suggested Action Plan</h4>
                <ul>
                  {modalData.steps.map((step, idx) => (
                    <li key={idx}>
                      <span className="step-icon">
                        <CheckCircle size={16} />
                      </span>
                      <span className="step-text">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="aicfo-modal-footer">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Dismiss</button>
              <button className="btn-primary" onClick={() => {
                alert('Plan successfully queued for execution.');
                setActiveModal(null);
              }}>
                <Zap size={16} style={{ marginRight: '6px' }} />
                Execute Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AiCfoView;
