import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, User, Building2, Settings, LogOut, Plus, Bell, X, AlertTriangle, FileText, Shield, DollarSign, TrendingDown, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { notificationsAPI } from '../../../services/api';
import CreateCompanyModal from '../../company/CreateCompanyModal';
import './EmbeddedHeader.css';

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', icon: <AlertTriangle size={16} /> },
  warning: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', icon: <AlertTriangle size={16} /> },
  info: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', icon: <FileText size={16} /> },
};

const CATEGORY_ICONS = {
  Invoices: <FileText size={14} />,
  Compliance: <Shield size={14} />,
  Payables: <DollarSign size={14} />,
  'Financial Health': <TrendingDown size={14} />,
};

const EmbeddedHeader = ({ onSearch }) => {
  const { user, currentCompany, companies, logout, switchCompany, fetchCompanies } = useAuth();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showCreateCompanyModal, setShowCreateCompanyModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  const companyDropdownRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const searchRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target)) {
        setShowCompanyDropdown(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications on mount and when company changes, then poll every 60s
  useEffect(() => {
    if (!currentCompany) return;

    const fetchNotifications = async () => {
      try {
        const data = await notificationsAPI.getAll(currentCompany.id);
        setNotifications(data.notifications || []);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [currentCompany]);

  const handleDismiss = async (key, e) => {
    e.stopPropagation();
    try {
      await notificationsAPI.dismiss(key, currentCompany.id);
      setNotifications(prev => prev.filter(n => n.id !== key));
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const handleDismissAll = async () => {
    try {
      const keys = notifications.map(n => n.id);
      await notificationsAPI.dismissAll(keys, currentCompany.id);
      setNotifications([]);
    } catch (err) {
      console.error('Failed to dismiss all:', err);
    }
  };

  const handleNotifClick = (notif) => {
    if (notif.actionView) {
      window.dispatchEvent(new CustomEvent('navigate-to', { detail: { view: notif.actionView } }));
    }
    setShowNotifications(false);
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.length < 2 || !currentCompany) {
      setSearchResults(null);
      setShowSearchResults(false);
      return;
    }

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'x-company-id': currentCompany?.id
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        setShowSearchResults(true);
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const handleCreateCompany = async (companyData) => {
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(companyData)
      });

      if (!response.ok) {
        throw new Error('Failed to create company');
      }

      await fetchCompanies();
      setShowCreateCompanyModal(false);
      setShowCompanyDropdown(false);
    } catch (error) {
      console.error('Failed to create company:', error);
      throw error;
    }
  };

  const notifCount = notifications.length;
  const hasNotifications = notifCount > 0;

  // Group notifications by category
  const groupedNotifications = notifications.reduce((acc, n) => {
    const cat = n.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(n);
    return acc;
  }, {});

  return (
    <>
      <div className="embedded-header">
        <div className="header-left" ref={companyDropdownRef}>
          <button 
            className="company-selector"
            onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
          >
            <Building2 size={20} />
            <span>{currentCompany?.name || 'Select Company'}</span>
            <ChevronDown size={16} />
          </button>

          {showCompanyDropdown && (
            <div className="dropdown-menu company-dropdown">
              {companies.map(company => (
                <button
                  key={company.id}
                  className={`dropdown-item ${currentCompany?.id === company.id ? 'active' : ''}`}
                  onClick={() => {
                    switchCompany(company);
                    setShowCompanyDropdown(false);
                  }}
                >
                  <Building2 size={16} />
                  <span>{company.name}</span>
                </button>
              ))}
              <div className="dropdown-divider" />
              <button 
                className="dropdown-item"
                onClick={() => {
                  setShowCreateCompanyModal(true);
                  setShowCompanyDropdown(false);
                }}
              >
                <Plus size={16} />
                <span>Add New Company</span>
              </button>
            </div>
          )}
        </div>

        <div className="header-center" ref={searchRef}>
          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search transactions, invoices, vendors..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults && setShowSearchResults(true)}
              disabled={!currentCompany}
            />
          </div>

          {showSearchResults && searchResults && (
            <div className="search-results-dropdown">
              {searchResults.transactions.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Transactions</div>
                  {searchResults.transactions.map(item => (
                    <div 
                      key={item.id} 
                      className="search-result-item"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('navigate-to', { detail: { view: 'transactions', id: item.id } }));
                        setShowSearchResults(false);
                        setSearchQuery('');
                      }}
                    >
                      <div className="search-result-icon">💰</div>
                      <div className="search-result-content">
                        <div className="search-result-name">{item.name}</div>
                        <div className="search-result-meta">{item.category} • ${item.amount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.invoices.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Invoices</div>
                  {searchResults.invoices.map(item => (
                    <div 
                      key={item.id} 
                      className="search-result-item"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('navigate-to', { detail: { view: 'invoices', id: item.id } }));
                        setShowSearchResults(false);
                        setSearchQuery('');
                      }}
                    >
                      <div className="search-result-icon">📄</div>
                      <div className="search-result-content">
                        <div className="search-result-name">{item.invoice_number}</div>
                        <div className="search-result-meta">{item.vendor_name || item.client_name} • ${item.amount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.cashflows && searchResults.cashflows.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Cash Flows</div>
                  {searchResults.cashflows.map(item => (
                    <div 
                      key={item.id} 
                      className="search-result-item"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('navigate-to', { detail: { view: 'cashflow', id: item.id } }));
                        setShowSearchResults(false);
                        setSearchQuery('');
                      }}
                    >
                      <div className="search-result-icon">💸</div>
                      <div className="search-result-content">
                        <div className="search-result-name">{item.name || item.description}</div>
                        <div className="search-result-meta">{item.account || ''} • ${item.amount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.vendors.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Vendors</div>
                  {searchResults.vendors.map(item => (
                    <div key={item.id} className="search-result-item">
                      <div className="search-result-icon">🏢</div>
                      <div className="search-result-content">
                        <div className="search-result-name">{item.name}</div>
                        <div className="search-result-meta">{item.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.transactions.length === 0 && 
               searchResults.invoices.length === 0 && 
               searchResults.vendors.length === 0 && (
                <div className="search-no-results">No results found</div>
              )}
            </div>
          )}
        </div>

        <div className="header-right-group">
          {/* Notification Bell */}
          <div className="notif-container" ref={notifRef}>
            <button 
              className="notif-bell-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
            >
              <Bell size={20} />
              {hasNotifications && (
                <span className="notif-badge">{notifCount > 9 ? '9+' : notifCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="notif-panel">
                <div className="notif-panel-header">
                  <h3>Notifications</h3>
                  <div className="notif-panel-actions">
                    {hasNotifications && (
                      <button className="notif-clear-all" onClick={handleDismissAll}>
                        <CheckCircle2 size={14} />
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                <div className="notif-panel-body">
                  {notifications.length === 0 ? (
                    <div className="notif-empty">
                      <Bell size={32} />
                      <p>You're all caught up!</p>
                      <span>No pending notifications</span>
                    </div>
                  ) : (
                    Object.entries(groupedNotifications).map(([category, items]) => (
                      <div key={category} className="notif-group">
                        <div className="notif-group-title">
                          {CATEGORY_ICONS[category] || <FileText size={14} />}
                          <span>{category}</span>
                          <span className="notif-group-count">{items.length}</span>
                        </div>
                        {items.map(notif => {
                          const sev = SEVERITY_CONFIG[notif.severity] || SEVERITY_CONFIG.info;
                          return (
                            <div 
                              key={notif.id} 
                              className="notif-item"
                              onClick={() => handleNotifClick(notif)}
                              style={{ borderLeft: `3px solid ${sev.color}` }}
                            >
                              <div className="notif-item-icon" style={{ background: sev.bg, color: sev.color }}>
                                {sev.icon}
                              </div>
                              <div className="notif-item-content">
                                <div className="notif-item-title">{notif.title}</div>
                                <div className="notif-item-desc">{notif.description}</div>
                              </div>
                              <button 
                                className="notif-item-dismiss" 
                                onClick={(e) => handleDismiss(notif.id, e)}
                                title="Dismiss"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Button */}
          <div className="header-right" ref={profileDropdownRef}>
            <button 
              className="profile-button"
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            >
              <div className="profile-avatar">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.fullName} />
                ) : (
                  <User size={18} />
                )}
              </div>
              <ChevronDown size={16} />
            </button>

            {showProfileDropdown && (
              <div className="dropdown-menu profile-dropdown">
                <div className="dropdown-header">
                  <div className="dropdown-user-name">{user?.fullName || user?.email}</div>
                  <div className="dropdown-user-email">{user?.email}</div>
                </div>
                <div className="dropdown-divider" />
                <button className="dropdown-item">
                  <User size={16} />
                  <span>Profile</span>
                </button>
                <button className="dropdown-item">
                  <Settings size={16} />
                  <span>Company Settings</span>
                </button>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={logout}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateCompanyModal && (
        <CreateCompanyModal
          onClose={() => setShowCreateCompanyModal(false)}
          onSubmit={handleCreateCompany}
        />
      )}
    </>
  );
};

export default EmbeddedHeader;

