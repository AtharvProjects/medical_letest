/**
 * AthassMediSync — Production WhatsApp Integration
 * Built on whatsapp-web.js + Puppeteer with robust session lifecycle management,
 * Windows Chrome/Edge detection, auto-reconnect, and one-click session reset.
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// ── Suppress non-fatal transient Puppeteer context rejections ──────────────────
process.on('unhandledRejection', (reason) => {
  if (
    reason &&
    reason.message &&
    (reason.message.includes('Execution context was destroyed') ||
      reason.message.includes('Protocol error') ||
      reason.message.includes('Target closed') ||
      reason.message.includes('Session closed'))
  ) {
    console.warn('[WA] Handled transient Puppeteer warning:', reason.message);
    return;
  }
  console.error('[WA] Unhandled Rejection:', reason);
});

// ── Persistent Auth and Cache Paths ───────────────────────────────────────────
const getAuthPath = () => {
  if (process.env.WA_AUTH_PATH) return process.env.WA_AUTH_PATH;
  return path.resolve(__dirname, '..', 'wwebjs_auth_dev');
};

const getCachePath = () => {
  if (process.env.WA_CACHE_PATH) return process.env.WA_CACHE_PATH;
  return path.resolve(__dirname, '..', 'wwebjs_cache_dev');
};

// ── State Management ──────────────────────────────────────────────────────────
let client = null;
let qrCodeData = null;
let connectionStatus = 'DISCONNECTED'; // DISCONNECTED | INITIALIZING | QR_READY | AUTHENTICATED | READY | RECONNECTING | FAILED
let connectedInfo = null; // { name, number }
let lastError = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let isInitializing = false;
let waExplicitlyStarted = false;

const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_BASE_DELAY_MS = 6000; // 6s, 12s, 24s, 48s

// ── Browser Path Discovery (Chrome -> Edge -> Brave) ─────────────────────────
const getExecutablePath = () => {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    // Google Chrome
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),

    // Microsoft Edge (Pre-installed on 100% of Windows 10/11 machines)
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),

    // Brave Browser
    path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),

    // macOS & Linux paths
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log('[WA] Found browser executable at:', p);
        return p;
      }
    } catch {}
  }
  console.log('[WA] No custom browser found. Relying on default Puppeteer browser.');
  return null;
};

// ── Cleanup Locks and Stale Files ─────────────────────────────────────────────
const removeDirectoryRecursive = (dirPath) => {
  if (!fs.existsSync(dirPath)) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    console.log('[WA] Successfully removed directory:', dirPath);
  } catch (err) {
    console.warn('[WA] Directory removal warning (may be locked):', err.message);
  }
};

const clearSingletonLocks = () => {
  const authPath = getAuthPath();
  const sessionDir = path.join(authPath, 'session-athassmedi');
  const lockFiles = [
    path.join(sessionDir, 'SingletonLock'),
    path.join(sessionDir, 'SingletonCookie'),
    path.join(sessionDir, 'SingletonSocket'),
    path.join(sessionDir, 'Default', 'SingletonLock'),
    path.join(sessionDir, 'Default', 'SingletonCookie'),
  ];

  for (const file of lockFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log('[WA] Removed lock file:', file);
      }
    } catch {}
  }
};

const forceCleanSession = async () => {
  console.log('[WA] Force cleaning all WhatsApp session data...');
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // 1. Destroy client if running
  if (client) {
    const c = client;
    client = null;
    try {
      await c.destroy();
    } catch (e) {
      console.warn('[WA] Client destroy warning:', e.message);
    }
  }

  // 2. Wait 500ms for browser processes to release file handles
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 3. Clear auth and cache directories
  removeDirectoryRecursive(getAuthPath());
  removeDirectoryRecursive(getCachePath());

  // 4. Reset state flags
  qrCodeData = null;
  connectedInfo = null;
  lastError = null;
  reconnectAttempts = 0;
  connectionStatus = 'DISCONNECTED';
  isInitializing = false;
  console.log('[WA] Session cleanup complete.');
};

// ── Auto Reconnect Scheduler ──────────────────────────────────────────────────
const scheduleReconnect = () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[WA] Max reconnect attempts reached. Setting status to DISCONNECTED.');
    connectionStatus = 'DISCONNECTED';
    lastError = 'Connection dropped. Please click Reconnect or Scan QR code.';
    return;
  }

  const delay = RECONNECT_BASE_DELAY_MS * Math.pow(1.8, reconnectAttempts);
  reconnectAttempts++;
  console.log(`[WA] Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${Math.round(delay / 1000)}s...`);
  connectionStatus = 'RECONNECTING';

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startClient(false);
  }, delay);
};

// ── Helper: Ensure WWebJS and Store are injected into page ───────────────────
const ensureWWebReady = async (clientInstance, maxWaitMs = 6000) => {
  if (!clientInstance || !clientInstance.pupPage) return false;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const isReady = await clientInstance.pupPage.evaluate(() => {
        return typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.sendMessage === 'function' && typeof window.WWebJS.getChat === 'function';
      });
      if (isReady) return true;

      // Attempt injection if require / Store is ready
      const state = await clientInstance.pupPage.evaluate(() => {
        return {
          hasRequire: typeof window.require !== 'undefined',
          hasStore: typeof window.Store !== 'undefined',
        };
      }).catch(() => null);

      if (state && state.hasRequire) {
        try {
          const { ExposeStore } = require('whatsapp-web.js/src/util/Injected/Store');
          const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils');
          await clientInstance.pupPage.evaluate(ExposeStore).catch(() => {});
          await clientInstance.pupPage.evaluate(LoadUtils).catch(() => {});
        } catch {}
      }
    } catch (e) {
      // transient page navigation / context destroyed
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    return await clientInstance.pupPage.evaluate(() => {
      return typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.sendMessage === 'function';
    });
  } catch {
    return false;
  }
};

// ── Safely Destroy Client ─────────────────────────────────────────────────────
const destroyClient = async () => {
  if (!client) return;
  const c = client;
  client = null;
  try {
    await c.destroy();
  } catch (err) {
    console.warn('[WA] Destroy client warning:', err.message);
  }
};

// ── Start Client (Core Engine) ────────────────────────────────────────────────
const startClient = async (freshStart = false) => {
  if (isInitializing) {
    console.log('[WA] Client initialization already in progress. Skipping duplicate start.');
    return;
  }

  isInitializing = true;
  waExplicitlyStarted = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    if (freshStart) {
      await forceCleanSession();
    } else {
      await destroyClient();
      clearSingletonLocks();
    }

    console.log('[WA] Initializing WhatsApp Client (Auth Path:', getAuthPath(), ')...');
    connectionStatus = 'INITIALIZING';
    qrCodeData = null;
    connectedInfo = null;
    lastError = null;

    const executablePath = getExecutablePath();
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--safebrowsing-disable-auto-update',
      '--disable-web-security',
      `--user-agent=${userAgent}`,
    ];

    const newClient = new Client({
      authStrategy: new LocalAuth({
        dataPath: getAuthPath(),
        clientId: 'athassmedi',
      }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
        strict: false,
      },
      puppeteer: {
        headless: true,
        executablePath: executablePath || undefined,
        args: puppeteerArgs,
      },
    });

    client = newClient;

    // ── Event Handlers ──
    newClient.on('qr', async (qr) => {
      console.log('[WA] QR Code received from WhatsApp Web.');
      connectionStatus = 'QR_READY';
      reconnectAttempts = 0;
      lastError = null;
      try {
        qrCodeData = await qrcode.toDataURL(qr, {
          margin: 2,
          width: 280,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      } catch (err) {
        console.error('[WA] QR generation error:', err);
      }
    });

    newClient.on('loading_screen', (percent, message) => {
      console.log(`[WA] Syncing chats: ${percent}% (${message})`);
      if (connectionStatus !== 'READY') {
        connectionStatus = 'AUTHENTICATED';
      }
    });

    newClient.on('authenticated', () => {
      console.log('[WA] Authenticated successfully! Syncing WhatsApp Web...');
      connectionStatus = 'AUTHENTICATED';
      qrCodeData = null;
      lastError = null;
    });

    newClient.on('ready', async () => {
      console.log('[WA] WhatsApp Client is fully READY!');
      await ensureWWebReady(newClient, 5000);
      connectionStatus = 'READY';
      qrCodeData = null;
      reconnectAttempts = 0;
      lastError = null;

      try {
        const info = newClient.info;
        if (info) {
          const phone = info.wid ? (info.wid.user || '') : '';
          const name = info.pushname || (phone ? `+${phone}` : 'Connected Account');
          connectedInfo = { name, number: phone };
          console.log(`[WA] Connected account: ${name} (+${phone})`);
        }
      } catch (err) {
        console.warn('[WA] Could not fetch account info:', err.message);
      }
    });

    newClient.on('auth_failure', async (msg) => {
      console.error('[WA] Auth failure:', msg);
      connectionStatus = 'FAILED';
      lastError = `Authentication failed (${msg}). Please delete session and scan fresh QR.`;
      connectedInfo = null;
      await forceCleanSession();
    });

    newClient.on('disconnected', async (reason) => {
      console.log('[WA] Disconnected. Reason:', reason);
      connectedInfo = null;
      qrCodeData = null;
      await destroyClient();

      if (reason === 'LOGOUT') {
        console.log('[WA] User logged out from WhatsApp phone.');
        connectionStatus = 'DISCONNECTED';
        lastError = 'Logged out from phone. Please connect and scan QR code again.';
        await forceCleanSession();
        return;
      }

      lastError = `Disconnected: ${reason}`;
      scheduleReconnect();
    });

    await newClient.initialize();
  } catch (err) {
    console.error('[WA] Failed to start client:', err.message);
    connectionStatus = 'FAILED';
    lastError = `Failed to start browser: ${err.message}. Check if Chrome or Edge is installed.`;
    scheduleReconnect();
  } finally {
    isInitializing = false;
  }
};

// ── Phone Normalization (E.164 without '+') ──────────────────────────────────
const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`; // Standard Indian 10-digit mobile
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
};

// ── Express Router Registration ───────────────────────────────────────────────
const initWhatsApp = (app) => {
  // Auto-start WhatsApp engine in background on server boot
  setTimeout(() => {
    try {
      console.log('[WA] Background auto-initialization started on server boot...');
      startClient(false);
    } catch (err) {
      console.warn('[WA] Background auto-start notice:', err.message);
    }
  }, 1500);

  // Helper to wait briefly if WhatsApp is in the middle of authenticating
  const waitForReady = async (timeoutMs = 12000) => {
    if (connectionStatus === 'READY' && client) {
      const ok = await ensureWWebReady(client, 2000);
      if (ok) return true;
    }
    if (connectionStatus === 'DISCONNECTED') {
      startClient(false);
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (connectionStatus === 'READY' && client) {
        const ok = await ensureWWebReady(client, 2000);
        if (ok) return true;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return connectionStatus === 'READY' && client && (await ensureWWebReady(client, 2000));
  };

  // GET /api/whatsapp/status
  app.get('/api/whatsapp/status', (req, res) => {
    res.json({
      status: connectionStatus,
      qr: qrCodeData,
      info: connectedInfo,
      error: lastError,
      reconnectAttempt: reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
      isInitializing,
    });
  });

  // POST /api/whatsapp/connect — Connect / Resume session
  app.post('/api/whatsapp/connect', async (req, res) => {
    console.log('[WA] User requested Connect.');
    startClient(false);
    res.json({ success: true, status: connectionStatus });
  });

  // POST /api/whatsapp/restart — Restart client keeping session
  app.post('/api/whatsapp/restart', async (req, res) => {
    console.log('[WA] User requested Restart.');
    startClient(false);
    res.json({ success: true, status: connectionStatus });
  });

  // POST /api/whatsapp/logout — Graceful logout from phone
  app.post('/api/whatsapp/logout', async (req, res) => {
    console.log('[WA] User requested Logout.');
    if (client) {
      try {
        await client.logout();
      } catch {}
    }
    await forceCleanSession();
    res.json({ success: true, status: 'DISCONNECTED' });
  });

  // DELETE /api/whatsapp/session & POST /api/whatsapp/reset — Delete session & Reconnect Fresh
  const handleResetSession = async (req, res) => {
    console.log('[WA] User requested DELETE SESSION & RECONNECT FRESH.');
    await forceCleanSession();
    // Start fresh immediately to generate new QR
    startClient(true);
    res.json({ success: true, message: 'Session deleted. Starting fresh QR scan...' });
  };

  app.delete('/api/whatsapp/session', handleResetSession);
  app.post('/api/whatsapp/reset', handleResetSession);

  // POST /api/whatsapp/send-pdf — Send PDF Invoice
  app.post('/api/whatsapp/send-pdf', async (req, res) => {
    const { phone, pdfBase64, filename, message } = req.body;

    if (connectionStatus !== 'READY') {
      await waitForReady(10000);
    }

    if (connectionStatus !== 'READY' || !client) {
      return res.status(400).json({
        error: connectionStatus === 'AUTHENTICATED' || connectionStatus === 'INITIALIZING'
          ? 'WhatsApp is synchronizing with your phone. Please wait a few seconds and try again.'
          : 'WhatsApp is not connected. Please connect in Settings > WhatsApp.',
      });
    }

    const e164 = normalizePhone(phone);
    if (!e164) {
      return res.status(400).json({ error: 'Invalid customer phone number.' });
    }

    const base64Content = String(pdfBase64 || '').split(',').pop();
    if (!base64Content) {
      return res.status(400).json({ error: 'Missing PDF invoice data.' });
    }

    try {
      await ensureWWebReady(client, 5000);

      let targetChatId = `${e164}@c.us`;
      try {
        const numberId = await client.getNumberId(e164);
        if (numberId && numberId._serialized) {
          targetChatId = numberId._serialized;
        }
      } catch (e) {
        console.log('[WA] getNumberId notice (using direct chatId):', targetChatId);
      }

      console.log(`[WA] Sending PDF invoice (${filename || 'Invoice.pdf'}) to ${targetChatId}...`);
      const media = new MessageMedia('application/pdf', base64Content, filename || 'Invoice.pdf');

      let sentSuccess = false;
      let lastSendErr = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await ensureWWebReady(client, 3000);
          await client.sendMessage(targetChatId, media, {
            caption: message || 'Here is your invoice. Thank you for your business!',
            sendMediaAsDocument: true,
          });
          sentSuccess = true;
          break;
        } catch (sendErr) {
          lastSendErr = sendErr;
          console.warn(`[WA] Send PDF attempt ${attempt} failed:`, sendErr.message);
          if (attempt === 1) {
            await ensureWWebReady(client, 4000);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      if (!sentSuccess) {
        throw lastSendErr || new Error('Could not send PDF after retrying');
      }

      console.log(`[WA] PDF invoice successfully dispatched to ${targetChatId}`);
      res.json({ success: true, to: targetChatId });
    } catch (err) {
      console.error('[WA] Send PDF error:', err.message);
      const msg = err.message || String(err);
      const isFatal = msg.includes('Target closed') || msg.includes('Session closed');

      if (isFatal) {
        connectionStatus = 'DISCONNECTED';
        scheduleReconnect();
      }

      res.status(500).json({
        error: `Could not send WhatsApp PDF: ${msg}`,
      });
    }
  });
};

module.exports = { initWhatsApp };
