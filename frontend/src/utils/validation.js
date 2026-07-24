/**
 * Field validators and input sanitisers for Indian business documents.
 *
 * Two layers, deliberately separate:
 *   sanitise* — runs on every keystroke. Restricts the character set and caps
 *               length so unusable input (markup, control characters, a 900-char
 *               paste) can never reach state in the first place.
 *   validate* — runs on the finished value. Returns an error string or null.
 *               Empty is always accepted here; requiredness is checked by the
 *               caller, so an untouched optional field never shows an error.
 */

// ── Length caps ──────────────────────────────────────────────────────
// Sized to the widest real-world value, not to the database column, so a
// legitimate entry is never truncated but a paste of source code is.
export const MAX = {
  name: 120,
  companyName: 150,
  address: 250,
  email: 254,          // RFC 5321
  contactPerson: 80,
  phone: 18,           // "+91 98765 43210"
  gstin: 15,
  pan: 10,
  registration: 30,
  accountHolder: 120,
  bankName: 80,
  accountNumber: 18,   // longest Indian account numbers
  ifsc: 11,
  upi: 60,
  poNumber: 40,
  notes: 1000,
  lineItemName: 120,
  lineItemDesc: 200,
  hsn: 8,              // HSN 4/6/8 digits, SAC 6
};

// Characters that only ever appear in markup or injection attempts. Stripping
// them keeps stored values printable in the PDF and safe for any consumer that
// is less careful about escaping than React is.
const stripUnsafe = (s) => String(s).replace(/[<>{}\\`$]/g, '');

// Collapse newlines/tabs in single-line fields — a pasted block otherwise
// silently becomes one very long line.
const singleLine = (s) => String(s).replace(/[\r\n\t]+/g, ' ');

const cap = (s, n) => (s.length > n ? s.slice(0, n) : s);

// ── Sanitisers (on change) ───────────────────────────────────────────

export const sanitiseText = (value, max = MAX.name) =>
  cap(singleLine(stripUnsafe(value)).replace(/\s{2,}/g, ' ').trimStart(), max);

export const sanitiseMultiline = (value, max = MAX.notes) =>
  cap(stripUnsafe(value), max);

// Uppercase alphanumerics only — GSTIN, PAN, IFSC, registration numbers.
export const sanitiseAlphaNumUpper = (value, max) =>
  cap(String(value).toUpperCase().replace(/[^A-Z0-9]/g, ''), max);

// Digits only, for account numbers.
export const sanitiseDigits = (value, max) =>
  cap(String(value).replace(/\D/g, ''), max);

// Phone: digits plus a single leading +, and spaces for readability.
export const sanitisePhone = (value) => {
  const raw = String(value).replace(/[^\d+\s]/g, '');
  const plus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  return cap((plus ? '+' : '') + digits, MAX.phone);
};

export const sanitiseEmail = (value) =>
  cap(String(value).toLowerCase().replace(/[^\w.@+-]/g, ''), MAX.email);

export const sanitiseUpi = (value) =>
  cap(String(value).toLowerCase().replace(/[^\w.@-]/g, ''), MAX.upi);

// Money / quantity: digits and at most one decimal point, never negative.
export const sanitiseAmount = (value, { maxDecimals = 2 } = {}) => {
  let s = String(value).replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    const [whole, dec = ''] = s.split('.');
    s = `${whole.slice(0, 12)}.${dec.slice(0, maxDecimals)}`;
  } else {
    s = s.slice(0, 12);
  }
  return s;
};

// ── Validators (on submit / blur) ────────────────────────────────────

// 15 chars: 2 state code, 10 PAN, 1 entity number, 'Z', 1 checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// 4 bank code, '0' reserved, 6 branch code.
const IFSC_RE  = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const UPI_RE   = /^[\w.-]{2,}@[a-z]{2,}$/i;

// GSTIN embeds the holder's PAN at positions 3–12. When both are supplied they
// must agree, which catches a transposed digit that passes both formats alone.
export const gstinContainsPan = (gstin, pan) =>
  !gstin || !pan || gstin.slice(2, 12) === pan;

export const validateGSTIN = (v) => {
  if (!v) return null;
  if (v.length !== 15) return 'GSTIN must be exactly 15 characters';
  if (!GSTIN_RE.test(v)) return 'Not a valid GSTIN (e.g. 29ABCDE1234F1Z5)';
  const stateCode = parseInt(v.slice(0, 2), 10);
  if (!(stateCode >= 1 && stateCode <= 38)) return 'GSTIN state code must be 01–38';
  return null;
};

export const validatePAN = (v) => {
  if (!v) return null;
  if (v.length !== 10) return 'PAN must be exactly 10 characters';
  if (!PAN_RE.test(v)) return 'Not a valid PAN (e.g. ABCDE1234F)';
  return null;
};

export const validateIFSC = (v) => {
  if (!v) return null;
  if (v.length !== 11) return 'IFSC must be exactly 11 characters';
  if (!IFSC_RE.test(v)) return 'Not a valid IFSC (e.g. HDFC0001234)';
  return null;
};

export const validateAccountNumber = (v) => {
  if (!v) return null;
  if (v.length < 9 || v.length > 18) return 'Account number must be 9–18 digits';
  return null;
};

export const validateEmail = (v) => {
  if (!v) return null;
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address';
  return null;
};

export const validatePhone = (v) => {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  // Accept a bare 10-digit mobile or one carrying the 91 country code.
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  if (local.length !== 10) return 'Phone must be 10 digits (optionally +91)';
  if (!/^[6-9]/.test(local)) return 'Indian mobile numbers start with 6–9';
  return null;
};

export const validateUPI = (v) => {
  if (!v) return null;
  if (!UPI_RE.test(v)) return 'Not a valid UPI ID (e.g. name@bank)';
  return null;
};

// HSN codes are 4, 6 or 8 digits; SAC is 6.
export const validateHSN = (v) => {
  if (!v) return null;
  if (!/^\d+$/.test(v)) return 'HSN/SAC must be digits only';
  if (![4, 6, 8].includes(v.length)) return 'HSN/SAC must be 4, 6 or 8 digits';
  return null;
};

export const validateRequired = (v, label) =>
  (v && String(v).trim()) ? null : `${label} is required`;
