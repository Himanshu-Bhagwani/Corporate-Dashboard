import React from 'react';
import './ReportsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import ReportsDashboard from '../../Reports/ReportsDashboard';
import { FileText, Download, Zap } from 'lucide-react';

const ReportsView = () => (
  <>
    <EmbeddedHeader />
    <div className="reports-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Financial Reports</h1>
          <p className="view-subtitle">Generate industry-standard reports with date range filtering and export to PDF or Excel</p>
        </div>
      </div>

      <div className="reports-stats-grid">
        <div className="report-stat-card">
          <div className="report-stat-icon-wrapper green"><FileText size={20} /></div>
          <div className="report-stat-content">
            <div className="report-stat-label">5 Report Types</div>
            <div className="report-stat-value">P&L · BS · CF</div>
            <div className="report-stat-sublabel">Tax · GST included</div>
          </div>
        </div>
        <div className="report-stat-card">
          <div className="report-stat-icon-wrapper blue"><Download size={20} /></div>
          <div className="report-stat-content">
            <div className="report-stat-label">Export Formats</div>
            <div className="report-stat-value">PDF + Excel</div>
            <div className="report-stat-sublabel">Styled, board-ready output</div>
          </div>
        </div>
        <div className="report-stat-card">
          <div className="report-stat-icon-wrapper purple"><Zap size={20} /></div>
          <div className="report-stat-content">
            <div className="report-stat-label">AI Narrative</div>
            <div className="report-stat-value">Beta</div>
            <div className="report-stat-sublabel">CA-grade executive summary</div>
          </div>
        </div>
      </div>

      <ReportsDashboard />
    </div>
  </>
);

export default ReportsView;
