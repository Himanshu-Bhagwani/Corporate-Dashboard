import React, { useState } from 'react';
import './AccountsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { PlusCircle, CreditCard, Link2, TrendingUp, Eye, EyeOff, DollarSign, Calendar, AlertCircle, CheckCircle, ArrowUpRight, Pencil, Trash2, X, Check } from 'lucide-react';

const ACCOUNT_TYPES = ['Checking', 'Savings', 'Credit', 'Investment', 'Cash', 'UPI', 'Wallet', 'Other'];

const AddAccountModal = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '', type: 'Savings', bank: '', account_number: '', opening_balance: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return setError('Account name is required.');
    if (!formData.bank.trim()) return setError('Bank / provider name is required.');
    setError('');
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Account</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label>Account Name</label>
              <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g., My Savings" />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Bank / Provider</label>
              <input name="bank" value={formData.bank} onChange={handleChange} placeholder="e.g., HDFC, GPay, Cash" />
            </div>
            <div className="form-group">
              <label>Account Number (Optional)</label>
              <input name="account_number" value={formData.account_number} onChange={handleChange} placeholder="Last 4 digits" />
            </div>
          </div>
          <div className="form-group">
            <label>Opening Balance (Optional)</label>
            <input
              name="opening_balance"
              type="number"
              min="0"
              step="0.01"
              value={formData.opening_balance}
              onChange={handleChange}
              placeholder="0.00 — what was in this account before you started tracking"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit}>Add Account</button>
        </div>
      </div>
    </div>
  );
};

const EditAccountModal = ({ account, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    name: account.name,
    type: account.type,
    bank: account.bank,
    account_number: account.account_number || '',
    opening_balance: account.opening_balance || '0',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return setError('Account name is required.');
    if (!formData.bank.trim()) return setError('Bank / provider name is required.');
    setError('');
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Account</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label>Account Name</label>
              <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g., My Savings" />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Bank / Provider</label>
              <input name="bank" value={formData.bank} onChange={handleChange} placeholder="e.g., HDFC, GPay, Cash" />
            </div>
            <div className="form-group">
              <label>Account Number (Optional)</label>
              <input name="account_number" value={formData.account_number} onChange={handleChange} placeholder="Last 4 digits" />
            </div>
          </div>
          <div className="form-group">
            <label>Opening Balance</label>
            <input
              name="opening_balance"
              type="number"
              min="0"
              step="0.01"
              value={formData.opening_balance}
              onChange={handleChange}
              placeholder="0.00 — what was in this account before you started tracking"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit}>Save Changes</button>
        </div>
      </div>
    </div>
  );
};

const AccountsView = ({ accounts, stats, loading, onAdd, onUpdate, onDelete }) => {
  const [hiddenBalances, setHiddenBalances] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [deleteConfirmAccount, setDeleteConfirmAccount] = useState(null);

  const toggleBalance = (id) => {
    setHiddenBalances(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatBalance = (balance, id) => {
    if (hiddenBalances[id]) return '••••••';
    const num = parseFloat(balance) || 0;
    return `${num < 0 ? '-' : ''}₹${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getAccountTypeGradient = (type) => {
    switch ((type || '').toLowerCase()) {
      case 'checking': return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      case 'savings': return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      case 'credit': return 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
      case 'investment': return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      case 'upi': return 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)';
      case 'wallet': return 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)';
      case 'cash': return 'linear-gradient(135deg, #84cc16 0%, #65a30d 100%)';
      default: return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  };

  const confirmDelete = async () => {
    await onDelete(deleteConfirmAccount.id);
    setDeleteConfirmAccount(null);
  };

  const filteredAccounts = activeFilter === 'All'
    ? accounts
    : accounts.filter(a => a.type?.toLowerCase() === activeFilter.toLowerCase());

  const totalBalance = accounts.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
  const totalIncome = accounts.reduce((sum, a) => sum + (parseFloat(a.total_income) || 0), 0);
  const totalExpenses = accounts.reduce((sum, a) => sum + (parseFloat(a.total_expenses) || 0), 0);
  const totalTransactions = accounts.reduce((sum, a) => sum + (parseInt(a.transaction_count) || 0), 0);

  const avgBalance = accounts.length > 0 ? totalBalance / accounts.length : 0;
  const lowBalanceAccounts = accounts.filter(a => parseFloat(a.balance) < 500);
  const mostActive = accounts.reduce((prev, curr) =>
    (parseInt(curr.transaction_count) || 0) > (parseInt(prev.transaction_count) || 0) ? curr : prev,
    accounts[0] || {}
  );

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header">
        <div>
          <h1 className="view-title">Accounts</h1>
          <p className="view-subtitle">Manage your bank accounts, UPI, wallets and more</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          <PlusCircle size={20} />
          Add Account
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid-3-accounts">
        <div className="stat-card-accounts">
          <div className="stat-icon-wrapper-accounts green"><DollarSign size={20} /></div>
          <div className="stat-content-accounts">
            <div className="stat-label-accounts">Total Balance</div>
            <div className="stat-value-accounts">
              ₹{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="stat-sublabel-accounts">Across all accounts</div>
          </div>
        </div>
        <div className="stat-card-accounts">
          <div className="stat-icon-wrapper-accounts blue"><Link2 size={20} /></div>
          <div className="stat-content-accounts">
            <div className="stat-label-accounts">Total Accounts</div>
            <div className="stat-value-accounts">{accounts.length}</div>
            <div className="stat-sublabel-accounts">Active accounts</div>
          </div>
        </div>
        <div className="stat-card-accounts">
          <div className="stat-icon-wrapper-accounts red"><CreditCard size={20} /></div>
          <div className="stat-content-accounts">
            <div className="stat-label-accounts">Total Debits</div>
            <div className="stat-value-accounts">
              ₹{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="stat-sublabel-accounts">All time debits</div>
          </div>
        </div>
      </div>

      {/* Accounts Section */}
      <div className="accounts-section-enhanced">
        <div className="accounts-header-section">
          <h2 className="accounts-section-title">Your Accounts</h2>
          <div className="accounts-filters">
            {['All', 'Checking', 'Savings', 'Credit', 'UPI', 'Wallet', 'Cash'].map(f => (
              <button
                key={f}
                className={`filter-btn ${activeFilter === f ? 'active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="state-message">Loading accounts...</div>}

        <div className="accounts-grid">
          {filteredAccounts.map(account => (
            <div key={account.id} className="account-card-premium">
              <div className="card-bg-gradient" style={{ background: getAccountTypeGradient(account.type) }}></div>
              <div className="card-decoration">
                <div className="decoration-circle circle-1"></div>
                <div className="decoration-circle circle-2"></div>
                <div className="decoration-circle circle-3"></div>
              </div>

              <div className="account-card-content">
                <div className="account-card-premium-header">
                  <div className="account-type-pill">
                    <CreditCard size={16} />
                    <span>{account.type}</span>
                  </div>
                  <div className="card-header-actions">
                    <button className="card-icon-btn edit" onClick={() => setEditingAccount(account)}>
                      <Pencil size={15} />
                    </button>
                    <button className="card-icon-btn delete" onClick={() => setDeleteConfirmAccount(account)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="account-bank-info">
                  <span className="bank-label">Bank / Provider</span>
                  <span className="bank-name-premium">{account.bank}</span>
                </div>

                <div className="account-name-wrapper">
                  <h3 className="account-name-premium">{account.name}</h3>
                  <span className="account-number-premium">
                    {account.account_number ? `•••• ${account.account_number}` : ''}
                  </span>
                </div>

                <div className="balance-section-premium">
                  <div className="balance-top-row">
                    <span className="balance-label-premium">Balance</span>
                    <button className="toggle-visibility-btn" onClick={() => toggleBalance(account.id)}>
                      {hiddenBalances[account.id] ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </div>
                  <div className="balance-amount-premium">
                    {formatBalance(account.balance, account.id)}
                  </div>
                  <div className="account-mini-stats">
                    <span className="mini-stat income">
                      <ArrowUpRight size={12} /> ₹{parseFloat(account.total_income || 0).toLocaleString()}
                    </span>
                    <span className="mini-stat expense">
                      ↓ ₹{parseFloat(account.total_expenses || 0).toLocaleString()}
                    </span>
                    <span className="mini-stat neutral">
                      {account.transaction_count} txns
                    </span>
                  </div>
                </div>

                <div className="account-card-premium-footer">
                  <div className="sync-info-premium">
                    <CheckCircle size={14} />
                    <span>
                      {parseInt(account.transaction_count) > 0
                        ? `${account.transaction_count} transactions`
                        : 'No transactions yet'}
                    </span>
                  </div>
                  {parseFloat(account.opening_balance) > 0 && (
                    <span style={{ color: 'var(--medium-grey)', fontSize: '0.75rem' }}>
                      Opening: ₹{parseFloat(account.opening_balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
              <div className="card-shine"></div>
            </div>
          ))}

          {/* Add New Account Card */}
          <div className="account-card-premium add-new-card" onClick={() => setShowAddModal(true)}>
            <div className="add-new-content">
              <div className="add-new-icon-wrapper"><PlusCircle size={48} /></div>
              <h3 className="add-new-title">Add New Account</h3>
              <p className="add-new-description">Track a bank account, UPI, wallet, or cash</p>
              <button className="add-new-btn">
                <Link2 size={18} />
                <span>Add Account</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="insights-section-accounts">
        <div className="insights-header-accounts">
          <div className="insights-icon-box">
            <TrendingUp size={24} />
          </div>
          <div>
            <h3 className="insights-title-accounts">Account Insights</h3>
            <p className="insights-subtitle-accounts">Your financial activity overview</p>
          </div>
        </div>

        <div className="insights-grid-accounts">
          <div className="insight-card-accounts blue">
            <div className="insight-icon-wrapper-accounts"><DollarSign size={24} /></div>
            <div className="insight-content-accounts">
              <h4 className="insight-title-text">Average Account Balance</h4>
              <p className="insight-description">Average balance across all your accounts</p>
            </div>
            <div className="insight-value-large">
              ₹{avgBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`insight-badge-accounts ${avgBalance >= 0 ? 'positive' : 'warning'}`}>
              <TrendingUp size={14} />
              {accounts.length} accounts
            </div>
          </div>

          <div className="insight-card-accounts green">
            <div className="insight-icon-wrapper-accounts"><TrendingUp size={24} /></div>
            <div className="insight-content-accounts">
              <h4 className="insight-title-text">Total Credit</h4>
              <p className="insight-description">All credits recorded across accounts</p>
            </div>
            <div className="insight-value-large">
              ₹{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="insight-badge-accounts positive">
              <TrendingUp size={14} />
              {totalTransactions} total transactions
            </div>
          </div>

          <div className="insight-card-accounts purple">
            <div className="insight-icon-wrapper-accounts"><Calendar size={24} /></div>
            <div className="insight-content-accounts">
              <h4 className="insight-title-text">Most Active Account</h4>
              <p className="insight-description">Account with the most transactions</p>
            </div>
            <div className="insight-value-large" style={{ fontSize: '1.25rem' }}>
              {mostActive?.name || 'None yet'}
            </div>
            <div className="insight-badge-accounts neutral">
              <Calendar size={14} />
              {mostActive?.transaction_count || 0} transactions
            </div>
          </div>

          <div className="insight-card-accounts orange">
            <div className="insight-icon-wrapper-accounts"><AlertCircle size={24} /></div>
            <div className="insight-content-accounts">
              <h4 className="insight-title-text">Low Balance Alert</h4>
              <p className="insight-description">Accounts with balance under ₹500</p>
            </div>
            <div className="insight-value-large">
              {lowBalanceAccounts.length > 0
                ? `${lowBalanceAccounts.length} Account${lowBalanceAccounts.length > 1 ? 's' : ''}`
                : 'All Good!'}
            </div>
            <div className={`insight-badge-accounts ${lowBalanceAccounts.length > 0 ? 'warning' : 'positive'}`}>
              <AlertCircle size={14} />
              {lowBalanceAccounts.length > 0
                ? lowBalanceAccounts.map(a => a.name).join(', ')
                : 'No low balance accounts'}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Account Modal */}
      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSubmit={async (data) => {
            await onUpdate(editingAccount.id, data);
            setEditingAccount(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmAccount && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmAccount(null)}>
          <div className="modal-box" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: 'var(--error)' }}>⚠ Delete Account</h2>
              <button className="modal-close" onClick={() => setDeleteConfirmAccount(null)}>×</button>
            </div>
            <div className="modal-body">

              {/* Warning banner */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                padding: '1rem 1.25rem',
                marginBottom: '1.25rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start'
              }}>
                <AlertCircle size={20} style={{ color: 'var(--error)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ color: 'var(--error)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                    This action is permanent and cannot be undone.
                  </p>
                  <p style={{ color: 'var(--dark-grey)', fontSize: '0.875rem', lineHeight: '1.6' }}>
                    Deleting <strong>"{deleteConfirmAccount.name}"</strong> will permanently remove:
                  </p>
                </div>
              </div>

              {/* What gets deleted */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
                {[
                  { icon: '🏦', text: `The account — ${deleteConfirmAccount.name} (${deleteConfirmAccount.bank})` },
                  { icon: '📋', text: `All ${parseInt(deleteConfirmAccount.transaction_count) || 0} transaction${parseInt(deleteConfirmAccount.transaction_count) !== 1 ? 's' : ''} linked to this account` },
                  { icon: '📊', text: 'All credit and debit history for this account' },
                  { icon: '💰', text: `Opening balance of ₹${parseFloat(deleteConfirmAccount.opening_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.875rem',
                    background: 'rgba(0,0,0,0.03)',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: 'var(--dark-grey)'
                  }}>
                    <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>

              <p style={{ color: 'var(--medium-grey)', fontSize: '0.8rem', textAlign: 'center' }}>
                Your other accounts and their transactions will not be affected.
              </p>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDeleteConfirmAccount(null)}>
                Cancel — Keep Account
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--error)' }}
                onClick={confirmDelete}
              >
                Yes, Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onSubmit={(data) => {
            onAdd(data);
            setShowAddModal(false);
          }}
        />
      )}
    </>
  );
};

export default AccountsView;