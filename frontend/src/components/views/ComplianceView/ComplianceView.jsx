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

const ComplianceView = ({ compliance = [], invoices = [], onMarkFiled, onRunAIAudit, backendScore }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [documentCategory, setDocumentCategory] = useState('All');
  
  const [aiReport, setAiReport] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);

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
  const [riskAlerts, setRiskAlerts] = useState([
    { id: 'ra-1', name: 'TDS Payment - Feb 2026', dueDate: '2026-03-07', status: 'Pending', category: 'TDS', priority: 'High' },
    { id: 'ra-2', name: 'Advance Tax - Q4', dueDate: '2026-03-15', status: 'Pending', category: 'Income Tax', priority: 'High' },
    { id: 'ra-3', name: 'GSTR-1 Filing - Mar 2026', dueDate: '2026-04-11', status: 'Pending', category: 'GST', priority: 'Normal' },
    { id: 'ra-4', name: 'GSTR-3B Filing - Mar 2026', dueDate: '2026-04-20', status: 'Pending', category: 'GST', priority: 'Normal' },
    { id: 'ra-5', name: 'TDS Payment - Mar 2026', dueDate: '2026-05-07', status: 'Pending', category: 'TDS', priority: 'Normal' },
    { id: 'ra-6', name: 'ESI/PF Payment - Apr 2026', dueDate: '2026-05-15', status: 'Pending', category: 'Payroll', priority: 'Normal' },
    { id: 'ra-7', name: 'GSTR-1 Filing - Apr 2026', dueDate: '2026-05-11', status: 'Pending', category: 'GST', priority: 'Normal' },
    { id: 'ra-8', name: 'GSTR-3B Filing - Apr 2026', dueDate: '2026-05-20', status: 'Pending', category: 'GST', priority: 'Normal' },
    { id: 'ra-9', name: 'Advance Tax - Q1', dueDate: '2026-06-15', status: 'Pending', category: 'Income Tax', priority: 'Normal' },
    { id: 'ra-10', name: 'TDS Return - Q1', dueDate: '2026-06-30', status: 'Pending', category: 'TDS', priority: 'Normal' },
    { id: 'ra-11', name: 'PT Return - Jun 2026', dueDate: '2026-06-10', status: 'Pending', category: 'Payroll', priority: 'Normal' }
  ]);

  const processedRiskAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return riskAlerts.map(alert => {
      let currentStatus = alert.status;
      if (currentStatus !== 'Filed') {
        const due = new Date(alert.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due.getTime() < today.getTime()) {
          currentStatus = 'Overdue';
        } else {
          currentStatus = 'Pending';
        }
      }
      return { ...alert, status: currentStatus };
    }).sort((a, b) => {
      if (a.status === 'Filed' && b.status !== 'Filed') return 1;
      if (a.status !== 'Filed' && b.status === 'Filed') return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [riskAlerts]);

  const [incomeTaxItems, setIncomeTaxItems] = useState([
    { id: 'it-1', name: 'TDS Deduction - Feb 2026', dueDate: '2026-03-07', status: 'Pending' },
    { id: 'it-2', name: 'Advance Tax Q4', dueDate: '2026-03-15', status: 'Pending' },
    { id: 'it-3', name: 'ITR-6 Filing AY 2025-26', dueDate: '2026-10-31', status: 'Pending' }
  ]);

  const handleMarkRiskAlertFiled = (alertId) => {
    setRiskAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'Filed' } : a));
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
        name: item.name,
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

  const gstRows = useMemo(() => ([
    {
      id: 'g1',
      returnType: 'GSTR-1',
      period: 'Feb 2026',
      dueDate: '2026-03-11',
      salesAmount: 2847500,
      netTaxPayable: 512550,
      status: 'Pending',
    },
    {
      id: 'g2',
      returnType: 'GSTR-3B',
      period: 'Feb 2026',
      dueDate: '2026-03-20',
      salesAmount: 0,
      netTaxPayable: 166338,
      status: 'Pending',
    },
    {
      id: 'g3',
      returnType: 'GSTR-1',
      period: 'Jan 2026',
      dueDate: '2026-02-11',
      salesAmount: 2720000,
      netTaxPayable: 489600,
      status: 'Filed',
    },
  ]), []);

  const gstRecon = useMemo(() => {
    const pendingTax = gstRows.filter((r) => r.status === 'Pending').reduce((sum, r) => sum + r.netTaxPayable, 0);
    return {
      salesMatch: 98.5,
      itcAvailable: 346212,
      netTaxPayable: pendingTax,
    };
  }, [gstRows]);

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
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c', marginBottom: '4px' }}>Compliance Tracker</h3>
        <p style={{ fontSize: '13px', color: '#718096', marginBottom: '1.5rem' }}>Due filings & deadlines</p>

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
                    <div className="risk-alert-meta">Due: {prettyDate(alert.dueDate)}</div>
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
        <div className="cashflow-table-title">GST Filing Tracker</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Return Type</th>
              <th>Period</th>
              <th>Due Date</th>
              <th className="align-right">Sales Amount</th>
              <th className="align-right">Net Tax Payable</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {gstRows.map((row) => (
              <tr key={row.id}>
                <td><span className="table-main-text">{row.returnType}</span></td>
                <td>{row.period}</td>
                <td>{prettyDate(row.dueDate)}</td>
                <td className="align-right">{row.salesAmount > 0 ? formatINR(row.salesAmount) : '-'}</td>
                <td className="align-right"><span className={row.status === 'Filed' ? 'table-amount positive' : 'table-amount negative'}>{formatINR(row.netTaxPayable)}</span></td>
                <td><span className={`status-pill ${statusClass(row.status)}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="financial-health-section" style={{ marginTop: '2rem' }}>
        <div className="health-header">
          <div className="health-header-left">
            <div className="health-icon" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))', color: '#10b981' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            </div>
            <div>
              <div className="health-title" style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c', marginBottom: '4px' }}>GST Reconciliation Status</div>
              <div className="health-subtitle" style={{ fontSize: '13px', color: '#718096' }}>Sales matching, ITC and net tax overview</div>
            </div>
          </div>
        </div>
        <div className="stats-grid-3">
          <div className="stat-card-simple compliance-tone soft-green">
            <div className="stat-content-simple">
              <div className="stat-label-simple">Sales Match</div>
              <div className="stat-value-simple green">{gstRecon.salesMatch}%</div>
            </div>
          </div>
          <div className="stat-card-simple compliance-tone soft-yellow">
            <div className="stat-content-simple">
              <div className="stat-label-simple">ITC Available</div>
              <div className="stat-value-simple orange">{formatINR(gstRecon.itcAvailable)}</div>
            </div>
          </div>
          <div className="stat-card-simple compliance-tone soft-blue">
            <div className="stat-content-simple">
              <div className="stat-label-simple">Net Tax Payable</div>
              <div className="stat-value-simple blue">{formatINR(gstRecon.netTaxPayable)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderIncomeTaxTab = () => (
    <>
      {/* === INCOME TAX & TDS TRACKER === */}
      <div className="financial-health-section">
        <div className="health-header">
          <div className="health-header-left">
            <div className="health-icon" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', color: '#f59e0b' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div>
              <div className="health-title">Income Tax & TDS Tracker</div>
              <div className="health-subtitle">Track TDS, advance tax, and ITR filing deadlines</div>
            </div>
          </div>
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
            {incomeTaxItems.map((item) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 600, color: '#1a202c' }}>{item.name}</td>
                <td style={{ color: '#4a5568' }}>{prettyDate(item.dueDate)}</td>
                <td>
                  <span style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                    background: item.status === 'Filed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: item.status === 'Filed' ? '#10b981' : '#f59e0b'
                  }}>{item.status}</span>
                </td>
                <td>
                  {item.status !== 'Filed' ? (
                    <button
                      className="link-button"
                      onClick={() => setIncomeTaxItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'Filed' } : it))}
                    >Mark as Filed</button>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Tax Liability Estimate */}
        <div style={{ marginTop: '2rem' }}>
          <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1a202c', marginBottom: '1rem' }}>Tax Liability Estimate</h4>
          <div className="stats-grid-2">
            <div className="stat-card-simple soft-blue">
              <div className="stat-content-simple">
                <div className="stat-label-simple">Corporate Tax (25%)</div>
                <div className="stat-value-simple blue">{formatINR(231025)}</div>
              </div>
            </div>
            <div className="stat-card-simple soft-yellow">
              <div className="stat-content-simple">
                <div className="stat-label-simple">Advance Tax Paid</div>
                <div className="stat-value-simple orange">{formatINR(180000)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderROCTab = () => (
    <div className="table-container">
      <div className="cashflow-table-title">ROC & Company Law Compliance</div>
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
          {deadlineItems.filter((d) => /roc|mgt|aoc|director/i.test(d.name)).map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{prettyDate(item.dueDate)}</td>
              <td><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
              <td>
                {item.source === 'backend' && item.status !== 'Filed' ? (
                  <button className="link-button" onClick={() => onMarkFiled(item.id)}>Mark as Filed</button>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="compliance-note">Upcoming: Annual General Meeting must be held within 6 months of financial year end.</div>
    </div>
  );

  const renderPayrollTab = () => (
    <div className="table-container">
      <div className="cashflow-table-title">Payroll & Labour Compliance</div>
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
          {deadlineItems.filter((d) => /pf|esi|payroll|professional tax/i.test(d.name)).map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{prettyDate(item.dueDate)}</td>
              <td><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></td>
              <td>
                {item.source === 'backend' && item.status !== 'Filed' ? (
                  <button className="link-button" onClick={() => onMarkFiled(item.id)}>Mark as Filed</button>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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

      {activeTab === 'overview' && (
        <>
          {renderOverviewTab()}
        </>
      )}
      {activeTab === 'gst' && renderGSTTab()}
      {activeTab === 'incomeTax' && renderIncomeTaxTab()}
      {activeTab === 'roc' && renderROCTab()}
      {activeTab === 'payroll' && renderPayrollTab()}
      {activeTab === 'documents' && renderDocumentsTab()}
      {activeTab === 'notices' && renderNoticesTab()}
      {activeTab === 'calendar' && renderCalendarTab()}
    </>
  );
};

export default ComplianceView;
