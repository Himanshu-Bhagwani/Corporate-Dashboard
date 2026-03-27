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
    if (!response.ok) throw new Error('Failed to fetch transactions');
    return response.json();
  },

  // Create a new transaction
  create: async (transaction, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(transaction),
    });
    if (!response.ok) throw new Error('Failed to create transaction');
    return response.json();
  },

  // Bulk create transactions (for CSV/PDF upload)
  bulkCreate: async (transactions, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/bulk`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify({ transactions }),
    });
    if (!response.ok) throw new Error('Failed to create transactions');
    return response.json();
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
    if (!response.ok) throw new Error('Failed to upload CSV');
    return response.json();
  },

  // Update an existing transaction by id
  update: async (id, transaction, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(transaction),
    });
    if (!response.ok) throw new Error('Failed to update transaction');
    return response.json();
  },

  // Delete a transaction by id
  delete: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    if (!response.ok) throw new Error('Failed to delete transaction');
    return response.json();
  },

  // Get analytics data
  getAnalytics: async (companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/analytics`, {
      headers: getHeaders(companyId)
    });
    if (!response.ok) throw new Error('Failed to fetch analytics');
    return response.json();
  },
};

export const accountsAPI = {

  // Fetch all accounts with live balances computed from transactions
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/accounts`, {
      headers: getHeaders(companyId)
    });
    if (!response.ok) throw new Error('Failed to fetch accounts');
    return response.json();
  },

  // Create a new account
  create: async (account, companyId) => {
    const response = await fetch(`${BASE_URL}/accounts`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(account),
    });
    if (!response.ok) throw new Error('Failed to create account');
    return response.json();
  },

  // Update an existing account by id
  update: async (id, account, companyId) => {
    const response = await fetch(`${BASE_URL}/accounts/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(account),
    });
    if (!response.ok) throw new Error('Failed to update account');
    return response.json();
  },

  // Delete an account by id
  delete: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/accounts/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    if (!response.ok) throw new Error('Failed to delete account');
    return response.json();
  },
};

export const dashboardAPI = {
  getSummary: async (companyId) => {
    const response = await fetch(`${BASE_URL}/dashboard/summary`, {
      headers: getHeaders(companyId)
    });
    if (!response.ok) throw new Error('Failed to fetch dashboard summary');
    return response.json();
  },
};

export const invoicesAPI = {
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/invoices`, {
      headers: getHeaders(companyId)
    });
    if (!response.ok) throw new Error('Failed to fetch invoices');
    return response.json();
  },

  create: async (invoice, companyId) => {
    const response = await fetch(`${BASE_URL}/invoices`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(invoice),
    });
    if (!response.ok) throw new Error('Failed to create invoice');
    return response.json();
  },

  update: async (id, invoice, companyId) => {
    const response = await fetch(`${BASE_URL}/invoices/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(invoice),
    });
    if (!response.ok) throw new Error('Failed to update invoice');
    return response.json();
  },
};

export const complianceAPI = {
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/compliance`, {
      headers: getHeaders(companyId)
    });
    if (!response.ok) throw new Error('Failed to fetch compliance filings');
    return response.json();
  },

  markFiled: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance/${id}/filed`, {
      method: 'PUT',
      headers: getHeaders(companyId),
    });
    if (!response.ok) throw new Error('Failed to mark filing');
    return response.json();
  },
};