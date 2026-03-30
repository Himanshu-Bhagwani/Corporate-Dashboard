import React from 'react';

const ComplianceCalendar = ({ events }) => {
  return (
    <div className="table-container" style={{ marginTop: '2rem' }}>
      <div className="cashflow-table-title" style={{ marginBottom: '1.25rem' }}>Compliance Timeline</div>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ paddingBottom: '12px' }}>Title</th>
            <th style={{ paddingBottom: '12px' }}>Type</th>
            <th style={{ paddingBottom: '12px' }}>Due Date</th>
            <th style={{ paddingBottom: '12px' }}>Status</th>
            <th style={{ paddingBottom: '12px' }}>Payment</th>
          </tr>
        </thead>
        <tbody>
          {events.map((item) => (
            <tr key={item.id}>
              <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className="table-main-text">{item.title}</span></td>
              <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className="table-secondary-text">{item.type}</span></td>
              <td style={{ paddingTop: '16px', paddingBottom: '16px' }}><span className="table-secondary-text">{item.due_date}</span></td>
              <td style={{ paddingTop: '16px', paddingBottom: '16px' }}>
                <span className={`status-pill ${item.status === 'FILED' ? 'ok' : item.status === 'OVERDUE' ? 'danger' : 'warn'}`}>{item.status}</span>
              </td>
              <td style={{ paddingTop: '16px', paddingBottom: '16px' }}>
                <span className={`status-pill ${item.payment_status === 'PAID' ? 'ok' : 'neutral'}`}>{item.payment_status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ComplianceCalendar;
