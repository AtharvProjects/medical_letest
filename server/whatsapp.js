const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Suppress non-fatal Puppeteer context errors ─────────────────────────────
process.on('unhandledRejection', (reason) => {
    if (reason && reason.message &&
        (reason.message.includes('Execution context was destroyed') ||
         reason.message.includes('Protocol error') ||
         reason.message.includes('Target closed'))) {
        console.warn('[WA] Ignored transient Puppeteer error:', reason.message);
        return;
    }
    // Don't swallow real rejections
    console.error('[WA] Unhandled Rejection:', reason);
});

// ─── Persistent auth path ─────────────────────────────────────────────────────
// In packaged Electron: WA_AUTH_PATH is set to app.getPath('userData')/wwebjs_auth
// In dev: falls back to a folder in the OS temp dir so it survives restarts
const getAuthPath = () => {
    if (process.env.WA_AUTH_PATH) return process.env.WA_AUTH_PATH;
    // Dev fallback: store next to the project so dev sessions persist too
    return path.resolve(__dirname, '..', 'wwebjs_auth_dev');
};

const getCachePath = () => {
    if (process.env.WA_CACHE_PATH) return process.env.WA_CACHE_PATH;
    return path.resolve(__dirname, '..', 'wwebjs_cache_dev');
};

// ─── State ────────────────────────────────────────────────────────────────────
let client = null;
let qrCodeData = null;
let connectionStatus = 'DISCONNECTED';
let connectedInfo = null;   // { name, number } when READY
let reconnectTimer = null;
let reconnectAttempts = 0;
let waStarted = false;       // Only true after user manually initiates connection
const MAX_RECONNECT_ATTEMPTS = 3;  // Reduced to avoid long loops
const RECONNECT_BASE_DELAY_MS = 8000; // 8s, 16s, 32s

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getExecutablePath = () => {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch {}
    }
    return null;
};

const clearAuthFolders = () => {
    const authPath = getAuthPath();
    const cachePath = getCachePath();
    [authPath, cachePath].forEach(p => {
        try {
            if (fs.existsSync(p)) {
                fs.rmSync(p, { recursive: true, force: true });
                console.log('[WA] Cleared folder:', p);
            }
        } catch (e) {
            console.error('[WA] Failed to clear folder:', p, e.message);
        }
    });
};

// Check for Chrome SingletonLock and remove it so restart works
const clearSingletonLock = () => {
    const authPath = getAuthPath();
    const lockFile = path.join(authPath, 'session-athassmedi', 'SingletonLock');
    try {
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
            console.log('[WA] Removed stale SingletonLock');
        }
    } catch (e) { /* ignore */ }
};

const scheduleReconnect = () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[WA] Max reconnect attempts reached. Waiting for manual reconnect.');
        connectionStatus = 'DISCONNECTED';
        return;
    }
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts);
    reconnectAttempts++;
    console.log(`[WA] Scheduling reconnect attempt ${reconnectAttempts} in ${delay / 1000}s...`);
    connectionStatus = 'RECONNECTING';

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startClient(false); // don't clear auth on auto-reconnect
    }, delay);
};

const destroyClient = async () => {
    if (!client) return;
    const c = client;
    client = null;
    try { await c.destroy(); } catch {}
};

// ─── Core: Start Client ───────────────────────────────────────────────────────
const startClient = (freshStart = false) => {
    if (freshStart) {
        reconnectAttempts = 0;
        clearAuthFolders();
    } else {
        // Remove stale browser lock so we can restart cleanly
        clearSingletonLock();
    }

    console.log('[WA] Initializing client... (auth:', getAuthPath(), ')');
    waStarted = true;
    connectionStatus = 'INITIALIZING';
    qrCodeData = null;
    connectedInfo = null;

    const executablePath = getExecutablePath();
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: getAuthPath(),
            clientId: 'athassmedi'
        }),
        puppeteer: {
            headless: true,
            executablePath: executablePath || undefined,
            // NOTE: Do NOT set userDataDir here — LocalAuth manages its own data path.
            // Setting both causes: "LocalAuth is not compatible with a user-supplied userDataDir"
            args: [
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
                `--user-agent=${userAgent}`,
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log('[WA] QR Code received.');
        connectionStatus = 'QR_READY';
        reconnectAttempts = 0; // Reset — user saw QR so we're in manual flow now
        try {
            qrCodeData = await qrcode.toDataURL(qr, { margin: 2, width: 256 });
        } catch (err) {
            console.error('[WA] QR conversion error:', err);
        }
    });

    client.on('authenticated', () => {
        console.log('[WA] Authenticated successfully.');
        connectionStatus = 'AUTHENTICATED';
        qrCodeData = null;

        // Workaround: Sometimes the 'ready' event doesn't fire due to WhatsApp Web UI updates
        // If it's still not READY after 15 seconds, force it.
        setTimeout(() => {
            if (connectionStatus === 'AUTHENTICATED') {
                console.log('[WA] Force-setting READY state (timeout fallback)');
                connectionStatus = 'READY';
                try {
                    const info = client.info;
                    if (info) {
                        const phone = info.wid ? info.wid.user : '';
                        const name = info.pushname || '';
                        connectedInfo = { name, number: phone };
                        console.log(`[WA] Connected as: ${name} (+${phone})`);
                    }
                } catch (e) {
                    console.warn('[WA] Could not fetch account info in fallback:', e.message);
                }
            }
        }, 15000);
    });

    client.on('ready', async () => {
        console.log('[WA] Client ready!');
        connectionStatus = 'READY';
        qrCodeData = null;
        reconnectAttempts = 0;

        // Fetch connected account info
        try {
            const info = client.info;
            if (info) {
                const phone = info.wid ? info.wid.user : '';
                const name = info.pushname || '';
                connectedInfo = { name, number: phone };
                console.log(`[WA] Connected as: ${name} (+${phone})`);
            }
        } catch (e) {
            console.warn('[WA] Could not fetch account info:', e.message);
        }
    });

    client.on('auth_failure', (msg) => {
        console.error('[WA] Auth failure:', msg);
        connectionStatus = 'DISCONNECTED';
        connectedInfo = null;
        // Auth failure usually means corrupted session — clear and let user scan fresh
        clearAuthFolders();
    });

    client.on('disconnected', async (reason) => {
        console.log('[WA] Disconnected. Reason:', reason);
        connectedInfo = null;
        await destroyClient();

        // LOGOUT means intentional disconnect — don't auto-reconnect
        if (reason === 'LOGOUT') {
            connectionStatus = 'DISCONNECTED';
            return;
        }

        // Otherwise schedule an auto-reconnect
        scheduleReconnect();
    });

    client.initialize().catch(err => {
        console.error('[WA] Initialization error:', err.message);
        connectionStatus = 'DISCONNECTED';
        scheduleReconnect();
    });
};

// ─── Normalize phone number to E.164 digits (no +) ───────────────────────────
const normalizePhone = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
    return digits;
};

// ─── Express Routes ───────────────────────────────────────────────────────────
const initWhatsApp = (app) => {
    // Do NOT auto-start WhatsApp on server boot.
    // WhatsApp is optional and requires a QR scan. Starting it automatically
    // causes browser conflicts when the server restarts frequently in dev.
    // The user initiates connection from Settings > WhatsApp tab.

    // GET /api/whatsapp/status
    app.get('/api/whatsapp/status', (req, res) => {
        res.json({
            status: connectionStatus,
            qr: qrCodeData,
            info: connectedInfo,
            reconnectAttempt: reconnectAttempts,
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
        });
    });

    // POST /api/whatsapp/restart  — manual reconnect without wiping session
    app.post('/api/whatsapp/restart', async (req, res) => {
        console.log('[WA] Manual restart requested.');
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        await destroyClient();
        reconnectAttempts = 0;
        startClient(false);  // This sets waStarted = true
        res.json({ success: true, status: connectionStatus });
    });

    // POST /api/whatsapp/connect — first-time connection (initiates QR flow)
    app.post('/api/whatsapp/connect', async (req, res) => {
        if (waStarted && connectionStatus !== 'DISCONNECTED') {
            return res.json({ success: true, status: connectionStatus });
        }
        console.log('[WA] User initiated connection.');
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        await destroyClient();
        reconnectAttempts = 0;
        startClient(false);
        res.json({ success: true, status: connectionStatus });
    });

    // POST /api/whatsapp/logout  — full logout + fresh QR
    app.post('/api/whatsapp/logout', async (req, res) => {
        console.log('[WA] Logout requested.');
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        reconnectAttempts = 0;

        const c = client;
        client = null;
        connectionStatus = 'DISCONNECTED';
        qrCodeData = null;
        connectedInfo = null;

        try { if (c) await c.logout(); } catch {}
        try { if (c) await c.destroy(); } catch {}

        // Clear stored session then boot fresh so a new QR is issued
        setTimeout(() => {
            clearAuthFolders();
            startClient(false);
        }, 2000);

        res.json({ success: true });
    });

    // POST /api/whatsapp/send-pdf
    app.post('/api/whatsapp/send-pdf', async (req, res) => {
        const { phone, pdfBase64, filename, message } = req.body;

        if (connectionStatus !== 'READY') {
            return res.status(400).json({ error: 'WhatsApp not connected. Please connect first.' });
        }

        const e164 = normalizePhone(phone);
        if (!e164) {
            return res.status(400).json({ error: 'Invalid phone number.' });
        }

        const base64Content = String(pdfBase64 || '').split(',').pop();
        if (!base64Content) {
            return res.status(400).json({ error: 'Missing PDF data.' });
        }

        try {
            // Verify session is truly alive
            const state = await client.getState();
            if (state !== 'CONNECTED') {
                connectionStatus = 'DISCONNECTED';
                scheduleReconnect();
                return res.status(400).json({
                    error: 'WhatsApp session lost. Reconnecting automatically — please try again in a moment.',
                });
            }

            const numberId = await client.getNumberId(e164);
            if (!numberId) {
                return res.status(400).json({
                    error: `Phone number ${phone} is not on WhatsApp.`,
                });
            }

            const media = new MessageMedia('application/pdf', base64Content, filename || 'Invoice.pdf');
            await client.sendMessage(numberId._serialized, media, { caption: message || '' });

            res.json({ success: true, to: numberId._serialized });
        } catch (err) {
            console.error('[WA] Send error:', err.message);
            const msg = err.message || String(err);
            const isDetached = msg.includes('detached') || msg.includes('Execution context') || msg.includes('Target closed');
            if (isDetached) {
                connectionStatus = 'DISCONNECTED';
                scheduleReconnect();
            }
            res.status(500).json({
                error: isDetached
                    ? 'WhatsApp session became unstable. Auto-reconnecting — retry in a moment.'
                    : msg,
            });
        }
    });
};

module.exports = { initWhatsApp };
