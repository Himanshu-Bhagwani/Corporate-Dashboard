import React, { useMemo, useState } from 'react';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import ComplianceDashboard from '../../Compliance/ComplianceDashboard';
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

// Compliance event type definitions with presets
const COMPLIANCE_TYPES = [
  { value: 'GST', label: 'GST', presets: ['GSTR-1 Filing', 'GSTR-3B Filing', 'Annual GST Return (GSTR-9)', 'GST Payment', 'GSTR-9C Reconciliation'] },
  { value: 'TDS', label: 'TDS / TCS', presets: ['TDS Payment', 'TDS Return - Q1', 'TDS Return - Q2', 'TDS Return - Q3', 'TDS Return - Q4', 'TCS Return'] },
  { value: 'Income Tax', label: 'Income Tax', presets: ['Advance Tax - Q1 (Jun 15)', 'Advance Tax - Q2 (Sep 15)', 'Advance Tax - Q3 (Dec 15)', 'Advance Tax - Q4 (Mar 15)', 'ITR Filing (Oct 31)', 'Tax Audit Report'] },
  { value: 'ROC', label: 'ROC / Company Law', presets: ['Annual Return Filing (MGT-7)', 'Financial Statements (AOC-4)', 'DIR-3 KYC', 'Annual General Meeting', 'Board Meeting Minutes'] },
  { value: 'Payroll', label: 'Payroll / PF / ESI', presets: ['PF Payment', 'ESI Payment', 'Professional Tax Return', 'PF Annual Return', 'ESI Annual Return'] },
  { value: 'Custom', label: 'Custom', presets: [] },
];

const ComplianceView = ({ compliance = [], invoices = [], onMarkFiled, onAddEvent, onDeleteEvent, onRunAIAudit, backendScore }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [documentCategory, setDocumentCategory] = useState('All');

  const [aiReport, setAiReport] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);

  // Add Compliance Event modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ type: 'GST', title: '', due_date: '', payment_status: 'UNPAID' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const handleRunAudit = async () => {
    if (!onRunAIAudit) return;
    setIsAuditing(true);
    try {
      const res = await onRunAIAudit(overviewStats.score, overviewStats.pending, overviewStats.overdue);
      setAiReport(res.strategyHtml || '<p>Audit completed but no strategy returned.</p>');
    } catch (err) {
      console.error(err);
      setAiReport('<p style="color:#ef4444;">Failed to generate AI Audit. Ensure the Ollama backend is running.</p>');
    } finally {
      setIsAuditing(false);
    }
  };

  const [documents, setDocuments] = useState([
    { id: 1, name: 'GST Registration Certificate', category: 'GST', uploadDate: '2025-04-01', expiryDate: '', size: '245 KB' },
    { id: 2, name: 'PAN Card', category: 'Income Tax', uploadDate: '2025-04-01', expiryDate: '', size: '180 KB' },
    { id: 3, name: 'TAN Certificate', category: 'TDS', uploadDate: '2025-04-01', expiryDate: '', size: '156 KB' },
    { id: 4, name: 'Certificate of Incorporation', category: 'ROC', uploadDate: '2025-04-01', expiryDate: '', size: '320 KB' },
    { id: 5, name: 'PF Registration', category: 'Payroll', uploadDate: '2025-04-01', expiryDate: '', size: '198 KB' },
  ]);
  const [notices, setNotices] = useState([
    {
      id: 1,
      title: 'GST Notice',
      authority: 'GST Department',
      message: 'Mismatch in GSTR-1 and GSTR-3B for Dec 2025',
      issueDate: '2026-02-15',
      dueDate: '2026-03-15',
      priority: 'High',
      status: 'Open',
    },
    {
      id: 2,
      title: 'Income Tax Notice',
      authority: 'Income Tax Department',
      message: 'Clarification required on TDS deduction for Q3',
      issueDate: '2026-01-20',
      dueDate: '2026-03-05',
      priority: 'Medium',
      status: 'Responded',
    },
  ]);
  // Build processedRiskAlerts from backend compliance prop
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
      };
    }).sort((a, b) => {
      if (a.status === 'Filed' && b.status !== 'Filed') return 1;
      if (a.status !== 'Filed' && b.status === 'Filed') return -1;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
  }, [compliance]);

  // Income Tax & TDS items from backend (filtered by type)
  const incomeTaxItems = useMemo(() =>
    processedRiskAlerts.filter(a => /tds|tcs|income.?tax|advance.?tax|itr/i.test(a.category + ' ' + a.name)),
  [processedRiskAlerts]);

  const handleMarkRiskAlertFiled = (alertId) => {
    if (onMarkFiled) onMarkFiled(alertId);
  };

  const handleDeleteAlert = (alertId) => {
    if (onDeleteEvent) onDeleteEvent(alertId);
  };

  const handleAddEventSubmit = async () => {
    if (!addForm.title || !addForm.due_date) {
      setAddError('Title and due date are required.');
      return;
    }
    setAddSaving(true);
    setAddError('');
    try {
      await onAddEvent({ type: addForm.type, title: addForm.title, due_date: addForm.due_date, payment_status: addForm.payment_status });
      setShowAddModal(false);
      setAddForm({ type: 'GST', title: '', due_date: '', payment_status: 'UNPAID' });
    } catch (err) {
      setAddError(err.message || 'Failed to add event.');
    } finally {
      setAddSaving(false);
    }
  };

  const deadlineItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dynamic = compliance.map((item) => {
      const due = toISO(item.due_date) ? new Date(`${item.due_date}T00:00:00`) : null;
      const isFiled = String(item.status || '').toLowerCase() === 'filed';
      const isOverdue = due ? due.getTime() < today.getTime() : false;

      return {
        id: item.id,
        name: item.title || item.name || 'Untitled',
        dueDate: toISO(item.due_date),
        status: isFiled ? 'Filed' : (isOverdue ? 'Overdue' : 'Pending'),
        category: item.type || 'Compliance',
        source: 'backend',
      };
    });
    return dynamic.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [compliance]);

  const overviewStats = useMemo(() => {
    const total = processedRiskAlerts.length;
    const filed = processedRiskAlerts.filter((d) => d.status === 'Filed').length;
    const pending = processedRiskAlerts.filter((d) => d.status === 'Pending').length;
    const overdue = processedRiskAlerts.filter((d) => d.status === 'Overdue').length;
    // Score reflects what's visible on screen: penalize overdue heavily, pending moderately
    let score = 100 - (15 * overdue) - (3 * pending);
    if (score < 0) score = 0;
    const upcoming30 = processedRiskAlerts.filter((d) => d.status === 'Pending').filter((d) => {
      const due = d.dueDate ? new Date(d.dueDate) : null;
      if (!due) return false;
      due.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 30;
    }).length;
    return { score, upcoming30, pending, overdue };
  }, [processedRiskAlerts]);

  const invoiceSummary = useMemo(() => {
    const total = invoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const paid = invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const pending = invoices.filter((i) => i.status === 'pending').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const overdue = invoices.filter((i) => i.status === 'overdue').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    return { total, paid, pending, overdue };
  }, [invoices]);

  // GST rows derived from backend compliance events of type GST
  const gstRows = useMemo(() =>
    processedRiskAlerts.filter(a => /gst/i.test(a.category)),
  [processedRiskAlerts]);

  const filteredDocuments = documents.filter((doc) => documentCategory === 'All' || doc.category === documentCategory);

  const monthStart = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const monthEnd = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0);
  const startWeekday = monthStart.getDay();
  const totalDays = monthEnd.getDate();

  const calendarDays = [];
  for (let i = 0; i < startWeekday; i += 1) calendarDays.push(null);
  for (let d = 1; d <= totalDays; d += 1) calendarDays.push(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), d));

  const statusForDate = (dateObj) => {
    const iso = toISO(dateObj);
    const item = deadlineItems.find((d) => d.dueDate === iso);
    return item ? item.status : '';
  };

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
            style={{
              padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)', transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Compliance Event
          </button>
        </div>

        <div className="compliance-kpi-grid">
          <div className="compliance-kpi-card">
            <div className="compliance-kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Compliance Score
            </div>
            <div className="compliance-kpi-value">{overviewStats.score}/100</div>
            <div className="compliance-kpi-sub">{overviewStats.score < 50 ? 'Needs Attention' : overviewStats.score < 80 ? 'Improving' : 'Good Standing'}</div>
          </div>
          <div className="compliance-kpi-card">
            <div className="compliance-kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              Upcoming (30d)
            </div>
            <div className="compliance-kpi-value">{overviewStats.upcoming30}</div>
            <div className="compliance-kpi-sub">Deadlines approaching</div>
          </div>
          <div className="compliance-kpi-card">
            <div className="compliance-kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              Pending Filings
            </div>
            <div className="compliance-kpi-value">{overviewStats.pending}</div>
            <div className="compliance-kpi-sub">Awaiting submission</div>
          </div>
          <div className="compliance-kpi-card">
            <div className="compliance-kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h17a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
              Overdue
            </div>
            <div className="compliance-kpi-value" style={{ color: overviewStats.overdue > 0 ? '#ef4444' : '#1a202c' }}>{overviewStats.overdue}</div>
            <div className="compliance-kpi-sub">Immediate action needed</div>
          </div>
        </div>

        <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1a202c', marginBottom: '1rem', marginTop: '2rem' }}>Risk Alerts</h4>
        {processedRiskAlerts.length === 0 && (
          <div style={{ textAlign: 'center', color: '#a0aec0', padding: '2rem', fontSize: '14px', background: '#f8fafc', borderRadius: '12px' }}>
            No compliance events found. Add your first filing above.
          </div>
        )}
        <div className="dashboard-risk-alerts" style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {processedRiskAlerts.map((alert) => {
            const isFiled = alert.status === 'Filed';
            const isOverdue = alert.status === 'Overdue';
            return (
              <div key={alert.id} className={`dashboard-risk-alert-row ${isFiled ? 'filed' : ''}`} style={{ marginBottom: 0 }}>
                <div className="risk-alert-left">
                  <div className={`risk-alert-icon ${isFiled ? 'filed' : ''}`} style={isOverdue ? { color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)' } : {}}>
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
                      <span className="due-soon-badge" style={isOverdue ? { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' } : {}}>{isOverdue ? 'Overdue' : 'Due Soon'}</span>
                      <button className="mark-filed-btn" onClick={() => handleMarkRiskAlertFiled(alert.id)}>Mark as Filed</button>
                    </>
                  )}
                  {onDeleteEvent && (
                    <button
                      onClick={() => handleDeleteAlert(alert.id)}
                      title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0', padding: '4px', marginLeft: '4px', transition: 'color 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={e => e.currentTarget.style.color = '#cbd5e0'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Risk Coach Card */}
      <div className="dashboard-section" style={{ marginTop: '2rem', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
              🪄
            </div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1a202c', margin: 0 }}>AI Risk & Compliance Coach</h4>
              <p style={{ fontSize: '13px', color: '#718096', margin: '2px 0 0 0' }}>Get a personalized, real-time remediation strategy based on your filing history.</p>
            </div>
          </div>
          <button 
            onClick={handleRunAudit}
            disabled={isAuditing}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: isAuditing ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isAuditing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            {isAuditing ? '⏳ Analyzing...' : '🛡️ Run Compliance Audit'}
          </button>
        </div>
        
        {aiReport && (
          <div 
            style={{ padding: '1.25rem', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', lineHeight: '1.7', color: '#334155', marginTop: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            dangerouslySetInnerHTML={{ __html: aiReport }}
          />
        )}
      </div>

      <div className="table-container" style={{ marginTop: '2rem' }}>
        <div className="cashflow-table-title" style={{ marginBottom: '1.25rem' }}>Upcoming Deadlines (Next 30 Days)</div>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ paddingBottom: '12px' }}>Compliance</th>
              <th style={{ paddingBottom: '12px' }}>Category</th>
              <th style={{ paddingBottom: '12px' }}>Due Date</th>
              <th style={{ paddingBottom: '12px' }}>Priority</th>
              <th style={{ paddingBottom: '12px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {processedRiskAlerts.filter((d) => d.status !== 'Filed').filter((d) => {
              const due = d.dueDate ? new Date(d.dueDate) : null;
              if (!due) return false;
              due.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return diff >= 0 && diff <= 30;
            }).slice(0, 6).map((item) => (
              <tr key={item.id}>
                <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className="table-main-text">{item.name}</span></td>
                <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className="table-secondary-text">{item.category}</span></td>
                <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className="table-secondary-text">{prettyDate(item.dueDate)}</span></td>
                <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className={`status-pill ${item.priority === 'High' ? 'danger' : 'warn'}`}>{item.priority || 'Normal'}</span></td>
                <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
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
          <button
            onClick={() => { setAddForm(f => ({ ...f, type: 'GST' })); setShowAddModal(true); }}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none',
              background: 'linear-gradient(135deg, #10B981, #059669)', color: 'white',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
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
                <th>Filing</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gstRows.map((row) => (
                <tr key={row.id}>
                  <td><span className="table-main-text">{row.name}</span></td>
                  <td>{prettyDate(row.dueDate)}</td>
                  <td><span className={`status-pill ${statusClass(row.status)}`}>{row.status}</span></td>
                  <td>
                    {row.status !== 'Filed' ? (
                      <button className="link-button" onClick={() => handleMarkRiskAlertFiled(row.id)}>Mark as Filed</button>
                    ) : '-'}
                    {onDeleteEvent && (
                      <button onClick={() => handleDeleteAlert(row.id)} className="link-button" style={{ color: '#ef4444', marginLeft: '8px' }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  const renderIncomeTaxTab = () => (
    <>
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div>
              <div className="cashflow-table-title" style={{ marginBottom: '2px' }}>Income Tax & TDS Tracker</div>
              <div style={{ fontSize: '12px', color: '#718096' }}>Track TDS, advance tax, and ITR filing deadlines</div>
            </div>
          </div>
          <button
            onClick={() => { setAddForm(f => ({ ...f, type: 'TDS' })); setShowAddModal(true); }}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none',
              background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: 'white',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            }}
          >
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
              <tr>
                <th>Compliance</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incomeTaxItems.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, color: '#1a202c' }}>{item.name}</td>
                  <td style={{ color: '#4a5568' }}>{prettyDate(item.dueDate)}</td>
                  <td>
                    <span style={{
                      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                      background: item.status === 'Filed' ? 'rgba(16,185,129,0.15)' : item.status === 'Overdue' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: item.status === 'Filed' ? '#10b981' : item.status === 'Overdue' ? '#ef4444' : '#f59e0b'
                    }}>{item.status}</span>
                  </td>
                  <td>
                    {item.status !== 'Filed' && (
                      <button className="link-button" onClick={() => handleMarkRiskAlertFiled(item.id)}>Mark as Filed</button>
                    )}
                    {onDeleteEvent && (
                      <button onClick={() => handleDeleteAlert(item.id)} className="link-button" style={{ color: '#ef4444', marginLeft: '8px' }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  const renderROCTab = () => {
    const rocItems = deadlineItems.filter((d) => /roc|mgt|aoc|director/i.test(d.name));
    return (
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="cashflow-table-title">ROC & Company Law Compliance</div>
          <button
            onClick={() => { setAddForm(f => ({ ...f, type: 'ROC' })); setShowAddModal(true); }}
            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1E3A8A, #2563EB)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Add ROC Filing
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Compliance</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rocItems.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No ROC filings yet. Click "+ Add ROC Filing" to get started.</td></tr>
            ) : rocItems.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{prettyDate(item.dueDate)}</td>
                <td><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
                <td style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {item.source === 'backend' && item.status !== 'Filed' ? (
                    <button className="link-button" onClick={() => onMarkFiled(item.id)}>Mark as Filed</button>
                  ) : '-'}
                  {item.source === 'backend' && (
                    <button className="link-button" style={{ color: '#EF4444' }} onClick={() => handleDeleteAlert(item.id)}>Delete</button>
                  )}
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
    const payrollItems = deadlineItems.filter((d) => /pf|esi|payroll|professional tax/i.test(d.name));
    return (
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="cashflow-table-title">Payroll & Labour Compliance</div>
          <button
            onClick={() => { setAddForm(f => ({ ...f, type: 'Payroll' })); setShowAddModal(true); }}
            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1E3A8A, #2563EB)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Add Payroll Filing
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Compliance</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payrollItems.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No payroll filings yet. Click "+ Add Payroll Filing" to get started.</td></tr>
            ) : payrollItems.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{prettyDate(item.dueDate)}</td>
                <td><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
                <td style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {item.source === 'backend' && item.status !== 'Filed' ? (
                    <button className="link-button" onClick={() => onMarkFiled(item.id)}>Mark as Filed</button>
                  ) : '-'}
                  {item.source === 'backend' && (
                    <button className="link-button" style={{ color: '#EF4444' }} onClick={() => handleDeleteAlert(item.id)}>Delete</button>
                  )}
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
        <button className="btn-primary btn-add-short">Upload Document</button>
      </div>
      <div className="doc-filters">
        {['All', 'GST', 'Income Tax', 'TDS', 'ROC', 'Payroll'].map((cat) => (
          <button
            key={cat}
            className={`doc-filter-btn ${documentCategory === cat ? 'active' : ''}`}
            onClick={() => setDocumentCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Document Name</th>
            <th>Category</th>
            <th>Upload Date</th>
            <th>Expiry Date</th>
            <th>Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredDocuments.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.name}</td>
              <td><span className="status-pill neutral">{doc.category}</span></td>
              <td>{prettyDate(doc.uploadDate)}</td>
              <td>{doc.expiryDate ? prettyDate(doc.expiryDate) : '-'}</td>
              <td>{doc.size}</td>
              <td>👁 ⬇ 🗑</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderNoticesTab = () => (
    <div className="dashboard-section">
      <div className="compliance-doc-header">
        <h3 className="section-title-simple">Notices & Litigation</h3>
        <button className="btn-primary btn-add-short">Upload Notice</button>
      </div>
      {notices.map((n) => (
        <div key={n.id} className={`notice-card ${n.status === 'Open' ? 'open' : 'responded'}`}>
          <div className="notice-row">
            <strong>{n.title}</strong>
            <span className={`status-pill ${n.status === 'Open' ? 'warn' : 'ok'}`}>{n.status}</span>
          </div>
          <div className="notice-meta">{n.authority}</div>
          <div className="notice-text">{n.message}</div>
          <div className="notice-meta">
            Issued: {prettyDate(n.issueDate)} | Due: {prettyDate(n.dueDate)}
          </div>
        </div>
      ))}
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
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="compliance-calendar-grid">
        {calendarDays.map((day, idx) => {
          const status = day ? statusForDate(day) : '';
          return (
            <div key={`${idx}-${day ? day.getDate() : 'empty'}`} className={`calendar-cell ${statusClass(status)}`}>
              {day ? day.getDate() : ''}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span className="legend-pill ok">Filed</span>
        <span className="legend-pill warn">Pending</span>
        <span className="legend-pill danger">Overdue</span>
      </div>
    </div>
  );

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
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`compliance-tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
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

      {/* ── Add Compliance Event Modal ───────────────────────────────────── */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '2rem',
            maxWidth: '480px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '20px', fontWeight: 700, color: '#1a202c' }}>Add Compliance Event</h2>

            {/* Type selector */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '6px' }}>Filing Type</label>
              <select
                value={addForm.type}
                onChange={e => setAddForm(f => ({ ...f, type: e.target.value, title: '' }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none' }}
              >
                {COMPLIANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Preset title buttons */}
            {(COMPLIANCE_TYPES.find(t => t.value === addForm.type)?.presets || []).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '8px' }}>Quick Presets</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {COMPLIANCE_TYPES.find(t => t.value === addForm.type).presets.map(p => (
                    <button
                      key={p}
                      onClick={() => setAddForm(f => ({ ...f, title: p }))}
                      style={{
                        padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        border: addForm.title === p ? '2px solid #4F46E5' : '1px solid #e2e8f0',
                        background: addForm.title === p ? 'rgba(79,70,229,0.08)' : '#f8fafc',
                        color: addForm.title === p ? '#4F46E5' : '#4a5568', transition: 'all 0.15s',
                      }}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Title */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '6px' }}>Title</label>
              <input
                type="text" value={addForm.title}
                onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. GSTR-1 Filing - May 2026"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Due Date */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: '6px' }}>Due Date</label>
              <input
                type="date" value={addForm.due_date}
                onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {addError && (
              <div style={{ padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '13px', marginBottom: '1rem' }}>
                {addError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowAddModal(false); setAddError(''); }}
                disabled={addSaving}
                style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#4a5568', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={handleAddEventSubmit}
                disabled={addSaving || !addForm.title || !addForm.due_date}
                style={{
                  padding: '10px 20px', borderRadius: '10px', border: 'none',
                  background: (!addForm.title || !addForm.due_date || addSaving) ? '#e2e8f0' : 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                  color: (!addForm.title || !addForm.due_date || addSaving) ? '#a0aec0' : 'white',
                  fontSize: '14px', fontWeight: 600, cursor: (!addForm.title || !addForm.due_date || addSaving) ? 'not-allowed' : 'pointer',
                }}
              >{addSaving ? 'Saving...' : 'Add Event'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ComplianceView;
