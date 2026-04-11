import React, { useState, useEffect, useMemo, useCallback } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { 
  Search, BookOpen, Users, Truck, ChevronDown, ChevronRight, 
  Plus, Pencil, Check, X, Trash2, TrendingUp, TrendingDown,
  DollarSign, Building2, PieChart, ChevronsDown, ChevronsUp, Filter
} from 'lucide-react';
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

const AccountingView = ({ 
  ledgerData, 
  chartOfAccounts, 
  onFetchLedger, 
  onFetchChartOfAccounts,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  loading 
}) => {
  const [activeTab, setActiveTab] = useState('ledger');
  
  // Ledger state
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [expandedLedger, setExpandedLedger] = useState(new Set());
  
  // Chart of Accounts state
  const [coaExpandedTypes, setCoaExpandedTypes] = useState(new Set(ACCOUNT_TYPES));
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addForm, setAddForm] = useState({ name: '', account_type: 'Asset', description: '', opening_balance: '' });

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

  // Calculate totals per type
  const typeTotals = useMemo(() => {
    const totals = {};
    ACCOUNT_TYPES.forEach(type => {
      totals[type] = (groupedAccounts[type] || []).reduce((sum, acc) => sum + (parseFloat(acc.live_balance) || parseFloat(acc.opening_balance) || 0), 0);
    });
    return totals;
  }, [groupedAccounts]);

  const customers = ledgerData?.customers || [];
  const vendors = ledgerData?.vendors || [];

  const totalCustomerInflow = customers.reduce((sum, c) => sum + parseFloat(c.total_amount || 0), 0);
  const totalVendorOutflow = vendors.reduce((sum, v) => sum + parseFloat(v.total_amount || 0), 0);

  // --- Add Account Handler ---
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

  // --- Edit Account Handlers ---
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

  // ─── RENDER LEDGER TAB ──────────────────────────────────────────
  const renderLedger = () => (
    <div className="accounting-ledger">
      {/* Ledger Stats */}
      <div className="ledger-stats-grid">
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon customer">
            <Users size={20} />
          </div>
          <div className="ledger-stat-content">
            <div className="ledger-stat-label">Total Customers</div>
            <div className="ledger-stat-value">{customers.length}</div>
          </div>
        </div>
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon inflow">
            <TrendingUp size={20} />
          </div>
          <div className="ledger-stat-content">
            <div className="ledger-stat-label">Total Cash Inflow</div>
            <div className="ledger-stat-value green">{formatINR(totalCustomerInflow)}</div>
          </div>
        </div>
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon vendor">
            <Truck size={20} />
          </div>
          <div className="ledger-stat-content">
            <div className="ledger-stat-label">Total Vendors</div>
            <div className="ledger-stat-value">{vendors.length}</div>
          </div>
        </div>
        <div className="ledger-stat-card">
          <div className="ledger-stat-icon outflow">
            <TrendingDown size={20} />
          </div>
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
      </div>

      {loading && <div className="state-message">Loading ledger data...</div>}

      {!loading && (
        <>
          {/* Customer Ledger */}
          {(ledgerFilter === 'all' || ledgerFilter === 'customer') && customers.length > 0 && (
            <div className="ledger-section">
              <div className="ledger-section-header customer-header">
                <div className="ledger-section-title">
                  <Users size={18} />
                  <span>Customer Ledger — Cash Inflows</span>
                </div>
                <span className="ledger-section-count">{customers.length} customers</span>
              </div>

              <div className="ledger-entries">
                {customers.map((customer, idx) => {
                  const key = `customer-${idx}`;
                  const isExpanded = expandedLedger.has(key);
                  return (
                    <div key={key} className={`ledger-entry ${isExpanded ? 'expanded' : ''}`}>
                      <div className="ledger-entry-header" onClick={() => toggleLedgerExpand(key)}>
                        <div className="ledger-entry-left">
                          <div className="ledger-entry-expand">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                          <div className="ledger-entry-avatar customer">
                            {customer.counterparty?.charAt(0)?.toUpperCase() || 'C'}
                          </div>
                          <div className="ledger-entry-info">
                            <div className="ledger-entry-name">{customer.counterparty}</div>
                            <div className="ledger-entry-meta">
                              {customer.transaction_count} transactions • Last: {customer.last_transaction_date ? new Date(customer.last_transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                            </div>
                          </div>
                        </div>
                        <div className="ledger-entry-right">
                          <div className="ledger-entry-amount positive">+{formatINR(customer.total_amount)}</div>
                          {customer.invoices && (
                            <div className="ledger-entry-badge">
                              {customer.invoices.total_outstanding > 0 
                                ? <span className="badge-outstanding">{formatINR(customer.invoices.total_outstanding)} outstanding</span>
                                : <span className="badge-clear">All invoices paid</span>
                              }
                            </div>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ledger-entry-detail">
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
                              {(customer.transactions || []).map((txn) => (
                                <tr key={txn.id}>
                                  <td className="ledger-detail-date">{txn.date}</td>
                                  <td>{txn.name}</td>
                                  <td><span className="ledger-detail-category">{txn.category}</span></td>
                                  <td className="ledger-detail-account">{txn.account || '-'}</td>
                                  <td className="align-right positive">+{formatINR(txn.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vendor Ledger */}
          {(ledgerFilter === 'all' || ledgerFilter === 'vendor') && vendors.length > 0 && (
            <div className="ledger-section">
              <div className="ledger-section-header vendor-header">
                <div className="ledger-section-title">
                  <Truck size={18} />
                  <span>Vendor Ledger — Service Deductions</span>
                </div>
                <span className="ledger-section-count">{vendors.length} vendors</span>
              </div>

              <div className="ledger-entries">
                {vendors.map((vendor, idx) => {
                  const key = `vendor-${idx}`;
                  const isExpanded = expandedLedger.has(key);
                  return (
                    <div key={key} className={`ledger-entry ${isExpanded ? 'expanded' : ''}`}>
                      <div className="ledger-entry-header" onClick={() => toggleLedgerExpand(key)}>
                        <div className="ledger-entry-left">
                          <div className="ledger-entry-expand">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                          <div className="ledger-entry-avatar vendor">
                            {vendor.counterparty?.charAt(0)?.toUpperCase() || 'V'}
                          </div>
                          <div className="ledger-entry-info">
                            <div className="ledger-entry-name">{vendor.counterparty}</div>
                            <div className="ledger-entry-meta">
                              {vendor.service_category && <span className="vendor-service-tag">{vendor.service_category}</span>}
                              {vendor.transaction_count} transactions • Last: {vendor.last_transaction_date ? new Date(vendor.last_transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                            </div>
                          </div>
                        </div>
                        <div className="ledger-entry-right">
                          <div className="ledger-entry-amount negative">-{formatINR(vendor.total_amount)}</div>
                          {vendor.vendor_info && (
                            <div className="ledger-entry-badge">
                              <span className="badge-info">{vendor.vendor_info.email}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ledger-entry-detail">
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
                              {(vendor.transactions || []).map((txn) => (
                                <tr key={txn.id}>
                                  <td className="ledger-detail-date">{txn.date}</td>
                                  <td>{txn.name}</td>
                                  <td><span className="ledger-detail-category">{txn.category}</span></td>
                                  <td className="ledger-detail-account">{txn.account || '-'}</td>
                                  <td className="align-right negative">-{formatINR(txn.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && customers.length === 0 && vendors.length === 0 && (
            <div className="ledger-empty">
              <BookOpen size={48} />
              <h3>No ledger entries found</h3>
              <p>Add transactions to see your customer and vendor ledger entries here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ─── RENDER CHART OF ACCOUNTS TAB ───────────────────────────────
  const renderChartOfAccounts = () => (
    <div className="coa-container">
      {/* COA Controls */}
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
        <button className="coa-add-btn" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          Add Account
        </button>
      </div>

      {/* Summary Metrics */}
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

      {/* Account Groups */}
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
              <div className="coa-group-total" style={{ color: TYPE_COLORS[type].color }}>
                {formatINR(typeTotals[type])}
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
                              <td className="coa-name">{acc.name}</td>
                              <td className="coa-description">{acc.description || '-'}</td>
                              <td className="align-right">
                                <span className="coa-balance" style={{ color: TYPE_COLORS[type].color }}>
                                  {formatINR(acc.live_balance || acc.opening_balance || 0)}
                                </span>
                              </td>
                              <td className="align-right">
                                <div className="coa-actions">
                                  <button className="coa-action-btn edit" onClick={() => startEdit(acc)}><Pencil size={14} /></button>
                                  <button className="coa-action-btn delete" onClick={() => handleDelete(acc.id)}><Trash2 size={14} /></button>
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

      {/* Add Account Modal */}
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
                <label>Opening Balance (₹)</label>
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
