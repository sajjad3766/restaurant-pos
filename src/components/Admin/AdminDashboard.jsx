import React, { useState, useEffect } from 'react';
import {
  BarChart3, Cloud, CloudOff, RefreshCw, ShoppingBag, Plus, Trash2, Edit, Save,
  DollarSign, Package, Users, Settings as SettingsIcon, Printer, CheckCircle,
  XCircle, RotateCcw, AlertTriangle, Utensils, Clock, Eye, Flame, Upload, Link, Image as ImageIcon
} from 'lucide-react';
import ThermalReceipt from '../Receipt/ThermalReceipt';

export default function AdminDashboard({ settings, onSettingsUpdated }) {
  const currency = settings.currency_symbol || '$';

  const [activeTab, setActiveTab] = useState('overview'); // overview, live_tables, products, sync, settings
  const [reports, setReports] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tables, setTables] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  // Admin Order Taking Modal State
  const [selectedTableForOrder, setSelectedTableForOrder] = useState(null);
  const [adminCart, setAdminCart] = useState([]);
  const [adminActiveCategory, setAdminActiveCategory] = useState('all');

  // Inspection Modal for Occupied Table
  const [inspectingTableOrder, setInspectingTableOrder] = useState(null);

  // Modals & Forms
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [prodForm, setProdForm] = useState({
    name: '',
    price: '',
    category_id: '',
    image_url: '',
    description: '',
    stock_qty: 999,
    is_deal: false,
    deal_items: []
  });

  // Image Upload Mode & Deal Builder state
  const [imageInputMode, setImageInputMode] = useState('upload'); // 'upload' | 'url'
  const [uploadingImage, setUploadingImage] = useState(false);
  const [bundleSelectId, setBundleSelectId] = useState('');
  const [bundleSelectQty, setBundleSelectQty] = useState(1);

  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState('4');

  const [settingsForm, setSettingsForm] = useState({ ...settings });
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState(null);

  // Fetch all admin data
  const loadAdminData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [repRes, prodRes, catRes, tableRes, syncRes] = await Promise.all([
        fetch('/api/reports/dashboard'),
        fetch('/api/products'),
        fetch('/api/categories'),
        fetch('/api/tables'),
        fetch('/api/sync/status')
      ]);

      if (repRes.ok) setReports(await repRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (tableRes.ok) setTables(await tableRes.json());
      if (syncRes.ok) setSyncStatus(await syncRes.json());
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    // Live Auto-Refresh every 3 seconds for instant real-time sync
    const liveInterval = setInterval(() => {
      loadAdminData(true);
    }, 3000);
    return () => clearInterval(liveInterval);
  }, []);

  // Admin Order Actions: Cancel, Reverse, Refund, Complete
  const handleOrderAction = async (orderId, action, receiptNo) => {
    const actionLabels = {
      cancel: 'CANCEL',
      reverse: 'REVERSE',
      refund: 'REFUND',
      complete: 'COMPLETE & SETTLE'
    };

    if (!confirm(`Are you sure you want to ${actionLabels[action]} Order #${receiptNo}?`)) return;

    try {
      const res = await fetch(`/api/orders/${orderId}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok) {
          alert(data.message);
          setInspectingTableOrder(null);

          // If settling bill, automatically open itemized receipt modal for printing!
          if (action === 'complete' && data.order) {
            setSelectedReceiptOrder(data.order);
          }
          loadAdminData();
        } else {
          alert('Error: ' + (data.error || 'Failed to update order'));
        }
      } else {
        const text = await res.text();
        alert('Server Response Error (' + res.status + '). Details: ' + text.slice(0, 100));
      }
    } catch (err) {
      alert('Failed to perform order action: ' + err.message);
    }
  };

  // Helper to open full itemized receipt for an order
  const handleOpenReceiptModal = async (order) => {
    if (order.items && order.items.length > 0) {
      setSelectedReceiptOrder(order);
    } else {
      // Fetch full order with items from API if missing
      try {
        const res = await fetch(`/api/orders/${order.id}`);
        if (res.ok) {
          const fullOrd = await res.json();
          setSelectedReceiptOrder(fullOrd);
        } else {
          setSelectedReceiptOrder(order);
        }
      } catch (err) {
        setSelectedReceiptOrder(order);
      }
    }
  };

  // Admin Take Order for Table handlers
  const handleAdminAddToCart = (prod) => {
    setAdminCart(prev => {
      const existing = prev.find(item => item.id === prod.id);
      if (existing) {
        return prev.map(item => item.id === prod.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...prod, quantity: 1 }];
    });
  };

  const handleAdminSubmitTableOrder = async () => {
    if (adminCart.length === 0) return alert('Please select at least one item');
    
    const subtotal = adminCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const taxRate = Number(settings.tax_percent || 5);
    const taxAmount = (subtotal * taxRate) / 100;
    const totalAmount = subtotal + taxAmount;

    const payload = {
      order_type: 'Dine In',
      table_id: selectedTableForOrder.id,
      table_name: selectedTableForOrder.table_number,
      items: adminCart,
      subtotal,
      tax_percent: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      payment_method: 'Cash',
      status: 'Pending',
      keep_table_booked: true,
      notes: 'Order placed via Admin Dashboard'
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert(`Order created for Table ${selectedTableForOrder.table_number}! Table is now BOOKED.`);
        setSelectedTableForOrder(null);
        setAdminCart([]);
        loadAdminData();
      } else {
        const data = await res.json();
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Failed to create order: ' + err.message);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      });
      alert('Settings updated successfully!');
      if (onSettingsUpdated) onSettingsUpdated();
      loadAdminData();
    } catch (err) {
      alert('Error saving settings: ' + err.message);
    }
  };

  const handleManualSync = async () => {
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' });
      const data = await res.json();
      alert(`Sync triggered! Status: ${data.status} ${data.syncedCount ? `(${data.syncedCount} orders pushed)` : ''}`);
      loadAdminData();
    } catch (err) {
      alert('Sync error: ' + err.message);
    }
  };

  const handleImageFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose a valid image file (PNG, JPG, WebP, GIF)');
      return;
    }

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result;
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, filename: file.name })
        });
        const data = await res.json();
        if (res.ok && data.url) {
          setProdForm(prev => ({ ...prev, image_url: data.url }));
        } else {
          setProdForm(prev => ({ ...prev, image_url: base64 }));
        }
      } catch (err) {
        setProdForm(prev => ({ ...prev, image_url: reader.result }));
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      if (prodForm.is_deal && prodForm.deal_items.length === 0) {
        return alert('Please add at least one product to this Hot Deal bundle.');
      }

      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...prodForm,
          price: Number(prodForm.price),
          category_id: prodForm.category_id ? Number(prodForm.category_id) : null,
          is_deal: prodForm.is_deal ? 1 : 0,
          deal_items: prodForm.deal_items || []
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to save menu item');
      }
      setShowProductModal(false);
      setEditingProduct(null);
      setProdForm({ name: '', price: '', category_id: '', image_url: '', description: '', stock_qty: 999, is_deal: false, deal_items: [] });
      loadAdminData();
    } catch (err) {
      alert('Error saving product: ' + err.message);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await fetch(`/api/products/${id}`, { method: 'DELETE' });
      loadAdminData();
    } catch (err) {
      alert('Error deleting product: ' + err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return { bg: 'rgba(16, 185, 129, 0.2)', color: '#10b981' };
      case 'Pending': return { bg: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' };
      case 'Cancelled': return { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
      case 'Reversed': return { bg: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' };
      case 'Refunded': return { bg: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' };
      default: return { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8' };
    }
  };

  return (
    <div style={{ background: '#0f172a', minHeight: '100%', padding: '24px', paddingBottom: '80px', color: '#f8fafc', overflowY: 'auto', flex: 1 }}>
      
      {/* Sub Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[
            { id: 'overview', label: 'Sales & Orders Control', icon: BarChart3 },
            { id: 'live_tables', label: 'Live Tables & Orders', icon: Users },
            { id: 'products', label: 'Menu Catalog', icon: Package },
            { id: 'sync', label: 'Cloud Sync Engine', icon: Cloud },
            { id: 'settings', label: 'POS Settings', icon: SettingsIcon },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: isActive ? '#2563eb' : '#1e293b',
                  color: '#fff',
                  border: '1px solid ' + (isActive ? '#2563eb' : '#334155'),
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: isActive ? '700' : '500'
                }}
              >
                <Icon size={18} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Live Auto-Refresh Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
            Live Updates Active (3s)
          </div>
          <button
            onClick={() => loadAdminData()}
            style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RotateCcw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW & SALES CONTROL */}
      {activeTab === 'overview' && reports && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Today's Total Revenue</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#10b981', marginTop: '6px' }}>
                {currency}{reports.todaySales.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{reports.todayOrders} Completed sales</div>
            </div>

            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Average Order Value</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#2563eb', marginTop: '6px' }}>
                {currency}{reports.avgBill.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Per transaction</div>
            </div>

            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>All-Time Sales</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#f59e0b', marginTop: '6px' }}>
                {currency}{reports.totalSales.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{reports.totalOrdersCount} Orders logged</div>
            </div>

            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Cloud Pending Sync</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: syncStatus?.unsyncedCount === 0 ? '#10b981' : '#f59e0b', marginTop: '6px' }}>
                {syncStatus?.unsyncedCount || 0} Orders
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {syncStatus?.isOnline ? 'Online Engine' : 'Offline Engine'}
              </div>
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Admin Sales Order Management Log</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Receipt #</th>
                    <th style={{ padding: '10px' }}>Time</th>
                    <th style={{ padding: '10px' }}>Type / Table</th>
                    <th style={{ padding: '10px' }}>Total</th>
                    <th style={{ padding: '10px' }}>Status</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Admin Order Controls (Reverse / Cancel / Refund)</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.recentOrders.map(o => {
                    const stColor = getStatusColor(o.status);
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#2563eb' }}>{o.receipt_no}</td>
                        <td style={{ padding: '10px', color: '#94a3b8' }}>{new Date(o.created_at).toLocaleTimeString()}</td>
                        <td style={{ padding: '10px' }}>
                          {o.order_type} {o.table_name && `(${o.table_name})`}
                        </td>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#10b981' }}>{currency}{o.total_amount.toFixed(2)}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
                            background: stColor.bg, color: stColor.color
                          }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {o.status === 'Pending' && (
                              <button
                                onClick={() => handleOrderAction(o.id, 'complete', o.receipt_no)}
                                style={{ background: '#10b981', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <CheckCircle size={12} /> Settle Bill
                              </button>
                            )}

                            {['Completed', 'Pending'].includes(o.status) && (
                              <button
                                onClick={() => handleOrderAction(o.id, 'cancel', o.receipt_no)}
                                style={{ background: '#ef4444', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <XCircle size={12} /> Cancel
                              </button>
                            )}

                            {o.status === 'Completed' && (
                              <button
                                onClick={() => handleOrderAction(o.id, 'reverse', o.receipt_no)}
                                style={{ background: '#a855f7', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <RotateCcw size={12} /> Reverse
                              </button>
                            )}

                            {o.status === 'Completed' && (
                              <button
                                onClick={() => handleOrderAction(o.id, 'refund', o.receipt_no)}
                                style={{ background: '#f59e0b', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <DollarSign size={12} /> Refund
                              </button>
                            )}

                            <button
                              onClick={() => handleOpenReceiptModal(o)}
                              style={{ background: '#334155', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Printer size={12} /> Receipt
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE TABLES & ADMIN ORDER INSPECTION */}
      {activeTab === 'live_tables' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '18px' }}>Live Table Management & Floor Plan</h3>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>Click any occupied table to inspect its active order, items, bill total, or perform cancellation/reversal.</p>
            </div>
            <button
              onClick={loadAdminData}
              style={{ background: '#334155', color: '#fff', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} /> Refresh Tables Status
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {tables.map(table => {
              const isOccupied = table.status === 'occupied' && table.activeOrder;
              const activeOrder = table.activeOrder;

              return (
                <div
                  key={table.id}
                  onClick={() => {
                    if (isOccupied) setInspectingTableOrder({ table, order: activeOrder });
                  }}
                  style={{
                    background: '#1e293b',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '2px solid ' + (isOccupied ? '#ef4444' : '#10b981'),
                    cursor: isOccupied ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    boxShadow: isOccupied ? '0 4px 12px rgba(239, 68, 68, 0.2)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '20px', fontWeight: '800', color: '#fff' }}>{table.table_number}</span>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '800',
                        background: isOccupied ? '#ef4444' : '#10b981',
                        color: '#fff'
                      }}>
                        {isOccupied ? 'BOOKED / OCCUPIED' : 'AVAILABLE'}
                      </span>
                    </div>

                    {isOccupied ? (
                      <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                          <span>Receipt #{activeOrder.receipt_no}</span>
                          <span style={{ color: '#f59e0b', fontWeight: '700' }}>{activeOrder.status}</span>
                        </div>

                        <div style={{ maxHeight: '100px', overflowY: 'auto', marginBottom: '8px', fontSize: '12px' }}>
                          {(activeOrder.items || []).map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#f8fafc', padding: '2px 0' }}>
                              <span>{item.quantity}x {item.product_name}</span>
                              <span style={{ color: '#94a3b8' }}>{currency}{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '800', borderTop: '1px dashed #334155', paddingTop: '6px', color: '#10b981' }}>
                          <span>Total Bill:</span>
                          <span>{currency}{activeOrder.total_amount.toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                        <Utensils size={32} style={{ opacity: 0.3, marginBottom: '6px' }} />
                        <div style={{ fontSize: '13px' }}>Table Available</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                    {isOccupied ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingTableOrder({ table, order: activeOrder });
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: '#2563eb',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Eye size={16} /> Click to View & Manage Table Order
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedTableForOrder(table);
                          setAdminCart([]);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: '#10b981',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Plus size={16} /> Take Order for {table.table_number}
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: MENU CATALOG MANAGER */}
      {activeTab === 'products' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '18px' }}>Menu Catalog ({products.length} Items)</h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Manage individual food items and special bundled Hot Deals packages
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  const hotCat = categories.find(c => c.name.toLowerCase().includes('deal') || c.name.toLowerCase().includes('hot'));
                  setProdForm({
                    name: '',
                    price: '',
                    category_id: hotCat ? hotCat.id : (categories[0]?.id || ''),
                    image_url: '',
                    description: '',
                    stock_qty: 999,
                    is_deal: true,
                    deal_items: []
                  });
                  setImageInputMode('upload');
                  setShowProductModal(true);
                }}
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)', color: '#fff', padding: '10px 18px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' }}
              >
                <Flame size={18} /> Create Hot Deal / Combo
              </button>

              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProdForm({
                    name: '',
                    price: '',
                    category_id: categories[0]?.id || '',
                    image_url: '',
                    description: '',
                    stock_qty: 999,
                    is_deal: false,
                    deal_items: []
                  });
                  setImageInputMode('upload');
                  setShowProductModal(true);
                }}
                style={{ background: '#2563eb', color: '#fff', padding: '10px 18px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Plus size={18} /> Add New Menu Item
              </button>
            </div>
          </div>

          <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left', background: '#0f172a' }}>
                  <th style={{ padding: '12px' }}>Image</th>
                  <th style={{ padding: '12px' }}>Item / Deal Name</th>
                  <th style={{ padding: '12px' }}>Category / Type</th>
                  <th style={{ padding: '12px' }}>Price</th>
                  <th style={{ padding: '12px' }}>Stock</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const isDeal = Boolean(p.is_deal || p.deal_items?.length > 0 || p.category_name === 'Hot Deals');
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #334155', background: isDeal ? 'rgba(239, 68, 68, 0.03)' : 'transparent' }}>
                      <td style={{ padding: '12px' }}>
                        <img src={p.image_url || 'https://via.placeholder.com/40'} alt={p.name} style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover' }} />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '600' }}>{p.name}</span>
                          {isDeal && (
                            <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Flame size={11} /> HOT DEAL
                            </span>
                          )}
                        </div>
                        {isDeal && p.deal_items && p.deal_items.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ color: '#94a3b8' }}>Includes:</span>
                            {p.deal_items.map((di, idx) => (
                              <span key={idx} style={{ background: '#0f172a', padding: '1px 6px', borderRadius: '3px', border: '1px solid #334155' }}>
                                {di.quantity}x {di.product_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: isDeal ? '#f87171' : '#94a3b8', fontWeight: isDeal ? '700' : 'normal' }}>
                        {p.category_name || (isDeal ? 'Hot Deals' : 'Uncategorized')}
                      </td>
                      <td style={{ padding: '12px', fontWeight: '700', color: '#10b981' }}>{currency}{p.price.toFixed(2)}</td>
                      <td style={{ padding: '12px' }}>{p.stock_qty}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setProdForm({
                              name: p.name,
                              price: p.price,
                              category_id: p.category_id || '',
                              image_url: p.image_url || '',
                              description: p.description || '',
                              stock_qty: p.stock_qty,
                              is_deal: isDeal,
                              deal_items: p.deal_items || []
                            });
                            setImageInputMode(p.image_url?.startsWith('/uploads') || p.image_url?.startsWith('data:') ? 'upload' : 'url');
                            setShowProductModal(true);
                          }}
                          style={{ background: '#334155', color: '#fff', padding: '6px 10px', borderRadius: '6px', marginRight: '6px' }}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          style={{ background: '#ef4444', color: '#fff', padding: '6px 10px', borderRadius: '6px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CLOUD SYNC CONTROL PANEL */}
      {activeTab === 'sync' && (
        <div style={{ maxWidth: '640px' }}>
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cloud color="#2563eb" /> Offline-First Cloud Sync Manager
            </h3>

            <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#94a3b8' }}>Internet Connection:</span>
                <span style={{ fontWeight: '700', color: syncStatus?.isOnline ? '#10b981' : '#ef4444' }}>
                  {syncStatus?.isOnline ? 'Online (Connected)' : 'Offline (No Connection)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#94a3b8' }}>Un-synced Orders Pending:</span>
                <span style={{ fontWeight: '700', color: syncStatus?.unsyncedCount > 0 ? '#f59e0b' : '#10b981' }}>
                  {syncStatus?.unsyncedCount || 0} Orders
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Target Cloud URL:</span>
                <span style={{ fontSize: '12px', color: '#2563eb' }}>{syncStatus?.cloudApiUrl || 'Not configured'}</span>
              </div>
            </div>

            <button
              onClick={handleManualSync}
              style={{
                width: '100%',
                padding: '14px',
                background: '#2563eb',
                color: '#fff',
                borderRadius: '8px',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <RefreshCw size={18} /> Trigger Manual Cloud Sync Now
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: POS SETTINGS */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth: '640px', background: '#1e293b', padding: '24px', borderRadius: '12px', border: '1px solid #334155' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Restaurant & Receipt Configuration</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Restaurant Name</label>
              <input
                type="text"
                value={settingsForm.restaurant_name || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, restaurant_name: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Address</label>
              <input
                type="text"
                value={settingsForm.restaurant_address || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, restaurant_address: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Phone Number</label>
              <input
                type="text"
                value={settingsForm.restaurant_phone || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, restaurant_phone: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Currency Symbol</label>
                <input
                  type="text"
                  value={settingsForm.currency_symbol || '$'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, currency_symbol: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={settingsForm.tax_percent || '5.0'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, tax_percent: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Cloud Sync URL</label>
              <input
                type="text"
                value={settingsForm.cloud_api_url || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, cloud_api_url: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Receipt Footer Text</label>
              <textarea
                rows={2}
                value={settingsForm.receipt_footer || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, receipt_footer: e.target.value })}
              />
            </div>

            <button
              onClick={handleSaveSettings}
              style={{
                padding: '14px',
                background: '#10b981',
                color: '#fff',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '10px'
              }}
            >
              <Save size={18} /> Save Settings
            </button>
          </div>
        </div>
      )}

      {/* MODAL: INSPECT OCCUPIED TABLE ORDER */}
      {inspectingTableOrder && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ color: '#ef4444', fontSize: '20px', fontWeight: '800' }}>
                  {inspectingTableOrder.table.table_number} — BOOKED TABLE ORDER
                </h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Receipt #{inspectingTableOrder.order.receipt_no} | Status: {inspectingTableOrder.order.status}
                </span>
              </div>
              <button onClick={() => setInspectingTableOrder(null)} style={{ background: 'transparent', color: '#94a3b8', fontSize: '18px' }}>
                ✕
              </button>
            </div>

            {/* Order Items Detail List */}
            <div style={{ background: '#0f172a', borderRadius: '8px', padding: '16px', marginBottom: '20px', maxHeight: '240px', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase' }}>Itemized Table Bill</h4>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '6px 0' }}>Qty</th>
                    <th style={{ padding: '6px 0' }}>Product</th>
                    <th style={{ padding: '6px 0', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '6px 0', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(inspectingTableOrder.order.items || []).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px 0', fontWeight: '700' }}>{item.quantity}x</td>
                      <td style={{ padding: '8px 0' }}>{item.product_name || item.name}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', color: '#94a3b8' }}>{currency}{item.price.toFixed(2)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '700', color: '#10b981' }}>{currency}{(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed #334155', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800' }}>
                <span>Total Payable:</span>
                <span style={{ color: '#10b981' }}>{currency}{inspectingTableOrder.order.total_amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Action Bar inside Modal */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <button
                onClick={() => handleOrderAction(inspectingTableOrder.order.id, 'complete', inspectingTableOrder.order.receipt_no)}
                style={{ padding: '12px', background: '#10b981', color: '#fff', borderRadius: '6px', fontWeight: '700', fontSize: '14px' }}
              >
                Settle & Complete Bill
              </button>

              <button
                onClick={() => handleOpenReceiptModal(inspectingTableOrder.order)}
                style={{ padding: '12px', background: '#2563eb', color: '#fff', borderRadius: '6px', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Printer size={16} /> Print Full Receipt / KOT
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={() => handleOrderAction(inspectingTableOrder.order.id, 'cancel', inspectingTableOrder.order.receipt_no)}
                style={{ padding: '10px', background: '#ef4444', color: '#fff', borderRadius: '6px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <XCircle size={14} /> Cancel Table Order
              </button>

              <button
                onClick={() => handleOrderAction(inspectingTableOrder.order.id, 'reverse', inspectingTableOrder.order.receipt_no)}
                style={{ padding: '10px', background: '#a855f7', color: '#fff', borderRadius: '6px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <RotateCcw size={14} /> Reverse Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN TAKE ORDER FOR TABLE */}
      {selectedTableForOrder && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '720px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: '#fff' }}>Take New Order for Table {selectedTableForOrder.table_number}</h3>
              <button onClick={() => setSelectedTableForOrder(null)} style={{ background: 'transparent', color: '#94a3b8' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '10px' }}>
                  <button
                    onClick={() => setAdminActiveCategory('all')}
                    style={{ padding: '6px 12px', borderRadius: '4px', background: adminActiveCategory === 'all' ? '#2563eb' : '#0f172a', color: '#fff', fontSize: '12px' }}
                  >
                    All
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setAdminActiveCategory(c.id)}
                      style={{ padding: '6px 12px', borderRadius: '4px', background: String(adminActiveCategory) === String(c.id) ? '#2563eb' : '#0f172a', color: '#fff', fontSize: '12px' }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {products
                    .filter(p => adminActiveCategory === 'all' || p.category_id === Number(adminActiveCategory))
                    .map(p => (
                      <div
                        key={p.id}
                        onClick={() => handleAdminAddToCart(p)}
                        style={{ background: '#0f172a', padding: '8px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #334155' }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: '600' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '700', marginTop: '2px' }}>{currency}{p.price.toFixed(2)}</div>
                      </div>
                    ))}
                </div>
              </div>

              <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>Order Items ({adminCart.length})</h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {adminCart.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                        <span>{item.quantity}x {item.name}</span>
                        <span style={{ fontWeight: '700', color: '#10b981' }}>{currency}{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#10b981', marginBottom: '10px' }}>
                    Total: {currency}{adminCart.reduce((acc, i) => acc + (i.price * i.quantity), 0).toFixed(2)}
                  </div>
                  <button
                    onClick={handleAdminSubmitTableOrder}
                    disabled={adminCart.length === 0}
                    style={{ width: '100%', padding: '12px', background: adminCart.length === 0 ? '#475569' : '#10b981', color: '#fff', borderRadius: '6px', fontWeight: '700' }}
                  >
                    Place Table Order
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Thermal Receipt Preview for Past Orders */}
      {selectedReceiptOrder && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <h3 style={{ marginBottom: '16px', color: '#fff' }}>Receipt #{selectedReceiptOrder.receipt_no}</h3>
            <div style={{ background: '#fff', color: '#000', padding: '16px', borderRadius: '8px', maxHeight: '360px', overflowY: 'auto', marginBottom: '16px' }}>
              <ThermalReceipt order={selectedReceiptOrder} settings={settings} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => window.print()}
                style={{ flex: 1, padding: '12px', background: '#2563eb', color: '#fff', borderRadius: '6px', display: 'flex', alignItems: 'center', justify: 'center', gap: '6px' }}
              >
                <Printer size={16} /> Print 80mm Receipt
              </button>
              <button onClick={() => setSelectedReceiptOrder(null)} style={{ padding: '12px', background: '#334155', color: '#fff', borderRadius: '6px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT MENU ITEM & HOT DEALS */}
      {showProductModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {prodForm.is_deal && <Flame color="#ef4444" size={22} />}
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>
                  {editingProduct
                    ? (prodForm.is_deal ? 'Edit Hot Deal / Combo Bundle' : 'Edit Menu Item')
                    : (prodForm.is_deal ? 'Create New Hot Deal / Combo Bundle' : 'Add New Menu Item')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                style={{ background: 'transparent', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', border: 'none' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* HOT DEAL TOGGLE */}
              <div style={{ background: prodForm.is_deal ? 'rgba(239, 68, 68, 0.12)' : '#0f172a', border: '1px solid ' + (prodForm.is_deal ? '#ef4444' : '#334155'), borderRadius: '8px', padding: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Flame color={prodForm.is_deal ? '#ef4444' : '#94a3b8'} size={22} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: prodForm.is_deal ? '#f87171' : '#f8fafc' }}>
                        Hot Deal / Combo Bundle Package
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Bundle multiple menu products together under special discounted deal pricing
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prodForm.is_deal}
                    onChange={(e) => {
                      const isDeal = e.target.checked;
                      const hotDealsCat = categories.find(c => c.name.toLowerCase().includes('deal') || c.name.toLowerCase().includes('hot'));
                      setProdForm(prev => ({
                        ...prev,
                        is_deal: isDeal,
                        category_id: isDeal && hotDealsCat ? hotDealsCat.id : prev.category_id
                      }));
                    }}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                </label>

                {/* DEAL BUNDLE ITEMS PICKER */}
                {prodForm.is_deal && (
                  <div style={{ marginTop: '14px', borderTop: '1px dashed #475569', paddingTop: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>
                      Select Products to Include in this Deal:
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <select
                        value={bundleSelectId}
                        onChange={(e) => setBundleSelectId(e.target.value)}
                        style={{ flex: 1, padding: '8px', fontSize: '13px', background: '#020617' }}
                      >
                        <option value="">-- Choose Product to Add --</option>
                        {products
                          .filter(p => !p.is_deal && p.id !== editingProduct?.id)
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({currency}{p.price.toFixed(2)})</option>
                          ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={bundleSelectQty}
                        onChange={(e) => setBundleSelectQty(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: '70px', padding: '8px', fontSize: '13px', background: '#020617' }}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          if (!bundleSelectId) return;
                          const targetP = products.find(p => p.id === Number(bundleSelectId));
                          if (!targetP) return;
                          setProdForm(prev => {
                            const existing = prev.deal_items.find(i => i.product_id === targetP.id);
                            let items;
                            if (existing) {
                              items = prev.deal_items.map(i => i.product_id === targetP.id ? { ...i, quantity: i.quantity + bundleSelectQty } : i);
                            } else {
                              items = [...prev.deal_items, { product_id: targetP.id, product_name: targetP.name, original_price: targetP.price, quantity: bundleSelectQty }];
                            }
                            return { ...prev, deal_items: items };
                          });
                          setBundleSelectId('');
                          setBundleSelectQty(1);
                        }}
                        style={{ background: '#ef4444', color: '#fff', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', border: 'none', cursor: 'pointer' }}
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>

                    {/* Included Items List */}
                    {prodForm.deal_items.length > 0 ? (
                      <div style={{ background: '#020617', borderRadius: '6px', padding: '10px', border: '1px solid #1e293b' }}>
                        {prodForm.deal_items.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: idx < prodForm.deal_items.length - 1 ? '1px solid #1e293b' : 'none', fontSize: '12px' }}>
                            <span style={{ color: '#f8fafc' }}>
                              <strong style={{ color: '#ef4444' }}>{item.quantity}x</strong> {item.product_name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: '#94a3b8' }}>{currency}{((item.original_price || 0) * item.quantity).toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => setProdForm(prev => ({ ...prev, deal_items: prev.deal_items.filter((_, i) => i !== idx) }))}
                                style={{ background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '2px', border: 'none' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}

                        <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #334155', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                          <span>Combined Products Original Total:</span>
                          <span style={{ color: '#f8fafc', fontWeight: '700' }}>
                            {currency}
                            {prodForm.deal_items.reduce((acc, i) => acc + ((i.original_price || 0) * i.quantity), 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#f59e0b', fontStyle: 'italic', padding: '4px 0' }}>
                        ⚠️ No products added yet. Select a product above and click Add to include in this deal bundle.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                  {prodForm.is_deal ? 'Deal / Combo Name *' : 'Item Name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={prodForm.is_deal ? 'e.g. Mega Family Feast Combo' : 'e.g. Cheese Burger, Iced Coffee'}
                  value={prodForm.name}
                  onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                    {prodForm.is_deal ? `Deal Discounted Price (${currency}) *` : `Price (${currency}) *`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={prodForm.price}
                    onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Category</label>
                  <select
                    value={prodForm.category_id}
                    onChange={(e) => setProdForm({ ...prodForm, category_id: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Stock Quantity</label>
                  <input
                    type="number"
                    value={prodForm.stock_qty}
                    onChange={(e) => setProdForm({ ...prodForm, stock_qty: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                  />
                </div>

                {/* IMAGE INPUT WITH BROWSE PC AND LINK TABS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', color: '#94a3b8' }}>Item Image</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setImageInputMode('upload')}
                        style={{
                          background: imageInputMode === 'upload' ? '#2563eb' : '#0f172a',
                          color: '#fff',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          border: '1px solid #334155',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Upload size={11} /> Browse PC
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageInputMode('url')}
                        style={{
                          background: imageInputMode === 'url' ? '#2563eb' : '#0f172a',
                          color: '#fff',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          border: '1px solid #334155',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Link size={11} /> URL
                      </button>
                    </div>
                  </div>

                  {imageInputMode === 'upload' ? (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', fontSize: '11px' }}
                      />
                      {uploadingImage && <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '2px' }}>Saving image...</div>}
                    </div>
                  ) : (
                    <input
                      type="text"
                      placeholder="https://..."
                      value={prodForm.image_url}
                      onChange={(e) => setProdForm({ ...prodForm, image_url: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                    />
                  )}
                </div>
              </div>

              {/* IMAGE PREVIEW THUMBNAIL */}
              {prodForm.image_url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#020617', padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
                  <img
                    src={prodForm.image_url}
                    alt="Preview"
                    style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover' }}
                  />
                  <div style={{ flex: 1, fontSize: '12px', color: '#10b981' }}>
                    Image attached successfully
                  </div>
                  <button
                    type="button"
                    onClick={() => setProdForm({ ...prodForm, image_url: '' })}
                    style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Remove
                  </button>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Description / Deal Highlights</label>
                <textarea
                  rows={2}
                  placeholder="Optional item or combo description..."
                  value={prodForm.description}
                  onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: prodForm.is_deal ? 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)' : '#2563eb',
                    color: '#fff',
                    borderRadius: '6px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Save size={16} /> {editingProduct ? 'Save Changes' : (prodForm.is_deal ? 'Create Hot Deal' : 'Create Menu Item')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  style={{ padding: '12px 18px', background: '#334155', color: '#fff', borderRadius: '6px', cursor: 'pointer', border: 'none' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
