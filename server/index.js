const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const db = require('./db');
const { initWhatsApp } = require('./whatsapp');
const { encrypt, decrypt } = require('./encryption');

const { createBackup, maybeAutoBackup, listBackups, deleteBackup } = require('./backup');
const { splitInclusive, round2, perUnitCost } = require('./money');
const { logAction } = require('./audit');
const { parseCSV, toCSV, normalizeDate } = require('./csv');

// Per-line COGS as a SQL expression, shared by every profit/margin query so the
// costing stays identical everywhere. `ii`=invoice_items, `b`=batches, `m`=medicines.
// purchase_rate is per STRIP; for tablet-like categories divide it by the strip
// size (prefer the tps captured on the sale row) to get the true per-unit cost.
const LINE_COGS_SQL = `(ii.quantity * (b.purchase_rate / CASE WHEN m.unit_category IN ('Tablet','Capsule','Strip') THEN COALESCE(NULLIF(ii.tablets_per_strip,0), NULLIF(m.tablets_per_strip,0), 1) ELSE 1 END))`;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for PDF base64
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.text({ limit: '50mb', type: 'text/csv' }));

const { getHardwareId, verifyLicenseKey, isAppLicensed } = require('./license');

// License Check Middleware
app.use((req, res, next) => {
  // Allow license endpoints without checking license status
  if (req.path === '/api/license/status' || req.path === '/api/license/activate') {
    return next();
  }

  if (req.path.startsWith('/api/') && !isAppLicensed()) {
    return res.status(402).json({
      error: 'License Required',
      licensed: false,
      hardwareId: getHardwareId()
    });
  }
  next();
});

// ============ LICENSE ENDPOINTS ============
app.get('/api/license/status', (req, res) => {
  try {
    const licensed = isAppLicensed();
    const hwid = getHardwareId();
    let expiry = null;

    if (licensed) {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'license_key'").get();
      if (row && row.value) {
        const decoded = verifyLicenseKey(row.value);
        expiry = decoded.expiry;
      }
    }

    res.json({
      licensed,
      hardwareId: hwid,
      expiry
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/license/activate', (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'License key is required.' });
  }

  try {
    const verification = verifyLicenseKey(key);
    if (!verification.valid) {
      return res.status(400).json({ error: verification.reason });
    }

    // Save key to settings database table
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(key);
    logAction('LICENSE_ACTIVATED', 'System', null, null, { expiry: verification.expiry });

    res.json({
      success: true,
      message: 'Software activated successfully!',
      expiry: verification.expiry
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize WhatsApp
initWhatsApp(app);

// Automatic Startup Backup (throttled + pruned so the folder can't grow unbounded)
maybeAutoBackup().then(res => {
  if (res && res.skipped) console.log('Auto-backup skipped:', res.reason);
  else if (res && res.filename) console.log('Auto-backup created:', res.filename);
}).catch(err => {
  console.error('Auto-backup failed:', err);
});

// ============ AUDIT & BACKUPS ============
app.get('/api/backups', async (req, res) => {
  try {
    res.json(listBackups());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    const result = await createBackup('Manual');
    logAction('BACKUP_CREATED', 'System', null, null, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/backups/:id', (req, res) => {
  try {
    deleteBackup(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/locate', (req, res) => {
  try {
    const dbPath = db.DB_PATH;
    const folderPath = require('path').dirname(dbPath);
    let command = '';

    if (process.platform === 'win32') {
      command = `explorer /select,"${dbPath}"`;
    } else if (process.platform === 'darwin') {
      command = `open -R "${dbPath}"`;
    } else {
      command = `xdg-open "${folderPath}"`;
    }

    exec(command, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to open folder: ' + err.message });
      res.json({ success: true, path: dbPath });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-logs', (req, res) => {
  const { limit = 100 } = req.query;
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(parseInt(limit));
  res.json(logs);
});

// ============ DASHBOARD ============
app.get('/api/dashboard', (req, res) => {
  try {
    // Use the LOCAL calendar day/month — invoices store created_at via
    // datetime('now','localtime'), so a UTC "today" was wrong before ~05:30 IST.
    const today = db.prepare("SELECT date('now','localtime') as d").get().d;
    const monthStart = today.slice(0, 8) + '01';

    // Alert thresholds come from Settings (fall back to sane defaults).
    const lowStockRow = db.prepare("SELECT value FROM settings WHERE key='low_stock_threshold'").get();
    const lowStockThreshold = lowStockRow && !isNaN(parseInt(lowStockRow.value, 10)) ? parseInt(lowStockRow.value, 10) : 10;
    const expiryRow = db.prepare("SELECT value FROM settings WHERE key='expiry_alert_days'").get();
    const expiryDays = expiryRow && !isNaN(parseInt(expiryRow.value, 10)) ? parseInt(expiryRow.value, 10) : 90;

    // Today's stats
    const todayStats = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_mode)) = 'cash' THEN total_amount ELSE 0 END), 0) as cash,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_mode)) = 'upi' THEN total_amount ELSE 0 END), 0) as upi,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_mode)) IN ('pending','udhaari') THEN total_amount ELSE 0 END), 0) as credit
      FROM invoices WHERE date(created_at) = ?
    `).get(today);

    // Monthly stats
    const monthlySales = db.prepare(`
      SELECT COALESCE(SUM(total_amount),0) as total FROM invoices
      WHERE date(created_at) >= ?
    `).get(monthStart);

    const monthlyPurchases = db.prepare(`
      SELECT COALESCE(SUM(total_amount),0) as total FROM purchases
      WHERE date(purchase_date) >= ?
    `).get(monthStart);

    // Real gross profit for the month = net (ex-GST) revenue of items sold − their COGS.
    // This is a true margin, not the sales−purchases cashflow it used to show (a big
    // restock month would otherwise look like a loss).
    const monthlyProfit = db.prepare(`
      SELECT COALESCE(SUM(ii.total) - SUM(${LINE_COGS_SQL}), 0) as total
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      JOIN batches b ON b.id = ii.batch_id
      JOIN medicines m ON m.id = ii.medicine_id
      WHERE date(i.created_at) >= ?
    `).get(monthStart);

    // Low stock (total stock at or below the configured threshold, across all batches)
    const lowStock = db.prepare(`
      SELECT m.brand_name, m.company_name, COALESCE(SUM(b.quantity),0) as total_stock
      FROM medicines m
      LEFT JOIN batches b ON b.medicine_id = m.id
      WHERE m.is_active = 1
      GROUP BY m.id
      HAVING total_stock <= ?
      ORDER BY total_stock ASC
      LIMIT 10
    `).all(lowStockThreshold);

    // Expiring within the configured alert window (expiry_alert_days)
    const expiring = db.prepare(`
      SELECT m.brand_name, b.batch_number, b.expiry_date, b.quantity
      FROM batches b JOIN medicines m ON m.id = b.medicine_id
      WHERE b.quantity > 0 AND b.expiry_date <= date('now', 'localtime', '+' || ? || ' days')
      ORDER BY b.expiry_date ASC
      LIMIT 10
    `).all(expiryDays);

    // Fast moving (last 30 days)
    const fastMoving = db.prepare(`
      SELECT m.brand_name, m.company_name, SUM(ii.quantity) as total_sold
      FROM invoice_items ii
      JOIN medicines m ON ii.medicine_id = m.id
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE date(i.created_at) >= date('now', 'localtime', '-30 days')
      GROUP BY m.id
      ORDER BY total_sold DESC
      LIMIT 8
    `).all();

    // Recent invoices
    const recentInvoices = db.prepare(`
      SELECT i.id, i.invoice_number, i.total_amount, i.payment_mode, c.name as customer_name
      FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
      ORDER BY i.created_at DESC LIMIT 8
    `).all();

    // Total outstanding credit
    const outstanding = db.prepare(`SELECT COALESCE(SUM(credit_balance),0) as total FROM customers WHERE credit_balance > 0`).get();

    res.json({
      today: {
        total: todayStats.total,
        count: todayStats.count,
        cash: todayStats.cash,
        upi: todayStats.upi,
        credit: todayStats.credit
      },
      monthly: {
        sales: monthlySales.total,
        purchases: monthlyPurchases.total,
        profit: monthlyProfit.total
      },
      lowStock,
      expiring,
      fastMoving,
      recentInvoices,
      totalOutstanding: outstanding.total
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ REPORTS ============
app.get('/api/reports/gst', (req, res) => {
  const { from, to } = req.query;
  try {
    const sales = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, 
             SUM(subtotal) as taxable_value, 
             SUM(gst_amount) as total_gst, 
             SUM(total_amount) as total_sales
      FROM invoices
      WHERE date(created_at) BETWEEN ? AND ?
      GROUP BY month
      ORDER BY month DESC
    `).all(from, to);

    const breakup = db.prepare(`
      SELECT invoice_items.gst_percent AS gst_percent,
             ROUND(SUM(invoice_items.total), 2) as taxable_value,
             ROUND(SUM(CASE WHEN invoices.is_interstate = 1 THEN 0 ELSE invoice_items.gst_amount / 2 END), 2) as cgst,
             ROUND(SUM(CASE WHEN invoices.is_interstate = 1 THEN 0 ELSE invoice_items.gst_amount / 2 END), 2) as sgst,
             ROUND(SUM(CASE WHEN invoices.is_interstate = 1 THEN invoice_items.gst_amount ELSE 0 END), 2) as igst,
             ROUND(SUM(invoice_items.gst_amount), 2) as gst_amount
      FROM invoice_items
      JOIN invoices ON invoices.id = invoice_items.invoice_id
      WHERE date(invoices.created_at) BETWEEN ? AND ?
      GROUP BY invoice_items.gst_percent
    `).all(from, to);

    res.json({ sales, breakup });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/h1', (req, res) => {
  const { from, to } = req.query;
  try {
    const data = db.prepare(`
      SELECT i.invoice_number, i.created_at, h1.patient_name, h1.doctor_name, h1.doctor_reg_no, m.brand_name, it.quantity
      FROM invoice_h1_details h1
      JOIN invoices i ON i.id = h1.invoice_id
      JOIN invoice_items it ON it.invoice_id = i.id
      JOIN medicines m ON m.id = it.medicine_id
      WHERE m.is_h1 = 1 AND date(i.created_at) BETWEEN ? AND ?
    `).all(from, to);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/expiry', (req, res) => {
  const { days = 90 } = req.query;
  try {
    const data = db.prepare(`
      SELECT m.brand_name, m.company_name, b.batch_number, b.expiry_date, b.quantity
      FROM batches b
      JOIN medicines m ON m.id = b.medicine_id
      WHERE b.quantity > 0 AND b.expiry_date <= date('now', '+' || ? || ' days')
      ORDER BY b.expiry_date ASC
    `).all(days);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/low-stock', (req, res) => {
  const { threshold = 10 } = req.query;
  try {
    const data = db.prepare(`
      SELECT m.brand_name, m.company_name, m.unit_category, COALESCE(SUM(b.quantity), 0) as total_stock
      FROM medicines m
      LEFT JOIN batches b ON b.medicine_id = m.id
      WHERE m.is_active = 1
      GROUP BY m.id
      HAVING total_stock <= ?
      ORDER BY total_stock ASC
    `).all(threshold);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/sales-summary', (req, res) => {
  const { from, to } = req.query;
  try {
    const data = db.prepare(`
      SELECT i.invoice_number, i.created_at, c.name as customer_name, i.subtotal, i.gst_amount, i.total_amount, i.payment_mode
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE date(i.created_at) BETWEEN ? AND ?
      ORDER BY i.created_at DESC
    `).all(from, to);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/customer-credit', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT id, name, phone, address, credit_balance as current_balance
      FROM customers
      WHERE credit_balance > 0
      ORDER BY credit_balance DESC
    `).all().map(decryptCustomer);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/sales', (req, res) => {
  const { from, to } = req.query;
  try {
    const rows = db.prepare(`
      SELECT date(i.created_at) as date,
             COUNT(*) as invoice_count,
             SUM(i.total_amount) as revenue,
             SUM(i.gst_amount) as gst,
             SUM(i.discount_amount) as discount
      FROM invoices i
      WHERE date(i.created_at) BETWEEN ? AND ?
      GROUP BY date(i.created_at)
      ORDER BY date ASC
    `).all(from, to);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/profit', (req, res) => {
  const { from, to } = req.query;
  try {
    const rows = db.prepare(`
      SELECT date(i.created_at) as date,
             SUM(ii.total) as revenue,
             SUM(${LINE_COGS_SQL}) as cost
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      JOIN batches b ON b.id = ii.batch_id
      JOIN medicines m ON m.id = ii.medicine_id
      WHERE date(i.created_at) BETWEEN ? AND ?
      GROUP BY date(i.created_at)
      ORDER BY date ASC
    `).all(from, to);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/outstanding', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.phone, c.credit_balance as outstanding,
             COUNT(i.id) as invoice_count
      FROM customers c
      LEFT JOIN invoices i ON i.customer_id = c.id AND LOWER(TRIM(i.payment_mode)) IN ('pending','udhaari')
      WHERE c.credit_balance > 0
      GROUP BY c.id
      ORDER BY c.credit_balance DESC
    `).all().map(decryptCustomer);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/daily-chart', (req, res) => {
  try {
    // Zero-filled last 7 local days so the dashboard chart has no gaps.
    const rows = db.prepare(`
      WITH RECURSIVE dates(d) AS (
        SELECT date('now', 'localtime', '-6 days')
        UNION ALL
        SELECT date(d, '+1 day') FROM dates WHERE d < date('now', 'localtime')
      )
      SELECT dates.d as date,
             COALESCE(SUM(i.total_amount), 0) as total,
             COUNT(i.id) as count
      FROM dates
      LEFT JOIN invoices i ON date(i.created_at) = dates.d
      GROUP BY dates.d
      ORDER BY dates.d ASC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/h1-register', (req, res) => {
  const { from, to, medicine_search, doctor_search, patient_search } = req.query;
  try {
    let query = `
      SELECT i.invoice_number, i.created_at, h1.patient_name, h1.doctor_name,
             h1.doctor_reg_no, m.brand_name, it.quantity
      FROM invoice_h1_details h1
      JOIN invoices i ON i.id = h1.invoice_id
      JOIN invoice_items it ON it.invoice_id = i.id
      JOIN medicines m ON m.id = it.medicine_id
      WHERE m.is_h1 = 1 AND date(i.created_at) BETWEEN ? AND ?
    `;
    const params = [from || '2020-01-01', to || db.prepare("SELECT date('now','localtime') as d").get().d];
    if (medicine_search) { query += ' AND m.brand_name LIKE ?'; params.push(`%${medicine_search}%`); }
    if (doctor_search) { query += ' AND h1.doctor_name LIKE ?'; params.push(`%${doctor_search}%`); }
    if (patient_search) { query += ' AND h1.patient_name LIKE ?'; params.push(`%${patient_search}%`); }
    query += ' ORDER BY i.created_at DESC';
    res.json(db.prepare(query).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/download-pdf', (req, res) => {
  const { filename, base64 } = req.body;
  if (!filename || !base64) {
    return res.status(400).send('Filename and base64 data are required');
  }
  try {
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).send('Failed to generate download: ' + err.message);
  }
});

// ============ SETTINGS ============
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const txn = db.transaction((data) => {
    for (const [key, value] of Object.entries(data)) {
      update.run(key, String(value));
    }
  });
  txn(req.body);
  res.json({ success: true });
});


// ============ MEDICINES ============
// ============ MEDICINES ============
app.get('/api/medicines', (req, res) => {
  const { search, active_only, page, limit } = req.query;

  const conditions = [];
  const params = [];

  if (active_only !== 'false') {
    conditions.push('m.is_active = 1');
  }
  if (search) {
    const s = search.trim();
    conditions.push('(m.brand_name LIKE ? OR m.generic_name LIKE ? OR m.company_name LIKE ? OR m.alias LIKE ?)');
    params.push(`%${s}%`, `%${s}%`, `%${s}%`, `%${s}%`);
  }

  const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

  // Paginated query (fast server-side pagination for 100,000+ medicines)
  if (limit && limit !== 'all') {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * pageSize;

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM medicines m ${whereClause}`).get(...params);
    const total = countRow ? countRow.total : 0;

    const dataSql = `
      SELECT m.*, 
        COALESCE(SUM(b.quantity), 0) as total_stock,
        MIN(b.expiry_date) as nearest_expiry
      FROM medicines m
      LEFT JOIN batches b ON b.medicine_id = m.id
      ${whereClause}
      GROUP BY m.id
      ORDER BY (CASE WHEN m.alias IS NULL OR m.alias = '' THEN 1 ELSE 0 END), m.alias, m.brand_name
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataSql).all(...params, pageSize, offset);

    return res.json({
      data: rows,
      total,
      page: pageNum,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    });
  }

  // Non-paginated query
  let query = `
    SELECT m.*, 
      COALESCE(SUM(b.quantity), 0) as total_stock,
      MIN(b.expiry_date) as nearest_expiry
    FROM medicines m
    LEFT JOIN batches b ON b.medicine_id = m.id
    ${whereClause}
    GROUP BY m.id
    ORDER BY (CASE WHEN m.alias IS NULL OR m.alias = '' THEN 1 ELSE 0 END), m.alias, m.brand_name
  `;
  res.json(db.prepare(query).all(...params));
});

// Fast aggregated statistics endpoint (executes in <4ms on 100k+ rows)
app.get('/api/medicines-stats', (req, res) => {
  try {
    const today = db.prepare("SELECT date('now','localtime') as d").get().d;
    const lowStockRow = db.prepare("SELECT value FROM settings WHERE key='low_stock_threshold'").get();
    const lowStockThreshold = lowStockRow && !isNaN(parseInt(lowStockRow.value, 10)) ? parseInt(lowStockRow.value, 10) : 10;
    const expiryRow = db.prepare("SELECT value FROM settings WHERE key='expiry_alert_days'").get();
    const expiryDays = expiryRow && !isNaN(parseInt(expiryRow.value, 10)) ? parseInt(expiryRow.value, 10) : 90;

    const totalRow = db.prepare('SELECT COUNT(*) as total FROM medicines WHERE is_active = 1').get();

    const lowStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT m.id, COALESCE(SUM(b.quantity), 0) as total_stock
        FROM medicines m
        LEFT JOIN batches b ON b.medicine_id = m.id
        WHERE m.is_active = 1
        GROUP BY m.id
        HAVING total_stock > 0 AND total_stock <= ?
      )
    `).get(lowStockThreshold);

    const outOfStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT m.id, COALESCE(SUM(b.quantity), 0) as total_stock
        FROM medicines m
        LEFT JOIN batches b ON b.medicine_id = m.id
        WHERE m.is_active = 1
        GROUP BY m.id
        HAVING total_stock <= 0
      )
    `).get();

    const expiringCount = db.prepare(`
      SELECT COUNT(DISTINCT m.id) as count
      FROM batches b
      JOIN medicines m ON m.id = b.medicine_id
      WHERE b.quantity > 0 AND b.expiry_date >= ? AND b.expiry_date <= date(?, '+' || ? || ' days')
    `).get(today, today, expiryDays);

    res.json({
      total: totalRow ? totalRow.total : 0,
      low: lowStockCount ? lowStockCount.count : 0,
      out: outOfStockCount ? outOfStockCount.count : 0,
      expiring: expiringCount ? expiringCount.count : 0,
      lowThreshold: lowStockThreshold,
      alertDays: expiryDays
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/medicines/:id', (req, res) => {
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });
  const batches = db.prepare('SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry_date').all(req.params.id);
  res.json({ ...med, batches });
});

app.get('/api/medicines-categories', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT drug_group FROM medicines WHERE drug_group IS NOT NULL AND drug_group != \'\' ORDER BY drug_group').all();
  res.json(rows.map(r => r.drug_group));
});

app.post('/api/medicines', (req, res) => {
  const { alias, brand_name, generic_name, company_name, drug_group, unit_category, hsn_code, gst_percent, schedule, is_h1, tablets_per_strip } = req.body;
  if (!brand_name) return res.status(400).json({ error: 'Brand name is required' });
  try {
    const result = db.prepare(
      `INSERT INTO medicines (alias, brand_name, generic_name, company_name, drug_group, unit_category, hsn_code, gst_percent, schedule, is_h1, tablets_per_strip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(alias || '', brand_name, generic_name || '', company_name || '', drug_group || '', unit_category || 'Tablet', hsn_code || '', gst_percent || 12, schedule || '', is_h1 ? 1 : 0, tablets_per_strip || 10);
    
    logAction('MEDICINE_CREATED', 'Medicine', result.lastInsertRowid, null, req.body);
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/medicines/bulk', (req, res) => {
  const { medicines: meds } = req.body;
  if (!meds || !Array.isArray(meds)) return res.status(400).json({ error: 'Array of medicines required' });
  
  const stmt = db.prepare(`
    INSERT INTO medicines (alias, brand_name, generic_name, company_name, drug_group, unit_category, hsn_code, gst_percent, schedule, is_h1, tablets_per_strip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction((list) => {
    for (const m of list) {
      stmt.run(
        m.alias || '',
        m.brand_name,
        m.generic_name || '',
        m.company_name || '',
        m.drug_group || '',
        m.unit_category || 'Tablet',
        m.hsn_code || '',
        m.gst_percent || 12,
        m.schedule || '',
        m.is_h1 ? 1 : 0,
        m.tablets_per_strip || 10
      );
    }
  });

  try {
    txn(meds);
    logAction('BULK_MEDICINE_IMPORT', 'Medicine', null, null, { count: meds.length });
    res.json({ success: true, count: meds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Medicine CSV Export / Import / Update ─────────────────────────────────
const MED_CSV_COLS = [
  'id', 'brand_name', 'alias', 'generic_name', 'company_name', 'drug_group',
  'unit_category', 'tablets_per_strip', 'hsn_code', 'gst_percent', 'schedule', 'is_h1',
  'batch_number', 'expiry_date', 'mfg_date', 'purchase_rate', 'selling_rate', 'mrp', 'quantity'
];
const MED_CSV_LABELS = {
  id: 'ID',
  brand_name: 'Brand Name',
  alias: 'Alias',
  generic_name: 'Generic Name',
  company_name: 'Company',
  drug_group: 'Drug Group',
  unit_category: 'Unit Category',
  tablets_per_strip: 'Tablets Per Strip',
  hsn_code: 'HSN Code',
  gst_percent: 'GST %',
  schedule: 'Schedule',
  is_h1: 'Is H1',
  batch_number: 'Batch Number',
  expiry_date: 'Expiry Date',
  mfg_date: 'Mfg Date',
  purchase_rate: 'Purchase Rate (Cost)',
  selling_rate: 'Selling Rate (Price)',
  mrp: 'MRP',
  quantity: 'Stock Quantity'
};

const SAMPLE_MEDICINES = [
  {
    id: '',
    brand_name: 'Dolo 650 Tablet',
    alias: 'DOLO650',
    generic_name: 'Paracetamol 650mg',
    company_name: 'Micro Labs Ltd',
    drug_group: 'Analgesic / Antipyretic',
    unit_category: 'Tablet',
    tablets_per_strip: 15,
    hsn_code: '300490',
    gst_percent: 12,
    schedule: 'OTC',
    is_h1: 0,
    batch_number: 'DL2409',
    expiry_date: '2027-12-31',
    mfg_date: '2024-06-01',
    purchase_rate: 25.50,
    selling_rate: 32.00,
    mrp: 35.00,
    quantity: 150
  },
  {
    id: '',
    brand_name: 'Augmentin 625 Duo Tablet',
    alias: 'AUG625',
    generic_name: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
    company_name: 'GlaxoSmithKline (GSK)',
    drug_group: 'Antibiotics',
    unit_category: 'Tablet',
    tablets_per_strip: 10,
    hsn_code: '300410',
    gst_percent: 12,
    schedule: 'Schedule H1',
    is_h1: 1,
    batch_number: 'AG9981',
    expiry_date: '2026-11-30',
    mfg_date: '2024-10-01',
    purchase_rate: 165.00,
    selling_rate: 195.00,
    mrp: 210.00,
    quantity: 60
  },
  {
    id: '',
    brand_name: 'Benadryl Cough Syrup 100ml',
    alias: 'BENA100',
    generic_name: 'Diphenhydramine HCl 14.08mg',
    company_name: 'Johnson & Johnson',
    drug_group: 'Cough & Cold',
    unit_category: 'Syrup',
    tablets_per_strip: 1,
    hsn_code: '300490',
    gst_percent: 12,
    schedule: 'OTC',
    is_h1: 0,
    batch_number: 'BN7712',
    expiry_date: '2027-08-31',
    mfg_date: '2024-08-01',
    purchase_rate: 95.00,
    selling_rate: 120.00,
    mrp: 135.00,
    quantity: 40
  },
  {
    id: '',
    brand_name: 'Pan 40 Tablet',
    alias: 'PAN40',
    generic_name: 'Pantoprazole 40mg',
    company_name: 'Alkem Laboratories',
    drug_group: 'Antacid',
    unit_category: 'Tablet',
    tablets_per_strip: 15,
    hsn_code: '300490',
    gst_percent: 12,
    schedule: 'Schedule H',
    is_h1: 0,
    batch_number: 'PN4021',
    expiry_date: '2027-05-31',
    mfg_date: '2024-05-01',
    purchase_rate: 88.00,
    selling_rate: 125.00,
    mrp: 145.00,
    quantity: 80
  }
];

// High-Speed In-Memory Pre-cached Bulk Engine (Processes 1 Lakh records in ~2 seconds)
function executeBulkMedicinesCSV(rows, isUpdateMode = false) {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!rows || rows.length === 0) return result;

  // 1. Single-query in-memory maps for O(1) instant lookups
  const allMeds = db.prepare('SELECT id, LOWER(TRIM(brand_name)) as name_key FROM medicines').all();
  const medMapByName = new Map();
  const medMapById = new Map();
  for (const m of allMeds) {
    medMapByName.set(m.name_key, m.id);
    medMapById.set(m.id, m.id);
  }

  const allBatches = db.prepare('SELECT id, medicine_id, LOWER(TRIM(batch_number)) as batch_key, quantity FROM batches').all();
  const batchMap = new Map(); // key: `${medicine_id}_${batch_key}`
  for (const b of allBatches) {
    batchMap.set(`${b.medicine_id}_${b.batch_key}`, { id: b.id, quantity: b.quantity });
  }

  // 2. Prepare statements once
  const insertMedStmt = db.prepare(`
    INSERT INTO medicines (alias, brand_name, generic_name, company_name, drug_group, unit_category, hsn_code, gst_percent, schedule, is_h1, tablets_per_strip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateMedStmt = db.prepare(`
    UPDATE medicines 
    SET alias=?, brand_name=?, generic_name=?, company_name=?, drug_group=?, unit_category=?, hsn_code=?, gst_percent=?, schedule=?, is_h1=?, tablets_per_strip=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `);
  const insertBatchStmt = db.prepare(`
    INSERT INTO batches (medicine_id, batch_number, mfg_date, expiry_date, purchase_rate, selling_rate, mrp, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateBatchStmt = db.prepare(`
    UPDATE batches
    SET mfg_date = COALESCE(?, mfg_date),
        expiry_date = ?,
        purchase_rate = CASE WHEN ? > 0 THEN ? ELSE purchase_rate END,
        selling_rate = CASE WHEN ? > 0 THEN ? ELSE selling_rate END,
        mrp = CASE WHEN ? > 0 THEN ? ELSE mrp END,
        quantity = ?
    WHERE id = ?
  `);
  const addBatchQtyStmt = db.prepare(`
    UPDATE batches
    SET mfg_date = COALESCE(?, mfg_date),
        expiry_date = ?,
        purchase_rate = CASE WHEN ? > 0 THEN ? ELSE purchase_rate END,
        selling_rate = CASE WHEN ? > 0 THEN ? ELSE selling_rate END,
        mrp = CASE WHEN ? > 0 THEN ? ELSE mrp END,
        quantity = quantity + ?
    WHERE id = ?
  `);

  // 3. Chunked transactions of 5,000 records
  const CHUNK_SIZE = 5000;
  for (let c = 0; c < rows.length; c += CHUNK_SIZE) {
    const chunk = rows.slice(c, c + CHUNK_SIZE);
    const txn = db.transaction((items, startIdx) => {
      for (let i = 0; i < items.length; i++) {
        const m = items[i];
        const rowNum = startIdx + i + 2;

        try {
          const name = (m.brand_name || m.name || '').trim();
          if (!name) {
            result.errors.push({ row: rowNum, message: 'Missing Brand Name' });
            continue;
          }

          const nameKey = name.toLowerCase();
          let existingId = m.id ? parseInt(m.id, 10) : null;
          if (existingId && !medMapById.has(existingId)) {
            existingId = null;
          }
          if (!existingId && medMapByName.has(nameKey)) {
            existingId = medMapByName.get(nameKey);
          }

          const alias = m.alias || '';
          const gn = m.generic_name || '';
          const cn = m.company_name || m.company || '';
          const dg = m.drug_group || m.group || '';
          const uc = m.unit_category || m.unit || 'Tablet';
          const hsn = m.hsn_code || '';
          const gst = parseFloat(m.gst_percent || m.gst) || 12;
          const sch = m.schedule || '';
          const h1 = (m.is_h1 === '1' || m.is_h1 === 'true' || String(m.is_h1).toLowerCase() === 'yes') ? 1 : 0;
          const tps = parseInt(m.tablets_per_strip || m.strip_qty) || 10;

          let targetMedId;
          if (existingId) {
            updateMedStmt.run(alias, name, gn, cn, dg, uc, hsn, gst, sch, h1, tps, existingId);
            targetMedId = existingId;
            result.updated++;
          } else {
            const ins = insertMedStmt.run(alias, name, gn, cn, dg, uc, hsn, gst, sch, h1, tps);
            targetMedId = Number(ins.lastInsertRowid);
            medMapByName.set(nameKey, targetMedId);
            medMapById.set(targetMedId, targetMedId);
            result.created++;
          }

          // Batch & Stock processing
          const batchNum = (m.batch_number || m.batch || m.batch_no || '').trim();
          const qty = parseInt(m.quantity || m.stock || m.qty || 0, 10) || 0;
          const pr = parseFloat(m.purchase_rate || m.stock_rate || m.cost_price || m.purchase_price || m.rate || 0) || 0;
          let sr = parseFloat(m.selling_rate || m.selling_price || m.sale_price || m.sale_rate || 0) || 0;
          let mrp = parseFloat(m.mrp || m.max_retail_price || 0) || 0;
          const expiryRaw = m.expiry_date || m.expiry || m.exp_date || m.exp;
          const mfgRaw = m.mfg_date || m.mfg || m.mfg_date;

          if (batchNum || qty > 0 || pr > 0 || sr > 0 || mrp > 0 || expiryRaw) {
            const batchNumber = batchNum || 'B1';
            const batchKey = `${targetMedId}_${batchNumber.toLowerCase()}`;
            const expiryDate = normalizeDate(expiryRaw, 730);
            const mfgDate = normalizeDate(mfgRaw, null);

            if (mrp > 0 && sr === 0) sr = mrp;
            if (sr > 0 && mrp === 0) mrp = sr;
            if (pr > 0 && sr === 0) sr = pr;
            if (mrp > 0 && sr > mrp) sr = mrp;
            if (pr > mrp && mrp > 0) mrp = pr;

            const existingBatch = batchMap.get(batchKey);
            if (existingBatch) {
              if (isUpdateMode) {
                updateBatchStmt.run(mfgDate, expiryDate, pr, pr, sr, sr, mrp, mrp, qty, existingBatch.id);
                existingBatch.quantity = qty;
              } else {
                addBatchQtyStmt.run(mfgDate, expiryDate, pr, pr, sr, sr, mrp, mrp, qty, existingBatch.id);
                existingBatch.quantity += qty;
              }
            } else {
              const insB = insertBatchStmt.run(targetMedId, batchNumber, mfgDate || '', expiryDate, pr, sr, mrp, qty);
              batchMap.set(batchKey, { id: Number(insB.lastInsertRowid), quantity: qty });
            }
          }
        } catch (err) {
          result.errors.push({ row: rowNum, message: err.message });
        }
      }
    });

    txn(chunk, c);
  }

  return result;
}

app.get('/api/medicines/sample/csv', (req, res) => {
  try {
    const csv = toCSV(SAMPLE_MEDICINES, MED_CSV_COLS, MED_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_medicines_template.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/medicines/export/csv', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        m.id,
        m.brand_name,
        m.alias,
        m.generic_name,
        m.company_name,
        m.drug_group,
        m.unit_category,
        m.tablets_per_strip,
        m.hsn_code,
        m.gst_percent,
        m.schedule,
        m.is_h1,
        b.batch_number,
        b.expiry_date,
        b.mfg_date,
        b.purchase_rate,
        b.selling_rate,
        b.mrp,
        COALESCE(b.quantity, 0) as quantity
      FROM medicines m
      LEFT JOIN batches b ON b.medicine_id = m.id
      WHERE m.is_active = 1
      ORDER BY m.brand_name, b.expiry_date
    `).all();
    const csv = toCSV(rows, MED_CSV_COLS, MED_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="medicines_inventory_export.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/medicines/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkMedicinesCSV(rows, false);
    logAction('CSV_MEDICINE_IMPORT', 'Medicine', null, null, { created: result.created, updated: result.updated, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/medicines/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkMedicinesCSV(rows, true);
    logAction('CSV_MEDICINE_UPDATE', 'Medicine', null, null, { created: result.created, updated: result.updated, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/medicines/:id', (req, res) => {
  const { alias, brand_name, generic_name, company_name, drug_group, unit_category, hsn_code, gst_percent, schedule, is_active, is_h1, tablets_per_strip } = req.body;
  try {
    db.prepare(
      `UPDATE medicines SET alias=?, brand_name=?, generic_name=?, company_name=?, drug_group=?, unit_category=?, hsn_code=?, gst_percent=?, schedule=?, is_active=?, is_h1=?, tablets_per_strip=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(alias || '', brand_name, generic_name || '', company_name || '', drug_group || '', unit_category || 'Tablet', hsn_code || '', gst_percent || 12, schedule || '', is_active !== undefined ? is_active : 1, is_h1 ? 1 : 0, tablets_per_strip || 10, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/medicines/:id', (req, res) => {
  try {
    const txn = db.transaction(() => {
      // 1. Check if medicine is used in invoice_items
      const usedInInvoices = db.prepare('SELECT COUNT(*) as count FROM invoice_items WHERE medicine_id = ?').get(req.params.id);
      if (usedInInvoices.count > 0) {
        throw new Error(`Cannot delete: Medicine used in ${usedInInvoices.count} invoices. Archive it instead.`);
      }
      
      // 2. Check if medicine is used in purchase_items
      const usedInPurchases = db.prepare('SELECT COUNT(*) as count FROM purchase_items WHERE medicine_id = ?').get(req.params.id);
      if (usedInPurchases.count > 0) {
        throw new Error(`Cannot delete: Medicine used in ${usedInPurchases.count} purchase entries.`);
      }

      // 3. Check if any batches of this medicine are used
      // Even if medicine_id is not directly in items (redundant but possible), batch_id definitely is.
      const batches = db.prepare('SELECT id FROM batches WHERE medicine_id = ?').all(req.params.id);
      for (const batch of batches) {
        const batchUsedInInv = db.prepare('SELECT COUNT(*) as count FROM invoice_items WHERE batch_id = ?').get(batch.id);
        if (batchUsedInInv.count > 0) {
          throw new Error(`Cannot delete: One or more batches of this medicine are used in invoices.`);
        }
        const batchUsedInPur = db.prepare('SELECT COUNT(*) as count FROM purchase_items WHERE batch_id = ?').get(batch.id);
        if (batchUsedInPur.count > 0) {
          throw new Error(`Cannot delete: One or more batches of this medicine are used in purchase entries.`);
        }
      }

      // If we got here, it's safe to delete
      db.prepare('DELETE FROM batches WHERE medicine_id = ?').run(req.params.id);
      db.prepare('DELETE FROM medicines WHERE id = ?').run(req.params.id);
      logAction('MEDICINE_DELETED', 'Medicine', req.params.id);
    });

    txn();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete medicine error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============ BATCHES ============
app.get('/api/batches', (req, res) => {
  const { medicine_id, low_stock, expiring } = req.query;
  let query = `SELECT b.*, m.brand_name, m.company_name, m.unit_category 
    FROM batches b JOIN medicines m ON b.medicine_id = m.id WHERE 1=1`;
  const params = [];
  if (medicine_id) { query += ' AND b.medicine_id = ?'; params.push(medicine_id); }
  if (low_stock) { query += ' AND b.quantity > 0 AND b.quantity <= ?'; params.push(parseInt(low_stock)); }
  if (expiring) { query += ` AND b.expiry_date <= date('now', '+' || ? || ' days') AND b.quantity > 0`; params.push(parseInt(expiring)); }
  query += ' ORDER BY b.expiry_date';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/batches', (req, res) => {
  const { medicine_id, batch_number, mfg_date, expiry_date, purchase_rate, selling_rate, mrp, quantity, supplier_id } = req.body;
  if (!medicine_id || !batch_number || !expiry_date) return res.status(400).json({ error: 'medicine_id, batch_number, expiry_date required' });

  // ── Business Rule Validation ──────────────────────────────────────────────
  const pr  = parseFloat(purchase_rate)  || 0;
  const sr  = parseFloat(selling_rate)   || 0;
  const mrpV = parseFloat(mrp)           || 0;
  const qty = parseInt(quantity)         || 0;
  const today = new Date().toISOString().slice(0, 10);

  if (pr > 0 && sr > 0 && sr < pr)
    return res.status(400).json({ error: `Selling Rate (₹${sr}) cannot be less than Purchase Rate (₹${pr})` });
  if (mrpV > 0 && sr > mrpV)
    return res.status(400).json({ error: `Selling Rate (₹${sr}) cannot exceed MRP (₹${mrpV})` });
  if (mrpV > 0 && pr > mrpV)
    return res.status(400).json({ error: `Purchase Rate (₹${pr}) cannot exceed MRP (₹${mrpV})` });
  if (expiry_date <= today)
    return res.status(400).json({ error: 'Expiry date must be a future date' });
  if (mfg_date && mfg_date >= expiry_date)
    return res.status(400).json({ error: 'MFG date must be before Expiry date' });
  if (qty < 0)
    return res.status(400).json({ error: 'Quantity cannot be negative' });
  // ─────────────────────────────────────────────────────────────────────────

  const result = db.prepare(
    `INSERT INTO batches (medicine_id, batch_number, mfg_date, expiry_date, purchase_rate, selling_rate, mrp, quantity, supplier_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(medicine_id, batch_number, mfg_date || '', expiry_date, pr, sr, mrpV, qty, supplier_id || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/batches/:id', (req, res) => {
  const { batch_number, mfg_date, expiry_date, purchase_rate, selling_rate, mrp, quantity } = req.body;

  // ── Business Rule Validation ──────────────────────────────────────────────
  const pr   = parseFloat(purchase_rate) || 0;
  const sr   = parseFloat(selling_rate)  || 0;
  const mrpV = parseFloat(mrp)           || 0;
  const today = new Date().toISOString().slice(0, 10);

  if (pr > 0 && sr > 0 && sr < pr)
    return res.status(400).json({ error: `Selling Rate (₹${sr}) cannot be less than Purchase Rate (₹${pr})` });
  if (mrpV > 0 && sr > mrpV)
    return res.status(400).json({ error: `Selling Rate (₹${sr}) cannot exceed MRP (₹${mrpV})` });
  if (mrpV > 0 && pr > mrpV)
    return res.status(400).json({ error: `Purchase Rate (₹${pr}) cannot exceed MRP (₹${mrpV})` });
  if (expiry_date && expiry_date <= today)
    return res.status(400).json({ error: 'Expiry date must be a future date' });
  if (mfg_date && expiry_date && mfg_date >= expiry_date)
    return res.status(400).json({ error: 'MFG date must be before Expiry date' });
  // ─────────────────────────────────────────────────────────────────────────

  db.prepare(
    `UPDATE batches SET batch_number=?, mfg_date=?, expiry_date=?, purchase_rate=?, selling_rate=?, mrp=?, quantity=? WHERE id=?`
  ).run(batch_number, mfg_date, expiry_date, pr, sr, mrpV, parseInt(quantity) || 0, req.params.id);
  res.json({ success: true });
});


app.delete('/api/batches/:id', (req, res) => {
  try {
    const usedInInvoices = db.prepare('SELECT COUNT(*) as count FROM invoice_items WHERE batch_id = ?').get(req.params.id);
    if (usedInInvoices.count > 0) {
      return res.status(400).json({ error: `Cannot delete: Batch used in ${usedInInvoices.count} invoices. Delete the invoices first.` });
    }
    const usedInPurchases = db.prepare('SELECT COUNT(*) as count FROM purchase_items WHERE batch_id = ?').get(req.params.id);
    if (usedInPurchases.count > 0) {
      return res.status(400).json({ error: `Cannot delete: Batch used in ${usedInPurchases.count} purchase entries.` });
    }
    db.prepare('DELETE FROM batches WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CUSTOMERS ============
// Helper: decrypt a customer row's sensitive fields before sending to frontend
  function decryptCustomer(c) {
    if (!c) return c;
    return {
      ...c,
      phone:   decrypt(c.phone),
      address: decrypt(c.address),
    };
  }

  // Customers are stored with encrypted phone/address.
  // When invoices join customers, customer_phone may be encrypted and must be decrypted
  // before sending to the UI (needed for WhatsApp sending).
  function decryptInvoiceCustomerFields(inv) {
    if (!inv) return inv;
    const next = { ...inv };
    if (typeof next.customer_phone === 'string') {
      next.customer_phone = decrypt(next.customer_phone);
    }
    return next;
  }

app.get('/api/customers', (req, res) => {
  const { search } = req.query;
  // Fetch all, decrypt, then filter (phone is encrypted so SQL LIKE won't work on it)
  let query = 'SELECT * FROM customers ORDER BY name';
  let rows = db.prepare(query).all().map(decryptCustomer);
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(r =>
      r.name.toLowerCase().includes(s) ||
      r.phone.toLowerCase().includes(s)
    );
  }
  res.json(rows);
});

app.get('/api/customers/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const invoices = db.prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  res.json({ ...decryptCustomer(c), invoices });
});

app.post('/api/customers', (req, res) => {
  const { name, phone, address, state, credit_balance, last_payment_mode } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const encPhone   = encrypt(phone || '');
    const encAddress = encrypt(address || '');
    const result = db.prepare('INSERT INTO customers (name, phone, address, state, credit_balance, last_payment_mode) VALUES (?, ?, ?, ?, ?, ?)').run(name, encPhone, encAddress, state || '', credit_balance || 0, last_payment_mode || 'Cash');
    res.json({ id: result.lastInsertRowid, name, phone: phone || '', address: address || '', state: state || '', credit_balance: credit_balance || 0, last_payment_mode: last_payment_mode || 'Cash' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', (req, res) => {
  const { name, phone, address, state, credit_balance, last_payment_mode } = req.body;
  try {
    const encPhone   = encrypt(phone || '');
    const encAddress = encrypt(address || '');
    db.prepare(`UPDATE customers SET name=?, phone=?, address=?, state=?, credit_balance=?, last_payment_mode=?, updated_at=datetime('now','localtime') WHERE id=?`).run(name, encPhone, encAddress, state || '', credit_balance || 0, last_payment_mode || 'Cash', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', (req, res) => {
  try {
    const hasInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE customer_id = ?').get(req.params.id);
    if (hasInvoices.count > 0) {
      throw new Error(`Cannot delete: Customer has ${hasInvoices.count} invoices. Delete the invoices first or archive this customer.`);
    }
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Customer CSV Export / Import / Update ──────────────────────────────────
const CUST_CSV_COLS = ['id','name','phone','address','state','credit_balance','last_payment_mode'];
const CUST_CSV_LABELS = { id:'ID', name:'Name', phone:'Phone', address:'Address', state:'State', credit_balance:'Credit Balance', last_payment_mode:'Last Payment Mode' };

const SAMPLE_CUSTOMERS = [
  { id: '', name: 'Rahul Sharma', phone: '9876543210', address: 'Flat 402, Shanti Heights, MG Road', state: 'Maharashtra', credit_balance: 450.00, last_payment_mode: 'UPI' },
  { id: '', name: 'Pooja Verma', phone: '9123456780', address: '12, Greenfield Colony, Sector 4', state: 'Maharashtra', credit_balance: 0.00, last_payment_mode: 'Cash' }
];

app.get('/api/customers/sample/csv', (req, res) => {
  try {
    const csv = toCSV(SAMPLE_CUSTOMERS, CUST_CSV_COLS, CUST_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_customers_template.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers/export/csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM customers ORDER BY name').all().map(decryptCustomer);
    const csv = toCSV(rows, CUST_CSV_COLS, CUST_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customers_export.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function executeBulkCustomersCSV(rows, isUpdateMode = false) {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!rows || rows.length === 0) return result;

  const allCusts = db.prepare('SELECT id, LOWER(TRIM(name)) as name_key FROM customers').all();
  const custMapByName = new Map();
  const custMapById = new Map();
  for (const c of allCusts) {
    custMapByName.set(c.name_key, c.id);
    custMapById.set(c.id, c.id);
  }

  const insertStmt = db.prepare('INSERT INTO customers (name, phone, address, state, credit_balance, last_payment_mode) VALUES (?, ?, ?, ?, ?, ?)');
  const updateStmt = db.prepare(`UPDATE customers SET name=?, phone=?, address=?, state=?, credit_balance=?, last_payment_mode=?, updated_at=datetime('now','localtime') WHERE id=?`);

  const CHUNK_SIZE = 5000;
  for (let ch = 0; ch < rows.length; ch += CHUNK_SIZE) {
    const chunk = rows.slice(ch, ch + CHUNK_SIZE);
    const txn = db.transaction((items, startIdx) => {
      for (let i = 0; i < items.length; i++) {
        const c = items[i];
        const rowNum = startIdx + i + 2;
        try {
          const name = (c.name || '').trim();
          if (!name) { result.errors.push({ row: rowNum, message: 'Missing name' }); continue; }

          const nameKey = name.toLowerCase();
          let existingId = c.id ? parseInt(c.id, 10) : null;
          if (existingId && !custMapById.has(existingId)) existingId = null;
          if (!existingId && custMapByName.has(nameKey)) existingId = custMapByName.get(nameKey);

          const phoneEnc = encrypt(c.phone || '');
          const addrEnc = encrypt(c.address || '');
          const state = c.state || '';
          const credit = parseFloat(c.credit_balance) || 0;
          const mode = c.last_payment_mode || 'Cash';

          if (existingId && isUpdateMode) {
            updateStmt.run(name, phoneEnc, addrEnc, state, credit, mode, existingId);
            result.updated++;
          } else {
            const ins = insertStmt.run(name, phoneEnc, addrEnc, state, credit, mode);
            const newId = Number(ins.lastInsertRowid);
            custMapByName.set(nameKey, newId);
            custMapById.set(newId, newId);
            result.created++;
          }
        } catch (e) { result.errors.push({ row: rowNum, message: e.message }); }
      }
    });
    txn(chunk, ch);
  }
  return result;
}

app.post('/api/customers/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkCustomersCSV(rows, false);
    logAction('CSV_CUSTOMER_IMPORT', 'Customer', null, null, { created: result.created, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/customers/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkCustomersCSV(rows, true);
    logAction('CSV_CUSTOMER_UPDATE', 'Customer', null, null, { created: result.created, updated: result.updated, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ DOCTORS ============
app.get('/api/doctors', (req, res) => {
  const { search } = req.query;
  let query = 'SELECT * FROM doctors';
  const params = [];
  if (search) { query += ' WHERE name LIKE ? OR hospital LIKE ?'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY name';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/doctors', (req, res) => {
  const { name, hospital, phone, address, specialization } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare('INSERT INTO doctors (name, hospital, phone, address, specialization) VALUES (?, ?, ?, ?, ?)').run(name, hospital || '', phone || '', address || '', specialization || '');
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/doctors/:id', (req, res) => {
  const { name, hospital, phone, address, specialization } = req.body;
  try {
    db.prepare('UPDATE doctors SET name=?, hospital=?, phone=?, address=?, specialization=? WHERE id=?').run(name, hospital || '', phone || '', address || '', specialization || '', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/doctors/:id', (req, res) => {
  try {
    const hasInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE doctor_id = ?').get(req.params.id);
    if (hasInvoices.count > 0) {
      throw new Error(`Cannot delete: Doctor associated with ${hasInvoices.count} invoices. You can archive this doctor instead.`);
    }
    db.prepare('DELETE FROM doctors WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Doctor CSV Export / Import / Update ────────────────────────────────────
const DOC_CSV_COLS = ['id','name','hospital','phone','address','specialization'];
const DOC_CSV_LABELS = { id:'ID', name:'Name', hospital:'Hospital', phone:'Phone', address:'Address', specialization:'Specialization' };

const SAMPLE_DOCTORS = [
  { id: '', name: 'Dr. Rajesh Deshmukh', hospital: 'Apex Multi-speciality Hospital', phone: '9822012345', address: 'Near Railway Station, Shivajinagar', specialization: 'General Physician / MD Medicine' },
  { id: '', name: 'Dr. Anjali Patil', hospital: 'Patil Children Clinic', phone: '9890123456', address: 'Main Market, Opp City Post Office', specialization: 'Pediatrician' }
];

app.get('/api/doctors/sample/csv', (req, res) => {
  try {
    const csv = toCSV(SAMPLE_DOCTORS, DOC_CSV_COLS, DOC_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_doctors_template.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/doctors/export/csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM doctors ORDER BY name').all();
    const csv = toCSV(rows, DOC_CSV_COLS, DOC_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="doctors_export.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function executeBulkDoctorsCSV(rows, isUpdateMode = false) {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!rows || rows.length === 0) return result;

  const allDocs = db.prepare('SELECT id, LOWER(TRIM(name)) as name_key FROM doctors').all();
  const docMapByName = new Map();
  const docMapById = new Map();
  for (const d of allDocs) {
    docMapByName.set(d.name_key, d.id);
    docMapById.set(d.id, d.id);
  }

  const insertStmt = db.prepare('INSERT INTO doctors (name, hospital, phone, address, specialization) VALUES (?, ?, ?, ?, ?)');
  const updateStmt = db.prepare('UPDATE doctors SET name=?, hospital=?, phone=?, address=?, specialization=? WHERE id=?');

  const CHUNK_SIZE = 5000;
  for (let ch = 0; ch < rows.length; ch += CHUNK_SIZE) {
    const chunk = rows.slice(ch, ch + CHUNK_SIZE);
    const txn = db.transaction((items, startIdx) => {
      for (let i = 0; i < items.length; i++) {
        const d = items[i];
        const rowNum = startIdx + i + 2;
        try {
          const name = (d.name || '').trim();
          if (!name) { result.errors.push({ row: rowNum, message: 'Missing name' }); continue; }

          const nameKey = name.toLowerCase();
          let existingId = d.id ? parseInt(d.id, 10) : null;
          if (existingId && !docMapById.has(existingId)) existingId = null;
          if (!existingId && docMapByName.has(nameKey)) existingId = docMapByName.get(nameKey);

          const hosp = d.hospital || '';
          const phone = d.phone || '';
          const addr = d.address || '';
          const spec = d.specialization || '';

          if (existingId && isUpdateMode) {
            updateStmt.run(name, hosp, phone, addr, spec, existingId);
            result.updated++;
          } else {
            const ins = insertStmt.run(name, hosp, phone, addr, spec);
            const newId = Number(ins.lastInsertRowid);
            docMapByName.set(nameKey, newId);
            docMapById.set(newId, newId);
            result.created++;
          }
        } catch (e) { result.errors.push({ row: rowNum, message: e.message }); }
      }
    });
    txn(chunk, ch);
  }
  return result;
}

app.post('/api/doctors/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkDoctorsCSV(rows, false);
    logAction('CSV_DOCTOR_IMPORT', 'Doctor', null, null, { created: result.created, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/doctors/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkDoctorsCSV(rows, true);
    logAction('CSV_DOCTOR_UPDATE', 'Doctor', null, null, { created: result.created, updated: result.updated, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ SUPPLIERS ============
app.get('/api/suppliers', (req, res) => {
  const { search } = req.query;
  let query = 'SELECT * FROM suppliers';
  const params = [];
  if (search) { query += ' WHERE name LIKE ? OR phone LIKE ?'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY name';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/suppliers', (req, res) => {
  const { name, phone, email, address, gst_number, dl_number } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare('INSERT INTO suppliers (name, phone, email, address, gst_number, dl_number) VALUES (?, ?, ?, ?, ?, ?)').run(name, phone || '', email || '', address || '', gst_number || '', dl_number || '');
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', (req, res) => {
  const { name, phone, email, address, gst_number, dl_number } = req.body;
  try {
    db.prepare('UPDATE suppliers SET name=?, phone=?, email=?, address=?, gst_number=?, dl_number=? WHERE id=?').run(name, phone || '', email || '', address || '', gst_number || '', dl_number || '', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', (req, res) => {
  try {
    const txn = db.transaction(() => {
      const hasPurchases = db.prepare('SELECT COUNT(*) as count FROM purchases WHERE supplier_id = ?').get(req.params.id);
      if (hasPurchases.count > 0) {
        throw new Error(`Cannot delete: Supplier has ${hasPurchases.count} purchase entries.`);
      }
      
      const hasBatches = db.prepare('SELECT COUNT(*) as count FROM batches WHERE supplier_id = ?').get(req.params.id);
      if (hasBatches.count > 0) {
        throw new Error(`Cannot delete: Supplier is linked to existing batches.`);
      }

      db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
    });
    txn();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Supplier CSV Export / Import / Update ──────────────────────────────────
const SUP_CSV_COLS = ['id','name','phone','email','address','gst_number','dl_number'];
const SUP_CSV_LABELS = { id:'ID', name:'Name', phone:'Phone', email:'Email', address:'Address', gst_number:'GST Number', dl_number:'DL Number' };

const SAMPLE_SUPPLIERS = [
  { id: '', name: 'Balaji Pharma Distributors', phone: '9850123456', email: 'orders@balajipharma.com', address: 'Shop 14, Wholesale Drug Market', gst_number: '27AABCU9603R1ZM', dl_number: 'MH-MZ2-123456' },
  { id: '', name: 'Apollo Medical Agency', phone: '9422098765', email: 'info@apollomedagency.com', address: 'GIDC Industrial Area, Plot 55', gst_number: '27AABCA1234C1ZV', dl_number: 'MH-MZ1-654321' }
];

app.get('/api/suppliers/sample/csv', (req, res) => {
  try {
    const csv = toCSV(SAMPLE_SUPPLIERS, SUP_CSV_COLS, SUP_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_suppliers_template.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/suppliers/export/csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM suppliers ORDER BY name').all();
    const csv = toCSV(rows, SUP_CSV_COLS, SUP_CSV_LABELS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="suppliers_export.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function executeBulkSuppliersCSV(rows, isUpdateMode = false) {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!rows || rows.length === 0) return result;

  const allSups = db.prepare('SELECT id, LOWER(TRIM(name)) as name_key FROM suppliers').all();
  const supMapByName = new Map();
  const supMapById = new Map();
  for (const s of allSups) {
    supMapByName.set(s.name_key, s.id);
    supMapById.set(s.id, s.id);
  }

  const insertStmt = db.prepare('INSERT INTO suppliers (name, phone, email, address, gst_number, dl_number) VALUES (?, ?, ?, ?, ?, ?)');
  const updateStmt = db.prepare('UPDATE suppliers SET name=?, phone=?, email=?, address=?, gst_number=?, dl_number=? WHERE id=?');

  const CHUNK_SIZE = 5000;
  for (let ch = 0; ch < rows.length; ch += CHUNK_SIZE) {
    const chunk = rows.slice(ch, ch + CHUNK_SIZE);
    const txn = db.transaction((items, startIdx) => {
      for (let i = 0; i < items.length; i++) {
        const s = items[i];
        const rowNum = startIdx + i + 2;
        try {
          const name = (s.name || '').trim();
          if (!name) { result.errors.push({ row: rowNum, message: 'Missing name' }); continue; }

          const nameKey = name.toLowerCase();
          let existingId = s.id ? parseInt(s.id, 10) : null;
          if (existingId && !supMapById.has(existingId)) existingId = null;
          if (!existingId && supMapByName.has(nameKey)) existingId = supMapByName.get(nameKey);

          const phone = s.phone || '';
          const email = s.email || '';
          const addr = s.address || '';
          const gst = s.gst_number || '';
          const dl = s.dl_number || '';

          if (existingId && isUpdateMode) {
            updateStmt.run(name, phone, email, addr, gst, dl, existingId);
            result.updated++;
          } else {
            const ins = insertStmt.run(name, phone, email, addr, gst, dl);
            const newId = Number(ins.lastInsertRowid);
            supMapByName.set(nameKey, newId);
            supMapById.set(newId, newId);
            result.created++;
          }
        } catch (e) { result.errors.push({ row: rowNum, message: e.message }); }
      }
    });
    txn(chunk, ch);
  }
  return result;
}

app.post('/api/suppliers/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkSuppliersCSV(rows, false);
    logAction('CSV_SUPPLIER_IMPORT', 'Supplier', null, null, { created: result.created, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/suppliers/import/csv', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { rows } = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV file is empty' });

    const result = executeBulkSuppliersCSV(rows, true);
    logAction('CSV_SUPPLIER_UPDATE', 'Supplier', null, null, { created: result.created, updated: result.updated, errors: result.errors.length });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ INVOICES / BILLING ============
app.get('/api/invoices', (req, res) => {
  const { date, from, to, customer_id, limit: lim } = req.query;
  let query = `SELECT i.*, c.name as customer_name, d.name as doctor_name 
    FROM invoices i 
    LEFT JOIN customers c ON i.customer_id = c.id 
    LEFT JOIN doctors d ON i.doctor_id = d.id WHERE 1=1`;
  const params = [];
  if (date) { query += ` AND date(i.created_at) = ?`; params.push(date); }
  if (from) { query += ` AND date(i.created_at) >= ?`; params.push(from); }
  if (to) { query += ` AND date(i.created_at) <= ?`; params.push(to); }
  if (customer_id) { query += ` AND i.customer_id = ?`; params.push(customer_id); }
  query += ' ORDER BY i.created_at DESC';
  if (lim) { query += ' LIMIT ?'; params.push(parseInt(lim)); }
  res.json(db.prepare(query).all(...params));
});

  app.get('/api/invoices/:id', (req, res) => {
      const invRaw = db.prepare(`SELECT i.*, c.name as customer_name, c.phone as customer_phone, d.name as doctor_name, d.hospital as doctor_hospital
        FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id LEFT JOIN doctors d ON i.doctor_id = d.id WHERE i.id = ?`).get(req.params.id);
      if (!invRaw) return res.status(404).json({ error: 'Not found' });
      const items = db.prepare(`SELECT ii.*, m.brand_name, m.company_name, m.unit_category, m.hsn_code, COALESCE(ii.tablets_per_strip, m.tablets_per_strip, 10) as tablets_per_strip, b.batch_number, b.expiry_date, b.mfg_date
        FROM invoice_items ii JOIN medicines m ON ii.medicine_id = m.id JOIN batches b ON ii.batch_id = b.id WHERE ii.invoice_id = ?`).all(req.params.id);
      const h1_details = db.prepare(`SELECT * FROM invoice_h1_details WHERE invoice_id = ?`).get(req.params.id);
      const inv = decryptInvoiceCustomerFields(invRaw);
      res.json({ ...inv, items, h1_details });
    });

// Generate next invoice number
function getNextInvoiceNumber() {
  const today = new Date();
  const prefix = `INV${String(today.getFullYear()).slice(2)}${String(today.getMonth()+1).padStart(2,'0')}`;
  const last = db.prepare(`SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  if (!last) return `${prefix}0001`;
  const num = parseInt(last.invoice_number.slice(prefix.length)) + 1;
  return `${prefix}${String(num).padStart(4, '0')}`;
}

  app.post('/api/invoices', (req, res) => {
    const { customer_id, doctor_id, items, payment_mode, discount_amount, notes, amount_paid, is_gst_enabled, h1_details } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });
  
    const txn = db.transaction(() => {
      const invoice_number = getNextInvoiceNumber();
      const todayStr = db.prepare("SELECT date('now','localtime') as d").get().d;
      let subtotal = 0;
      let gst_total = 0;

      // Track cumulative quantity requested per batch so two lines drawing from
      // the SAME batch can't each pass validation and then drive stock negative.
      const requestedPerBatch = new Map();

      // 1. Validate stock/expiry and calculate authoritative totals.
      const processedItems = items.map(item => {
        const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(item.batch_id);
        if (!batch) throw new Error(`Batch ${item.batch_id} not found`);

        // Never dispense expired stock.
        if (batch.expiry_date && batch.expiry_date < todayStr) {
          throw new Error(`Cannot sell ${item.batch_number || 'batch'}: expired on ${batch.expiry_date}`);
        }

        const already = requestedPerBatch.get(item.batch_id) || 0;
        const cumulative = already + (Number(item.quantity) || 0);
        if (batch.quantity < cumulative) {
          throw new Error(`Insufficient stock for batch ${item.batch_number}. Available: ${batch.quantity}, Requested: ${cumulative}`);
        }
        requestedPerBatch.set(item.batch_id, cumulative);

        // unit_price from the client is the tax-INCLUSIVE per-unit SELLING price
        // (the batch selling rate, falling back to MRP when none is set).
        // Respect an explicit 0 (what the cashier saw); only fall back when it's absent.
        const price = (item.unit_price !== undefined && item.unit_price !== null) ? item.unit_price : batch.selling_rate;
        const disc = item.discount_percent || 0;
        const gross = item.quantity * price * (1 - disc / 100);

        // GST is INCLUSIVE: extract the tax contained in the line, don't add it on top.
        const gstPct = (is_gst_enabled !== false) ? (item.gst_percent !== undefined ? item.gst_percent : 12) : 0;
        const { taxable, gst } = splitInclusive(gross, gstPct);

        subtotal += taxable;
        gst_total += gst;

        // lineTotal holds the per-line TAXABLE base (stored as invoice_items.total,
        // which the GST report sums as taxable_value); lineGst is the per-line tax.
        return { ...item, price, mrp: batch.mrp, gstPct, lineGst: gst, lineTotal: taxable };
      });

      subtotal = round2(subtotal);
      gst_total = round2(gst_total);
      const total_amount = Math.max(0, round2(subtotal + gst_total - (discount_amount || 0)));
      const isCredit = payment_mode && ['pending', 'udhaari'].includes(payment_mode.toLowerCase().trim());
      const paid = amount_paid !== undefined ? amount_paid : (isCredit ? 0 : total_amount);
      const credit = Math.max(0, total_amount - paid);

      // Place of supply → GST split: same state = CGST+SGST (intra), different = IGST (inter).
      // Server is authoritative; defaults to intra-state whenever either state is unknown,
      // so the GST total is never affected — only how it is labelled/split on the invoice.
      let is_interstate = 0;
      const shopState = (db.prepare("SELECT value FROM settings WHERE key = 'shop_state'").get()?.value || '').trim().toLowerCase();
      if (customer_id && shopState) {
        const custRow = db.prepare('SELECT state FROM customers WHERE id = ?').get(customer_id);
        const custState = (custRow?.state || '').trim().toLowerCase();
        if (custState && custState !== shopState) is_interstate = 1;
      }

      const invResult = db.prepare(
        `INSERT INTO invoices (invoice_number, customer_id, doctor_id, subtotal, discount_amount, gst_amount, total_amount, payment_mode, amount_paid, credit_amount, notes, is_interstate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(invoice_number, customer_id || null, doctor_id || null, subtotal, discount_amount || 0, gst_total, total_amount, payment_mode || 'Cash', paid, credit, notes || '', is_interstate);
  
      const invoiceId = invResult.lastInsertRowid;
  
      // 2. Insert items and reduce stock
      const insertItem = db.prepare(
        `INSERT INTO invoice_items (invoice_id, medicine_id, batch_id, quantity, unit_price, mrp, discount_percent, gst_percent, gst_amount, total, tablets_per_strip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const reduceStock = db.prepare('UPDATE batches SET quantity = quantity - ? WHERE id = ?');
  
      for (const item of processedItems) {
        insertItem.run(invoiceId, item.medicine_id, item.batch_id, item.quantity, item.price, item.mrp, item.discount_percent, item.gstPct, item.lineGst, item.lineTotal, item.tablets_per_strip || 10);
        reduceStock.run(item.quantity, item.batch_id);
      }


    // Update customer credit and last payment mode
    if (customer_id) {
      if (credit > 0) {
        db.prepare('UPDATE customers SET credit_balance = credit_balance + ?, last_payment_mode = ? WHERE id = ?').run(credit, payment_mode || 'Cash', customer_id);
      } else {
        db.prepare('UPDATE customers SET last_payment_mode = ? WHERE id = ?').run(payment_mode || 'Cash', customer_id);
      }
    }

    if (h1_details && Object.keys(h1_details).length > 0) {
      db.prepare(
        `INSERT INTO invoice_h1_details (invoice_id, patient_name, patient_address, doctor_name, doctor_address, doctor_reg_no, prescription_no)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        invoiceId,
        h1_details.patient_name || '',
        h1_details.patient_address || '',
        h1_details.doctor_name || '',
        h1_details.doctor_address || '',
        h1_details.doctor_reg_no || '',
        h1_details.prescription_no || ''
      );
    }

      // Return the full invoice object
      const invRaw = db.prepare(`SELECT i.*, c.name as customer_name, c.phone as customer_phone, d.name as doctor_name, d.hospital as doctor_hospital
        FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id LEFT JOIN doctors d ON i.doctor_id = d.id WHERE i.id = ?`).get(invoiceId);
      const invItems = db.prepare(`SELECT ii.*, m.brand_name, m.company_name, m.unit_category, m.hsn_code, COALESCE(ii.tablets_per_strip, m.tablets_per_strip, 10) as tablets_per_strip, b.batch_number, b.expiry_date, b.mfg_date
        FROM invoice_items ii JOIN medicines m ON ii.medicine_id = m.id JOIN batches b ON ii.batch_id = b.id WHERE ii.invoice_id = ?`).all(invoiceId);
      const savedH1Details = db.prepare(`SELECT * FROM invoice_h1_details WHERE invoice_id = ?`).get(invoiceId);

      const result = { ...decryptInvoiceCustomerFields(invRaw), items: invItems, h1_details: savedH1Details };
      
      logAction('INVOICE_CREATED', 'Invoice', invoiceId, null, { invoice_number: result.invoice_number, total_amount: result.total_amount });
      return result;
  });

  try {
    const result = txn();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/invoices/:id', (req, res) => {
  const txn = db.transaction(() => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv) throw new Error('Invoice not found');

    // Restore stock
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
    const restoreStock = db.prepare('UPDATE batches SET quantity = quantity + ? WHERE id = ?');
    
    for (const item of items) {
      restoreStock.run(item.quantity, item.batch_id);
    }

    // Revert customer credit
    if (inv.customer_id && inv.credit_amount > 0) {
      db.prepare('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?').run(inv.credit_amount, inv.customer_id);
    }

    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    
    return { success: true };
  });

  try {
    const result = txn();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PURCHASES ============
app.get('/api/purchases', (req, res) => {
  const rows = db.prepare(`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC`).all();
  res.json(rows);
});

app.get('/api/purchases/:id', (req, res) => {
  const p = db.prepare(`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare(`SELECT pi.*, m.brand_name, m.unit_category, m.tablets_per_strip, b.batch_number, b.expiry_date, b.mfg_date 
    FROM purchase_items pi JOIN medicines m ON pi.medicine_id = m.id JOIN batches b ON pi.batch_id = b.id WHERE pi.purchase_id = ?`).all(req.params.id);
  res.json({ ...p, items });
});

app.post('/api/purchases', (req, res) => {
  const { supplier_id, invoice_number, items, notes, purchase_date, amount_paid, payment_mode, payment_notes } = req.body;
  if (!supplier_id || !items || !items.length) return res.status(400).json({ error: 'supplier_id and items required' });

  try {
    const txn = db.transaction(() => {
      // 0. Preliminary existence checks; also cache unit/strip info for costing.
      const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplier_id);
      if (!supplier) throw new Error(`Supplier with ID ${supplier_id} not found. It may have been deleted.`);

      const medInfo = new Map();
      for (const item of items) {
        const med = db.prepare('SELECT id, unit_category, tablets_per_strip FROM medicines WHERE id = ?').get(item.medicine_id);
        if (!med) throw new Error(`Medicine at row ${items.indexOf(item)+1} not found in inventory. Please remove and re-add it.`);
        medInfo.set(item.medicine_id, med);
      }

      let total = 0;
      const purchaseResult = db.prepare(
        `INSERT INTO purchases (supplier_id, invoice_number, total_amount, amount_paid, notes, purchase_date) VALUES (?, ?, 0, ?, ?, ?)`
      ).run(supplier_id, invoice_number || '', amount_paid || 0, notes || '', purchase_date || new Date().toISOString().slice(0, 10));
      const purchaseId = purchaseResult.lastInsertRowid;

      for (const item of items) {
        // Create batch
        const batchResult = db.prepare(
          `INSERT INTO batches (medicine_id, batch_number, mfg_date, expiry_date, purchase_rate, selling_rate, mrp, quantity, supplier_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(item.medicine_id, item.batch_number, item.mfg_date || '', item.expiry_date, item.purchase_rate, item.selling_rate || 0, item.mrp || 0, item.quantity, supplier_id);

        const batchId = batchResult.lastInsertRowid;
        // purchase_rate is per STRIP; quantity is in individual units/tablets.
        // Real cost divides the strip rate across its tablets (tablet-like only).
        const med = medInfo.get(item.medicine_id) || {};
        const lineTotal = item.quantity * perUnitCost(item.purchase_rate, med.unit_category, med.tablets_per_strip);
        total += lineTotal;

        db.prepare(
          `INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, quantity, purchase_rate, selling_rate, mrp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(purchaseId, item.medicine_id, batchId, item.quantity, item.purchase_rate, item.selling_rate || 0, item.mrp || 0);
      }

      total = round2(total);
      db.prepare('UPDATE purchases SET total_amount = ? WHERE id = ?').run(total, purchaseId);

      // If payment was made at the time of purchase, log it in supplier_payments
      if (amount_paid && amount_paid > 0) {
        db.prepare(
          `INSERT INTO supplier_payments (supplier_id, amount, payment_mode, payment_date, notes)
           VALUES (?, ?, ?, ?, ?)`
        ).run(supplier_id, amount_paid, payment_mode || 'Cash', purchase_date || new Date().toISOString().slice(0, 10), payment_notes || 'Paid at time of purchase');
      }

      return { id: purchaseId, total_amount: total };
    });

    const result = txn();
    res.json(result);
  } catch (err) {
    console.error('Purchase creation error:', err);
    let msg = err.message;
    if (msg.includes('FOREIGN KEY constraint failed')) {
      msg = "Database integrity error: A referenced medicine or supplier record is missing. Please refresh the page and try again.";
    }
    res.status(400).json({ error: msg });
  }
});

app.put('/api/purchases/:id', (req, res) => {
  const purchaseId = req.params.id;
  const { supplier_id, invoice_number, items, notes, purchase_date, amount_paid } = req.body;
  if (!supplier_id || !items || !items.length) return res.status(400).json({ error: 'supplier_id and items required' });

  try {
    const txn = db.transaction(() => {
      // 0. Preliminary existence checks
      const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplier_id);
      if (!supplier) throw new Error(`Supplier with ID ${supplier_id} not found.`);

      const medInfo = new Map();
      for (const item of items) {
        const med = db.prepare('SELECT id, unit_category, tablets_per_strip FROM medicines WHERE id = ?').get(item.medicine_id);
        if (!med) throw new Error(`Medicine '${item.medicine_name}' not found in inventory.`);
        medInfo.set(item.medicine_id, med);
      }

      // 1. Fetch current purchase items
      const existingItems = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(purchaseId);
      
      // Create maps for quick lookup
      const existingMap = new Map(existingItems.map(i => [i.batch_id, i]));
      const newMap = new Map(items.filter(i => i.batch_id).map(i => [i.batch_id, i]));
      
      // 2. Process removals: Items in existingMap but not in new payload
      for (const [batchId, oldItem] of existingMap) {
        if (!newMap.has(batchId)) {
          const batch = db.prepare('SELECT quantity, batch_number FROM batches WHERE id = ?').get(batchId);
          if (batch) {
            if (batch.quantity < oldItem.quantity) {
               throw new Error(`Cannot remove item (Batch: ${batch.batch_number}) because some quantity has already been sold from this batch.`);
            }
            db.prepare('DELETE FROM purchase_items WHERE purchase_id = ? AND batch_id = ?').run(purchaseId, batchId);
            db.prepare('DELETE FROM batches WHERE id = ?').run(batchId);
          }
        }
      }

      let total = 0;

      // 3. Process new and updated items
      for (const item of items) {
        if (!item.batch_id) {
          // Brand new item added to existing purchase
          const batchResult = db.prepare(
            `INSERT INTO batches (medicine_id, batch_number, mfg_date, expiry_date, purchase_rate, selling_rate, mrp, quantity, supplier_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(item.medicine_id, item.batch_number, item.mfg_date || '', item.expiry_date, item.purchase_rate, item.selling_rate || 0, item.mrp || 0, item.quantity, supplier_id);

          const batchId = batchResult.lastInsertRowid;
          db.prepare(
            `INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, quantity, purchase_rate, selling_rate, mrp)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(purchaseId, item.medicine_id, batchId, item.quantity, item.purchase_rate, item.selling_rate || 0, item.mrp || 0);

          const medNew = medInfo.get(item.medicine_id) || {};
          total += item.quantity * perUnitCost(item.purchase_rate, medNew.unit_category, medNew.tablets_per_strip);
        } else {
          // Updating an existing item
          const oldItem = existingMap.get(item.batch_id);
          const batch = db.prepare('SELECT quantity, batch_number FROM batches WHERE id = ?').get(item.batch_id);
          
          if (oldItem && batch) {
            const soldQuantity = oldItem.quantity - batch.quantity; 
            
            if (item.quantity < soldQuantity && soldQuantity > 0) {
              throw new Error(`Cannot reduce quantity of ${batch.batch_number} below ${soldQuantity} (quantity already sold).`);
            }

            const newBatchQty = batch.quantity - oldItem.quantity + item.quantity;

            db.prepare(
              `UPDATE batches SET batch_number=?, mfg_date=?, expiry_date=?, purchase_rate=?, selling_rate=?, mrp=?, quantity=? WHERE id=?`
            ).run(item.batch_number, item.mfg_date || '', item.expiry_date, item.purchase_rate, item.selling_rate || 0, item.mrp || 0, newBatchQty, item.batch_id);

            db.prepare(
              `UPDATE purchase_items SET quantity=?, purchase_rate=?, selling_rate=?, mrp=? WHERE purchase_id=? AND batch_id=?`
            ).run(item.quantity, item.purchase_rate, item.selling_rate || 0, item.mrp || 0, purchaseId, item.batch_id);

            const medUpd = medInfo.get(item.medicine_id) || {};
            total += item.quantity * perUnitCost(item.purchase_rate, medUpd.unit_category, medUpd.tablets_per_strip);
          }
        }
      }

      // 4. Update the Purchase record
      total = round2(total);
      const purchaseInfo = db.prepare('SELECT total_amount, amount_paid FROM purchases WHERE id=?').get(purchaseId);
      
      db.prepare(
        `UPDATE purchases SET supplier_id = ?, invoice_number = ?, notes = ?, purchase_date = ?, total_amount = ?, amount_paid = ? WHERE id = ?`
      ).run(supplier_id, invoice_number || '', notes || '', purchase_date || new Date().toISOString().slice(0, 10), total, amount_paid !== undefined ? amount_paid : purchaseInfo.amount_paid, purchaseId);

      return { id: purchaseId, total_amount: total };
    });

    const result = txn();
    res.json(result);
  } catch (err) {
    console.error('Purchase update error:', err);
    let msg = err.message;
    if (msg.includes('FOREIGN KEY constraint failed')) {
      msg = "Database integrity error: This purchase is linked to records that cannot be modified. Ensure no items from this purchase have been sold before deleting/changing them.";
    }
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/purchases/:id', (req, res) => {
  const txn = db.transaction(() => {
    // Check if any items from this purchase have been sold
    // We do this by checking if current batch quantity < purchase quantity
    // This assumes batch numbers are unique per purchase or handled correctly
    const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(req.params.id);
    if (items.length === 0) {
      db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
      return { success: true };
    }

    const checkBatch = db.prepare('SELECT quantity FROM batches WHERE id = ?');
    const updateBatch = db.prepare('UPDATE batches SET quantity = quantity - ? WHERE id = ?');
    const deleteBatch = db.prepare('DELETE FROM batches WHERE id = ?');

    for (const item of items) {
      const batch = checkBatch.get(item.batch_id);
      if (!batch) continue; // Batch already deleted?
      
      // If we sold any, current quantity will be less than purchased quantity
      // Logic: If I bought 10, and sold 2, I have 8. 
      // If I try to delete purchase, I need to remove 10. 8 - 10 = -2.
      // So if quantity < item.quantity, we cannot delete.
      if (batch.quantity < item.quantity) {
        throw new Error(`Cannot delete purchase: Batch ${item.batch_id} has been sold partially. Current: ${batch.quantity}, Purchased: ${item.quantity}`);
      }
      
      // Reduce stock
      updateBatch.run(item.quantity, item.batch_id);
      
      // If stock becomes 0, check if we should delete the batch?
      // For now, let's keep it simple: if 0, maybe delete it if it was created by this purchase?
      // Since we don't track "created_by_purchase_id" on batches directly (only via items), let's just leave it with 0 quantity or delete if 0.
      const newBatch = checkBatch.get(item.batch_id);
      if (newBatch && newBatch.quantity === 0) {
        // Optional: delete batch if empty to keep clean
        // But need to ensure it's not used in other purchases (unlikely for batch)
        deleteBatch.run(item.batch_id);
      }
    }

    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(req.params.id);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
    return { success: true };
  });

  try {
    const result = txn();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// NOTE: Shadowed duplicate routes were removed here — /api/dashboard,
// /api/reports/sales, /api/reports/profit and /api/reports/outstanding were
// defined a second time in this section. Express binds the FIRST registration,
// so these later copies never executed. The authoritative implementations live
// in the DASHBOARD and REPORTS sections earlier in this file.

// --- Get Supplier Purchase Payment Report ---
app.get('/api/reports/supplier-payments', (req, res) => {
  try {
    const { from, to } = req.query;
    
    let query = `
      SELECT 
        s.id as SupplierId,
        s.name as SupplierName,
        SUM(p.total_amount) as TotalPurchaseAmount,
        SUM(COALESCE(p.amount_paid, 0)) as AmountPaid,
        SUM(p.total_amount) - SUM(COALESCE(p.amount_paid, 0)) as RemainingAmount,
        CASE 
          WHEN SUM(p.total_amount) = 0 THEN 'Paid'
          WHEN SUM(COALESCE(p.amount_paid, 0)) >= SUM(p.total_amount) THEN 'Paid'
          WHEN SUM(COALESCE(p.amount_paid, 0)) > 0 THEN 'Partial'
          ELSE 'Unpaid'
        END as PaymentStatus,
        MAX(p.purchase_date) as LastPaymentDate
      FROM suppliers s
      JOIN purchases p ON s.id = p.supplier_id
    `;
    
    let params = [];
    if (from && to) {
      query += ` WHERE date(p.purchase_date) BETWEEN date(?) AND date(?) `;
      params.push(from, to);
    }
    
    query += ` GROUP BY s.id ORDER BY RemainingAmount DESC`;
    
    const reportData = db.prepare(query).all(...params);
    res.json(reportData);
  } catch (err) {
    console.error("Error fetching supplier payments report: ", err);
    res.status(500).json({ error: err.message });
  }
});

// NOTE: A shadowed duplicate /api/reports/h1-register was removed here.
// The authoritative version (with optional medicine/doctor/patient filters)
// is defined earlier in the REPORTS section.

// --- Purchase Summary Report ---
app.get('/api/reports/purchases-summary', (req, res) => {
  const { from, to } = req.query;
  try {
    let query = `
      SELECT 
        s.name as supplier_name,
        COUNT(p.id) as total_bills,
        SUM(p.total_amount) as total_amount,
        SUM(p.amount_paid) as amount_paid,
        SUM(p.total_amount - p.amount_paid) as outstanding
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];
    if (from) { query += " AND date(p.purchase_date) >= ?"; params.push(from); }
    if (to) { query += " AND date(p.purchase_date) <= ?"; params.push(to); }
    
    query += " GROUP BY s.id ORDER BY total_amount DESC";
    res.json(db.prepare(query).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Profitability Report ---
app.get('/api/reports/profitability', (req, res) => {
  const { from, to } = req.query;
  try {
    let query = `
      SELECT
        date(i.created_at) as sale_date,
        COUNT(DISTINCT i.id) as bills,
        SUM(ii.total) as sales_value,
        SUM(${LINE_COGS_SQL}) as purchase_cost,
        SUM(ii.total) - SUM(${LINE_COGS_SQL}) as gross_profit
      FROM invoices i
      JOIN invoice_items ii ON i.id = ii.invoice_id
      JOIN batches b ON ii.batch_id = b.id
      JOIN medicines m ON ii.medicine_id = m.id
      WHERE 1=1
    `;
    const params = [];
    if (from) { query += " AND date(i.created_at) >= ?"; params.push(from); }
    if (to) { query += " AND date(i.created_at) <= ?"; params.push(to); }
    
    query += " GROUP BY sale_date ORDER BY sale_date DESC";
    res.json(db.prepare(query).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pay Supplier
app.post('/api/suppliers/:id/pay', (req, res) => {
  const { amount, payment_mode, payment_date, notes } = req.body;
  const supplierId = req.params.id;
  
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  
  const txn = db.transaction(() => {
    db.prepare(`INSERT INTO supplier_payments (supplier_id, amount, payment_mode, payment_date, notes) VALUES (?, ?, ?, ?, ?)`).run(supplierId, amount, payment_mode || 'Cash', payment_date || new Date().toISOString().slice(0, 10), notes || '');
    
    const unpaidPurchases = db.prepare(`SELECT id, total_amount, amount_paid FROM purchases WHERE supplier_id = ? AND total_amount > COALESCE(amount_paid, 0) ORDER BY purchase_date ASC`).all(supplierId);
    
    let remainingToApply = amount;
    for (const p of unpaidPurchases) {
      if (remainingToApply <= 0) break;
      const amountNeeded = p.total_amount - (p.amount_paid || 0);
      const applyAmount = Math.min(amountNeeded, remainingToApply);
      
      db.prepare(`UPDATE purchases SET amount_paid = COALESCE(amount_paid, 0) + ? WHERE id = ?`).run(applyAmount, p.id);
      remainingToApply -= applyAmount;
    }
    return { success: true };
  });
  
  try {
    res.json(txn());
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Supplier Payment History
app.get('/api/suppliers/:id/payments', (req, res) => {
  const rows = db.prepare(`SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY date(payment_date) DESC, id DESC`).all(req.params.id);
  res.json(rows);
});

// Pay off credit
app.post('/api/customers/:id/pay-credit', (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const customer = db.prepare('SELECT credit_balance FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (amount > customer.credit_balance) return res.status(400).json({ error: 'Amount exceeds outstanding balance' });
  db.prepare('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?').run(amount, req.params.id);
  res.json({ success: true, new_balance: customer.credit_balance - amount });
});

// NOTE: A shadowed duplicate /api/reports/daily-chart was removed here.
// The authoritative version (zero-filled, local-date) lives in the REPORTS section.

// Non-Moving Medicines
app.get('/api/reports/non-moving', (req, res) => {
  const { days = 60, category, supplier_id } = req.query;
  const thresholdDays = parseInt(days, 10);
  
  let query = `
    SELECT 
      b.id as batch_id,
      b.batch_number, 
      b.quantity as stock, 
      b.expiry_date, 
      b.mrp,
      b.selling_rate,
      b.purchase_rate,
      m.brand_name as medicine_name, 
      m.drug_group as category,
      s.name as supplier_name,
      MIN(p.purchase_date) as purchase_date,
      MAX(i.created_at) as last_sold_date
    FROM batches b
    JOIN medicines m ON b.medicine_id = m.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    LEFT JOIN purchase_items pi ON pi.batch_id = b.id
    LEFT JOIN purchases p ON pi.purchase_id = p.id
    LEFT JOIN invoice_items ii ON ii.batch_id = b.id
    LEFT JOIN invoices i ON ii.invoice_id = i.id
    WHERE b.quantity > 0 
  `;
  
  const params = [];
  
  if (category) {
    query += ` AND m.drug_group = ?`;
    params.push(category);
  }
  
  if (supplier_id) {
    query += ` AND b.supplier_id = ?`;
    params.push(supplier_id);
  }
  
  query += ` GROUP BY b.id HAVING (last_sold_date IS NULL AND date(b.created_at) <= date('now', '-' || ? || ' days')) OR (last_sold_date IS NOT NULL AND date(last_sold_date) <= date('now', '-' || ? || ' days'))`;
  
  params.push(thresholdDays, thresholdDays);
  
  query += ` ORDER BY last_sold_date ASC NULLS FIRST`;

  res.json(db.prepare(query).all(...params));
});

// Write off stock for non-moving medicines
app.post('/api/batches/:id/write-off', (req, res) => {
  db.prepare('UPDATE batches SET quantity = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Update batch discount (selling_rate)
app.put('/api/batches/:id/discount', (req, res) => {
  const { selling_rate } = req.body;
  if (!selling_rate) return res.status(400).json({ error: 'selling_rate is required' });
  db.prepare('UPDATE batches SET selling_rate = ? WHERE id = ?').run(selling_rate, req.params.id);
  res.json({ success: true });
});

// Error Handler Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// --- Data Reconciliation ---
// Repairs only unambiguously-invalid customer balances (negative or NULL).
// A full recompute is intentionally NOT performed here: credit repayments made via
// /customers/:id/pay-credit are not recorded against invoices, and a customer may
// carry an opening balance, so the invoices table alone cannot reproduce the true
// outstanding amount. The previous version reset every balance to 0 and re-added
// only 'pending' invoices, which silently wiped legitimate 'udhaari' and partially
// repaid balances. A ledger-based reconcile lands with the Phase-4 credit rework.
app.post('/api/admin/reconcile-balances', (req, res) => {
  try {
    const info = db.prepare(
      "UPDATE customers SET credit_balance = 0 WHERE credit_balance IS NULL OR credit_balance < 0"
    ).run();
    res.json({
      success: true,
      corrected: info.changes,
      message: info.changes > 0
        ? `Reconciled ${info.changes} customer balance(s) that were negative or unset.`
        : 'All customer balances are valid. Nothing to reconcile.'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`AthassMediSync API running on port ${PORT}`);
  // WhatsApp routes are registered once during setup (initWhatsApp near the top).
  // It does not start a client — the user connects from Settings > WhatsApp.
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. Assuming server is already running.`);
  } else {
    console.error('Server error:', e);
  }
});
