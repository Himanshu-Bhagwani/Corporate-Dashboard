import React from 'react';

const ComplianceAlerts = ({ alerts, onMarkFiled }) => {
  if (!alerts || alerts.length === 0) {
    return <div style={{ padding: '1rem', color: '#718096' }}>No upcoming alerts. You are all caught up!</div>;
  }

  return (
    <div className="dashboard-risk-alerts" style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {alerts.map((alert) => {
        const isOverdue = alert.status === 'OVERDUE';
        return (
          <div key={alert.id} className="dashboard-risk-alert-row" style={{ marginBottom: 0 }}>
            <div className="risk-alert-left">
              <div className="risk-alert-icon" style={isOverdue ? { color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)' } : { color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
                {isOverdue ? '!' : '⏰'}
              </div>
              <div>
                <div className="risk-alert-title">{alert.title}</div>
                <div className="risk-alert-meta">Due: {alert.due_date} | {alert.type}</div>
              </div>
            </div>
            <div className="risk-alert-right">
              <span className="due-soon-badge" style={isOverdue ? { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' } : { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                {isOverdue ? 'Overdue' : 'Due Soon'}
              </span>
              <button className="mark-filed-btn" onClick={() => onMarkFiled(alert.id)}>Mark as Filed</button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ComplianceAlerts;
