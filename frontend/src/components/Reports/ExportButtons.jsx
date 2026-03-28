import React from 'react';
import { Download, FileText, BarChart3 } from 'lucide-react';

const ExportButtons = ({ onExport, isGeneratingAI, isExporting }) => {
  return (
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
        <button 
          className="export-button-enhanced pdf" 
          onClick={() => onExport('pdf')}
          disabled={isExporting}
          style={isExporting ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
        >
          <div className="export-btn-icon">
            <FileText size={20} />
          </div>
          <div className="export-btn-content">
            <span className="export-btn-label">{isExporting ? 'Generating...' : 'PDF'}</span>
            <span className="export-btn-desc">Portable Document Format</span>
          </div>
        </button>
        <button 
          className="export-button-enhanced excel" 
          onClick={() => onExport('excel')}
          disabled={isExporting}
          style={isExporting ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
        >
          <div className="export-btn-icon">
            <BarChart3 size={20} />
          </div>
          <div className="export-btn-content">
            <span className="export-btn-label">{isExporting ? 'Generating...' : 'Excel'}</span>
            <span className="export-btn-desc">Spreadsheet Format</span>
          </div>
        </button>
      </div>
    </div>
  );
};

export default ExportButtons;
