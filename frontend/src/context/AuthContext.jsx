import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [currentCompany, setCurrentCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchUser();
      fetchCompanies();
    } else {
      setLoading(false);
    }
  }, [token]);

  // The fetch interceptor fires this when the refresh token is rejected —
  // expired, or revoked by an Apeilo "log out everywhere" lockdown. Drop
  // straight to the login screen instead of leaving broken requests behind.
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToken(null);
      setCurrentCompany(null);
      setCompanies([]);
      setLoading(false);
    };
    window.addEventListener('soda:session-expired', onExpired);
    return () => window.removeEventListener('soda:session-expired', onExpired);
  }, []);

  // Heartbeat: proactively notice a server-side session revocation (e.g. an
  // Apeilo lockdown) so the user is signed out AUTOMATICALLY — no manual
  // refresh. An idle tab makes no requests, so revocation would otherwise only
  // take effect on the attacker's next click. We poll the lightweight
  // /api/auth/me every 10s, and also re-check the instant the tab regains focus
  // (covering the case where the attacker switches back to the SODA tab).
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!alive || r.status !== 401) return;
        // Any 401 here means the token is no longer valid (revoked or expired).
        const data = await r.json().catch(() => ({}));
        sessionStorage.setItem('auth_signed_out_reason', data.error || 'Your session was ended.');
        window.dispatchEvent(new CustomEvent('soda:session-expired'));
      } catch { /* transient network error — try again next tick */ }
    };
    const id = setInterval(check, 10000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        logout();
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    }
  };

  const fetchCompanies = async () => {
    try {
      const response = await fetch('/api/companies', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCompanies(data);
        if (data.length > 0 && !currentCompany) {
          setCurrentCompany(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      const e = new Error(error.error || 'Login failed');
      // Preserve structured fields (e.g. the Apeilo timed lock) so the login
      // screen can show a countdown instead of a generic message.
      e.code = error.code;
      e.lockedUntil = error.locked_until;
      e.remainingSeconds = error.remaining_seconds;
      throw e;
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    // Keep the refresh token so the session can be renewed silently — without
    // this the access token expires after 15 minutes and the app breaks.
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    return data;
  };

  const register = async (email, password, fullName) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    // Keep the refresh token so the session can be renewed silently — without
    // this the access token expires after 15 minutes and the app breaks.
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    return data;
  };

  const loginWithGoogle = async (googleData) => {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(googleData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Google login failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    // Keep the refresh token so the session can be renewed silently — without
    // this the access token expires after 15 minutes and the app breaks.
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    return data;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setCurrentCompany(null);
    setCompanies([]);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  };

  const switchCompany = (company) => {
    setCurrentCompany(company);
    // Persist active company so it's restored after login.
    // Ignore errors so UI remains responsive even if backend is unavailable.
    fetch(`/api/companies/active/${company.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).catch(() => {});
  };

  const updateCurrentCompanyPlan = (newPlan) => {
    if (currentCompany) {
      const updated = { ...currentCompany, plan: newPlan };
      setCurrentCompany(updated);
      setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      currentCompany,
      companies,
      loading,
      login,
      register,
      loginWithGoogle,
      logout,
      switchCompany,
      fetchCompanies,
      updateCurrentCompanyPlan
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
