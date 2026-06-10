const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ensure scripts directory exists
const scriptsDir = __dirname;
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

console.log('Generating RSA-2048 Key Pair for AthassMediSync Licensing...');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

const privateKeyPath = path.join(scriptsDir, 'private.pem');
const publicKeyPath = path.join(scriptsDir, 'public.pem');

fs.writeFileSync(privateKeyPath, privateKey, 'utf8');
fs.writeFileSync(publicKeyPath, publicKey, 'utf8');

console.log('\nKeys generated successfully!');
console.log(`- Private Key saved to: ${privateKeyPath}`);
console.log(`- Public Key saved to: ${publicKeyPath}`);
console.log('\n-------------------------------------------------------------');
console.log('COPY the public key below and paste it in "server/license.js":');
console.log('-------------------------------------------------------------');
console.log(publicKey.trim());
console.log('-------------------------------------------------------------');
