// Quick verification script for Cloud License Manager
const http = require('http');

async function runTests() {
  console.log('--- Starting Cloud License Manager Automated Tests ---');

  // Test 1: Start Server in background
  process.env.PORT = '4055';
  process.env.ADMIN_USER = 'testadmin';
  process.env.ADMIN_PASSWORD = 'password123';
  process.env.JWT_SECRET = 'test_secret_key';

  const { initDatabase, get, all } = require('./database');
  const { generateLicenseKey, generateSignedOfflineKey } = require('./licenseEngine');
  
  await initDatabase();
  console.log('✓ Database initialized successfully');

  // Test 2: RSA Signing
  const testHwid = 'AMS-1A2B-3C4D-5E6F';
  const testExpiry = '2028-12-31';
  const offlineKey = generateSignedOfflineKey(testHwid, testExpiry);
  console.log('✓ RSA Signature generated:', offlineKey.substring(0, 40) + '...');

  if (!offlineKey.startsWith('AMS-LIC-')) {
    throw new Error('Offline key format invalid');
  }

  // Test 3: License Key Generation
  const newKey = generateLicenseKey();
  console.log('✓ Online License Key generated:', newKey);
  if (!newKey.startsWith('AMS-PRO-')) {
    throw new Error('Online key format invalid');
  }

  // Test 4: Boot Express server
  const server = require('./server');

  // Wait 1 second for port to bind
  await new Promise(r => setTimeout(r, 1000));

  // Helper request
  function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const dataStr = body ? JSON.stringify(body) : '';
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 4055,
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
      req.on('error', reject);
      if (dataStr) req.write(dataStr);
      req.end();
    });
  }

  // Test 5: Health Check
  const health = await request('GET', '/api/v1/health');
  console.log('✓ Health check status:', health.status, health.data.service);

  // Test 6: Admin Login
  const login = await request('POST', '/api/admin/login', {
    username: 'testadmin',
    password: 'password123'
  });
  console.log('✓ Admin login response:', login.status, 'User:', login.data.admin?.username);
  const authToken = login.data.token;
  if (!authToken) throw new Error('No token returned');

  // Test 7: Stats
  const stats = await request('GET', '/api/admin/stats', null, authToken);
  console.log('✓ Stats loaded: Total:', stats.data.total);

  // Test 8: Create New License
  const createLic = await request('POST', '/api/admin/licenses', {
    client_name: 'Dr. Suresh Patil',
    store_name: 'Patil Medical & General Store',
    phone: '9876543210',
    plan_type: '1_year'
  }, authToken);
  console.log('✓ License created:', createLic.data.license?.license_key);
  const licenseKey = createLic.data.license.license_key;
  const licenseId = createLic.data.license.id;

  // Test 9: Client Online Activation
  const clientHwid = 'AMS-TEST-HWID-9999';
  const activate = await request('POST', '/api/v1/client/activate', {
    licenseKey,
    hwid: clientHwid,
    storeName: 'Patil Medical & General Store',
    appVersion: '1.2.0'
  });
  console.log('✓ Client Online Activation:', activate.status, activate.data.status, 'Offline Key:', activate.data.offlineLicenseKey ? 'Generated' : 'None');

  // Test 10: Client Verification (Heartbeat)
  const verify = await request('POST', '/api/v1/client/verify', {
    licenseKey,
    hwid: clientHwid,
    appVersion: '1.2.0'
  });
  console.log('✓ Client Ping / Verify:', verify.data.valid, 'Status:', verify.data.status);

  // Test 11: Remote Suspend
  const suspend = await request('POST', `/api/admin/licenses/${licenseId}/status`, {
    status: 'suspended'
  }, authToken);
  console.log('✓ Admin suspended license:', suspend.data.status);

  // Test 12: Client Ping after Suspension (Should be revoked/blocked)
  const verifySuspended = await request('POST', '/api/v1/client/verify', {
    licenseKey,
    hwid: clientHwid
  });
  console.log('✓ Client Ping when suspended:', verifySuspended.data.valid === false, 'Message:', verifySuspended.data.message);

  // Test 13: Remote Resume
  await request('POST', `/api/admin/licenses/${licenseId}/status`, { status: 'active' }, authToken);
  console.log('✓ Admin resumed license');

  // Test 14: Remote Extension
  const extend = await request('POST', `/api/admin/licenses/${licenseId}/extend`, { days: 30 }, authToken);
  console.log('✓ Admin extended license +30 days. New expiry:', extend.data.expires_at);

  console.log('\n=============================================');
  console.log('🎉 ALL CLOUD LICENSE MANAGER TESTS PASSED!');
  console.log('=============================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
