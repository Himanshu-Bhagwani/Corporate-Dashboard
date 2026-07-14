const jwt = require('jsonwebtoken');

// ─── JWT secrets — must be set in environment in production ──────────────────
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET and JWT_REFRESH_SECRET must be set in production.');
    process.exit(1);
  } else {
    console.warn('[WARN] JWT secrets not set — using insecure dev defaults. NEVER use in production.');
  }
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
  ACCESS_SECRET,
};
