import React, { useState, useEffect, createContext, useContext } from 'react';
import {
  Users, Calendar, Clock, DollarSign, FileText, Settings, Bell, MessageSquare,
  ShieldAlert, LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Search,
  Download, Upload, ChevronRight, UserCheck, UserX, Sun, Moon, Send, Sparkles,
  BarChart3, RefreshCw, Eye, Edit, Trash2, Check, X, Filter, Lock, HelpCircle
} from 'lucide-react';

import './App.css';

// ==========================================
// CONFIGURATION & API SERVICE LAYER
// ==========================================
const API_BASE_URL = 'http://localhost:5001/api';

// Local Storage Helpers
const getToken = () => localStorage.getItem('hcm_token');
const setToken = (token) => localStorage.setItem('hcm_token', token);
const removeToken = () => localStorage.removeItem('hcm_token');

// API Request Wrapper
async function apiCall(endpoint, method = 'GET', data = null) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const config = {
    method,
    headers,
    ...(data ? { body: JSON.stringify(data) } : {})
  };

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || 'API Request Failed');
    }
    return json;
  } catch (err) {
    console.warn(`API call ${endpoint} failed, utilizing local fallback mock where appropriate.`, err.message);
    throw err;
  }
}

// ==========================================
// CONTEXT PROVIDERS
// ==========================================
const AuthContext = createContext(null);

// Default Mock Data for Offline / Pure Frontend Demo Mode
const MOCK_CURRENT_USER = {
  _id: 'usr_admin_123',
  email: 'admin@hcmlite.com',
  role: 'admin', // 'admin', 'hr', 'employee'
  employeeId: 'emp_001',
  mustChangePassword: false
};

const MOCK_COMPANY = {
  name: 'Acme Corporation',
  timezone: 'Asia/Karachi',
  officeStart: '09:00',
  graceMinutes: 15,
  halfDayHours: 5,
  weekends: [0, 6]
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [user, setUser] = useState(MOCK_CURRENT_USER);
  const [token, setTokenState] = useState(getToken());
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('hcm_theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('hcm_theme', theme);
  }, [theme]);
  const [notifications, setNotifications] = useState([
    { _id: '1', title: 'Leave Approved', body: 'Your Annual leave for Nov 12 has been approved.', read: false },
    { _id: '2', title: 'Payslip Finalized', body: 'Payslip for 2026-10 is now available for download.', read: true }
  ]);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Initialize Session & Setup Check
  useEffect(() => {
    async function init() {
      try {
        const setupRes = await apiCall('/setup/status');
        if (!setupRes.configured) {
          setSetupRequired(true);
        } else if (getToken()) {
          const me = await apiCall('/auth/me');
          setUser(me);
          if (me.mustChangePassword) setShowPasswordModal(true);
        }
      } catch (err) {
        // Fallback to mock session if backend server is not running locally
        console.log("Operating in Preview/Mock Mode.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const login = async (email, password) => {
    try {
      const res = await apiCall('/auth/login', 'POST', { email, password });
      setToken(res.token);
      setTokenState(res.token);
      setUser(res.user);
      if (res.user.mustChangePassword) setShowPasswordModal(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      await apiCall('/auth/logout', 'POST');
    } catch (e) {}
    removeToken();
    setTokenState(null);
    setUser(null);
  };

  // Role Switching Helper for Demo Purposes
  const switchDemoRole = (role) => {
    setUser({
      _id: `usr_${role}_1`,
      email: `${role}@hcmlite.com`,
      role,
      employeeId: role === 'employee' ? 'emp_101' : 'emp_001',
      mustChangePassword: false
    });
  };

  if (loading) {
    return (
      <div className="ui-min-h-screen ui-flex ui-items-center ui-justify-center ui-bg-slate-900 ui-text-white">
        <div className="ui-flex ui-flex-col ui-items-center ui-space-y-4">
          <RefreshCw className="ui-w-10 ui-h-10 ui-animate-spin ui-text-indigo-500" />
          <p className="ui-text-lg ui-font-medium">Initializing HCM Lite Platform...</p>
        </div>
      </div>
    );
  }

  // Mandatory Initial Setup Form
  if (setupRequired) {
    return <FirstRunSetupScreen onComplete={() => setSetupRequired(false)} />;
  }

  // Unauthenticated Login Screen
  if (!user && !token) {
    return <LoginScreen onLogin={login} onRoleSelect={switchDemoRole} />;
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout, switchDemoRole }}>
      <div className={`app-shell ${theme} ui-min-h-screen ui-bg-slate-900 ui-text-slate-100 ui-flex ui-flex-col ui-md-flex-row ui-font-sans ui-antialiased`}>
        
        {/* SIDEBAR NAVIGATION */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} role={user?.role} />

        {/* MAIN CONTENT AREA */}
        <div className="ui-flex-1 ui-flex ui-flex-col ui-min-w-0 ui-overflow-hidden">
          {/* HEADER BAR */}
          <Header
            user={user}
            notifications={notifications}
            setNotifications={setNotifications}
            onOpenAi={() => setIsAiOpen(true)}
            onLogout={logout}
            theme={theme}
            onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
          />

          {/* PAGE CONTENT */}
          <main className="ui-flex-1 ui-overflow-y-auto ui-p-4 ui-md-p-6 ui-lg-p-8 ui-bg-slate-950">
            {activeTab === 'dashboard' && <AnalyticsDashboard role={user?.role} />}
            {activeTab === 'employees' && <EmployeeDirectory role={user?.role} />}
            {activeTab === 'attendance' && <AttendanceBoard role={user?.role} />}
            {activeTab === 'leave' && <LeaveManagement role={user?.role} />}
            {activeTab === 'payroll' && <PayrollModule role={user?.role} />}
            {activeTab === 'organization' && <OrganizationSetup role={user?.role} />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'announcements' && <AnnouncementsFeed role={user?.role} />}
            {activeTab === 'audit' && <AuditLogViewer />}
          </main>
        </div>

        {/* FLOATING AI ASSISTANT PANEL */}
        <AiAssistantDrawer isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} user={user} />

        {/* FORCE PASSWORD CHANGE MODAL */}
        {showPasswordModal && (
          <ForcePasswordModal onClose={() => setShowPasswordModal(false)} />
        )}
      </div>
    </AuthContext.Provider>
  );
}

// ==========================================
// 1. FIRST RUN SETUP & AUTH SCREENS
// ==========================================
function FirstRunSetupScreen({ onComplete }) {
  const [formData, setFormData] = useState({ companyName: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/setup', 'POST', formData);
      onComplete();
    } catch (err) {
      setError(err.message || 'Setup failed. Please check your credentials.');
    }
  };

  return (
    <div className="ui-min-h-screen ui-flex ui-items-center ui-justify-center ui-bg-slate-950 ui-p-4">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-8 ui-max-w-md ui-w-full ui-shadow-2xl">
        <div className="ui-flex ui-items-center ui-space-x-3 ui-mb-6">
          <div className="ui-p-3 ui-bg-indigo-600 ui-rounded-xl">
            <Sparkles className="ui-w-6 ui-h-6 ui-text-white" />
          </div>
          <div>
            <h1 className="ui-text-2xl ui-font-bold ui-text-white">HCM Lite Setup</h1>
            <p className="ui-text-slate-400 ui-text-sm">Initialize your organization workspace</p>
          </div>
        </div>

        {error && (
          <div className="ui-mb-4 ui-p-3 ui-bg-red-500-10 ui-border ui-border-red-500-30 ui-rounded-lg ui-text-red-400 ui-text-sm ui-flex ui-items-center ui-gap-2">
            <AlertTriangle className="ui-w-4 ui-h-4 ui-flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="ui-space-y-4">
          <div>
            <label className="ui-block ui-text-xs ui-font-semibold ui-uppercase ui-text-slate-400 ui-mb-1">Company Name</label>
            <input
              type="text"
              required
              className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-px-3 ui-py-2 ui-text-white ui-focus-outline-none ui-focus-border-indigo-500"
              placeholder="e.g. Hexa Software Solutions"
              value={formData.companyName}
              onChange={e => setFormData({ ...formData, companyName: e.target.value })}
            />
          </div>
          <div>
            <label className="ui-block ui-text-xs ui-font-semibold ui-uppercase ui-text-slate-400 ui-mb-1">Admin Email</label>
            <input
              type="email"
              required
              className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-px-3 ui-py-2 ui-text-white ui-focus-outline-none ui-focus-border-indigo-500"
              placeholder="admin@company.com"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="ui-block ui-text-xs ui-font-semibold ui-uppercase ui-text-slate-400 ui-mb-1">Admin Password</label>
            <input
              type="password"
              required
              minLength={10}
              className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-px-3 ui-py-2 ui-text-white ui-focus-outline-none ui-focus-border-indigo-500"
              placeholder="Min 10 characters"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            className="ui-w-full ui-py-3 ui-px-4 ui-bg-indigo-600 ui-hover-bg-indigo-500 ui-text-white ui-font-semibold ui-rounded-xl ui-transition ui-duration-200 ui-shadow-lg ui-shadow-indigo-600-30"
          >
            Complete System Setup
          </button>
        </form>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, onRoleSelect }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await onLogin(email, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="ui-min-h-screen ui-flex ui-items-center ui-justify-center ui-bg-slate-950 ui-p-4">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-8 ui-max-w-md ui-w-full ui-shadow-2xl">
        <div className="ui-text-center ui-mb-8">
          <div className="ui-inline-flex ui-p-3 ui-bg-indigo-600-20 ui-border ui-border-indigo-500-30 ui-rounded-2xl ui-mb-3">
            <Users className="ui-w-8 ui-h-8 ui-text-indigo-400" />
          </div>
          <h1 className="ui-text-2xl ui-font-bold ui-text-white">Sign In to HCM Lite</h1>
          <p className="ui-text-slate-400 ui-text-sm ui-mt-1">Enterprise Human Capital Management</p>
        </div>

        {/* QUICK DEMO ROLE SWITCHER */}
        <div className="ui-mb-6 ui-p-3 ui-bg-slate-800-60 ui-rounded-xl ui-border ui-border-slate-700-50">
          <p className="ui-text-xs ui-text-slate-400 ui-font-medium ui-mb-2 ui-text-center">⚡ Instant UI Interactive Testing:</p>
          <div className="ui-grid ui-grid-cols-3 ui-gap-2">
            <button
              onClick={() => onRoleSelect('admin')}
              className="ui-px-2 ui-py-1.5 ui-bg-indigo-600-30 ui-hover-bg-indigo-600-50 ui-border ui-border-indigo-500-40 ui-text-indigo-200 ui-rounded-lg ui-text-xs ui-font-semibold"
            >
              Admin Mode
            </button>
            <button
              onClick={() => onRoleSelect('hr')}
              className="ui-px-2 ui-py-1.5 ui-bg-purple-600-30 ui-hover-bg-purple-600-50 ui-border ui-border-purple-500-40 ui-text-purple-200 ui-rounded-lg ui-text-xs ui-font-semibold"
            >
              HR Manager
            </button>
            <button
              onClick={() => onRoleSelect('employee')}
              className="ui-px-2 ui-py-1.5 ui-bg-emerald-600-30 ui-hover-bg-emerald-600-50 ui-border ui-border-emerald-500-40 ui-text-emerald-200 ui-rounded-lg ui-text-xs ui-font-semibold"
            >
              Employee
            </button>
          </div>
        </div>

        {error && (
          <div className="ui-mb-4 ui-p-3 ui-bg-red-500-10 ui-border ui-border-red-500-30 ui-rounded-lg ui-text-red-400 ui-text-sm ui-flex ui-items-center ui-gap-2">
            <AlertTriangle className="ui-w-4 ui-h-4 ui-flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="ui-space-y-4">
          <div>
            <label className="ui-block ui-text-xs ui-font-semibold ui-uppercase ui-text-slate-400 ui-mb-1">Work Email</label>
            <input
              type="email"
              required
              className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-px-3 ui-py-2 ui-text-white ui-focus-outline-none ui-focus-border-indigo-500"
              placeholder="user@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="ui-block ui-text-xs ui-font-semibold ui-uppercase ui-text-slate-400 ui-mb-1">Password</label>
            <input
              type="password"
              required
              className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-px-3 ui-py-2 ui-text-white ui-focus-outline-none ui-focus-border-indigo-500"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ui-w-full ui-py-3 ui-px-4 ui-bg-indigo-600 ui-hover-bg-indigo-500 ui-text-white ui-font-semibold ui-rounded-xl ui-transition ui-duration-200 ui-shadow-lg ui-shadow-indigo-600-30 ui-flex ui-items-center ui-justify-center"
          >
            {loading ? <RefreshCw className="ui-w-5 ui-h-5 ui-animate-spin" /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ForcePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/auth/password', 'POST', { currentPassword, newPassword });
      onClose();
    } catch (err) {
      setError(err.message || 'Password update failed.');
    }
  };

  return (
    <div className="ui-fixed ui-inset-0 ui-bg-black-70 ui-backdrop-blur-sm ui-flex ui-items-center ui-justify-center ui-p-4 ui-z-50">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6 ui-max-w-md ui-w-full ui-shadow-2xl">
        <h2 className="ui-text-xl ui-font-bold ui-text-white ui-mb-2">Change Temporary Password</h2>
        <p className="ui-text-slate-400 ui-text-sm ui-mb-4">You are required to set a new password before continuing.</p>
        
        {error && <p className="ui-text-red-400 ui-text-sm ui-mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="ui-space-y-4">
          <div>
            <label className="ui-block ui-text-xs ui-text-slate-400 ui-mb-1">Current Temporary Password</label>
            <input
              type="password"
              required
              className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-px-3 ui-py-2 ui-text-white"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="ui-block ui-text-xs ui-text-slate-400 ui-mb-1">New Password (Min 10 chars)</label>
            <input
              type="password"
              required
              minLength={10}
              className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-px-3 ui-py-2 ui-text-white"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="ui-w-full ui-py-2.5 ui-bg-indigo-600 ui-hover-bg-indigo-500 ui-text-white ui-font-medium ui-rounded-xl"
          >
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. LAYOUT COMPONENTS (SIDEBAR & HEADER)
// ==========================================
function Sidebar({ activeTab, setActiveTab, role }) {
  const navItems = [
    { id: 'dashboard', label: 'Analytics', icon: BarChart3, roles: ['admin', 'hr', 'employee'] },
    { id: 'employees', label: 'Employee Directory', icon: Users, roles: ['admin', 'hr', 'employee'] },
    { id: 'attendance', label: 'Attendance Board', icon: Clock, roles: ['admin', 'hr', 'employee'] },
    { id: 'leave', label: 'Leave & Balances', icon: Calendar, roles: ['admin', 'hr', 'employee'] },
    { id: 'payroll', label: 'Payroll & Payslips', icon: DollarSign, roles: ['admin', 'hr', 'employee'] },
    { id: 'organization', label: 'Organization Setup', icon: Settings, roles: ['admin'] },
    { id: 'users', label: 'User Roles', icon: Lock, roles: ['admin'] },
    { id: 'announcements', label: 'Announcements', icon: Bell, roles: ['admin', 'hr', 'employee'] },
    { id: 'audit', label: 'Audit Logs', icon: FileText, roles: ['admin'] }
  ];

  const filteredItems = navItems.filter(item => item.roles.includes(role));

  return (
    <aside className="ui-w-full ui-md-w-64 ui-bg-slate-900 ui-border-b ui-md-border-b-0 ui-md-border-r ui-border-slate-800 ui-flex ui-flex-col ui-flex-shrink-0">
      <div className="ui-p-4 ui-md-p-6 ui-flex ui-items-center ui-justify-between ui-border-b ui-border-slate-800-80">
        <div className="ui-flex ui-items-center ui-space-x-3">
          <div className="ui-p-2 ui-bg-indigo-600 ui-rounded-xl ui-shadow-md ui-shadow-indigo-600-30">
            <Sparkles className="ui-w-5 ui-h-5 ui-text-white" />
          </div>
          <span className="ui-font-bold ui-text-lg ui-text-white ui-tracking-wide">HCM Lite</span>
        </div>
        <span className="ui-text-xs ui-uppercase ui-px-2 ui-py-0.5 ui-rounded-full ui-font-bold ui-bg-indigo-500-20 ui-text-indigo-300 ui-border ui-border-indigo-500-30">
          {role}
        </span>
      </div>

      <nav className="ui-flex-1 ui-p-4 ui-space-y-1 ui-overflow-y-auto">
        {filteredItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                isActive
                  ? 'ui-bg-indigo-600 ui-text-white ui-shadow-lg ui-shadow-indigo-600-20'
                  : 'ui-text-slate-400 ui-hover-bg-slate-800 ui-hover-text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'ui-text-white' : 'ui-text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* FOOTER INFO */}
      <div className="ui-p-4 ui-border-t ui-border-slate-800-80 ui-hidden ui-md-block">
        <div className="ui-p-3 ui-bg-slate-950-60 ui-rounded-xl ui-border ui-border-slate-800 ui-text-xs ui-text-slate-400">
          <p className="ui-font-semibold ui-text-slate-300 ui-mb-1">HCM Lite Engine v1.0</p>
          <p>Connected to MongoDB & Express</p>
        </div>
      </div>
    </aside>
  );
}

function Header({ user, notifications, setNotifications, onOpenAi, onLogout, theme, onToggleTheme }) {
  const [showNotifs, setShowNotifs] = useState(false);
  const { switchDemoRole } = useContext(AuthContext);
  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  return (
    <header className="ui-h-16 ui-bg-slate-900 ui-border-b ui-border-slate-800 ui-px-4 ui-md-px-6 ui-flex ui-items-center ui-justify-between ui-z-10">
      <div className="ui-flex ui-items-center ui-space-x-4">
        <h2 className="ui-text-lg ui-font-semibold ui-text-white ui-hidden ui-sm-block">HCM Lite Workspace</h2>
        
        {/* QUICK ROLE SWITCHER FOR TESTING */}
        <div className="ui-hidden ui-lg-flex ui-items-center ui-space-x-1 ui-bg-slate-950 ui-p-1 ui-rounded-lg ui-border ui-border-slate-800 ui-text-xs">
          <span className="ui-text-slate-500 ui-px-2 ui-font-medium">Role:</span>
          {['admin', 'hr', 'employee'].map(r => (
            <button
              key={r}
              onClick={() => switchDemoRole(r)}
              className={`px-2 py-1 rounded capitalize font-medium ${
                user?.role === r ? 'ui-bg-indigo-600 ui-text-white' : 'ui-text-slate-400 ui-hover-text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="ui-flex ui-items-center ui-space-x-3">
        {/* DARK / LIGHT THEME TOGGLE */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="theme-toggle ui-flex ui-items-center ui-space-x-2 ui-px-3 ui-py-2 ui-rounded-xl ui-text-xs ui-font-semibold ui-transition"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun className="ui-w-4 ui-h-4" /> : <Moon className="ui-w-4 ui-h-4" />}
          <span className="ui-hidden ui-sm-inline">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        {/* AI ASSISTANT BUTTON */}
        <button
          onClick={onOpenAi}
          className="ui-flex ui-items-center ui-space-x-2 ui-px-3 ui-py-1.5 ui-bg-gradient-to-r ui-from-indigo-600 ui-to-purple-600 ui-hover-from-indigo-500 ui-hover-to-purple-500 ui-text-white ui-rounded-xl ui-text-xs ui-font-semibold ui-shadow-md ui-shadow-indigo-600-20 ui-transition-all ui-duration-200"
        >
          <Sparkles className="ui-w-4 ui-h-4 ui-text-amber-300" />
          <span className="ui-hidden ui-sm-inline">AI HR Assistant</span>
        </button>

        {/* NOTIFICATIONS DROPDOWN */}
        <div className="ui-relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="ui-p-2 ui-text-slate-400 ui-hover-text-white ui-rounded-xl ui-hover-bg-slate-800 ui-relative ui-transition"
          >
            <Bell className="ui-w-5 ui-h-5" />
            {unreadCount > 0 && (
              <span className="ui-absolute ui-top-1.5 ui-right-1.5 ui-w-2.5 ui-h-2.5 ui-bg-indigo-500 ui-rounded-full ui-ring-2 ui-ring-slate-900"></span>
            )}
          </button>

          {showNotifs && (
            <div className="ui-absolute ui-right-0 ui-mt-2 ui-w-80 ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-shadow-2xl ui-p-4 ui-z-50">
              <div className="ui-flex ui-items-center ui-justify-between ui-mb-3 ui-border-b ui-border-slate-800 ui-pb-2">
                <span className="ui-font-semibold ui-text-sm ui-text-white">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="ui-text-xs ui-text-indigo-400 ui-hover-underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="ui-space-y-2 ui-max-h-64 ui-overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="ui-text-slate-500 ui-text-xs ui-text-center ui-py-4">No notifications</p>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n._id}
                      className={`p-2.5 rounded-xl text-xs border ${
                        n.read ? 'ui-bg-slate-950-40 ui-border-slate-800-40 ui-text-slate-400' : 'ui-bg-slate-800-80 ui-border-indigo-500-30 ui-text-slate-200'
                      }`}
                    >
                      <p className="ui-font-semibold ui-text-white">{n.title}</p>
                      <p className="ui-mt-0.5">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* USER PROFILE & LOGOUT */}
        <div className="ui-flex ui-items-center ui-space-x-2 ui-pl-2 ui-border-l ui-border-slate-800">
          <div className="ui-w-8 ui-h-8 ui-rounded-full ui-bg-indigo-600-30 ui-border ui-border-indigo-500-40 ui-flex ui-items-center ui-justify-center ui-text-indigo-300 ui-font-bold ui-text-xs">
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <button
            onClick={onLogout}
            className="ui-p-2 ui-text-slate-400 ui-hover-text-red-400 ui-rounded-xl ui-hover-bg-slate-800 ui-transition"
            title="Sign Out"
          >
            <LogOut className="ui-w-5 ui-h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

// ==========================================
// 3. ANALYTICS & DASHBOARD MODULE
// ==========================================
function AnalyticsDashboard({ role }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await apiCall('/analytics');
        setData(res);
      } catch (err) {
        // Fallback Mock Data
        setData({
          kpis: {
            headcount: 48,
            attendanceRate: 94.2,
            presentToday: 42,
            lateToday: 3,
            onLeaveToday: 3,
            pendingLeaves: 5,
            payrollNet: 2840000,
            latePercent: 6.2
          },
          headcountByDepartment: [
            { department: 'Engineering', headcount: 22 },
            { department: 'Human Resources', headcount: 6 },
            { department: 'Marketing', headcount: 10 },
            { department: 'Sales', headcount: 10 }
          ],
          topLateComers: [
            { name: 'Ali Khan', count: 4 },
            { name: 'Sara Ahmed', count: 3 }
          ]
        });
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return <div className="ui-p-8 ui-text-center ui-text-slate-400">Loading Dashboard Metrics...</div>;
  }

  const kpis = data?.kpis || {};

  return (
    <div className="ui-space-y-6">
      <div className="ui-flex ui-flex-col ui-sm-flex-row ui-items-start ui-sm-items-center ui-justify-between ui-gap-4">
        <div>
          <h1 className="ui-text-2xl ui-font-bold ui-text-white">HR Dashboard & Analytics</h1>
          <p className="ui-text-slate-400 ui-text-sm">Real-time workforce intelligence and attendance insights</p>
        </div>
      </div>

      {/* KPI STAT CARDS */}
      <div className="ui-grid ui-grid-cols-1 ui-sm-grid-cols-2 ui-lg-grid-cols-4 ui-gap-4">
        <KpiCard
          title="Total Headcount"
          value={kpis.headcount || 0}
          icon={Users}
          color="indigo"
          sub="Active workforce"
        />
        <KpiCard
          title="Attendance Rate"
          value={`${kpis.attendanceRate || 0}%`}
          icon={UserCheck}
          color="emerald"
          sub={`${kpis.presentToday || 0} Present Today`}
        />
        <KpiCard
          title="Late Comers Today"
          value={kpis.lateToday || 0}
          icon={Clock}
          color="amber"
          sub={`${kpis.latePercent || 0}% late rate`}
        />
        <KpiCard
          title="Pending Leave Approvals"
          value={kpis.pendingLeaves || 0}
          icon={Calendar}
          color="purple"
          sub="Requires HR review"
        />
      </div>

      {/* CHARTS & DEPT BREAKDOWN */}
      <div className="ui-grid ui-grid-cols-1 ui-lg-grid-cols-3 ui-gap-6">
        <div className="ui-lg-col-span-2 ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6">
          <h3 className="ui-text-lg ui-font-semibold ui-text-white ui-mb-4">Department Headcount Distribution</h3>
          <div className="ui-space-y-4">
            {(data?.headcountByDepartment || []).map((dept, idx) => (
              <div key={idx} className="ui-space-y-1">
                <div className="ui-flex ui-justify-between ui-text-sm">
                  <span className="ui-text-slate-300 ui-font-medium">{dept.department || 'Unassigned'}</span>
                  <span className="ui-text-slate-400">{dept.headcount} Employees</span>
                </div>
                <div className="ui-w-full ui-bg-slate-800 ui-rounded-full ui-h-3 ui-overflow-hidden">
                  <div
                    className="ui-bg-indigo-600 ui-h-3 ui-rounded-full ui-transition-all ui-duration-500"
                    style={{ width: `${Math.min(100, (dept.headcount / (kpis.headcount || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TOP LATE COMERS */}
        <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6">
          <h3 className="ui-text-lg ui-font-semibold ui-text-white ui-mb-4">Top Late Arrivals (This Month)</h3>
          <div className="ui-space-y-3">
            {(data?.topLateComers || []).length === 0 ? (
              <p className="ui-text-slate-500 ui-text-sm">No late arrivals recorded.</p>
            ) : (
              (data?.topLateComers || []).map((item, idx) => (
                <div key={idx} className="ui-flex ui-items-center ui-justify-between ui-p-3 ui-bg-slate-950-60 ui-rounded-xl ui-border ui-border-slate-800">
                  <div className="ui-flex ui-items-center ui-space-x-3">
                    <span className="ui-w-6 ui-h-6 ui-rounded-full ui-bg-amber-500-20 ui-text-amber-400 ui-flex ui-items-center ui-justify-center ui-text-xs ui-font-bold">
                      #{idx + 1}
                    </span>
                    <span className="ui-font-medium ui-text-slate-200 ui-text-sm">{item.name}</span>
                  </div>
                  <span className="ui-px-2 ui-py-1 ui-bg-amber-500-10 ui-text-amber-400 ui-text-xs ui-font-bold ui-rounded-lg ui-border ui-border-amber-500-20">
                    {item.count} Times
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color, sub }) {
  const colorClasses = {
    indigo: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30',
    emerald: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
    purple: 'bg-purple-600/20 text-purple-400 border-purple-500/30'
  };

  return (
    <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-5 ui-shadow-lg">
      <div className="ui-flex ui-items-center ui-justify-between ui-mb-3">
        <span className="ui-text-xs ui-font-medium ui-uppercase ui-tracking-wider ui-text-slate-400">{title}</span>
        <div className={`p-2.5 rounded-xl border ${colorClasses[color]}`}>
          <Icon className="ui-w-5 ui-h-5" />
        </div>
      </div>
      <div className="ui-text-2xl ui-font-bold ui-text-white">{value}</div>
      <div className="ui-text-xs ui-text-slate-400 ui-mt-1">{sub}</div>
    </div>
  );
}

// ==========================================
// 4. EMPLOYEE DIRECTORY MODULE
// ==========================================
function EmployeeDirectory({ role }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [search]);

  const loadEmployees = async () => {
    try {
      const res = await apiCall(`/employees?q=${encodeURIComponent(search)}`);
      setEmployees(res.items || []);
    } catch (err) {
      // Mock Fallback
      setEmployees([
        { _id: 'emp_001', code: 'EMP-001', name: 'Zohaib Hassan', email: 'zohaib@company.com', department: { name: 'Engineering' }, designation: { name: 'Senior Dev' }, joinDate: '2023-01-15', basic: 150000, status: 'active' },
        { _id: 'emp_002', code: 'EMP-002', name: 'Fatima Zahra', email: 'fatima@company.com', department: { name: 'Human Resources' }, designation: { name: 'HR Executive' }, joinDate: '2023-06-01', basic: 110000, status: 'active' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/employees/export`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees.csv';
      a.click();
    } catch (err) {
      alert('CSV Export initialized in browser preview mode.');
    }
  };

  return (
    <div className="ui-space-y-6">
      <div className="ui-flex ui-flex-col ui-sm-flex-row ui-items-start ui-sm-items-center ui-justify-between ui-gap-4">
        <div>
          <h1 className="ui-text-2xl ui-font-bold ui-text-white">Employee Directory</h1>
          <p className="ui-text-slate-400 ui-text-sm">Manage employee profiles and records</p>
        </div>

        {role === 'hr' && (
          <div className="ui-flex ui-items-center ui-space-x-2">
            <button
              onClick={exportCSV}
              className="ui-px-3 ui-py-2 ui-bg-slate-800 ui-hover-bg-slate-700 ui-text-slate-200 ui-text-xs ui-font-semibold ui-rounded-xl ui-border ui-border-slate-700 ui-flex ui-items-center ui-space-x-1.5"
            >
              <Download className="ui-w-4 ui-h-4" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="ui-px-3 ui-py-2 ui-bg-slate-800 ui-hover-bg-slate-700 ui-text-slate-200 ui-text-xs ui-font-semibold ui-rounded-xl ui-border ui-border-slate-700 ui-flex ui-items-center ui-space-x-1.5"
            >
              <Upload className="ui-w-4 ui-h-4" />
              <span>Import CSV</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-hover-bg-indigo-500 ui-text-white ui-text-xs ui-font-semibold ui-rounded-xl ui-flex ui-items-center ui-space-x-1.5 ui-shadow-lg ui-shadow-indigo-600-30"
            >
              <Plus className="ui-w-4 ui-h-4" />
              <span>Add Employee</span>
            </button>
          </div>
        )}
      </div>

      {/* SEARCH FILTER */}
      <div className="ui-relative">
        <Search className="ui-w-5 ui-h-5 ui-absolute ui-left-3 ui-top-3 ui-text-slate-500" />
        <input
          type="text"
          placeholder="Search by employee name, code, or email..."
          className="ui-w-full ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-xl ui-pl-10 ui-pr-4 ui-py-2.5 ui-text-slate-200 ui-focus-outline-none ui-focus-border-indigo-500 ui-text-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-overflow-hidden ui-shadow-xl">
        <div className="ui-overflow-x-auto">
          <table className="ui-w-full ui-text-left ui-text-sm ui-text-slate-300">
            <thead className="ui-bg-slate-950 ui-text-slate-400 ui-uppercase ui-text-xs ui-font-semibold">
              <tr>
                <th className="ui-px-6 ui-py-4">Code</th>
                <th className="ui-px-6 ui-py-4">Employee</th>
                <th className="ui-px-6 ui-py-4">Department</th>
                <th className="ui-px-6 ui-py-4">Designation</th>
                <th className="ui-px-6 ui-py-4">Join Date</th>
                <th className="ui-px-6 ui-py-4">Status</th>
              </tr>
            </thead>
            <tbody className="ui-divide-y ui-divide-slate-800">
              {employees.map(emp => (
                <tr key={emp._id} className="ui-hover-bg-slate-800-40 ui-transition">
                  <td className="ui-px-6 ui-py-4 ui-font-mono ui-text-xs ui-text-indigo-400 ui-font-bold">{emp.code}</td>
                  <td className="ui-px-6 ui-py-4 ui-font-medium ui-text-white">
                    <div>{emp.name}</div>
                    <div className="ui-text-xs ui-text-slate-500">{emp.email}</div>
                  </td>
                  <td className="ui-px-6 ui-py-4">{emp.department?.name || 'N/A'}</td>
                  <td className="ui-px-6 ui-py-4">{emp.designation?.name || 'N/A'}</td>
                  <td className="ui-px-6 ui-py-4 ui-text-xs">{emp.joinDate}</td>
                  <td className="ui-px-6 ui-py-4">
                    <span className="ui-px-2.5 ui-py-1 ui-bg-emerald-500-10 ui-text-emerald-400 ui-text-xs ui-font-semibold ui-rounded-full ui-border ui-border-emerald-500-20">
                      {emp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALS */}
      {showAddModal && <AddEmployeeModal onClose={() => setShowAddModal(false)} onRefresh={loadEmployees} />}
      {showImportModal && <ImportCsvModal onClose={() => setShowImportModal(false)} onRefresh={loadEmployees} />}
    </div>
  );
}

function AddEmployeeModal({ onClose, onRefresh }) {
  const [form, setForm] = useState({
    code: '', name: '', email: '', department: '650000000000000000000001', designation: '650000000000000000000002', joinDate: '2026-10-01', basic: 100000
  });
  const [tempPass, setTempPass] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiCall('/employees', 'POST', form);
      setTempPass(res.temporaryPassword || 'TempPass123!');
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="ui-fixed ui-inset-0 ui-bg-black-70 ui-backdrop-blur-sm ui-flex ui-items-center ui-justify-center ui-p-4 ui-z-50">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6 ui-max-w-lg ui-w-full ui-shadow-2xl">
        <h2 className="ui-text-xl ui-font-bold ui-text-white ui-mb-4">Register New Employee</h2>

        {tempPass ? (
          <div className="ui-p-4 ui-bg-emerald-500-10 ui-border ui-border-emerald-500-30 ui-rounded-xl ui-space-y-3">
            <p className="ui-text-emerald-400 ui-font-semibold">Employee Created Successfully!</p>
            <p className="ui-text-slate-300 ui-text-xs">Generated Temporary Password:</p>
            <div className="ui-p-2 ui-bg-slate-950 ui-font-mono ui-text-indigo-400 ui-text-sm ui-font-bold ui-rounded ui-border ui-border-slate-800">
              {tempPass}
            </div>
            <button onClick={onClose} className="ui-w-full ui-py-2 ui-bg-indigo-600 ui-text-white ui-font-medium ui-rounded-xl ui-text-sm">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="ui-space-y-4 ui-text-sm">
            <div className="ui-grid ui-grid-cols-2 ui-gap-3">
              <div>
                <label className="ui-text-slate-400 ui-text-xs">Employee Code</label>
                <input required className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" placeholder="EMP-005" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label className="ui-text-slate-400 ui-text-xs">Full Name</label>
                <input required className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" placeholder="John Doe" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="ui-text-slate-400 ui-text-xs">Work Email</label>
              <input required type="email" className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" placeholder="john@company.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="ui-grid ui-grid-cols-2 ui-gap-3">
              <div>
                <label className="ui-text-slate-400 ui-text-xs">Join Date</label>
                <input required type="date" className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} />
              </div>
              <div>
                <label className="ui-text-slate-400 ui-text-xs">Basic Monthly Salary</label>
                <input required type="number" className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={form.basic} onChange={e => setForm({ ...form, basic: Number(e.target.value) })} />
              </div>
            </div>

            <div className="ui-flex ui-justify-end ui-space-x-2 ui-pt-2">
              <button type="button" onClick={onClose} className="ui-px-4 ui-py-2 ui-bg-slate-800 ui-text-slate-300 ui-rounded-xl">Cancel</button>
              <button type="submit" className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-text-white ui-font-medium ui-rounded-xl">Save Employee</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ImportCsvModal({ onClose, onRefresh }) {
  const [csv, setCsv] = useState('');
  const [dryRunReport, setDryRunReport] = useState(null);

  const handleDryRun = async () => {
    try {
      const res = await apiCall('/employees/import', 'POST', { csv, dryRun: true });
      setDryRunReport(res);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFinalImport = async () => {
    try {
      await apiCall('/employees/import', 'POST', { csv, dryRun: false });
      alert('CSV Import Complete!');
      onRefresh();
      onClose();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="ui-fixed ui-inset-0 ui-bg-black-70 ui-backdrop-blur-sm ui-flex ui-items-center ui-justify-center ui-p-4 ui-z-50">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6 ui-max-w-lg ui-w-full ui-shadow-2xl">
        <h2 className="ui-text-xl ui-font-bold ui-text-white ui-mb-2">Import Employees via CSV</h2>
        <p className="ui-text-slate-400 ui-text-xs ui-mb-4">Paste CSV contents matching code, name, email, department, designation, joinDate, basic</p>

        <textarea
          rows={6}
          className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-xl ui-p-3 ui-text-xs ui-font-mono ui-text-slate-200 ui-focus-outline-none ui-mb-3"
          placeholder={`code,name,email,department,designation,joinDate,basic\nEMP-10,Ali,ali@company.com,Engineering,Developer,2026-01-01,100000`}
          value={csv}
          onChange={e => setCsv(e.target.value)}
        />

        {dryRunReport && (
          <div className="ui-p-3 ui-bg-slate-950 ui-rounded-xl ui-border ui-border-slate-800 ui-text-xs ui-mb-3">
            <p className="ui-font-semibold ui-text-indigo-400">Pre-flight Validation Report:</p>
            <p className="ui-text-slate-300">Total Rows Detected: {dryRunReport.count}</p>
            <p className="ui-text-emerald-400">Valid Records: {dryRunReport.valid ? 'All Clean' : 'Errors Found'}</p>
          </div>
        )}

        <div className="ui-flex ui-justify-end ui-space-x-2">
          <button onClick={onClose} className="ui-px-4 ui-py-2 ui-bg-slate-800 ui-text-slate-300 ui-rounded-xl ui-text-xs">Cancel</button>
          <button onClick={handleDryRun} className="ui-px-4 ui-py-2 ui-bg-purple-600 ui-text-white ui-font-medium ui-rounded-xl ui-text-xs">Validate CSV</button>
          <button onClick={handleFinalImport} className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-text-white ui-font-medium ui-rounded-xl ui-text-xs">Commit Import</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. ATTENDANCE BOARD MODULE
// ==========================================
function AttendanceBoard({ role }) {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [records, setRecords] = useState([]);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  useEffect(() => {
    loadAttendance();
  }, []);

  const loadAttendance = async () => {
    try {
      const res = await apiCall('/attendance');
      setRecords(res || []);
    } catch (err) {
      // Mock Fallback
      setRecords([
        { employee: 'emp_001', name: 'Zohaib Hassan', department: 'Engineering', date: '2026-10-25', status: 'present', hours: 8.5, late: false },
        { employee: 'emp_002', name: 'Fatima Zahra', department: 'HR', date: '2026-10-25', status: 'late', hours: 7.2, late: true }
      ]);
    }
  };

  const handleCheckIn = async () => {
    try {
      await apiCall('/attendance/check-in', 'POST');
      setIsCheckedIn(true);
      loadAttendance();
    } catch (err) {
      alert(err.message || 'Check in processed in preview mode.');
      setIsCheckedIn(true);
    }
  };

  const handleCheckOut = async () => {
    try {
      await apiCall('/attendance/check-out', 'POST');
      setIsCheckedIn(false);
      loadAttendance();
    } catch (err) {
      alert(err.message || 'Check out processed in preview mode.');
      setIsCheckedIn(false);
    }
  };

  return (
    <div className="ui-space-y-6">
      <div className="ui-flex ui-flex-col ui-sm-flex-row ui-items-start ui-sm-items-center ui-justify-between ui-gap-4">
        <div>
          <h1 className="ui-text-2xl ui-font-bold ui-text-white">Attendance Board</h1>
          <p className="ui-text-slate-400 ui-text-sm">Real-time attendance logs and web clocking</p>
        </div>

        <div className="ui-flex ui-items-center ui-space-x-3">
          <button
            onClick={() => setShowCorrectionModal(true)}
            className="ui-px-3 ui-py-2 ui-bg-slate-800 ui-hover-bg-slate-700 ui-text-slate-200 ui-text-xs ui-font-semibold ui-rounded-xl ui-border ui-border-slate-700"
          >
            Request Time Correction
          </button>

          {!isCheckedIn ? (
            <button
              onClick={handleCheckIn}
              className="ui-px-5 ui-py-2.5 ui-bg-emerald-600 ui-hover-bg-emerald-500 ui-text-white ui-font-bold ui-rounded-xl ui-text-xs ui-flex ui-items-center ui-space-x-2 ui-shadow-lg ui-shadow-emerald-600-30"
            >
              <Clock className="ui-w-4 ui-h-4" />
              <span>Web Check-In</span>
            </button>
          ) : (
            <button
              onClick={handleCheckOut}
              className="ui-px-5 ui-py-2.5 ui-bg-amber-600 ui-hover-bg-amber-500 ui-text-white ui-font-bold ui-rounded-xl ui-text-xs ui-flex ui-items-center ui-space-x-2 ui-shadow-lg ui-shadow-amber-600-30"
            >
              <LogOut className="ui-w-4 ui-h-4" />
              <span>Web Check-Out</span>
            </button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-overflow-hidden ui-shadow-xl">
        <div className="ui-overflow-x-auto">
          <table className="ui-w-full ui-text-left ui-text-sm ui-text-slate-300">
            <thead className="ui-bg-slate-950 ui-text-slate-400 ui-uppercase ui-text-xs ui-font-semibold">
              <tr>
                <th className="ui-px-6 ui-py-4">Employee</th>
                <th className="ui-px-6 ui-py-4">Department</th>
                <th className="ui-px-6 ui-py-4">Date</th>
                <th className="ui-px-6 ui-py-4">Status</th>
                <th className="ui-px-6 ui-py-4">Hours Logged</th>
              </tr>
            </thead>
            <tbody className="ui-divide-y ui-divide-slate-800">
              {records.map((r, idx) => (
                <tr key={idx} className="ui-hover-bg-slate-800-40 ui-transition">
                  <td className="ui-px-6 ui-py-4 ui-font-medium ui-text-white">{r.name}</td>
                  <td className="ui-px-6 ui-py-4">{r.department}</td>
                  <td className="ui-px-6 ui-py-4 ui-text-xs ui-font-mono">{r.date}</td>
                  <td className="ui-px-6 ui-py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                      r.status === 'ui-present' ? 'ui-bg-emerald-500-10 ui-text-emerald-400 ui-border-emerald-500-20' :
                      r.status === 'ui-late' ? 'ui-bg-amber-500-10 ui-text-amber-400 ui-border-amber-500-20' :
                      'ui-bg-slate-800 ui-text-slate-400 ui-border-slate-700'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="ui-px-6 ui-py-4 ui-text-xs ui-font-bold ui-text-indigo-400">{r.hours} hrs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCorrectionModal && (
        <CorrectionModal onClose={() => setShowCorrectionModal(false)} />
      )}
    </div>
  );
}

function CorrectionModal({ onClose }) {
  const [form, setForm] = useState({
    date: '2026-10-24', checkIn: '2026-10-24T09:00:00.000Z', checkOut: '2026-10-24T17:00:00.000Z', reason: 'Forgot to clock out'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/corrections', 'POST', form);
      alert('Correction requested successfully.');
      onClose();
    } catch (err) {
      alert(err.message || 'Correction requested in preview mode.');
      onClose();
    }
  };

  return (
    <div className="ui-fixed ui-inset-0 ui-bg-black-70 ui-backdrop-blur-sm ui-flex ui-items-center ui-justify-center ui-p-4 ui-z-50">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6 ui-max-w-md ui-w-full ui-shadow-2xl">
        <h2 className="ui-text-xl ui-font-bold ui-text-white ui-mb-4">Request Attendance Correction</h2>
        <form onSubmit={handleSubmit} className="ui-space-y-4 ui-text-sm">
          <div>
            <label className="ui-text-slate-400 ui-text-xs">Target Date</label>
            <input type="date" required className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="ui-text-slate-400 ui-text-xs">Correction Reason</label>
            <textarea required rows={3} className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="ui-flex ui-justify-end ui-space-x-2">
            <button type="button" onClick={onClose} className="ui-px-4 ui-py-2 ui-bg-slate-800 ui-text-slate-300 ui-rounded-xl">Cancel</button>
            <button type="submit" className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-text-white ui-font-medium ui-rounded-xl">Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 6. LEAVE MANAGEMENT MODULE
// ==========================================
function LeaveManagement({ role }) {
  const [balances, setBalances] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [showApplyModal, setShowApplyModal] = useState(false);

  useEffect(() => {
    loadLeaveData();
  }, []);

  const loadLeaveData = async () => {
    try {
      const [balRes, leaveRes] = await Promise.all([
        apiCall('/leave/balance'),
        apiCall('/leave')
      ]);
      setBalances(balRes || []);
      setLeaves(leaveRes || []);
    } catch (err) {
      // Mock Fallback
      setBalances([
        { name: 'Annual', quota: 14, used: 2, remaining: 12 },
        { name: 'Sick', quota: 8, used: 1, remaining: 7 },
        { name: 'Casual', quota: 10, used: 3, remaining: 7 }
      ]);
      setLeaves([
        { _id: 'l1', employee: { name: 'Zohaib Hassan' }, typeName: 'Annual', start: '2026-11-10', end: '2026-11-12', days: ['2026-11-10', '2026-11-11', '2026-11-12'], status: 'pending', reason: 'Family event' }
      ]);
    }
  };

  const reviewLeave = async (id, status) => {
    try {
      await apiCall(`/leave/${id}/review`, 'PATCH', { status, comment: 'Reviewed by HR' });
      loadLeaveData();
    } catch (err) {
      alert(`Leave ${status} in mock preview mode.`);
      setLeaves(leaves.map(l => l._id === id ? { ...l, status } : l));
    }
  };

  return (
    <div className="ui-space-y-6">
      <div className="ui-flex ui-flex-col ui-sm-flex-row ui-items-start ui-sm-items-center ui-justify-between ui-gap-4">
        <div>
          <h1 className="ui-text-2xl ui-font-bold ui-text-white">Leave & Quota Balances</h1>
          <p className="ui-text-slate-400 ui-text-sm">Track paid leave quotas, apply for leave, and review requests</p>
        </div>

        <button
          onClick={() => setShowApplyModal(true)}
          className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-hover-bg-indigo-500 ui-text-white ui-font-semibold ui-rounded-xl ui-text-xs ui-flex ui-items-center ui-space-x-1.5 ui-shadow-lg ui-shadow-indigo-600-30"
        >
          <Plus className="ui-w-4 ui-h-4" />
          <span>Apply for Leave</span>
        </button>
      </div>

      {/* BALANCE CARDS */}
      <div className="ui-grid ui-grid-cols-1 ui-sm-grid-cols-3 ui-gap-4">
        {balances.map((b, idx) => (
          <div key={idx} className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-5 ui-shadow-lg">
            <span className="ui-text-xs ui-uppercase ui-font-semibold ui-text-slate-400 ui-tracking-wider">{b.name} Leave</span>
            <div className="ui-text-2xl ui-font-bold ui-text-white ui-mt-2">{b.remaining} <span className="ui-text-xs ui-text-slate-500 ui-font-normal">/ {b.quota} Days Left</span></div>
            <div className="ui-w-full ui-bg-slate-800 ui-rounded-full ui-h-2 ui-mt-3 ui-overflow-hidden">
              <div className="ui-bg-indigo-500 ui-h-2 ui-rounded-full" style={{ width: `${(b.remaining / (b.quota || 1)) * 100}%` }}></div>
            </div>
          </div>
        ))}
      </div>

      {/* LEAVE REQUESTS TABLE */}
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-overflow-hidden ui-shadow-xl">
        <div className="ui-p-4 ui-border-b ui-border-slate-800 ui-font-semibold ui-text-white">Leave Requests Inbox</div>
        <div className="ui-overflow-x-auto">
          <table className="ui-w-full ui-text-left ui-text-sm ui-text-slate-300">
            <thead className="ui-bg-slate-950 ui-text-slate-400 ui-uppercase ui-text-xs ui-font-semibold">
              <tr>
                <th className="ui-px-6 ui-py-4">Employee</th>
                <th className="ui-px-6 ui-py-4">Type</th>
                <th className="ui-px-6 ui-py-4">Dates</th>
                <th className="ui-px-6 ui-py-4">Reason</th>
                <th className="ui-px-6 ui-py-4">Status</th>
                {role === 'hr' && <th className="ui-px-6 ui-py-4">Action</th>}
              </tr>
            </thead>
            <tbody className="ui-divide-y ui-divide-slate-800">
              {leaves.map(l => (
                <tr key={l._id} className="ui-hover-bg-slate-800-40 ui-transition">
                  <td className="ui-px-6 ui-py-4 ui-font-medium ui-text-white">{l.employee?.name || 'Self'}</td>
                  <td className="ui-px-6 ui-py-4 ui-font-semibold ui-text-indigo-400">{l.typeName}</td>
                  <td className="ui-px-6 ui-py-4 ui-text-xs ui-font-mono">{l.start} to {l.end}</td>
                  <td className="ui-px-6 ui-py-4 ui-text-slate-400 ui-text-xs">{l.reason}</td>
                  <td className="ui-px-6 ui-py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                      l.status === 'ui-approved' ? 'ui-bg-emerald-500-10 ui-text-emerald-400 ui-border-emerald-500-20' :
                      l.status === 'ui-rejected' ? 'ui-bg-red-500-10 ui-text-red-400 ui-border-red-500-20' :
                      'ui-bg-amber-500-10 ui-text-amber-400 ui-border-amber-500-20'
                    }`}>
                      {l.status}
                    </span>
                  </td>
                  {role === 'hr' && (
                    <td className="ui-px-6 ui-py-4 ui-space-x-2">
                      {l.status === 'pending' && (
                        <>
                          <button onClick={() => reviewLeave(l._id, 'approved')} className="ui-px-2 ui-py-1 ui-bg-emerald-600 ui-text-white ui-text-xs ui-rounded-lg">Approve</button>
                          <button onClick={() => reviewLeave(l._id, 'rejected')} className="ui-px-2 ui-py-1 ui-bg-red-600 ui-text-white ui-text-xs ui-rounded-lg">Reject</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showApplyModal && <ApplyLeaveModal onClose={() => setShowApplyModal(false)} onRefresh={loadLeaveData} />}
    </div>
  );
}

function ApplyLeaveModal({ onClose, onRefresh }) {
  const [form, setForm] = useState({
    type: '650000000000000000000010', start: '2026-11-10', end: '2026-11-12', reason: 'Personal family trip'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/leave', 'POST', form);
      alert('Leave applied successfully.');
      onRefresh();
      onClose();
    } catch (err) {
      alert(err.message || 'Applied in preview mode.');
      onClose();
    }
  };

  return (
    <div className="ui-fixed ui-inset-0 ui-bg-black-70 ui-backdrop-blur-sm ui-flex ui-items-center ui-justify-center ui-p-4 ui-z-50">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6 ui-max-w-md ui-w-full ui-shadow-2xl">
        <h2 className="ui-text-xl ui-font-bold ui-text-white ui-mb-4">Apply for Leave</h2>
        <form onSubmit={handleSubmit} className="ui-space-y-4 ui-text-sm">
          <div className="ui-grid ui-grid-cols-2 ui-gap-3">
            <div>
              <label className="ui-text-slate-400 ui-text-xs">Start Date</label>
              <input type="date" required className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
            </div>
            <div>
              <label className="ui-text-slate-400 ui-text-xs">End Date</label>
              <input type="date" required className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="ui-text-slate-400 ui-text-xs">Reason</label>
            <textarea required rows={3} className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="ui-flex ui-justify-end ui-space-x-2">
            <button type="button" onClick={onClose} className="ui-px-4 ui-py-2 ui-bg-slate-800 ui-text-slate-300 ui-rounded-xl">Cancel</button>
            <button type="submit" className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-text-white ui-font-medium ui-rounded-xl">Submit Leave</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 7. PAYROLL & PAYSLIPS MODULE
// ==========================================
function PayrollModule({ role }) {
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('2026-10');

  useEffect(() => {
    loadPayroll();
  }, []);

  const loadPayroll = async () => {
    try {
      const res = await apiCall('/payroll');
      setPayrollRuns(res || []);
    } catch (err) {
      // Mock Fallback
      setPayrollRuns([
        {
          _id: 'pay_001', month: '2026-10', status: 'finalized',
          slips: [
            { employee: 'emp_001', code: 'EMP-001', name: 'Zohaib Hassan', departmentName: 'Engineering', basic: 150000, gross: 225000, payableGross: 225000, net: 198500 }
          ]
        }
      ]);
    }
  };

  const createDraft = async () => {
    try {
      await apiCall('/payroll', 'POST', { month: selectedMonth });
      alert('Payroll Draft Generated successfully.');
      loadPayroll();
    } catch (err) {
      alert(err.message || 'Draft created in mock preview mode.');
    }
  };

  const finalizeRun = async (id) => {
    try {
      await apiCall(`/payroll/${id}/finalize`, 'PATCH');
      alert('Payroll finalized and locked!');
      loadPayroll();
    } catch (err) {
      alert(err.message || 'Finalized in mock mode.');
      setPayrollRuns(payrollRuns.map(p => p._id === id ? { ...p, status: 'finalized' } : p));
    }
  };

  return (
    <div className="ui-space-y-6">
      <div className="ui-flex ui-flex-col ui-sm-flex-row ui-items-start ui-sm-items-center ui-justify-between ui-gap-4">
        <div>
          <h1 className="ui-text-2xl ui-font-bold ui-text-white">Payroll & Payslips</h1>
          <p className="ui-text-slate-400 ui-text-sm">Generate monthly payroll, calculate deductions, and view payslips</p>
        </div>

        {role === 'hr' && (
          <div className="ui-flex ui-items-center ui-space-x-2">
            <input
              type="month"
              className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-text-white ui-px-3 ui-py-1.5 ui-rounded-xl ui-text-xs"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
            <button
              onClick={createDraft}
              className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-hover-bg-indigo-500 ui-text-white ui-font-semibold ui-rounded-xl ui-text-xs ui-flex ui-items-center ui-space-x-1 ui-shadow-lg ui-shadow-indigo-600-30"
            >
              <Plus className="ui-w-4 ui-h-4" />
              <span>Generate Draft</span>
            </button>
          </div>
        )}
      </div>

      {/* PAYROLL RUNS */}
      <div className="ui-space-y-4">
        {payrollRuns.map(run => (
          <div key={run._id} className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-5 ui-shadow-xl ui-space-y-4">
            <div className="ui-flex ui-items-center ui-justify-between ui-border-b ui-border-slate-800 ui-pb-3">
              <div>
                <h3 className="ui-text-lg ui-font-bold ui-text-white">Payroll Period: {run.month}</h3>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                  run.status === 'ui-finalized' ? 'ui-bg-emerald-500-10 ui-text-emerald-400 ui-border-emerald-500-20' : 'ui-bg-amber-500-10 ui-text-amber-400 ui-border-amber-500-20'
                }`}>
                  {run.status.toUpperCase()}
                </span>
              </div>

              {role === 'admin' && run.status === 'draft' && (
                <button
                  onClick={() => finalizeRun(run._id)}
                  className="ui-px-4 ui-py-2 ui-bg-emerald-600 ui-hover-bg-emerald-500 ui-text-white ui-font-semibold ui-rounded-xl ui-text-xs ui-shadow-lg ui-shadow-emerald-600-30"
                >
                  Finalize & Lock Payroll
                </button>
              )}
            </div>

            {/* SLIPS TABLE */}
            <div className="ui-overflow-x-auto">
              <table className="ui-w-full ui-text-left ui-text-xs ui-text-slate-300">
                <thead className="ui-bg-slate-950 ui-text-slate-400 ui-uppercase ui-font-semibold">
                  <tr>
                    <th className="ui-px-4 ui-py-3">Code</th>
                    <th className="ui-px-4 ui-py-3">Employee</th>
                    <th className="ui-px-4 ui-py-3">Basic Pay</th>
                    <th className="ui-px-4 ui-py-3">Gross Pay</th>
                    <th className="ui-px-4 ui-py-3">Net Pay</th>
                    <th className="ui-px-4 ui-py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="ui-divide-y ui-divide-slate-800">
                  {(run.slips || []).map((slip, idx) => (
                    <tr key={idx}>
                      <td className="ui-px-4 ui-py-3 ui-font-mono ui-text-indigo-400">{slip.code}</td>
                      <td className="ui-px-4 ui-py-3 ui-font-medium ui-text-white">{slip.name}</td>
                      <td className="ui-px-4 ui-py-3">Rs. {slip.basic?.toLocaleString()}</td>
                      <td className="ui-px-4 ui-py-3">Rs. {slip.gross?.toLocaleString()}</td>
                      <td className="ui-px-4 ui-py-3 ui-font-bold ui-text-emerald-400">Rs. {slip.net?.toLocaleString()}</td>
                      <td className="ui-px-4 ui-py-3">
                        {run.status === 'finalized' && (
                          <a
                            href={`${API_BASE_URL}/payroll/${run._id}/payslip/${slip.employee}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ui-text-indigo-400 ui-hover-underline ui-flex ui-items-center ui-space-x-1"
                          >
                            <Download className="ui-w-3.5 ui-h-3.5" />
                            <span>PDF Payslip</span>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 8. ORGANIZATION SETUP & USER MANAGEMENT
// ==========================================
function OrganizationSetup() {
  const [settings, setSettings] = useState(MOCK_COMPANY);

  const handleSave = async () => {
    try {
      await apiCall('/settings', 'PUT', settings);
      alert('Company settings updated!');
    } catch (err) {
      alert('Settings updated in preview mode.');
    }
  };

  return (
    <div className="ui-space-y-6 ui-max-w-3xl">
      <div>
        <h1 className="ui-text-2xl ui-font-bold ui-text-white">Organization & Shift Rules</h1>
        <p className="ui-text-slate-400 ui-text-sm">Configure office hours, grace periods, and company rules</p>
      </div>

      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6 ui-space-y-4 ui-text-sm">
        <div>
          <label className="ui-text-slate-400 ui-text-xs">Company Name</label>
          <input className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2.5 ui-text-white" value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} />
        </div>
        <div className="ui-grid ui-grid-cols-2 ui-gap-4">
          <div>
            <label className="ui-text-slate-400 ui-text-xs">Office Start Time</label>
            <input type="time" className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2.5 ui-text-white" value={settings.officeStart} onChange={e => setSettings({ ...settings, officeStart: e.target.value })} />
          </div>
          <div>
            <label className="ui-text-slate-400 ui-text-xs">Grace Period (Minutes)</label>
            <input type="number" className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2.5 ui-text-white" value={settings.graceMinutes} onChange={e => setSettings({ ...settings, graceMinutes: Number(e.target.value) })} />
          </div>
        </div>

        <button onClick={handleSave} className="ui-px-5 ui-py-2.5 ui-bg-indigo-600 ui-text-white ui-font-semibold ui-rounded-xl ui-text-xs ui-shadow-lg ui-shadow-indigo-600-30">
          Save Settings
        </button>
      </div>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [hrEmail, setHrEmail] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await apiCall('/users');
      setUsers(res || []);
    } catch (err) {
      setUsers([
        { _id: 'u1', email: 'admin@hcmlite.com', role: 'admin', active: true },
        { _id: 'u2', email: 'hr@hcmlite.com', role: 'hr', active: true }
      ]);
    }
  };

  const createHR = async (e) => {
    e.preventDefault();
    try {
      const res = await apiCall('/users/hr', 'POST', { email: hrEmail });
      alert(`HR Account Created! Temp Password: ${res.temporaryPassword}`);
      setHrEmail('');
      loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="ui-space-y-6">
      <div>
        <h1 className="ui-text-2xl ui-font-bold ui-text-white">User Accounts & Access Control</h1>
        <p className="ui-text-slate-400 ui-text-sm">Provision HR Managers and manage platform credentials</p>
      </div>

      {/* CREATE HR FORM */}
      <form onSubmit={createHR} className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-4 ui-flex ui-gap-3 ui-max-w-lg">
        <input
          type="email"
          required
          placeholder="New HR Manager Email"
          className="ui-flex-1 ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-xl ui-px-3 ui-py-2 ui-text-xs ui-text-white"
          value={hrEmail}
          onChange={e => setHrEmail(e.target.value)}
        />
        <button type="submit" className="ui-px-4 ui-py-2 ui-bg-purple-600 ui-text-white ui-text-xs ui-font-semibold ui-rounded-xl ui-shadow-lg ui-shadow-purple-600-30">
          Provision HR
        </button>
      </form>

      {/* USERS TABLE */}
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-overflow-hidden ui-shadow-xl">
        <table className="ui-w-full ui-text-left ui-text-sm ui-text-slate-300">
          <thead className="ui-bg-slate-950 ui-text-slate-400 ui-uppercase ui-text-xs ui-font-semibold">
            <tr>
              <th className="ui-px-6 ui-py-4">Email</th>
              <th className="ui-px-6 ui-py-4">Role</th>
              <th className="ui-px-6 ui-py-4">Active</th>
            </tr>
          </thead>
          <tbody className="ui-divide-y ui-divide-slate-800">
            {users.map(u => (
              <tr key={u._id}>
                <td className="ui-px-6 ui-py-4 ui-text-white ui-font-medium">{u.email}</td>
                <td className="ui-px-6 ui-py-4 ui-uppercase ui-font-bold ui-text-xs ui-text-indigo-400">{u.role}</td>
                <td className="ui-px-6 ui-py-4">{u.active ? 'Active' : 'Disabled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 9. ANNOUNCEMENTS & AUDIT LOGS MODULES
// ==========================================
function AnnouncementsFeed({ role }) {
  const [items, setItems] = useState([
    { _id: 'a1', title: 'Office Holiday Announcement', body: 'The office will remain closed on Friday for public maintenance.', createdAt: '2026-10-20' }
  ]);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="ui-space-y-6">
      <div className="ui-flex ui-justify-between ui-items-center">
        <div>
          <h1 className="ui-text-2xl ui-font-bold ui-text-white">Company Announcements</h1>
          <p className="ui-text-slate-400 ui-text-sm">Broadcasting updates across all departments</p>
        </div>
        {['admin', 'hr'].includes(role) && (
          <button onClick={() => setShowModal(true)} className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-text-white ui-text-xs ui-font-semibold ui-rounded-xl ui-flex ui-items-center ui-space-x-1.5">
            <Plus className="ui-w-4 ui-h-4" />
            <span>Post Announcement</span>
          </button>
        )}
      </div>

      <div className="ui-space-y-4">
        {items.map(item => (
          <div key={item._id} className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-5 ui-shadow-lg">
            <h3 className="ui-text-lg ui-font-bold ui-text-white ui-mb-1">{item.title}</h3>
            <p className="ui-text-slate-300 ui-text-sm ui-leading-relaxed">{item.body}</p>
            <div className="ui-text-xs ui-text-slate-500 ui-mt-3">{item.createdAt}</div>
          </div>
        ))}
      </div>

      {showModal && <PostAnnouncementModal onClose={() => setShowModal(false)} onAdd={(a) => setItems([a, ...items])} />}
    </div>
  );
}

function PostAnnouncementModal({ onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiCall('/announcements', 'POST', { title, body });
      onAdd(res);
      onClose();
    } catch (err) {
      onAdd({ _id: Date.now(), title, body, createdAt: 'Just now' });
      onClose();
    }
  };

  return (
    <div className="ui-fixed ui-inset-0 ui-bg-black-70 ui-backdrop-blur-sm ui-flex ui-items-center ui-justify-center ui-p-4 ui-z-50">
      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-p-6 ui-max-w-md ui-w-full ui-shadow-2xl">
        <h2 className="ui-text-xl ui-font-bold ui-text-white ui-mb-4">New Announcement</h2>
        <form onSubmit={handleSubmit} className="ui-space-y-4 ui-text-sm">
          <div>
            <label className="ui-text-slate-400 ui-text-xs">Title</label>
            <input required className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="ui-text-slate-400 ui-text-xs">Body Message</label>
            <textarea required rows={4} className="ui-w-full ui-bg-slate-800 ui-border ui-border-slate-700 ui-rounded-lg ui-p-2 ui-text-white" value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <div className="ui-flex ui-justify-end ui-space-x-2">
            <button type="button" onClick={onClose} className="ui-px-4 ui-py-2 ui-bg-slate-800 ui-text-slate-300 ui-rounded-xl">Cancel</button>
            <button type="submit" className="ui-px-4 ui-py-2 ui-bg-indigo-600 ui-text-white ui-font-medium ui-rounded-xl">Publish</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AuditLogViewer() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await apiCall('/audit');
        setLogs(res.items || []);
      } catch (err) {
        setLogs([
          { _id: 'aud_1', action: 'employee.create', entity: 'Employee', createdAt: '2026-10-25 10:30' },
          { _id: 'aud_2', action: 'payroll.finalize', entity: 'Payroll', createdAt: '2026-10-24 16:00' }
        ]);
      }
    }
    loadLogs();
  }, []);

  return (
    <div className="ui-space-y-6">
      <div>
        <h1 className="ui-text-2xl ui-font-bold ui-text-white">System Audit Logs</h1>
        <p className="ui-text-slate-400 ui-text-sm">Immutable history of system events and entity state modifications</p>
      </div>

      <div className="ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-2xl ui-overflow-hidden ui-shadow-xl">
        <table className="ui-w-full ui-text-left ui-text-xs ui-text-slate-300">
          <thead className="ui-bg-slate-950 ui-text-slate-400 ui-uppercase ui-font-semibold">
            <tr>
              <th className="ui-px-6 ui-py-4">Timestamp</th>
              <th className="ui-px-6 ui-py-4">Action</th>
              <th className="ui-px-6 ui-py-4">Entity</th>
            </tr>
          </thead>
          <tbody className="ui-divide-y ui-divide-slate-800">
            {logs.map(log => (
              <tr key={log._id}>
                <td className="ui-px-6 ui-py-4 ui-font-mono ui-text-slate-400">{log.createdAt}</td>
                <td className="ui-px-6 ui-py-4 ui-font-semibold ui-text-indigo-400">{log.action}</td>
                <td className="ui-px-6 ui-py-4">{log.entity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 10. FLOATING AI HR ASSISTANT DRAWER
// ==========================================
function AiAssistantDrawer({ isOpen, onClose, user }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Salam! Main HCM Lite AI Assistant hoon. Main aapki leave balance, attendance report, policy, ya late coming query me help kar sakta hoon. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await apiCall('/ai/chat', 'POST', { message: userMsg });
      setMessages(prev => [...prev, { role: 'assistant', text: res.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'AI filhal live API Mode me available nahi hai, lakin aap direct Forms or Dashboards se saari working seamlessly kar saktay hain.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ui-fixed ui-inset-y-0 ui-right-0 ui-w-full ui-sm-w-96 ui-bg-slate-900 ui-border-l ui-border-slate-800 ui-shadow-2xl ui-z-50 ui-flex ui-flex-col">
      <div className="ui-p-4 ui-border-b ui-border-slate-800 ui-flex ui-items-center ui-justify-between ui-bg-slate-950">
        <div className="ui-flex ui-items-center ui-space-x-2">
          <Sparkles className="ui-w-5 ui-h-5 ui-text-indigo-400" />
          <span className="ui-font-bold ui-text-white ui-text-sm">HCM Lite AI Assistant</span>
        </div>
        <button onClick={onClose} className="ui-p-1 ui-text-slate-400 ui-hover-text-white ui-rounded-lg">
          <X className="ui-w-5 ui-h-5" />
        </button>
      </div>

      {/* CHAT MESSAGES */}
      <div className="ui-flex-1 ui-p-4 ui-overflow-y-auto ui-space-y-3 ui-text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-2xl max-w-[85%] ${
              m.role === 'ui-user'
                ? 'ui-ml-auto ui-bg-indigo-600 ui-text-white ui-rounded-br-none'
                : 'ui-mr-auto ui-bg-slate-800 ui-text-slate-200 ui-border ui-border-slate-700 ui-rounded-bl-none'
            }`}
          >
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="ui-p-3 ui-bg-slate-800 ui-text-slate-400 ui-rounded-2xl ui-rounded-bl-none ui-w-24 ui-flex ui-items-center ui-justify-center">
            <RefreshCw className="ui-w-4 ui-h-4 ui-animate-spin" />
          </div>
        )}
      </div>

      {/* INPUT FORM */}
      <form onSubmit={handleSend} className="ui-p-3 ui-border-t ui-border-slate-800 ui-bg-slate-950 ui-flex ui-gap-2">
        <input
          type="text"
          placeholder="Ask in English or Roman Urdu..."
          className="ui-flex-1 ui-bg-slate-900 ui-border ui-border-slate-800 ui-rounded-xl ui-px-3 ui-py-2 ui-text-xs ui-text-white ui-focus-outline-none ui-focus-border-indigo-500"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit" className="ui-p-2 ui-bg-indigo-600 ui-text-white ui-rounded-xl ui-hover-bg-indigo-500">
          <Send className="ui-w-4 ui-h-4" />
        </button>
      </form>
    </div>
  );
}