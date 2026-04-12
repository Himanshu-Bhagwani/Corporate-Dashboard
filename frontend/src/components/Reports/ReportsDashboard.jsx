import React, { useState } from 'react';
import { DollarSign, TrendingUp, PieChart, FileText, BarChart3, Download } from 'lucide-react';
import ExportButtons from './ExportButtons';
import ReportViewer from './ReportViewer';
import { fetchReport, exportReport } from '../../services/reportsService';
import { useAuth } from '../../context/AuthContext';

const ReportsDashboard = () => {
  const { currentCompany } = useAuth();
  const [activeReport, setActiveReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);

  const reportTypes = [
    { id: 1, title: 'Profit & Loss', key: 'pnl', description: 'Detailed breakdown of credits and debits', icon: DollarSign, gradient: 'linear-gradient(135deg, #3557ea 0%, #3557ea 100%)' },
    { id: 2, title: 'Balance Sheet', key: 'balance-sheet', description: 'Snapshot of assets, liabilities, and equity', icon: PieChart, gradient: 'linear-gradient(135deg, #7c3aed 0%, #7c3aed 100%)' },
    { id: 3, title: 'Cash Flow', key: 'cash-flow', description: 'Track cash movement in and out', icon: TrendingUp, gradient: 'linear-gradient(135deg, #059669 0%, #059669 100%)' },
    { id: 4, title: 'Tax Summary', key: 'tax', description: 'Estimated tax liabilities', icon: FileText, gradient: 'linear-gradient(135deg, #f59e0b 0%, #f59e0b 100%)' },
    { id: 5, title: 'GST Report', key: 'gst', description: 'GST input and output breakdown', icon: BarChart3, gradient: 'linear-gradient(135deg, #F76B1C 0%, #F76B1C 100%)' }
  ];

  const handleGenerateReport = async (report) => {
    setActiveReport(report.title);
    try {
      const data = await fetchReport(report.key, currentCompany.id);
      setReportData(data);
    } catch (err) {
      console.error('Failed to generate report', err);
      setReportData({ error: 'Failed to load report data' });
    }
  };

  const [includeAI, setIncludeAI] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format) => {
    if (!activeReport) return alert('Please generate a report first.');
    const reportTemplate = reportTypes.find(r => r.title === activeReport);
    setIsExporting(true);
    try {
      await exportReport(reportTemplate.key, format.toLowerCase(), currentCompany.id, includeAI);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="reports-section">
        <h2 className="section-title-reports">Select a Report</h2>
        <div className="reports-grid">
          {reportTypes.map((report) => {
            const IconComponent = report.icon;
            return (
              <div
                key={report.id}
                className={`report-card-premium ${hoveredCard === report.id ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredCard(report.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <div className="report-card-bg" style={{ background: report.gradient }}></div>
                <div className="report-card-content-wrapper">
                  <div className="report-card-header">
                    <div className="report-icon-badge" style={{ background: report.gradient }}>
                      <IconComponent size={24} />
                    </div>
                  </div>
                  <div className="report-card-body">
                    <h3 className="report-card-title">{report.title}</h3>
                    <p className="report-card-description">{report.description}</p>
                  </div>
                  <button className="btn-generate-report" onClick={() => handleGenerateReport(report)}>
                    <Download size={18} /> Generate Report
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {activeReport && (
        <React.Fragment>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', background: 'linear-gradient(to right, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '1.5rem', width: 'fit-content' }}>
            <input
              type="checkbox"
              id="ai-toggle"
              checked={includeAI}
              onChange={(e) => setIncludeAI(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer' }}
            />
            <label htmlFor="ai-toggle" style={{ fontSize: '14px', fontWeight: 500, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px' }}>🪄</span> Include AI Executive Narrative (Beta)
            </label>
            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '12px' }}>
              Requires local Ollama to be active. Output may take ~10-15s longer.
            </span>
          </div>
          <ExportButtons onExport={handleExport} isGeneratingAI={includeAI} isExporting={isExporting} />
          <ReportViewer title={activeReport} data={reportData} />
        </React.Fragment>
      )}
    </>
  );
};

export default ReportsDashboard;
