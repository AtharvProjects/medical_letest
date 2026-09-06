require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, get, all, run, query, hashPassword, generateSalt } = require('./database');
const { requireAuth, generateToken, verifyLogin } = require('./auth');
const {
  generateLicenseKey,
  generateSignedOfflineKey,
  calculateExpiryDate,
  extendDate,
  isExpired
} = require('./licenseEngine');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Client IP resolver helper
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'Unknown IP'
  );
}

// Log action helper
async function logAction(licenseId, action, details, ip) {
  try {
    await run(
      'INSERT INTO logs (license_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [licenseId || null, action, details || '', ip || '']
    );
  } catch (e) {
    console.error('[Log Error]', e.message);
  }
}

// ==========================================
// 1. HEALTH & PUBLIC PING
// ==========================================
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AthassMediSync Cloud License Manager',
    time: new Date().toISOString()
  });
});

// ==========================================
// 2. ADMIN AUTHENTICATION
// ==========================================
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const admin = await verifyLogin(username.trim(), password);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(admin);
    res.json({
      success: true,
      token,
      admin: { id: admin.id, username: admin.username }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ admin: req.admin });
});

app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  try {
    const admin = await get('SELECT * FROM admin_users WHERE id = ?', [req.admin.id]);
    if (!admin) return res.status(404).json({ error: 'Admin user not found' });

    const currentHash = hashPassword(currentPassword, admin.salt);
    if (currentHash !== admin.password_hash) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword, newSalt);
    await run(
      'UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?',
      [newHash, newSalt, req.admin.id]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. ADMIN STATS & LICENSES
// ==========================================
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const licenses = await all('SELECT * FROM licenses');
    let total = licenses.length;
    let active = 0;
    let expired = 0;
    let suspended = 0;

    for (const lic of licenses) {
      if (lic.status === 'suspended' || lic.status === 'revoked') {
        suspended++;
      } else if (isExpired(lic.expires_at)) {
        expired++;
      } else {
        active++;
      }
    }

    res.json({ total, active, expired, suspended });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/licenses', requireAuth, async (req, res) => {
  const { search, status } = req.query;
  try {
    let sql = 'SELECT * FROM licenses ORDER BY id DESC';
    let licenses = await all(sql);

    // Auto-update expired status display
    licenses = licenses.map((lic) => {
      let currentStatus = lic.status;
      if (currentStatus === 'active' && isExpired(lic.expires_at)) {
        currentStatus = 'expired';
      }
      return { ...lic, effective_status: currentStatus };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      licenses = licenses.filter(
        (l) =>
          l.client_name?.toLowerCase().includes(q) ||
          l.store_name?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q) ||
          l.license_key?.toLowerCase().includes(q) ||
          l.hwid?.toLowerCase().includes(q)
      );
    }

    if (status && status !== 'all') {
      licenses = licenses.filter((l) => l.effective_status === status);
    }

    res.json({ licenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/licenses', requireAuth, async (req, res) => {
  const {
    client_name,
    store_name,
    phone,
    email,
    plan_type,
    custom_expiry,
    max_devices,
    hwid,
    notes
  } = req.body;

  if (!client_name || !store_name) {
    return res.status(400).json({ error: 'Client Name and Store Name are required.' });
  }

  try {
    const license_key = generateLicenseKey();
    const expires_at = calculateExpiryDate(plan_type || '1_year', custom_expiry);
    const cleanHwid = hwid ? hwid.trim().toUpperCase() : '';
    const cleanPhone = phone ? phone.trim() : '';

    await run(
      `INSERT INTO licenses 
       (license_key, client_name, store_name, phone, email, status, plan_type, expires_at, hwid, max_devices, notes)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [
        license_key,
        client_name.trim(),
        store_name.trim(),
        cleanPhone,
        email ? email.trim() : '',
        plan_type || '1_year',
        expires_at,
        cleanHwid,
        parseInt(max_devices, 10) || 1,
        notes ? notes.trim() : ''
      ]
    );

    const created = await get('SELECT * FROM licenses WHERE license_key = ?', [license_key]);
    await logAction(created.id, 'CREATE_LICENSE', `Created for ${client_name} (${store_name})`, getClientIp(req));

    // If HWID was given right away, generate the offline key too
    let offlineKey = null;
    if (cleanHwid) {
      try {
        offlineKey = generateSignedOfflineKey(cleanHwid, expires_at);
      } catch (e) {}
    }

    res.status(201).json({
      success: true,
      license: created,
      offlineKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/licenses/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { client_name, store_name, phone, email, max_devices, notes, expires_at, status } = req.body;

  try {
    const existing = await get('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'License not found' });

    await run(
      `UPDATE licenses SET 
        client_name = ?, store_name = ?, phone = ?, email = ?, 
        max_devices = ?, notes = ?, expires_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        client_name !== undefined ? client_name.trim() : existing.client_name,
        store_name !== undefined ? store_name.trim() : existing.store_name,
        phone !== undefined ? phone.trim() : existing.phone,
        email !== undefined ? email.trim() : existing.email,
        max_devices !== undefined ? parseInt(max_devices, 10) : existing.max_devices,
        notes !== undefined ? notes.trim() : existing.notes,
        expires_at !== undefined ? expires_at : existing.expires_at,
        status !== undefined ? status : existing.status,
        id
      ]
    );

    const updated = await get('SELECT * FROM licenses WHERE id = ?', [id]);
    res.json({ success: true, license: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/licenses/:id/extend', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { days, customDate } = req.body;

  try {
    const lic = await get('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!lic) return res.status(404).json({ error: 'License not found' });

    let newExpiry = null;
    if (days === 'custom' && customDate) {
      newExpiry = customDate;
    } else {
      newExpiry = extendDate(lic.expires_at, days);
    }

    await run(
      'UPDATE licenses SET expires_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newExpiry, 'active', id]
    );

    await logAction(id, 'EXTEND_LICENSE', `Extended to ${newExpiry} (+${days} days)`, getClientIp(req));

    // If HWID is bound, generate updated offline key
    let offlineKey = null;
    if (lic.hwid) {
      try {
        offlineKey = generateSignedOfflineKey(lic.hwid, newExpiry);
      } catch (e) {}
    }

    res.json({
      success: true,
      message: `License extended to ${newExpiry}`,
      expires_at: newExpiry,
      offlineKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/licenses/:id/status', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  if (!['active', 'suspended', 'revoked'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be active, suspended, or revoked.' });
  }

  try {
    const lic = await get('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!lic) return res.status(404).json({ error: 'License not found' });

    await run(
      'UPDATE licenses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
    await logAction(id, 'CHANGE_STATUS', `Status changed to ${status}`, getClientIp(req));

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/licenses/:id/reset-hwid', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const lic = await get('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!lic) return res.status(404).json({ error: 'License not found' });

    const oldHwid = lic.hwid;
    await run(
      'UPDATE licenses SET hwid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['', id]
    );
    await logAction(id, 'RESET_HWID', `HWID reset (was ${oldHwid})`, getClientIp(req));

    res.json({ success: true, message: 'Hardware binding reset successfully. Client can now activate on a new machine.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/licenses/:id/offline-key', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const lic = await get('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!lic) return res.status(404).json({ error: 'License not found' });

    const hwid = req.query.hwid || lic.hwid;
    if (!hwid) {
      return res.status(400).json({ error: 'No hardware ID is associated with this license yet. Please enter HWID.' });
    }

    const offlineKey = generateSignedOfflineKey(hwid, lic.expires_at);
    res.json({
      success: true,
      offlineKey,
      hwid,
      expires_at: lic.expires_at,
      client_name: lic.client_name,
      store_name: lic.store_name
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/licenses/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const lic = await get('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!lic) return res.status(404).json({ error: 'License not found' });

    await run('DELETE FROM licenses WHERE id = ?', [id]);
    await logAction(id, 'DELETE_LICENSE', `Deleted license ${lic.license_key} (${lic.client_name})`, getClientIp(req));

    res.json({ success: true, message: 'License deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// JSON Backup / Restore
app.get('/api/admin/export', requireAuth, async (req, res) => {
  try {
    const licenses = await all('SELECT * FROM licenses');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="athass_licenses_backup_${Date.now()}.json"`);
    res.send(JSON.stringify({ exported_at: new Date().toISOString(), count: licenses.length, licenses }, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/import', requireAuth, async (req, res) => {
  const { licenses } = req.body;
  if (!Array.isArray(licenses)) {
    return res.status(400).json({ error: 'Invalid format. Expected { licenses: [...] }' });
  }

  try {
    let imported = 0;
    for (const lic of licenses) {
      if (!lic.license_key || !lic.client_name || !lic.store_name) continue;
      const existing = await get('SELECT id FROM licenses WHERE license_key = ?', [lic.license_key]);
      if (!existing) {
        await run(
          `INSERT INTO licenses (license_key, client_name, store_name, phone, email, status, plan_type, expires_at, hwid, max_devices, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lic.license_key,
            lic.client_name,
            lic.store_name,
            lic.phone || '',
            lic.email || '',
            lic.status || 'active',
            lic.plan_type || '1_year',
            lic.expires_at || '9999-12-31',
            lic.hwid || '',
            lic.max_devices || 1,
            lic.notes || ''
          ]
        );
        imported++;
      }
    }
    res.json({ success: true, message: `Imported ${imported} licenses.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. CLIENT DESKTOP APP ENDPOINTS
// ==========================================

/**
 * Direct Online Activation from Desktop App
 * Called by client app: POST /api/v1/client/activate
 * Body: { licenseKey, hwid, storeName, appVersion }
 */
app.post('/api/v1/client/activate', async (req, res) => {
  const { licenseKey, hwid, storeName, appVersion } = req.body;
  const ip = getClientIp(req);

  if (!licenseKey || !hwid) {
    return res.status(400).json({ error: 'Both licenseKey and hwid are required.' });
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const cleanHwid = hwid.trim().toUpperCase();

  try {
    const lic = await get('SELECT * FROM licenses WHERE UPPER(license_key) = ?', [cleanKey]);
    if (!lic) {
      return res.status(404).json({ error: 'License key not found. Please verify your activation code.' });
    }

    if (lic.status === 'suspended' || lic.status === 'revoked') {
      return res.status(403).json({ error: 'This license has been suspended or revoked by the administrator.' });
    }

    if (isExpired(lic.expires_at)) {
      return res.status(403).json({ error: `This license expired on ${lic.expires_at}. Please contact support for renewal.` });
    }

    // Check Hardware ID binding
    if (!lic.hwid) {
      // First machine activation: bind this HWID!
      await run(
        'UPDATE licenses SET hwid = ?, last_ping = CURRENT_TIMESTAMP, ip_address = ?, app_version = ? WHERE id = ?',
        [cleanHwid, ip, appVersion || '', lic.id]
      );
    } else if (lic.hwid !== cleanHwid) {
      return res.status(403).json({
        error: 'This license key is already registered to a different computer. Please contact your software provider to transfer or reset the license.'
      });
    } else {
      // Already bound to this machine, refresh ping
      await run(
        'UPDATE licenses SET last_ping = CURRENT_TIMESTAMP, ip_address = ?, app_version = ? WHERE id = ?',
        [ip, appVersion || '', lic.id]
      );
    }

    // Generate cryptographic RSA signature for seamless offline persistence
    const offlineLicenseKey = generateSignedOfflineKey(cleanHwid, lic.expires_at);

    await logAction(lic.id, 'ONLINE_ACTIVATION', `Activated on machine ${cleanHwid} (v${appVersion || '1.0'})`, ip);

    res.json({
      success: true,
      status: 'active',
      clientName: lic.client_name,
      storeName: lic.store_name,
      expiresAt: lic.expires_at,
      offlineLicenseKey,
      message: 'AthassMediSync license activated successfully!'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Periodic Heartbeat & Silent Verification
 * Called by client app on startup or daily: POST /api/v1/client/verify
 * Body: { licenseKey, hwid, appVersion }
 */
app.post('/api/v1/client/verify', async (req, res) => {
  const { licenseKey, hwid, appVersion } = req.body;
  const ip = getClientIp(req);

  if (!licenseKey) {
    return res.status(400).json({ error: 'License key is required.' });
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const cleanHwid = hwid ? hwid.trim().toUpperCase() : '';

  try {
    const lic = await get('SELECT * FROM licenses WHERE UPPER(license_key) = ?', [cleanKey]);
    if (!lic) {
      return res.status(404).json({ valid: false, status: 'invalid', message: 'License key not recognized.' });
    }

    // Update heartbeat
    await run(
      'UPDATE licenses SET last_ping = CURRENT_TIMESTAMP, ip_address = ?, app_version = ? WHERE id = ?',
      [ip, appVersion || '', lic.id]
    );

    if (lic.status === 'suspended' || lic.status === 'revoked') {
      return res.json({
        valid: false,
        status: 'suspended',
        message: 'This software license has been suspended by the administrator.'
      });
    }

    if (isExpired(lic.expires_at)) {
      return res.json({
        valid: false,
        status: 'expired',
        expiresAt: lic.expires_at,
        message: `License expired on ${lic.expires_at}.`
      });
    }

    if (cleanHwid && lic.hwid && lic.hwid !== cleanHwid) {
      return res.json({
        valid: false,
        status: 'device_mismatch',
        message: 'Hardware mismatch detected.'
      });
    }

    // Refresh offline signed token in case expiry was extended remotely!
    let offlineLicenseKey = null;
    if (cleanHwid || lic.hwid) {
      try {
        offlineLicenseKey = generateSignedOfflineKey(cleanHwid || lic.hwid, lic.expires_at);
      } catch (e) {}
    }

    res.json({
      valid: true,
      status: 'active',
      clientName: lic.client_name,
      storeName: lic.store_name,
      expiresAt: lic.expires_at,
      offlineLicenseKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all route to serve dashboard SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database & start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log('======================================================');
    console.log(`🚀 AthassMediSync License Manager is running on port ${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log('======================================================');
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
