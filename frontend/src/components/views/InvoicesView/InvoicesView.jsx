import React, { useState, useMemo } from 'react';
import './InvoicesView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { FileText, PlusCircle, Eye, Pencil, ArrowUpDown, X, DollarSign, CheckCircle, Clock, AlertTriangle, Upload, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

const InvoicesView = ({
  invoices,
  loading,
  onCreateInvoice,
  onUpdateInvoice,
  setActiveView,
  onParseOCR,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [sortField, setSortField] = useState('due_date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterType, setFilterType] = useState('all');

  const filteredInvoices = useMemo(() => {
    if (filterType === 'all') return invoices;
    return invoices.filter(i => (i.type || 'receivable') === filterType);
  }, [invoices, filterType]);

  // --- Stats ---
  const stats = useMemo(() => {
    const total = filteredInvoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const paid = filteredInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const pending = filteredInvoices.filter(i => i.status === 'pending').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const overdue = filteredInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    return { total, paid, pending, overdue };
  }, [filteredInvoices]);

  // --- Sorting: paid invoices always at bottom ---
  const sortedInvoices = useMemo(() => {
    const copy = [...filteredInvoices];
    copy.sort((a, b) => {
      if (a.status === 'paid' && b.status !== 'paid') return 1;
      if (a.status !== 'paid' && b.status === 'paid') return -1;

      let valA, valB;
      if (sortField === 'amount') {
        valA = parseFloat(a.amount);
        valB = parseFloat(b.amount);
      } else if (sortField === 'invoice_number') {
        valA = a.invoice_number;
        valB = b.invoice_number;
      } else if (sortField === 'client_name') {
        valA = (a.client_name || '').toLowerCase();
        valB = (b.client_name || '').toLowerCase();
      } else if (sortField === 'issue_date') {
        valA = a.issue_date || '';
        valB = b.issue_date || '';
      } else {
        valA = a.due_date || '';
        valB = b.due_date || '';
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [invoices, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]} ${y}`;
  };

  const formatAmount = (amt) => {
    return '₹' + parseFloat(amt).toLocaleString('en-IN');
  };

  const statusBadge = (status) => {
    const cls = status === 'paid' ? 'badge-paid' :
                status === 'pending' ? 'badge-pending' :
                'badge-overdue';
    return <span className={`invoice-status-badge ${cls}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
  };

  // --- Create Invoice Modal ---
  const CreateInvoiceModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    const [form, setForm] = useState({
      client_name: '',
      amount: '',
      issue_date: today,
      due_date: '',
      notes: '',
      type: 'receivable',
    });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState('');

    const handleFileScan = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return setScanError('Please upload a valid image file (JPG, PNG).');
      
      setIsScanning(true);
      setScanError('');
      try {
        const extracted = await onParseOCR(file);
        setForm(prev => ({
          ...prev,
          client_name: extracted.payee || prev.client_name,
          amount: extracted.amount || prev.amount,
          issue_date: extracted.date || prev.issue_date,
          notes: extracted.description || prev.notes,
        }));
      } catch (err) {
        setScanError('Failed to parse invoice. Ensure Ollama is running.');
      } finally {
        setIsScanning(false);
      }
    };

    const handleSubmit = async () => {
      if (!form.client_name.trim()) return setError('Client Name is required.');
      if (!form.amount || parseFloat(form.amount) <= 0) return setError('Valid amount is required.');
      if (!form.issue_date) return setError('Issue date is required.');
      if (!form.due_date) return setError('Due date is required.');

      setSubmitting(true);
      setError('');
      try {
        await onCreateInvoice({
          client_name: form.client_name.trim(),
          amount: parseFloat(form.amount),
          issue_date: form.issue_date,
          due_date: form.due_date,
          notes: form.notes.trim() || null,
          type: form.type,
        });
        setShowCreateModal(false);
      } catch (err) {
        setError('Failed to create invoice.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
        <div className="invoice-modal" onClick={e => e.stopPropagation()}>
          <div className="invoice-modal-header">
            <h2>Create New Invoice</h2>
            <button className="invoice-modal-close" onClick={() => setShowCreateModal(false)}><X size={20} /></button>
          </div>
          <div className="invoice-modal-body">
            {scanError && <div className="invoice-modal-error">{scanError}</div>}
            {error && <div className="invoice-modal-error">{error}</div>}
            
            <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'linear-gradient(to right, #f8fafc, #ffffff)', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: isScanning ? 'not-allowed' : 'pointer', opacity: isScanning ? 0.6 : 1 }}>
                <Upload size={24} color="#6366f1" />
                <span style={{ fontWeight: 600, color: '#334155' }}>
                  {isScanning ? '🤖 AI is analyzing your receipt...' : '🪄 Auto-fill with AI (Upload Image)'}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Supports Image Receipts (JPG, PNG)</span>
                <input type="file" accept="image/*" onChange={handleFileScan} style={{ display: 'none' }} disabled={isScanning} />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>
                <input
                  type="radio"
                  name="modal_invoice_type"
                  checked={form.type === 'receivable'}
                  onChange={() => setForm(p => ({ ...p, type: 'receivable' }))}
                /> Receivable
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>
                <input
                  type="radio"
                  name="modal_invoice_type"
                  checked={form.type === 'payable'}
                  onChange={() => setForm(p => ({ ...p, type: 'payable' }))}
                /> Payable
              </label>
            </div>

            <div className="invoice-form-group">
              <label>{form.type === 'payable' ? 'Vendor Name' : 'Client Name'} <span className="req">*</span></label>
              <input type="text" value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} placeholder={form.type === 'payable' ? 'Enter vendor name' : 'Enter client name'} />
            </div>
            <div className="invoice-form-group">
              <label>Amount (₹) <span className="req">*</span></label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" min="0" step="0.01" />
            </div>
            <div className="invoice-form-group">
              <label>Issue Date <span className="req">*</span></label>
              <input type="date" value={form.issue_date} onChange={e => setForm({...form, issue_date: e.target.value})} />
            </div>
            <div className="invoice-form-group">
              <label>Due Date <span className="req">*</span></label>
              <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
            </div>
            <div className="invoice-form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Add notes or description..." rows="3" />
            </div>
          </div>
          <div className="invoice-modal-footer">
            <button className="btn-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn-create" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- Edit Invoice Modal ---
  const EditInvoiceModal = () => {
    const inv = selectedInvoice;
    const [form, setForm] = useState({
      client_name: inv?.client_name || '',
      amount: inv?.amount || '',
      issue_date: inv?.issue_date || '',
      due_date: inv?.due_date || '',
      notes: inv?.notes || '',
      status: inv?.status || 'pending',
      type: inv?.type || 'receivable',
    });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
      if (!form.client_name.trim()) return setError('Client Name is required.');
      if (!form.amount || parseFloat(form.amount) <= 0) return setError('Valid amount is required.');
      if (!form.issue_date) return setError('Issue date is required.');
      if (!form.due_date) return setError('Due date is required.');

      setSubmitting(true);
      setError('');
      try {
        await onUpdateInvoice(inv.id, {
          client_name: form.client_name.trim(),
          amount: parseFloat(form.amount),
          issue_date: form.issue_date,
          due_date: form.due_date,
          notes: form.notes.trim() || null,
          status: form.status,
          type: form.type,
        });
        setShowEditModal(false);
        setSelectedInvoice(null);
      } catch (err) {
        setError('Failed to update invoice.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="modal-overlay" onClick={() => { setShowEditModal(false); setSelectedInvoice(null); }}>
        <div className="invoice-modal" onClick={e => e.stopPropagation()}>
          <div className="invoice-modal-header">
            <h2>Edit Invoice</h2>
            <button className="invoice-modal-close" onClick={() => { setShowEditModal(false); setSelectedInvoice(null); }}><X size={20} /></button>
          </div>
          <div className="invoice-modal-body">
            {error && <div className="invoice-modal-error">{error}</div>}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>
                <input
                  type="radio"
                  name="edit_invoice_type"
                  checked={form.type === 'receivable'}
                  onChange={() => setForm(p => ({ ...p, type: 'receivable' }))}
                /> Receivable
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>
                <input
                  type="radio"
                  name="edit_invoice_type"
                  checked={form.type === 'payable'}
                  onChange={() => setForm(p => ({ ...p, type: 'payable' }))}
                /> Payable
              </label>
            </div>
            <div className="invoice-form-group">
              <label>{form.type === 'payable' ? 'Vendor Name' : 'Client Name'} <span className="req">*</span></label>
              <input type="text" value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} />
            </div>
            <div className="invoice-form-group">
              <label>Amount (₹) <span className="req">*</span></label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} min="0" step="0.01" />
            </div>
            <div className="invoice-form-group">
              <label>Issue Date <span className="req">*</span></label>
              <input type="date" value={form.issue_date} onChange={e => setForm({...form, issue_date: e.target.value})} />
            </div>
            <div className="invoice-form-group">
              <label>Due Date <span className="req">*</span></label>
              <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
            </div>
            <div className="invoice-form-group">
              <label>Status</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div className="invoice-form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Add notes or description..." rows="3" />
            </div>
          </div>
          <div className="invoice-modal-footer">
            <button className="btn-cancel" onClick={() => { setShowEditModal(false); setSelectedInvoice(null); }}>Cancel</button>
            <button className="btn-create" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Updating...' : 'Update Invoice'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- View Invoice Modal ---
  const ViewInvoiceModal = () => {
    const inv = selectedInvoice;
    return (
      <div className="modal-overlay" onClick={() => { setShowViewModal(false); setSelectedInvoice(null); }}>
        <div className="invoice-modal" onClick={e => e.stopPropagation()}>
          <div className="invoice-modal-header">
            <h2>Invoice Details — {inv?.invoice_number}</h2>
            <button className="invoice-modal-close" onClick={() => { setShowViewModal(false); setSelectedInvoice(null); }}><X size={20} /></button>
          </div>
          <div className="invoice-modal-body">
            <div className="invoice-detail-row">
              <span className="detail-label">Client / Vendor</span>
              <span className="detail-value">{inv?.client_name || inv?.vendor_name}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="detail-label">Type</span>
              <span className="detail-value" style={{textTransform: 'capitalize'}}>{inv?.type || 'receivable'}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="detail-label">Amount</span>
              <span className="detail-value">{formatAmount(inv?.amount)}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="detail-label">Issue Date</span>
              <span className="detail-value">{formatDate(inv?.issue_date)}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="detail-label">Due Date</span>
              <span className="detail-value">{formatDate(inv?.due_date)}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">{statusBadge(inv?.status)}</span>
            </div>
            {inv?.notes && (
              <div className="invoice-detail-row">
                <span className="detail-label">Notes</span>
                <span className="detail-value">{inv.notes}</span>
              </div>
            )}
          </div>
          <div className="invoice-modal-footer">
            <button className="btn-cancel" onClick={() => { setShowViewModal(false); setSelectedInvoice(null); }}>Close</button>
            <button className="btn-create" onClick={() => {
              setShowViewModal(false);
              setShowEditModal(true);
            }}>Edit Invoice</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header">
        <div>
          <h1 className="view-title">Invoices</h1>
          <p className="view-subtitle">Create and manage client invoices</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
            {['all', 'receivable', 'payable'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  background: filterType === t ? 'white' : 'transparent',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: filterType === t ? '#4F46E5' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: filterType === t ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s'
                }}
              >
                {t === 'all' ? 'All Invoices' : t + 's'}
              </button>
            ))}
          </div>
          <button className="btn-primary btn-add-short" onClick={() => setShowCreateModal(true)}>
            <PlusCircle size={18} />
            Create Invoice
          </button>
        </div>
      </div>

      {/* Stats Cards — same design as Transactions stats */}
      <div className="stats-grid-4">
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small blue"><DollarSign size={18} /></div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Total Invoiced</div>
            <div className="stat-value-simple">{formatAmount(stats.total)}</div>
          </div>
        </div>
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small green"><CheckCircle size={18} /></div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Paid</div>
            <div className="stat-value-simple green">{formatAmount(stats.paid)}</div>
          </div>
        </div>
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small orange"><Clock size={18} /></div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Pending</div>
            <div className="stat-value-simple orange">{formatAmount(stats.pending)}</div>
          </div>
        </div>
        <div className="stat-card-simple">
          <div className="stat-icon-wrapper-small red"><AlertTriangle size={18} /></div>
          <div className="stat-content-simple">
            <div className="stat-label-simple">Overdue</div>
            <div className="stat-value-simple red">{formatAmount(stats.overdue)}</div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && <div className="state-message">Loading invoices...</div>}

      {/* Invoices Table */}
      {!loading && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('invoice_number')} style={{ cursor: 'pointer' }}>
                  INVOICE # <ArrowUpDown size={12} style={{ verticalAlign: 'middle', marginLeft: 4, opacity: 0.5 }} />
                </th>
                <th onClick={() => toggleSort('client_name')} style={{ cursor: 'pointer' }}>
                  CLIENT / VENDOR <ArrowUpDown size={12} style={{ verticalAlign: 'middle', marginLeft: 4, opacity: 0.5 }} />
                </th>
                <th>TYPE</th>
                <th onClick={() => toggleSort('amount')} style={{ cursor: 'pointer' }}>
                  AMOUNT <ArrowUpDown size={12} style={{ verticalAlign: 'middle', marginLeft: 4, opacity: 0.5 }} />
                </th>
                <th onClick={() => toggleSort('issue_date')} style={{ cursor: 'pointer' }}>
                  ISSUE DATE <ArrowUpDown size={12} style={{ verticalAlign: 'middle', marginLeft: 4, opacity: 0.5 }} />
                </th>
                <th onClick={() => toggleSort('due_date')} style={{ cursor: 'pointer' }}>
                  DUE DATE <ArrowUpDown size={12} style={{ verticalAlign: 'middle', marginLeft: 4, opacity: 0.5 }} />
                </th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-table-message">
                    No invoices found. Create one to get started!
                  </td>
                </tr>
              ) : (
                sortedInvoices.map(invoice => (
                  <tr key={invoice.id} className={invoice.status === 'paid' ? 'row-paid' : ''}>
                    <td><span className="table-main-text" style={{ fontWeight: 600 }}>{invoice.invoice_number}</span></td>
                    <td><span className="table-secondary-text" style={{ color: '#4F46E5', fontWeight: 500 }}>{invoice.client_name || invoice.vendor_name || '-'}</span></td>
                    <td>
                      {invoice.type === 'payable' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#EF4444', fontWeight: 500, fontSize: '13px', textTransform: 'capitalize' }}>
                          <ArrowUpRight size={14} /> {invoice.type}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10B981', fontWeight: 500, fontSize: '13px', textTransform: 'capitalize' }}>
                          <ArrowDownLeft size={14} /> {invoice.type || 'receivable'}
                        </div>
                      )}
                    </td>
                    <td><span className="table-main-text" style={{ fontWeight: 600 }}>{formatAmount(invoice.amount)}</span></td>
                    <td><span className="table-secondary-text">{formatDate(invoice.issue_date)}</span></td>
                    <td><span className="table-secondary-text">{formatDate(invoice.due_date)}</span></td>
                    <td>{statusBadge(invoice.status)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="action-btn edit"
                          title="View"
                          onClick={() => { setSelectedInvoice(invoice); setShowViewModal(true); }}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="action-btn edit"
                          title="Edit"
                          onClick={() => { setSelectedInvoice(invoice); setShowEditModal(true); }}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="invoice-table-footer">
            Showing {sortedInvoices.length} invoice{sortedInvoices.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {showCreateModal && <CreateInvoiceModal />}
      {showEditModal && selectedInvoice && <EditInvoiceModal />}
      {showViewModal && selectedInvoice && <ViewInvoiceModal />}
    </>
  );
};

export default InvoicesView;
