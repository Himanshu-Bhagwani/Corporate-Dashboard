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

// Defensive helper to parse JSON and handle HTML/Text error pages (like Nginx 413)
async function handleResponse(response) {
  const contentType = response.headers.get('content-type');
  let data;
  
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    // Non-JSON (HTML/Text) - Likely Nginx error page or server crash
    const text = await response.text();
    const match = text.match(/<title>(.*?)<\/title>/i);
    const errorMsg = match ? match[1] : `Server Error (${response.status})`;
    throw new Error(errorMsg);
  }

  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}: ${response.statusText}`);
  }
  return data;
}

export const transactionsAPI = {

  // Fetch all transactions, optionally filtered
  getAll: async (filters = {}, companyId) => {
    const params = new URLSearchParams();
    if (filters.date) params.append('date', filters.date);
    if (filters.type && filters.type !== 'all') params.append('type', filters.type);
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.category && filters.category !== 'all') params.append('category', filters.category);
    if (filters.search) params.append('search', filters.search);

    const response = await fetch(`${BASE_URL}/transactions?${params.toString()}`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },

  // Create a new transaction
  create: async (transaction, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(transaction),
    });
    return handleResponse(response);
  },

  // Bulk create transactions (for CSV/PDF upload)
  bulkCreate: async (transactions, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/bulk`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify({ transactions }),
    });
    return handleResponse(response);
  },

  // Upload CSV file
  uploadCSV: async (file, companyId) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${BASE_URL}/transactions/upload-csv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'x-company-id': companyId,
      },
      body: formData,
    });
    return handleResponse(response);
  },

  // Upload PDF Statement (Deterministic Parser)
  uploadPDF: async (file, companyId) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${BASE_URL}/transactions/upload-statement`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'x-company-id': companyId,
      },
      body: formData,
    });
    return handleResponse(response);
  },

  // Update an existing transaction by id
  update: async (id, transaction, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(transaction),
    });
    return handleResponse(response);
  },

  // Delete a transaction by id
  delete: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },

  // Get analytics data
  getAnalytics: async (companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/analytics`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },
};

export const accountsAPI = {

  // Fetch all accounts with live balances computed from transactions
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/accounts`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },

  // Create a new account
  create: async (account, companyId) => {
    const response = await fetch(`${BASE_URL}/accounts`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(account),
    });
    return handleResponse(response);
  },

  // Update an existing account by id
  update: async (id, account, companyId) => {
    const response = await fetch(`${BASE_URL}/accounts/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(account),
    });
    return handleResponse(response);
  },

  // Delete an account by id
  delete: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/accounts/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },
};

export const dashboardAPI = {
  getSummary: async (companyId) => {
    const response = await fetch(`${BASE_URL}/dashboard/summary`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },
  getInsights: async (companyId) => {
    const response = await fetch(`${BASE_URL}/dashboard/insights`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },
};

export const invoicesAPI = {
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/invoices`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },

  create: async (invoice, companyId) => {
    const response = await fetch(`${BASE_URL}/invoices`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(invoice),
    });
    return handleResponse(response);
  },

  update: async (id, invoice, companyId) => {
    const response = await fetch(`${BASE_URL}/invoices/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(invoice),
    });
    return handleResponse(response);
  },
};

export const complianceAPI = {
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/compliance`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },

  markFiled: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance/${id}/filed`, {
      method: 'PUT',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },
};

export const aiAPI = {
  complianceReview: async (companyId, visibleScore, pendingCount, overdueCount) => {
    const response = await fetch(`${BASE_URL}/ai/compliance-review`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify({ visibleScore, pendingCount, overdueCount })
    });
    return handleResponse(response);
  },
  parseOCR: async (file, companyId) => {
    const formData = new FormData();
    formData.append('invoice', file);

    // Browser must set the boundary header automatically for multipart parsing
    const headers = getHeaders(companyId);
    delete headers['Content-Type'];

    const response = await fetch(`${BASE_URL}/ai/ocr-invoice`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return handleResponse(response);
  }
};

export const accountingAPI = {
  // Ledger
  getLedger: async (companyId, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.filter) params.append('filter', filters.filter);
    const response = await fetch(`${BASE_URL}/accounting/ledger?${params.toString()}`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },

  // Chart of Accounts
  getChartOfAccounts: async (companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/chart-of-accounts`, {
      headers: getHeaders(companyId)
    });
    return handleResponse(response);
  },

  createChartOfAccountsEntry: async (entry, companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/chart-of-accounts`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(entry),
    });
    return handleResponse(response);
  },

  updateChartOfAccountsEntry: async (id, entry, companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/chart-of-accounts/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(entry),
    });
    return handleResponse(response);
  },

  deleteChartOfAccountsEntry: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/chart-of-accounts/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },
};

export const notificationsAPI = {
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/notifications`, {
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },

  dismiss: async (notificationKey, companyId) => {
    const response = await fetch(`${BASE_URL}/notifications/dismiss`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify({ notificationKey }),
    });
    return handleResponse(response);
  },

  dismissAll: async (keys, companyId) => {
    const response = await fetch(`${BASE_URL}/notifications/dismiss-all`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify({ keys }),
    });
    return handleResponse(response);
  },
};