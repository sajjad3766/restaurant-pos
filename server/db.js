import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbPath = path.join(__dirname, 'pos_database.db');
if (process.env.VERCEL) {
  dbPath = path.join('/tmp', 'pos_database.db');
  const sourceDb = path.join(__dirname, 'pos_database.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(sourceDb)) {
    try {
      fs.copyFileSync(sourceDb, dbPath);
    } catch (e) {
      console.warn('Could not copy source db to /tmp, will initialize fresh db:', e.message);
    }
  }
}

const sqliteVerbose = sqlite3.verbose();
const dbInstance = new sqliteVerbose.Database(dbPath);

// Helper promise wrappers for sqlite3
export const db = {
  exec(sql) {
    return new Promise((resolve, reject) => {
      dbInstance.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      dbInstance.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      dbInstance.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      dbInstance.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
};

export async function initDatabase() {
  console.log('[SQLite DB] Initializing database at:', dbPath);

  // 1. Categories
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'Utensils',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Products
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      image_url TEXT,
      description TEXT,
      stock_qty INTEGER DEFAULT 999,
      is_available INTEGER DEFAULT 1,
      is_deal INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure is_deal column exists for existing installations
  try {
    await db.exec(`ALTER TABLE products ADD COLUMN is_deal INTEGER DEFAULT 0;`);
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // 2.1 Deal Items (for Hot Deals / Combo Bundles)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS deal_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deal_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // 3. Tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT NOT NULL UNIQUE,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      current_order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Orders
  await db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT NOT NULL UNIQUE,
      order_type TEXT NOT NULL,
      table_id INTEGER,
      table_name TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      subtotal REAL NOT NULL,
      tax_percent REAL DEFAULT 0.0,
      tax_amount REAL DEFAULT 0.0,
      discount_amount REAL DEFAULT 0.0,
      discount_type TEXT DEFAULT 'fixed',
      total_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'Cash',
      tendered_amount REAL DEFAULT 0.0,
      change_amount REAL DEFAULT 0.0,
      status TEXT DEFAULT 'Completed',
      notes TEXT,
      synced INTEGER DEFAULT 0,
      synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5. Order Items
  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      notes TEXT
    );
  `);

  // 6. Settings
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // 7. Sync Logs
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      records_synced INTEGER DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 8. Users & Authentication
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default admin and operator if users table is empty
  const existingUsers = await db.get('SELECT COUNT(*) as count FROM users');
  if (!existingUsers || existingUsers.count === 0) {
    await db.run('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [
      'admin',
      'admin123',
      'System Admin',
      'admin'
    ]);
    await db.run('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [
      'operator',
      '1234',
      'POS Operator',
      'operator'
    ]);
    await db.run('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [
      'cashier',
      '1234',
      'Main Cashier',
      'operator'
    ]);
    console.log('[SQLite DB] Seeded default Admin and Operator accounts.');
  }

  // Seed default settings if empty
  const existingSettings = await db.get('SELECT COUNT(*) as count FROM settings');
  if (existingSettings && existingSettings.count === 0) {
    const defaultSettings = [
      ['restaurant_name', 'The Gourmet Bistro'],
      ['restaurant_address', '123 Foodie Street, Flavor Town'],
      ['restaurant_phone', '+1 (555) 019-2834'],
      ['tax_percent', '5.0'],
      ['currency_symbol', '$'],
      ['receipt_footer', 'Thank you for dining with us! Please come again.'],
      ['cloud_sync_enabled', 'true'],
      ['cloud_api_url', 'https://restaurant-pos-five-green.vercel.app/api/sync/receive'],
      ['cloud_api_key', 'pos_sync_secure_key']
    ];
    for (const [key, value] of defaultSettings) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  } else {
    // Update cloud sync URL to live Vercel link
    await db.run("UPDATE settings SET value = 'https://restaurant-pos-five-green.vercel.app/api/sync/receive' WHERE key = 'cloud_api_url' AND (value LIKE '%localhost%' OR value = '')");
    await db.run("UPDATE settings SET value = 'true' WHERE key = 'cloud_sync_enabled' AND value = 'false'");
  }

  // Seed default categories & products if empty
  const categoryCount = await db.get('SELECT COUNT(*) as count FROM categories');
  if (categoryCount && categoryCount.count === 0) {
    const catHotDeals = (await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', ['Hot Deals', 'Flame'])).lastID;
    const catBurgers = (await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', ['Burgers', 'Beef'])).lastID;
    const catColdDrinks = (await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', ['Cold Drinks', 'GlassWater'])).lastID;
    const catPizza = (await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', ['Pizza', 'Pizza'])).lastID;
    const catHotDrinks = (await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', ['Hot Drinks', 'Coffee'])).lastID;
    const catDesserts = (await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', ['Desserts', 'Cake'])).lastID;
    const catBBQ = (await db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', ['BarBQ', 'Flame'])).lastID;

    // Seed products
    const insertProd = async (catId, name, price, img, desc, isDeal = 0) => {
      const res = await db.run('INSERT INTO products (category_id, name, price, image_url, description, is_deal) VALUES (?, ?, ?, ?, ?, ?)', [catId, name, price, img, desc, isDeal]);
      return res.lastID;
    };

    const prodBurger1 = await insertProd(catBurgers, 'Classic Cheese Burger', 8.99, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', 'Juicy beef patty with cheddar cheese & fresh lettuce');
    const prodBurger2 = await insertProd(catBurgers, 'Double Bacon Burger', 11.49, 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400', 'Double beef patty, crispy bacon & house sauce');
    const prodBurger3 = await insertProd(catBurgers, 'Zesty Chicken Burger', 9.49, 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=400', 'Crispy fried chicken breast with garlic mayo');

    const prodDrink1 = await insertProd(catColdDrinks, 'Mint Margarita', 3.99, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400', 'Refreshing mint & lemon crushed ice blend');
    const prodDrink2 = await insertProd(catColdDrinks, 'Iced Latte', 4.50, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400', 'Espresso shot over cold milk & ice');
    const prodDrink3 = await insertProd(catColdDrinks, 'Cold Brew Coffee', 4.99, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400', 'Slow brewed 18-hour cold coffee');

    const prodPizza1 = await insertProd(catPizza, 'Cheezy Tikka Small', 9.99, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400', 'Chicken tikka, mozzarella cheese & oregano');
    const prodPizza2 = await insertProd(catPizza, 'Cheezy Tikka Large', 16.99, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400', 'Large chicken tikka pizza with extra cheese');
    const prodPizza3 = await insertProd(catPizza, 'Pepperoni Feast', 14.99, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400', 'Loads of beef pepperoni & melted mozzarella');

    await insertProd(catHotDrinks, 'Espresso Single', 2.99, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400', 'Rich single shot espresso');
    await insertProd(catHotDrinks, 'Cappuccino', 4.25, 'https://images.unsplash.com/photo-1572442388796-1166860209f2?w=400', 'Steamed milk with rich espresso foam');

    await insertProd(catDesserts, 'Chocolate Lava Cake', 6.49, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400', 'Warm chocolate cake with molten center');
    const prodRibs = await insertProd(catBBQ, 'Grilled BBQ Ribs', 18.99, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400', 'Tender smoky ribs with glazed BBQ sauce');

    // Seed Initial Sample Hot Deals
    const deal1Id = await insertProd(catHotDeals, 'Burger & Drink Duo Deal', 18.99, 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400', '2x Classic Cheese Burger + 2x Mint Margaritas (Save $6.97)', 1);
    await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [deal1Id, prodBurger1, 2]);
    await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [deal1Id, prodDrink1, 2]);

    const deal2Id = await insertProd(catHotDeals, 'Mega Family Feast Pizza & BBQ', 29.99, 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400', '1x Cheezy Tikka Large + 1x Grilled BBQ Ribs (Save $5.99)', 1);
    await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [deal2Id, prodPizza2, 1]);
    await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [deal2Id, prodRibs, 1]);
  } else {
    // If categories already exist, ensure 'Hot Deals' category exists
    let hotDealsCategory = await db.get("SELECT * FROM categories WHERE name = 'Hot Deals'");
    if (!hotDealsCategory) {
      const res = await db.run("INSERT INTO categories (name, icon) VALUES (?, ?)", ['Hot Deals', 'Flame']);
      hotDealsCategory = { id: res.lastID, name: 'Hot Deals', icon: 'Flame' };
    }

    // Seed sample deals if no deals exist yet
    const dealsCount = await db.get('SELECT COUNT(*) as count FROM products WHERE is_deal = 1 OR category_id = ?', [hotDealsCategory.id]);
    if (dealsCount && dealsCount.count === 0) {
      const burgers = await db.query("SELECT * FROM products WHERE is_deal = 0 LIMIT 4");
      if (burgers.length >= 2) {
        const dealId = (await db.run(
          'INSERT INTO products (category_id, name, price, image_url, description, is_deal) VALUES (?, ?, ?, ?, ?, 1)',
          [hotDealsCategory.id, 'Combo Feast Deal', 19.99, 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400', `Combo Deal includes ${burgers[0].name} & ${burgers[1].name}`]
        )).lastID;
        await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [dealId, burgers[0].id, 1]);
        await db.run('INSERT INTO deal_items (deal_id, product_id, quantity) VALUES (?, ?, ?)', [dealId, burgers[1].id, 1]);
      }
    }
  }

  // Seed default tables if empty
  const tableCount = await db.get('SELECT COUNT(*) as count FROM tables');
  if (tableCount && tableCount.count === 0) {
    for (let i = 1; i <= 10; i++) {
      await db.run('INSERT INTO tables (table_number, capacity) VALUES (?, ?)', [`T-${i}`, i % 2 === 0 ? 4 : 2]);
    }
  }

  console.log('[SQLite DB] Database initialization complete!');
}

export default db;
