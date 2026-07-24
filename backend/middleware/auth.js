const jwt = require('jsonwebtoken');

// ─── JWT secrets — must be set in environment in production ──────────────────
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.warn('[WARN] JWT secrets not set — using default fallback secrets.');
}

const ACCESS_SECRET  = process.env.JWT_SECRET          || 'soda-dev-access-secret-CHANGE-ME';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET  || 'soda-dev-refresh-secret-CHANGE-ME';

/** Generate short-lived access token (15 min) */
const signAccessToken = (payload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m', algorithm: 'HS256' });

/** Generate long-lived refresh token (30 days) */
const signRefreshToken = (payload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: '30d', algorithm: 'HS256' });

/** Verify refresh token and return decoded payload */
const verifyRefreshToken = (token) =>
  jwt.verify(token, REFRESH_SECRET, { algorithms: ['HS256'] });

// ─── In-memory session revocation (instant forced sign-out) ─────────────────
// Maps lowercased email -> revoke cutoff (ms since epoch). Any access token
// issued (`iat`) before the cutoff is rejected on its very next request, so an
// account can be booted from every open session immediately — with only an
// O(1) Map lookup and no per-request database call.
//
// This lives in the process, so it resets on restart. That's acceptable: new
// logins stay blocked across restarts by the durable `login_locked_until`
// column, and access tokens expire on their own within 15 minutes as a
// backstop. A multi-instance deployment would move this to Redis.
const _revokedAt = new Map();

/** Revoke every session for `email` issued before `atMs` (default: now). */
const revokeSessions = (email, atMs = Date.now()) => {
  if (!email) return;
  _revokedAt.set(String(email).toLowerCase(), atMs);
  // Prune entries older than the access-token lifetime — any token predating
  // them is already expired, so they can never match again.
  const staleBefore = Date.now() - 20 * 60 * 1000;
  for (const [k, v] of _revokedAt) if (v < staleBefore) _revokedAt.delete(k);
};

/** True if this token (`iat` in seconds) was issued before its account's cutoff. */
const isSessionRevoked = (email, iatSeconds) => {
  if (!email || !iatSeconds) return false;
  const cutoff = _revokedAt.get(String(email).toLowerCase());
  return cutoff !== undefined && iatSeconds * 1000 < cutoff;
};

/**
 * Express middleware — verifies Bearer access token.
 * Attaches decoded payload to req.user and req.clientIp.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] });
    // Instant forced sign-out: reject any token issued before this account was
    // locked, so an active attacker is booted on their next request.
    if (isSessionRevoked(decoded.email, decoded.iat)) {
      return res.status(401).json({
        error: 'Your session was ended by a security hold. Please sign in again.',
        code: 'SESSION_REVOKED',
      });
    }
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = {
  authenticateToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  revokeSessions,
  isSessionRevoked,
  ACCESS_SECRET,
};
