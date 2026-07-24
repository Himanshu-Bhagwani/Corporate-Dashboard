import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Auth.css';
import AuthDoodles from './AuthDoodles';
import { useApeilo } from '../../context/ApeiloContext';

import { GoogleLogin } from '@react-oauth/google';

const Login = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);  // ms timestamp, or null
  const [remaining, setRemaining] = useState(0);          // seconds left
  const { login, loginWithGoogle } = useAuth();
  const apeilo = useApeilo();

  // Live countdown while the account is under a security hold.
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (secs <= 0) { setLockedUntil(null); setRemaining(0); setError(''); }
      else setRemaining(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const isLocked = lockedUntil && remaining > 0;
  const mmss = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setLoading(true);

    // Ask for location here — inside the click handler — so the browser
    // actually shows the permission prompt. Cached for the login scoring.
    apeilo.requestLocation().catch(() => {});

    try {
      await login(email, password);
      // Successful sign-in: breach-check the password so breach risk is real.
      apeilo.trackPassword(password, email).catch(() => {});
    } catch (err) {
      if (err.code === 'ACCOUNT_LOCKED' && err.lockedUntil) {
        // Apeilo timed lock — show a countdown instead of a generic error.
        setLockedUntil(new Date(err.lockedUntil).getTime());
        setError('');
      } else {
        setError(err.message);
        // Failed sign-in: record + score the attempt against this account so
        // repeated failures raise its login-anomaly score on the dashboard.
        apeilo.trackFailedLogin(email).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setLoading(true);
      setError('');
      apeilo.requestLocation().catch(() => {});
      await loginWithGoogle({ idToken: credentialResponse.credential });
    } catch (err) {
      setError(err.message || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google login was unsuccessful.');
  };

  return (
    <div className="auth-container">
      <AuthDoodles />
      <div className="auth-card">
        <div className="auth-header">
          <h1>Corporate Dashboard</h1>
          <p>Sign in to your account</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {isLocked && (
          <div style={{
            marginBottom: 16, padding: '14px 16px', borderRadius: 10,
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)',
            color: '#b91c1c', textAlign: 'center',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
              🔒 Access temporarily blocked
            </div>
            <div style={{ fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.5 }}>
              A security hold is active on this account. Try again in{' '}
              <b style={{ fontFamily: 'monospace', fontSize: 15 }}>{mmss}</b>.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={isLocked}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLocked}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading || isLocked}>
            {isLocked ? `Blocked — ${mmss}` : loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem', width: '100%' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            theme="outline"
            size="large"
            width="100%"
          />
        </div>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <button onClick={onSwitchToRegister} className="link-button">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
