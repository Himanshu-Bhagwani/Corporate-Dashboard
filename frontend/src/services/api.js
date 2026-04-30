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

  // Delete all transactions for the company
  deleteAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/transactions/all`, {
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
    const response = await fetch(`${BASE_URL}/compliance/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify({ status: 'FILED', payment_status: 'PAID' }),
    });
    return handleResponse(response);
  },

  create: async (event, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(event),
    });
    return handleResponse(response);
  },

  delete: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance/${id}`, {
      method: 'DELETE',
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
  },
  chatWithCFO: async (message, companyId) => {
    const response = await fetch(`${BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify({ message }),
    });
    return handleResponse(response);
  },
  // Streaming chat — calls onToken(token) for each word/chunk
  chatWithCFOStream: async (message, companyId, onToken) => {
    const response = await fetch(`${BASE_URL}/ai/chat-stream`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify({ message }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Stream failed' }));
      throw new Error(err.error || 'Stream failed');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const { token } = JSON.parse(payload);
          if (token) onToken(token);
        } catch (e) { /* skip */ }
      }
    }
  },
  getChatHistory: async (companyId) => {
    const response = await fetch(`${BASE_URL}/ai/chat-history`, {
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },
  clearChatHistory: async (companyId) => {
    const response = await fetch(`${BASE_URL}/ai/chat-history`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },
  exportChatPDF: async (companyId) => {
    const response = await fetch(`${BASE_URL}/ai/chat-export`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'x-company-id': companyId,
      },
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI_CFO_Report.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
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

  // Ledger Contacts (customer/vendor management)
  createContact: async (contact, companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/contacts`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(contact),
    });
    return handleResponse(response);
  },

  updateContact: async (id, contact, companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/contacts/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify(contact),
    });
    return handleResponse(response);
  },

  deleteContact: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/contacts/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },

  toggleImportant: async (name, contact_type, companyId) => {
    const response = await fetch(`${BASE_URL}/accounting/contacts/toggle-important`, {
      method: 'PATCH',
      headers: getHeaders(companyId),
      body: JSON.stringify({ name, contact_type }),
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

export const documentsAPI = {
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/compliance-documents`, {
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },

  upload: async (file, name, category, expiryDate, companyId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('category', category);
    if (expiryDate) formData.append('expiry_date', expiryDate);

    const response = await fetch(`${BASE_URL}/compliance-documents/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'x-company-id': companyId,
      },
      body: formData,
    });
    return handleResponse(response);
  },

  getViewUrl: (id, companyId) =>
    `${BASE_URL}/compliance-documents/${id}/view?token=${localStorage.getItem('token')}&company=${companyId}`,

  download: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance-documents/${id}/download`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'x-company-id': companyId,
      },
    });
    if (!response.ok) throw new Error('Download failed');
    return response;
  },

  delete: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance-documents/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },
};

export const noticesAPI = {
  getAll: async (companyId) => {
    const response = await fetch(`${BASE_URL}/compliance-notices`, {
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },

  create: async (notice, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance-notices`, {
      method: 'POST',
      headers: getHeaders(companyId),
      body: JSON.stringify(notice),
    });
    return handleResponse(response);
  },

  updateStatus: async (id, status, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance-notices/${id}`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify({ status }),
    });
    return handleResponse(response);
  },

  delete: async (id, companyId) => {
    const response = await fetch(`${BASE_URL}/compliance-notices/${id}`, {
      method: 'DELETE',
      headers: getHeaders(companyId),
    });
    return handleResponse(response);
  },
};

export const companiesAPI = {
  upgradePlan: async (companyId, plan) => {
    const response = await fetch(`${BASE_URL}/companies/${companyId}/plan`, {
      method: 'PUT',
      headers: getHeaders(companyId),
      body: JSON.stringify({ plan }),
    });
    return handleResponse(response);
  },
};