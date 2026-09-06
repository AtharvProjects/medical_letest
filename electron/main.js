const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Essential Chromium startup switches for Windows stability
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

// Crash and error logger to userData directory
function logError(title, err) {
  try {
    const userDataPath = app.getPath('userData');
    fs.mkdirSync(userDataPath, { recursive: true });
    const logPath = path.join(userDataPath, 'app_error.log');
    const msg = `[${new Date().toISOString()}] ${title}: ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(logPath, msg);
    console.error(msg);
  } catch (e) {}
}

process.on('uncaughtException', (err) => {
  logError('Uncaught Exception', err);
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled Rejection', reason);
});

// Top-level reference to prevent garbage collection of the window
let mainWindow = null;

// Handle single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, bring our window to front
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
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
        logError('Backend server file not found at:', serverPath);
      }
    } catch (err) {
      logError('Failed to start backend:', err);
    }
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 1024,
      minHeight: 768,
      title: 'AthassMediSync',
      show: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false // Helpful for local file loading issues
      },
      autoHideMenuBar: true
    });

    const win = mainWindow;

    win.on('closed', () => {
      mainWindow = null;
    });

    // Renderer crash monitoring
    win.webContents.on('render-process-gone', (event, details) => {
      logError('Renderer Process Gone', JSON.stringify(details));
    });

    if (app.isPackaged) {
      const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
      console.log('Loading index from:', indexPath);
      
      win.loadFile(indexPath).catch(err => {
        logError('Failed to load index.html via loadFile:', err);
        // Fallback
        win.loadURL('file://' + indexPath);
      });
      
      // Open DevTools if load fails
      win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logError('Failed to load app:', `${errorCode} - ${errorDescription} (${validatedURL})`);
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
      win.webContents.openDevTools();
    }

    // Debugging shortcut (Ctrl+Shift+I)
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
