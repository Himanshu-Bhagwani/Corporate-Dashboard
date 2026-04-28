import React, { useState } from 'react';
import { DollarSign, TrendingUp, PieChart, FileText, BarChart3, Download, Calendar } from 'lucide-react';
import ExportButtons from './ExportButtons';
import ReportViewer from './ReportViewer';
import { fetchReport, exportReport } from '../../services/reportsService';
import { useAuth } from '../../context/AuthContext';

const REPORTS = [
  { id: 1, title: 'Profit & Loss',  key: 'pnl',           description: 'Revenue & expense breakdown with margins',   icon: DollarSign, color: '#1d4ed8' },
  { id: 2, title: 'Balance Sheet',  key: 'balance-sheet',  description: 'Assets, liabilities & equity snapshot',      icon: PieChart,   color: '#7c3aed' },
  { id: 3, title: 'Cash Flow',      key: 'cash-flow',      description: 'Monthly inflow, outflow & running balance',   icon: TrendingUp, color: '#059669' },
  { id: 4, title: 'Tax Summary',    key: 'tax',            description: 'Corporate tax, surcharge, cess & GST',       icon: FileText,   color: '#f59e0b' },
  { id: 5, title: 'GST Report',     key: 'gst',            description: 'GSTR-3B output vs input tax breakdown',      icon: BarChart3,  color: '#f97316' },
];

const ReportsDashboard = () => {
  const { currentCompany } = useAuth();
  const [activeReport, setActiveReport]   = useState(null);
  const [reportData, setReportData]       = useState(null);
  const [loading, setLoading]             = useState(false);
  const [includeAI, setIncludeAI]         = useState(false);
  const [isExporting, setIsExporting]     = useState(false);
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');

  const dateRange = { from: dateFrom || undefined, to: dateTo || undefined };

  const handleGenerate = async (report) => {
    if (!currentCompany) return;
    setActiveReport(report);
    setReportData(null);
    setLoading(true);
    try {
      const data = await fetchReport(report.key, currentCompany.id, dateRange);
      setReportData(data);
    } catch (err) {
      setReportData({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    if (!activeReport) return;
    setIsExporting(true);
    try {
      await exportReport(activeReport.key, format.toLowerCase(), currentCompany.id, includeAI, dateRange);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      {/* Date range filter */}
      <div className="reports-date-filter">
        <div className="rdf-icon"><Calendar size={18} /></div>
        <span className="rdf-label">Period</span>
        <div className="rdf-inputs">
          <div className="rdf-field">
            <label>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="rdf-sep">—</div>
          <div className="rdf-field">
            <label>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
        {(dateFrom || dateTo) && (
          <button className="rdf-clear" onClick={() => { setDateFrom(''); setDateTo(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Report cards */}
      <div className="reports-section">
        <h2 className="section-title-reports">Select a Report</h2>
        <div className="reports-grid">
          {REPORTS.map((report) => {
            const Icon = report.icon;
            const isActive = activeReport?.key === report.key;
            return (
              <div
                key={report.id}
                className={`report-card-premium ${isActive ? 'active-card' : ''}`}
                onClick={() => handleGenerate(report)}
              >
                <div className="report-card-bg" style={{ background: report.color }} />
                <div className="report-card-content-wrapper">
                  <div className="report-card-header">
                    <div className="report-icon-badge" style={{ background: report.color }}>
                      <Icon size={22} />
                    </div>
                    {isActive && <span className="report-active-chip">Active</span>}
                  </div>
                  <div className="report-card-body">
                    <h3 className="report-card-title">{report.title}</h3>
                    <p className="report-card-description">{report.description}</p>
                  </div>
                  <button className="btn-generate-report" style={{ background: report.color }}>
                    <Download size={16} />
                    {loading && isActive ? 'Generating…' : 'Generate Report'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Viewer + export */}
      {activeReport && (
        <>
          <div className="ai-toggle-row">
            <input
              type="checkbox"
              id="ai-toggle"
              checked={includeAI}
              onChange={e => setIncludeAI(e.target.checked)}
            />
            <label htmlFor="ai-toggle">
              <span>🪄</span> Include AI Executive Narrative (Beta)
            </label>
            <span className="ai-toggle-note">Requires local Ollama · adds ~15s</span>
          </div>

          <ExportButtons onExport={handleExport} isExporting={isExporting} />

          {loading ? (
            <div className="rv-loading">
              <div className="rv-spinner" />
              <span>Generating {activeReport.title}…</span>
            </div>
          ) : (
            <ReportViewer reportKey={activeReport.key} title={activeReport.title} data={reportData} />
          )}
        </>
      )}
    </>
  );
};

export default ReportsDashboard;
