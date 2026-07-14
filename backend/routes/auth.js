const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { signAccessToken, signRefreshToken, verifyRefreshToken, authenticateToken } = require('../middleware/auth');

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).toLowerCase());
const isStrongPassword = (p) => typeof p === 'string' && p.length >= 8;
const userPayload = (u) => ({ id: u.id, email: u.email, fullName: u.full_name, avatarUrl: u.avatar_url });
const issueTokens = (u) => ({
  accessToken: signAccessToken({ userId: u.id, email: u.email }),
  refreshToken: signRefreshToken({ userId: u.id, email: u.email })
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
    if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'Full name is required.' });
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'User already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, avatar_url',
      [email.toLowerCase(), passwordHash, fullName.trim()]
    );
    const user = result.rows[0];
    res.status(201).json({ ...issueTokens(user), user: userPayload(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    const dummyHash = '$2b$12$invalidhashfortiming00000000000000000000000000000000000000';
    const hash = user ? user.password_hash : dummyHash;
    const valid = hash ? await bcrypt.compare(password, hash) : false;
    if (!user || !valid) return res.status(401).json({ error: 'Invalid credentials.' });
    pool.query(
      "INSERT INTO audit_log (user_id, action, ip_address, details) VALUES ($1, 'LOGIN', $2, $3) ON CONFLICT DO NOTHING",
      [user.id, req.clientIp, JSON.stringify({ email: user.email })]
    ).catch(() => {});
    res.json({ ...issueTokens(user), user: userPayload(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });
    let decoded;
    try { decoded = verifyRefreshToken(refreshToken); }
    catch (e) { return res.status(401).json({ error: 'Invalid or expired refresh token.' }); }
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found.' });
    res.json(issueTokens(result.rows[0]));
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { googleId, email, fullName, avatarUrl } = req.body;
    if (!googleId || !email) return res.status(400).json({ error: 'Google ID and email required.' });
    let result = await pool.query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [googleId, email.toLowerCase()]);
    let user;
    if (result.rows.length === 0) {
      result = await pool.query(
        'INSERT INTO users (google_id, email, full_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, avatar_url',
        [googleId, email.toLowerCase(), fullName, avatarUrl]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      if (!user.google_id) {
        await pool.query('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3', [googleId, avatarUrl, user.id]);
      }
    }
    res.json({ ...issueTokens(user), user: userPayload(user) });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google authentication failed.' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, full_name, avatar_url FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required.' });
    if (!isStrongPassword(newPassword)) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
    const user = result.rows[0];
    if (!user.password_hash) return res.status(400).json({ error: 'Not available for social login.' });
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, user.id]);
    pool.query(
      "INSERT INTO audit_log (user_id, action, ip_address, details) VALUES ($1,'PASSWORD_CHANGE',$2,'{}') ON CONFLICT DO NOTHING",
      [user.id, req.clientIp]
    ).catch(() => {});
    res.json({ ok: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

router.post('/logout', authenticateToken, (req, res) => {
  pool.query(
    "INSERT INTO audit_log (user_id, action, ip_address, details) VALUES ($1,'LOGOUT',$2,'{}') ON CONFLICT DO NOTHING",
    [req.user.userId, req.clientIp]
  ).catch(() => {});
  res.json({ ok: true, message: 'Logged out successfully.' });
});

module.exports = router;
