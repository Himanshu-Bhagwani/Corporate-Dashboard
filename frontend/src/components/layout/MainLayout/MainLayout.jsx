import React, { useState, useEffect } from 'react';
import './MainLayout.css';
import Sidebar from '../Sidebar/Sidebar';
import DashboardView from '../../views/DashboardView/DashboardView';
import TransactionsView from '../../views/TransactionsView/TransactionsView';
import AnalyticsView from '../../views/AnalyticsView/AnalyticsView';
import InvoicesView from '../../views/InvoicesView/InvoicesView';
import AccountsView from '../../views/AccountsView/AccountsView';
import ReportsView from '../../views/ReportsView/ReportsView';
import InvestmentsView from '../../views/InvestmentsView/InvestmentsView';
import SettingsView from '../../views/SettingsView/SettingsView';
import CashFlowView from '../../views/CashFlowView/CashFlowView';
import ComplianceView from '../../views/ComplianceView/ComplianceView';
import AccountingView from '../../views/AccountingView/AccountingView';
import AiCfoView from '../../views/AiCfoView/AiCfoView';
import AddTransactionModal from '../../shared/AddTransactionModal/AddTransactionModal';
import CreateCompanyModal from '../../company/CreateCompanyModal';
import { 
  transactionsAPI, accountsAPI, dashboardAPI, 
  invoicesAPI, complianceAPI, aiAPI, accountingAPI 
} from '../../../services/api';
import { getComplianceScore } from '../../../services/complianceService';
import { useAuth } from '../../../context/AuthContext';

const MainLayout = () => {
  const { currentCompany, companies, fetchCompanies } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateCompanyModal, setShowCreateCompanyModal] = useState(false);
  const [navigateTarget, setNavigateTarget] = useState(null);

  // Listen to global navigation requests from header search
  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {};
      if (!detail || !detail.view) return;
      setNavigateTarget(detail);
      setActiveView(detail.view);
    };
    window.addEventListener('navigate-to', handler);
    return () => window.removeEventListener('navigate-to', handler);
  }, []);

  // Transactions state
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState(null);

  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  // Dashboard-specific state
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [compliance, setCompliance] = useState([]);

  // Accounting state
  const [ledgerData, setLedgerData] = useState({ customers: [], vendors: [] });
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [accountingLoading, setAccountingLoading] = useState(false);

  // Filters — now with date range, category, and search
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedType, setSelectedType] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Show create company modal if no companies exist
  useEffect(() => {
    if (companies.length === 0) {
      setShowCreateCompanyModal(true);
    }
  }, [companies]);

  // Compute stats from real transaction data
  const computedStats = {
    totalIncome: transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0,
    totalExpenses: transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0,
    netTotal: (transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0) -
      transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0)) || 0,
    totalBalance: (transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0) -
      transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0)) || 0,
    savings: 0,
    investments: 0,
    totalDebt: transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0,
    connectedAccounts: accounts.length,
  };

  // --- Fetch Transactions ---
  const fetchTransactions = async () => {
    if (!currentCompany) return;
    
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      const data = await transactionsAPI.getAll({
        date: selectedDate,
        type: selectedType,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        category: selectedCategory,
        search: searchQuery || undefined,
      }, currentCompany.id);
      // Deduplicate transactions by id in case backend returns duplicates.
      // Use Map (not plain object) to preserve ordering for numeric ids.
      const map = new Map();
      (data || []).forEach((t) => map.set(t.id, t));
      const deduped = Array.from(map.values());
      // Extra safety: ensure newest appears first (date desc, then created_at desc)
      const sorted = deduped.slice().sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();
        if (db !== da) return db - da;
        const ca = new Date(a.created_at || 0).getTime();
        const cb = new Date(b.created_at || 0).getTime();
        return cb - ca;
      });
      setTransactions(sorted);
    } catch (err) {
      setTransactionsError('Failed to load transactions');
      console.error(err);
    } finally {
      setTransactionsLoading(false);
    }
  };

  // --- Fetch Accounts ---
  const fetchAccounts = async () => {
    if (!currentCompany) return;
    
    setAccountsLoading(true);
    try {
      const data = await accountsAPI.getAll(currentCompany.id);
      setAccounts(data);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setAccountsLoading(false);
    }
  };

  // --- Fetch Dashboard Data ---
  const [complianceScore, setComplianceScore] = useState(null);

  const fetchDashboardData = async () => {
    if (!currentCompany) return;
    try {
      const [summary, invData, compData, scoreData] = await Promise.all([
        dashboardAPI.getSummary(currentCompany.id),
        invoicesAPI.getAll(currentCompany.id),
        complianceAPI.getAll(currentCompany.id),
        getComplianceScore(currentCompany.id),
      ]);
      setDashboardSummary(summary);
      setInvoices(invData);
      setCompliance(compData);
      setComplianceScore(scoreData.score);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  };

  // Fetch data when company or filters change
  useEffect(() => {
    if (currentCompany) {
      fetchTransactions();
      fetchAccounts();
      fetchDashboardData();
    }
  }, [currentCompany, selectedDate, selectedType, fromDate, toDate, selectedCategory, searchQuery]);

  // --- Transaction Handlers ---
  const handleAddTransaction = async (newTransaction) => {
    try {
      await transactionsAPI.create(newTransaction, currentCompany.id);
      setShowAddModal(false);
      fetchTransactions();
      fetchAccounts();
      fetchDashboardData(); // Refresh dashboard metrics when transaction added
    } catch (err) {
      console.error('Failed to add transaction:', err);
    }
  };

  const handleUpdateTransaction = async (id, updatedData) => {
    try {
      await transactionsAPI.update(id, updatedData, currentCompany.id);
      fetchTransactions();
      fetchAccounts();
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to update transaction:', err);
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      await transactionsAPI.delete(id, currentCompany.id);
      fetchTransactions();
      fetchAccounts();
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    }
  };

  // --- CSV Upload Handler ---
  const handleUploadCSV = async (file) => {
    try {
      await transactionsAPI.uploadCSV(file, currentCompany.id);
      fetchTransactions();
      fetchAccounts();
      fetchDashboardData(); // Dashboard updates with new data
    } catch (err) {
      console.error('Failed to upload CSV:', err);
      throw err;
    }
  };

  // --- PDF Upload Handler ---
  const handleUploadPDF = async (file) => {
    try {
      await transactionsAPI.uploadPDF(file, currentCompany.id);
      fetchTransactions();
      fetchAccounts();
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to upload PDF:', err);
      throw err;
    }
  };


  const handleRunAIAudit = async (visibleScore, pendingCount, overdueCount) => {
    try {
      const result = await aiAPI.complianceReview(currentCompany.id, visibleScore, pendingCount, overdueCount);
      return result;
    } catch (err) {
      console.error('AI Compliance Review Failed:', err);
      throw err;
    }
  };

  const handleParseOCR = async (file) => {
    try {
      const result = await aiAPI.parseOCR(file, currentCompany.id);
      return result;
    } catch (err) {
      console.error('AI OCR Parsing Failed:', err);
      throw err;
    }
  };

  // --- Invoice Handlers ---
  const handleCreateInvoice = async (invoiceData) => {
    try {
      await invoicesAPI.create(invoiceData, currentCompany.id);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to create invoice:', err);
      throw err;
    }
  };

  const handleUpdateInvoice = async (id, invoiceData) => {
    try {
      await invoicesAPI.update(id, invoiceData, currentCompany.id);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to update invoice:', err);
      throw err;
    }
  };

  // --- Compliance Handler ---
  const handleMarkFiled = async (id) => {
    try {
      await complianceAPI.markFiled(id, currentCompany.id);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to mark filing:', err);
    }
  };

  // --- Accounting Handlers ---
  const fetchLedger = async (filters = {}) => {
    if (!currentCompany) return;
    setAccountingLoading(true);
    try {
      const data = await accountingAPI.getLedger(currentCompany.id, filters);
      setLedgerData(data);
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
    } finally {
      setAccountingLoading(false);
    }
  };

  const fetchChartOfAccounts = async () => {
    if (!currentCompany) return;
    setAccountingLoading(true);
    try {
      const data = await accountingAPI.getChartOfAccounts(currentCompany.id);
      setChartOfAccounts(data);
    } catch (err) {
      console.error('Failed to fetch chart of accounts:', err);
    } finally {
      setAccountingLoading(false);
    }
  };

  const handleCreateCoaEntry = async (entry) => {
    try {
      await accountingAPI.createChartOfAccountsEntry(entry, currentCompany.id);
      fetchChartOfAccounts();
    } catch (err) {
      console.error('Failed to create COA entry:', err);
      throw err;
    }
  };

  const handleUpdateCoaEntry = async (id, entry) => {
    try {
      await accountingAPI.updateChartOfAccountsEntry(id, entry, currentCompany.id);
      fetchChartOfAccounts();
    } catch (err) {
      console.error('Failed to update COA entry:', err);
      throw err;
    }
  };

  const handleDeleteCoaEntry = async (id) => {
    try {
      await accountingAPI.deleteChartOfAccountsEntry(id, currentCompany.id);
      fetchChartOfAccounts();
    } catch (err) {
      console.error('Failed to delete COA entry:', err);
      throw err;
    }
  };

  // --- Account Handlers ---
  const handleAddAccount = async (newAccount) => {
    try {
      await accountsAPI.create(newAccount, currentCompany.id);
      fetchAccounts();
    } catch (err) {
      console.error('Failed to add account:', err);
    }
  };

  const handleUpdateAccount = async (id, updatedData) => {
    try {
      await accountsAPI.update(id, updatedData, currentCompany.id);
      fetchAccounts();
    } catch (err) {
      console.error('Failed to update account:', err);
    }
  };

  const handleDeleteAccount = async (id) => {
    try {
      await accountsAPI.delete(id, currentCompany.id);
      fetchAccounts();
      fetchTransactions();
    } catch (err) {
      console.error('Failed to delete account:', err);
    }
  };

  // --- Company Handlers ---
  const handleCreateCompany = async (companyData) => {
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(companyData)
      });

      if (!response.ok) {
        throw new Error('Failed to create company');
      }

      await fetchCompanies();
      setShowCreateCompanyModal(false);
    } catch (error) {
      console.error('Failed to create company:', error);
      throw error;
    }
  };

  // Show create company modal if no companies
  if (companies.length === 0) {
    return (
      <div className="app-wrapper">
        <div className="no-company-container">
          <div className="no-company-content">
            <h1>Welcome to Corporate Dashboard!</h1>
            <p>Let's get started by creating your first company.</p>
          </div>
        </div>
        {showCreateCompanyModal && (
          <CreateCompanyModal
            onClose={() => {}} // Don't allow closing if no companies
            onSubmit={handleCreateCompany}
          />
        )}
      </div>
    );
  }

  if (!currentCompany) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#718096'
      }}>
        Loading company data...
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        stats={computedStats}
      />

      <div className="main-container">
        
        <main className="main-content">
          {activeView === 'dashboard' && (
            <DashboardView
              transactions={transactions}
              accounts={accounts}
              stats={computedStats}
              dashboardSummary={dashboardSummary}
              invoices={invoices}
              compliance={compliance}
              onCreateInvoice={handleCreateInvoice}
              onMarkFiled={handleMarkFiled}
              setActiveView={setActiveView}
            />
          )}
          {activeView === 'transactions' && (
            <TransactionsView
              transactions={transactions}
              stats={computedStats}
              loading={transactionsLoading}
              error={transactionsError}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              selectedType={selectedType}
              setSelectedType={setSelectedType}
              fromDate={fromDate}
              setFromDate={setFromDate}
              toDate={toDate}
              setToDate={setToDate}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setShowAddModal={setShowAddModal}
              onUpdate={handleUpdateTransaction}
              onDelete={handleDeleteTransaction}
              onUploadCSV={handleUploadCSV}
              onUploadPDF={handleUploadPDF}
              navigateTarget={navigateTarget}
              accounts={accounts}
            />
          )}
          {activeView === 'analytics' && (
            <AnalyticsView stats={computedStats} />
          )}
          {activeView === 'accounts' && (
            <AccountsView
              accounts={accounts}
              stats={computedStats}
              loading={accountsLoading}
              onAdd={handleAddAccount}
              onUpdate={handleUpdateAccount}
              onDelete={handleDeleteAccount}
            />
          )}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'investments' && <InvestmentsView />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'invoices' && (
            <InvoicesView
              invoices={invoices}
              loading={!dashboardSummary}
              onCreateInvoice={handleCreateInvoice}
              onUpdateInvoice={handleUpdateInvoice}
              setActiveView={setActiveView}
              onParseOCR={handleParseOCR}
            />
          )}
          {activeView === 'cashflow' && (
            <CashFlowView
              transactions={transactions}
              invoices={invoices}
            />
          )}
          {activeView === 'compliance' && (
            <ComplianceView
              compliance={compliance}
              invoices={invoices}
              onMarkFiled={handleMarkFiled}
              onRunAIAudit={handleRunAIAudit}
              backendScore={complianceScore}
            />
          )}
          {activeView === 'accounting' && (
            <AccountingView
              ledgerData={ledgerData}
              chartOfAccounts={chartOfAccounts}
              onFetchLedger={fetchLedger}
              onFetchChartOfAccounts={fetchChartOfAccounts}
              onCreateAccount={handleCreateCoaEntry}
              onUpdateAccount={handleUpdateCoaEntry}
              onDeleteAccount={handleDeleteCoaEntry}
              loading={accountingLoading}
            />
          )}
          {activeView === 'aicfo' && (
            <AiCfoView />
          )}
        </main>
      </div>

      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddTransaction}
          accounts={accounts}
          onGoToAccounts={() => setActiveView('accounts')}
        />
      )}
    </div>
  );
};

export default MainLayout;