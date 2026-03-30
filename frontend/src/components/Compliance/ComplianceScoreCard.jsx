import React from 'react';

const ComplianceScoreCard = ({ score }) => {
  const getStatus = (s) => {
    if (s >= 80) return { label: 'Good Standing', color: '#10b981' };
    if (s >= 50) return { label: 'Improving', color: '#f59e0b' };
    return { label: 'Needs Attention', color: '#ef4444' };
  };

  const status = getStatus(score);

  return (
    <div className="compliance-kpi-card" style={{ borderTop: `4px solid ${status.color}` }}>
      <div className="compliance-kpi-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Compliance Score
      </div>
      <div className="compliance-kpi-value" style={{ color: status.color, fontSize: '28px', margin: '10px 0' }}>
        {score} <span style={{ fontSize: '14px', color: '#718096' }}>/ 100</span>
      </div>
      <div className="compliance-kpi-sub" style={{ fontWeight: 600, color: status.color }}>
        {status.label}
      </div>
    </div>
  );
};

export default ComplianceScoreCard;
