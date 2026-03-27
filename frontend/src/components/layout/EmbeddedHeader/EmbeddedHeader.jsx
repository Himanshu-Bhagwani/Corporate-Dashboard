import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, User, Building2, Settings, LogOut, Plus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import CreateCompanyModal from '../../company/CreateCompanyModal';
import './EmbeddedHeader.css';

const EmbeddedHeader = ({ onSearch }) => {
  const { user, currentCompany, companies, logout, switchCompany, fetchCompanies } = useAuth();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showCreateCompanyModal, setShowCreateCompanyModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const companyDropdownRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const searchRef = useRef(null);

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
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
