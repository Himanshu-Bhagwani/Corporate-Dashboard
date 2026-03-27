import React, { useState } from 'react';
import './SettingsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import { User, Building2, Bot, Bell, Shield, Palette, Check, ChevronRight, Lock, Smartphone, Monitor, Globe, Zap, TrendingUp, Eye, EyeOff, Sparkles, Lock as LockIcon } from 'lucide-react';

const SettingsView = () => {
  const [accountMode, setAccountMode] = useState('corporate');
  const [showIndividualMessage, setShowIndividualMessage] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [theme, setTheme] = useState('light');
  const [showPassword, setShowPassword] = useState(false);
  
  const [aiFeatures, setAiFeatures] = useState({
    automaticInsights: true,
    smartBudgetAlerts: true,
    investmentRecommendations: true,
    fraudDetection: true
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    weeklyReports: true,
    monthlyStatements: true
  });

  const toggleAiFeature = (feature) => {
    setAiFeatures(prev => ({
      ...prev,
      [feature]: !prev[feature]
    }));
  };

  const toggleNotification = (notification) => {
    setNotifications(prev => ({
      ...prev,
      [notification]: !prev[notification]
    }));
  };

  return (
    <>
      <EmbeddedHeader />
      <div className="settings-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Settings</h1>
          <p className="view-subtitle">Manage your preferences and account settings</p>
        </div>
      </div>

      {/* Account Mode Section */}
      <div className="settings-section account-section">
        <div className="section-header-with-icon">
          <div className="section-icon-wrapper blue-wrapper">
            <User size={24} />
          </div>
          <div>
            <h2 className="section-title-simple">Account Mode</h2>
            <p className="section-description">Choose your account type and preferences</p>
          </div>
        </div>

        <div className="account-mode-grid">
          <div 
            className={`account-mode-card ${accountMode === 'individual' ? 'active' : ''}`}
            onClick={() => setShowIndividualMessage(true)}
          >
            <div className="card-glow"></div>
            <div className="mode-icon-wrapper">
              <div className="mode-icon">
                <User size={32} />
              </div>
            </div>
            <h3 className="mode-title">Individual</h3>
            <p className="mode-description">Personal finance management for individuals and families</p>
            <div className="mode-features">
              <div className="mode-feature-item">
                <div className="feature-icon-wrapper">
                  <Check size={16} />
                </div>
                <span>Personal budgeting</span>
              </div>
              <div className="mode-feature-item">
                <div className="feature-icon-wrapper">
                  <Check size={16} />
                </div>
                <span>Goal tracking</span>
              </div>
              <div className="mode-feature-item">
                <div className="feature-icon-wrapper">
                  <Check size={16} />
                </div>
                <span>Investment insights</span>
              </div>
            </div>
            {accountMode === 'individual' && (
              <div className="mode-active-badge">
                <Check size={16} />
                Currently Active
              </div>
            )}
            {accountMode !== 'individual' && (
              <div className="mode-locked-badge">
                <Lock size={16} />
                Sign in required
              </div>
            )}
          </div>

          <div 
            className={`account-mode-card corporate-card ${accountMode === 'corporate' ? 'active' : ''}`}
            onClick={() => setAccountMode('corporate')}
          >
            <div className="card-glow"></div>
            <div className="mode-icon-wrapper">
              <div className="mode-icon corporate">
                <Building2 size={32} />
              </div>
            </div>
            <h3 className="mode-title">Corporate</h3>
            <p className="mode-description">Business finance management with team collaboration</p>
            <div className="mode-features">
              <div className="mode-feature-item">
                <div className="feature-icon-wrapper">
                  <Check size={16} />
                </div>
                <span>Team management</span>
              </div>
              <div className="mode-feature-item">
                <div className="feature-icon-wrapper">
                  <Check size={16} />
                </div>
                <span>Multi-user access</span>
              </div>
              <div className="mode-feature-item">
                <div className="feature-icon-wrapper">
                  <Check size={16} />
                </div>
                <span>Advanced reporting</span>
              </div>
            </div>
            {accountMode === 'corporate' && (
              <div className="mode-active-badge">
                <Check size={16} />
                Currently Active
              </div>
            )}
            {accountMode !== 'corporate' && (
              <div className="mode-locked-badge hidden">
                <Lock size={16} />
                Sign in required
              </div>
            )}
          </div>
        </div>
      </div>

      {showIndividualMessage && (
        <div className="modal-overlay" onClick={() => setShowIndividualMessage(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Individual Account Required</h2>
              <button className="modal-close" onClick={() => setShowIndividualMessage(false)}>×</button>
            </div>
            <div className="modal-content">
              <p>To access the Individual account mode, please sign in to your individual account.</p>
              <p style={{ marginTop: '12px', fontSize: '13px', color: '#718096' }}>You are currently logged in to a corporate account. If you have an individual account, please log out and sign in with those credentials.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowIndividualMessage(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Section */}
      <div className="settings-section ai-section">
        <div className="section-header-with-icon">
          <div className="section-icon-wrapper green-wrapper">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="section-title-simple">AI Assistant</h2>
            <p className="section-description">Configure AI-powered features and automation</p>
          </div>
        </div>

        <div className="settings-item master-toggle">
          <div className="settings-item-content">
            <div className="settings-item-header">
              <Sparkles size={20} />
              <h3 className="settings-item-title">Enable AI Assistant</h3>
            </div>
            <p className="settings-item-description">Get personalized financial advice and intelligent insights</p>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={aiEnabled}
              onChange={() => setAiEnabled(!aiEnabled)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {aiEnabled && (
          <div className="ai-features-grid">
            <div className={`ai-feature-card ${aiFeatures.automaticInsights ? 'enabled' : ''}`}
                 onClick={() => toggleAiFeature('automaticInsights')}>
              <div className="feature-glow"></div>
              <label className="checkbox-container">
                <input 
                  type="checkbox"
                  checked={aiFeatures.automaticInsights}
                  onChange={() => toggleAiFeature('automaticInsights')}
                />
                <span className="checkbox-checkmark"></span>
              </label>
              <div className="ai-feature-content">
                <div className="ai-feature-header">
                  <TrendingUp size={18} />
                  <h4 className="ai-feature-title">Automatic Insights</h4>
                </div>
                <p className="ai-feature-description">Get proactive spending and savings suggestions based on your patterns</p>
              </div>
            </div>

            <div className={`ai-feature-card ${aiFeatures.smartBudgetAlerts ? 'enabled' : ''}`}
                 onClick={() => toggleAiFeature('smartBudgetAlerts')}>
              <div className="feature-glow"></div>
              <label className="checkbox-container">
                <input 
                  type="checkbox"
                  checked={aiFeatures.smartBudgetAlerts}
                  onChange={() => toggleAiFeature('smartBudgetAlerts')}
                />
                <span className="checkbox-checkmark"></span>
              </label>
              <div className="ai-feature-content">
                <div className="ai-feature-header">
                  <Bell size={18} />
                  <h4 className="ai-feature-title">Smart Budget Alerts</h4>
                </div>
                <p className="ai-feature-description">AI-powered notifications for budget tracking and overspending prevention</p>
              </div>
            </div>

            <div className={`ai-feature-card ${aiFeatures.investmentRecommendations ? 'enabled' : ''}`}
                 onClick={() => toggleAiFeature('investmentRecommendations')}>
              <div className="feature-glow"></div>
              <label className="checkbox-container">
                <input 
                  type="checkbox"
                  checked={aiFeatures.investmentRecommendations}
                  onChange={() => toggleAiFeature('investmentRecommendations')}
                />
                <span className="checkbox-checkmark"></span>
              </label>
              <div className="ai-feature-content">
                <div className="ai-feature-header">
                  <TrendingUp size={18} />
                  <h4 className="ai-feature-title">Investment Recommendations</h4>
                </div>
                <p className="ai-feature-description">Get AI suggestions for portfolio optimization and market opportunities</p>
              </div>
            </div>

            <div className={`ai-feature-card ${aiFeatures.fraudDetection ? 'enabled' : ''}`}
                 onClick={() => toggleAiFeature('fraudDetection')}>
              <div className="feature-glow"></div>
              <label className="checkbox-container">
                <input 
                  type="checkbox"
                  checked={aiFeatures.fraudDetection}
                  onChange={() => toggleAiFeature('fraudDetection')}
                />
                <span className="checkbox-checkmark"></span>
              </label>
              <div className="ai-feature-content">
                <div className="ai-feature-header">
                  <Shield size={18} />
                  <h4 className="ai-feature-title">Fraud Detection</h4>
                </div>
                <p className="ai-feature-description">AI monitoring for unusual transactions and security threats</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notifications Section */}
      <div className="settings-section notifications-section">
        <div className="section-header-with-icon">
          <div className="section-icon-wrapper orange-wrapper">
            <Bell size={24} />
          </div>
          <div>
            <h2 className="section-title-simple">Notifications</h2>
            <p className="section-description">Manage your notification preferences and delivery methods</p>
          </div>
        </div>

        <div className="notification-list">
          <div className={`notification-item ${notifications.email ? 'active' : ''}`}
               onClick={() => toggleNotification('email')}>
            <div className="notification-content">
              <div className="notification-icon-bg">
                <Globe size={20} />
              </div>
              <div className="notification-text">
                <h3 className="notification-title">Email Notifications</h3>
                <p className="notification-description">Receive updates and alerts via email</p>
              </div>
            </div>
            <label className="checkbox-container">
              <input 
                type="checkbox"
                checked={notifications.email}
                onChange={() => toggleNotification('email')}
              />
              <span className="checkbox-checkmark"></span>
            </label>
          </div>

          <div className={`notification-item ${notifications.push ? 'active' : ''}`}
               onClick={() => toggleNotification('push')}>
            <div className="notification-content">
              <div className="notification-icon-bg">
                <Smartphone size={20} />
              </div>
              <div className="notification-text">
                <h3 className="notification-title">Push Notifications</h3>
                <p className="notification-description">Get real-time alerts on your device</p>
              </div>
            </div>
            <label className="checkbox-container">
              <input 
                type="checkbox"
                checked={notifications.push}
                onChange={() => toggleNotification('push')}
              />
              <span className="checkbox-checkmark"></span>
            </label>
          </div>

          <div className={`notification-item ${notifications.weeklyReports ? 'active' : ''}`}
               onClick={() => toggleNotification('weeklyReports')}>
            <div className="notification-content">
              <div className="notification-icon-bg">
                <TrendingUp size={20} />
              </div>
              <div className="notification-text">
                <h3 className="notification-title">Weekly Reports</h3>
                <p className="notification-description">Summary of your finances every week</p>
              </div>
            </div>
            <label className="checkbox-container">
              <input 
                type="checkbox"
                checked={notifications.weeklyReports}
                onChange={() => toggleNotification('weeklyReports')}
              />
              <span className="checkbox-checkmark"></span>
            </label>
          </div>

          <div className={`notification-item ${notifications.monthlyStatements ? 'active' : ''}`}
               onClick={() => toggleNotification('monthlyStatements')}>
            <div className="notification-content">
              <div className="notification-icon-bg">
                <TrendingUp size={20} />
              </div>
              <div className="notification-text">
                <h3 className="notification-title">Monthly Statements</h3>
                <p className="notification-description">Detailed monthly financial breakdowns</p>
              </div>
            </div>
            <label className="checkbox-container">
              <input 
                type="checkbox"
                checked={notifications.monthlyStatements}
                onChange={() => toggleNotification('monthlyStatements')}
              />
              <span className="checkbox-checkmark"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Security & Privacy Section */}
      <div className="settings-section security-section">
        <div className="section-header-with-icon">
          <div className="section-icon-wrapper red-wrapper">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="section-title-simple">Security & Privacy</h2>
            <p className="section-description">Keep your account safe and secure</p>
          </div>
        </div>

        <div className="security-list">
          <div className="security-item">
            <div className="security-left">
              <div className="security-icon-wrapper">
                <Lock size={20} />
              </div>
              <div className="security-content">
                <h3 className="security-title">Change Password</h3>
                <p className="security-description">Update your account password regularly</p>
              </div>
            </div>
            <ChevronRight size={20} className="security-arrow" />
          </div>

          <div className="security-item">
            <div className="security-left">
              <div className="security-icon-wrapper">
                <Smartphone size={20} />
              </div>
              <div className="security-content">
                <h3 className="security-title">Two-Factor Authentication</h3>
                <p className="security-description">Add an extra layer of security to your account</p>
              </div>
            </div>
            <ChevronRight size={20} className="security-arrow" />
          </div>

          <div className="security-item">
            <div className="security-left">
              <div className="security-icon-wrapper">
                <Monitor size={20} />
              </div>
              <div className="security-content">
                <h3 className="security-title">Connected Devices</h3>
                <p className="security-description">Manage devices with access to your account</p>
              </div>
            </div>
            <ChevronRight size={20} className="security-arrow" />
          </div>

          <div className="security-item">
            <div className="security-left">
              <div className="security-icon-wrapper">
                <Eye size={20} />
              </div>
              <div className="security-content">
                <h3 className="security-title">Privacy Settings</h3>
                <p className="security-description">Control how your data is used and shared</p>
              </div>
            </div>
            <ChevronRight size={20} className="security-arrow" />
          </div>
        </div>
      </div>

      {/* Appearance Section */}
      <div className="settings-section appearance-section">
        <div className="section-header-with-icon">
          <div className="section-icon-wrapper purple-wrapper">
            <Palette size={24} />
          </div>
          <div>
            <h2 className="section-title-simple">Appearance</h2>
            <p className="section-description">Customize your interface theme and display</p>
          </div>
        </div>

        <div className="theme-selector">
          <div 
            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
          >
            <div className="theme-preview light-preview">
              <div className="preview-header"></div>
              <div className="preview-content"></div>
            </div>
            <span>Light</span>
            {theme === 'light' && <Check size={18} className="theme-check" />}
          </div>
          <div 
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            <div className="theme-preview dark-preview">
              <div className="preview-header"></div>
              <div className="preview-content"></div>
            </div>
            <span>Dark</span>
            {theme === 'dark' && <Check size={18} className="theme-check" />}
          </div>
          <div 
            className={`theme-option ${theme === 'auto' ? 'active' : ''}`}
            onClick={() => setTheme('auto')}
          >
            <div className="theme-preview auto-preview">
              <div className="preview-left"></div>
              <div className="preview-right"></div>
            </div>
            <span>Auto</span>
            {theme === 'auto' && <Check size={18} className="theme-check" />}
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

export default SettingsView;