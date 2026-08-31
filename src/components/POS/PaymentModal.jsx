import React, { useState } from 'react';
import { DollarSign, CreditCard, Printer, CheckCircle, X } from 'lucide-react';
import ThermalReceipt from '../Receipt/ThermalReceipt';

export default function PaymentModal({ order, settings, onClose, onCompleteOrder }) {
  const currency = settings.currency_symbol || '$';
  const total = Number(order.total_amount || 0);

  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [tendered, setTendered] = useState(total);
  const [isPaid, setIsPaid] = useState(false);
  const [completedOrderData, setCompletedOrderData] = useState(null);

  const changeDue = Math.max(0, Number(tendered || 0) - total);

  const quickTenders = [
    Math.ceil(total),
    Math.ceil(total / 5) * 5 || 5,
    Math.ceil(total / 10) * 10 || 10,
    20,
    50,
    100
  ].filter((v, idx, self) => v >= total && self.indexOf(v) === idx).slice(0, 5);

  const handleConfirmPayment = async () => {
    const finalOrderPayload = {
      ...order,
      payment_method: paymentMethod,
      tendered_amount: paymentMethod === 'Cash' ? Number(tendered) : total,
      change_amount: paymentMethod === 'Cash' ? changeDue : 0,
    };

    const savedOrder = await onCompleteOrder(finalOrderPayload);
    setCompletedOrderData(savedOrder || finalOrderPayload);
    setIsPaid(true);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: isPaid ? '440px' : '520px' }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
          <h3 style={{ color: '#f8fafc', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isPaid ? <CheckCircle color="#10b981" size={22} /> : <DollarSign color="#2563eb" size={22} />}
            {isPaid ? 'Payment Complete' : 'Process Checkout'}
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', color: '#94a3b8' }}>
            <X size={20} />
          </button>
        </div>

        {!isPaid ? (
          <div>
            {/* Amount Summary */}
            <div style={{ background: '#0f172a', padding: '16px', borderRadius: '10px', textAlignment: 'center', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ color: '#94a3b8', fontSize: '13px', textTransform: 'uppercase' }}>Total Amount Due</div>
              <div style={{ color: '#10b981', fontSize: '32px', fontWeight: '800', marginTop: '4px' }}>
                {currency}{total.toFixed(2)}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>
                PAYMENT METHOD
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  onClick={() => setPaymentMethod('Cash')}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: paymentMethod === 'Cash' ? '#2563eb' : '#1e293b',
                    color: '#fff',
                    border: '1px solid ' + (paymentMethod === 'Cash' ? '#2563eb' : '#334155'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '15px'
                  }}
                >
                  <DollarSign size={18} /> Cash
                </button>

                <button
                  onClick={() => setPaymentMethod('Card')}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: paymentMethod === 'Card' ? '#2563eb' : '#1e293b',
                    color: '#fff',
                    border: '1px solid ' + (paymentMethod === 'Card' ? '#2563eb' : '#334155'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '15px'
                  }}
                >
                  <CreditCard size={18} /> Credit/Debit Card
                </button>
              </div>
            </div>

            {/* Cash Tender Calculation */}
            {paymentMethod === 'Cash' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>
                  TENDERED AMOUNT ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  style={{ fontSize: '20px', fontWeight: '700', textAlignment: 'right', padding: '12px' }}
                />

                {/* Quick Tender Buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setTendered(total)}
                    style={{ background: '#334155', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}
                  >
                    Exact ({currency}{total.toFixed(2)})
                  </button>
                  {quickTenders.map(val => (
                    <button
                      key={val}
                      onClick={() => setTendered(val)}
                      style={{ background: '#334155', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}
                    >
                      {currency}{val}
                    </button>
                  ))}
                </div>

                {/* Change Calculation Box */}
                <div style={{ marginTop: '16px', background: '#0f172a', padding: '12px 16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontWeight: '600' }}>CHANGE DUE:</span>
                  <span style={{ color: '#f59e0b', fontSize: '24px', fontWeight: '800' }}>
                    {currency}{changeDue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Confirm Payment Action */}
            <button
              onClick={handleConfirmPayment}
              disabled={paymentMethod === 'Cash' && Number(tendered) < total}
              style={{
                width: '100%',
                padding: '16px',
                background: (paymentMethod === 'Cash' && Number(tendered) < total) ? '#475569' : '#10b981',
                color: '#fff',
                borderRadius: '8px',
                fontSize: '18px',
                fontWeight: '700',
                marginTop: '10px'
              }}
            >
              Complete Sale & Save Order
            </button>
          </div>
        ) : (
          /* Post Payment Success & Thermal Receipt View */
          <div>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ color: '#10b981', fontSize: '20px', fontWeight: '700' }}>Order #{completedOrderData?.receipt_no}</div>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Transaction saved locally and queued for print</div>
            </div>

            {/* Thermal Receipt Preview Box */}
            <div style={{ background: '#fff', color: '#000', padding: '16px', borderRadius: '8px', maxHeight: '320px', overflowY: 'auto', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
              <ThermalReceipt order={completedOrderData} settings={settings} />
            </div>

            {/* Print & Finish Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handlePrintReceipt}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#2563eb',
                  color: '#fff',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '15px'
                }}
              >
                <Printer size={20} /> Print 3-Inch Receipt
              </button>

              <button
                onClick={onClose}
                style={{
                  padding: '14px 20px',
                  background: '#10b981',
                  color: '#fff',
                  borderRadius: '8px',
                  fontSize: '15px'
                }}
              >
                Next Order
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
