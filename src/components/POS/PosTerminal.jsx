import React, { useState, useEffect } from 'react';
import {
  Utensils, Coffee, GlassWater, Pizza, Cake, Flame, Search, Plus, Minus, Trash2,
  Tag, FileText, ShoppingBag, CheckCircle, RefreshCw, Layers, Users, Clock, Send, Edit
} from 'lucide-react';
import PaymentModal from './PaymentModal';

const iconMap = {
  Utensils: Utensils,
  Coffee: Coffee,
  GlassWater: GlassWater,
  Pizza: Pizza,
  Cake: Cake,
  Flame: Flame,
};

export default function PosTerminal({ settings, onOrderSuccess }) {
  const currency = settings.currency_symbol || '$';
  const taxRate = Number(settings.tax_percent || 5);

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Order Cart State
  const [orderType, setOrderType] = useState('Dine In');
  const [selectedTable, setSelectedTable] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cart, setCart] = useState([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [orderNotes, setOrderNotes] = useState('');
  const [editingOrderId, setEditingOrderId] = useState(null); // Active order being edited

  // Modals State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);

  // Fetch Categories, Products, Tables
  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, prodRes, tableRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/products'),
        fetch('/api/tables')
      ]);

      const catData = await catRes.json();
      const prodData = await prodRes.json();
      const tableData = await tableRes.json();

      setCategories(catData || []);
      setProducts(prodData || []);
      setTables(tableData || []);

      if (tableData && tableData.length > 0 && !selectedTable) {
        setSelectedTable(tableData[0].table_number);
      }
    } catch (err) {
      console.error('Failed to load POS data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredProducts = products.filter(p => {
    const matchesCat = activeCategory === 'all' || p.category_id === Number(activeCategory);
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Select table & load existing active order if booked
  const handleSelectTable = (tableObj) => {
    setSelectedTable(tableObj.table_number);
    setShowTableModal(false);

    if (tableObj.status === 'occupied' && tableObj.activeOrder) {
      const activeOrd = tableObj.activeOrder;
      setEditingOrderId(activeOrd.id);
      setCart((activeOrd.items || []).map(i => ({
        id: i.product_id || i.id,
        product_id: i.product_id || i.id,
        name: i.product_name || i.name,
        price: i.price,
        quantity: i.quantity,
        notes: i.notes || ''
      })));
      setDiscountAmount(activeOrd.discount_amount || 0);
      setOrderNotes(activeOrd.notes || '');
    } else {
      setEditingOrderId(null);
      setCart([]);
    }
  };

  const addToCart = (product) => {
    let dealNotes = '';
    if (product.deal_items && product.deal_items.length > 0) {
      dealNotes = product.deal_items.map(d => `${d.quantity}x ${d.product_name}`).join(', ');
    }

    setCart(prev => {
      const existing = prev.find(item => (item.product_id || item.id) === product.id);
      if (existing) {
        return prev.map(item =>
          (item.product_id || item.id) === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, product_id: product.id, quantity: 1, notes: dealNotes || '' }];
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev =>
      prev
        .map(item => {
          const id = item.product_id || item.id;
          if (id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => (item.product_id || item.id) !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountAmount(0);
    setOrderNotes('');
    setEditingOrderId(null);
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const totalAmount = Math.max(0, subtotal + taxAmount - Number(discountAmount));

  // Option 1: Send to Kitchen / Book Table OR Update Existing Order
  const handleBookOrUpdateTableOrder = async () => {
    if (cart.length === 0) return;
    const currentTableObj = tables.find(t => t.table_number === selectedTable);

    if (editingOrderId) {
      // UPDATE EXISTING ACTIVE TABLE ORDER
      try {
        const res = await fetch(`/api/orders/${editingOrderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart,
            subtotal,
            tax_percent: taxRate,
            tax_amount: taxAmount,
            discount_amount: Number(discountAmount),
            total_amount: totalAmount,
            notes: orderNotes
          })
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Table ${selectedTable} order updated successfully! KOT ready.`);
          clearCart();
          fetchData();
          if (onOrderSuccess) onOrderSuccess();
        } else {
          alert('Error updating order: ' + data.error);
        }
      } catch (err) {
        alert('Failed to update table order: ' + err.message);
      }
    } else {
      // CREATE NEW TABLE ORDER
      const payload = {
        order_type: orderType,
        table_id: currentTableObj ? currentTableObj.id : null,
        table_name: orderType === 'Dine In' ? selectedTable : null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        items: cart,
        subtotal,
        tax_percent: taxRate,
        tax_amount: taxAmount,
        discount_amount: Number(discountAmount),
        total_amount: totalAmount,
        payment_method: 'Cash',
        status: 'Pending',
        keep_table_booked: true,
        notes: orderNotes
      };

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const savedOrder = await res.json();
        alert(`Order #${savedOrder.receipt_no} created for Table ${selectedTable}! Table is now BOOKED.`);
        clearCart();
        fetchData();
        if (onOrderSuccess) onOrderSuccess();
      } catch (err) {
        alert('Error saving table order: ' + err.message);
      }
    }
  };

  // Option 2: Full Paid Checkout
  const handleCompleteOrder = async (completedPaymentDetails) => {
    const currentTableObj = tables.find(t => t.table_number === selectedTable);
    const payload = {
      order_type: orderType,
      table_id: currentTableObj ? currentTableObj.id : null,
      table_name: orderType === 'Dine In' ? selectedTable : null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      items: cart,
      subtotal,
      tax_percent: taxRate,
      tax_amount: taxAmount,
      discount_amount: Number(discountAmount),
      total_amount: totalAmount,
      payment_method: completedPaymentDetails.payment_method,
      tendered_amount: completedPaymentDetails.tendered_amount,
      change_amount: completedPaymentDetails.change_amount,
      status: 'Completed',
      notes: orderNotes
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const savedOrder = await res.json();
      clearCart();
      fetchData();
      if (onOrderSuccess) onOrderSuccess();
      return savedOrder;
    } catch (err) {
      console.error('Failed to submit order:', err);
      alert('Error saving order: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: 'calc(100vh - 60px)', background: '#0f172a' }}>

      {/* LEFT SECTION: PRODUCT CATALOG */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155', overflow: 'hidden' }}>
        
        {/* Top Order Bar */}
        <div style={{ background: '#1e293b', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {['Dine In', 'Take Away', 'Delivery', 'Collection'].map(type => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: orderType === type ? '#2563eb' : '#0f172a',
                  color: orderType === type ? '#fff' : '#94a3b8',
                  border: '1px solid ' + (orderType === type ? '#2563eb' : '#334155'),
                  fontSize: '13px'
                }}
              >
                {type}
              </button>
            ))}
          </div>

          {orderType === 'Dine In' && (
            <button
              onClick={() => setShowTableModal(true)}
              style={{
                background: editingOrderId ? '#a855f7' : '#10b981',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: '700'
              }}
            >
              <Users size={16} /> Table: {selectedTable || 'Select'} {editingOrderId && '(Editing)'}
            </button>
          )}

          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search food items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '34px', padding: '8px 10px 8px 34px', fontSize: '13px', background: '#0f172a' }}
            />
          </div>
        </div>

        {/* Categories Bar */}
        <div style={{ background: '#1e293b', padding: '10px 18px', display: 'flex', gap: '10px', overflowX: 'auto', borderBottom: '1px solid #334155' }}>
          <button
            onClick={() => setActiveCategory('all')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              background: activeCategory === 'all' ? '#2563eb' : '#0f172a',
              color: '#fff',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px'
            }}
          >
            <Layers size={16} /> All Menu
          </button>

          {categories.map(cat => {
            const isHotDeals = cat.name.toLowerCase().includes('deal') || cat.name.toLowerCase().includes('hot');
            const IconComponent = isHotDeals ? Flame : (iconMap[cat.icon] || Utensils);
            const isActive = String(activeCategory) === String(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: isActive
                    ? (isHotDeals ? 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)' : '#2563eb')
                    : (isHotDeals ? 'rgba(239, 68, 68, 0.15)' : '#0f172a'),
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: isHotDeals ? '700' : '600',
                  border: '1px solid ' + (isActive ? (isHotDeals ? '#ef4444' : '#2563eb') : (isHotDeals ? 'rgba(239, 68, 68, 0.5)' : '#334155')),
                  boxShadow: isHotDeals && isActive ? '0 4px 12px rgba(239, 68, 68, 0.4)' : 'none'
                }}
              >
                <IconComponent size={16} color={isHotDeals ? (isActive ? '#fff' : '#ef4444') : '#fff'} />
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Product Grid */}
        <div style={{ flex: 1, padding: '18px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px', alignContent: 'start' }}>
          {filteredProducts.map(product => {
            const isDeal = Boolean(product.is_deal || product.deal_items?.length > 0 || product.category_name === 'Hot Deals');
            return (
              <div
                key={product.id}
                onClick={() => addToCart(product)}
                style={{
                  background: '#1e293b',
                  border: '1px solid ' + (isDeal ? '#ef4444' : '#334155'),
                  borderRadius: '10px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: isDeal ? '0 4px 12px rgba(239, 68, 68, 0.15)' : 'none'
                }}
              >
                <div style={{ height: '110px', background: '#0f172a', overflow: 'hidden', position: 'relative' }}>
                  <img
                    src={product.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'}
                    alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {isDeal && (
                    <div style={{ position: 'absolute', top: '6px', left: '6px', background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '3px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                      <Flame size={12} /> HOT DEAL
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: '6px', right: '6px', background: isDeal ? '#ef4444' : '#10b981', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                    {currency}{product.price.toFixed(2)}
                  </div>
                </div>

                <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc', marginBottom: '4px', lineHeight: '1.2' }}>
                      {product.name}
                    </div>
                    {isDeal && product.deal_items && product.deal_items.length > 0 ? (
                      <div style={{ fontSize: '10px', color: '#fca5a5', lineHeight: '1.3', marginBottom: '4px' }}>
                        📦 {product.deal_items.map(di => `${di.quantity}x ${di.product_name}`).join(', ')}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {product.category_name || 'Item'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT SECTION: ACTIVE CART & TICKET */}
      <div style={{ background: '#1e293b', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        <div style={{ padding: '16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingBag size={18} color="#2563eb" /> Current Order Ticket
            </h3>
            <span style={{ fontSize: '12px', color: editingOrderId ? '#a855f7' : '#94a3b8', fontWeight: '600' }}>
              {editingOrderId ? `Editing Table ${selectedTable} Order` : `${orderType} ${orderType === 'Dine In' ? `(${selectedTable})` : ''}`}
            </span>
          </div>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              style={{ background: 'transparent', color: '#ef4444', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Trash2 size={14} /> Clear
            </button>
          )}
        </div>

        {/* Item List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlignment: 'center', color: '#64748b', marginTop: '60px', textAlign: 'center' }}>
              <ShoppingBag size={48} style={{ opacity: 0.3, marginBottom: '10px' }} />
              <div>Cart is empty</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>Tap menu items to add to order</div>
            </div>
          ) : (
            cart.map(item => {
              const itemId = item.product_id || item.id;
              return (
                <div
                  key={itemId}
                  style={{
                    background: '#0f172a',
                    borderRadius: '8px',
                    padding: '10px',
                    marginBottom: '10px',
                    border: '1px solid #334155'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{item.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#10b981' }}>
                      {currency}{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  {item.notes && (
                    <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '6px', fontStyle: 'italic' }}>
                      🎁 Includes: {item.notes}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{currency}{item.price.toFixed(2)} each</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e293b', borderRadius: '6px', padding: '2px 6px' }}>
                      <button
                        onClick={() => updateQuantity(itemId, -1)}
                        style={{ background: 'transparent', color: '#94a3b8', padding: '2px' }}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff', minWidth: '18px', textAlign: 'center' }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(itemId, 1)}
                        style={{ background: 'transparent', color: '#94a3b8', padding: '2px' }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart Bottom Summary & Checkout */}
        <div style={{ background: '#0f172a', padding: '16px', borderTop: '1px solid #334155' }}>
          
          <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#94a3b8' }}>
            <span>Subtotal:</span>
            <span style={{ color: '#fff', fontWeight: '600' }}>{currency}{subtotal.toFixed(2)}</span>
          </div>

          <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#94a3b8' }}>
            <span>Tax ({taxRate}%):</span>
            <span style={{ color: '#fff', fontWeight: '600' }}>{currency}{taxAmount.toFixed(2)}</span>
          </div>

          {discountAmount > 0 && (
            <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#ef4444' }}>
              <span>Discount:</span>
              <span style={{ fontWeight: '600' }}>-{currency}{Number(discountAmount).toFixed(2)}</span>
            </div>
          )}

          <div style={{ fontSize: '18px', display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #334155', color: '#fff', fontWeight: '800' }}>
            <span>TOTAL:</span>
            <span style={{ color: '#10b981' }}>{currency}{totalAmount.toFixed(2)}</span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {orderType === 'Dine In' && (
              <button
                disabled={cart.length === 0}
                onClick={handleBookOrUpdateTableOrder}
                style={{
                  flex: 1,
                  background: cart.length === 0 ? '#475569' : (editingOrderId ? '#a855f7' : '#3b82f6'),
                  color: '#fff',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                {editingOrderId ? <Edit size={14} /> : <Send size={14} />}
                {editingOrderId ? 'Update Order & Resend KOT' : 'Send to Kitchen & Book'}
              </button>
            )}

            <button
              onClick={() => setShowDiscountModal(true)}
              style={{
                background: '#334155',
                color: '#fff',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <Tag size={14} /> Discount
            </button>
          </div>

          {/* Pay Button */}
          <button
            disabled={cart.length === 0}
            onClick={() => setShowPaymentModal(true)}
            style={{
              width: '100%',
              padding: '14px',
              marginTop: '10px',
              background: cart.length === 0 ? '#475569' : '#10b981',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '18px',
              fontWeight: '800'
            }}
          >
            PAY {currency}{totalAmount.toFixed(2)}
          </button>
        </div>

      </div>

      {/* MODAL: Table Picker */}
      {showTableModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginBottom: '16px', color: '#fff' }}>Select Table</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {tables.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTable(t)}
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    background: selectedTable === t.table_number ? '#2563eb' : (t.status === 'occupied' ? '#ef4444' : '#0f172a'),
                    color: '#fff',
                    border: '1px solid #334155',
                    fontSize: '15px'
                  }}
                >
                  {t.table_number} {t.status === 'occupied' && '(Booked - Click to Edit)'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTableModal(false)}
              style={{ width: '100%', marginTop: '16px', padding: '10px', background: '#334155', color: '#fff', borderRadius: '6px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Discount Input */}
      {showDiscountModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginBottom: '16px', color: '#fff' }}>Apply Order Discount ({currency})</h3>
            <input
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              placeholder="Enter discount amount..."
              style={{ fontSize: '18px', padding: '12px', marginBottom: '16px' }}
            />
            <button
              onClick={() => setShowDiscountModal(false)}
              style={{ width: '100%', padding: '12px', background: '#2563eb', color: '#fff', borderRadius: '6px', fontSize: '15px' }}
            >
              Apply Discount
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Payment Checkout */}
      {showPaymentModal && (
        <PaymentModal
          order={{
            subtotal,
            tax_percent: taxRate,
            tax_amount: taxAmount,
            discount_amount: Number(discountAmount),
            total_amount: totalAmount,
            order_type: orderType,
            table_name: selectedTable,
            items: cart
          }}
          settings={settings}
          onClose={() => setShowPaymentModal(false)}
          onCompleteOrder={handleCompleteOrder}
        />
      )}

    </div>
  );
}
