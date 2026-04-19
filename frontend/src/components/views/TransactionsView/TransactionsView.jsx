import React, { useState, useEffect, useRef } from 'react';
import './TransactionsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { TrendingUp, TrendingDown, Calendar, Search, PlusCircle, Trash2, Pencil, Check, X, ChevronLeft, ChevronRight, Upload } from 'lucide-react';

const CORPORATE_CATEGORIES = [
  'All Categories',
  'Sales',
  'Consulting',
  'Salaries',
  'Marketing',
  'Software',
  'Rent',
  'Tax',
  'Shares',
  'Professional Fees',
  'Utilities',
  'Insurance',
  'Travel',
  'Training',
  'Maintainance',
  'Office supplies',
  'Misc',
];

const TransactionsView = ({
  transactions,
  stats,
  loading,
  error,
  selectedDate,
  setSelectedDate,
  selectedType,
  setSelectedType,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  setShowAddModal,
  onUpdate,
  onDelete,
  onUploadCSV,
  onUploadPDF,
  navigateTarget,
  accounts = [],
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [uploadErrorMessage, setUploadErrorMessage] = useState('');
  const [expandedTransactions, setExpandedTransactions] = useState(new Set());
  const fileInputRef = useRef(null);

  const toggleExpand = (id) => {
    setExpandedTransactions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Inline Edit Handlers ---
  const startEdit = (transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      name: transaction.name,
      type: transaction.type,
      category: transaction.category,
      account: transaction.account,
      amount: transaction.amount,
      date: transaction.date?.slice(0, 10),
      notes: transaction.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    await onUpdate(editingId, editForm);
    setEditingId(null);
    setEditForm({});
  };

  // --- Calendar Helpers ---
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const transactionDates = new Set(
    transactions.map(t => t.date?.slice(0, 10))
  );

  // Listen for navigation targets from header search and scroll/highlight
  useEffect(() => {
    if (!navigateTarget) return;
    if (navigateTarget.view !== 'transactions') return;

    const id = navigateTarget.id;
    setTimeout(() => {
      const el = document.getElementById(`transaction-row-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlighted');
        setTimeout(() => el.classList.remove('highlighted'), 3000);
      }
    }, 250);
  }, [navigateTarget]);

  const handleDateClick = (dateStr) => {
    if (selectedDate === dateStr) {
      setSelectedDate(null);
    } else {
      setSelectedDate(dateStr);
    }
    setShowCalendar(false);
  };

  const formatCalendarDate = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const prevMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const filteredTransactions = transactions.filter(t =>
    t.name?.toLowerCase().includes(localSearch.toLowerCase()) ||
    t.category?.toLowerCase().includes(localSearch.toLowerCase()) ||
    t.account?.toLowerCase().includes(localSearch.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [localSearch, transactions]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const displayedTransactions = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);

  // --- CSV Upload ---
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setUploadErrorMessage('File size exceeds 20MB limit.');
        setUploadStatus('error');
        setUploadFile(null);
        return;
      }
      setUploadFile(file);
      setUploadStatus('');
      setUploadErrorMessage('');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadStatus('');
    setUploadErrorMessage('');
    try {
      if (uploadFile.name.toLowerCase().endsWith('.pdf')) {
        await onUploadPDF(uploadFile);
      } else {
        await onUploadCSV(uploadFile);
      }
      setUploadStatus('success');
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setShowUploadModal(false), 1500);
    } catch (err) {
      setUploadStatus('error');
      setUploadErrorMessage(err.message || 'An unexpected error occurred.');
    } finally {
      setUploading(false);
    }
  };



  // Debounce server search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (setSearchQuery) setSearchQuery(localSearch);
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // --- Render Calendar ---
  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatCalendarDate(year, month, d);
      const hasTransactions = transactionDates.has(dateStr);
      const isSelected = selectedDate === dateStr;
      const isToday = dateStr === new Date().toISOString().slice(0, 10);

      days.push(
        <div
          key={d}
          className={`calendar-day ${hasTransactions ? 'has-transactions' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
          onClick={() => handleDateClick(dateStr)}
        >
          {d}
          {hasTransactions && <span className="calendar-dot" />}
        </div>
      );
    }

    return days;
  };

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header">
        <div>
          <h1 className="view-title">Transactions</h1>
          <p className="view-subtitle">Track and manage your corporate debits and credits</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn-primary btn-add-short"
            onClick={() => setShowUploadModal(true)}
            style={{
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Upload size={16} />
            Upload Statement
          </button>
          <button className="btn-primary btn-add-short" onClick={() => setShowAddModal(true)}>
            <PlusCircle size={18} />
            Add
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid-3">
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small green"><TrendingUp size={18} /></div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Total Credit</div>
            <div className="stat-value-simple green">₹{stats.totalIncome.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small red"><TrendingDown size={18} /></div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Total Debits</div>
            <div className="stat-value-simple red">₹{stats.totalExpenses.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small blue"><Calendar size={18} /></div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Net Total</div>
            <div className={`stat-value-simple ${stats.netTotal >= 0 ? 'green' : 'red'}`}>
              ₹{stats.netTotal.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Toggle Button */}
      <div className="calendar-section">
        <button className="calendar-toggle-btn" onClick={() => setShowCalendar(!showCalendar)}>
          <Calendar size={18} />
          {selectedDate ? `Showing: ${selectedDate}` : 'Filter by Date'}
          {selectedDate && (
            <span className="clear-date" onClick={(e) => { e.stopPropagation(); setSelectedDate(null); }}>
              <X size={14} />
            </span>
          )}
        </button>

        {showCalendar && (
          <div className="calendar-container">
            <div className="calendar-header">
              <button className="cal-nav-btn" onClick={prevMonth}><ChevronLeft size={18} /></button>
              <span className="calendar-month-title">{monthName}</span>
              <button className="cal-nav-btn" onClick={nextMonth}><ChevronRight size={18} /></button>
            </div>
            <div className="calendar-weekdays">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="calendar-weekday">{d}</div>
              ))}
            </div>
            <div className="calendar-grid">
              {renderCalendar()}
            </div>
          </div>
        )}
      </div>

      {/* Advanced Filters Bar */}
      <div className="filters-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search transactions..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="income">Credit</option>
          <option value="expense">Debit</option>
        </select>
        <select
          className="filter-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          {CORPORATE_CATEGORIES.map(cat => (
            <option key={cat} value={cat === 'All Categories' ? 'all' : cat}>{cat}</option>
          ))}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="date"
            className="filter-select"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ minWidth: 'auto' }}
          />
          <span style={{ color: '#718096', fontSize: '13px' }}>to</span>
          <input
            type="date"
            className="filter-select"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ minWidth: 'auto' }}
          />
        </div>
        <div className="transaction-count">{filteredTransactions.length} transactions</div>
      </div>

      {/* Loading / Error States */}
      {loading && <div className="state-message">Loading transactions...</div>}
      {error && <div className="state-message error">{error}</div>}

      {/* Transactions Table */}
      {!loading && !error && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>TRANSACTION</th>
                <th>CATEGORY</th>
                <th>ACCOUNT</th>
                <th>DATE</th>
                <th className="align-right">AMOUNT</th>
                <th className="align-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayedTransactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-table-message">
                    No transactions found. Add one to get started!
                  </td>
                </tr>
              ) : (
                displayedTransactions.map(transaction => (
                  <tr key={transaction.id} id={`transaction-row-${transaction.id}`}>
                    {editingId === transaction.id ? (
                      <>
                        <td>
                          <select
                            className="inline-select"
                            value={editForm.type}
                            onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                          >
                            <option value="income">Credit</option>
                            <option value="expense">Debit</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className="inline-input"
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            placeholder="Name"
                          />
                        </td>
                        <td>
                          <select
                            className="inline-select"
                            value={editForm.category}
                            onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                          >
                            {CORPORATE_CATEGORIES.filter(c => c !== 'All Categories').map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="inline-input"
                            value={editForm.account}
                            onChange={e => setEditForm({ ...editForm, account: e.target.value })}
                            placeholder="Account"
                          />
                        </td>
                        <td>
                          <input
                            className="inline-input"
                            type="date"
                            value={editForm.date}
                            onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                          />
                        </td>
                        <td className="align-right">
                          <input
                            className="inline-input align-right"
                            type="number"
                            value={editForm.amount}
                            onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                            placeholder="Amount"
                          />
                        </td>
                        <td className="align-right">
                          <div className="action-buttons">
                            <button className="action-btn save" onClick={saveEdit}><Check size={16} /></button>
                            <button className="action-btn cancel" onClick={cancelEdit}><X size={16} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div className="table-cell-with-icon">
                            <div className={`table-icon ${transaction.type === 'income' ? 'green' : 'red'}`}>
                              {transaction.type === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            </div>
                            <span className="table-main-text" style={{ maxWidth: expandedTransactions.has(transaction.id) ? '400px' : 'auto', display: 'block', lineHeight: '1.4' }}>
                              {transaction.name?.length > 40 ? (
                                <>
                                  <span 
                                    className="expandable-name-text" 
                                    onClick={() => toggleExpand(transaction.id)}
                                    style={{ cursor: 'pointer', color: '#1a202c' }}
                                  >
                                    {expandedTransactions.has(transaction.id) 
                                      ? transaction.name 
                                      : `${transaction.name.slice(0, 40)}...`}
                                  </span>
                                  <span 
                                    className="expand-toggle-btn"
                                    onClick={() => toggleExpand(transaction.id)}
                                    style={{ color: '#3b82f6', cursor: 'pointer', fontSize: '13px', marginLeft: '6px', fontWeight: 600 }}
                                  >
                                    {expandedTransactions.has(transaction.id) ? 'Collapse' : 'Expand'}
                                  </span>
                                </>
                              ) : (
                                transaction.name
                              )}
                            </span>
                          </div>
                        </td>
                        <td><span className="table-secondary-text">{transaction.category}</span></td>
                        <td><span className="table-secondary-text">{transaction.account}</span></td>
                        <td><span className="table-secondary-text">{transaction.date?.slice(0, 10)}</span></td>
                        <td className="align-right">
                          <span className={`table-amount ${transaction.type === 'income' ? 'positive' : 'negative'}`}>
                            {transaction.type === 'income' ? '+' : '-'}₹{parseFloat(transaction.amount).toLocaleString()}
                          </span>
                        </td>
                        <td className="align-right">
                          <div className="action-buttons">
                            <button className="action-btn edit" onClick={() => startEdit(transaction)}><Pencil size={16} /></button>
                            <button className="action-btn delete" onClick={() => onDelete(transaction.id)}><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', marginBottom: '2.5rem' }}>
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
            style={{ 
              background: 'white', border: '1px solid #e2e8f0', color: currentPage === 1 ? '#cbd5e1' : '#4a5568', 
              padding: '0.5rem 1rem', borderRadius: '8px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s ease'
            }}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span style={{ fontSize: '14px', color: '#4a5568', fontWeight: 500 }}>
            Page {currentPage} of {totalPages}
          </span>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
            style={{ 
              background: 'white', border: '1px solid #e2e8f0', color: currentPage === totalPages ? '#cbd5e1' : '#4a5568', 
              padding: '0.5rem 1rem', borderRadius: '8px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s ease'
            }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Statement Upload Modal (CSV & PDF) */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{
            background: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '560px', width: '90%',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1a202c' }}>Upload Statement</h2>
              <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#718096' }}>×</button>
            </div>

            <div style={{
              background: '#f7fafc', border: '2px dashed #e2e8f0', borderRadius: '12px',
              padding: '2rem', textAlign: 'center', marginBottom: '1.5rem',
              transition: 'all 0.3s ease', cursor: 'pointer'
            }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#4F46E5'; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#e2e8f0';
                const file = e.dataTransfer.files?.[0];
                if (file) { setUploadFile(file); setUploadStatus(''); }
              }}
            >
              <Upload size={32} style={{ color: '#a0aec0', marginBottom: '0.75rem' }} />
              <p style={{ color: '#4a5568', fontWeight: 600, marginBottom: '0.25rem' }}>
                {uploadFile ? uploadFile.name : 'Drop CSV or PDF file here or click to browse'}
              </p>
              <p style={{ color: '#a0aec0', fontSize: '13px' }}>Supports: Standard .csv and most bank PDFs</p>
              <input
                ref={fileInputRef}
                type="file" accept=".csv,.pdf" style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                background: 'rgba(79,70,229,0.05)', borderRadius: '10px', padding: '1rem',
                fontSize: '12px', color: '#4a5568', lineHeight: 1.6
              }}>
                <strong style={{ color: '#4F46E5' }}>CSV Template:</strong>
                <div style={{ marginTop: '0.25rem', fontFamily: 'monospace', color: '#718096' }}>
                  date, name, amount, type
                </div>
              </div>
              <div style={{
                background: 'rgba(16,185,129,0.05)', borderRadius: '10px', padding: '1rem',
                fontSize: '12px', color: '#4a5568', lineHeight: 1.6
              }}>
                <strong style={{ color: '#10b981' }}>PDF (Layout Aware):</strong>
                <div style={{ marginTop: '0.25rem', color: '#718096' }}>
                  Deterministic coordinate-based parsing. 100% accurate.
                </div>
              </div>
            </div>

            {uploadStatus === 'success' && (
              <div style={{ padding: '12px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', color: '#10b981', fontWeight: 600, textAlign: 'center', marginBottom: '1rem' }}>
                ✓ Transactions imported successfully!
              </div>
            )}
            {uploadStatus === 'error' && (
              <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '10px', color: '#ef4444', fontWeight: 600, textAlign: 'center', marginBottom: '1rem' }}>
                ✗ {uploadErrorMessage || (uploadFile?.name?.endsWith('.pdf') ? 'Parsing Error: Layout ambiguity detected.' : 'Failed to import CSV.')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUploadModal(false)} style={{
                padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white',
                color: '#4a5568', fontSize: '14px', fontWeight: 600, cursor: 'pointer'
              }}>Cancel</button>
              <button onClick={handleUpload} disabled={!uploadFile || uploading} style={{
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: uploadFile && !uploading ? 'linear-gradient(135deg, #10B981, #059669)' : '#e2e8f0',
                color: uploadFile && !uploading ? 'white' : '#a0aec0',
                fontSize: '14px', fontWeight: 600, cursor: uploadFile && !uploading ? 'pointer' : 'not-allowed',
                boxShadow: uploadFile ? '0 2px 8px rgba(16,185,129,0.3)' : 'none'
              }}>
                {uploading ? (uploadFile?.name?.endsWith('.pdf') ? 'Reconstructing Layout...' : 'Uploading...') : 'Upload & Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TransactionsView;