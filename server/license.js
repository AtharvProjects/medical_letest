const crypto = require('crypto');
const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy0e4Cxeg4GF0F7b9o+VI
0zdAQwX5epRkuHC4j5GwGY7IaAtiAczYrdBk43RgmrK+BwbueGJqGwUy34WzygIK
P03DkYJEiG5iEFFYqFc823hcLPHxS/jdX5L2fetkI6L26zvxi/I74YOQVK/73L7M
CHPztb9iLqsKGmbpCE5Cp0w4bim1QI9BeZreZYoj8/lNLZOY5f4br4hKwt0kaGvb
sD2GTEffV80c8Y8OmfQVWQP8HUBj1BNoUv9tFVhSuem3GeeMDlP6IVKrkg4Dzh7+
Zt2xiJMXen0QtlxlDDpFdWX4QNwRgoyHmBBL1JhW6HVe2VwwRAaAJW8dbYsfxtCu
nwIDAQAB
-----END PUBLIC KEY-----`;

let cachedHwid = null;

function getStorageDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), '.athass-medisync');
  const target = path.join(base, 'athass-medisync');
  if (!fs.existsSync(target)) {
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch (e) {}
  }
  return target;
}

function getHwidCachePath() {
  return path.join(getStorageDir(), 'hwid.cache');
}

function getLicenseFilePath() {
  return path.join(getStorageDir(), 'license.lic');
}

function formatHwid(rawId) {
  if (!rawId || typeof rawId !== 'string') return '';
  const hash = crypto.createHash('sha256').update(rawId.trim()).digest('hex').toUpperCase();
  return `AMS-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}`;
}

function persistHwidCache(hwid) {
  if (!hwid || !hwid.startsWith('AMS-')) return;
  cachedHwid = hwid;
  try {
    fs.writeFileSync(getHwidCachePath(), hwid.trim(), 'utf8');
  } catch (e) {}
}

function saveLicenseKeyMirror(key) {
  try {
    const licPath = getLicenseFilePath();
    fs.mkdirSync(path.dirname(licPath), { recursive: true });
    fs.writeFileSync(licPath, key.trim(), 'utf8');
  } catch (e) {}
}

function readLicenseKeyMirror() {
  try {
    const licPath = getLicenseFilePath();
    if (fs.existsSync(licPath)) {
      const content = fs.readFileSync(licPath, 'utf8').trim();
      if (content.startsWith('AMS-LIC-')) return content;
    }
  } catch (e) {}
  return null;
}

/**
 * Returns all valid hardware identification tokens for this physical or virtual machine.
 * This guarantees tolerance across motherboards, virtual machine boots, and persistent IDs.
 */
function getAllMachineHardwareIds() {
  const list = [];
  const addToken = (raw) => {
    if (!raw || raw.length < 5) return;
    const clean = raw.trim();
    if (clean.includes('00000000-0000') || clean.includes('FFFFFFFF-FFFF')) return;
    const token = formatHwid(clean);
    if (token && !list.includes(token)) list.push(token);
  };

  // 1. Cached HWID if previously locked
  try {
    const cachePath = getHwidCachePath();
    if (fs.existsSync(cachePath)) {
      const cached = fs.readFileSync(cachePath, 'utf8').trim();
      if (cached.startsWith('AMS-')) list.push(cached);
    }
  } catch (e) {}

  // 2. Motherboard UUID (Windows CIM / PowerShell)
  if (process.platform === 'win32') {
    try {
      const output = execSync(
        'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance -ClassName Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"',
        { encoding: 'utf8', timeout: 3500, windowsHide: true }
      );
      addToken(output);
    } catch (e) {}
  }

  // 3. Windows MachineGuid from Registry (instant, ~15ms, 100% reliable on all Windows OS)
  if (process.platform === 'win32') {
    try {
      const regOut = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
        encoding: 'utf8',
        timeout: 1000,
        windowsHide: true
      });
      const match = regOut.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i);
      if (match && match[1]) {
        addToken(match[1].trim());
      }
    } catch (e) {}
  }

  // 4. Persistent machine.id fallback files in APPDATA
  const baseAppData = process.env.APPDATA || path.join(os.homedir(), '.athass-medisync');
  const possiblePaths = [
    path.join(baseAppData, 'machine.id'),
    path.join(baseAppData, 'athass-medisync', 'machine.id')
  ];

  let foundMachineId = false;
  for (const fp of possiblePaths) {
    try {
      if (fs.existsSync(fp)) {
        const id = fs.readFileSync(fp, 'utf8').trim();
        if (id) {
          addToken(id);
          foundMachineId = true;
        }
      }
    } catch (e) {}
  }

  // If no persistent machine.id existed, create one
  if (!foundMachineId) {
    try {
      const newId = crypto.randomUUID();
      for (const fp of possiblePaths) {
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, newId, 'utf8');
      }
      addToken(newId);
    } catch (e) {}
  }

  // 5. Hostname fallback
  addToken(os.hostname() + '-' + os.platform() + '-' + os.arch());

  return list;
}

function getHardwareId() {
  if (cachedHwid) return cachedHwid;

  // 1. Fast path: check on-disk cache (0ms, no process spawn)
  try {
    const cachePath = getHwidCachePath();
    if (fs.existsSync(cachePath)) {
      const val = fs.readFileSync(cachePath, 'utf8').trim();
      if (val.startsWith('AMS-')) {
        cachedHwid = val;
        return cachedHwid;
      }
    }
  } catch (e) {}

  // 2. Check if a license key is already stored and matches any valid machine token
  try {
    let savedKey = null;
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license_key'").get();
    if (row && row.value) savedKey = row.value;
    if (!savedKey) savedKey = readLicenseKeyMirror();

    if (savedKey && savedKey.startsWith('AMS-LIC-')) {
      const base64Data = savedKey.replace('AMS-LIC-', '');
      const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
      const licenseObj = JSON.parse(jsonStr);
      const allTokens = getAllMachineHardwareIds();
      if (licenseObj.hwid && allTokens.includes(licenseObj.hwid)) {
        persistHwidCache(licenseObj.hwid);
        return licenseObj.hwid;
      }
    }
  } catch (e) {}

  // 3. Fallback to first available machine token
  const tokens = getAllMachineHardwareIds();
  cachedHwid = tokens[0] || 'AMS-UNKNOWN';
  persistHwidCache(cachedHwid);
  return cachedHwid;
}

function verifyLicenseKey(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('AMS-LIC-')) {
    return { valid: false, reason: 'Invalid license key format.' };
  }

  try {
    const base64Data = key.replace('AMS-LIC-', '');
    const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
    const licenseObj = JSON.parse(jsonStr);

    const { hwid, expiry, signature } = licenseObj;
    const currentHwid = getHardwareId();

    // Fast-path: check against currently active HWID first (0ms)
    if (hwid !== currentHwid) {
      const validTokens = getAllMachineHardwareIds();
      if (!validTokens.includes(hwid)) {
        return { valid: false, reason: 'License key is registered to a different computer.' };
      }
      // If matched an alias, lock to this matching HWID
      persistHwidCache(hwid);
    }

    // Verify cryptographic signature
    const payload = `${hwid}|${expiry}`;
    const verify = crypto.createVerify('SHA256');
    verify.update(payload);
    verify.end();

    const isSignatureValid = verify.verify(PUBLIC_KEY, signature, 'base64');
    if (!isSignatureValid) {
      return { valid: false, reason: 'Cryptographic signature is invalid.' };
    }

    // Check expiration date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(expiry);
    expiryDate.setHours(23, 59, 59, 999);

    if (today > expiryDate) {
      return { valid: false, reason: `License expired on ${expiryDate.toLocaleDateString('en-IN')}.` };
    }

    // Lock the validated HWID into cache so all subsequent lookups are instantaneous
    persistHwidCache(hwid);

    return { valid: true, expiry, hwid };
  } catch (err) {
    return { valid: false, reason: 'Failed to decode or verify license key.' };
  }
}

function getCloudServerUrl() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license_server_url'").get();
    if (row && row.value && row.value.trim()) {
      return row.value.trim().replace(/\/+$/, '');
    }
  } catch (e) {}
  return (process.env.LICENSE_SERVER_URL || 'https://medical-lisence-key.onrender.com').replace(/\/+$/, '');
}

function setCloudServerUrl(url) {
  try {
    const cleanUrl = (url || '').trim().replace(/\/+$/, '');
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_server_url', ?)").run(cleanUrl);
    return true;
  } catch (e) {
    return false;
  }
}

function isAppLicensed() {
  try {
    // 1. Check if cloud status was marked suspended
    const cloudStatusRow = db.prepare("SELECT value FROM settings WHERE key = 'cloud_status'").get();
    if (cloudStatusRow && cloudStatusRow.value === 'suspended') {
      return false;
    }

    let row = db.prepare("SELECT value FROM settings WHERE key = 'license_key'").get();

    // Self-healing: if database was wiped or restored without license, recover from mirror
    if (!row || !row.value) {
      const mirrorKey = readLicenseKeyMirror();
      if (mirrorKey) {
        const check = verifyLicenseKey(mirrorKey);
        if (check.valid) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(mirrorKey);
          return true;
        }
      }
      return false;
    }

    const verification = verifyLicenseKey(row.value);
    if (verification.valid) {
      // Keep mirror in sync
      saveLicenseKeyMirror(row.value);
      return true;
    }
    return false;
  } catch (err) {
    console.error('App license check error:', err);
    return false;
  }
}

/**
 * Online Cloud Activation
 * Connects to Render License Manager and activates using a short key (AMS-PRO-XXXX-XXXX)
 */
async function activateOnline(licenseKey, customServerUrl = null) {
  const hwid = getHardwareId();
  const serverUrl = customServerUrl || getCloudServerUrl();

  if (!licenseKey || !licenseKey.trim()) {
    return { success: false, error: 'License key is required.' };
  }

  // Get shop name from settings if available
  let storeName = 'AthassMediSync Client';
  try {
    const shopRow = db.prepare("SELECT value FROM settings WHERE key = 'shop_name'").get();
    if (shopRow && shopRow.value) storeName = shopRow.value;
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for Render wake-up

    const res = await fetch(`${serverUrl}/api/v1/client/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: licenseKey.trim().toUpperCase(),
        hwid,
        storeName,
        appVersion: '1.2.0'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error || 'Cloud activation failed' };
    }

    // Save offline key from cloud to local SQLite & Mirror
    if (data.offlineLicenseKey) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(data.offlineLicenseKey);
      saveLicenseKeyMirror(data.offlineLicenseKey);
    }

    // Save cloud link details
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_license_key', ?)").run(licenseKey.trim().toUpperCase());
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_status', ?)").run('active');
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_synced_at', ?)").run(new Date().toISOString());
    if (data.clientName) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_client_name', ?)").run(data.clientName);
    }
    if (data.storeName) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_store_name', ?)").run(data.storeName);
    }

    if (customServerUrl) {
      setCloudServerUrl(customServerUrl);
    }

    return {
      success: true,
      message: data.message || 'Activated successfully via Cloud!',
      expiresAt: data.expiresAt,
      clientName: data.clientName,
      storeName: data.storeName
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Connection timed out. The Render server might be waking up; please try again in 15 seconds.' };
    }
    return { success: false, error: `Could not connect to cloud server at ${serverUrl}. (${err.message})` };
  }
}

/**
 * Periodic Heartbeat / Sync with Cloud License Manager
 */
async function syncWithCloud() {
  const cloudKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'cloud_license_key'").get();
  if (!cloudKeyRow || !cloudKeyRow.value) {
    return { synced: false, reason: 'No cloud license key linked' };
  }

  const cloudKey = cloudKeyRow.value;
  const hwid = getHardwareId();
  const serverUrl = getCloudServerUrl();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${serverUrl}/api/v1/client/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: cloudKey,
        hwid,
        appVersion: '1.2.0'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    if (data.status === 'suspended' || data.status === 'revoked') {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_status', ?)").run('suspended');
      return {
        synced: true,
        valid: false,
        status: 'suspended',
        message: data.message || 'License has been suspended by the administrator.'
      };
    }

    if (data.status === 'active') {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_status', ?)").run('active');
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_synced_at', ?)").run(new Date().toISOString());

      // If server returned an updated RSA offline token (e.g. extension was issued remotely), update it
      if (data.offlineLicenseKey) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(data.offlineLicenseKey);
        saveLicenseKeyMirror(data.offlineLicenseKey);
      }

      return {
        synced: true,
        valid: true,
        status: 'active',
        expiresAt: data.expiresAt
      };
    }

    return { synced: true, valid: false, status: data.status, message: data.message };
  } catch (err) {
    // Network offline: silent fallback to local credentials
    return { synced: false, reason: 'Offline or server unreachable' };
  }
}

module.exports = {
  getHardwareId,
  verifyLicenseKey,
  isAppLicensed,
  saveLicenseKeyMirror,
  readLicenseKeyMirror,
  getCloudServerUrl,
  setCloudServerUrl,
  activateOnline,
  syncWithCloud
};


