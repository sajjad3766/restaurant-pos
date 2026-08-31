import React, { useState, useEffect } from 'react';
import { ShoppingCart, BarChart3, Cloud, CloudOff, HardDrive, Clock, CheckCircle } from 'lucide-react';
import PosTerminal from './components/POS/PosTerminal';
import AdminDashboard from './components/Admin/AdminDashboard';

export default function App() {
  const [activeView, setActiveView] = useState('pos'); // pos, admin
  const [settings, setSettings] = useState({});
  const [syncStatus, setSyncStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
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

          {/* View Buttons */}
          <div style={{ display: 'flex', gap: '8px', background: '#0f172a', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setActiveView('pos')}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                background: activeView === 'pos' ? '#2563eb' : 'transparent',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <ShoppingCart size={15} /> POS Terminal
            </button>

            <button
              onClick={() => setActiveView('admin')}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                background: activeView === 'admin' ? '#2563eb' : 'transparent',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <BarChart3 size={15} /> Admin Dashboard
            </button>
          </div>
        </div>

        {/* Right System Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

          {/* Local SQLite DB Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <HardDrive size={14} color="#10b981" />
            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>Local DB: OK</span>
          </div>

          {/* Cloud Connection Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: syncStatus?.isOnline ? 'rgba(37, 99, 235, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            padding: '6px 12px',
            borderRadius: '20px',
            border: '1px solid ' + (syncStatus?.isOnline ? 'rgba(37, 99, 235, 0.3)' : 'rgba(245, 158, 11, 0.3)')
          }}>
            {syncStatus?.isOnline ? <Cloud size={14} color="#2563eb" /> : <CloudOff size={14} color="#f59e0b" />}
            <span style={{ fontSize: '12px', color: syncStatus?.isOnline ? '#2563eb' : '#f59e0b', fontWeight: '600' }}>
              {syncStatus?.isOnline ? 'Cloud Online' : 'Cloud Offline'} {syncStatus?.unsyncedCount > 0 && `(${syncStatus.unsyncedCount} pending)`}
            </span>
          </div>

          {/* Clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>
            <Clock size={15} /> {currentTime}
          </div>

        </div>

      </header>

      {/* BODY VIEW MOUNT */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {activeView === 'pos' ? (
          <PosTerminal settings={settings} onOrderSuccess={fetchAppConfig} />
        ) : (
          <AdminDashboard settings={settings} onSettingsUpdated={fetchAppConfig} />
        )}
      </main>

    </div>
  );
}
