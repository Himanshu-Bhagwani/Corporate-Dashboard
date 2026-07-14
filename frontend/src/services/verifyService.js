/**
 * SODA Business — Government Verification Service (Frontend)
 * Calls /api/verify/* endpoints and returns structured results.
 */

import api from './api';

/**
 * Verify a GSTIN number.
 * Returns { ok, badge, legalName, address, status, extraData, error? }
 */
export const verifyGstin = async (gstin) => {
  try {
    const { data } = await api.post('/verify/gstin', { gstin });
    return data;
  } catch (err) {
    return { ok: false, badge: 'RED', error: err.response?.data?.error || 'Verification failed' };
  }
};

/**
 * Verify a PAN number.
 * Returns { ok, badge, legalName, panType, status, error? }
 */
export const verifyPan = async (pan) => {
  try {
    const { data } = await api.post('/verify/pan', { pan });
    return data;
  } catch (err) {
    return { ok: false, badge: 'RED', error: err.response?.data?.error || 'PAN verification failed' };
  }
};

/**
 * Lookup a CIN / Company via MCA21.
 * Returns { ok, badge, legalName, address, extraData, error? }
 */
export const verifyCin = async (cin) => {
  try {
    const { data } = await api.post('/verify/cin', { cin });
    return data;
  } catch (err) {
    return { ok: false, badge: 'RED', error: err.response?.data?.error || 'CIN lookup failed' };
  }
};

/**
 * Get verification status for the active company.
 * Returns { badge, verifications: [] }
 */
export const getVerificationStatus = async () => {
  try {
    const { data } = await api.get('/verify/status');
    return data;
  } catch (err) {
    return { badge: 'AMBER', verifications: [] };
  }
};

/**
 * Get full verification audit log.
 */
export const getVerificationAudit = async () => {
  try {
    const { data } = await api.get('/verify/audit');
    return data;
  } catch {
    return [];
  }
};

// Badge colour map for UI rendering
export const BADGE_COLORS = {
  GREEN: { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'Verified' },
  AMBER: { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: 'Partially Verified' },
  RED:   { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Unverified / Mismatch' },
};
