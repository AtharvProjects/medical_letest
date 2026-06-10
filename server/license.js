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

function getHardwareId() {
  if (cachedHwid) return cachedHwid;

  let hwId = '';
  try {
    if (process.platform === 'win32') {
      // Get motherboard UUID using PowerShell CIM
      const output = execSync('powershell -Command "Get-CimInstance -ClassName Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"', { encoding: 'utf8', timeout: 5000 });
      hwId = output.trim();
    }
  } catch (e) {
    console.error('Failed to get Motherboard UUID:', e.message);
  }

  // Fallback if hardware identifier is unavailable or blank
  if (!hwId || hwId.length < 5 || hwId.includes('00000000') || hwId.includes('FFFFFFFF')) {
    try {
      // Fallback: Generate a persistent random machine ID
      const appData = process.env.APPDATA || path.join(os.homedir(), '.athass-medisync');
      if (!fs.existsSync(appData)) {
        fs.mkdirSync(appData, { recursive: true });
      }
      const fallbackPath = path.join(appData, 'machine.id');
      if (fs.existsSync(fallbackPath)) {
        hwId = fs.readFileSync(fallbackPath, 'utf8').trim();
      } else {
        hwId = crypto.randomUUID();
        fs.writeFileSync(fallbackPath, hwId, 'utf8');
      }
    } catch (e) {
      hwId = os.hostname() + '-' + os.platform() + '-' + os.arch();
    }
  }

  // Hash hardware ID for a clean, consistent uppercase hex token
  const hash = crypto.createHash('sha256').update(hwId.trim()).digest('hex').toUpperCase();
  cachedHwid = `AMS-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}`;
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

    if (hwid !== currentHwid) {
      return { valid: false, reason: 'License key is registered to a different computer.' };
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

    return { valid: true, expiry };
  } catch (err) {
    return { valid: false, reason: 'Failed to decode or verify license key.' };
  }
}

function isAppLicensed() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license_key'").get();
    if (!row || !row.value) return false;

    const verification = verifyLicenseKey(row.value);
    return verification.valid;
  } catch (err) {
    console.error('App license check error:', err);
    return false;
  }
}

module.exports = {
  getHardwareId,
  verifyLicenseKey,
  isAppLicensed
};
