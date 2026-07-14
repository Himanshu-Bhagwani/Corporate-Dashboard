/**
 * SODA Business Platform — Government API Service
 * ================================================
 * Handles all Indian government API integrations:
 *   - GSTN (GST Network) — GSTIN verification, return filing status
 *   - IT Department — PAN verification
 *   - MCA21 — CIN / LLP-IN company lookup, director details
 *
 * Architecture:
 *   1. Check local cache (govt_verifications table, expires 24h)
 *   2. If stale/missing, call external API
 *   3. Store result + return to caller
 *
 * API Keys must be set via environment variables:
 *   GSTN_API_KEY, GSTN_API_BASE, PAN_API_KEY, PAN_API_BASE,
 *   MCA_API_KEY, MCA_API_BASE
 *
 * For third-party aggregators (e.g., Sandbox.co.in, RazorpayX):
 *   Set GOVT_API_PROVIDER=sandbox|razorpay and matching keys.
 */

const https = require('https');
const http  = require('http');
const { pool } = require('../config/db');

// ─── Config ───────────────────────────────────────────────────────────────────
const PROVIDER      = process.env.GOVT_API_PROVIDER || 'sandbox'; // sandbox | direct
const SANDBOX_KEY   = process.env.SANDBOX_API_KEY   || '';
const SANDBOX_BASE  = process.env.SANDBOX_API_BASE  || 'https://api.sandbox.co.in';
const GSTN_BASE     = process.env.GSTN_API_BASE     || 'https://api.gst.gov.in';
const GSTN_KEY      = process.env.GSTN_API_KEY      || '';
const PAN_BASE      = process.env.PAN_API_BASE      || '';
const PAN_KEY       = process.env.PAN_API_KEY       || '';
const MCA_BASE      = process.env.MCA_API_BASE      || '';
const MCA_KEY       = process.env.MCA_API_KEY       || '';

const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const apiRequest = (url, options = {}, body = null) => {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const opts   = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
      timeout: 10000, // 10-second timeout on all govt API calls
    };

    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Government API request timed out'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

// ─── Cache helpers ────────────────────────────────────────────────────────────
const getCached = async (companyId, type, value) => {
  const res = await pool.query(
    `SELECT * FROM govt_verifications
     WHERE company_id = $1 AND verify_type = $2 AND input_value = $3
       AND expires_at > NOW()
     ORDER BY verified_at DESC LIMIT 1`,
    [companyId, type, value.toUpperCase()]
  );
  return res.rows[0] || null;
};

const saveCache = async ({ companyId, type, value, status, legalName, address, apiResponse, extraData, userId }) => {
  const res = await pool.query(
    `INSERT INTO govt_verifications
       (company_id, verify_type, input_value, status, legal_name, address, api_response, extra_data, verified_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + INTERVAL '24 hours')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [companyId, type, value.toUpperCase(), status, legalName, address,
     JSON.stringify(apiResponse), JSON.stringify(extraData || {}), userId]
  );
  return res.rows[0];
};

// ─── GSTIN Validation (format check) ─────────────────────────────────────────
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const validateGstinFormat = (gstin) => {
  if (!gstin || typeof gstin !== 'string') return false;
  return GSTIN_REGEX.test(gstin.toUpperCase().trim());
};

// GSTIN checksum validation
const validateGstinChecksum = (gstin) => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let factor = 2, sum = 0;
  const code = gstin.toUpperCase();
  for (let i = code.length - 2; i >= 0; i--) {
    let addend = factor * chars.indexOf(code[i]);
    addend = Math.floor(addend / 36) + (addend % 36);
    sum += addend;
    factor = factor === 2 ? 1 : 2;
  }
  const checkCodePoint = (36 - (sum % 36)) % 36;
  return chars[checkCodePoint] === code[code.length - 1];
};

// ─── PAN Validation (format check) ───────────────────────────────────────────
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const validatePanFormat = (pan) => {
  if (!pan || typeof pan !== 'string') return false;
  return PAN_REGEX.test(pan.toUpperCase().trim());
};

// ─── Sandbox.co.in API helpers ────────────────────────────────────────────────
// Sandbox is a popular Indian API aggregator used for GSTIN/PAN/MCA lookups.
// Docs: https://docs.sandbox.co.in

const sandboxGstinVerify = async (gstin) => {
  return apiRequest(
    `${SANDBOX_BASE}/gst/compliance/public/gst-registration-certificate/verify`,
    {
      method: 'POST',
      headers: { 'x-api-key': SANDBOX_KEY, 'x-api-version': '1.0' },
    },
    { gstin }
  );
};

const sandboxPanVerify = async (pan) => {
  return apiRequest(
    `${SANDBOX_BASE}/kyc/pan/verify`,
    {
      method: 'POST',
      headers: { 'x-api-key': SANDBOX_KEY, 'x-api-version': '1.0' },
    },
    { pan }
  );
};

const sandboxCinLookup = async (cin) => {
  return apiRequest(
    `${SANDBOX_BASE}/mca/company/${cin}`,
    { headers: { 'x-api-key': SANDBOX_KEY, 'x-api-version': '1.0' } }
  );
};

// ─── GSTIN Verification ───────────────────────────────────────────────────────
/**
 * Verify a GSTIN number.
 * Returns: { status, legalName, address, registrationDate, returnFilingStatus, badge }
 *
 * badge: 'GREEN' | 'AMBER' | 'RED'
 */
const verifyGstin = async ({ gstin, companyId, userId }) => {
  const normalised = gstin?.toUpperCase().trim();

  // Step 1: Format validation (no API call needed)
  if (!validateGstinFormat(normalised)) {
    return { ok: false, error: 'Invalid GSTIN format', badge: 'RED' };
  }
  if (!validateGstinChecksum(normalised)) {
    return { ok: false, error: 'GSTIN checksum mismatch', badge: 'RED' };
  }

  // Step 2: Check cache
  if (companyId) {
    const cached = await getCached(companyId, 'GSTIN', normalised);
    if (cached) {
      return {
        ok: cached.status === 'VERIFIED',
        cached: true,
        status: cached.status,
        legalName: cached.legal_name,
        address: cached.address,
        extraData: cached.extra_data,
        badge: cached.status === 'VERIFIED' ? 'GREEN' : cached.status === 'PARTIAL' ? 'AMBER' : 'RED',
      };
    }
  }

  // Step 3: Live API call
  let apiResult, legalName, address, status, extraData = {};

  if (!SANDBOX_KEY && !GSTN_KEY) {
    // No API key — return format-only verification
    return {
      ok: true,
      cached: false,
      status: 'PARTIAL',
      badge: 'AMBER',
      legalName: null,
      address: null,
      note: 'Format valid. Real-time GSTN API key not configured — configure SANDBOX_API_KEY or GSTN_API_KEY for full verification.',
    };
  }

  try {
    if (PROVIDER === 'sandbox' && SANDBOX_KEY) {
      apiResult = await sandboxGstinVerify(normalised);
    } else {
      // Direct GSTN API (requires IRP onboarding)
      apiResult = await apiRequest(
        `${GSTN_BASE}/commonapi/search?gstin=${normalised}`,
        { headers: { 'clientid': GSTN_KEY, 'Authorization': `Bearer ${GSTN_KEY}` } }
      );
    }

    if (apiResult.status === 200 && apiResult.data?.data) {
      const d = apiResult.data.data;
      legalName = d.lgnm || d.legal_name || d.tradeNam;
      address   = [d.adr, d.stj, d.stcd, d.pncd].filter(Boolean).join(', ');
      status    = 'VERIFIED';
      extraData = {
        state_code: normalised.slice(0, 2),
        pan: normalised.slice(2, 12),
        registration_date: d.rgdt,
        last_updated: d.lstupdt,
        tax_payer_type: d.dty,
        gstin_status: d.sts,
        filing_status: d.filingStatus || [],
      };
    } else {
      status = 'MISMATCH';
      extraData = { raw_response: apiResult.data };
    }
  } catch (err) {
    console.error('[GSTIN API] Error:', err.message);
    status = 'FAILED';
    extraData = { error: err.message };
  }

  // Step 4: Cache result
  if (companyId) {
    await saveCache({ companyId, type: 'GSTIN', value: normalised, status, legalName, address, apiResponse: extraData, userId });
  }

  return {
    ok: status === 'VERIFIED',
    cached: false,
    status,
    legalName,
    address,
    extraData,
    badge: status === 'VERIFIED' ? 'GREEN' : status === 'PARTIAL' ? 'AMBER' : 'RED',
  };
};

// ─── PAN Verification ─────────────────────────────────────────────────────────
/**
 * Verify a PAN number against the IT department database.
 */
const verifyPan = async ({ pan, companyId, userId }) => {
  const normalised = pan?.toUpperCase().trim();

  if (!validatePanFormat(normalised)) {
    return { ok: false, error: 'Invalid PAN format (must be AAAAA9999A)', badge: 'RED' };
  }

  if (companyId) {
    const cached = await getCached(companyId, 'PAN', normalised);
    if (cached) {
      return {
        ok: cached.status === 'VERIFIED',
        cached: true,
        status: cached.status,
        legalName: cached.legal_name,
        panType: cached.extra_data?.pan_type,
        badge: cached.status === 'VERIFIED' ? 'GREEN' : 'AMBER',
      };
    }
  }

  if (!SANDBOX_KEY && !PAN_KEY) {
    return {
      ok: true, cached: false, status: 'PARTIAL', badge: 'AMBER',
      note: 'Format valid. Configure SANDBOX_API_KEY or PAN_API_KEY for live verification.',
      legalName: null,
      panType: normalised[3], // 4th char: P=Individual, C=Company, F=Firm, etc.
    };
  }

  let status, legalName, extraData = {};
  try {
    let apiResult;
    if (PROVIDER === 'sandbox' && SANDBOX_KEY) {
      apiResult = await sandboxPanVerify(normalised);
    } else {
      apiResult = await apiRequest(
        `${PAN_BASE}/pan/verify`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${PAN_KEY}` } },
        { pan: normalised }
      );
    }

    if (apiResult.status === 200 && apiResult.data) {
      const d = apiResult.data?.data || apiResult.data;
      legalName = d.name || d.full_name;
      status    = 'VERIFIED';
      extraData = {
        pan_type: d.panType || d.pan_type || normalised[3],
        pan_status: d.panStatus || d.status,
        aadhaar_seeded: d.aadhaarSeedingStatus,
      };
    } else {
      status    = 'MISMATCH';
      extraData = { raw: apiResult.data };
    }
  } catch (err) {
    console.error('[PAN API] Error:', err.message);
    status = 'FAILED';
    extraData = { error: err.message };
  }

  if (companyId) {
    await saveCache({ companyId, type: 'PAN', value: normalised, status, legalName, apiResponse: extraData, userId });
  }

  return {
    ok: status === 'VERIFIED', cached: false, status, legalName,
    panType: extraData.pan_type,
    badge: status === 'VERIFIED' ? 'GREEN' : 'RED',
    extraData,
  };
};

// ─── CIN / MCA21 Lookup ───────────────────────────────────────────────────────
const CIN_REGEX = /^[UL][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

const verifyCin = async ({ cin, companyId, userId }) => {
  const normalised = cin?.toUpperCase().trim();

  if (!CIN_REGEX.test(normalised)) {
    return { ok: false, error: 'Invalid CIN format', badge: 'RED' };
  }

  if (companyId) {
    const cached = await getCached(companyId, 'CIN', normalised);
    if (cached) return { ok: true, cached: true, ...cached.extra_data, badge: 'GREEN' };
  }

  if (!SANDBOX_KEY && !MCA_KEY) {
    return {
      ok: true, cached: false, status: 'PARTIAL', badge: 'AMBER',
      note: 'Format valid. Configure SANDBOX_API_KEY or MCA_API_KEY for live verification.',
    };
  }

  let status, legalName, address, extraData = {};
  try {
    let apiResult;
    if (PROVIDER === 'sandbox' && SANDBOX_KEY) {
      apiResult = await sandboxCinLookup(normalised);
    } else {
      apiResult = await apiRequest(
        `${MCA_BASE}/company/${normalised}`,
        { headers: { 'Authorization': `Bearer ${MCA_KEY}` } }
      );
    }

    if (apiResult.status === 200 && apiResult.data) {
      const d = apiResult.data?.data || apiResult.data;
      legalName = d.company_name || d.companyName;
      address   = d.registered_address || d.registeredAddress;
      status    = 'VERIFIED';
      extraData = {
        cin: normalised,
        roc_code: d.roc_code || d.rocCode,
        incorporation_date: d.date_of_incorporation || d.dateOfIncorporation,
        company_status: d.company_status || d.companyStatus,
        company_type: d.company_type || d.companyType,
        directors: d.directors || [],
        paid_up_capital: d.paidUpCapital,
      };
    } else {
      status = 'FAILED';
    }
  } catch (err) {
    console.error('[MCA21 API] Error:', err.message);
    status = 'FAILED';
    extraData = { error: err.message };
  }

  if (companyId) {
    await saveCache({ companyId, type: 'CIN', value: normalised, status, legalName, address, apiResponse: extraData, extraData, userId });
  }

  return {
    ok: status === 'VERIFIED', cached: false, status, legalName, address,
    badge: status === 'VERIFIED' ? 'GREEN' : 'RED',
    extraData,
  };
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  verifyGstin,
  verifyPan,
  verifyCin,
  validateGstinFormat,
  validateGstinChecksum,
  validatePanFormat,
};
