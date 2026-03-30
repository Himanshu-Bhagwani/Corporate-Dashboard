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

export const fetchReport = async (type, companyId) => {
  const res = await fetch(`${BASE_URL}/reports/${type}`, { headers: getHeaders(companyId) });
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
};

export const exportReport = async (type, format, companyId, includeAI = false) => {
  const aiParam = includeAI ? '&ai=true' : '';
  const res = await fetch(`${BASE_URL}/reports/export?type=${type}&format=${format}${aiParam}`, {
    headers: getHeaders(companyId)
  });
  if (!res.ok) throw new Error('Failed to export report');
  
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${type}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
