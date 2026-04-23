const BASE_URL = '/api';

const getHeaders = (companyId) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  ...(companyId ? { 'x-company-id': companyId } : {})
});

export const fetchReport = async (type, companyId, { from, to } = {}) => {
  const qs = new URLSearchParams();
  if (from) qs.append('from', from);
  if (to)   qs.append('to', to);
  const query = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${BASE_URL}/reports/${type}${query}`, { headers: getHeaders(companyId) });
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
};

export const exportReport = async (type, format, companyId, includeAI = false, { from, to } = {}) => {
  const qs = new URLSearchParams({ type, format });
  if (includeAI) qs.append('ai', 'true');
  if (from) qs.append('from', from);
  if (to)   qs.append('to', to);
  const res = await fetch(`${BASE_URL}/reports/export?${qs}`, { headers: getHeaders(companyId) });
  if (!res.ok) throw new Error('Failed to export report');
  const blob = await res.blob();
  const url  = window.URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${type}-report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
