import React, { useState, useEffect, useMemo, useCallback } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import {
  Search, BookOpen, Users, Truck, ChevronDown, ChevronRight,
  Plus, Pencil, Check, X, Trash2, TrendingUp, TrendingDown,
  DollarSign, Building2, PieChart, ChevronsDown, ChevronsUp, Filter,
  Star, UserPlus, Mail, Phone, ChevronUp, FileUp
} from 'lucide-react';
import { accountingAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import './AccountingView.css';

const formatINR = (value) => `₹${(Number(value) || 0).toLocaleString('en-IN')}`;

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const TYPE_ICONS = {
  Asset: <Building2 size={16} />,
  Liability: <DollarSign size={16} />,
  Equity: <PieChart size={16} />,
  Revenue: <TrendingUp size={16} />,
  Expense: <TrendingDown size={16} />,
};

const TYPE_COLORS = {
  Asset: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  Liability: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)' },
  Equity: { bg: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  Revenue: { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
  Expense: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
};

const INITIAL_SHOW_COUNT = 5;

const AccountingView = ({
  ledgerData,
  chartOfAccounts,
  onFetchLedger,
  onFetchChartOfAccounts,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onClearAccountType,
  onCreateContact,
  onUpdateContact,
  onDeleteContact,
  onToggleImportant,
  loading
}) => {
  const { currentCompany } = useAuth();
  const [activeTab, setActiveTab] = useState('ledger');

  // Balance Sheet / P&L statement upload state
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [statementResult, setStatementResult] = useState(null);

  const handleStatementUpload = async (file) => {
    if (!file || !currentCompany) return;
    setUploadingStatement(true);
    setStatementResult(null);
    try {
      const result = await accountingAPI.uploadStatement(file, currentCompany.id);
      setStatementResult({ ok: true, ...result });
      if (onFetchChartOfAccounts) onFetchChartOfAccounts();
    } catch (err) {
      setStatementResult({ ok: false, error: err.message || 'Upload failed' });
    } finally {
      setUploadingStatement(false);
    }
  };

  // Ledger state
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [expandedLedger, setExpandedLedger] = useState(new Set());
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [showAllVendors, setShowAllVendors] = useState(false);

  // Add Contact modal state
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '', contact_type: 'customer', email: '', phone: '', notes: ''
  });
  const [contactModalLoading, setContactModalLoading] = useState(false);

  // Delete contact confirmation
  const [deletingContact, setDeletingContact] = useState(null);

  // Chart of Accounts state
  const [coaExpandedTypes, setCoaExpandedTypes] = useState(new Set(ACCOUNT_TYPES));
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addForm, setAddForm] = useState({ name: '', account_type: 'Asset', description: '', opening_balance: '' });
  const [confirmClearType, setConfirmClearType] = useState(null);
  const [clearingType, setClearingType] = useState(null);

  // Debounced search for ledger
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onFetchLedger) onFetchLedger({ search: ledgerSearch, filter: ledgerFilter });
    }, 400);
    return () => clearTimeout(timer);
  }, [ledgerSearch, ledgerFilter]);

  // Fetch chart of accounts on tab switch
  useEffect(() => {
    if (activeTab === 'chart-of-accounts' && onFetchChartOfAccounts) {
      onFetchChartOfAccounts();
    }
  }, [activeTab]);

  const toggleLedgerExpand = (key) => {
    setExpandedLedger(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCoaType = (type) => {
    setCoaExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const expandAllCoa = () => setCoaExpandedTypes(new Set(ACCOUNT_TYPES));
  const collapseAllCoa = () => setCoaExpandedTypes(new Set());

  // Group chart of accounts by type
  const groupedAccounts = useMemo(() => {
    const groups = {};
    ACCOUNT_TYPES.forEach(type => { groups[type] = []; });
    (chartOfAccounts || []).forEach(acc => {
      if (groups[acc.account_type]) {
        groups[acc.account_type].push(acc);
      }
    });
    return groups;
  }, [chartOfAccounts]);

  const typeTotals = useMemo(() => {
    const totals = {};
    ACCOUNT_TYPES.forEach(type => {
      totals[type] = (groupedAccounts[type] || []).reduce(
        (sum, acc) => sum + (parseFloat(acc.live_balance) || parseFloat(acc.opening_balance) || 0), 0
      );
    });
    return totals;
  }, [groupedAccounts]);

  const customers = ledgerData?.customers || [];
  const vendors = ledgerData?.vendors || [];

  const totalCustomerInflow = customers.reduce((sum, c) => sum + parseFloat(c.total_amount || 0), 0);
  const totalVendorOutflow = vendors.reduce((sum, v) => sum + parseFloat(v.total_amount || 0), 0);

  // Visible lists (top 5 important first, then show all)
  const visibleCustomers = showAllCustomers ? customers : customers.slice(0, INITIAL_SHOW_COUNT);
  const visibleVendors = showAllVendors ? vendors : vendors.slice(0, INITIAL_SHOW_COUNT);

  // ── Handlers ──

  const handleToggleImportant = async (name, contact_type) => {
    if (onToggleImportant) {
      await onToggleImportant(name, contact_type);
    }
  };

  const handleOpenContactModal = (type = 'customer') => {
    setContactForm({ name: '', contact_type: type, email: '', phone: '', notes: '' });
    setShowContactModal(true);
  };

  const handleSubmitContact = async () => {
    if (!contactForm.name) return;
    setContactModalLoading(true);
    try {
      await onCreateContact(contactForm);
      setShowContactModal(false);
      setContactForm({ name: '', contact_type: 'customer', email: '', phone: '', notes: '' });
    } catch (err) {
      console.error('Failed to add contact:', err);
    } finally {
      setContactModalLoading(false);
    }
  };

  const handleDeleteContact = async (contact) => {
    if (!contact.contact_info?.id) return;
    await onDeleteContact(contact.contact_info.id);
    setDeletingContact(null);
  };

  // COA handlers
  const handleAddAccount = async () => {
    if (!addForm.name || !addForm.account_type) return;
    try {
      await onCreateAccount(addForm);
      setShowAddModal(false);
      setAddForm({ name: '', account_type: 'Asset', description: '', opening_balance: '' });
    } catch (err) {
      console.error('Failed to add account:', err);
    }
  };

  const startEdit = (acc) => {
    setEditingId(acc.id);
    setEditForm({
      name: acc.name,
      account_type: acc.account_type,
      description: acc.description || '',
      opening_balance: acc.opening_balance || 0,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    try {
      await onUpdateAccount(editingId, editForm);
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      console.error('Failed to update account:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await onDeleteAccount(id);
    } catch (err) {
      console.error('Failed to delete account:', err);
    }
  };

  // Clear every saved account under one heading. Live rows (marked "live") are
  // derived from transactions/loans/invoices, so they come back on reload.
  const handleClearType = async (type) => {
    if (!onClearAccountType) return;
    setClearingType(type);
    try {
      await onClearAccountType(type);
      setConfirmClearType(null);
    } catch (err) {
      console.error('Failed to clear accounts:', err);
    } finally {
      setClearingType(null);
    }
  };

  // ── Ledger Entry Row ──
  const renderLedgerEntry = (entity, idx, type) => {
    const key = `${type}-${idx}`;
    const isExpanded = expandedLedger.has(key);
    const isCustomer = type === 'customer';
    const txnCount = parseInt(entity.transaction_count) || 0;

    return (
      <div key={key} className={`ledger-entry ${isExpanded ? 'expanded' : ''} ${entity.is_important ? 'important' : ''}`}>
        <div className="ledger-entry-header">
          {/* Expand button */}
          <div
            className="ledger-entry-expand-area"
            onClick={() => toggleLedgerExpand(key)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer', minWidth: 0 }}
          >
            <div className="ledger-entry-expand">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            {entity.is_important && (
              <Star size={14} fill="#f59e0b" stroke="#f59e0b" style={{ flexShrink: 0 }} />
            )}
            <div className={`ledger-entry-avatar ${isCustomer ? 'customer' : 'vendor'}`}>
              {entity.counterparty?.charAt(0)?.toUpperCase() || (isCustomer ? 'C' : 'V')}
            </div>
            <div className="ledger-entry-info" style={{ minWidth: 0 }}>
              <div className="ledger-entry-name">{entity.counterparty}</div>
              <div className="ledger-entry-meta">
                {!isCustomer && entity.service_category && (
                  <span className="vendor-service-tag">{entity.service_category}</span>
                )}
                {entity.contact_info?.email && (
                  <span style={{ color: '#718096', fontSize: '12px' }}>{entity.contact_info.email}</span>
                )}
                {txnCount > 0
                  ? `${txnCount} transaction${txnCount !== 1 ? 's' : ''} • Last: ${entity.last_transaction_date ? new Date(entity.last_transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}`
                  : 'No transactions yet'
                }
              </div>
            </div>
          </div>

          <div className="ledger-entry-right">
            {txnCount > 0 && (
              <div className={`ledger-entry-amount ${isCustomer ? 'positive' : 'negative'}`}>
                {isCustomer ? '+' : '-'}{formatINR(entity.total_amount)}
              </div>
            )}
            {isCustomer && entity.invoices && (
              <div className="ledger-entry-badge">
                {entity.invoices.total_outstanding > 0
                  ? <span className="badge-outstanding">{formatINR(entity.invoices.total_outstanding)} outstanding</span>
                  : <span className="badge-clear">All invoices paid</span>
                }
              </div>
            )}

            {/* Action buttons */}
            <div className="ledger-entry-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
              <button
                className={`ledger-action-btn star ${entity.is_important ? 'active' : ''}`}
                title={entity.is_important ? 'Remove from important' : 'Mark as important'}
                onClick={(e) => { e.stopPropagation(); handleToggleImportant(entity.counterparty, type); }}
              >
                <Star size={14} fill={entity.is_important ? '#f59e0b' : 'none'} stroke={entity.is_important ? '#f59e0b' : 'currentColor'} />
              </button>
              {entity.contact_info?.id && (
                <button
                  className="ledger-action-btn delete"
                  title="Remove contact"
                  onClick={(e) => { e.stopPropagation(); setDeletingContact(entity); }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="ledger-entry-detail">
            {entity.contact_info && (entity.contact_info.email || entity.contact_info.phone || entity.contact_info.notes) && (
              <div className="ledger-contact-details">
                {entity.contact_info.email && (
                  <span><Mail size={12} /> {entity.contact_info.email}</span>
                )}
                {entity.contact_info.phone && (
                  <span><Phone size={12} /> {entity.contact_info.phone}</span>
                )}
                {entity.contact_info.notes && (
                  <span style={{ color: '#718096' }}>{entity.contact_info.notes}</span>
                )}
              </div>
            )}
            {(entity.transactions || []).length > 0 ? (
              <table className="ledger-detail-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th className="align-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(entity.transactions || []).map((txn) => (
                    <tr key={txn.id}>
                      <td className="ledger-detail-date">{txn.date}</td>
                      <td>{txn.name}</td>
                      <td><span className="ledger-detail-category">{txn.category}</span></td>
                      <td className="ledger-detail-account">{txn.account || '-'}</td>
                      <td className={`align-right ${isCustomer ? 'positive' : 'negative'}`}>
                        {isCustomer ? '+' : '-'}{formatINR(txn.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '1rem', color: '#a0aec0', textAlign: 'center', fontSize: '13px' }}>
                No transactions recorded yet
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── RENDER LEDGER TAB ──────────────────────────────────────────
  const renderLedger = () => (
    <div className="accounting-ledger">
      {/* Stats */}
      <div className="ledger-stats-grid">
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon customer"><Users size={20} /></div>
          <div className="ledger-stat-content">
            <div className="ledger-stat-label">Total Customers</div>
            <div className="ledger-stat-value">{customers.length}</div>
          </div>
        </div>
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon inflow"><TrendingUp size={20} /></div>
          <div className="ledger-stat-content">
            <div className="ledger-stat-label">Total Cash Inflow</div>
            <div className="ledger-stat-value green">{formatINR(totalCustomerInflow)}</div>
          </div>
        </div>
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon vendor"><Truck size={20} /></div>
          <div className="ledger-stat-content">
            <div className="ledger-stat-label">Total Vendors</div>
            <div className="ledger-stat-value">{vendors.length}</div>
          </div>
        </div>
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon outflow"><TrendingDown size={20} /></div>
          <div className="ledger-stat-content">
            <div className="ledger-stat-label">Total Deductions</div>
            <div className="ledger-stat-value red">{formatINR(totalVendorOutflow)}</div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="ledger-controls">
        <div className="ledger-search-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search customers, vendors, services..."
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
          />
        </div>
        <div className="ledger-filter-buttons">
          {[
            { key: 'all', label: 'All', icon: <Filter size={14} /> },
            { key: 'customer', label: 'Customers', icon: <Users size={14} /> },
            { key: 'vendor', label: 'Vendors', icon: <Truck size={14} /> },
          ].map(btn => (
            <button
              key={btn.key}
              className={`ledger-filter-btn ${ledgerFilter === btn.key ? 'active' : ''}`}
              onClick={() => setLedgerFilter(btn.key)}
            >
              {btn.icon}
              {btn.label}
            </button>
          ))}
        </div>
        {/* Add Customer/Vendor buttons */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          {(ledgerFilter === 'all' || ledgerFilter === 'customer') && (
            <button className="ledger-add-contact-btn customer" onClick={() => handleOpenContactModal('customer')}>
              <UserPlus size={14} />
              Add Customer
            </button>
          )}
          {(ledgerFilter === 'all' || ledgerFilter === 'vendor') && (
            <button className="ledger-add-contact-btn vendor" onClick={() => handleOpenContactModal('vendor')}>
              <UserPlus size={14} />
              Add Vendor
            </button>
          )}
        </div>
      </div>

      {loading && <div className="state-message">Loading ledger data...</div>}

      {!loading && (
        <>
          {/* Customer Ledger */}
          {(ledgerFilter === 'all' || ledgerFilter === 'customer') && (
            <div className="ledger-section">
              <div className="ledger-section-header customer-header">
                <div className="ledger-section-title">
                  <Users size={18} />
                  <span>Customer Ledger — Cash Inflows</span>
                  {customers.some(c => c.is_important) && (
                    <span className="important-badge"><Star size={12} fill="currentColor" /> Important first</span>
                  )}
                </div>
                <span className="ledger-section-count">{customers.length} customers</span>
              </div>

              {customers.length === 0 ? (
                <div className="ledger-empty-section">
                  <Users size={32} style={{ color: '#cbd5e0', marginBottom: '8px' }} />
                  <p>No customers found. Add income transactions with categories like Sales, Consulting, or Commissions, or add a customer manually.</p>
                </div>
              ) : (
                <>
                  <div className="ledger-entries">
                    {visibleCustomers.map((customer, idx) => renderLedgerEntry(customer, idx, 'customer'))}
                  </div>
                  {customers.length > INITIAL_SHOW_COUNT && (
                    <div className="ledger-show-more">
                      <button
                        className="ledger-show-more-btn"
                        onClick={() => setShowAllCustomers(prev => !prev)}
                      >
                        {showAllCustomers ? (
                          <><ChevronUp size={14} /> Show less</>
                        ) : (
                          <><ChevronDown size={14} /> Show all {customers.length} customers</>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Vendor Ledger */}
          {(ledgerFilter === 'all' || ledgerFilter === 'vendor') && (
            <div className="ledger-section">
              <div className="ledger-section-header vendor-header">
                <div className="ledger-section-title">
                  <Truck size={18} />
                  <span>Vendor Ledger — Service Deductions</span>
                  {vendors.some(v => v.is_important) && (
                    <span className="important-badge"><Star size={12} fill="currentColor" /> Important first</span>
                  )}
                </div>
                <span className="ledger-section-count">{vendors.length} vendors</span>
              </div>

              {vendors.length === 0 ? (
                <div className="ledger-empty-section">
                  <Truck size={32} style={{ color: '#cbd5e0', marginBottom: '8px' }} />
                  <p>No vendors found. Add expense transactions with categories like Marketing, Software, or Professional Fees, or add a vendor manually.</p>
                </div>
              ) : (
                <>
                  <div className="ledger-entries">
                    {visibleVendors.map((vendor, idx) => renderLedgerEntry(vendor, idx, 'vendor'))}
                  </div>
                  {vendors.length > INITIAL_SHOW_COUNT && (
                    <div className="ledger-show-more">
                      <button
                        className="ledger-show-more-btn"
                        onClick={() => setShowAllVendors(prev => !prev)}
                      >
                        {showAllVendors ? (
                          <><ChevronUp size={14} /> Show less</>
                        ) : (
                          <><ChevronDown size={14} /> Show all {vendors.length} vendors</>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!loading && customers.length === 0 && vendors.length === 0 && (
            <div className="ledger-empty">
              <BookOpen size={48} />
              <h3>No ledger entries found</h3>
              <p>Add transactions to see your customer and vendor ledger. You can also add customers and vendors manually using the buttons above.</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ─── RENDER CHART OF ACCOUNTS TAB ───────────────────────────────
  const renderChartOfAccounts = () => (
    <div className="coa-container">
      <div className="coa-controls">
        <div className="coa-toggle-buttons">
          <button className="coa-toggle-btn" onClick={expandAllCoa}>
            <ChevronsDown size={14} />
            Expand All
          </button>
          <button className="coa-toggle-btn" onClick={collapseAllCoa}>
            <ChevronsUp size={14} />
            Collapse All
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <label className="coa-toggle-btn" style={{ cursor: uploadingStatement ? 'wait' : 'pointer' }}>
            <FileUp size={14} />
            {uploadingStatement ? 'Importing…' : 'Upload Balance Sheet / P&L'}
            <input
              type="file"
              accept=".csv,.pdf"
              hidden
              disabled={uploadingStatement}
              onChange={(e) => { handleStatementUpload(e.target.files[0]); e.target.value = ''; }}
            />
          </label>
          <button className="coa-add-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add Account
          </button>
        </div>
      </div>

      {statementResult && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
            padding: '0.7rem 1rem', borderRadius: 12, marginBottom: '1rem',
            background: statementResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)',
            border: `1px solid ${statementResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: statementResult.ok ? '#059669' : '#dc2626',
            fontSize: '0.82rem', fontWeight: 600,
          }}
        >
          <span>
            {statementResult.ok
              ? `Statement imported — ${statementResult.created} account${statementResult.created === 1 ? '' : 's'} added, ${statementResult.updated} updated in your Chart of Accounts.`
              : statementResult.error}
          </span>
          <button
            onClick={() => setStatementResult(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="coa-summary-grid">
        {ACCOUNT_TYPES.map(type => (
          <div key={type} className="coa-summary-card" style={{ borderLeft: `3px solid ${TYPE_COLORS[type].color}` }}>
            <div className="coa-summary-icon" style={{ background: TYPE_COLORS[type].bg, color: TYPE_COLORS[type].color }}>
              {TYPE_ICONS[type]}
            </div>
            <div className="coa-summary-content">
              <div className="coa-summary-label">{type}</div>
              <div className="coa-summary-value" style={{ color: TYPE_COLORS[type].color }}>{formatINR(typeTotals[type])}</div>
              <div className="coa-summary-count">{groupedAccounts[type]?.length || 0} accounts</div>
            </div>
          </div>
        ))}
      </div>

      {loading && <div className="state-message">Loading chart of accounts...</div>}

      {!loading && ACCOUNT_TYPES.map(type => {
        const accounts = groupedAccounts[type] || [];
        const isExpanded = coaExpandedTypes.has(type);

        return (
          <div key={type} className="coa-group">
            <div
              className="coa-group-header"
              onClick={() => toggleCoaType(type)}
              style={{ borderLeft: `4px solid ${TYPE_COLORS[type].color}` }}
            >
              <div className="coa-group-left">
                <div className="coa-group-expand">
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
                <div className="coa-group-icon" style={{ background: TYPE_COLORS[type].gradient }}>
                  {TYPE_ICONS[type]}
                </div>
                <div className="coa-group-info">
                  <div className="coa-group-title">{type}</div>
                  <div className="coa-group-subtitle">{accounts.length} accounts</div>
                </div>
              </div>
              <div className="coa-group-right">
                <div className="coa-group-total" style={{ color: TYPE_COLORS[type].color }}>
                  {formatINR(typeTotals[type])}
                </div>
                {onClearAccountType && accounts.some(a => !a.is_virtual) && (
                  <button
                    className="coa-clear-btn"
                    title={`Clear all ${type} accounts`}
                    onClick={(e) => { e.stopPropagation(); setConfirmClearType(type); }}
                  >
                    <Trash2 size={13} /> Clear All
                  </button>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="coa-group-body">
                {accounts.length === 0 ? (
                  <div className="coa-empty-group">No accounts in this category</div>
                ) : (
                  <table className="coa-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Account Name</th>
                        <th>Description</th>
                        <th className="align-right">Balance</th>
                        <th className="align-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map(acc => (
                        <tr key={acc.id}>
                          {editingId === acc.id ? (
                            <>
                              <td><span className="coa-code">{acc.code}</span></td>
                              <td>
                                <input
                                  className="coa-inline-input"
                                  value={editForm.name}
                                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                  placeholder="Account name"
                                />
                              </td>
                              <td>
                                <input
                                  className="coa-inline-input"
                                  value={editForm.description}
                                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                  placeholder="Description"
                                />
                              </td>
                              <td className="align-right">
                                <input
                                  className="coa-inline-input align-right"
                                  type="number"
                                  value={editForm.opening_balance}
                                  onChange={(e) => setEditForm({ ...editForm, opening_balance: e.target.value })}
                                  placeholder="Balance"
                                />
                              </td>
                              <td className="align-right">
                                <div className="coa-actions">
                                  <button className="coa-action-btn save" onClick={saveEdit}><Check size={14} /></button>
                                  <button className="coa-action-btn cancel" onClick={cancelEdit}><X size={14} /></button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td><span className="coa-code" style={{ color: TYPE_COLORS[type].color }}>{acc.code}</span></td>
                              <td className="coa-name">
                                {acc.name}
                                {acc.is_virtual && <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '6px' }}>(live)</span>}
                              </td>
                              <td className="coa-description">{acc.description || '-'}</td>
                              <td className="align-right">
                                <span className="coa-balance" style={{ color: TYPE_COLORS[type].color }}>
                                  {formatINR(acc.live_balance || acc.opening_balance || 0)}
                                </span>
                              </td>
                              <td className="align-right">
                                <div className="coa-actions">
                                  {!acc.is_virtual && <button className="coa-action-btn edit" onClick={() => startEdit(acc)}><Pencil size={14} /></button>}
                                  {!acc.is_virtual && <button className="coa-action-btn delete" onClick={() => handleDelete(acc.id)}><Trash2 size={14} /></button>}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header">
        <div>
          <h1 className="view-title">Accounting</h1>
          <p className="view-subtitle">Manage your ledger entries and chart of accounts</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="accounting-tabs">
        <button
          className={`accounting-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <BookOpen size={16} />
          Ledger
        </button>
        <button
          className={`accounting-tab-btn ${activeTab === 'chart-of-accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart-of-accounts')}
        >
          <PieChart size={16} />
          Chart of Accounts
        </button>
      </div>

      {activeTab === 'ledger' && renderLedger()}
      {activeTab === 'chart-of-accounts' && renderChartOfAccounts()}

      {/* ── Add Contact Modal ── */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="coa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="coa-modal-header">
              <h2>Add {contactForm.contact_type === 'customer' ? 'Customer' : 'Vendor'}</h2>
              <button className="coa-modal-close" onClick={() => setShowContactModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="coa-modal-body">
              <div className="coa-form-group">
                <label>Type</label>
                <div className="coa-type-selector">
                  {[
                    { key: 'customer', label: 'Customer', icon: <Users size={14} /> },
                    { key: 'vendor', label: 'Vendor', icon: <Truck size={14} /> },
                  ].map(t => (
                    <button
                      key={t.key}
                      className={`coa-type-btn ${contactForm.contact_type === t.key ? 'active' : ''}`}
                      onClick={() => setContactForm({ ...contactForm, contact_type: t.key })}
                      style={contactForm.contact_type === t.key ? {
                        background: t.key === 'customer' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: t.key === 'customer' ? '#10b981' : '#ef4444',
                        borderColor: t.key === 'customer' ? '#10b981' : '#ef4444',
                      } : {}}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="coa-form-group">
                <label>Name *</label>
                <input
                  type="text"
                  className="coa-form-input"
                  placeholder="Company or person name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                />
              </div>

              <div className="coa-form-group">
                <label>Email (Optional)</label>
                <input
                  type="email"
                  className="coa-form-input"
                  placeholder="contact@example.com"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                />
              </div>

              <div className="coa-form-group">
                <label>Phone (Optional)</label>
                <input
                  type="text"
                  className="coa-form-input"
                  placeholder="+91 98765 43210"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                />
              </div>

              <div className="coa-form-group">
                <label>Notes (Optional)</label>
                <input
                  type="text"
                  className="coa-form-input"
                  placeholder="Any notes about this contact"
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="coa-modal-footer">
              <button className="coa-modal-cancel" onClick={() => setShowContactModal(false)}>Cancel</button>
              <button
                className="coa-modal-submit"
                onClick={handleSubmitContact}
                disabled={!contactForm.name || contactModalLoading}
              >
                <Plus size={16} />
                {contactModalLoading ? 'Adding...' : `Add ${contactForm.contact_type === 'customer' ? 'Customer' : 'Vendor'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Account Type Confirmation ── */}
      {confirmClearType && (
        <div className="modal-overlay" onClick={() => setConfirmClearType(null)}>
          <div className="coa-modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="coa-modal-header">
              <h2>Clear {confirmClearType} Accounts</h2>
              <button className="coa-modal-close" onClick={() => setConfirmClearType(null)}><X size={20} /></button>
            </div>
            <div className="coa-modal-body">
              <p style={{ color: '#4a5568', fontSize: '15px', marginBottom: '10px' }}>
                Delete all{' '}
                <strong>{(groupedAccounts[confirmClearType] || []).filter(a => !a.is_virtual).length}</strong>{' '}
                saved {confirmClearType.toLowerCase()} account{(groupedAccounts[confirmClearType] || []).filter(a => !a.is_virtual).length === 1 ? '' : 's'}?
              </p>
              <p style={{ color: '#718096', fontSize: '13px' }}>
                Your transactions, invoices and loans are not touched. Rows marked <em>(live)</em> are calculated from that
                data and will reappear.
              </p>
            </div>
            <div className="coa-modal-footer">
              <button className="coa-modal-cancel" onClick={() => setConfirmClearType(null)}>Cancel</button>
              <button
                className="coa-modal-submit"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                onClick={() => handleClearType(confirmClearType)}
                disabled={clearingType === confirmClearType}
              >
                <Trash2 size={16} />
                {clearingType === confirmClearType ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Contact Confirmation ── */}
      {deletingContact && (
        <div className="modal-overlay" onClick={() => setDeletingContact(null)}>
          <div className="coa-modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="coa-modal-header">
              <h2>Remove Contact</h2>
              <button className="coa-modal-close" onClick={() => setDeletingContact(null)}><X size={20} /></button>
            </div>
            <div className="coa-modal-body">
              <p style={{ color: '#4a5568', fontSize: '15px' }}>
                Remove <strong>{deletingContact.counterparty}</strong> from your contacts? Their transactions will remain but they won't appear in the ledger unless they have matching transactions.
              </p>
            </div>
            <div className="coa-modal-footer">
              <button className="coa-modal-cancel" onClick={() => setDeletingContact(null)}>Cancel</button>
              <button
                className="coa-modal-submit"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                onClick={() => handleDeleteContact(deletingContact)}
              >
                <Trash2 size={16} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add COA Account Modal ── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="coa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="coa-modal-header">
              <h2>Add New Account</h2>
              <button className="coa-modal-close" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="coa-modal-body">
              <div className="coa-form-group">
                <label>Account Type</label>
                <div className="coa-type-selector">
                  {ACCOUNT_TYPES.map(type => (
                    <button
                      key={type}
                      className={`coa-type-btn ${addForm.account_type === type ? 'active' : ''}`}
                      onClick={() => setAddForm({ ...addForm, account_type: type })}
                      style={addForm.account_type === type ? {
                        background: TYPE_COLORS[type].bg,
                        color: TYPE_COLORS[type].color,
                        borderColor: TYPE_COLORS[type].color
                      } : {}}
                    >
                      {TYPE_ICONS[type]}
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="coa-form-group">
                <label>Account Name</label>
                <input
                  type="text"
                  className="coa-form-input"
                  placeholder="e.g., Office Supplies, Cash in Hand"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                />
              </div>

              <div className="coa-form-group">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  className="coa-form-input"
                  placeholder="Brief description of this account"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                />
              </div>

              <div className="coa-form-group">
                <label>Balance (₹)</label>
                <input
                  type="number"
                  className="coa-form-input"
                  placeholder="0.00"
                  value={addForm.opening_balance}
                  onChange={(e) => setAddForm({ ...addForm, opening_balance: e.target.value })}
                />
              </div>
            </div>

            <div className="coa-modal-footer">
              <button className="coa-modal-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button
                className="coa-modal-submit"
                onClick={handleAddAccount}
                disabled={!addForm.name}
              >
                <Plus size={16} />
                Add Account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AccountingView;
