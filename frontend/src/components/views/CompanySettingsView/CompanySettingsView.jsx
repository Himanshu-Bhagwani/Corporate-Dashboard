import React, { useState, useEffect } from 'react';
import './CompanySettingsView.css';
import '../SettingsView/SettingsView.css';
import EmbeddedHeader from '../../layout/EmbeddedHeader/EmbeddedHeader';
import {
  Building2, Users, Bell, Shield, Check, Plus, Trash2,
  Eye, EyeOff, Mail, MapPin, Hash, Briefcase,
  Save, UserPlus, AlertCircle, CheckCircle2, Lock, Smartphone, Globe,
  TrendingUp, FileText, Zap, BellRing, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const ROLES = ['admin', 'editor', 'viewer'];
const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing',
  'Education', 'Real Estate', 'Hospitality', 'Consulting', 'Other',
];
const ENTITY_TYPES = [
  'Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Sole Proprietorship',
  'OPC', 'Section 8 Company', 'Trust', 'Other',
];

const CompanySettingsView = () => {
  const { user, currentCompany, fetchCompanies } = useAuth();
  const token = localStorage.getItem('token');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Company form
  const [companyForm, setCompanyForm] = useState({
    name: currentCompany?.name || '',
    industry: currentCompany?.industry || '',
    entityType: currentCompany?.entity_type || '',
    gstin: currentCompany?.gstin || '',
    pan: currentCompany?.pan || '',
    taxId: currentCompany?.tax_id || '',
    address: currentCompany?.address || '',
  });

  useEffect(() => {
    if (currentCompany) {
      setCompanyForm({
        name: currentCompany.name || '',
        industry: currentCompany.industry || '',
        entityType: currentCompany.entity_type || '',
        gstin: currentCompany.gstin || '',
        pan: currentCompany.pan || '',
        taxId: currentCompany.tax_id || '',
        address: currentCompany.address || '',
      });
    }
  }, [currentCompany]);

  // Team
  const [teamInvites, setTeamInvites] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState('viewer');

  useEffect(() => {
    if (!currentCompany) return;
    setTeamLoading(true);
    fetch(`/api/companies/${currentCompany.id}/team`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTeamInvites(data); })
      .catch(() => {})
      .finally(() => setTeamLoading(false));
  }, [currentCompany]);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      const s = localStorage.getItem('notif_prefs');
      return s ? JSON.parse(s) : {
        emailAlerts: true, pushNotifications: true, weeklyReports: true,
        monthlyStatements: true, invoiceReminders: true, complianceAlerts: true,
        cashflowAlerts: false, aiInsights: true,
      };
    } catch { return {}; }
  });

  // Security
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });
  const [twoFA, setTwoFA] = useState(false);
  const [sessionAlerts, setSessionAlerts] = useState(true);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const saveCompany = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${currentCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(companyForm),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      await fetchCompanies();
      showToast('Company details saved successfully');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const inviteMember = async () => {
    if (!newInviteEmail.trim()) return;
    try {
      const res = await fetch(`/api/companies/${currentCompany.id}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: newInviteEmail.trim(), role: newInviteRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to invite');
      const member = await res.json();
      setTeamInvites(prev => [member, ...prev]);
      setNewInviteEmail('');
      showToast(`Invite sent to ${newInviteEmail.trim()}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const removeInvite = async (id) => {
    try {
      await fetch(`/api/companies/${currentCompany.id}/team/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setTeamInvites(prev => prev.filter(i => i.id !== id));
      showToast('Member removed');
    } catch {
      showToast('Failed to remove member', 'error');
    }
  };

  const saveNotifPrefs = () => {
    localStorage.setItem('notif_prefs', JSON.stringify(notifPrefs));
    showToast('Notification preferences saved');
  };

  const changePassword = async () => {
    if (!pwForm.current || !pwForm.newPw) return showToast('Fill in all fields', 'error');
    if (pwForm.newPw !== pwForm.confirm) return showToast('New passwords do not match', 'error');
    if (pwForm.newPw.length < 6) return showToast('Password must be at least 6 characters', 'error');
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  const toggleNotif = (key) => setNotifPrefs(p => ({ ...p, [key]: !p[key] }));

  const PwField = ({ fieldKey, label, placeholder }) => (
    <div className="cs-form-group">
      <label className="cs-label">{label}</label>
      <div className="cs-pw-field">
        <input
          className="cs-input"
          type={showPw[fieldKey] ? 'text' : 'password'}
          value={pwForm[fieldKey]}
          onChange={e => setPwForm(p => ({ ...p, [fieldKey]: e.target.value }))}
          placeholder={placeholder}
        />
        <button
          className="cs-eye-btn"
          type="button"
          onClick={() => setShowPw(p => ({ ...p, [fieldKey]: !p[fieldKey] }))}
        >
          {showPw[fieldKey] ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <EmbeddedHeader />
      <div className="settings-view">
        <div className="view-header">
          <div>
            <h1 className="view-title">Company Settings</h1>
            <p className="view-subtitle">Manage your company profile, team, notifications and security</p>
          </div>
        </div>

        {/* ── Company Details ─────────────────────────────── */}
        <div className="settings-section account-section">
          <div className="section-header-with-icon">
            <div className="section-icon-wrapper blue-wrapper">
              <Building2 size={24} />
            </div>
            <div>
              <h2 className="section-title-simple">Company Details</h2>
              <p className="section-description">Your business registration and contact information</p>
            </div>
          </div>

          <div className="cs-form-grid">
            <div className="cs-form-group cs-span-2">
              <label className="cs-label"><Building2 size={13} /> Company Name</label>
              <input
                className="cs-input"
                value={companyForm.name}
                onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Your company name"
              />
            </div>

            <div className="cs-form-group">
              <label className="cs-label"><Briefcase size={13} /> Industry</label>
              <select
                className="cs-select"
                value={companyForm.industry}
                onChange={e => setCompanyForm(f => ({ ...f, industry: e.target.value }))}
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            <div className="cs-form-group">
              <label className="cs-label"><Hash size={13} /> Entity Type</label>
              <select
                className="cs-select"
                value={companyForm.entityType}
                onChange={e => setCompanyForm(f => ({ ...f, entityType: e.target.value }))}
              >
                <option value="">Select entity type</option>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="cs-form-group">
              <label className="cs-label"><Hash size={13} /> GSTIN</label>
              <input
                className="cs-input"
                value={companyForm.gstin}
                onChange={e => setCompanyForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
            </div>

            <div className="cs-form-group">
              <label className="cs-label"><Hash size={13} /> PAN</label>
              <input
                className="cs-input"
                value={companyForm.pan}
                onChange={e => setCompanyForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))}
                placeholder="AAAAA0000A"
                maxLength={10}
              />
            </div>

            <div className="cs-form-group">
              <label className="cs-label"><Hash size={13} /> Tax ID / CIN</label>
              <input
                className="cs-input"
                value={companyForm.taxId}
                onChange={e => setCompanyForm(f => ({ ...f, taxId: e.target.value }))}
                placeholder="Corporate Identification Number"
              />
            </div>

            <div className="cs-form-group">
              <label className="cs-label"><Mail size={13} /> Account Email</label>
              <input
                className="cs-input cs-input-disabled"
                value={user?.email || ''}
                disabled
                placeholder="Email from your account"
              />
            </div>

            <div className="cs-form-group cs-span-2">
              <label className="cs-label"><MapPin size={13} /> Registered Address</label>
              <textarea
                className="cs-textarea"
                value={companyForm.address}
                onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Full registered business address"
                rows={3}
              />
            </div>
          </div>

          <div className="cs-actions">
            <button className="cs-btn-primary" onClick={saveCompany} disabled={saving}>
              {saving ? <span className="cs-spinner" /> : <Save size={17} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* ── Team Members ─────────────────────────────── */}
        <div className="settings-section team-section">
          <div className="section-header-with-icon">
            <div className="section-icon-wrapper purple-wrapper">
              <Users size={24} />
            </div>
            <div>
              <h2 className="section-title-simple">Team Members</h2>
              <p className="section-description">Manage who has access to this company workspace</p>
            </div>
          </div>

          {/* Owner row */}
          <div className="cs-member-card cs-member-owner">
            <div className="cs-member-avatar cs-avatar-blue">
              {(user?.fullName || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="cs-member-info">
              <span className="cs-member-name">{user?.fullName || user?.email}</span>
              <span className="cs-member-email">{user?.email}</span>
            </div>
            <span className="cs-role-badge cs-role-owner">Owner</span>
          </div>

          {/* Invite form */}
          <div className="cs-invite-box">
            <h4 className="cs-invite-heading"><UserPlus size={16} /> Invite a Member</h4>
            <div className="cs-invite-row">
              <input
                type="email"
                className="cs-input cs-invite-email"
                value={newInviteEmail}
                onChange={e => setNewInviteEmail(e.target.value)}
                placeholder="Enter email address"
                onKeyDown={e => e.key === 'Enter' && inviteMember()}
              />
              <select
                className="cs-select cs-invite-role"
                value={newInviteRole}
                onChange={e => setNewInviteRole(e.target.value)}
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
              <button className="cs-btn-primary" onClick={inviteMember}>
                <UserPlus size={15} /> Invite
              </button>
            </div>
          </div>

          {/* Invited members */}
          {teamLoading ? (
            <div className="cs-loading">Loading team…</div>
          ) : teamInvites.length === 0 ? (
            <div className="cs-empty">
              <Users size={36} />
              <p>No members invited yet</p>
              <span>Use the form above to invite your team</span>
            </div>
          ) : (
            <div className="cs-members-list">
              <p className="cs-members-count">Invited Members ({teamInvites.length})</p>
              {teamInvites.map(invite => (
                <div key={invite.id} className="cs-member-card">
                  <div className="cs-member-avatar cs-avatar-grey">
                    {invite.email[0].toUpperCase()}
                  </div>
                  <div className="cs-member-info">
                    <span className="cs-member-name">{invite.email}</span>
                    <span className="cs-member-email">
                      Invited ·{' '}
                      <span className={`cs-status-pill cs-status-${invite.status}`}>
                        {invite.status}
                      </span>
                    </span>
                  </div>
                  <span className={`cs-role-badge cs-role-${invite.role}`}>{invite.role}</span>
                  <button className="cs-remove-btn" onClick={() => removeInvite(invite.id)} title="Remove">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Notifications ─────────────────────────────── */}
        <div className="settings-section notifications-section">
          <div className="section-header-with-icon">
            <div className="section-icon-wrapper orange-wrapper">
              <Bell size={24} />
            </div>
            <div>
              <h2 className="section-title-simple">Notifications</h2>
              <p className="section-description">Choose what alerts and updates you receive</p>
            </div>
          </div>

          <div className="notification-list">
            {[
              { key: 'emailAlerts', icon: <Mail size={20} />, title: 'Email Alerts', desc: 'Get important updates and alerts via email' },
              { key: 'pushNotifications', icon: <Smartphone size={20} />, title: 'Push Notifications', desc: 'Browser and mobile push notifications' },
              { key: 'weeklyReports', icon: <TrendingUp size={20} />, title: 'Weekly Reports', desc: 'A summary of your week every Monday' },
              { key: 'monthlyStatements', icon: <FileText size={20} />, title: 'Monthly Statements', desc: 'Full financial statement on the 1st of each month' },
              { key: 'invoiceReminders', icon: <BellRing size={20} />, title: 'Invoice Reminders', desc: 'Reminders for overdue and upcoming invoices' },
              { key: 'complianceAlerts', icon: <ShieldCheck size={20} />, title: 'Compliance Alerts', desc: 'GST, TDS and filing deadline reminders' },
              { key: 'cashflowAlerts', icon: <Zap size={20} />, title: 'Cash Flow Alerts', desc: 'Notify when cash runway drops below 3 months' },
              { key: 'aiInsights', icon: <TrendingUp size={20} />, title: 'AI CFO Insights', desc: 'Smart financial insights and recommendations' },
            ].map(({ key, icon, title, desc }) => (
              <div
                key={key}
                className={`notification-item ${notifPrefs[key] ? 'active' : ''}`}
                onClick={() => toggleNotif(key)}
              >
                <div className="notification-content">
                  <div className="notification-icon-bg">{icon}</div>
                  <div className="notification-text">
                    <h3 className="notification-title">{title}</h3>
                    <p className="notification-description">{desc}</p>
                  </div>
                </div>
                <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={!!notifPrefs[key]}
                    onChange={() => toggleNotif(key)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
          </div>

          <div className="cs-actions">
            <button className="cs-btn-primary" onClick={saveNotifPrefs}>
              <Save size={17} /> Save Preferences
            </button>
          </div>
        </div>

        {/* ── Security & Privacy ─────────────────────────── */}
        <div className="settings-section security-section">
          <div className="section-header-with-icon">
            <div className="section-icon-wrapper red-wrapper">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="section-title-simple">Security &amp; Privacy</h2>
              <p className="section-description">Keep your account safe with a strong password and 2FA</p>
            </div>
          </div>

          {/* Change Password card */}
          <div className="cs-security-card">
            <div className="cs-security-card-header">
              <div className="security-icon-wrapper">
                <Lock size={20} />
              </div>
              <div className="cs-security-card-text">
                <h3 className="security-title">Change Password</h3>
                <p className="security-description">Use a strong, unique password for your account</p>
              </div>
            </div>

            <div className="cs-pw-form">
              <PwField fieldKey="current" label="Current Password" placeholder="Enter current password" />
              <PwField fieldKey="newPw" label="New Password" placeholder="At least 6 characters" />
              <PwField fieldKey="confirm" label="Confirm New Password" placeholder="Repeat new password" />
              <button className="cs-btn-primary cs-btn-red" onClick={changePassword} disabled={saving}>
                {saving ? <span className="cs-spinner" /> : <Lock size={16} />}
                {saving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>

          {/* 2FA and Session as security-list items */}
          <div className="security-list">
            <div
              className="security-item"
              onClick={() => setTwoFA(v => !v)}
            >
              <div className="security-left">
                <div className="security-icon-wrapper">
                  <Smartphone size={20} />
                </div>
                <div className="security-content">
                  <h3 className="security-title">Two-Factor Authentication</h3>
                  <p className="security-description">
                    {twoFA ? 'Enabled — using Google Authenticator or any TOTP app' : 'Add an extra layer of security to your account'}
                  </p>
                </div>
              </div>
              <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={twoFA} onChange={() => setTwoFA(v => !v)} />
                <span className="toggle-slider" />
              </label>
            </div>

            <div
              className="security-item"
              onClick={() => setSessionAlerts(v => !v)}
            >
              <div className="security-left">
                <div className="security-icon-wrapper">
                  <Globe size={20} />
                </div>
                <div className="security-content">
                  <h3 className="security-title">Login Alerts</h3>
                  <p className="security-description">
                    Get notified when your account is accessed from a new device
                  </p>
                </div>
              </div>
              <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={sessionAlerts} onChange={() => setSessionAlerts(v => !v)} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div className={`cs-toast ${toast.type === 'error' ? 'cs-toast-error' : 'cs-toast-success'}`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}
    </>
  );
};

export default CompanySettingsView;
