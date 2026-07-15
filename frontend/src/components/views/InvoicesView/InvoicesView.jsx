import React, { useState, useMemo, useEffect } from 'react';
import './InvoicesView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { FileText, PlusCircle, Eye, Pencil, ArrowUpDown, X, DollarSign, CheckCircle, Clock, AlertTriangle, Upload, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { invoicesAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const InvoicesView = ({
  invoices,
  loading,
  onCreateInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onClearAllInvoices,
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
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { currentCompany } = useAuth();

  const filteredInvoices = useMemo(() => {
    let result = invoices;
    if (filterType !== 'all') {
      result = result.filter(i => (i.type || 'receivable').toLowerCase() === filterType);
    }
    if (fromDate) {
      result = result.filter(i => new Date(i.issue_date) >= new Date(fromDate));
    }
    if (toDate) {
      result = result.filter(i => new Date(i.issue_date) <= new Date(toDate));
    }
    return result;
  }, [invoices, filterType, fromDate, toDate]);

  const [trendWindow, setTrendWindow] = useState('30D');
  const [baseMeasure, setBaseMeasure] = useState('invoice_amount');
  const [volumeData, setVolumeData] = useState(null);
  const [volumeLoading, setVolumeLoading] = useState(false);

  useEffect(() => {
    const fetchTrend = async () => {
      if (!currentCompany?.id) return;
      setVolumeLoading(true);
      try {
        const res = await invoicesAPI.getVolumeTrend({
          trend_window_size: trendWindow,
          base_measure: baseMeasure
        }, currentCompany.id);
        setVolumeData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setVolumeLoading(false);
      }
    };
    fetchTrend();
  }, [trendWindow, baseMeasure, currentCompany?.id]);

  // --- Stats ---
  const stats = useMemo(() => {
    const receivables = filteredInvoices.filter(i => (i.type || 'receivable').toLowerCase() === 'receivable');
    const payables = filteredInvoices.filter(i => (i.type || '').toLowerCase() === 'payable');

    const recTotal = receivables.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const recOverdue = receivables.filter(i => (i.status || '').toLowerCase() === 'overdue').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const recPendingCount = receivables.filter(i => (i.status || '').toLowerCase() === 'pending').length;

    const payTotal = payables.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const payUpcoming = payables.filter(i => (i.status || '').toLowerCase() === 'pending').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const payPendingCount = payables.filter(i => (i.status || '').toLowerCase() === 'pending').length;

    const healthPaid = filteredInvoices.filter(i => (i.status || '').toLowerCase() === 'paid').length;
    const healthPending = filteredInvoices.filter(i => (i.status || '').toLowerCase() === 'pending').length;
    const healthFailed = filteredInvoices.filter(i => (i.status || '').toLowerCase() === 'overdue' || (i.status || '').toLowerCase() === 'failed').length;

    const recCollected = receivables.filter(i => (i.status || '').toLowerCase() === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const collectionRate = recTotal > 0 ? (recCollected / recTotal) * 100 : 0;
    const recPaidCount = receivables.filter(i => (i.status || '').toLowerCase() === 'paid').length;

    return { 
      recTotal, recOverdue, recPendingCount,
      payTotal, payUpcoming, payPendingCount,
      healthPaid, healthPending, healthFailed,
      recCollected, collectionRate, recPaidCount
    };
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
            <div className="invoice-detail-row">
              <span className="detail-label">IRN (Simulated — IRP integration pending)</span>
              <span className="detail-value" style={{ fontSize: '11px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {inv?.irn_number || 'Not Generated'}
              </span>
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

      {/* Stats Cards */}
      <div className="stats-grid-4">
        {/* Receivables */}
        <div className="stat-card-simple" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', alignItems: 'stretch', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.01) 0%, rgba(16, 185, 129, 0.04) 100%)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>Receivables</span>
            <div className="stat-icon-wrapper-small green" style={{ width: '28px', height: '28px' }}><DollarSign size={14} /></div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>{formatAmount(stats.recTotal)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#475569', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Overdue</span><span style={{ color: '#ef4444', fontWeight: 500 }}>{formatAmount(stats.recOverdue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pending</span><span style={{ color: '#f59e0b', fontWeight: 500 }}>{stats.recPendingCount} invoices</span>
            </div>
          </div>
        </div>

        {/* Payables */}
        <div className="stat-card-simple" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', alignItems: 'stretch', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.01) 0%, rgba(59, 130, 246, 0.04) 100%)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>Payables</span>
            <div className="stat-icon-wrapper-small blue" style={{ width: '28px', height: '28px' }}><DollarSign size={14} /></div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>{formatAmount(stats.payTotal)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#475569', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Upcoming</span><span style={{ color: '#1e293b', fontWeight: 500 }}>{formatAmount(stats.payUpcoming)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pending</span><span style={{ color: '#f59e0b', fontWeight: 500 }}>{stats.payPendingCount} Bills</span>
            </div>
          </div>
        </div>

        {/* Invoice Health */}
        <div className="stat-card-simple" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', alignItems: 'stretch', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.01) 0%, rgba(139, 92, 246, 0.04) 100%)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>Invoice Health</span>
            <div className="stat-icon-wrapper-small" style={{ width: '28px', height: '28px', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}><CheckCircle size={14} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#475569', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span> Paid</div>
              <span style={{ color: '#1e293b', fontWeight: 600 }}>{stats.healthPaid}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }}></span> Pending</div>
              <span style={{ color: '#1e293b', fontWeight: 600 }}>{stats.healthPending}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span> Failed</div>
              <span style={{ color: '#1e293b', fontWeight: 600 }}>{stats.healthFailed}</span>
            </div>
          </div>
        </div>

        {/* Collections */}
        <div className="stat-card-simple" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', alignItems: 'stretch', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.01) 0%, rgba(6, 182, 212, 0.04) 100%)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>Collections</span>
            <div className="stat-icon-wrapper-small" style={{ width: '28px', height: '28px', background: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4' }}><AlertTriangle size={14} /></div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>{formatAmount(stats.recCollected)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#475569', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Collection Rate</span><span style={{ color: '#10b981', fontWeight: 500 }}>{stats.collectionRate.toFixed(0)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Paid Invoices</span><span style={{ color: '#10b981', fontWeight: 500 }}>↗ {stats.recPaidCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Volume Trend Block */}
      {!loading && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Volume Trend</h3>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Last {trendWindow.replace('D', ' Days')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={trendWindow} onChange={e => setTrendWindow(e.target.value)} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', outline: 'none' }}>
                <option value="7D">7D</option>
                <option value="30D">30D</option>
                <option value="90D">90D</option>
                <option value="MTD">MTD</option>
                <option value="QTD">QTD</option>
                <option value="YTD">YTD</option>
              </select>
              <select value={baseMeasure} onChange={e => setBaseMeasure(e.target.value)} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', outline: 'none' }}>
                <option value="invoice_amount">Amount</option>
                <option value="invoice_count">Count</option>
              </select>
            </div>
          </div>
          
          {volumeLoading ? (
             <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading analytics...</div>
          ) : volumeData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Current Period</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
                    {baseMeasure === 'invoice_count' ? volumeData.summary.current_total : formatAmount(volumeData.summary.current_total)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{volumeData.summary.current_count} invoices</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Previous Period</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
                    {baseMeasure === 'invoice_count' ? volumeData.summary.previous_total : formatAmount(volumeData.summary.previous_total)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Period Change</div>
                  <div style={{ fontSize: '14px', color: volumeData.summary.pct_change > 0 ? '#10b981' : volumeData.summary.pct_change < 0 ? '#ef4444' : '#64748b', fontWeight: 500 }}>
                    {volumeData.summary.pct_change !== null ? `${volumeData.summary.pct_change > 0 ? '+' : ''}${volumeData.summary.pct_change}%` : '--'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>vs previous {trendWindow}</div>
                </div>
              </div>
              
              {/* Stacked Bar visualization */}
              <div style={{ height: '140px', display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '1rem 0 0', marginTop: '1rem', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
                {(() => {
                  const maxVal = Math.max(...volumeData.series.map(s => baseMeasure === 'invoice_count' ? s.raw_count : s.raw_amount), 1);
                  return volumeData.series.map((s, idx) => {
                    const rVal = baseMeasure === 'invoice_count' ? s.receivable > 0 ? s.raw_count : 0 : s.receivable;
                    const pVal = baseMeasure === 'invoice_count' ? s.payable > 0 ? s.raw_count : 0 : s.payable;
                    return (
                      <div key={idx} className="volume-trend-bar" title={`Period: ${s.period}\nReceivable: ${formatAmount(rVal)}\nPayable: ${formatAmount(pVal)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', gap: '2px', position: 'relative' }}>
                        {pVal > 0 && <div style={{ width: '100%', background: '#f97316', height: `${(pVal / maxVal) * 100}%`, borderRadius: rVal > 0 ? '4px 4px 0 0' : '4px' }}></div>}
                        {rVal > 0 && <div style={{ width: '100%', background: '#10b981', height: `${(rVal / maxVal) * 100}%`, borderRadius: pVal > 0 ? '0 0 4px 4px' : '4px' }}></div>}
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && <div className="state-message">Loading invoices...</div>}

      {/* Invoices Table */}
      {!loading && (
        <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>From</span>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#334155', background: '#f8fafc', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>To</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#334155', background: '#f8fafc', outline: 'none' }} />
            </div>
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(''); setToDate(''); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <X size={14} /> Clear
              </button>
            )}
          </div>
          <button className="btn-secondary" style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }} onClick={onClearAllInvoices}>
            <X size={16} /> Clear All
          </button>
        </div>
        
        <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('invoice_number')} style={{ cursor: 'pointer' }}>
                  INVOICE # <ArrowUpDown size={12} style={{ verticalAlign: 'middle', marginLeft: 4, opacity: 0.5 }} />
                </th>
                <th>e-Invoice (IRN)</th>
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
                    <td>
                      {invoice.irn_number ? (
                        <span style={{ fontSize: '12px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                          {invoice.irn_number.substring(0, 10)}...
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>Exempt</span>
                      )}
                    </td>
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
                        <button className="action-btn view-btn" title="View" onClick={() => { setSelectedInvoice(invoice); setShowViewModal(true); }}><Eye size={16} /></button>
                        <button className="action-btn edit-btn" title="Edit" onClick={() => { setSelectedInvoice(invoice); setShowEditModal(true); }}><Pencil size={16} /></button>
                        <button className="action-btn delete-btn" title="Delete" onClick={() => onDeleteInvoice(invoice.id)} style={{ color: '#ef4444' }}><X size={16} /></button>
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
