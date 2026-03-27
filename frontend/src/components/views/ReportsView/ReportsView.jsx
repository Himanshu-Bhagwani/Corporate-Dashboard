import React, { useState } from 'react';
import './ReportsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { DollarSign, TrendingUp, PieChart, FileText, BarChart3, Download, Calendar, CheckCircle, Clock, Star } from 'lucide-react';

const ReportsView = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('Month');
  const [hoveredCard, setHoveredCard] = useState(null);

  const reportTypes = [
    {
      id: 1,
      title: 'Income & Expense Report',
      description: 'Detailed breakdown of all income and expenses',
      icon: DollarSign,
      color: 'blue',
      gradient: 'linear-gradient(135deg, #3557ea 0%, #3557ea 100%)',
      stats: { generated: 12, lastMonth: '+8%' }
    },
    {
      id: 2,
      title: 'Cash Flow Statement',
      description: 'Track money movement in and out',
      icon: TrendingUp,
      color: 'green',
      gradient: 'linear-gradient(135deg, #059669 0%, #059669 100%)',
      stats: { generated: 8, lastMonth: '+15%' }
    },
    {
      id: 3,
      title: 'Budget Analysis',
      description: 'Compare actual vs budgeted amounts',
      icon: PieChart,
      color: 'purple',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #7c3aed 100%)',
      stats: { generated: 6, lastMonth: '+12%' }
    },
    {
      id: 4,
      title: 'Tax Summary',
      description: 'Annual tax-related transactions',
      icon: FileText,
      color: 'orange',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #f59e0b 100%)',
      stats: { generated: 4, lastMonth: 'New' }
    },
    {
      id: 5,
      title: 'Investment Performance',
      description: 'Portfolio returns and performance metrics',
      icon: BarChart3,
      color: 'red',
      gradient: 'linear-gradient(135deg, #F76B1C 0%, #F76B1C 100%)',
      stats: { generated: 10, lastMonth: '+20%' }
    }
  ];

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

  const periods = ['Week', 'Month', 'Quarter', 'Year', 'Custom'];

  const handleGenerateReport = (reportTitle) => {
    console.log(`Generating ${reportTitle} for ${selectedPeriod}`);
  };

  const handleDownloadReport = (reportName) => {
    console.log(`Downloading ${reportName}`);
  };

  const handleExport = (format) => {
    console.log(`Exporting reports as ${format}`);
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

      {/* Report Period Selector */}
      <div className="report-period-section">
        <div className="period-selector-header">
          <Calendar size={20} />
          <span className="period-label">Report Period</span>
        </div>
        <div className="period-buttons">
          {periods.map((period) => (
            <button
              key={period}
              className={`period-button ${selectedPeriod === period ? 'active' : ''}`}
              onClick={() => setSelectedPeriod(period)}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Available Reports */}
      <div className="reports-section">
        <h2 className="section-title-reports">Available Reports</h2>
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
                {/* Background Gradient */}
                <div className="report-card-bg" style={{ background: report.gradient }}></div>
                
                {/* Decorative Circles */}
                <div className="report-card-decoration">
                  <div className="decoration-circle-report circle-1"></div>
                  <div className="decoration-circle-report circle-2"></div>
                </div>

                {/* Card Content */}
                <div className="report-card-content-wrapper">
                  <div className="report-card-header">
                    <div className="report-icon-badge" style={{ background: report.gradient }}>
                      <IconComponent size={24} />
                    </div>
                    <div className="report-stats-mini">
                      <span className="reports-count">{report.stats.generated} reports</span>
                      <span className={`report-trend ${report.stats.lastMonth === 'New' ? 'new' : 'positive'}`}>
                        {report.stats.lastMonth}
                      </span>
                    </div>
                  </div>

                  <div className="report-card-body">
                    <h3 className="report-card-title">{report.title}</h3>
                    <p className="report-card-description">{report.description}</p>
                  </div>

                  <button
                    className="btn-generate-report"
                    onClick={() => handleGenerateReport(report.title)}
                  >
                    <Download size={18} />
                    Generate Report
                  </button>
                </div>

                {/* Shine Effect */}
                <div className="report-card-shine"></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export Section */}
      <div className="export-section-enhanced">
        <div className="export-header">
          <div className="export-icon-box">
            <Download size={24} />
          </div>
          <div>
            <h2 className="export-title">Export Options</h2>
            <p className="export-subtitle">Download your reports in multiple formats</p>
          </div>
        </div>
        <div className="export-buttons-grid">
          <button className="export-button-enhanced pdf" onClick={() => handleExport('PDF')}>
            <div className="export-btn-icon">
              <FileText size={20} />
            </div>
            <div className="export-btn-content">
              <span className="export-btn-label">PDF</span>
              <span className="export-btn-desc">Portable Document</span>
            </div>
          </button>
          <button className="export-button-enhanced excel" onClick={() => handleExport('Excel')}>
            <div className="export-btn-icon">
              <BarChart3 size={20} />
            </div>
            <div className="export-btn-content">
              <span className="export-btn-label">Excel</span>
              <span className="export-btn-desc">Spreadsheet Format</span>
            </div>
          </button>
          <button className="export-button-enhanced csv" onClick={() => handleExport('CSV')}>
            <div className="export-btn-icon">
              <FileText size={20} />
            </div>
            <div className="export-btn-content">
              <span className="export-btn-label">CSV</span>
              <span className="export-btn-desc">Comma Separated</span>
            </div>
          </button>
        </div>
      </div>

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