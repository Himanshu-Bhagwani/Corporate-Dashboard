import React, { useState, useMemo } from 'react';
import { DollarSign, TrendingUp, PieChart, FileText, BarChart3, Download, Calendar } from 'lucide-react';
import ExportButtons from './ExportButtons';
import ReportViewer from './ReportViewer';
import ReportAnalysis from './ReportAnalysis';
import { fetchReport, exportReport } from '../../services/reportsService';
import { useAuth } from '../../context/AuthContext';

const FY_BASED_REPORTS = new Set(['pnl', 'balance-sheet']);

const getCurrentFYEndYear = () => {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
};

const buildFYOptions = () => {
  const endYear = getCurrentFYEndYear();
  return Array.from({ length: 6 }, (_, i) => {
    const y = endYear - i;
    return { value: y, label: `FY ${y - 1}-${String(y).slice(-2)}` };
  });
};

const REPORTS = [
  { id: 1, title: 'Profit & Loss',  key: 'pnl',           description: 'Revenue & expense breakdown with margins',   icon: DollarSign, color: '#1d4ed8' },
  { id: 2, title: 'Balance Sheet',  key: 'balance-sheet',  description: 'Assets, liabilities & equity snapshot',      icon: PieChart,   color: '#7c3aed' },
  { id: 3, title: 'Cash Flow',      key: 'cash-flow',      description: 'Monthly inflow, outflow & running balance',   icon: TrendingUp, color: '#059669' },
  { id: 4, title: 'Tax Summary',    key: 'tax',            description: 'Corporate tax, surcharge, cess & GST',       icon: FileText,   color: '#f59e0b' },
  { id: 5, title: 'GST Report',     key: 'gst',            description: 'GSTR-3B output vs input tax breakdown',      icon: BarChart3,  color: '#f97316' },
];

const ReportsDashboard = () => {
  const { currentCompany } = useAuth();
  const [activeReport, setActiveReport] = useState(null);
  const [reportData,   setReportData]   = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [isExporting,  setIsExporting]  = useState(false);
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [selectedFY,   setSelectedFY]   = useState(getCurrentFYEndYear());

  const fyOptions = useMemo(() => buildFYOptions(), []);
  const isFYBased = activeReport ? FY_BASED_REPORTS.has(activeReport.key) : false;
  const dateRange = { from: dateFrom || undefined, to: dateTo || undefined, fy: undefined };
  const fyRange   = { fy: selectedFY };

  const handleGenerate = async (report) => {
    if (!currentCompany) return;
    setActiveReport(report);
    setReportData(null);
    setLoading(true);
    try {
      const params = FY_BASED_REPORTS.has(report.key) ? { fy: selectedFY } : dateRange;
      const data = await fetchReport(report.key, currentCompany.id, params);
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
      const params = isFYBased ? fyRange : dateRange;
      await exportReport(activeReport.key, format.toLowerCase(), currentCompany.id, false, params);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      {/* Filters */}
      <div className="reports-date-filter">
        <div className="rdf-icon"><Calendar size={18} /></div>

        {/* FY selector — for P&L and Balance Sheet */}
        <div className="rdf-fy-block">
          <span className="rdf-label">Financial Year</span>
          <select
            className="rdf-fy-select"
            value={selectedFY}
            onChange={e => setSelectedFY(Number(e.target.value))}
          >
            {fyOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="rdf-fy-hint">· P&amp;L &amp; Balance Sheet</span>
        </div>

        <div className="rdf-divider" />

        {/* Date range — for Cash Flow, Tax, GST */}
        <span className="rdf-label">Date Range</span>
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
          <ExportButtons onExport={handleExport} isExporting={isExporting} />

          {loading ? (
            <div className="rv-loading">
              <div className="rv-spinner" />
              <span>Generating {activeReport.title}…</span>
            </div>
          ) : (
            <>
              <ReportViewer reportKey={activeReport.key} title={activeReport.title} data={reportData} />
              <ReportAnalysis reportKey={activeReport.key} data={reportData} />
            </>
          )}
        </>
      )}
    </>
  );
};

export default ReportsDashboard;
