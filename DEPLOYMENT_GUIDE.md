# Complete Client Delivery & Deployment Guide
## Restaurant POS & Admin System (Online Web + Offline Windows EXE)

This guide provides full instructions on how to:
1. **Upload & Deploy the system Online** (for cloud dashboard access and multi-device sync).
2. **Build a Standalone Windows `.exe`** (for offline restaurant billing on client PCs).
3. **Connect Offline Terminals to the Online Cloud**.

---

## 🌐 Part 1: How to Upload & Host Online (Cloud Deployment)

Hosting the system online allows the client (or restaurant owners) to monitor live sales, manage menu items remotely, and sync offline POS orders to the cloud.

### Recommended Free/Low-Cost Platforms:
- **Render.com** (Recommended — Free Tier available)
- **Railway.app**
- **DigitalOcean / Linode / VPS**

---

### Step-by-Step Deployment on Render.com:

#### 1. Push Your Code to GitHub:
If you haven't initialized git yet, run in the project directory:
```bash
git init
git add .
git commit -m "Initial commit for Restaurant POS"
```
Create a repository on [GitHub.com](https://github.com) (e.g. `restaurant-pos`) and push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/restaurant-pos.git
git branch -M main
git push -u origin main
```

#### 2. Create Web Service on Render:
1. Go to [Render.com](https://render.com) and create a free account.
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (`restaurant-pos`).
4. Configure the settings:
   - **Name**: `my-restaurant-pos`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server/index.js`
   - **Plan**: `Free`
5. Click **Create Web Service**.

Render will automatically build the React frontend into `dist/` and start the Express backend. Once finished, you will receive a live URL:
```text
https://my-restaurant-pos.onrender.com
```

---

## 💻 Part 2: How to Create a Windows Desktop `.exe` for Client PC

To give your client an installation file (`RestaurantPOS-Setup.exe`) or portable `.exe` that launches with a double-click without opening a command prompt:

### Method A: Packaging with Electron (Recommended Desktop App)

#### 1. Install Electron dependencies:
Run in your project terminal:
```bash
npm install --save-dev electron electron-builder concurrently wait-on
```

#### 2. Create `electron-main.js` in your project root:
```javascript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serverProcess = null;
let mainWindow = null;

function startBackend() {
  serverProcess = fork(path.join(__dirname, 'server/index.js'), [], {
    env: { ...process.env, PORT: '5000' }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'Restaurant POS System',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('http://localhost:5000');
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  startBackend();
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
```

#### 3. Add Build Scripts in `package.json`:
Add the following to your `package.json`:
```json
"main": "electron-main.js",
"scripts": {
  "build": "vite build",
  "dist": "npm run build && electron-builder --win"
},
"build": {
  "appId": "com.restaurant.pos",
  "productName": "Restaurant POS",
  "directories": {
    "output": "dist-electron"
  },
  "files": [
    "dist/**/*",
    "server/**/*",
    "electron-main.js",
    "package.json"
  ],
  "win": {
    "target": ["nsis", "portable"]
  }
}
```

#### 4. Generate the `.exe`:
Run:
```bash
npm run dist
```
Your standalone installer (`Restaurant POS Setup.exe`) and portable executable will be generated inside the **`dist-electron/`** folder!

---

### Method B: Portable 1-Click Client Delivery (No Electron needed)

If you prefer lightweight distribution without extra dependencies:

1. **Pre-build the production assets**:
   ```bash
   npm run build
   ```
2. **Deliver the folder** to the client containing `start-pos.bat`.
3. Create a desktop shortcut with a restaurant icon for `start-pos.bat`.
4. (Optional) Use **Inno Setup** (free tool from [jrsoftware.org](https://jrsoftware.org/isinfo.php)) to pack the folder into a single `Setup.exe` installer with a desktop icon.

---

## 🔄 Part 3: Connecting Client's Offline `.exe` to the Online Server

To make offline sales on the client's PC automatically sync to your hosted online dashboard:

1. Open the POS on the client's PC.
2. Go to **Admin Dashboard** -> **POS Settings** tab.
3. In **Cloud Sync URL**, enter your online server URL:
   ```text
   https://my-restaurant-pos.onrender.com/api/sync/receive
   ```
4. Click **Save Settings**.

> 💡 **Offline Reliability**: When the internet drops, orders are saved locally in `server/pos_database.db`. When connection is restored, pending orders sync automatically in the background.

---

## 🖨️ Part 4: Client Thermal Printer (80mm) Configuration

1. Connect the 80mm thermal printer (Epson, Xprinter, POS-80, etc.) via USB or Wi-Fi.
2. Install the Windows manufacturer driver and set paper size to **80mm x 297mm**.
3. Set the printer as the **Default Windows Printer**.
4. To enable instant printing without print dialogs, add `--kiosk-printing` to the browser/app shortcut.

---

## 📱 Part 5: Tablet & Mobile Waiter Ordering Over Wi-Fi

1. Ensure the tablet is connected to the same Wi-Fi router as the main PC.
2. Find the main PC IP address using `ipconfig` (e.g. `192.168.1.50`).
3. Open the browser on any phone or iPad and navigate to:
   ```text
   http://192.168.1.50:5000
   ```
4. Waiters can now take orders from tables, and tickets will instantly appear on the main POS and print in the kitchen.

