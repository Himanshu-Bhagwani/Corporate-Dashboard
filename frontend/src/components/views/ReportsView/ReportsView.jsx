import React, { useState } from 'react';
import './ReportsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import ReportsDashboard from '../../Reports/ReportsDashboard';
import { FileText, Download, Star, CheckCircle, Clock } from 'lucide-react';

const ReportsView = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('Month');
  const [hoveredCard, setHoveredCard] = useState(null);

  // Removed unused reportTypes array
  const recentReports = [
    {
      id: 1,
      name: 'January 2026 Income Statement',
      date: '2026-02-01',
      format: 'PDF',
      size: '245 KB',
      status: 'completed',
      type: 'Income & Expense'
    },
    {
      id: 2,
      name: 'Q4 2025 Tax Summary',
      date: '2026-01-15',
      format: 'PDF',
      size: '512 KB',
      status: 'completed',
      type: 'Tax Summary'
    },
    {
      id: 3,
      name: 'December 2025 Cash Flow',
      date: '2026-01-05',
      format: 'Excel',
      size: '128 KB',
      status: 'completed',
      type: 'Cash Flow'
    },
    {
      id: 4,
      name: '2025 Annual Report',
      date: '2025-12-31',
      format: 'PDF',
      size: '1.2 MB',
      status: 'processing',
      type: 'Annual Report'
    }
  ];

  const handleDownloadReport = (reportName) => {
    console.log(`Downloading ${reportName}`);
  };

  return (
    <>
      <EmbeddedHeader />
      <div className="reports-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Financial Reports</h1>
          <p className="view-subtitle">Generate and download comprehensive financial reports</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="reports-stats-grid">
        <div className="report-stat-card">
          <div className="report-stat-icon-wrapper green">
            <FileText size={20} />
          </div>
          <div className="report-stat-content">
            <div className="report-stat-label">Total Reports</div>
            <div className="report-stat-value">48</div>
            <div className="report-stat-sublabel">Generated this year</div>
          </div>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon-wrapper blue">
            <Download size={20} />
          </div>
          <div className="report-stat-content">
            <div className="report-stat-label">Downloads</div>
            <div className="report-stat-value">156</div>
            <div className="report-stat-sublabel">Total downloads</div>
          </div>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon-wrapper purple">
            <Star size={20} />
          </div>
          <div className="report-stat-content">
            <div className="report-stat-label">Favorites</div>
            <div className="report-stat-value">12</div>
            <div className="report-stat-sublabel">Saved templates</div>
          </div>
        </div>
      </div>

      <ReportsDashboard />

      {/* Recent Reports */}
      <div className="recent-reports-section-enhanced">
        <h2 className="section-title-reports">Recent Reports</h2>
        <div className="recent-reports-list-enhanced">
          {recentReports.map((report) => (
            <div key={report.id} className="recent-report-item-enhanced">
              <div className="recent-report-left">
                <div className={`recent-report-icon-enhanced ${report.status}`}>
                  {report.status === 'completed' ? (
                    <CheckCircle size={20} />
                  ) : (
                    <Clock size={20} />
                  )}
                </div>
                <div className="recent-report-details-enhanced">
                  <h4 className="recent-report-name-enhanced">{report.name}</h4>
                  <div className="recent-report-meta-enhanced">
                    <span className="report-type-badge">{report.type}</span>
                    <span>{report.date}</span>
                    <span>•</span>
                    <span>{report.format}</span>
                    <span>•</span>
                    <span>{report.size}</span>
                  </div>
                </div>
              </div>
              <div className="recent-report-actions">
                <div className={`status-badge ${report.status}`}>
                  {report.status === 'completed' ? 'Ready' : 'Processing'}
                </div>
                <button
                  className="recent-report-download-enhanced"
                  onClick={() => handleDownloadReport(report.name)}
                  disabled={report.status !== 'completed'}
                >
                  <Download size={18} />
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </>
  );
};

export default ReportsView;