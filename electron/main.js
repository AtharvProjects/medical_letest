const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Handle single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      if (windows[0].isMinimized()) windows[0].restore();
      windows[0].focus();
    }
  });

  // Start backend
  function startBackend() {
  try {
    const serverPath = path.join(app.getAppPath(), 'server', 'index.js');
    
    // Set database path and WhatsApp auth path for production
    if (app.isPackaged) {
      const userDataPath = app.getPath('userData');
      process.env.DB_PATH = path.join(userDataPath, 'pharmacy.db');
      process.env.WA_AUTH_PATH = path.join(userDataPath, 'wwebjs_auth');
      process.env.WA_CACHE_PATH = path.join(userDataPath, 'wwebjs_cache');
      console.log('Production DB Path:', process.env.DB_PATH);
      console.log('WhatsApp Auth Path:', process.env.WA_AUTH_PATH);
    }

    console.log('Starting backend from:', serverPath);
    if (fs.existsSync(serverPath)) {
      require(serverPath);
    } else {
      console.error('Backend server file not found at:', serverPath);
    }
  } catch (err) {
    console.error('Failed to start backend:', err);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'AthassMediSync',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // Helpful for local file loading issues
    },
    autoHideMenuBar: true
  });

  if (app.isPackaged) {
    // In production, main.js is at the root of app.asar
    // dist/index.html is also at the root of app.asar
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    
    console.log('Loading index from:', indexPath);
    
    win.loadFile(indexPath).catch(err => {
      console.error('Failed to load index.html:', err);
      // Fallback
      win.loadURL('file://' + indexPath);
    });
    
    // Open DevTools if load fails
    win.webContents.on('did-fail-load', () => {
        console.error('Failed to load app. Opening DevTools.');
        win.webContents.openDevTools();
    });

    // Handle window.open (e.g. for printing or external links)
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https:') || url.startsWith('http:') || url.startsWith('mailto:')) {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
      }
      // Allow blob: for PDF printing/preview if needed
      if (url.startsWith('blob:')) {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
      }
      return { action: 'deny' };
    });
  } else {
    // Development mode
    win.loadURL('http://localhost:5173');
    
    // Open DevTools in development
    win.webContents.openDevTools();
  }

  // Debugging shortcut
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.openDevTools();
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
}
