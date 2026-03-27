import React from 'react';
import './Sidebar.css';
import { LayoutDashboard, Receipt, FileText, TrendingUp, BarChart3, FileCheck, Settings } from 'lucide-react';

const Sidebar = ({ activeView, setActiveView, stats }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="account-info">
          <div className="account-avatar">
            <LayoutDashboard size={24} />
          </div>
          <div className="account-details">
            <h1 className="app-logo">Dashboard</h1>
            <p className="account-type">Corporate Account</p>
          </div>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        <button 
          className={`nav-button ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveView('transactions')}
        >
          <Receipt size={20} />
          <span>Transactions</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveView('invoices')}
        >
          <FileText size={20} />
          <span>Invoices</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'cashflow' ? 'active' : ''}`}
          onClick={() => setActiveView('cashflow')}
        >
          <TrendingUp size={20} />
          <span>Cash Flow</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveView('reports')}
        >
          <BarChart3 size={20} />
          <span>Reports</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'compliance' ? 'active' : ''}`}
          onClick={() => setActiveView('compliance')}
        >
          <FileCheck size={20} />
          <span>Compliance</span>
        </button>
        <button 
          className={`nav-button ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveView('settings')}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>


    </aside>
  );
};

export default Sidebar;
