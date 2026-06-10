const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const privateKeyPath = path.join(__dirname, 'private.pem');

if (!fs.existsSync(privateKeyPath)) {
  console.error('Error: Private key not found. Please run "node scripts/generate-keys.js" first.');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('\nUsage: node scripts/generate-license.js <Hardware-ID> [Expiry-Date (YYYY-MM-DD or never)]');
  console.log('Example: node scripts/generate-license.js AMS-1A2B-3C4D-5E6F 2027-12-31\n');
  process.exit(1);
}

const hwid = args[0].trim().toUpperCase();
let expiry = args[1] ? args[1].trim() : 'never';

if (expiry.toLowerCase() === 'never') {
  expiry = '9999-12-31';
}

// Simple date format validation
if (expiry !== '9999-12-31' && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
  console.error('Error: Expiry date must be in YYYY-MM-DD format (or "never").');
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

// Construct payload to sign
const payload = `${hwid}|${expiry}`;

// Sign the payload
const sign = crypto.createSign('SHA256');
sign.update(payload);
sign.end();
const signature = sign.sign(privateKey, 'base64');

// Construct final license key as base64 JSON
const licenseObj = {
  hwid,
  expiry,
  signature
};

const licenseKey = 'AMS-LIC-' + Buffer.from(JSON.stringify(licenseObj)).toString('base64');

console.log('\n=============================================================');
console.log('LICENSE KEY GENERATED SUCCESSFULLY');
console.log('=============================================================');
console.log(`Hardware ID : ${hwid}`);
console.log(`Expires On  : ${expiry === '9999-12-31' ? 'Lifetime (Never)' : expiry}`);
console.log('\nLICENSE KEY:');
console.log(licenseKey);
console.log('=============================================================\n');
