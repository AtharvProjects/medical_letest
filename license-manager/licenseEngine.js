const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let cachedPrivateKey = null;

function getPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;

  // 1. Environment variable (Recommended for Render)
  if (process.env.RSA_PRIVATE_KEY) {
    cachedPrivateKey = process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
    return cachedPrivateKey;
  }

  // 2. Local file
  const keyPath = path.join(__dirname, 'private.pem');
  if (fs.existsSync(keyPath)) {
    cachedPrivateKey = fs.readFileSync(keyPath, 'utf8');
    return cachedPrivateKey;
  }

  // 3. Fallback to scripts directory
  const fallbackPath = path.join(__dirname, '..', 'scripts', 'private.pem');
  if (fs.existsSync(fallbackPath)) {
    cachedPrivateKey = fs.readFileSync(fallbackPath, 'utf8');
    return cachedPrivateKey;
  }

  throw new Error('RSA Private Key not found! Set RSA_PRIVATE_KEY env or provide private.pem.');
}

function generateLicenseKey(prefix = 'AMS-PRO') {
  // Generate random 8-character hex or alphanumeric
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let segment1 = '';
  let segment2 = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i++) {
    segment1 += chars[bytes[i] % chars.length];
  }
  for (let i = 4; i < 8; i++) {
    segment2 += chars[bytes[i] % chars.length];
  }
  return `${prefix}-${segment1}-${segment2}`;
}

function generateSignedOfflineKey(hwid, expiry) {
  if (!hwid) throw new Error('HWID is required to generate an offline cryptographic key.');
  const privateKey = getPrivateKey();

  const formattedHwid = hwid.trim().toUpperCase();
  const formattedExpiry = expiry || '9999-12-31';

  const payload = `${formattedHwid}|${formattedExpiry}`;
  const sign = crypto.createSign('SHA256');
  sign.update(payload);
  sign.end();
  const signature = sign.sign(privateKey, 'base64');

  const licenseObj = {
    hwid: formattedHwid,
    expiry: formattedExpiry,
    signature
  };

  return 'AMS-LIC-' + Buffer.from(JSON.stringify(licenseObj)).toString('base64');
}

function calculateExpiryDate(planType, customDate = null) {
  if (planType === 'lifetime') return '9999-12-31';
  if (planType === 'custom' && customDate) return customDate;

  const now = new Date();
  let daysToAdd = 365;

  switch (planType) {
    case 'trial_7':
      daysToAdd = 7;
      break;
    case 'trial_14':
      daysToAdd = 14;
      break;
    case '1_month':
      daysToAdd = 30;
      break;
    case '3_months':
      daysToAdd = 90;
      break;
    case '6_months':
      daysToAdd = 180;
      break;
    case '1_year':
      daysToAdd = 365;
      break;
    default:
      daysToAdd = 365;
  }

  now.setDate(now.getDate() + daysToAdd);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extendDate(currentExpiry, daysToAdd) {
  if (daysToAdd === 'lifetime') return '9999-12-31';

  let baseDate = new Date();
  if (currentExpiry && currentExpiry !== '9999-12-31') {
    const parsed = new Date(currentExpiry);
    // If current expiry is still in the future, extend from that date
    if (parsed > baseDate) {
      baseDate = parsed;
    }
  }

  baseDate.setDate(baseDate.getDate() + parseInt(daysToAdd, 10));
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  const day = String(baseDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isExpired(expiry) {
  if (!expiry || expiry === '9999-12-31') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  exp.setHours(23, 59, 59, 999);
  return today > exp;
}

module.exports = {
  getPrivateKey,
  generateLicenseKey,
  generateSignedOfflineKey,
  calculateExpiryDate,
  extendDate,
  isExpired
};
