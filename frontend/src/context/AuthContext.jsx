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
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
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
    return data;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setCurrentCompany(null);
    setCompanies([]);
    localStorage.removeItem('token');
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
      fetchCompanies
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
