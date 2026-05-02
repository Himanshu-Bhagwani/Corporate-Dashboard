import React, { useState, useEffect, useRef, useCallback } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import {
  TrendingDown,
  PiggyBank,
  Wallet,
  Rocket,
  BrainCircuit,
  ArrowRight,
  X,
  CheckCircle,
  Zap,
  Lock,
  Crown,
  MessageSquare,
  Send,
  Bot,
  User,
  Trash2,
  Download,
  ClipboardList
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { dashboardAPI, aiAPI } from '../../../services/api';
import './AiCfoView.css';

const FINANCE_KEYWORDS = [
  'revenue', 'expense', 'expenses', 'profit', 'loss', 'cash', 'tax', 'budget', 'cost',
  'payment', 'invoice', 'balance', 'income', 'spending', 'salary', 'salaries',
  'debit', 'credit', 'account', 'bank', 'financial', 'money', 'fund',
  'invest', 'return', 'margin', 'growth', 'decline', 'trend', 'forecast',
  'receivable', 'payable', 'liability', 'asset', 'equity', 'capital',
  'transaction', 'transactions', 'category', 'rupee', 'rupees', '₹', 'inr', 'gst',
  'tds', 'compliance', 'audit', 'ledger', 'journal', 'p&l', 'pnl',
  'cashflow', 'cash flow', 'net worth', 'overhead', 'operating', 'ebitda',
  'gross', 'net', 'total', 'monthly', 'quarterly', 'annual', 'yearly',
  'how much', 'what is my', 'break even', 'burn rate', 'runway',
  'top', 'highest', 'lowest', 'average', 'summary', 'overview', 'report',
  'spent', 'earned', 'paid', 'received', 'owe', 'owed', 'due', 'outstanding',
  'vendor', 'client', 'supplier', 'purchase', 'sale', 'sales', 'rent',
  'utilities', 'insurance', 'software', 'marketing', 'training', 'maintenance',
  'show me', 'tell me', 'give me', 'what are', 'how are', 'analyse', 'analyze',
  'compare', 'breakdown', 'break down', 'where', 'which', 'who', 'when',
  'did i', 'do i', 'have i', 'am i', 'am i spending', 'am i making',
  'plan', 'strategy', 'execute', 'queued', 'step'
];

const isFinanceQuestion = (msg) => {
  const lower = msg.toLowerCase();
  return FINANCE_KEYWORDS.some(kw => lower.includes(kw));
};

const SUGGESTED_QUESTIONS = [
  { text: 'What\'s my top expense?', icon: '📊' },
  { text: 'How is my cash flow?', icon: '💰' },
  { text: 'Revenue vs expenses summary', icon: '📈' },
  { text: 'What is my net profit?', icon: '🎯' },
];

const Sparkline = ({ data, color = '#6366f1', width = 120, height = 32 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="sparkline-svg">
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#grad-${color.replace('#','')})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const AiCfoView = () => {
  const { currentCompany } = useAuth();
  const [activeTab, setActiveTab] = useState('strategy');
  const [activeModal, setActiveModal] = useState(null);
  const [insights, setInsights] = useState(null);
  const [fullInsights, setFullInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePlans, setActivePlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [executingPlan, setExecutingPlan] = useState(false);
  const [toast, setToast] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! I\'m your AI CFO Assistant. Ask me anything about your company\'s finances — revenue, expenses, cash flow, and more.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isLaunchpad = currentCompany?.plan === 'Launchpad';

  useEffect(() => {
    const fetchInsights = async () => {
      if (!currentCompany || isLaunchpad) { setLoading(false); return; }
      try {
        setLoading(true);
        const data = await dashboardAPI.getInsights(currentCompany.id);
        setInsights(data.aiCfo);
        setFullInsights(data);
      } catch (error) {
        console.error('Failed to fetch AI CFO insights:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [currentCompany, isLaunchpad]);

  useEffect(() => {
    if (!currentCompany || isLaunchpad) return;
    const loadPlans = async () => {
      setPlansLoading(true);
      try {
        const data = await aiAPI.getActivePlans(currentCompany.id);
        setActivePlans(data.plans || []);
      } catch (e) {
        console.error('Failed to load active plans:', e);
      } finally {
        setPlansLoading(false);
      }
    };
    loadPlans();
  }, [currentCompany, isLaunchpad]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  useEffect(() => {
    if (activeTab === 'chat') inputRef.current?.focus();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'chat' && !historyLoaded && currentCompany) {
      const loadHistory = async () => {
        try {
          const data = await aiAPI.getChatHistory(currentCompany.id);
          if (data.messages && data.messages.length > 0) {
            const welcome = { role: 'ai', text: 'Hello! I\'m your AI CFO Assistant. Ask me anything about your company\'s finances — revenue, expenses, cash flow, and more.' };
            setMessages([welcome, ...data.messages]);
          }
        } catch (e) {
          console.error('Failed to load chat history:', e);
        }
        setHistoryLoaded(true);
      };
      loadHistory();
    }
  }, [activeTab, historyLoaded, currentCompany]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const sendMessage = useCallback(async (text) => {
    const msg = (text || inputValue).trim();
    if (!msg || chatLoading) return;
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    if (!isFinanceQuestion(msg)) {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: 'I can only assist with finance-related questions about your business data. Try asking about revenue, expenses, cash flow, or any financial metric!'
        }]);
      }, 300);
      return;
    }
    setChatLoading(true);
    setMessages(prev => [...prev, { role: 'ai', text: '', streaming: true }]);
    try {
      await aiAPI.chatWithCFOStream(msg, currentCompany?.id, (token) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastAi = updated[updated.length - 1];
          if (lastAi && lastAi.role === 'ai') {
            updated[updated.length - 1] = { ...lastAi, text: lastAi.text + token };
          }
          return updated;
        });
      });
      setMessages(prev => {
        const updated = [...prev];
        const lastAi = updated[updated.length - 1];
        if (lastAi && lastAi.role === 'ai') {
          updated[updated.length - 1] = { ...lastAi, streaming: false };
        }
        return updated;
      });
    } catch (error) {
      console.error('Chat stream error:', error);
      try {
        const data = await aiAPI.chatWithCFO(msg, currentCompany?.id);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'ai', text: data.reply, streaming: false };
          return updated;
        });
      } catch {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'ai', text: 'Sorry, I encountered an error processing your question. Please try again.', streaming: false };
          return updated;
        });
      }
    } finally {
      setChatLoading(false);
    }
  }, [inputValue, chatLoading, currentCompany]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleClearHistory = async () => {
    if (!currentCompany) return;
    try {
      await aiAPI.clearChatHistory(currentCompany.id);
      setMessages([{ role: 'ai', text: 'Chat history cleared. How can I help you today?' }]);
    } catch (e) { console.error('Failed to clear history:', e); }
  };

  const handleExportPDF = async () => {
    if (!currentCompany) return;
    try { await aiAPI.exportChatPDF(currentCompany.id); }
    catch (e) { console.error('Failed to export PDF:', e); }
  };

  const askAIAbout = (question) => {
    setActiveTab('chat');
    setTimeout(() => sendMessage(question), 400);
  };

  const handleExecutePlan = async () => {
    if (!currentCompany || !modalData || !activeModal) return;
    // Capture values before any state changes happen across awaits
    const planType = activeModal;
    const planTitle = modalData.title;
    const planSteps = modalData.steps;
    setExecutingPlan(true);
    try {
      const result = await aiAPI.executePlan(currentCompany.id, planType, planTitle, planSteps);
      // Use the returned plan directly — no second fetch needed
      const newPlan = result.plan;
      // Ensure steps is always an array (guard against unexpected DB return shape)
      if (!Array.isArray(newPlan.steps)) {
        newPlan.steps = planSteps;
      }
      setActivePlans(prev => [newPlan, ...prev]);
      setActiveModal(null);
      setActiveTab('plans');
      showToast(`"${planTitle}" queued successfully!`);
    } catch (e) {
      console.error('Execute plan failed:', e);
      showToast('Failed to queue plan. Please try again.', 'error');
    } finally {
      setExecutingPlan(false);
    }
  };

  const handleGetGuidance = (plan) => {
    setActiveTab('chat');
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    const stepsText = steps.join('; ');
    const msg = `I want to improve my business finances. My action items are: ${stepsText}. What should I do first?`;
    setTimeout(() => sendMessage(msg), 400);
  };

  const handleTogglePlanStatus = async (plan) => {
    if (!currentCompany) return;
    const newStatus = plan.status === 'active' ? 'completed' : 'active';
    try {
      await aiAPI.updatePlanStatus(currentCompany.id, plan.id, newStatus);
      setActivePlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: newStatus } : p));
    } catch (e) {
      console.error('Failed to update plan status:', e);
    }
  };

  const getSparklineData = (type) => {
    if (!fullInsights?.forecast?.historicalData) return [];
    return fullInsights.forecast.historicalData.map(m =>
      type === 'expense' ? m.expenses : m.revenue
    );
  };

  const getCardSeverity = (type) => {
    if (!insights) return 'neutral';
    switch (type) {
      case 'cost': return insights.costOptimization?.percentOfTotal > 40 ? 'critical' : insights.costOptimization ? 'warning' : 'neutral';
      case 'tax': return insights.taxOptimization?.totalTax > 0 ? 'warning' : 'neutral';
      case 'cash': return insights.cashFlow?.longestGap > 60 ? 'critical' : insights.cashFlow?.avgGap > 0 ? 'warning' : 'neutral';
      case 'growth': return insights.growth?.idleCash > 0 ? 'good' : 'neutral';
      default: return 'neutral';
    }
  };

  const getModalContent = (type) => {
    if (!insights) return null;
    switch (type) {
      case 'cost': return {
        title: 'Cost Optimization Strategy',
        intro: `Execution plan to reduce ${insights.costOptimization?.category || 'expenses'} spend without impacting operations.`,
        steps: [
          `Analyze ${insights.costOptimization?.category || 'uncategorized'} expenses for immediate reduction opportunities`,
          `Re-allocate 12% budget to short-term cash reserves`,
          `Estimated savings: ₹${(insights.costOptimization?.savings || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`
        ]
      };
      case 'tax': return {
        title: 'Tax Optimization Protocol',
        intro: 'Quarterly payment execution steps to boost short-term liquidity.',
        steps: [
          'Consult CPA regarding quarterly safe-harbor requirements',
          `Calculate rolling quarterly average tax liability currently at ₹${(insights.taxOptimization?.monthlyAverage || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}/month`,
          'Automate cash sweep into designated tax-reserve accounts'
        ]
      };
      case 'cash': return {
        title: 'Working Capital Recovery',
        intro: `Automated follow-up strategy. Average gap between income is ${insights.cashFlow?.avgGap || 0} days.`,
        steps: [
          'Configure automated Dunning emails at 30 and 45 days',
          'Send standardized late-fee warning notice',
          'Restrict future major shipments until balance is cleared'
        ]
      };
      case 'growth': return {
        title: 'Excess Capital Allocation',
        intro: 'Safe-yield strategy for compounding dormant cash reserves.',
        steps: [
          `Identify dormant funds in operational checking accounts (₹${(insights.growth?.idleCash || 0).toLocaleString(undefined, {maximumFractionDigits: 0})})`,
          'Transition capital to 6-month laddered Treasury Bills at ~7% yield',
          `Achieve estimated ₹${(insights.growth?.estimatedReturn || 0).toLocaleString(undefined, {maximumFractionDigits: 0})} risk-free annualized return`
        ]
      };
      default: return null;
    }
  };

  const getPlanTypeConfig = (type) => {
    switch (type) {
      case 'cost': return { Icon: TrendingDown, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
      case 'tax': return  { Icon: PiggyBank,   color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' };
      case 'cash': return { Icon: Wallet,       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
      case 'growth': return { Icon: Rocket,     color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
      default: return      { Icon: BrainCircuit,color: '#6366f1', bg: 'rgba(99,102,241,0.1)' };
    }
  };

  const modalData = activeModal ? getModalContent(activeModal) : null;
  const fmt = (n) => `₹${(n || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`;
  const activePlanCount = activePlans.filter(p => p.status === 'active').length;

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
            <div className="aicfo-paywall-icon"><Lock size={48} /></div>
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
            <button className="aicfo-paywall-btn"><Crown size={18} /> Upgrade to Growth</button>
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

      {/* Toast */}
      {toast && (
        <div className={`aicfo-toast aicfo-toast-${toast.type}`}>
          <CheckCircle size={16} />
          {toast.message}
        </div>
      )}

      {/* Tab Bar */}
      <div className="aicfo-tabs">
        <button className={`aicfo-tab-btn ${activeTab === 'strategy' ? 'active' : ''}`} onClick={() => setActiveTab('strategy')}>
          <BrainCircuit size={16} />
          Strategy
        </button>
        <button className={`aicfo-tab-btn ${activeTab === 'plans' ? 'active' : ''}`} onClick={() => setActiveTab('plans')}>
          <Zap size={16} />
          Active Plans
          {activePlanCount > 0 && <span className="aicfo-tab-badge">{activePlanCount}</span>}
        </button>
        <button className={`aicfo-tab-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
          <MessageSquare size={16} />
          AI Chat
        </button>
      </div>

      {/* ── Strategy Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'strategy' && (
        <div className="aicfo-grid">
          {/* Cost Optimization */}
          <div className={`aicfo-card severity-${getCardSeverity('cost')}`}>
            <div className="aicfo-card-header">
              <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.15))', color: '#ef4444' }}>
                <TrendingDown size={24} />
              </div>
              <h2 className="aicfo-card-title">Cost Optimization</h2>
              <Sparkline data={getSparklineData('expense')} color="#ef4444" />
            </div>
            {insights?.costOptimization && (
              <div className="metric-pills">
                <span className="metric-pill">{fmt(insights.costOptimization.amount)} total</span>
                <span className="metric-pill">{insights.costOptimization.percentOfTotal?.toFixed(0)}% of spend</span>
                <span className="metric-pill pill-green">↓{fmt(insights.costOptimization.savings)} savings</span>
              </div>
            )}
            <p className="aicfo-card-desc">AI-driven opportunities to reduce overarching business expenses without sacrificing operational efficiency.</p>
            <div className="aicfo-suggestion-box">
              <div className="suggestion-badge" style={{ background: '#fef2f2', color: '#ef4444' }}>High Priority</div>
              <p className="suggestion-text">
                {loading ? 'Analyzing expenses...' : insights?.costOptimization ?
                  `"Reducing ${insights.costOptimization.category} spend by 12% increases net profit by ${fmt(insights.costOptimization.savings)}."` :
                  'Upload transactions to unlock optimization strategies.'}
              </p>
              <div className="aicfo-card-actions">
                <button className="aicfo-action-btn" onClick={() => setActiveModal('cost')} disabled={loading || !insights?.costOptimization}>
                  View Strategy Plan <ArrowRight size={16} />
                </button>
                <button className="aicfo-ask-btn" onClick={() => askAIAbout('How can I reduce my largest expense category?')}>
                  💬 Ask AI
                </button>
              </div>
            </div>
          </div>

          {/* Tax Optimization */}
          <div className={`aicfo-card severity-${getCardSeverity('tax')}`}>
            <div className="aicfo-card-header">
              <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(124,58,237,0.15))', color: '#8b5cf6' }}>
                <PiggyBank size={24} />
              </div>
              <h2 className="aicfo-card-title">Tax Optimization</h2>
            </div>
            {insights?.taxOptimization?.totalTax > 0 && (
              <div className="metric-pills">
                <span className="metric-pill">{fmt(insights.taxOptimization.monthlyAverage)}/mo avg</span>
                <span className="metric-pill">{fmt(insights.taxOptimization.totalTax)} annual</span>
              </div>
            )}
            <p className="aicfo-card-desc">Proactive structural and payment cadence adjustments aimed at maximizing tax benefits.</p>
            <div className="aicfo-suggestion-box">
              <div className="suggestion-badge" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>Liquidity Boost</div>
              <p className="suggestion-text">
                {loading ? 'Analyzing taxes...' : insights?.taxOptimization?.totalTax > 0 ?
                  `"Switch to quarterly tax payments for your ${fmt(insights.taxOptimization.monthlyAverage)} avg monthly liability to improve liquidity."` :
                  'No tax liabilities detected. Upload more transactions.'}
              </p>
              <div className="aicfo-card-actions">
                <button className="aicfo-action-btn" onClick={() => setActiveModal('tax')} disabled={loading || !insights?.taxOptimization?.totalTax}>
                  Review Liabilities <ArrowRight size={16} />
                </button>
                <button className="aicfo-ask-btn" onClick={() => askAIAbout('How can I optimize my tax payments?')}>
                  💬 Ask AI
                </button>
              </div>
            </div>
          </div>

          {/* Cash Flow Improvement */}
          <div className={`aicfo-card severity-${getCardSeverity('cash')}`}>
            <div className="aicfo-card-header">
              <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.15))', color: '#f59e0b' }}>
                <Wallet size={24} />
              </div>
              <h2 className="aicfo-card-title">Cash Flow Improvement</h2>
              <Sparkline data={getSparklineData('revenue')} color="#f59e0b" />
            </div>
            {insights?.cashFlow?.avgGap > 0 && (
              <div className="metric-pills">
                <span className="metric-pill">{insights.cashFlow.avgGap} day avg gap</span>
                <span className="metric-pill">{insights.cashFlow.longestGap} day longest</span>
              </div>
            )}
            <p className="aicfo-card-desc">Actionable alerts identifying delayed inflows and identifying working capital acceleration solutions.</p>
            <div className="aicfo-suggestion-box">
              <div className="suggestion-badge" style={{ background: '#fffbeb', color: '#d97706' }}>Action Required</div>
              <p className="suggestion-text">
                {loading ? 'Analyzing cash flow gaps...' : insights?.cashFlow?.avgGap > 0 ?
                  `"Average gap between income is ${insights.cashFlow.avgGap} days, with longest at ${insights.cashFlow.longestGap} days. Consider automated reminders."` :
                  'Upload income transactions to analyze cash flow gaps.'}
              </p>
              <div className="aicfo-card-actions">
                <button className="aicfo-action-btn" onClick={() => setActiveModal('cash')} disabled={loading || !insights?.cashFlow?.avgGap}>
                  Automate Follow-ups <ArrowRight size={16} />
                </button>
                <button className="aicfo-ask-btn" onClick={() => askAIAbout('How can I improve my cash flow timing?')}>
                  💬 Ask AI
                </button>
              </div>
            </div>
          </div>

          {/* Growth Suggestions */}
          <div className={`aicfo-card severity-${getCardSeverity('growth')}`}>
            <div className="aicfo-card-header">
              <div className="aicfo-icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.15))', color: '#10b981' }}>
                <Rocket size={24} />
              </div>
              <h2 className="aicfo-card-title">Growth Suggestions</h2>
            </div>
            {insights?.growth?.idleCash > 0 && (
              <div className="metric-pills">
                <span className="metric-pill">{fmt(insights.growth.idleCash)} idle</span>
                <span className="metric-pill pill-green">{fmt(insights.growth.estimatedReturn)} return</span>
              </div>
            )}
            <p className="aicfo-card-desc">Calculated capital allocation recommendations designed to compound and sustainably accelerate growth metrics.</p>
            <div className="aicfo-suggestion-box">
              <div className="suggestion-badge" style={{ background: '#ecfdf5', color: '#10b981' }}>Opportunity</div>
              <p className="suggestion-text">
                {loading ? 'Analyzing idle cash...' : insights?.growth?.idleCash > 0 ?
                  `"Allocating excess ${fmt(insights.growth.idleCash)} cash to short-term T-bills adds an estimated ${fmt(insights.growth.estimatedReturn)} risk-free return on dormant capital."` :
                  'Increase cash reserves to unlock investment strategies.'}
              </p>
              <div className="aicfo-card-actions">
                <button className="aicfo-action-btn" onClick={() => setActiveModal('growth')} disabled={loading || !insights?.growth?.idleCash}>
                  Explore Investments <ArrowRight size={16} />
                </button>
                <button className="aicfo-ask-btn" onClick={() => askAIAbout('What should I do with my idle cash?')}>
                  💬 Ask AI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Plans Tab ──────────────────────────────────────────────── */}
      {activeTab === 'plans' && (
        <div className="active-plans-section">
          {plansLoading ? (
            <div className="plans-empty">
              <div className="plans-empty-icon" style={{ opacity: 0.4 }}><Zap size={48} /></div>
              <p>Loading plans...</p>
            </div>
          ) : activePlans.length === 0 ? (
            <div className="plans-empty">
              <div className="plans-empty-icon"><ClipboardList size={52} /></div>
              <h3>No Active Plans Yet</h3>
              <p>Go to the Strategy tab and click <strong>Execute Plan</strong> on any card to queue a financial plan here.</p>
              <button className="plans-empty-btn" onClick={() => setActiveTab('strategy')}>
                <BrainCircuit size={16} /> View Strategy Cards
              </button>
            </div>
          ) : (
            <>
              <div className="plans-section-header">
                <span className="plans-count">{activePlans.length} plan{activePlans.length !== 1 ? 's' : ''} total · {activePlanCount} active</span>
              </div>
              <div className="active-plans-grid">
                {activePlans.map(plan => {
                  const { Icon, color, bg } = getPlanTypeConfig(plan.plan_type);
                  const isCompleted = plan.status === 'completed';
                  return (
                    <div key={plan.id} className={`active-plan-card ${isCompleted ? 'plan-completed' : ''}`}>
                      <div className="plan-card-header">
                        <div className="plan-card-icon" style={{ background: bg, color }}>
                          <Icon size={22} />
                        </div>
                        <div className="plan-card-title-group">
                          <h3>{plan.plan_title}</h3>
                          <span className="plan-date">
                            {new Date(plan.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <span className={`plan-status-badge plan-status-${plan.status}`}>
                          {isCompleted ? '✓ Done' : '● Active'}
                        </span>
                      </div>

                      <div className="plan-steps">
                        <h4>Plan Steps</h4>
                        <ul>
                          {(Array.isArray(plan.steps) ? plan.steps : []).map((step, i) => (
                            <li key={i}>
                              <CheckCircle size={14} style={{ color: isCompleted ? '#10b981' : '#94a3b8', flexShrink: 0 }} />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="plan-card-actions">
                        {!isCompleted && (
                          <button className="plan-guidance-btn" onClick={() => handleGetGuidance(plan)}>
                            <MessageSquare size={15} /> Get AI Guidance
                          </button>
                        )}
                        <button
                          className={`plan-toggle-btn ${isCompleted ? 'plan-reopen-btn' : ''}`}
                          onClick={() => handleTogglePlanStatus(plan)}
                        >
                          {isCompleted ? 'Reopen' : <><CheckCircle size={15} /> Mark Complete</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── AI Chat Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'chat' && (
        <div className="aicfo-chat-embed">
          <div className="chat-embed-header">
            <div className="chat-panel-title">
              <div className="chat-panel-avatar"><Bot size={18} /></div>
              <div>
                <h4>AI CFO Assistant</h4>
                <span className="chat-status">
                  <span className="chat-status-dot"></span>
                  Online · Powered by AI
                </span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button className="chat-header-btn" onClick={handleExportPDF} title="Export as PDF">
                <Download size={15} />
              </button>
              <button className="chat-header-btn" onClick={handleClearHistory} title="Clear history">
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message chat-message-${msg.role}`}>
                {msg.role === 'ai' && (
                  <div className="chat-msg-avatar ai-avatar"><BrainCircuit size={14} /></div>
                )}
                <div className={`chat-bubble chat-bubble-${msg.role}`}>
                  {msg.text}
                  {msg.streaming && <span className="streaming-cursor">▊</span>}
                </div>
                {msg.role === 'user' && (
                  <div className="chat-msg-avatar user-avatar"><User size={14} /></div>
                )}
              </div>
            ))}
            {chatLoading && messages[messages.length - 1]?.text === '' && (
              <div className="chat-message chat-message-ai">
                <div className="chat-msg-avatar ai-avatar"><BrainCircuit size={14} /></div>
                <div className="chat-bubble chat-bubble-ai typing-bubble">
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && !chatLoading && (
            <div className="chat-suggestions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} className="chat-suggestion-chip" onClick={() => sendMessage(q.text)}>
                  <span>{q.icon}</span> {q.text}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-bar">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="Ask about your finances..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={chatLoading}
              id="ai-cfo-chat-input"
            />
            <button
              className="chat-send-btn"
              onClick={() => sendMessage()}
              disabled={!inputValue.trim() || chatLoading}
              id="ai-cfo-chat-send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Strategy Modal ────────────────────────────────────────────────── */}
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
                      <span className="step-icon"><CheckCircle size={16} /></span>
                      <span className="step-text">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="aicfo-modal-footer">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Dismiss</button>
              <button className="btn-primary" onClick={handleExecutePlan} disabled={executingPlan}>
                <Zap size={16} style={{ marginRight: '6px' }} />
                {executingPlan ? 'Queuing...' : 'Execute Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AiCfoView;
