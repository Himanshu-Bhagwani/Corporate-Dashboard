/**
 * SODA Business — Tally Integration Service (Frontend)
 */

import api from './api';

/** Test if Tally is reachable */
export const getTallyStatus = async () => {
  try {
    const { data } = await api.get('/tally/status');
    return data;
  } catch (err) {
    return { connected: false, error: err.message };
  }
};

/**
 * Trigger a Tally sync.
 * @param {{ syncTypes: string[], fromDate?: string, toDate?: string }} options
 */
export const runTallySync = async (options = {}) => {
  const { data } = await api.post('/tally/sync', {
    syncTypes: options.syncTypes || ['LEDGER', 'VOUCHER'],
    fromDate: options.fromDate,
    toDate: options.toDate,
  });
  return data;
};

/** Get past sync history */
export const getSyncHistory = async () => {
  try {
    const { data } = await api.get('/tally/sync-history');
    return data;
  } catch {
    return [];
  }
};
