import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ApeiloProvider } from './context/ApeiloContext';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import MainLayout from './components/layout/MainLayout/MainLayout';
import './styles/variables.css';
import './styles/globals.css';
import './styles/shared.css';

function AppContent() {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  let content;
  if (loading) {
    content = (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#718096'
      }}>
        Loading...
      </div>
    );
  } else if (!user) {
    content = showRegister ? (
      <Register onSwitchToLogin={() => setShowRegister(false)} />
    ) : (
      <Login onSwitchToRegister={() => setShowRegister(true)} />
    );
  } else {
    content = <MainLayout />;
  }

  // Apeilo threat detection — once a real user signs in, this auto-registers
  // their profile, captures GPS (with permission), and scores the login.
  return (
    <ApeiloProvider
      apiKey={import.meta.env.VITE_APEILO_API_KEY}
      apiUrl={import.meta.env.VITE_APEILO_URL}
      userId={user?.email || 'guest'}
      name={user?.fullName || user?.email || ''}
      email={user?.email || ''}
    >
      {content}
    </ApeiloProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;