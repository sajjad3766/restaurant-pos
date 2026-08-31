import React, { useState, useEffect } from 'react';
import { ShoppingCart, BarChart3, Cloud, CloudOff, HardDrive, Clock, ShieldCheck, UserCheck, LogOut } from 'lucide-react';
import PosTerminal from './components/POS/PosTerminal';
import AdminDashboard from './components/Admin/AdminDashboard';
import LoginModal from './components/Auth/LoginModal';

export default function App() {
  const [activeView, setActiveView] = useState('pos'); // pos, admin
  const [settings, setSettings] = useState({});
  const [syncStatus, setSyncStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Authentication State
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Load Settings and Sync status
  const fetchAppConfig = async () => {
    try {
      const [settRes, syncRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/sync/status')
      ]);

      if (settRes.ok) setSettings(await settRes.json());
      if (syncRes.ok) setSyncStatus(await syncRes.json());
    } catch (err) {
      console.error('Error loading initial app config:', err);
    }
  };

  useEffect(() => {
    fetchAppConfig();
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);

    // Refresh sync status every 15 seconds
    const syncInterval = setInterval(fetchAppConfig, 15000);

    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  }, []);

  // Ensure operator cannot view admin dashboard
  useEffect(() => {
    if (currentUser && currentUser.role === 'operator' && activeView === 'admin') {
      setActiveView('pos');
    }
  }, [currentUser, activeView]);

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      localStorage.removeItem('pos_auth_user');
      setCurrentUser(null);
      setActiveView('pos');
    }
  };

  // If user is not logged in, render the Login Screen
  if (!currentUser) {
    return (
      <LoginModal
        restaurantName={settings.restaurant_name}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setActiveView(user.role === 'admin' ? 'admin' : 'pos');
        }}
      />
    );
  }

  const isAdmin = currentUser.role === 'admin';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      
      {/* TOP HEADER NAVIGATION BAR */}
      <header className="no-print" style={{
        height: '60px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 100
      }}>

        {/* Brand & View Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#2563eb', padding: '8px', borderRadius: '8px', color: '#fff', display: 'flex' }}>
              <ShoppingCart size={20} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#f8fafc' }}>
                {settings.restaurant_name || 'Restaurant POS'}
              </div>
              <div style={{ fontSize: '10px', color: '#10b981', fontWeight: '600' }}>
                LOCAL OFFLINE ENGINE READY
              </div>
            </div>
          </div>

          {/* Role-Based View Switcher */}
          <div style={{ display: 'flex', gap: '6px', background: '#0f172a', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setActiveView('pos')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: activeView === 'pos' ? '#2563eb' : 'transparent',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <ShoppingCart size={15} /> POS Terminal
            </button>

            {/* Admin Dashboard is ONLY shown for Admin role */}
            {isAdmin && (
              <button
                onClick={() => setActiveView('admin')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: activeView === 'admin' ? '#2563eb' : 'transparent',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <BarChart3 size={15} /> Admin Dashboard
              </button>
            )}
          </div>
        </div>

        {/* Right System & User Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

          {/* Logged in User Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isAdmin ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            border: '1px solid ' + (isAdmin ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'),
            padding: '5px 12px',
            borderRadius: '20px'
          }}>
            {isAdmin ? <ShieldCheck size={15} color="#3b82f6" /> : <UserCheck size={15} color="#10b981" />}
            <span style={{ fontSize: '12px', color: isAdmin ? '#93c5fd' : '#6ee7b7', fontWeight: '700' }}>
              {currentUser.name} ({isAdmin ? 'Admin' : 'Operator'})
            </span>
          </div>

          {/* Cloud Connection Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: syncStatus?.isOnline ? 'rgba(37, 99, 235, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            padding: '5px 10px',
            borderRadius: '20px',
            border: '1px solid ' + (syncStatus?.isOnline ? 'rgba(37, 99, 235, 0.3)' : 'rgba(245, 158, 11, 0.3)')
          }}>
            {syncStatus?.isOnline ? <Cloud size={14} color="#2563eb" /> : <CloudOff size={14} color="#f59e0b" />}
            <span style={{ fontSize: '11px', color: syncStatus?.isOnline ? '#2563eb' : '#f59e0b', fontWeight: '600' }}>
              {syncStatus?.isOnline ? 'Cloud Online' : 'Cloud Offline'}
            </span>
          </div>

          {/* Clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '12px', fontWeight: '600' }}>
            <Clock size={14} /> {currentTime}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Log Out"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <LogOut size={14} /> Logout
          </button>

        </div>

      </header>

      {/* BODY VIEW MOUNT */}
      <main style={{ flex: 1, overflowY: activeView === 'admin' ? 'auto' : 'hidden', overflowX: 'hidden', height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
        {activeView === 'pos' ? (
          <PosTerminal settings={settings} currentUser={currentUser} onOrderSuccess={fetchAppConfig} />
        ) : (
          <AdminDashboard settings={settings} currentUser={currentUser} onSettingsUpdated={fetchAppConfig} />
        )}
      </main>

    </div>
  );
}
