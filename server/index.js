import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase } from './db.js';
import { performCloudSync, getSyncStatusOverview, startSyncBackgroundWorker } from './syncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create uploads directory:', e.message);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use('/uploads', express.static(uploadsDir));

// Ensure database initialization
let isDbReady = false;
let initDbPromise = null;
async function ensureDbReady() {
  if (!isDbReady) {
    if (!initDbPromise) {
      initDbPromise = initDatabase().then(() => {
        isDbReady = true;
      }).catch(err => {
        console.error('Database initialization error:', err);
      });
    }
    await initDbPromise;
  }
}

// Middleware to ensure DB schema is ready for all API requests
app.use(async (req, res, next) => {
  await ensureDbReady();
  next();
});

// Start background sync worker if not in serverless mode
if (!process.env.VERCEL) {
  startSyncBackgroundWorker();
}

// ----------------------------------------------------
// 0. IMAGE UPLOAD ENDPOINT (BROWSE PC & SAVE OFFLINE)
// ----------------------------------------------------
app.post('/api/upload', async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) return res.status(400).json({ error: 'No image data provided' });

    // Extract base64 payload
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image format. Expected Base64 data URL.' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('jpeg')) ext = 'jpg';

    const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${safeName}`;
    res.json({ url: fileUrl, filename: safeName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 1. CATEGORIES ENDPOINTS
// ----------------------------------------------------
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.query('SELECT * FROM categories ORDER BY id ASC');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const info = await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', [name, icon || 'Utensils']);
    const newCat = await db.get('SELECT * FROM categories WHERE id = ?', [info.lastID]);
    res.status(201).json(newCat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, icon } = req.body;
    await db.run('UPDATE categories SET name = ?, icon = ? WHERE id = ?', [name, icon, req.params.id]);
    const updated = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 2. PRODUCTS & HOT DEALS ENDPOINTS
// ----------------------------------------------------
app.get('/api/products', async (req, res) => {
  try {
    const { category_id } = req.query;
    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id';
    let params = [];
    if (category_id && category_id !== 'all') {
      query += ' WHERE p.category_id = ?';
      params.push(category_id);
    }
    query += ' ORDER BY p.is_deal DESC, p.id DESC';
    const products = await db.query(query, params);

    // Attach deal_items for products that are combo deals
    const fullProducts = await Promise.all(products.map(async (prod) => {
      if (prod.is_deal || prod.category_name === 'Hot Deals') {
        const dealItems = await db.query(`
          SELECT di.*, p.name as product_name, p.price as original_price, p.image_url as product_image
          FROM deal_items di
          JOIN products p ON di.product_id = p.id
          WHERE di.deal_id = ?
        `, [prod.id]);
        return { ...prod, is_deal: 1, deal_items: dealItems || [] };
      }
      return { ...prod, is_deal: prod.is_deal || 0, deal_items: [] };
    }));

    res.json(fullProducts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { category_id, name, price, image_url, description, stock_qty, is_deal, deal_items } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Name and price are required' });

    const isDealVal = (is_deal || (deal_items && deal_items.length > 0)) ? 1 : 0;

    const info = await db.run(`
      INSERT INTO products (category_id, name, price, image_url, description, stock_qty, is_deal)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [category_id || null, name, price, image_url || null, description || null, stock_qty ?? 999, isDealVal]);

    const newProdId = info.lastID;

    // Save bundle deal items if provided
    if (deal_items && Array.isArray(deal_items) && deal_items.length > 0) {
      for (const item of deal_items) {
        if (item.product_id) {
          await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [
            newProdId,
            item.product_id,
            Number(item.quantity) || 1
          ]);
        }
      }
    }

    const newProd = await db.get('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?', [newProdId]);
    const attachedDealItems = await db.query(`
      SELECT di.*, p.name as product_name, p.price as original_price
      FROM deal_items di
      JOIN products p ON di.product_id = p.id
      WHERE di.deal_id = ?
    `, [newProdId]);

    res.status(201).json({ ...newProd, deal_items: attachedDealItems || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { category_id, name, price, image_url, description, stock_qty, is_available, is_deal, deal_items } = req.body;
    const isDealVal = (is_deal || (deal_items && deal_items.length > 0)) ? 1 : 0;

    await db.run(`
      UPDATE products
      SET category_id = ?, name = ?, price = ?, image_url = ?, description = ?, stock_qty = ?, is_available = ?, is_deal = ?
      WHERE id = ?
    `, [category_id || null, name, price, image_url || null, description || null, stock_qty ?? 999, is_available ?? 1, isDealVal, req.params.id]);

    // Sync deal items if provided
    if (deal_items !== undefined) {
      await db.run('DELETE FROM deal_items WHERE deal_id = ?', [req.params.id]);
      if (Array.isArray(deal_items) && deal_items.length > 0) {
        for (const item of deal_items) {
          if (item.product_id) {
            await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [
              req.params.id,
              item.product_id,
              Number(item.quantity) || 1
            ]);
          }
        }
      }
    }

    const updated = await db.get('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?', [req.params.id]);
    const attachedDealItems = await db.query(`
      SELECT di.*, p.name as product_name, p.price as original_price
      FROM deal_items di
      JOIN products p ON di.product_id = p.id
      WHERE di.deal_id = ?
    `, [req.params.id]);

    res.json({ ...updated, deal_items: attachedDealItems || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM deal_items WHERE deal_id = ? OR product_id = ?', [req.params.id, req.params.id]);
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 3. TABLES ENDPOINTS
// ----------------------------------------------------
app.get('/api/tables', async (req, res) => {
  try {
    const tables = await db.query('SELECT * FROM tables ORDER BY id ASC');
    const liveTables = await Promise.all(tables.map(async (t) => {
      let activeOrder = null;
      if (t.current_order_id) {
        activeOrder = await db.get('SELECT * FROM orders WHERE id = ?', [t.current_order_id]);
        if (activeOrder) {
          activeOrder.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [t.current_order_id]);
        }
      }
      return { ...t, activeOrder };
    }));
    res.json(liveTables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tables', async (req, res) => {
  try {
    const { table_number, capacity } = req.body;
    const info = await db.run('INSERT INTO tables (table_number, capacity) VALUES (?, ?)', [table_number, capacity || 4]);
    const newTable = await db.get('SELECT * FROM tables WHERE id = ?', [info.lastID]);
    res.status(201).json(newTable);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tables/:id/status', async (req, res) => {
  try {
    const { status, current_order_id } = req.body;
    await db.run('UPDATE tables SET status = ?, current_order_id = ? WHERE id = ?', [status, current_order_id || null, req.params.id]);
    const updated = await db.get('SELECT * FROM tables WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tables/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM tables WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 4. ORDERS ENDPOINTS (ITEM-ATTACHED ORDERS)
// ----------------------------------------------------
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await db.query('SELECT * FROM orders ORDER BY id DESC LIMIT 150');
    const fullOrders = await Promise.all(orders.map(async (o) => {
      const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      return { ...o, items };
    }));
    res.json(fullOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const {
      order_type,
      table_id,
      table_name,
      customer_name,
      customer_phone,
      items,
      subtotal,
      tax_percent,
      tax_amount,
      discount_amount,
      discount_type,
      total_amount,
      payment_method,
      tendered_amount,
      change_amount,
      notes,
      status,
      keep_table_booked
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const orderStatus = status || 'Completed';

    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const countRow = await db.get("SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now')");
    const countToday = countRow?.count || 0;
    const receipt_no = `REC-${dateStr}-${String(countToday + 1).padStart(4, '0')}`;

    const orderInfo = await db.run(`
      INSERT INTO orders (
        receipt_no, order_type, table_id, table_name, customer_name, customer_phone,
        subtotal, tax_percent, tax_amount, discount_amount, discount_type, total_amount,
        payment_method, tendered_amount, change_amount, status, notes, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      receipt_no,
      order_type || 'Take Away',
      table_id || null,
      table_name || null,
      customer_name || null,
      customer_phone || null,
      subtotal,
      tax_percent || 0,
      tax_amount || 0,
      discount_amount || 0,
      discount_type || 'fixed',
      total_amount,
      payment_method || 'Cash',
      tendered_amount || total_amount,
      change_amount || 0,
      orderStatus,
      notes || null
    ]);

    const orderId = orderInfo.lastID;

    for (const item of items) {
      await db.run(`
        INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId,
        item.product_id || item.id,
        item.name || item.product_name,
        item.price,
        item.quantity,
        item.price * item.quantity,
        item.notes || null
      ]);

      if (item.product_id || item.id) {
        await db.run('UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?', [item.quantity, item.product_id || item.id]);
      }
    }

    if (table_id) {
      const shouldKeepBooked = orderStatus === 'Pending' || keep_table_booked === true || order_type === 'Dine In';
      const tableStatus = shouldKeepBooked ? 'occupied' : 'available';
      const activeOrderId = shouldKeepBooked ? orderId : null;
      await db.run("UPDATE tables SET status = ?, current_order_id = ? WHERE id = ?", [tableStatus, activeOrderId, table_id]);
    }

    performCloudSync().catch(() => {});

    const createdOrder = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    createdOrder.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    res.status(201).json(createdOrder);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { items, subtotal, tax_percent, tax_amount, discount_amount, total_amount, notes } = req.body;

    const existingOrder = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!existingOrder) return res.status(404).json({ error: 'Order not found' });

    const oldItems = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    for (const oldItem of oldItems) {
      if (oldItem.product_id) {
        await db.run('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [oldItem.quantity, oldItem.product_id]);
      }
    }

    await db.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);

    for (const item of items) {
      await db.run(`
        INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId,
        item.product_id || item.id,
        item.name || item.product_name,
        item.price,
        item.quantity,
        item.price * item.quantity,
        item.notes || null
      ]);

      if (item.product_id || item.id) {
        await db.run('UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?', [item.quantity, item.product_id || item.id]);
      }
    }

    await db.run(`
      UPDATE orders
      SET subtotal = ?, tax_percent = ?, tax_amount = ?, discount_amount = ?, total_amount = ?, notes = ?, synced = 0
      WHERE id = ?
    `, [subtotal, tax_percent || 0, tax_amount || 0, discount_amount || 0, total_amount, notes || null, orderId]);

    performCloudSync().catch(() => {});

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    updatedOrder.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    res.json({ success: true, message: `Order #${existingOrder.receipt_no} updated successfully!`, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN ACTIONS: CANCEL, REVERSE, REFUND, COMPLETE
app.put('/api/orders/:id/action', async (req, res) => {
  try {
    const { action } = req.body;
    const orderId = req.params.id;

    const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let newStatus = order.status;

    if (action === 'cancel') {
      newStatus = 'Cancelled';
    } else if (action === 'reverse') {
      newStatus = 'Reversed';
    } else if (action === 'refund') {
      newStatus = 'Refunded';
    } else if (action === 'complete') {
      newStatus = 'Completed';
    }

    await db.run('UPDATE orders SET status = ?, synced = 0 WHERE id = ?', [newStatus, orderId]);

    if (['Cancelled', 'Reversed', 'Refunded', 'Completed'].includes(newStatus)) {
      if (['Cancelled', 'Reversed', 'Refunded'].includes(newStatus)) {
        const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        for (const item of items) {
          if (item.product_id) {
            await db.run('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [item.quantity, item.product_id]);
          }
        }
      }

      if (order.table_id) {
        await db.run("UPDATE tables SET status = 'available', current_order_id = NULL WHERE id = ?", [order.table_id]);
      }
    }

    performCloudSync().catch(() => {});

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    updatedOrder.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    res.json({ success: true, order: updatedOrder, message: `Order #${order.receipt_no} has been ${newStatus.toLowerCase()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. DASHBOARD & REPORTS ENDPOINT (WITH ITEMS ATTACHED)
// ----------------------------------------------------
app.get('/api/reports/dashboard', async (req, res) => {
  try {
    const todaySalesRow = await db.get("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE date(created_at) = date('now') AND status = 'Completed'");
    const todayOrdersRow = await db.get("SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now') AND status = 'Completed'");
    const totalSalesRow = await db.get("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'Completed'");
    const totalOrdersRow = await db.get("SELECT COUNT(*) as count FROM orders WHERE status = 'Completed'");

    const todaySales = todaySalesRow?.total || 0;
    const todayOrders = todayOrdersRow?.count || 0;
    const totalSales = totalSalesRow?.total || 0;
    const totalOrdersCount = totalOrdersRow?.count || 0;
    const avgBill = todayOrders > 0 ? (todaySales / todayOrders) : 0;

    const salesByType = await db.query(`
      SELECT order_type, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
      FROM orders WHERE status = 'Completed'
      GROUP BY order_type
    `);

    const topProducts = await db.query(`
      SELECT product_name, SUM(quantity) as total_qty, SUM(subtotal) as total_revenue
      FROM order_items
      GROUP BY product_name
      ORDER BY total_qty DESC LIMIT 5
    `);

    // Fetch recent orders AND ATTACH ITEMS TO EVERY ORDER
    const recentOrdersRaw = await db.query('SELECT * FROM orders ORDER BY id DESC LIMIT 20');
    const recentOrders = await Promise.all(recentOrdersRaw.map(async (o) => {
      const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      return { ...o, items };
    }));

    res.json({
      todaySales,
      todayOrders,
      totalSales,
      totalOrdersCount,
      avgBill,
      salesByType,
      topProducts,
      recentOrders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 6. SETTINGS ENDPOINTS
// ----------------------------------------------------
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.query('SELECT key, value FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settingsObj = req.body;
    for (const [k, v] of Object.entries(settingsObj)) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, String(v)]);
    }
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 7. SYNC STATUS & TRIGGER ENDPOINTS
// ----------------------------------------------------
app.get('/api/sync/status', async (req, res) => {
  try {
    const status = await getSyncStatusOverview();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/trigger', async (req, res) => {
  try {
    const result = await performCloudSync();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cloud Sync Receiver (Stores incoming sync orders from offline desktop POS into cloud database)
app.post(['/api/sync/receive', '/api/mock-cloud-sync'], async (req, res) => {
  try {
    const { orders } = req.body;
    let savedCount = 0;

    if (orders && Array.isArray(orders)) {
      for (const ord of orders) {
        // Check if receipt already exists in database
        const existing = await db.get('SELECT id FROM orders WHERE receipt_no = ?', [ord.receipt_no]);
        if (!existing) {
          const info = await db.run(`
            INSERT INTO orders (
              receipt_no, order_type, table_id, table_name, customer_name, customer_phone,
              subtotal, tax_percent, tax_amount, discount_amount, discount_type, total_amount,
              payment_method, tendered_amount, change_amount, status, notes, synced, synced_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)
          `, [
            ord.receipt_no,
            ord.order_type || 'Take Away',
            ord.table_id || null,
            ord.table_name || null,
            ord.customer_name || null,
            ord.customer_phone || null,
            ord.subtotal,
            ord.tax_percent || 0,
            ord.tax_amount || 0,
            ord.discount_amount || 0,
            ord.discount_type || 'fixed',
            ord.total_amount,
            ord.payment_method || 'Cash',
            ord.tendered_amount || ord.total_amount,
            ord.change_amount || 0,
            ord.status || 'Completed',
            ord.notes || null,
            ord.created_at || new Date().toISOString()
          ]);

          const orderId = info.lastID;

          if (ord.items && Array.isArray(ord.items)) {
            for (const item of ord.items) {
              await db.run(`
                INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [
                orderId,
                item.product_id || null,
                item.product_name || item.name,
                item.price,
                item.quantity,
                item.subtotal || (item.price * item.quantity),
                item.notes || null
              ]);
            }
          }
          savedCount++;
        }
      }
    }

    console.log(`[CLOUD RECEIVER] Processed ${orders?.length || 0} orders, saved ${savedCount} new orders to cloud DB.`);

    res.json({
      success: true,
      status: 'ACK',
      receivedCount: orders ? orders.length : 0,
      savedCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback JSON 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Serve frontend production build if available
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Start Express Server locally
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`   Restaurant POS Backend running at http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

export default app;
