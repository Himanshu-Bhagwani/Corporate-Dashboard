import React, { useState, useMemo, useEffect, useCallback } from 'react';
import './LoanOffersView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { computeHealthScore, getScoreLabel, getScoreColor } from '../../../utils/healthScore';
import {
  BadgeCheck, ChevronRight, ExternalLink, Landmark, Star,
  TrendingUp, Shield, Percent, Clock, Info, Search,
  SlidersHorizontal, ArrowUpRight, Plus, Briefcase, Sparkles,
} from 'lucide-react';
import { loansAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import MyLoans from './MyLoans';
import LoanApplicationModal from './LoanApplicationModal';
import LoanDetailDrawer from './LoanDetailDrawer';

/* ── Loan Data ─────────────────────────────────────────────────────
 * `logo` points to an optional local file in /public/bank-logos/. If the file
 * isn't present, <BankLogo> falls back to the live Clearbit logo, then the
 * favicon, then bank initials — so real logos show with zero downloads.
 * ─────────────────────────────────────────────────────────────────── */
const ALL_LOANS = [
  // ===== PREMIUM — large corporate facilities for strong, big companies =====
  {
    id: 'sbi-corp', bank: 'State Bank of India', domain: 'sbi.co.in', logo: '/bank-logos/sbi.png',
    product: 'Corporate Term Loan & CC', type: 'Secured',
    rate: '8.5% – 10.5% p.a.', rateMin: 8.5,
    maxAmount: '₹25 Crore', tenure: 'Up to 120 months',
    processingFee: '0.5% + taxes',
    minHealth: 80, minCibil: 750, tier: 'premium',
    badge: 'Best Rate',
    features: ['Largest ticket sizes', 'Term loan + working capital combo', 'CGTMSE cover available', 'Concessional rates for strong balance sheets'],
    url: 'https://sbi.co.in/web/business/sme',
    color: '#22409a', accentColor: '#f59e0b',
  },
  {
    id: 'hdfc-corp', bank: 'HDFC Bank', domain: 'hdfcbank.com', logo: '/bank-logos/hdfc.png',
    product: 'Corporate Loan & Working Capital', type: 'Secured / Unsecured',
    rate: '9.5% – 11.0% p.a.', rateMin: 9.5,
    maxAmount: '₹7.5 Crore', tenure: 'Up to 84 months',
    processingFee: '1% of loan amount',
    minHealth: 80, minCibil: 750, tier: 'premium',
    features: ['Overdraft + term loan structuring', 'Dedicated relationship manager', 'Fast sanction for existing customers', 'Balance transfer available'],
    url: 'https://www.hdfcbank.com/sme/borrow/business-loan',
    color: '#004c8f', accentColor: '#e31837',
  },
  {
    id: 'icici-corp', bank: 'ICICI Bank', domain: 'icicibank.com', logo: '/bank-logos/icici.png',
    product: 'Business Term Loan & WC', type: 'Secured / Unsecured',
    rate: '10.5% – 12.0% p.a.', rateMin: 10.5,
    maxAmount: '₹10 Crore', tenure: 'Up to 84 months',
    processingFee: '1% of loan amount',
    minHealth: 80, minCibil: 750, tier: 'premium',
    features: ['InstaBIZ digital facility', 'GST-based instant limits', 'Structured working capital', 'Trade & forex support'],
    url: 'https://www.icicibank.com/business-banking/loans/business-loan',
    color: '#ae282e', accentColor: '#f6821f',
  },
  {
    id: 'axis-wcf', bank: 'Axis Bank', domain: 'axisbank.com', logo: '/bank-logos/axis.png',
    product: 'Working Capital Finance', type: 'Secured',
    rate: '11.25% – 13.0% p.a.', rateMin: 11.25,
    maxAmount: '₹10 Crore', tenure: 'Up to 180 months',
    processingFee: '1% + GST',
    minHealth: 80, minCibil: 750, tier: 'premium',
    badge: 'Highest Limit',
    features: ['Cash credit + OD + term loans', 'Structured finance solutions', 'Export credit facilities', 'Long repayment tenures'],
    url: 'https://www.axisbank.com/business-banking/small-business-banking/working-capital-loans/working-capital-finance',
    color: '#97144d', accentColor: '#ed1c24',
  },
  {
    id: 'kotak-corp', bank: 'Kotak Mahindra Bank', domain: 'kotak.com', logo: '/bank-logos/kotak.png',
    product: 'Business Loan & Credit Line', type: 'Secured / Unsecured',
    rate: '10.75% – 12.5% p.a.', rateMin: 10.75,
    maxAmount: '₹5 Crore', tenure: 'Up to 84 months',
    processingFee: '1.5% of loan amount',
    minHealth: 80, minCibil: 750, tier: 'premium',
    features: ['Zero foreclosure on floating rate', 'Dropline overdraft option', 'Dedicated RM', 'Insurance cover available'],
    url: 'https://www.kotak.com/en/business/loans.html',
    color: '#e21a23', accentColor: '#003b6f',
  },
  {
    id: 'sc-corp', bank: 'Standard Chartered', domain: 'sc.com', logo: '/bank-logos/standardchartered.png',
    product: 'Business Term Loan', type: 'Secured',
    rate: '11.0% – 13.0% p.a.', rateMin: 11.0,
    maxAmount: '₹5 Crore', tenure: 'Up to 60 months',
    processingFee: '1% of loan amount',
    minHealth: 80, minCibil: 750, tier: 'premium',
    features: ['Global banking network', 'Trade & supply-chain finance', 'Forex & hedging support', 'Tailored corporate solutions'],
    url: 'https://www.sc.com/in/business-loans/',
    color: '#0473ea', accentColor: '#38d200',
  },
  // ===== STANDARD — solid mid-market businesses =====
  {
    id: 'hdfc-xpress', bank: 'HDFC Bank', domain: 'hdfcbank.com', logo: '/bank-logos/hdfc.png',
    product: 'XPRESS Business Loan', type: 'Unsecured',
    rate: '10.75% – 16.0% p.a.', rateMin: 10.75,
    maxAmount: '₹50 Lakhs', tenure: 'Up to 48 months',
    processingFee: '1.5% of loan amount',
    minHealth: 60, minCibil: 700, tier: 'standard',
    badge: 'Instant Approval',
    features: ['10-second in-principle approval', 'No collateral', 'Part prepayment allowed', 'Digital KYC'],
    url: 'https://www.hdfcbank.com/sme/borrow/business-loan',
    color: '#004c8f', accentColor: '#e31837',
  },
  {
    id: 'sbi-msme', bank: 'State Bank of India', domain: 'sbi.co.in', logo: '/bank-logos/sbi.png',
    product: 'SME / MSME Business Loan', type: 'Secured / Unsecured',
    rate: '9.65% – 13.0% p.a.', rateMin: 9.65,
    maxAmount: '₹75 Lakhs', tenure: 'Up to 60 months',
    processingFee: '0.5% + taxes',
    minHealth: 60, minCibil: 700, tier: 'standard',
    badge: 'Govt Backed',
    features: ['CGTMSE guarantee available', 'Govt-bank reliability', 'Low processing fee', 'Concessional rates for women'],
    url: 'https://sbi.co.in/web/business/sme',
    color: '#22409a', accentColor: '#f59e0b',
  },
  {
    id: 'cgtmse', bank: 'CGTMSE Scheme', domain: 'cgtmse.in', logo: '/bank-logos/cgtmse.png',
    product: 'CGTMSE Guaranteed Loan', type: 'Govt Guarantee',
    rate: '12.0% – 15.0% p.a.', rateMin: 12.0,
    maxAmount: '₹5 Crore', tenure: 'Up to 84 months',
    processingFee: '1% + annual guarantee fee',
    minHealth: 60, minCibil: 700, tier: 'standard',
    badge: 'Govt Guarantee',
    features: ['Collateral-free up to ₹5 Cr under CGTMSE cover', 'Govt-backed credit guarantee', 'Available via 150+ member banks', 'Lower effective interest due to guarantee'],
    url: 'https://www.cgtmse.in/',
    color: '#005c35', accentColor: '#fbbf24',
  },
  {
    id: 'icici-instal', bank: 'ICICI Bank', domain: 'icicibank.com', logo: '/bank-logos/icici.png',
    product: 'Business Installment Loan', type: 'Unsecured',
    rate: '11.5% – 14.5% p.a.', rateMin: 11.5,
    maxAmount: '₹40 Lakhs', tenure: 'Up to 48 months',
    processingFee: '2% of loan amount',
    minHealth: 60, minCibil: 700, tier: 'standard',
    features: ['Pre-approved for existing customers', 'Flexible repayment', '24×7 digital access', 'Tax certificates provided'],
    url: 'https://www.icicibank.com/business-banking/loans/business-loan',
    color: '#ae282e', accentColor: '#f6821f',
  },
  {
    id: 'idfc-biz', bank: 'IDFC FIRST Bank', domain: 'idfcfirstbank.com', logo: '/bank-logos/idfcfirst.png',
    product: 'Business Loan', type: 'Unsecured',
    rate: '13.0% – 17.0% p.a.', rateMin: 13.0,
    maxAmount: '₹75 Lakhs', tenure: 'Up to 60 months',
    processingFee: '2% of loan amount',
    minHealth: 60, minCibil: 700, tier: 'standard',
    features: ['Fully digital journey', 'Flexible EMI options', 'Minimal documentation', 'Quick disbursal'],
    url: 'https://www.idfcfirstbank.com/business-banking/loans',
    color: '#9c1d27', accentColor: '#ed1b2f',
  },
  {
    id: 'pnb-msme', bank: 'Punjab National Bank', domain: 'pnbindia.in', logo: '/bank-logos/pnb.png',
    product: 'PNB Business Loan', type: 'Secured / Unsecured',
    rate: '12.85% – 15.5% p.a.', rateMin: 12.85,
    maxAmount: '₹30 Lakhs', tenure: 'Up to 84 months',
    processingFee: '0.50% (min ₹1,000)',
    minHealth: 60, minCibil: 700, tier: 'standard',
    badge: 'Long Tenure',
    features: ['Government bank backing', 'Long tenure option', 'Priority sector lending', 'Concessional for MSMEs'],
    url: 'https://www.pnbindia.in/',
    color: '#4c2c92', accentColor: '#f0ad00',
  },
  // ===== BASIC — higher-rate NBFC & fintech options =====
  {
    id: 'tata-biz', bank: 'Tata Capital', domain: 'tatacapital.com', logo: '/bank-logos/tatacapital.png',
    product: 'Business Loan', type: 'Unsecured',
    rate: '12.0% – 18.0% p.a.', rateMin: 12.0,
    maxAmount: '₹75 Lakhs', tenure: 'Up to 60 months',
    processingFee: '2.5% of loan amount',
    minHealth: 40, minCibil: 650, tier: 'basic',
    features: ['Competitive NBFC rates', 'Flexible EMIs', 'Balance transfer', 'Top-up facility'],
    url: 'https://www.tatacapital.com/business-loan.html',
    color: '#0076bd', accentColor: '#003087',
  },
  {
    id: 'poonawalla-biz', bank: 'Poonawalla Fincorp', domain: 'poonawallafincorp.com', logo: '/bank-logos/poonawalla.png',
    product: 'Business Loan', type: 'Unsecured',
    rate: '15.0% – 20.0% p.a.', rateMin: 15.0,
    maxAmount: '₹1 Crore', tenure: 'Up to 60 months',
    processingFee: '2% of loan amount',
    minHealth: 40, minCibil: 650, tier: 'basic',
    badge: 'High Limit',
    features: ['Collateral-free up to ₹1 Cr', 'Quick digital approval', 'Flexible repayment', 'Minimal documentation'],
    url: 'https://poonawallafincorp.com/business-loan.php',
    color: '#0a1f8f', accentColor: '#e4002b',
  },
  {
    id: 'bajaj-biz', bank: 'Bajaj Finserv', domain: 'bajajfinserv.in', logo: '/bank-logos/bajaj.png',
    product: 'Business Loan', type: 'Unsecured',
    rate: '14.0% – 23.0% p.a.', rateMin: 14.0,
    maxAmount: '₹80 Lakhs', tenure: 'Up to 96 months',
    processingFee: '3.54% incl. GST',
    minHealth: 40, minCibil: 650, tier: 'basic',
    features: ['Online application', 'Zero part-prepayment charges', 'Flexi loan option', 'Long tenure'],
    url: 'https://www.bajajfinserv.in/business-loan',
    color: '#00599d', accentColor: '#f58220',
  },
  {
    id: 'lendingkart', bank: 'Lendingkart Finance', domain: 'lendingkart.com', logo: '/bank-logos/lendingkart.png',
    product: 'MSME Working Capital', type: 'Unsecured',
    rate: '15.0% – 24.0% p.a.', rateMin: 15.0,
    maxAmount: '₹2 Crore', tenure: 'Up to 36 months',
    processingFee: '2% of loan amount',
    minHealth: 40, minCibil: 650, tier: 'basic',
    badge: 'Fintech Speed',
    features: ['72-hour approval', 'Paperless process', 'GST-based underwriting', 'Collateral-free'],
    url: 'https://www.lendingkart.com/business-loans/',
    color: '#ff6f00', accentColor: '#1a1a2e',
  },
  {
    id: 'herofincorp-biz', bank: 'Hero FinCorp', domain: 'herofincorp.com', logo: '/bank-logos/herofincorp.png',
    product: 'Unsecured Business Loan', type: 'Unsecured',
    rate: '14.0% – 30.0% p.a.', rateMin: 14.0,
    maxAmount: '₹50 Lakhs', tenure: 'Up to 48 months',
    processingFee: '2–3% of loan amount',
    minHealth: 40, minCibil: 650, tier: 'basic',
    features: ['Flexible eligibility', 'Quick disbursement', 'Minimal documentation', 'Pan-India reach'],
    url: 'https://www.herofincorp.com/business-loan',
    color: '#e4002b', accentColor: '#1a1a2e',
  },
  // ===== STARTER — govt schemes & low / no-CIBIL options =====
  {
    id: 'mudra', bank: 'PMMY / MUDRA Loan', domain: 'mudra.org.in', logo: '/bank-logos/mudra.png',
    product: 'Kishore / Tarun MUDRA', type: 'Govt Scheme',
    rate: '8.0% – 12.0% p.a.', rateMin: 8.0,
    maxAmount: '₹10 Lakhs', tenure: 'Up to 60 months',
    processingFee: 'Nil (Govt scheme)',
    minHealth: 0, minCibil: 0, tier: 'starter',
    badge: 'Govt Scheme',
    features: ['No collateral for Shishu tier', 'Interest subvention available', 'Via all PSU banks', 'SC/ST priority lending'],
    url: 'https://www.mudra.org.in/',
    color: '#f4750b', accentColor: '#1a3a5c',
  },
  {
    id: 'standup-india', bank: 'Stand-Up India', domain: 'standupmitra.in', logo: '/bank-logos/standupindia.png',
    product: 'Stand-Up India Loan', type: 'Govt Scheme',
    rate: '9.0% – 13.0% p.a.', rateMin: 9.0,
    maxAmount: '₹1 Crore', tenure: 'Up to 84 months',
    processingFee: 'Concessional (Govt scheme)',
    minHealth: 0, minCibil: 0, tier: 'starter',
    badge: 'Govt Scheme',
    features: ['₹10 L – ₹1 Cr for SC/ST & women entrepreneurs', 'Composite loan (term + WC)', 'Handholding support', 'Via all scheduled banks'],
    url: 'https://www.standupmitra.in/',
    color: '#1a3a5c', accentColor: '#f4750b',
  },
  {
    id: 'flexiloans', bank: 'FlexiLoans', domain: 'flexiloans.com', logo: '/bank-logos/flexiloans.png',
    product: 'MSME Term & WC Loan', type: 'Unsecured',
    rate: '15.0% – 22.0% p.a.', rateMin: 15.0,
    maxAmount: '₹1 Crore', tenure: 'Up to 36 months',
    processingFee: '2–3% of loan amount',
    minHealth: 0, minCibil: 0, tier: 'starter',
    badge: 'Paperless',
    features: ['Fully online, paperless', 'Works with thin credit files', 'GST & bank-statement underwriting', 'Fast disbursal'],
    url: 'https://flexiloans.com/',
    color: '#2b3a8f', accentColor: '#00b6a9',
  },
  {
    id: 'paisabazaar-low', bank: 'PaisaBazaar', domain: 'paisabazaar.com', logo: '/bank-logos/paisabazaar.png',
    product: 'Business Loans for Low CIBIL', type: 'Compare & Apply',
    rate: 'From 14% p.a.', rateMin: 14.0,
    maxAmount: 'Up to ₹10 Lakhs', tenure: 'Flexible',
    processingFee: 'Varies by lender',
    minHealth: 0, minCibil: 0, tier: 'starter',
    badge: 'Compare Options',
    features: ['30+ lenders compared instantly', 'Tailored for low / no CIBIL', 'Soft credit check only', 'Free eligibility check'],
    url: 'https://www.paisabazaar.com/business-loan/',
    color: '#6366f1', accentColor: '#f59e0b',
  },
];

const TIER_META = {
  premium:  { label: 'Premium',  color: '#10b981', bg: 'rgba(16,185,129,0.1)',  desc: 'Large corporate facilities — strong balance sheet + high CIBIL' },
  standard: { label: 'Standard', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', desc: 'Solid mid-market business loans' },
  basic:    { label: 'Basic',    color: '#f97316', bg: 'rgba(249,115,22,0.1)', desc: 'NBFC & fintech options — improve metrics for better rates' },
  starter:  { label: 'Starter',  color: '#6366f1', bg: 'rgba(99,102,241,0.1)', desc: 'Government schemes & low / no-CIBIL options' },
};

/* ── BankLogo — real logo with graceful fallback chain ─────────────
 * local file → Clearbit live logo → favicon → bank initials.
 * ─────────────────────────────────────────────────────────────────── */
const BankLogo = ({ loan }) => {
  const sources = [
    loan.logo,
    `https://logo.clearbit.com/${loan.domain}`,
    `https://www.google.com/s2/favicons?sz=64&domain=${loan.domain}`,
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed || sources.length === 0) {
    const initials = loan.bank.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return (
      <div className="loan-bank-logo loan-bank-logo-initials" style={{ background: loan.color }}>
        {initials}
      </div>
    );
  }

  return (
    <div className="loan-bank-logo loan-bank-logo-img">
      <img
        src={sources[idx]}
        alt={loan.bank}
        loading="lazy"
        onError={() => { if (idx < sources.length - 1) setIdx(idx + 1); else setFailed(true); }}
      />
    </div>
  );
};

// Best-effort mapping from an offer's product description to our loan_type enum,
// used when the user tells us they applied for that offer.
const guessLoanType = (offer) => {
  const p = (offer.product + ' ' + offer.type).toLowerCase();
  if (p.includes('working capital') || p.includes(' cc ')) return 'WORKING_CAPITAL_CC';
  if (p.includes('overdraft') || p.includes(' od ')) return 'OVERDRAFT_OD';
  if (p.includes('msme')) return 'MSME_LOAN';
  if (p.includes('equipment')) return 'EQUIPMENT_LOAN';
  if (p.includes('vehicle')) return 'VEHICLE_LOAN';
  if (p.includes('mudra') || p.includes('cgtmse') || p.includes('scheme')) return 'MSME_LOAN';
  return 'TERM_LOAN';
};

/* ── LoanCard ──────────────────────────────────────────────────── */
const LoanCard = ({ loan, isMatched, onApplyClick }) => {
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
        <BankLogo loan={loan} />
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
          onClick={() => onApplyClick && onApplyClick(loan)}
        >
          Apply Now <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
};

/* ── Main View ─────────────────────────────────────────────────── */
const LoanOffersView = ({ dashboardSummary, transactions, userCibil, onTransactionsChanged }) => {
  const { currentCompany } = useAuth();
  const [activeTab, setActiveTab] = useState('my-loans');
  const [showAll, setShowAll] = useState(false);
  const [filterTier, setFilterTier] = useState('all');
  const [search, setSearch] = useState('');

  // My Loans state
  const [myLoans, setMyLoans] = useState([]);
  const [loansSummary, setLoansSummary] = useState(null);
  const [loansLoading, setLoansLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyPrefill, setApplyPrefill] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(null);

  // Follow-up state after user clicks "Apply Now" on an external offer
  const [pendingOffer, setPendingOffer] = useState(null);   // offer they clicked, awaiting return
  const [followupOffer, setFollowupOffer] = useState(null); // offer to prompt about
  const [followupDismissed, setFollowupDismissed] = useState({});

  const fetchLoans = useCallback(async () => {
    if (!currentCompany) return;
    try {
      const data = await loansAPI.getAll(currentCompany.id);
      setMyLoans(data.loans || []);
      setLoansSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to load loans:', err);
    } finally {
      setLoansLoading(false);
    }
  }, [currentCompany]);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  // When the user clicks "Apply Now" on an offer we open the bank's site in a
  // new tab and hold onto that offer. As soon as they come back to our tab
  // (visibilitychange or window focus), we prompt: "Did you apply?"
  useEffect(() => {
    if (!pendingOffer) return;

    const promptOnReturn = () => {
      if (document.visibilityState !== 'visible') return;
      // Guard against multiple triggers for the same offer
      if (followupDismissed[pendingOffer.id]) { setPendingOffer(null); return; }
      // Small delay so the user actually settles on our tab first
      setTimeout(() => {
        setFollowupOffer(pendingOffer);
        setPendingOffer(null);
      }, 400);
    };

    document.addEventListener('visibilitychange', promptOnReturn);
    window.addEventListener('focus', promptOnReturn);
    return () => {
      document.removeEventListener('visibilitychange', promptOnReturn);
      window.removeEventListener('focus', promptOnReturn);
    };
  }, [pendingOffer, followupDismissed]);

  const handleOfferApplyClick = (offer) => {
    // Reset dismissal for this offer so we prompt again on return
    setFollowupDismissed(d => { const next = { ...d }; delete next[offer.id]; return next; });
    setPendingOffer(offer);
  };

  const confirmApplied = (offer) => {
    setApplyPrefill({ lender: offer.bank, loan_type: guessLoanType(offer) });
    setFollowupOffer(null);
    setShowApplyModal(true);
  };

  const dismissFollowup = (offer, remember) => {
    if (remember) setFollowupDismissed(d => ({ ...d, [offer.id]: true }));
    setFollowupOffer(null);
  };

  const healthScore = useMemo(
    () => computeHealthScore(dashboardSummary, transactions, myLoans),
    [dashboardSummary, transactions, myLoans]
  );

  const cibil = parseInt(userCibil) || 0;

  // CIBIL-first tiering: banks weigh CIBIL heavier than internal health signals.
  // When CIBIL is set, it drives the tier; health only nudges the boundary
  // (a strong internal score can bump you up one tier at the edges).
  const eligibleTier = useMemo(() => {
    if (cibil > 0) {
      let tier;
      if (cibil >= 750) tier = 'premium';
      else if (cibil >= 700) tier = 'standard';
      else if (cibil >= 650) tier = 'basic';
      else tier = 'starter';

      // Bump one tier up if health is strong and CIBIL sits at the top of its band
      if (tier === 'standard' && cibil >= 740 && healthScore >= 80) tier = 'premium';
      else if (tier === 'basic' && cibil >= 690 && healthScore >= 70) tier = 'standard';
      else if (tier === 'starter' && cibil >= 640 && healthScore >= 60) tier = 'basic';

      return tier;
    }
    // No CIBIL yet → fall back to health only
    if (healthScore >= 80) return 'premium';
    if (healthScore >= 60) return 'standard';
    if (healthScore >= 40) return 'basic';
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
            <h1 className="loans-page-title">Corporate Loans</h1>
            <p className="loans-page-subtitle">Track your loan applications, EMI schedules and curated offers in one place</p>
          </div>
          <button className="myloans-apply-btn" onClick={() => setShowApplyModal(true)}>
            <Plus size={15} /> Apply for Loan
          </button>
        </div>

        {/* Tabs */}
        <div className="loans-tabs">
          <button
            className={`loans-tab ${activeTab === 'my-loans' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-loans')}
          >
            <Briefcase size={15} /> My Loans
            {myLoans.length > 0 && <span className="loans-tab-count">{myLoans.length}</span>}
          </button>
          <button
            className={`loans-tab ${activeTab === 'offers' ? 'active' : ''}`}
            onClick={() => setActiveTab('offers')}
          >
            <Sparkles size={15} /> Loan Offers
          </button>
        </div>

        {/* ── My Loans tab ─────────────────────────────────────── */}
        {activeTab === 'my-loans' && (
          <MyLoans
            loans={myLoans}
            summary={loansSummary}
            loading={loansLoading}
            onApply={() => setShowApplyModal(true)}
            onOpenLoan={(id) => setSelectedLoanId(id)}
          />
        )}

        {/* ── Loan Offers tab ──────────────────────────────────── */}
        {activeTab === 'offers' && (<>

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
              <div className="loans-elig-label">CIBIL Score · Primary</div>
              <div className="loans-elig-value" style={{ color: cibil >= 750 ? '#10b981' : cibil >= 700 ? '#f59e0b' : cibil > 0 ? '#ef4444' : '#94a3b8' }}>
                {cibil > 0 ? cibil : '–'}
              </div>
              <div className="loans-elig-sub">{cibil >= 750 ? 'Excellent · unlocks premium' : cibil >= 700 ? 'Good' : cibil >= 650 ? 'Fair' : cibil > 0 ? 'Poor' : 'Not set — using health only'}</div>
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
            <LoanCard key={loan.id} loan={loan} isMatched onApplyClick={handleOfferApplyClick} />
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
                  <LoanCard loan={loan} isMatched={false} onApplyClick={handleOfferApplyClick} />
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
        </>)}

        {/* ── Modals & Drawers ─────────────────────────────────── */}
        {showApplyModal && (
          <LoanApplicationModal
            existingLoans={myLoans}
            prefill={applyPrefill}
            onClose={() => { setShowApplyModal(false); setApplyPrefill(null); }}
            onSubmitted={() => {
              setShowApplyModal(false);
              setApplyPrefill(null);
              setActiveTab('my-loans');
              fetchLoans();
            }}
          />
        )}

        {selectedLoanId && (
          <LoanDetailDrawer
            loanId={selectedLoanId}
            onClose={() => setSelectedLoanId(null)}
            onChanged={fetchLoans}
            onTransactionsChanged={onTransactionsChanged}
          />
        )}

        {/* Follow-up: "Did you apply for [bank] loan?" — shown when the user
            returns to the tab after clicking Apply Now on an offer. */}
        {followupOffer && (
          <div className="loan-followup-overlay" onClick={() => dismissFollowup(followupOffer, false)}>
            <div className="loan-followup-box" onClick={e => e.stopPropagation()}>
              <div className="loan-followup-icon">
                <BankLogo loan={followupOffer} />
              </div>
              <h3>Did you apply for the {followupOffer.bank} loan?</h3>
              <p>If you submitted an application for <strong>{followupOffer.product}</strong>, we'll add it to <strong>My Loans</strong> so you can track its status and EMIs here.</p>
              <div className="loan-followup-actions">
                <button className="loan-btn-secondary" onClick={() => dismissFollowup(followupOffer, false)}>Not yet</button>
                <button className="loan-btn-ghost-danger" onClick={() => dismissFollowup(followupOffer, true)}>No, didn't apply</button>
                <button className="loan-btn-primary" onClick={() => confirmApplied(followupOffer)}>Yes, track it</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default LoanOffersView;
