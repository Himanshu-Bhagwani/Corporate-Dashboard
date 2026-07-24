import React, { useState } from 'react';
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
  const { login, loginWithGoogle } = useAuth();
  const apeilo = useApeilo();

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      setError(err.message);
      // Failed sign-in: record + score the attempt against this account so
      // repeated failures raise its login-anomaly score on the dashboard.
      apeilo.trackFailedLogin(email).catch(() => {});
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

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
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
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
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
