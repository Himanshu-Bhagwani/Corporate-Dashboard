import React, { useMemo, useState, useEffect, useCallback } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { documentsAPI, noticesAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { calcComplianceScore } from '../../../utils/compliance';
import './ComplianceView.css';

const TABS = ['overview', 'gst', 'incomeTax', 'roc', 'payroll', 'documents', 'notices', 'calendar'];

const formatINR = (value) => `₹${(Number(value) || 0).toLocaleString('en-IN')}`;

const toISO = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const prettyDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const statusClass = (status) => {
  const key = String(status || '').toLowerCase();
  if (!key) return '';
  if (key === 'filed' || key === 'paid' || key === 'responded') return 'ok';
  if (key === 'overdue') return 'danger';
  return 'warn';
};

const COMPLIANCE_TYPES = [
  { value: 'GST', label: 'GST', presets: ['GSTR-1 Filing', 'GSTR-3B Filing', 'Annual GST Return (GSTR-9)', 'GST Payment', 'GSTR-9C Reconciliation'] },
  { value: 'TDS', label: 'TDS / TCS', presets: ['TDS Payment', 'TDS Return - Q1', 'TDS Return - Q2', 'TDS Return - Q3', 'TDS Return - Q4', 'TCS Return'] },
  { value: 'Income Tax', label: 'Income Tax', presets: ['Advance Tax - Q1 (Jun 15)', 'Advance Tax - Q2 (Sep 15)', 'Advance Tax - Q3 (Dec 15)', 'Advance Tax - Q4 (Mar 15)', 'ITR Filing (Oct 31)', 'Tax Audit Report'] },
  { value: 'ROC', label: 'ROC / Company Law', presets: ['Annual Return Filing (MGT-7)', 'Financial Statements (AOC-4)', 'DIR-3 KYC', 'Annual General Meeting', 'Board Meeting Minutes'] },
  { value: 'Payroll', label: 'Payroll / PF / ESI', presets: ['PF Payment', 'ESI Payment', 'Professional Tax Return', 'PF Annual Return', 'ESI Annual Return'] },
  { value: 'Custom', label: 'Custom', presets: [] },
];

const DOC_CATEGORIES = ['GST', 'Income Tax', 'TDS', 'ROC', 'Payroll', 'Other'];

const ComplianceView = ({ compliance = [], invoices = [], onMarkFiled, onAddEvent, onDeleteEvent, onRunAIAudit, backendScore }) => {
  const { currentCompany } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [documentCategory, setDocumentCategory] = useState('All');

  const [aiReport, setAiReport] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);

  // Add Compliance Event modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    type: 'GST', title: '', due_date: '', payment_status: 'UNPAID',
    sales_amount: '', net_tax_payable: '', itc_available: '', advance_tax_paid: '',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // Documents state
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', category: 'GST', expiry_date: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null);
  const [viewBlobUrl, setViewBlobUrl] = useState(null);

  // Notices state
  const [notices, setNotices] = useState([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [showAddNoticeModal, setShowAddNoticeModal] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ title: '', department: '', due_date: '', description: '', priority: 'Medium' });
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [noticeError, setNoticeError] = useState('');

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    if (!currentCompany) return;
    setDocsLoading(true);
    try {
      const data = await documentsAPI.getAll(currentCompany.id);
      setDocuments(data || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setDocsLoading(false);
    }
  }, [currentCompany]);

  // Fetch notices
  const fetchNotices = useCallback(async () => {
    if (!currentCompany) return;
    setNoticesLoading(true);
    try {
      const data = await noticesAPI.getAll(currentCompany.id);
      setNotices(data || []);
    } catch (err) {
      console.error('Failed to fetch notices:', err);
    } finally {
      setNoticesLoading(false);
    }
  }, [currentCompany]);

  useEffect(() => {
    if (activeTab === 'documents') fetchDocuments();
    if (activeTab === 'notices') fetchNotices();
  }, [activeTab, fetchDocuments, fetchNotices]);

  const handleRunAudit = async () => {
    if (!onRunAIAudit) return;
    setIsAuditing(true);
    try {
      const res = await onRunAIAudit(overviewStats.score, overviewStats.pending, overviewStats.overdue);
      setAiReport(res.strategyHtml || '<p>Audit completed but no strategy returned.</p>');
    } catch (err) {
      setAiReport('<p style="color:#ef4444;">Failed to generate AI Audit. Ensure the Ollama backend is running.</p>');
    } finally {
      setIsAuditing(false);
    }
  };

  // ── Compliance data processing ─────────────────────────────────────────────
  const processedRiskAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (compliance || []).map(item => {
      const isFiled = String(item.status || '').toUpperCase() === 'FILED';
      const due = item.due_date ? new Date(`${item.due_date}T00:00:00`) : null;
      const isOverdue = !isFiled && due && due.getTime() < today.getTime();
      return {
        id: item.id,
        name: item.title || 'Untitled',
        dueDate: item.due_date || '',
        status: isFiled ? 'Filed' : (isOverdue ? 'Overdue' : 'Pending'),
        category: item.type || 'Compliance',
        priority: isOverdue ? 'High' : 'Normal',
        sales_amount: Number(item.sales_amount) || 0,
        net_tax_payable: Number(item.net_tax_payable) || 0,
        itc_available: Number(item.itc_available) || 0,
        advance_tax_paid: Number(item.advance_tax_paid) || 0,
      };
    }).sort((a, b) => {
      if (a.status === 'Filed' && b.status !== 'Filed') return 1;
      if (a.status !== 'Filed' && b.status === 'Filed') return -1;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
  }, [compliance]);

  const incomeTaxItems = useMemo(() =>
    processedRiskAlerts.filter(a => /tds|tcs|income.?tax|advance.?tax|itr/i.test(a.category + ' ' + a.name)),
  [processedRiskAlerts]);

  const gstRows = useMemo(() =>
    processedRiskAlerts.filter(a => /gst/i.test(a.category)),
  [processedRiskAlerts]);

  // GST Reconciliation computed from real data
  const gstReconciliation = useMemo(() => {
    const gstr1Rows = gstRows.filter(r => /gstr-?1/i.test(r.name));
    const gstr3bRows = gstRows.filter(r => /gstr-?3b/i.test(r.name));

    const totalGstr1Sales = gstr1Rows.reduce((s, r) => s + r.sales_amount, 0);
    const totalGstr3bSales = gstr3bRows.reduce((s, r) => s + r.sales_amount, 0);
    const totalITC = gstRows.reduce((s, r) => s + r.itc_available, 0);
    const latestNetTax = gstRows.filter(r => r.status !== 'Filed').reduce((s, r) => s + r.net_tax_payable, 0);

    let salesMatchPct = 100;
    if (totalGstr1Sales > 0 && totalGstr3bSales > 0) {
      const diff = Math.abs(totalGstr1Sales - totalGstr3bSales);
      salesMatchPct = Math.max(0, 100 - (diff / totalGstr1Sales) * 100);
    }

    return {
      salesMatchPct: salesMatchPct.toFixed(1),
      itcAvailable: totalITC,
      netTaxPayable: latestNetTax,
      hasData: gstRows.some(r => r.sales_amount > 0 || r.net_tax_payable > 0 || r.itc_available > 0),
    };
  }, [gstRows]);

  // Tax Liability computed from real data
  const taxLiability = useMemo(() => {
    const totalReceivables = invoices
      .filter(i => i.type === 'receivable')
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const corporateTax = Math.round(totalReceivables * 0.25);
    const advanceTaxPaid = incomeTaxItems.reduce((s, r) => s + r.advance_tax_paid, 0);
    return { corporateTax, advanceTaxPaid };
  }, [invoices, incomeTaxItems]);

  const overviewStats = useMemo(() => {
    // Use shared formula — identical to DashboardView so both always show the same score.
    const { score, overdue, dueSoon, pending } = calcComplianceScore(compliance);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming30 = processedRiskAlerts.filter(d => d.status === 'Pending').filter(d => {
      const due = d.dueDate ? new Date(d.dueDate) : null;
      if (!due) return false;
      due.setHours(0, 0, 0, 0);
      const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 30;
    }).length;
    return { score, upcoming30, pending: pending + dueSoon, overdue };
  }, [compliance, processedRiskAlerts]);

  const deadlineItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return compliance.map(item => {
      const due = toISO(item.due_date) ? new Date(`${item.due_date}T00:00:00`) : null;
      const isFiled = String(item.status || '').toLowerCase() === 'filed';
      const isOverdue = due ? due.getTime() < today.getTime() : false;
      return {
        id: item.id, name: item.title || 'Untitled',
        dueDate: toISO(item.due_date),
        status: isFiled ? 'Filed' : (isOverdue ? 'Overdue' : 'Pending'),
        category: item.type || 'Compliance', source: 'backend',
      };
    }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [compliance]);

  // Calendar items: compliance + invoices combined
  const calendarItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = [];
    compliance.forEach(item => {
      const isFiled = String(item.status || '').toLowerCase() === 'filed';
      const due = item.due_date ? new Date(`${item.due_date}T00:00:00`) : null;
      const isOverdue = !isFiled && due && due.getTime() < today.getTime();
      items.push({
        dueDate: toISO(item.due_date),
        name: item.title || 'Untitled',
        status: isFiled ? 'Filed' : (isOverdue ? 'Overdue' : 'Pending'),
        source: 'compliance',
      });
    });
    invoices.forEach(inv => {
      const isPaid = String(inv.status || '').toLowerCase() === 'paid';
      const due = inv.due_date ? new Date(`${inv.due_date}T00:00:00`) : null;
      const isOverdue = !isPaid && due && due.getTime() < today.getTime();
      items.push({
        dueDate: toISO(inv.due_date),
        name: `${inv.invoice_number || 'Invoice'} (${inv.type || ''})`,
        status: isPaid ? 'Filed' : (isOverdue ? 'Overdue' : 'Pending'),
        source: 'invoice',
      });
    });
    return items;
  }, [compliance, invoices]);

  const itemsForDate = (dateObj) => {
    const iso = toISO(dateObj);
    return calendarItems.filter(d => d.dueDate === iso);
  };

  const handleMarkRiskAlertFiled = (alertId) => { if (onMarkFiled) onMarkFiled(alertId); };
  const handleDeleteAlert = (alertId) => { if (onDeleteEvent) onDeleteEvent(alertId); };

  const handleAddEventSubmit = async () => {
    if (!addForm.title || !addForm.due_date) { setAddError('Title and due date are required.'); return; }
    setAddSaving(true); setAddError('');
    try {
      await onAddEvent({
        type: addForm.type, title: addForm.title, due_date: addForm.due_date,
        payment_status: addForm.payment_status,
        sales_amount: addForm.sales_amount ? Number(addForm.sales_amount) : 0,
        net_tax_payable: addForm.net_tax_payable ? Number(addForm.net_tax_payable) : 0,
        itc_available: addForm.itc_available ? Number(addForm.itc_available) : 0,
        advance_tax_paid: addForm.advance_tax_paid ? Number(addForm.advance_tax_paid) : 0,
      });
      setShowAddModal(false);
      setAddForm({ type: 'GST', title: '', due_date: '', payment_status: 'UNPAID', sales_amount: '', net_tax_payable: '', itc_available: '', advance_tax_paid: '' });
    } catch (err) {
      setAddError(err.message || 'Failed to add event.');
    } finally {
      setAddSaving(false);
    }
  };

  // Documents handlers
  const handleUploadDocument = async () => {
    if (!uploadFile || !uploadForm.name) { setUploadError('File and name are required.'); return; }
    setUploading(true); setUploadError('');
    try {
      const doc = await documentsAPI.upload(uploadFile, uploadForm.name, uploadForm.category, uploadForm.expiry_date, currentCompany.id);
      setDocuments(prev => [doc, ...prev]);
      setShowUploadModal(false);
      setUploadForm({ name: '', category: 'GST', expiry_date: '' });
      setUploadFile(null);
    } catch (err) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (doc) => {
    setViewingDoc(doc);
    setViewBlobUrl(null);
    try {
      const response = await documentsAPI.download(doc.id, currentCompany.id);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setViewBlobUrl(url);
    } catch (err) {
      alert('Could not load document preview: ' + err.message);
      setViewingDoc(null);
    }
  };

  const handleCloseViewer = () => {
    if (viewBlobUrl) window.URL.revokeObjectURL(viewBlobUrl);
    setViewBlobUrl(null);
    setViewingDoc(null);
  };

  const handleDownloadDocument = async (doc) => {
    try {
      const response = await documentsAPI.download(doc.id, currentCompany.id);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.name;
      document.body.appendChild(a); a.click();
      a.remove(); window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  };

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    try {
      await documentsAPI.delete(doc.id, currentCompany.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Notices handlers
  const handleAddNotice = async () => {
    if (!noticeForm.title || !noticeForm.department || !noticeForm.due_date) {
      setNoticeError('Title, department and due date are required.'); return;
    }
    setNoticeSaving(true); setNoticeError('');
    try {
      const created = await noticesAPI.create(noticeForm, currentCompany.id);
      setNotices(prev => [created, ...prev]);
      setShowAddNoticeModal(false);
      setNoticeForm({ title: '', department: '', due_date: '', description: '', priority: 'Medium' });
    } catch (err) {
      setNoticeError(err.message || 'Failed to add notice.');
    } finally {
      setNoticeSaving(false);
    }
  };

  const handleToggleNoticeStatus = async (notice) => {
    const nextStatus = notice.status === 'Open' ? 'Responded' : notice.status === 'Overdue' ? 'Responded' : 'Open';
    try {
      const updated = await noticesAPI.updateStatus(notice.id, nextStatus, currentCompany.id);
      setNotices(prev => prev.map(n => n.id === notice.id ? updated : n));
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleDeleteNotice = async (notice) => {
    if (!window.confirm(`Delete notice "${notice.title}"?`)) return;
    try {
      await noticesAPI.delete(notice.id, currentCompany.id);
      setNotices(prev => prev.filter(n => n.id !== notice.id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Calendar
  const monthStart = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const monthEnd = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0);
  const startWeekday = monthStart.getDay();
  const totalDays = monthEnd.getDate();
  const calendarDays = [];
  for (let i = 0; i < startWeekday; i++) calendarDays.push(null);
  for (let d = 1; d <= totalDays; d++) calendarDays.push(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), d));

  const filteredDocuments = documents.filter(doc => documentCategory === 'All' || doc.category === documentCategory);

  // ── Renders ────────────────────────────────────────────────────────────────

  const renderOverviewTab = () => (
    <>
      <div className="dashboard-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c', marginBottom: '4px' }}>Compliance Tracker</h3>
            <p style={{ fontSize: '13px', color: '#718096', margin: 0 }}>Due filings & deadlines</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Compliance Event
          </button>
        </div>

        <div className="compliance-kpi-grid">
          {[
            { label: 'Compliance Score', value: `${overviewStats.score}/100`, sub: overviewStats.score < 50 ? 'Needs Attention' : overviewStats.score < 80 ? 'Improving' : 'Good Standing' },
            { label: 'Upcoming (30d)', value: overviewStats.upcoming30, sub: 'Deadlines approaching' },
            { label: 'Pending Filings', value: overviewStats.pending, sub: 'Awaiting submission' },
            { label: 'Overdue', value: overviewStats.overdue, sub: 'Immediate action needed', danger: overviewStats.overdue > 0 },
          ].map(k => (
            <div key={k.label} className="compliance-kpi-card">
              <div className="compliance-kpi-label">{k.label}</div>
              <div className="compliance-kpi-value" style={k.danger ? { color: '#ef4444' } : {}}>{k.value}</div>
              <div className="compliance-kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1a202c', marginBottom: '1rem', marginTop: '2rem' }}>Risk Alerts</h4>
        {processedRiskAlerts.length === 0 && (
          <div style={{ textAlign: 'center', color: '#a0aec0', padding: '2rem', fontSize: '14px', background: '#f8fafc', borderRadius: '12px' }}>
            No compliance events found. Add your first filing above.
          </div>
        )}
        <div className="dashboard-risk-alerts" style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {processedRiskAlerts.map(alert => {
            const isFiled = alert.status === 'Filed';
            const isOverdue = alert.status === 'Overdue';
            return (
              <div key={alert.id} className={`dashboard-risk-alert-row ${isFiled ? 'filed' : ''}`} style={{ marginBottom: 0 }}>
                <div className="risk-alert-left">
                  <div className={`risk-alert-icon ${isFiled ? 'filed' : ''}`} style={isOverdue ? { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.15)' } : {}}>
                    {isFiled ? '✓' : (isOverdue ? '!' : '⏰')}
                  </div>
                  <div>
                    <div className="risk-alert-title">{alert.name}</div>
                    <div className="risk-alert-meta">
                      {alert.category && <span style={{ marginRight: '8px', color: '#4F46E5', fontWeight: 600 }}>{alert.category}</span>}
                      Due: {prettyDate(alert.dueDate)}
                    </div>
                  </div>
                </div>
                <div className="risk-alert-right">
                  {isFiled ? (
                    <span className="filed-badge">Filed</span>
                  ) : (
                    <>
                      <span className="due-soon-badge" style={isOverdue ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' } : {}}>{isOverdue ? 'Overdue' : 'Due Soon'}</span>
                      <button className="mark-filed-btn" onClick={() => handleMarkRiskAlertFiled(alert.id)}>Mark as Filed</button>
                    </>
                  )}
                  {onDeleteEvent && (
                    <button onClick={() => handleDeleteAlert(alert.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0', padding: '4px', marginLeft: '4px' }} onMouseOver={e => e.currentTarget.style.color = '#ef4444'} onMouseOut={e => e.currentTarget.style.color = '#cbd5e0'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dashboard-section" style={{ marginTop: '2rem', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🪄</div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1a202c', margin: 0 }}>AI Risk & Compliance Coach</h4>
              <p style={{ fontSize: '13px', color: '#718096', margin: '2px 0 0 0' }}>Get a personalized, real-time remediation strategy based on your filing history.</p>
            </div>
          </div>
          <button onClick={handleRunAudit} disabled={isAuditing} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: isAuditing ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: isAuditing ? 'not-allowed' : 'pointer' }}>
            {isAuditing ? '⏳ Analyzing...' : '🛡️ Run Compliance Audit'}
          </button>
        </div>
        {aiReport && <div style={{ padding: '1.25rem', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', lineHeight: '1.7', color: '#334155', marginTop: '1.25rem' }} dangerouslySetInnerHTML={{ __html: aiReport }} />}
      </div>

      <div className="table-container" style={{ marginTop: '2rem' }}>
        <div className="cashflow-table-title" style={{ marginBottom: '1.25rem' }}>Upcoming Deadlines (Next 30 Days)</div>
        <table className="data-table">
          <thead><tr><th>Compliance</th><th>Category</th><th>Due Date</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {processedRiskAlerts.filter(d => d.status !== 'Filed').filter(d => {
              const due = d.dueDate ? new Date(d.dueDate) : null;
              if (!due) return false;
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return diff >= 0 && diff <= 30;
            }).slice(0, 6).map(item => (
              <tr key={item.id}>
                <td><span className="table-main-text">{item.name}</span></td>
                <td><span className="table-secondary-text">{item.category}</span></td>
                <td><span className="table-secondary-text">{prettyDate(item.dueDate)}</span></td>
                <td><span className={`status-pill ${item.priority === 'High' ? 'danger' : 'warn'}`}>{item.priority || 'Normal'}</span></td>
                <td><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderGSTTab = () => (
    <>
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="cashflow-table-title">GST Filing Tracker</div>
          <button onClick={() => { setAddForm(f => ({ ...f, type: 'GST' })); setShowAddModal(true); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10B981, #059669)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add GST Filing
          </button>
        </div>
        {gstRows.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#a0aec0', padding: '2rem', fontSize: '14px', background: '#f8fafc', borderRadius: '12px' }}>
            No GST compliance events added yet.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Return Type</th>
                <th>Due Date</th>
                <th>Sales Amount</th>
                <th>Net Tax Payable</th>
                <th>ITC Available</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gstRows.map(row => (
                <tr key={row.id}>
                  <td><span className="table-main-text">{row.name}</span></td>
                  <td>{prettyDate(row.dueDate)}</td>
                  <td style={{ color: '#1a202c' }}>{row.sales_amount > 0 ? formatINR(row.sales_amount) : '-'}</td>
                  <td style={{ color: '#ef4444', fontWeight: 600 }}>{row.net_tax_payable > 0 ? formatINR(row.net_tax_payable) : '-'}</td>
                  <td style={{ color: '#f59e0b', fontWeight: 600 }}>{row.itc_available > 0 ? formatINR(row.itc_available) : '-'}</td>
                  <td><span className={`status-pill ${statusClass(row.status)}`}>{row.status}</span></td>
                  <td>
                    {row.status !== 'Filed' && <button className="link-button" onClick={() => handleMarkRiskAlertFiled(row.id)}>Mark as Filed</button>}
                    {onDeleteEvent && <button onClick={() => handleDeleteAlert(row.id)} className="link-button" style={{ color: '#ef4444', marginLeft: '8px' }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* GST Reconciliation Status */}
      <div className="table-container" style={{ marginTop: '1.5rem' }}>
        <div className="cashflow-table-title" style={{ marginBottom: '1rem' }}>GST Reconciliation Status</div>
        {!gstReconciliation.hasData ? (
          <div style={{ color: '#a0aec0', fontSize: '13px', padding: '1rem', background: '#f8fafc', borderRadius: '10px' }}>
            Add GST filings with sales amount, ITC and tax payable to see reconciliation data.
          </div>
        ) : (
          <div className="gst-recon-grid">
            <div className="gst-recon-card green">
              <div className="gst-recon-label">Sales Match</div>
              <div className="gst-recon-value green">{gstReconciliation.salesMatchPct}%</div>
            </div>
            <div className="gst-recon-card yellow">
              <div className="gst-recon-label">ITC Available</div>
              <div className="gst-recon-value yellow">{formatINR(gstReconciliation.itcAvailable)}</div>
            </div>
            <div className="gst-recon-card blue">
              <div className="gst-recon-label">Net Tax Payable</div>
              <div className="gst-recon-value blue">{formatINR(gstReconciliation.netTaxPayable)}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const renderIncomeTaxTab = () => (
    <>
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div>
              <div className="cashflow-table-title" style={{ marginBottom: '2px' }}>Income Tax & TDS Tracker</div>
              <div style={{ fontSize: '12px', color: '#718096' }}>Track TDS, advance tax, and ITR filing deadlines</div>
            </div>
          </div>
          <button onClick={() => { setAddForm(f => ({ ...f, type: 'TDS' })); setShowAddModal(true); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add TDS / Tax Filing
          </button>
        </div>
        {incomeTaxItems.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#a0aec0', padding: '2rem', fontSize: '14px', background: '#f8fafc', borderRadius: '12px', marginTop: '1rem' }}>
            No Income Tax / TDS events added yet.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Compliance</th><th>Due Date</th><th>Advance Tax Paid</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {incomeTaxItems.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, color: '#1a202c' }}>{item.name}</td>
                  <td style={{ color: '#4a5568' }}>{prettyDate(item.dueDate)}</td>
                  <td style={{ color: '#f59e0b', fontWeight: 600 }}>{item.advance_tax_paid > 0 ? formatINR(item.advance_tax_paid) : '-'}</td>
                  <td>
                    <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: item.status === 'Filed' ? 'rgba(16,185,129,0.15)' : item.status === 'Overdue' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: item.status === 'Filed' ? '#10b981' : item.status === 'Overdue' ? '#ef4444' : '#f59e0b' }}>{item.status}</span>
                  </td>
                  <td>
                    {item.status !== 'Filed' && <button className="link-button" onClick={() => handleMarkRiskAlertFiled(item.id)}>Mark as Filed</button>}
                    {onDeleteEvent && <button onClick={() => handleDeleteAlert(item.id)} className="link-button" style={{ color: '#ef4444', marginLeft: '8px' }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tax Liability Estimate */}
      <div className="table-container" style={{ marginTop: '1.5rem' }}>
        <div className="cashflow-table-title" style={{ marginBottom: '1rem' }}>Tax Liability Estimate</div>
        <div className="tax-liability-grid">
          <div className="tax-liability-card blue">
            <div className="tax-liability-label">Corporate Tax (25%)</div>
            <div className="tax-liability-value">{formatINR(taxLiability.corporateTax)}</div>
            <div className="tax-liability-sub">Estimated from receivable invoices</div>
          </div>
          <div className="tax-liability-card yellow">
            <div className="tax-liability-label">Advance Tax Paid</div>
            <div className="tax-liability-value yellow">{formatINR(taxLiability.advanceTaxPaid)}</div>
            <div className="tax-liability-sub">From advance tax compliance events</div>
          </div>
          {taxLiability.corporateTax > taxLiability.advanceTaxPaid && (
            <div className="tax-liability-card red">
              <div className="tax-liability-label">Balance Due</div>
              <div className="tax-liability-value red">{formatINR(taxLiability.corporateTax - taxLiability.advanceTaxPaid)}</div>
              <div className="tax-liability-sub">Estimated remaining tax liability</div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderROCTab = () => {
    const rocItems = deadlineItems.filter(d => /roc|mgt|aoc|director/i.test(d.name));
    return (
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="cashflow-table-title">ROC & Company Law Compliance</div>
          <button onClick={() => { setAddForm(f => ({ ...f, type: 'ROC' })); setShowAddModal(true); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1E3A8A, #2563EB)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Add ROC Filing
          </button>
        </div>
        <table className="data-table">
          <thead><tr><th>Compliance</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rocItems.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No ROC filings yet. Click "+ Add ROC Filing" to get started.</td></tr>
            ) : rocItems.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{prettyDate(item.dueDate)}</td>
                <td><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
                <td style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {item.status !== 'Filed' && <button className="link-button" onClick={() => onMarkFiled(item.id)}>Mark as Filed</button>}
                  <button className="link-button" style={{ color: '#EF4444' }} onClick={() => handleDeleteAlert(item.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="compliance-note">Note: Annual General Meeting must be held within 6 months of financial year end.</div>
      </div>
    );
  };

  const renderPayrollTab = () => {
    const payrollItems = deadlineItems.filter(d => /pf|esi|payroll|professional tax/i.test(d.name));
    return (
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="cashflow-table-title">Payroll & Labour Compliance</div>
          <button onClick={() => { setAddForm(f => ({ ...f, type: 'Payroll' })); setShowAddModal(true); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1E3A8A, #2563EB)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Add Payroll Filing
          </button>
        </div>
        <table className="data-table">
          <thead><tr><th>Compliance</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {payrollItems.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No payroll filings yet. Click "+ Add Payroll Filing" to get started.</td></tr>
            ) : payrollItems.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{prettyDate(item.dueDate)}</td>
                <td><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
                <td style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {item.status !== 'Filed' && <button className="link-button" onClick={() => onMarkFiled(item.id)}>Mark as Filed</button>}
                  <button className="link-button" style={{ color: '#EF4444' }} onClick={() => handleDeleteAlert(item.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderDocumentsTab = () => (
    <div className="table-container">
      <div className="compliance-doc-header">
        <div className="cashflow-table-title">Document Vault</div>
        <button onClick={() => setShowUploadModal(true)} className="btn-primary btn-add-short" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          Upload Document
        </button>
      </div>
      <div className="doc-filters">
        {['All', ...DOC_CATEGORIES].map(cat => (
          <button key={cat} className={`doc-filter-btn ${documentCategory === cat ? 'active' : ''}`} onClick={() => setDocumentCategory(cat)}>{cat}</button>
        ))}
      </div>

      {docsLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0' }}>Loading documents...</div>
      ) : filteredDocuments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '14px', background: '#f8fafc', borderRadius: '12px' }}>
          No documents uploaded yet. Click "Upload Document" to add your first file.
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Document Name</th><th>Category</th><th>Upload Date</th><th>Expiry Date</th><th>Size</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filteredDocuments.map(doc => (
              <tr key={doc.id}>
                <td>{doc.name}</td>
                <td><span className="status-pill neutral">{doc.category}</span></td>
                <td>{prettyDate(doc.upload_date)}</td>
                <td>{doc.expiry_date ? prettyDate(doc.expiry_date) : '-'}</td>
                <td>{doc.file_size}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => handleViewDocument(doc)} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4F46E5', padding: '4px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    <button onClick={() => handleDownloadDocument(doc)} title="Download" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: '4px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    </button>
                    <button onClick={() => handleDeleteDocument(doc)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderNoticesTab = () => (
    <div className="dashboard-section">
      <div className="compliance-doc-header">
        <h3 className="section-title-simple">Notices & Litigation</h3>
        <button onClick={() => setShowAddNoticeModal(true)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add Notice
        </button>
      </div>

      {noticesLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0' }}>Loading notices...</div>
      ) : notices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '14px', background: '#f8fafc', borderRadius: '12px', marginTop: '1rem' }}>
          No notices added yet. Click "Add Notice" to log a regulatory notice.
        </div>
      ) : (
        notices.map(n => {
          const isOverdue = n.status === 'Overdue';
          return (
            <div key={n.id} className={`notice-card ${n.status === 'Open' ? 'open' : n.status === 'Overdue' ? 'overdue' : 'responded'}`}>
              <div className="notice-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>{n.title}</strong>
                  <span className={`status-pill ${n.priority === 'High' ? 'danger' : n.priority === 'Low' ? 'ok' : 'warn'}`} style={{ fontSize: '10px' }}>{n.priority}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`status-pill ${isOverdue ? 'danger' : n.status === 'Responded' ? 'ok' : 'warn'}`}>{n.status}</span>
                  <button onClick={() => handleToggleNoticeStatus(n)} title="Toggle Status" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', color: '#4a5568', padding: '3px 8px', fontSize: '11px', fontWeight: 600 }}>
                    {n.status === 'Responded' ? 'Mark Open' : 'Mark Responded'}
                  </button>
                  <button onClick={() => handleDeleteNotice(n)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </div>
              </div>
              <div className="notice-meta">{n.department}</div>
              {n.description && <div className="notice-text">{n.description}</div>}
              <div className="notice-meta" style={{ marginTop: '0.3rem' }}>
                Added: {prettyDate(n.created_at)} | Due: <span style={isOverdue ? { color: '#ef4444', fontWeight: 700 } : {}}>{prettyDate(n.due_date)}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderCalendarTab = () => (
    <div className="dashboard-section">
      <div className="compliance-doc-header">
        <h3 className="section-title-simple">
          {calendarCursor.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="calendar-nav">
          <button className="doc-filter-btn" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1))}>Prev</button>
          <button className="doc-filter-btn" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1))}>Next</button>
        </div>
      </div>
      <div className="compliance-calendar-grid compliance-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="compliance-calendar-grid">
        {calendarDays.map((day, idx) => {
          const dayItems = day ? itemsForDate(day) : [];
          const hasOverdue = dayItems.some(i => i.status === 'Overdue');
          const hasPending = dayItems.some(i => i.status === 'Pending');
          const allFiled = dayItems.length > 0 && dayItems.every(i => i.status === 'Filed');
          const cellClass = hasOverdue ? 'danger' : hasPending ? 'warn' : allFiled ? 'ok' : '';
          return (
            <div key={`${idx}-${day ? day.getDate() : 'empty'}`} className={`calendar-cell ${cellClass}`}>
              {day && (
                <>
                  <div className="calendar-day-num">
                    {day.getDate()}
                    {allFiled && <span className="cal-status-icon" title="All filed">✅</span>}
                    {hasPending && !hasOverdue && <span className="cal-status-icon" title="Pending">⏰</span>}
                    {hasOverdue && <span className="cal-status-icon" title="Overdue">❗</span>}
                  </div>
                  {dayItems.length > 0 && (
                    <div className="calendar-events-footer">
                      {dayItems.slice(0, 2).map((item, i) => (
                        <div key={i} className={`cal-event-tag ${statusClass(item.status)}`} title={item.name}>
                          {item.name.length > 14 ? item.name.slice(0, 14) + '…' : item.name}
                        </div>
                      ))}
                      {dayItems.length > 2 && <div className="cal-event-more">+{dayItems.length - 2} more</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span className="legend-pill ok">✅ Filed</span>
        <span className="legend-pill warn">⏰ Pending</span>
        <span className="legend-pill danger">❗ Overdue</span>
      </div>
    </div>
  );

  // ── Modals ─────────────────────────────────────────────────────────────────
  const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
  const modalBox = { background: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '500px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '6px' };

  const isGSTType = addForm.type === 'GST';
  const isTaxType = addForm.type === 'TDS' || addForm.type === 'Income Tax';

  return (
    <>
      <EmbeddedHeader />
      <div className="view-header">
        <div>
          <h1 className="view-title">Compliance Management</h1>
          <p className="view-subtitle">Track and manage all statutory compliance requirements</p>
        </div>
      </div>

      <div className="compliance-tabs">
        {TABS.map(tab => (
          <button key={tab} className={`compliance-tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'overview' && 'Overview'}
            {tab === 'gst' && 'GST'}
            {tab === 'incomeTax' && 'Income Tax & TDS'}
            {tab === 'roc' && 'ROC'}
            {tab === 'payroll' && 'Payroll'}
            {tab === 'documents' && 'Documents'}
            {tab === 'notices' && 'Notices'}
            {tab === 'calendar' && 'Calendar'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'gst' && renderGSTTab()}
      {activeTab === 'incomeTax' && renderIncomeTaxTab()}
      {activeTab === 'roc' && renderROCTab()}
      {activeTab === 'payroll' && renderPayrollTab()}
      {activeTab === 'documents' && renderDocumentsTab()}
      {activeTab === 'notices' && renderNoticesTab()}
      {activeTab === 'calendar' && renderCalendarTab()}

      {/* ── Add Compliance Event Modal ─────────────────────────────────── */}
      {showAddModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '20px', fontWeight: 700, color: '#1a202c' }}>Add Compliance Event</h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Filing Type</label>
              <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value, title: '' }))} style={inputStyle}>
                {COMPLIANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {(COMPLIANCE_TYPES.find(t => t.value === addForm.type)?.presets || []).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Quick Presets</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {COMPLIANCE_TYPES.find(t => t.value === addForm.type).presets.map(p => (
                    <button key={p} onClick={() => setAddForm(f => ({ ...f, title: p }))} style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: addForm.title === p ? '2px solid #4F46E5' : '1px solid #e2e8f0', background: addForm.title === p ? 'rgba(79,70,229,0.08)' : '#f8fafc', color: addForm.title === p ? '#4F46E5' : '#4a5568' }}>{p}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Title</label>
              <input type="text" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. GSTR-1 Filing - May 2026" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={addForm.due_date} onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
            </div>

            {isGSTType && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={labelStyle}>Sales Amount (₹) <span style={{ fontWeight: 400, color: '#a0aec0' }}>optional</span></label>
                  <input type="number" value={addForm.sales_amount} onChange={e => setAddForm(f => ({ ...f, sales_amount: e.target.value }))} placeholder="0" style={inputStyle} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={labelStyle}>Net Tax Payable (₹) <span style={{ fontWeight: 400, color: '#a0aec0' }}>optional</span></label>
                  <input type="number" value={addForm.net_tax_payable} onChange={e => setAddForm(f => ({ ...f, net_tax_payable: e.target.value }))} placeholder="0" style={inputStyle} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={labelStyle}>ITC Available (₹) <span style={{ fontWeight: 400, color: '#a0aec0' }}>optional</span></label>
                  <input type="number" value={addForm.itc_available} onChange={e => setAddForm(f => ({ ...f, itc_available: e.target.value }))} placeholder="0" style={inputStyle} />
                </div>
              </>
            )}

            {isTaxType && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Advance Tax Paid (₹) <span style={{ fontWeight: 400, color: '#a0aec0' }}>optional</span></label>
                <input type="number" value={addForm.advance_tax_paid} onChange={e => setAddForm(f => ({ ...f, advance_tax_paid: e.target.value }))} placeholder="0" style={inputStyle} />
              </div>
            )}

            {addError && <div style={{ padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '13px', marginBottom: '1rem' }}>{addError}</div>}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAddModal(false); setAddError(''); }} disabled={addSaving} style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#4a5568', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddEventSubmit} disabled={addSaving || !addForm.title || !addForm.due_date} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: (!addForm.title || !addForm.due_date || addSaving) ? '#e2e8f0' : 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: (!addForm.title || !addForm.due_date || addSaving) ? '#a0aec0' : 'white', fontSize: '14px', fontWeight: 600, cursor: (!addForm.title || !addForm.due_date || addSaving) ? 'not-allowed' : 'pointer' }}>
                {addSaving ? 'Saving...' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Document Modal ───────────────────────────────────────── */}
      {showUploadModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '20px', fontWeight: 700, color: '#1a202c' }}>Upload Document</h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Document Name</label>
              <input type="text" value={uploadForm.name} onChange={e => setUploadForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. GST Registration Certificate" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Category</label>
              <select value={uploadForm.category} onChange={e => setUploadForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Expiry Date <span style={{ fontWeight: 400, color: '#a0aec0' }}>optional</span></label>
              <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))} style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>File (PDF or Image)</label>
              <div className="file-drop-zone" onClick={() => document.getElementById('doc-file-input').click()}>
                {uploadFile ? (
                  <div style={{ color: '#4F46E5', fontWeight: 600 }}>
                    📄 {uploadFile.name} ({Math.round(uploadFile.size / 1024)} KB)
                  </div>
                ) : (
                  <div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a0aec0" strokeWidth="2" style={{ marginBottom: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    <div style={{ color: '#a0aec0', fontSize: '14px' }}>Click to select PDF or image file</div>
                  </div>
                )}
                <input id="doc-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => {
                  const f = e.target.files[0];
                  if (f) { setUploadFile(f); if (!uploadForm.name) setUploadForm(prev => ({ ...prev, name: f.name.replace(/\.[^/.]+$/, '') })); }
                }} />
              </div>
            </div>

            {uploadError && <div style={{ padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '13px', marginBottom: '1rem' }}>{uploadError}</div>}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadError(''); }} disabled={uploading} style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#4a5568', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleUploadDocument} disabled={uploading || !uploadFile || !uploadForm.name} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: (uploading || !uploadFile || !uploadForm.name) ? '#e2e8f0' : 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: (uploading || !uploadFile || !uploadForm.name) ? '#a0aec0' : 'white', fontSize: '14px', fontWeight: 600, cursor: (uploading || !uploadFile || !uploadForm.name) ? 'not-allowed' : 'pointer' }}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Notice Modal ────────────────────────────────────────────── */}
      {showAddNoticeModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '20px', fontWeight: 700, color: '#1a202c' }}>Add Notice</h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Notice Title</label>
              <input type="text" value={noticeForm.title} onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. GST Notice - Mismatch" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Department / Authority</label>
              <input type="text" value={noticeForm.department} onChange={e => setNoticeForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. GST Department" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Due Date (Response Deadline)</label>
              <input type="date" value={noticeForm.due_date} onChange={e => setNoticeForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Priority</label>
              <select value={noticeForm.priority} onChange={e => setNoticeForm(f => ({ ...f, priority: e.target.value }))} style={inputStyle}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: '#a0aec0' }}>optional</span></label>
              <textarea value={noticeForm.description} onChange={e => setNoticeForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the notice or any details..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            {noticeError && <div style={{ padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '13px', marginBottom: '1rem' }}>{noticeError}</div>}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAddNoticeModal(false); setNoticeError(''); }} disabled={noticeSaving} style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#4a5568', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddNotice} disabled={noticeSaving || !noticeForm.title || !noticeForm.department || !noticeForm.due_date} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: (noticeSaving || !noticeForm.title || !noticeForm.department || !noticeForm.due_date) ? '#e2e8f0' : 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: (noticeSaving || !noticeForm.title || !noticeForm.department || !noticeForm.due_date) ? '#a0aec0' : 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                {noticeSaving ? 'Saving...' : 'Add Notice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Document Viewer Modal ───────────────────────────────────────── */}
      {viewingDoc && (
        <div style={{ ...modalOverlay, zIndex: 1100 }} onClick={handleCloseViewer}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1rem', maxWidth: '90vw', width: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1a202c' }}>{viewingDoc.name}</h3>
              <button onClick={handleCloseViewer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5568', fontSize: '18px', padding: '4px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!viewBlobUrl ? (
                <div style={{ color: '#a0aec0', fontSize: '14px' }}>Loading preview…</div>
              ) : viewingDoc.mime_type && viewingDoc.mime_type.startsWith('image/') ? (
                <img
                  src={viewBlobUrl}
                  alt={viewingDoc.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', maxHeight: '70vh' }}
                />
              ) : (
                <iframe
                  src={viewBlobUrl}
                  title={viewingDoc.name}
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ComplianceView;
