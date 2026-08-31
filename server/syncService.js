import db from './db.js';

let isSyncing = false;

// Helper to check network connectivity
async function isOnline() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('https://1.1.1.1', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok || response.status === 405 || response.status === 200;
  } catch (err) {
    return false;
  }
}

// Function to perform cloud data push
export async function performCloudSync() {
  if (isSyncing) return { status: 'already_syncing' };
  isSyncing = true;

  try {
    // 1. Fetch Cloud Settings
    const settingsRows = await db.query("SELECT key, value FROM settings WHERE key IN ('cloud_sync_enabled', 'cloud_api_url', 'cloud_api_key')");
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    const enabled = settings.cloud_sync_enabled === 'true';
    const apiUrl = settings.cloud_api_url;
    const apiKey = settings.cloud_api_key;

    // 2. Check Internet status
    const online = await isOnline();

    if (!online) {
      isSyncing = false;
      return { status: 'offline', message: 'No internet connection available.' };
    }

    if (!enabled || !apiUrl) {
      isSyncing = false;
      return { status: 'disabled', message: 'Cloud sync is currently disabled or URL is not set.' };
    }

    // 3. Fetch unsynced orders
    const unsyncedOrders = await db.query("SELECT * FROM orders WHERE synced = 0 LIMIT 50");

    if (unsyncedOrders.length === 0) {
      isSyncing = false;
      return { status: 'up_to_date', message: 'All local records are synced to the cloud.' };
    }

    // Attach order items to each order
    const payload = await Promise.all(unsyncedOrders.map(async (order) => {
      const items = await db.query("SELECT * FROM order_items WHERE order_id = ?", [order.id]);
      return { ...order, items };
    }));

    console.log(`[Cloud Sync Engine] Attempting to sync ${payload.length} orders to ${apiUrl}...`);

    // 4. Send payload to online cloud server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || 'pos_sync_key'}`,
        'X-POS-Terminal-ID': 'POS-LOCAL-01'
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        orders: payload
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      // 5. Update synced status in local database
      const now = new Date().toISOString();
      for (const o of unsyncedOrders) {
        await db.run("UPDATE orders SET synced = 1, synced_at = ? WHERE id = ?", [now, o.id]);
      }

      // Log success
      await db.run("INSERT INTO sync_logs (status, records_synced, error_message) VALUES (?, ?, ?)", ['success', unsyncedOrders.length, null]);

      console.log(`[Cloud Sync Engine] Successfully synced ${unsyncedOrders.length} orders to cloud.`);
      isSyncing = false;
      return { status: 'success', syncedCount: unsyncedOrders.length };
    } else {
      const errText = await response.text();
      await db.run("INSERT INTO sync_logs (status, records_synced, error_message) VALUES (?, ?, ?)", ['error', 0, `HTTP ${response.status}: ${errText.slice(0, 200)}`]);
      isSyncing = false;
      return { status: 'error', message: `Server returned HTTP ${response.status}` };
    }
  } catch (err) {
    await db.run("INSERT INTO sync_logs (status, records_synced, error_message) VALUES (?, ?, ?)", ['error', 0, err.message]);
    console.error('[Cloud Sync Engine] Sync failed:', err.message);
    isSyncing = false;
    return { status: 'error', message: err.message };
  }
}

// Get full sync status overview
export async function getSyncStatusOverview() {
  const online = await isOnline();
  const unsynced = await db.get("SELECT COUNT(*) as count FROM orders WHERE synced = 0");
  const total = await db.get("SELECT COUNT(*) as count FROM orders");
  const lastSyncLog = await db.get("SELECT * FROM sync_logs ORDER BY id DESC LIMIT 1");
  
  const settingsRows = await db.query("SELECT key, value FROM settings WHERE key IN ('cloud_sync_enabled', 'cloud_api_url')");
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });

  return {
    isOnline: online,
    isSyncing,
    unsyncedCount: unsynced?.count || 0,
    totalOrders: total?.count || 0,
    cloudSyncEnabled: settings.cloud_sync_enabled === 'true',
    cloudApiUrl: settings.cloud_api_url || '',
    lastSync: lastSyncLog || null
  };
}

// Start background cron timer (every 30 seconds)
export function startSyncBackgroundWorker() {
  console.log('[Cloud Sync Worker] Started background timer (every 30s)...');
  setInterval(() => {
    performCloudSync().catch(err => console.error('[Background Sync Worker] Error:', err.message));
  }, 30000);
}
