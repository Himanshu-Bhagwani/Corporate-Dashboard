import React from 'react';

const ReportViewer = ({ title, data }) => {
  if (!data) return <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>Select a report to view details.</div>;

  return (
    <div className="reports-section" style={{ marginTop: '2rem' }}>
      <h2 className="section-title-reports">{title} Details</h2>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', color: '#2d3748' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ReportViewer;
