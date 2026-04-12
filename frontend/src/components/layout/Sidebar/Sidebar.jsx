import React from 'react';
import './Sidebar.css';
import { LayoutDashboard, Receipt, FileText, TrendingUp, BarChart3, FileCheck, Settings, BookOpen, BrainCircuit, Lock, Activity, CalendarClock } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const Sidebar = ({ activeView, setActiveView, stats }) => {
  const { currentCompany } = useAuth();
  
  const isLaunchpad = currentCompany?.plan === 'Launchpad';

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
          className={`nav-button ${activeView === 'accounting' ? 'active' : ''}`}
          onClick={() => setActiveView('accounting')}
        >
          <BookOpen size={20} />
          <span>Accounting</span>
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
          className={`nav-button ${activeView === 'aicfo' ? 'active' : ''}`}
          onClick={() => setActiveView('aicfo')}
        >
          <BrainCircuit size={20} />
          <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            AI CFO
            {isLaunchpad && <Lock size={14} style={{ marginLeft: 'auto', color: '#94a3b8' }} />}
          </span>
        </button>
        <button 
          className={`nav-button ${activeView === 'profitlab' ? 'active' : ''}`}
          onClick={() => setActiveView('profitlab')}
        >
          <Activity size={20} />
          <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            Profit Lab
            {isLaunchpad && <Lock size={14} style={{ marginLeft: 'auto', color: '#94a3b8' }} />}
          </span>
        </button>
        <button 
          className={`nav-button ${activeView === 'forecasting' ? 'active' : ''}`}
          onClick={() => setActiveView('forecasting')}
        >
          <CalendarClock size={20} />
          <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            Forecasting
            {isLaunchpad && <Lock size={14} style={{ marginLeft: 'auto', color: '#94a3b8' }} />}
          </span>
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
