import React, { useEffect, useState } from 'react';
import ComplianceScoreCard from './ComplianceScoreCard';
import ComplianceAlerts from './ComplianceAlerts';
import ComplianceCalendar from './ComplianceCalendar';
import { getComplianceEvents, getComplianceScore, getAlerts, updateComplianceEvent } from '../../services/complianceService';
import { useAuth } from '../../context/AuthContext';

const ComplianceDashboard = () => {
  const { currentCompany } = useAuth();
  const [events, setEvents] = useState([]);
  const [alerts, setAlertsList] = useState([]);
  const [score, setScore] = useState(100);

  const loadData = async () => {
    if (!currentCompany) return;
    try {
      const [eventsData, scoreData, alertsData] = await Promise.all([
        getComplianceEvents(currentCompany.id),
        getComplianceScore(currentCompany.id),
        getAlerts(currentCompany.id)
      ]);
      setEvents(eventsData);
      setScore(scoreData.score);
      setAlertsList(alertsData);
    } catch (err) {
      console.error('Failed to load compliance radar data', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentCompany]);

  const handleMarkFiled = async (id) => {
    try {
      await updateComplianceEvent(id, { status: 'FILED' }, currentCompany.id);
      loadData();
    } catch (err) {
      console.error('Failed to mark filed', err);
    }
  };

  return (
    <div className="dashboard-section" style={{ border: 'none', padding: 0, boxShadow: 'none' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c', marginBottom: '4px' }}>Compliance Radar</h3>
      <p style={{ fontSize: '13px', color: '#718096', marginBottom: '1.5rem' }}>Real-time overview of your compliance health</p>

      <div className="compliance-kpi-grid" style={{ marginBottom: '2rem' }}>
        <ComplianceScoreCard score={score} />
        {/* Additional KPI cards could go here */}
      </div>

      <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1a202c', marginBottom: '1rem' }}>Actionable Alerts</h4>
      <ComplianceAlerts alerts={alerts} onMarkFiled={handleMarkFiled} />

      <ComplianceCalendar events={events} />
    </div>
  );
};

export default ComplianceDashboard;
