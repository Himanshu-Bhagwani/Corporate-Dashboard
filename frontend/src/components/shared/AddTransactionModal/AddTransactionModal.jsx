import React, { useState } from 'react';
import './AddTransactionModal.css';
import { useApeilo } from '../../../context/ApeiloContext';

const CORPORATE_INCOME_CATEGORIES = [
  'Sales',
  'Consulting',
  'Shares',
  'Interest',
  'Commissions',
  'Royalties',
  'Misc',
];

const CORPORATE_EXPENSE_CATEGORIES = [
  'Salaries',
  'Marketing',
  'Software',
  'Rent',
  'Tax',
  'Professional Fees',
  'Utilities',
  'Insurance',
  'Travel',
  'Training',
  'Maintenance',
  'Office Supplies',
  'Misc',
];

const AddTransactionModal = ({ onClose, onSubmit, accounts, onGoToAccounts }) => {
  const apeilo = useApeilo();
  const today = new Date().toISOString().slice(0, 10);

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    account_id: '',
    amount: '',
    type: 'expense',
    date: today,
    notes: ''
  });

  const [error, setError] = useState('');

  const categories = formData.type === 'income' ? CORPORATE_INCOME_CATEGORIES : CORPORATE_EXPENSE_CATEGORIES;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Reset category when type changes — the categories are different
      if (name === 'type') {
        updated.category = '';
      }
      return updated;
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return setError('Transaction name is required.');
    if (!formData.category) return setError('Category is required.');
    if (!formData.account_id) return setError('Please select an account.');
    if (!formData.amount || parseFloat(formData.amount) <= 0) return setError('Please enter a valid amount.');
    if (!formData.date) return setError('Please select a date.');

    setError('');
    const amount = parseFloat(formData.amount);
    onSubmit({
      name: formData.name.trim(),
      type: formData.type,
      category: formData.category,
      account_id: parseInt(formData.account_id),
      amount,
      date: formData.date,
      notes: formData.notes.trim() || null,
    });

    // Score this transaction for fraud on Apeilo (fire-and-forget — never blocks
    // or breaks the real transaction submit).
    apeilo.trackTransaction({ amount }).catch(() => {});
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Transaction</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          <div className="form-group">
            <label>Transaction Type</label>
            <div className="radio-group">
              <label className={`radio-option ${formData.type === 'expense' ? 'active' : ''}`}>
                <input type="radio" name="type" value="expense" checked={formData.type === 'expense'} onChange={handleInputChange} />
                <span>Debit</span>
              </label>
              <label className={`radio-option ${formData.type === 'income' ? 'active' : ''}`}>
                <input type="radio" name="type" value="income" checked={formData.type === 'income'} onChange={handleInputChange} />
                <span>Credit</span>
              </label>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Transaction Name</label>
              <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g., Client Payment, Office Rent" />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select name="category" value={formData.category} onChange={handleInputChange}>
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Account</label>
              {accounts.length === 0 ? (
                <div className="no-accounts-message">
                  <span>No accounts yet.</span>
                  <button
                    type="button"
                    className="go-to-accounts-btn"
                    onClick={() => { onClose(); onGoToAccounts(); }}
                  >
                    + Add an Account first
                  </button>
                </div>
              ) : (
                <>
                  <select name="account_id" value={formData.account_id} onChange={handleInputChange}>
                    <option value="">Select Account</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} — {acc.bank}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="add-another-account-btn"
                    onClick={() => { onClose(); onGoToAccounts(); }}
                  >
                    + Add another account
                  </button>
                </>
              )}
            </div>
            <div className="form-group">
              <label>Amount (₹)</label>
              <input type="number" name="amount" value={formData.amount} onChange={handleInputChange} placeholder="0.00" min="0" step="0.01" />
            </div>
          </div>

          <div className="form-group">
            <label>Date</label>
            <input type="date" name="date" value={formData.date} onChange={handleInputChange} />
          </div>

          <div className="form-group">
            <label>Notes (Optional)</label>
            <textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Add any additional notes..." rows="3" />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={accounts.length === 0}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTransactionModal;