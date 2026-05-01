import React, { useState, useEffect } from 'react';
import './CompanySettingsModal.css';
import {
  X, Building2, Users, Bell, Shield, Check, Plus, Trash2,
  Eye, EyeOff, Mail, Phone, MapPin, Hash, Briefcase, ChevronRight,
  Save, UserPlus, AlertCircle, CheckCircle2, Lock, Smartphone, Globe
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const ROLES = ['admin', 'editor', 'viewer'];
const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing',
  'Education', 'Real Estate', 'Hospitality', 'Consulting', 'Other'
];
const ENTITY_TYPES = [
  'Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Sole Proprietorship',
  'OPC', 'Section 8 Company', 'Trust', 'Other'
];

const Tab = ({ id, label, icon: Icon, active, onClick }) => (
  <button
    className={`csm-tab ${active ? 'active' : ''}`}
    onClick={() => onClick(id)}
  >
    <Icon size={17} />
    <span>{label}</span>
  </button>
);

const Toggle = ({ checked, onChange, label, description }) => (
  <div className="csm-toggle-row">
    <div className="csm-toggle-info">
      <div className="csm-toggle-label">{label}</div>
      {description && <div className="csm-toggle-desc">{description}</div>}
    </div>
    <button
      className={`csm-toggle-btn ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-label={label}
    >
      <span className="csm-toggle-thumb" />
    </button>
  </div>
);

const CompanySettingsModal = ({ onClose }) => {
  const { user, currentCompany, fetchCompanies } = useAuth();
  const token = localStorage.getItem('token');

  const [activeTab, setActiveTab] = useState('company');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Company details form
  const [companyForm, setCompanyForm] = useState({
    name: currentCompany?.name || '',
    industry: currentCompany?.industry || '',
    entityType: currentCompany?.entity_type || '',
    gstin: currentCompany?.gstin || '',
    pan: currentCompany?.pan || '',
    taxId: currentCompany?.tax_id || '',
    address: currentCompany?.address || '',
  });

  // Team state
  const [teamInvites, setTeamInvites] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState('viewer');

  // Notifications (persisted in localStorage)
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem('notif_prefs');
      return stored ? JSON.parse(stored) : {
        emailAlerts: true,
        pushNotifications: true,
        weeklyReports: true,
        monthlyStatements: true,
        invoiceReminders: true,
        complianceAlerts: true,
        cashflowAlerts: false,
        aiInsights: true,
      };
    } catch { return {}; }
  });

  // Security state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [twoFA, setTwoFA] = useState(false);
  const [sessionAlerts, setSessionAlerts] = useState(true);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load team invites
  useEffect(() => {
    if (activeTab !== 'team' || !currentCompany) return;
    setTeamLoading(true);
    fetch(`/api/companies/${currentCompany.id}/team`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTeamInvites(data); })
      .catch(() => {})
      .finally(() => setTeamLoading(false));
  }, [activeTab, currentCompany]);

  // Save company details
  const saveCompany = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${currentCompany.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(companyForm),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      await fetchCompanies();
      showToast('Company details saved successfully');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Invite member
  const inviteMember = async () => {
    if (!newInviteEmail.trim()) return;
    try {
      const res = await fetch(`/api/companies/${currentCompany.id}/team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: newInviteEmail.trim(), role: newInviteRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const newMember = await res.json();
      setTeamInvites(prev => [newMember, ...prev]);
      setNewInviteEmail('');
      showToast(`Invite sent to ${newInviteEmail}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Remove invite
  const removeInvite = async (inviteId) => {
    try {
      await fetch(`/api/companies/${currentCompany.id}/team/${inviteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setTeamInvites(prev => prev.filter(i => i.id !== inviteId));
      showToast('Member removed');
    } catch {
      showToast('Failed to remove member', 'error');
    }
  };

  // Save notification prefs
  const saveNotifPrefs = () => {
    localStorage.setItem('notif_prefs', JSON.stringify(notifPrefs));
    showToast('Notification preferences saved');
  };

  // Change password
  const changePassword = async () => {
    if (!pwForm.current || !pwForm.newPw) return showToast('Fill in all fields', 'error');
    if (pwForm.newPw !== pwForm.confirm) return showToast('New passwords do not match', 'error');
    if (pwForm.newPw.length < 6) return showToast('Password must be at least 6 characters', 'error');
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.newPw }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setPwForm({ current: '', newPw: '', confirm: '' });
      showToast('Password changed successfully');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="csm-overlay" onClick={onClose}>
      <div className="csm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="csm-header">
          <div className="csm-header-left">
            <div className="csm-header-icon">
              <Building2 size={22} />
            </div>
            <div>
              <h2 className="csm-title">Company Settings</h2>
              <p className="csm-subtitle">{currentCompany?.name}</p>
            </div>
          </div>
          <button className="csm-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="csm-tabs">
          <Tab id="company" label="Company" icon={Building2} active={activeTab === 'company'} onClick={setActiveTab} />
          <Tab id="team" label="Team" icon={Users} active={activeTab === 'team'} onClick={setActiveTab} />
          <Tab id="notifications" label="Notifications" icon={Bell} active={activeTab === 'notifications'} onClick={setActiveTab} />
          <Tab id="security" label="Security" icon={Shield} active={activeTab === 'security'} onClick={setActiveTab} />
        </div>

        {/* Body */}
        <div className="csm-body">

          {/* ── Company Tab ─────────────────────────────── */}
          {activeTab === 'company' && (
            <div className="csm-section">
              <div className="csm-section-header">
                <div className="csm-section-icon blue-icon"><Building2 size={20} /></div>
                <div>
                  <h3>Company Details</h3>
                  <p>Your business registration and contact information</p>
                </div>
              </div>

              <div className="csm-form-grid">
                <div className="csm-form-group full-width">
                  <label><Building2 size={14} /> Company Name</label>
                  <input
                    value={companyForm.name}
                    onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Your company name"
                  />
                </div>
                <div className="csm-form-group">
                  <label><Briefcase size={14} /> Industry</label>
                  <select
                    value={companyForm.industry}
                    onChange={e => setCompanyForm(f => ({ ...f, industry: e.target.value }))}
                  >
                    <option value="">Select industry</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className="csm-form-group">
                  <label><Hash size={14} /> Entity Type</label>
                  <select
                    value={companyForm.entityType}
                    onChange={e => setCompanyForm(f => ({ ...f, entityType: e.target.value }))}
                  >
                    <option value="">Select entity type</option>
                    {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="csm-form-group">
                  <label><Hash size={14} /> GSTIN</label>
                  <input
                    value={companyForm.gstin}
                    onChange={e => setCompanyForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </div>
                <div className="csm-form-group">
                  <label><Hash size={14} /> PAN</label>
                  <input
                    value={companyForm.pan}
                    onChange={e => setCompanyForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))}
                    placeholder="AAAAA0000A"
                    maxLength={10}
                  />
                </div>
                <div className="csm-form-group">
                  <label><Hash size={14} /> Tax ID / CIN</label>
                  <input
                    value={companyForm.taxId}
                    onChange={e => setCompanyForm(f => ({ ...f, taxId: e.target.value }))}
                    placeholder="Corporate Identification Number"
                  />
                </div>
                <div className="csm-form-group">
                  <label><Mail size={14} /> Account Email</label>
                  <input
                    value={user?.email || ''}
                    disabled
                    className="csm-input-disabled"
                    placeholder="Email from your account"
                  />
                </div>
                <div className="csm-form-group full-width">
                  <label><MapPin size={14} /> Registered Address</label>
                  <textarea
                    value={companyForm.address}
                    onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Full registered business address"
                    rows={3}
                  />
                </div>
              </div>

              <div className="csm-form-actions">
                <button className="csm-btn-primary" onClick={saveCompany} disabled={saving}>
                  {saving ? <span className="csm-spinner" /> : <Save size={16} />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* ── Team Tab ─────────────────────────────── */}
          {activeTab === 'team' && (
            <div className="csm-section">
              <div className="csm-section-header">
                <div className="csm-section-icon purple-icon"><Users size={20} /></div>
                <div>
                  <h3>Team Members</h3>
                  <p>Manage who has access to this company</p>
                </div>
              </div>

              {/* Current user (owner) */}
              <div className="csm-member-card owner">
                <div className="csm-member-avatar">
                  {(user?.fullName || user?.email || 'U')[0].toUpperCase()}
                </div>
                <div className="csm-member-info">
                  <div className="csm-member-name">{user?.fullName || user?.email}</div>
                  <div className="csm-member-email">{user?.email}</div>
                </div>
                <span className="csm-role-badge owner-badge">Owner</span>
              </div>

              {/* Invite form */}
              <div className="csm-invite-form">
                <h4 className="csm-invite-title"><UserPlus size={16} /> Invite a Member</h4>
                <div className="csm-invite-row">
                  <input
                    type="email"
                    value={newInviteEmail}
                    onChange={e => setNewInviteEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="csm-invite-email"
                    onKeyDown={e => e.key === 'Enter' && inviteMember()}
                  />
                  <select
                    value={newInviteRole}
                    onChange={e => setNewInviteRole(e.target.value)}
                    className="csm-invite-role"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                  <button className="csm-btn-primary" onClick={inviteMember}>
                    <UserPlus size={16} /> Invite
                  </button>
                </div>
              </div>

              {/* Invited members list */}
              {teamLoading ? (
                <div className="csm-loading">Loading team…</div>
              ) : teamInvites.length === 0 ? (
                <div className="csm-empty-team">
                  <Users size={32} />
                  <p>No members invited yet</p>
                  <span>Use the form above to invite team members</span>
                </div>
              ) : (
                <div className="csm-members-list">
                  <h4 className="csm-members-list-title">Invited Members ({teamInvites.length})</h4>
                  {teamInvites.map(invite => (
                    <div key={invite.id} className="csm-member-card">
                      <div className="csm-member-avatar invited">
                        {invite.email[0].toUpperCase()}
                      </div>
                      <div className="csm-member-info">
                        <div className="csm-member-name">{invite.email}</div>
                        <div className="csm-member-email">
                          Invited · <span className={`csm-status-dot ${invite.status}`}>{invite.status}</span>
                        </div>
                      </div>
                      <span className="csm-role-badge">{invite.role}</span>
                      <button
                        className="csm-remove-btn"
                        onClick={() => removeInvite(invite.id)}
                        title="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Notifications Tab ──────────────────────── */}
          {activeTab === 'notifications' && (
            <div className="csm-section">
              <div className="csm-section-header">
                <div className="csm-section-icon orange-icon"><Bell size={20} /></div>
                <div>
                  <h3>Notification Preferences</h3>
                  <p>Choose what alerts and updates you receive</p>
                </div>
              </div>

              <div className="csm-notif-group">
                <h4 className="csm-notif-group-title">Delivery Methods</h4>
                <Toggle checked={notifPrefs.emailAlerts} onChange={v => setNotifPrefs(p => ({ ...p, emailAlerts: v }))}
                  label="Email Alerts" description="Get important alerts via email" />
                <Toggle checked={notifPrefs.pushNotifications} onChange={v => setNotifPrefs(p => ({ ...p, pushNotifications: v }))}
                  label="Push Notifications" description="Browser and mobile push notifications" />
              </div>

              <div className="csm-notif-group">
                <h4 className="csm-notif-group-title">Reports & Summaries</h4>
                <Toggle checked={notifPrefs.weeklyReports} onChange={v => setNotifPrefs(p => ({ ...p, weeklyReports: v }))}
                  label="Weekly Reports" description="A summary of your week every Monday" />
                <Toggle checked={notifPrefs.monthlyStatements} onChange={v => setNotifPrefs(p => ({ ...p, monthlyStatements: v }))}
                  label="Monthly Statements" description="Full financial statement on the 1st of each month" />
              </div>

              <div className="csm-notif-group">
                <h4 className="csm-notif-group-title">Business Alerts</h4>
                <Toggle checked={notifPrefs.invoiceReminders} onChange={v => setNotifPrefs(p => ({ ...p, invoiceReminders: v }))}
                  label="Invoice Reminders" description="Reminders for overdue and upcoming invoices" />
                <Toggle checked={notifPrefs.complianceAlerts} onChange={v => setNotifPrefs(p => ({ ...p, complianceAlerts: v }))}
                  label="Compliance Alerts" description="GST, TDS and filing deadline reminders" />
                <Toggle checked={notifPrefs.cashflowAlerts} onChange={v => setNotifPrefs(p => ({ ...p, cashflowAlerts: v }))}
                  label="Cash Flow Alerts" description="Notify when cash runway drops below 3 months" />
                <Toggle checked={notifPrefs.aiInsights} onChange={v => setNotifPrefs(p => ({ ...p, aiInsights: v }))}
                  label="AI CFO Insights" description="Smart financial insights and recommendations" />
              </div>

              <div className="csm-form-actions">
                <button className="csm-btn-primary" onClick={saveNotifPrefs}>
                  <Save size={16} /> Save Preferences
                </button>
              </div>
            </div>
          )}

          {/* ── Security Tab ──────────────────────────── */}
          {activeTab === 'security' && (
            <div className="csm-section">
              <div className="csm-section-header">
                <div className="csm-section-icon red-icon"><Shield size={20} /></div>
                <div>
                  <h3>Security & Privacy</h3>
                  <p>Manage your password, 2FA and session settings</p>
                </div>
              </div>

              {/* Change Password */}
              <div className="csm-security-card">
                <div className="csm-security-card-header">
                  <Lock size={18} />
                  <div>
                    <h4>Change Password</h4>
                    <p>Use a strong, unique password for your account</p>
                  </div>
                </div>
                <div className="csm-pw-form">
                  {[
                    { key: 'current', label: 'Current Password', placeholder: 'Enter current password' },
                    { key: 'newPw', label: 'New Password', placeholder: 'At least 6 characters' },
                    { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="csm-form-group">
                      <label>{label}</label>
                      <div className="csm-pw-field">
                        <input
                          type={showPw[key] ? 'text' : 'password'}
                          value={pwForm[key]}
                          onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                          placeholder={placeholder}
                        />
                        <button
                          className="csm-pw-toggle"
                          onClick={() => setShowPw(p => ({ ...p, [key]: !p[key] }))}
                          type="button"
                        >
                          {showPw[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <button className="csm-btn-primary" onClick={changePassword} disabled={saving}>
                    {saving ? <span className="csm-spinner" /> : <Lock size={16} />}
                    {saving ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </div>

              {/* 2FA */}
              <div className="csm-security-card">
                <div className="csm-security-card-header">
                  <Smartphone size={18} />
                  <div>
                    <h4>Two-Factor Authentication</h4>
                    <p>Add an extra layer of security to your account</p>
                  </div>
                  <div className="csm-2fa-badge">{twoFA ? 'Enabled' : 'Disabled'}</div>
                </div>
                <div className="csm-2fa-body">
                  <Toggle
                    checked={twoFA}
                    onChange={setTwoFA}
                    label="Enable 2FA via Authenticator App"
                    description="Use Google Authenticator, Authy, or any TOTP app"
                  />
                  {twoFA && (
                    <div className="csm-2fa-info">
                      <CheckCircle2 size={16} color="#22c55e" />
                      <span>Scan the QR code in your authenticator app to complete setup</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Session Settings */}
              <div className="csm-security-card">
                <div className="csm-security-card-header">
                  <Globe size={18} />
                  <div>
                    <h4>Session Settings</h4>
                    <p>Control how your sessions are managed</p>
                  </div>
                </div>
                <Toggle
                  checked={sessionAlerts}
                  onChange={setSessionAlerts}
                  label="Login Alerts"
                  description="Get notified when your account is accessed from a new device"
                />
              </div>
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`csm-toast ${toast.type === 'error' ? 'csm-toast-error' : 'csm-toast-success'}`}>
            {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanySettingsModal;
