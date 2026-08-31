import React from 'react';

export default function ThermalReceipt({ order, settings = {} }) {
  if (!order) return null;

  const restaurantName = settings.restaurant_name || 'The Gourmet Bistro';
  const restaurantAddress = settings.restaurant_address || '123 Foodie Street, Flavor Town';
  const restaurantPhone = settings.restaurant_phone || '+1 (555) 019-2834';
  const currency = settings.currency_symbol || '$';
  const footerText = settings.receipt_footer || 'Thank you for dining with us! Please come again.';

  const formattedDate = new Date(order.created_at || Date.now()).toLocaleString();

  return (
    <div id="thermal-receipt-print-area" className="thermal-receipt-wrapper">
      <style>{`
        .receipt-header { text-align: center; margin-bottom: 8px; }
        .receipt-title { font-size: 15px; font-weight: 800; text-transform: uppercase; }
        .receipt-sub { font-size: 10px; margin-top: 2px; }
        .receipt-divider { border-top: 1px dashed #000; margin: 6px 0; }
        .receipt-meta { font-size: 11px; margin-bottom: 6px; }
        .receipt-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .receipt-table th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 3px; }
        .receipt-table td { padding: 3px 0; vertical-align: top; }
        .receipt-totals { width: 100%; margin-top: 6px; font-size: 11px; }
        .receipt-totals td { padding: 2px 0; }
        .grand-total { font-size: 14px; font-weight: bold; border-top: 1px solid #000; border-bottom: 1px dashed #000; }
        .receipt-footer { text-align: center; font-size: 10px; margin-top: 10px; }
      `}</style>

      {/* Header */}
      <div className="receipt-header">
        <div className="receipt-title">{restaurantName}</div>
        <div className="receipt-sub">{restaurantAddress}</div>
        <div className="receipt-sub">TEL: {restaurantPhone}</div>
      </div>

      <div className="receipt-divider" />

      {/* Order Meta */}
      <div className="receipt-meta">
        <div><strong>RECEIPT #:</strong> {order.receipt_no || `REC-${order.id}`}</div>
        <div><strong>DATE:</strong> {formattedDate}</div>
        <div><strong>ORDER TYPE:</strong> {order.order_type || 'Take Away'}</div>
        {order.table_name && <div><strong>TABLE #:</strong> {order.table_name}</div>}
        {order.customer_name && <div><strong>CUSTOMER:</strong> {order.customer_name} ({order.customer_phone || 'N/A'})</div>}
      </div>

      <div className="receipt-divider" />

      {/* Items Table */}
      <table className="receipt-table">
        <thead>
          <tr>
            <th style={{ width: '12%' }}>QTY</th>
            <th style={{ width: '58%' }}>ITEM</th>
            <th style={{ width: '30%', textAlign: 'right' }}>PRICE</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((item, idx) => (
            <tr key={idx}>
              <td>{item.quantity}x</td>
              <td>
                {item.product_name || item.name}
                {item.notes && <div style={{ fontSize: '9px', fontStyle: 'italic' }}>({item.notes})</div>}
              </td>
              <td style={{ textAlign: 'right' }}>{currency}{(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="receipt-divider" />

      {/* Totals */}
      <table className="receipt-totals">
        <tbody>
          <tr>
            <td>SUBTOTAL:</td>
            <td style={{ textAlign: 'right' }}>{currency}{Number(order.subtotal || 0).toFixed(2)}</td>
          </tr>
          {Number(order.tax_amount || 0) > 0 && (
            <tr>
              <td>TAX ({order.tax_percent}%):</td>
              <td style={{ textAlign: 'right' }}>{currency}{Number(order.tax_amount).toFixed(2)}</td>
            </tr>
          )}
          {Number(order.discount_amount || 0) > 0 && (
            <tr>
              <td>DISCOUNT:</td>
              <td style={{ textAlign: 'right' }}>-{currency}{Number(order.discount_amount).toFixed(2)}</td>
            </tr>
          )}
          <tr className="grand-total">
            <td style={{ padding: '4px 0' }}>TOTAL AMOUNT:</td>
            <td style={{ textAlign: 'right', padding: '4px 0' }}>{currency}{Number(order.total_amount || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style={{ paddingTop: '4px' }}>PAYMENT METHOD:</td>
            <td style={{ textAlign: 'right', paddingTop: '4px' }}>{order.payment_method || 'Cash'}</td>
          </tr>
          {order.payment_method === 'Cash' && (
            <>
              <tr>
                <td>TENDERED:</td>
                <td style={{ textAlign: 'right' }}>{currency}{Number(order.tendered_amount || order.total_amount).toFixed(2)}</td>
              </tr>
              <tr>
                <td>CHANGE DUE:</td>
                <td style={{ textAlign: 'right' }}>{currency}{Number(order.change_amount || 0).toFixed(2)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <div className="receipt-divider" />

      {/* Footer */}
      <div className="receipt-footer">
        <div>{footerText}</div>
        <div style={{ marginTop: '4px', fontSize: '8px' }}>*** POWERED BY RESTAURANT POS (OFFLINE POS) ***</div>
      </div>
    </div>
  );
}
