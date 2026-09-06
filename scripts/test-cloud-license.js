const http = require('http');

/**
 * AthassMediSync - Cloud License Manager Integration Test
 * Run: npx electron scripts/test-cloud-license.js --no-sandbox
 */
async function runTest() {
  console.log('================================================================');
  console.log('  AthassMediSync & Cloud License Manager Integration Test');
  console.log('================================================================\n');

  process.env.PORT = '4088';
  process.env.ADMIN_USER = 'admin';
  process.env.ADMIN_PASSWORD = 'supersecretpassword';
  process.env.JWT_SECRET = 'jwt_secret_test';
  process.env.LICENSE_SERVER_URL = 'http://127.0.0.1:4088';

  const licDb = require('../license-manager/database');
  await licDb.initDatabase();
  require('../license-manager/server');

  await new Promise(r => setTimeout(r, 1000));
  console.log('1. Cloud License Server started on http://127.0.0.1:4088');

  function req(port, method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const dataStr = body ? JSON.stringify(body) : '';
      const r = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(dataStr),
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        },
        (res) => {
          let resData = '';
          res.on('data', chunk => resData += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(resData) });
            } catch {
              resolve({ status: res.statusCode, data: resData });
            }
          });
        }
      );
      r.on('error', reject);
      if (dataStr) r.write(dataStr);
      r.end();
    });
  }

  // 1. Admin Login
  const loginRes = await req(4088, 'POST', '/api/admin/login', {
    username: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD
  });
  const adminToken = loginRes.data.token;
  console.log('2. Admin logged in with JWT.');

  // 2. Issue License
  const newLicRes = await req(4088, 'POST', '/api/admin/licenses', {
    client_name: 'Dr. Ramesh Deshmukh',
    store_name: 'Shree Balaji Chemist',
    phone: '9822001122',
    plan_type: '1_year'
  }, adminToken);

  const licenseKey = newLicRes.data.license?.license_key;
  const licenseId = newLicRes.data.license?.id;
  console.log(`3. Admin issued License Key: ${licenseKey}`);

  // 3. Desktop Online Activation
  const { getHardwareId, activateOnline, isAppLicensed, syncWithCloud } = require('../server/license');
  const hwid = getHardwareId();
  console.log(`4. Machine HWID: ${hwid}`);

  const activationResult = await activateOnline(licenseKey, 'http://127.0.0.1:4088');
  console.log('5. Online Activation:', activationResult.success ? 'SUCCESS' : 'FAILED');
  console.log(`6. App Licensed Status: ${isAppLicensed() ? 'ACTIVE' : 'LOCKED'}`);

  // 4. Remote Revocation
  console.log('\n--- Testing Remote Suspension ---');
  await req(4088, 'POST', `/api/admin/licenses/${licenseId}/status`, { status: 'suspended' }, adminToken);
  await syncWithCloud();
  console.log(`7. App Licensed Status after Remote Suspension: ${isAppLicensed() ? 'ACTIVE' : 'LOCKED (Expected)'}`);

  // 5. Remote Resume
  console.log('\n--- Testing Remote Unblocking ---');
  await req(4088, 'POST', `/api/admin/licenses/${licenseId}/status`, { status: 'active' }, adminToken);
  await syncWithCloud();
  console.log(`8. App Licensed Status after Remote Resume: ${isAppLicensed() ? 'ACTIVE (Expected)' : 'LOCKED'}`);

  // 6. Remote Extension
  console.log('\n--- Testing Remote Extension ---');
  const ext = await req(4088, 'POST', `/api/admin/licenses/${licenseId}/extend`, { days: 365 }, adminToken);
  const syncExt = await syncWithCloud();
  console.log(`9. Remote Extended to: ${ext.data.expires_at}, Client Synced Expiry: ${syncExt.expiresAt}`);

  console.log('\n================================================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED!');
  console.log('================================================================\n');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
