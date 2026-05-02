import React, { useState, useMemo } from 'react';
import './LoanOffersView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { computeHealthScore, getScoreLabel, getScoreColor } from '../../../utils/healthScore';
import {
  BadgeCheck, ChevronRight, ExternalLink, Landmark, Star,
  TrendingUp, Shield, Percent, Clock, Info, Search,
  SlidersHorizontal, ArrowUpRight,
} from 'lucide-react';

/* ── Loan Data ─────────────────────────────────────────────────── */
const ALL_LOANS = [
  // ===== PREMIUM (Health 80+, CIBIL 750+) =====
  {
    id: 'hdfc-smart', bank: 'HDFC Bank', domain: 'hdfcbank.com',
    product: 'SmartBiz Business Loan', type: 'Unsecured',
    rate: '10.5% – 12.5% p.a.', rateMin: 10.5,
    maxAmount: '₹50 Lakhs', tenure: 'Up to 48 months',
    processingFee: '1% of loan amount',
    minHealth: 80, minCibil: 750, tier: 'premium',
    badge: 'Best Rate',
    features: ['Instant 24-hr approval', 'No collateral', 'Balance transfer available', 'Doorstep service'],
    url: 'https://www.hdfcbank.com/sme/apply/business-loan',
    color: '#004c97', accentColor: '#e31837',
  },
  {
    id: 'sbi-sme', bank: 'State Bank of India', domain: 'sbi.co.in',
    product: 'SME Smart Loan', type: 'Unsecured',
    rate: '11.0% – 13.5% p.a.', rateMin: 11.0,
    maxAmount: '₹75 Lakhs', tenure: 'Up to 60 months',
    processingFee: '0.5% + taxes',
    minHealth: 80, minCibil: 750, tier: 'premium',
    badge: 'Highest Limit',
    features: ['Government bank reliability', 'CGTMSE coverage', 'Concessional rates for women', 'Easy prepayment'],
    url: 'https://sbi.co.in/web/business/sme/sme-loans',
    color: '#1e3a8a', accentColor: '#f59e0b',
  },
  {
    id: 'icici-biz', bank: 'ICICI Bank', domain: 'icicibank.com',
    product: 'Business Installment Loan', type: 'Unsecured',
    rate: '11.5% – 14.5% p.a.', rateMin: 11.5,
    maxAmount: '₹40 Lakhs', tenure: 'Up to 48 months',
    processingFee: '2% of loan amount',
    minHealth: 80, minCibil: 750, tier: 'premium',
    features: ['Pre-approved for existing customers', 'Flexible repayment', '24×7 digital access', 'Tax certificates provided'],
    url: 'https://www.icicibank.com/business-banking/loans/business-installment-loan',
    color: '#f26522', accentColor: '#003087',
  },
  {
    id: 'kotak-grow', bank: 'Kotak Mahindra Bank', domain: 'kotak.com',
    product: 'Business Growth Loan', type: 'Unsecured',
    rate: '12.0% – 14.0% p.a.', rateMin: 12.0,
    maxAmount: '₹25 Lakhs', tenure: 'Up to 60 months',
    processingFee: '2% of loan amount',
    minHealth: 80, minCibil: 750, tier: 'premium',
    features: ['Zero foreclosure charges', 'Insurance cover available', 'Dedicated RM', 'GST filing assistance'],
    url: 'https://www.kotak.com/en/business-banking/loans/business-loan.html',
    color: '#c8102e', accentColor: '#1e1e1e',
  },
  {
    id: 'axis-power', bank: 'Axis Bank', domain: 'axisbank.com',
    product: 'Business Power Loan', type: 'Unsecured',
    rate: '12.0% – 15.0% p.a.', rateMin: 12.0,
    maxAmount: '₹30 Lakhs', tenure: 'Up to 36 months',
    processingFee: '1.5% + GST',
    minHealth: 80, minCibil: 750, tier: 'premium',
    features: ['Minimal documentation', 'Quick disbursement', 'Overdraft facility', 'Digital management'],
    url: 'https://www.axisbank.com/business-banking/loans-and-advances/business-loan',
    color: '#800000', accentColor: '#f9a800',
  },
  {
    id: 'tata-biz', bank: 'Tata Capital', domain: 'tatacapital.com',
    product: 'Business Loan', type: 'Unsecured',
    rate: '13.0% – 15.0% p.a.', rateMin: 13.0,
    maxAmount: '₹50 Lakhs', tenure: 'Up to 36 months',
    processingFee: '2.5% of loan amount',
    minHealth: 80, minCibil: 740, tier: 'premium',
    features: ['Competitive rates', 'Flexible EMIs', 'Balance transfer', 'Top-up facility'],
    url: 'https://www.tatacapital.com/business-loan.html',
    color: '#003087', accentColor: '#0076bd',
  },
  // ===== STANDARD (Health 60-79, CIBIL 700-749) =====
  {
    id: 'hdfc-std', bank: 'HDFC Bank', domain: 'hdfcbank.com',
    product: 'Business Loan', type: 'Unsecured',
    rate: '13.5% – 16.0% p.a.', rateMin: 13.5,
    maxAmount: '₹25 Lakhs', tenure: 'Up to 36 months',
    processingFee: '1.5% of loan amount',
    minHealth: 60, minCibil: 700, tier: 'standard',
    features: ['Quick disbursal', 'Minimal documents', 'Part prepayment allowed'],
    url: 'https://www.hdfcbank.com/sme/apply/business-loan',
    color: '#004c97', accentColor: '#e31837',
  },
  {
    id: 'sbi-msme', bank: 'State Bank of India', domain: 'sbi.co.in',
    product: 'MSME Business Loan', type: 'Secured / Unsecured',
    rate: '13.0% – 16.5% p.a.', rateMin: 13.0,
    maxAmount: '₹35 Lakhs', tenure: 'Up to 60 months',
    processingFee: '0.5% + taxes',
    minHealth: 60, minCibil: 700, tier: 'standard',
    badge: 'Govt Backed',
    features: ['CGTMSE guarantee available', 'Govt-backed reliability', 'Low processing fee'],
    url: 'https://sbi.co.in/web/business/sme/sme-loans',
    color: '#1e3a8a', accentColor: '#f59e0b',
  },
  {
    id: 'bob-msme', bank: 'Bank of Baroda', domain: 'bankofbaroda.in',
    product: 'Baroda MSME Loan', type: 'Unsecured',
    rate: '13.5% – 16.0% p.a.', rateMin: 13.5,
    maxAmount: '₹25 Lakhs', tenure: 'Up to 60 months',
    processingFee: '1% of loan amount',
    minHealth: 60, minCibil: 700, tier: 'standard',
    features: ['Government bank rates', 'Concessional for women', 'Startup-friendly terms'],
    url: 'https://www.bankofbaroda.in/business-banking/msme-banking',
    color: '#f57f00', accentColor: '#003366',
  },
  {
    id: 'yes-biz', bank: 'YES Bank', domain: 'yesbank.in',
    product: 'Business Finance', type: 'Unsecured',
    rate: '14.0% – 17.5% p.a.', rateMin: 14.0,
    maxAmount: '₹20 Lakhs', tenure: 'Up to 36 months',
    processingFee: '2% of loan amount',
    minHealth: 60, minCibil: 700, tier: 'standard',
    features: ['Fast processing', 'Digital application', 'EMI holiday option'],
    url: 'https://www.yesbank.in/business-banking/business-loans/business-finance',
    color: '#003399', accentColor: '#66ccff',
  },
  {
    id: 'pnb-msme', bank: 'Punjab National Bank', domain: 'pnbindia.in',
    product: 'PNB MSME Loan', type: 'Secured / Unsecured',
    rate: '12.85% – 15.5% p.a.', rateMin: 12.85,
    maxAmount: '₹30 Lakhs', tenure: 'Up to 84 months',
    processingFee: '0.50% (min ₹1,000)',
    minHealth: 60, minCibil: 700, tier: 'standard',
    badge: 'Long Tenure',
    features: ['Government bank backing', 'Long tenure option', 'Priority sector lending'],
    url: 'https://www.pnbindia.in/businessloan.html',
    color: '#003366', accentColor: '#f0ad00',
  },
  // ===== BASIC (Health 40-59, CIBIL 650-699) =====
  {
    id: 'indusind-biz', bank: 'IndusInd Bank', domain: 'indusind.com',
    product: 'Business Loan', type: 'Unsecured',
    rate: '16.0% – 19.5% p.a.', rateMin: 16.0,
    maxAmount: '₹10 Lakhs', tenure: 'Up to 36 months',
    processingFee: '2.5% of loan amount',
    minHealth: 40, minCibil: 650, tier: 'basic',
    features: ['Quick approval', 'Minimal documents', 'Digital disbursal'],
    url: 'https://www.indusind.com/in/en/business/loans/business-loan.html',
    color: '#006eb5', accentColor: '#ff9900',
  },
  {
    id: 'bajaj-biz', bank: 'Bajaj Finserv', domain: 'bajajfinserv.in',
    product: 'Business Loan', type: 'Unsecured',
    rate: '17.0% – 22.0% p.a.', rateMin: 17.0,
    maxAmount: '₹10 Lakhs', tenure: 'Up to 24 months',
    processingFee: '3.54% incl. GST',
    minHealth: 40, minCibil: 650, tier: 'basic',
    features: ['Online application', 'Zero part-prepayment', 'Flexi loan option'],
    url: 'https://www.bajajfinserv.in/business-loan',
    color: '#00599d', accentColor: '#f58220',
  },
  {
    id: 'lendingkart', bank: 'Lendingkart Finance', domain: 'lendingkart.com',
    product: 'MSME Working Capital', type: 'Unsecured',
    rate: '18.0% – 24.0% p.a.', rateMin: 18.0,
    maxAmount: '₹7.5 Lakhs', tenure: 'Up to 36 months',
    processingFee: '2% of loan amount',
    minHealth: 40, minCibil: 650, tier: 'basic',
    badge: 'Fintech Speed',
    features: ['3-day approval', 'Paperless process', 'GST-based underwriting', 'Collateral-free'],
    url: 'https://www.lendingkart.com/business-loans/',
    color: '#ff6f00', accentColor: '#1a1a2e',
  },
  {
    id: 'cgtmse', bank: 'SIDBI / CGTMSE', domain: 'sidbi.in',
    product: 'CGTMSE Secured Loan', type: 'Secured',
    rate: '14.0% – 17.0% p.a.', rateMin: 14.0,
    maxAmount: '₹15 Lakhs', tenure: 'Up to 84 months',
    processingFee: '1% + guarantee fee',
    minHealth: 40, minCibil: 650, tier: 'basic',
    badge: 'Govt Guarantee',
    features: ['Govt guarantee scheme', 'Collateral-free for eligible', 'Longer tenure', 'Lower EMI burden'],
    url: 'https://www.cgtmse.in/',
    color: '#005c35', accentColor: '#fbbf24',
  },
  // ===== STARTER (Health <40 / low CIBIL) =====
  {
    id: 'mudra', bank: 'PMMY / MUDRA Loan', domain: 'mudra.org.in',
    product: 'Kishore / Tarun MUDRA', type: 'Govt Scheme',
    rate: '10.0% – 14.5% p.a.', rateMin: 10.0,
    maxAmount: '₹10 Lakhs', tenure: 'Up to 60 months',
    processingFee: 'Nil (Govt scheme)',
    minHealth: 0, minCibil: 0, tier: 'starter',
    badge: 'Govt Scheme',
    features: ['No collateral for Shishu', 'Interest subvention available', 'Available via PSU banks', 'SC/ST priority'],
    url: 'https://www.mudra.org.in',
    color: '#f4750b', accentColor: '#1a3a5c',
  },
  {
    id: 'standup', bank: 'Stand-Up India', domain: 'standupmitra.in',
    product: 'Stand-Up India Loan', type: 'Govt Scheme',
    rate: 'Base Rate + max 3%', rateMin: 10.0,
    maxAmount: '₹1 Crore', tenure: 'Up to 7 years',
    processingFee: 'Nil',
    minHealth: 0, minCibil: 0, tier: 'starter',
    badge: 'Highest Limit',
    features: ['For SC/ST/Women entrepreneurs', 'Mentor support included', 'Greenfield projects', 'Govt subsidy eligible'],
    url: 'https://www.standupmitra.in',
    color: '#1a5276', accentColor: '#f39c12',
  },
  {
    id: 'nbfc-lap', bank: 'NBFC – Loan Against Property', domain: 'bajajfinserv.in',
    product: 'Secured Business Loan (LAP)', type: 'Secured',
    rate: '14.0% – 18.0% p.a.', rateMin: 14.0,
    maxAmount: 'Up to 60% LTV', tenure: 'Up to 120 months',
    processingFee: '1–2% of loan amount',
    minHealth: 0, minCibil: 550, tier: 'starter',
    features: ['High amount via collateral', 'Property/equipment mortgage', 'Longer tenure = lower EMI', 'NBFC flexibility'],
    url: 'https://www.bajajfinserv.in/loan-against-property-for-business',
    color: '#7b2d8b', accentColor: '#f59e0b',
  },
];

const TIER_META = {
  premium:  { label: 'Premium',  color: '#10b981', bg: 'rgba(16,185,129,0.1)',  desc: 'Best rates — strong health + high CIBIL' },
  standard: { label: 'Standard', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', desc: 'Good options — solid fundamentals' },
  basic:    { label: 'Basic',    color: '#f97316', bg: 'rgba(249,115,22,0.1)', desc: 'Limited options — improve metrics for better rates' },
  starter:  { label: 'Starter',  color: '#6366f1', bg: 'rgba(99,102,241,0.1)', desc: 'Government schemes & secured options' },
};

/* ── LoanCard ──────────────────────────────────────────────────── */
const LoanCard = ({ loan, isMatched }) => {
  const tier = TIER_META[loan.tier];
  return (
    <div className={`loan-card ${isMatched ? 'loan-card-matched' : ''}`}>
      {loan.badge && (
        <div className="loan-badge" style={{ background: tier.color }}>
          {loan.badge}
        </div>
      )}

      {/* Bank header */}
      <div className="loan-card-header">
        <div className="loan-bank-logo" style={{ background: loan.color }}>
          <img
            src={`https://www.google.com/s2/favicons?sz=48&domain=${loan.domain}`}
            alt={loan.bank}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
        <div className="loan-bank-info">
          <div className="loan-bank-name">{loan.bank}</div>
          <div className="loan-product-name">{loan.product}</div>
        </div>
        <span
          className="loan-type-badge"
          style={{ background: loan.type === 'Unsecured' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                   color: loan.type === 'Unsecured' ? '#059669' : '#4f46e5' }}
        >
          {loan.type}
        </span>
      </div>

      {/* Key stats */}
      <div className="loan-stats-row">
        <div className="loan-stat">
          <Percent size={13} />
          <span className="loan-stat-label">Interest Rate</span>
          <span className="loan-stat-value" style={{ color: '#ef4444' }}>{loan.rate}</span>
        </div>
        <div className="loan-stat">
          <TrendingUp size={13} />
          <span className="loan-stat-label">Max Amount</span>
          <span className="loan-stat-value" style={{ color: '#4F46E5' }}>{loan.maxAmount}</span>
        </div>
        <div className="loan-stat">
          <Clock size={13} />
          <span className="loan-stat-label">Tenure</span>
          <span className="loan-stat-value">{loan.tenure}</span>
        </div>
      </div>

      {/* Features */}
      <ul className="loan-features">
        {loan.features.map((f, i) => (
          <li key={i}>
            <BadgeCheck size={12} style={{ color: tier.color, flexShrink: 0 }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="loan-footer">
        <span className="loan-fee">Processing fee: {loan.processingFee}</span>
        <a
          href={loan.url}
          target="_blank"
          rel="noopener noreferrer"
          className="loan-apply-btn"
          style={{ background: loan.color }}
        >
          Apply Now <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
};

/* ── Main View ─────────────────────────────────────────────────── */
const LoanOffersView = ({ dashboardSummary, transactions, userCibil }) => {
  const [showAll, setShowAll] = useState(false);
  const [filterTier, setFilterTier] = useState('all');
  const [search, setSearch] = useState('');

  const healthScore = useMemo(
    () => computeHealthScore(dashboardSummary, transactions),
    [dashboardSummary, transactions]
  );

  const cibil = parseInt(userCibil) || 0;

  const eligibleTier = useMemo(() => {
    if (healthScore >= 80 && cibil >= 750) return 'premium';
    if (healthScore >= 60 && cibil >= 700) return 'standard';
    if (healthScore >= 40 && cibil >= 650) return 'basic';
    return 'starter';
  }, [healthScore, cibil]);

  const tierOrder = ['premium', 'standard', 'basic', 'starter'];
  const userTierIdx = tierOrder.indexOf(eligibleTier);

  const matchedLoans = useMemo(
    () => ALL_LOANS.filter(l => l.tier === eligibleTier),
    [eligibleTier]
  );

  const otherLoans = useMemo(
    () => ALL_LOANS.filter(l => l.tier !== eligibleTier),
    [eligibleTier]
  );

  const filteredOther = useMemo(() => {
    let loans = showAll ? otherLoans : [];
    if (filterTier !== 'all') loans = loans.filter(l => l.tier === filterTier);
    if (search) loans = loans.filter(l =>
      l.bank.toLowerCase().includes(search.toLowerCase()) ||
      l.product.toLowerCase().includes(search.toLowerCase())
    );
    return loans;
  }, [otherLoans, showAll, filterTier, search]);

  const scoreColor = getScoreColor(healthScore);
  const currentTierMeta = TIER_META[eligibleTier];

  return (
    <>
      <EmbeddedHeader />
      <div className="loans-view">

        {/* Page header */}
        <div className="loans-page-header">
          <div>
            <h1 className="loans-page-title">Corporate Loan Offers</h1>
            <p className="loans-page-subtitle">Curated loan products matched to your financial health and credit profile</p>
          </div>
        </div>

        {/* Eligibility Summary */}
        <div className="loans-eligibility-card">
          <div className="loans-elig-left">
            <div className="loans-elig-item">
              <div className="loans-elig-label">Health Score</div>
              <div className="loans-elig-value" style={{ color: scoreColor }}>{healthScore}<span>/100</span></div>
              <div className="loans-elig-sub" style={{ color: scoreColor }}>{getScoreLabel(healthScore)}</div>
            </div>
            <div className="loans-elig-divider" />
            <div className="loans-elig-item">
              <div className="loans-elig-label">CIBIL Score</div>
              <div className="loans-elig-value" style={{ color: cibil >= 750 ? '#10b981' : cibil >= 700 ? '#f59e0b' : '#ef4444' }}>
                {cibil > 0 ? cibil : '–'}
              </div>
              <div className="loans-elig-sub">{cibil >= 750 ? 'Excellent' : cibil >= 700 ? 'Good' : cibil >= 650 ? 'Fair' : cibil > 0 ? 'Poor' : 'Not set'}</div>
            </div>
            <div className="loans-elig-divider" />
            <div className="loans-elig-item">
              <div className="loans-elig-label">Your Tier</div>
              <div className="loans-elig-value" style={{ color: currentTierMeta.color }}>{currentTierMeta.label}</div>
              <div className="loans-elig-sub">{currentTierMeta.desc}</div>
            </div>
          </div>
          {cibil === 0 && (
            <div className="loans-cibil-note">
              <Info size={14} />
              <span>Set your CIBIL score in <strong>Your Financial Metrics</strong> for accurate matching.</span>
            </div>
          )}
        </div>

        {/* Matched Offers */}
        <div className="loans-section-header">
          <div className="loans-section-left">
            <div className="loans-section-icon" style={{ background: currentTierMeta.bg, color: currentTierMeta.color }}>
              <Star size={18} />
            </div>
            <div>
              <h2 className="loans-section-title">Your Matched Offers</h2>
              <p className="loans-section-sub">{matchedLoans.length} offers matching your {currentTierMeta.label} tier</p>
            </div>
          </div>
          <span className="loans-tier-badge" style={{ background: currentTierMeta.bg, color: currentTierMeta.color, border: `1px solid ${currentTierMeta.color}40` }}>
            {currentTierMeta.label} Tier
          </span>
        </div>

        <div className="loans-grid">
          {matchedLoans.map(loan => (
            <LoanCard key={loan.id} loan={loan} isMatched />
          ))}
        </div>

        {/* Other Offers */}
        <div className="loans-other-header">
          <div className="loans-section-header" style={{ marginBottom: 0 }}>
            <div className="loans-section-left">
              <div className="loans-section-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                <Landmark size={18} />
              </div>
              <div>
                <h2 className="loans-section-title">All Other Loan Offers</h2>
                <p className="loans-section-sub">Explore loans from other tiers — improve your score to unlock better rates</p>
              </div>
            </div>
            <button
              className="loans-toggle-btn"
              onClick={() => setShowAll(v => !v)}
            >
              {showAll ? 'Hide Offers' : 'Show All Offers'} <ChevronRight size={15} style={{ transform: showAll ? 'rotate(90deg)' : 'rotate(0)' }} />
            </button>
          </div>

          {showAll && (
            <div className="loans-filter-bar">
              <div className="loans-search">
                <Search size={14} />
                <input
                  placeholder="Search bank or product…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="loans-filter-tabs">
                {['all', 'premium', 'standard', 'basic', 'starter'].map(t => (
                  <button
                    key={t}
                    className={`loans-filter-tab ${filterTier === t ? 'active' : ''}`}
                    onClick={() => setFilterTier(t)}
                    style={filterTier === t && t !== 'all' ? { background: TIER_META[t]?.color, color: '#fff' } : {}}
                  >
                    {t === 'all' ? 'All Tiers' : TIER_META[t].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {showAll && filteredOther.length > 0 && (
          <div className="loans-grid">
            {filteredOther.map(loan => {
              const loanTierIdx = tierOrder.indexOf(loan.tier);
              const needsImprovement = loanTierIdx < userTierIdx;
              return (
                <div key={loan.id} className={needsImprovement ? 'loans-upgrade-wrap' : ''}>
                  {needsImprovement && (
                    <div className="loans-upgrade-banner">
                      <ArrowUpRight size={13} /> Improve your score to unlock this tier
                    </div>
                  )}
                  <LoanCard loan={loan} isMatched={false} />
                </div>
              );
            })}
          </div>
        )}

        {showAll && filteredOther.length === 0 && (
          <div className="loans-empty">
            <Landmark size={36} />
            <p>No offers match your filter.</p>
          </div>
        )}
      </div>
    </>
  );
};

export default LoanOffersView;
