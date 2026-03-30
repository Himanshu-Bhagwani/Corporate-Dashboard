const BASE_URL = '/api';

const getHeaders = (companyId) => {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
  if (companyId) {
    headers['x-company-id'] = companyId;
  }
  return headers;
};

export const getComplianceEvents = async (companyId) => {
  const res = await fetch(`${BASE_URL}/compliance`, { headers: getHeaders(companyId) });
  if (!res.ok) throw new Error('Failed to fetch compliance events');
  return res.json();
};

export const createComplianceEvent = async (event, companyId) => {
  const res = await fetch(`${BASE_URL}/compliance`, {
    method: 'POST',
    headers: getHeaders(companyId),
    body: JSON.stringify(event)
  });
  if (!res.ok) throw new Error('Failed to create event');
  return res.json();
};

export const updateComplianceEvent = async (id, event, companyId) => {
  const res = await fetch(`${BASE_URL}/compliance/${id}`, {
    method: 'PUT',
    headers: getHeaders(companyId),
    body: JSON.stringify(event)
  });
  if (!res.ok) throw new Error('Failed to update event');
  return res.json();
};

export const deleteComplianceEvent = async (id, companyId) => {
  const res = await fetch(`${BASE_URL}/compliance/${id}`, {
    method: 'DELETE',
    headers: getHeaders(companyId)
  });
  if (!res.ok) throw new Error('Failed to delete event');
  return res.json();
};

export const getComplianceScore = async (companyId) => {
  const res = await fetch(`${BASE_URL}/compliance/score`, { headers: getHeaders(companyId) });
  if (!res.ok) throw new Error('Failed to fetch score');
  return res.json();
};

export const getAlerts = async (companyId) => {
  const res = await fetch(`${BASE_URL}/compliance/alerts`, { headers: getHeaders(companyId) });
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
};

export const getComplianceCalendar = async (companyId) => {
  const res = await fetch(`${BASE_URL}/compliance/calendar`, { headers: getHeaders(companyId) });
  if (!res.ok) throw new Error('Failed to fetch calendar');
  return res.json();
};
