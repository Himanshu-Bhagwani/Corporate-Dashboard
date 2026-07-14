/**
 * SODA Business Platform — Security Middleware
 * =============================================
 * Implements OWASP Top 10 protections:
 *   - Helmet (secure HTTP headers)
 *   - Rate limiting (auth, API, uploads)
 *   - CORS whitelist
 *   - Input sanitization (HPP, XSS)
 *   - Request size limits
 *   - IP-based audit logging helpers
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');

// ─── Environment ──────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

const isProd = process.env.NODE_ENV === 'production';

// ─── CORS ─────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server (no origin) only in dev
    if (!origin && !isProd) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-company-id'],
  credentials: true,
  maxAge: 86400, // 24 h preflight cache
};

// ─── Helmet (HTTP security headers) ──────────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow PDF previews
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
});

// ─── Rate Limiters ────────────────────────────────────────────────────────────

/** Auth endpoints: 10 attempts per 15 min per IP */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skip: (req) => !isProd && req.ip === '::1', // skip localhost in dev
});

/** General API: 200 req/min per IP */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Slow down.' },
});

/** Upload endpoints: 20 req/min per IP */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload requests.' },
});

/** Govt API verification: 30 req/min per IP (avoid GSTN/MCA abuse) */
const govtApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Government API rate limit reached. Try again in 1 minute.' },
});

// ─── Input sanitization ───────────────────────────────────────────────────────

/** Strip XSS from string fields in req.body recursively */
const sanitizeInput = (req, res, next) => {
  const clean = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (Array.isArray(obj)) return obj.map(clean);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) out[k] = clean(obj[k]);
      return out;
    }
    return obj;
  };
  if (req.body) req.body = clean(req.body);
  next();
};

/** Reject suspiciously deep / large JSON payloads */
const jsonDepthGuard = (req, res, next) => {
  const checkDepth = (obj, depth = 0) => {
    if (depth > 10) return false;
    if (obj && typeof obj === 'object') {
      return Object.values(obj).every((v) => checkDepth(v, depth + 1));
    }
    return true;
  };
  if (req.body && !checkDepth(req.body)) {
    return res.status(400).json({ error: 'Request payload too deeply nested.' });
  }
  next();
};

// ─── Client IP extraction ─────────────────────────────────────────────────────
/**
 * Attaches req.clientIp — used in audit trail logging.
 * Reads X-Forwarded-For if behind a proxy (set TRUST_PROXY=true in env).
 */
const extractClientIp = (req, res, next) => {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    req.clientIp = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  } else {
    req.clientIp = req.socket.remoteAddress;
  }
  next();
};

// ─── SQL injection guard ──────────────────────────────────────────────────────
/**
 * Warn if any query param contains raw SQL keywords.
 * The parameterised queries in controllers are the real defence;
 * this is a belt-and-braces layer for logging.
 */
const sqlGuard = (req, res, next) => {
  const SQL_PATTERN = /(\bUNION\b|\bSELECT\b|\bDROP\b|\bINSERT\b|\bDELETE\b|\bEXEC\b|--|;--|\/\*)/i;
  const params = { ...req.query, ...req.params };
  for (const v of Object.values(params)) {
    if (typeof v === 'string' && SQL_PATTERN.test(v)) {
      console.warn(`[SECURITY] Possible SQL injection attempt from ${req.clientIp} on ${req.path}: "${v}"`);
      return res.status(400).json({ error: 'Invalid input detected.' });
    }
  }
  next();
};

// ─── Security audit logger ────────────────────────────────────────────────────
/**
 * Logs security-relevant events (auth failures, 4xx on sensitive routes).
 * In production, pipe to your SIEM / CloudWatch.
 */
const securityLogger = (req, res, next) => {
  const sensitiveRoutes = ['/api/auth', '/api/companies', '/api/verify'];
  const isSensitive = sensitiveRoutes.some((r) => req.path.startsWith(r));
  if (!isSensitive) return next();

  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.warn(
        `[SECURITY] ${res.statusCode} ${req.method} ${req.path} ip=${req.clientIp} user=${req.user?.userId || 'anon'} dur=${Date.now() - start}ms`
      );
    }
  });
  next();
};

module.exports = {
  corsOptions,
  helmetMiddleware,
  authLimiter,
  apiLimiter,
  uploadLimiter,
  govtApiLimiter,
  sanitizeInput,
  jsonDepthGuard,
  extractClientIp,
  sqlGuard,
  securityLogger,
  hpp,
};
