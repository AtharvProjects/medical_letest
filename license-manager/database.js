const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let dbType = 'json'; // 'postgres', 'sqlite', or 'json'
let sqliteDb = null;
let pgPool = null;

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (e) {}
}

const JSON_DB_PATH = path.join(DB_DIR, 'licenses.json');
const DATABASE_URL = process.env.DATABASE_URL;

// JSON File Store Schema & In-Memory State
let jsonData = {
  admin_users: [],
  licenses: [],
  logs: []
};

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function saveJsonData() {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(jsonData, null, 2), 'utf8');
  } catch (e) {
    console.error('[Database] Failed to save JSON data:', e.message);
  }
}

function loadJsonData() {
  if (fs.existsSync(JSON_DB_PATH)) {
    try {
      const raw = fs.readFileSync(JSON_DB_PATH, 'utf8');
      jsonData = JSON.parse(raw);
      if (!jsonData.admin_users) jsonData.admin_users = [];
      if (!jsonData.licenses) jsonData.licenses = [];
      if (!jsonData.logs) jsonData.logs = [];
    } catch (e) {
      console.warn('[Database] Corrupt JSON database, starting fresh:', e.message);
    }
  }
}

async function initDatabase() {
  // 1. Production PostgreSQL via DATABASE_URL
  if (DATABASE_URL) {
    dbType = 'postgres';
    console.log('[Database] Connecting to PostgreSQL via DATABASE_URL...');
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt VARCHAR(64) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS licenses (
          id SERIAL PRIMARY KEY,
          license_key VARCHAR(100) UNIQUE NOT NULL,
          client_name VARCHAR(150) NOT NULL,
          store_name VARCHAR(150) NOT NULL,
          phone VARCHAR(50) DEFAULT '',
          email VARCHAR(100) DEFAULT '',
          status VARCHAR(30) DEFAULT 'active',
          plan_type VARCHAR(50) DEFAULT '1_year',
          expires_at VARCHAR(30) NOT NULL,
          hwid VARCHAR(200) DEFAULT '',
          max_devices INT DEFAULT 1,
          notes TEXT DEFAULT '',
          last_ping TIMESTAMP,
          ip_address VARCHAR(100) DEFAULT '',
          app_version VARCHAR(50) DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS logs (
          id SERIAL PRIMARY KEY,
          license_id INT,
          action VARCHAR(50) NOT NULL,
          details TEXT DEFAULT '',
          ip_address VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const res = await client.query('SELECT COUNT(*) as cnt FROM admin_users');
      if (parseInt(res.rows[0].cnt, 10) === 0) {
        const username = process.env.ADMIN_USER || 'admin';
        const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const salt = generateSalt();
        const hash = hashPassword(rawPassword, salt);
        await client.query(
          'INSERT INTO admin_users (username, password_hash, salt) VALUES ($1, $2, $3)',
          [username, hash, salt]
        );
        console.log(`[Database] Seeded initial admin: ${username}`);
      }
    } finally {
      client.release();
    }
    console.log('[Database] PostgreSQL initialized successfully.');
    return;
  }

  // 2. Try better-sqlite3 if available
  try {
    const Database = require('better-sqlite3');
    const sqlitePath = path.join(DB_DIR, 'licenses.db');
    sqliteDb = new Database(sqlitePath);
    sqliteDb.pragma('journal_mode = WAL');

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        client_name TEXT NOT NULL,
        store_name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        plan_type TEXT DEFAULT '1_year',
        expires_at TEXT NOT NULL,
        hwid TEXT DEFAULT '',
        max_devices INTEGER DEFAULT 1,
        notes TEXT DEFAULT '',
        last_ping TEXT,
        ip_address TEXT DEFAULT '',
        app_version TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_id INTEGER,
        action TEXT NOT NULL,
        details TEXT DEFAULT '',
        ip_address TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
    `);

    const row = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM admin_users').get();
    if (row.cnt === 0) {
      const username = process.env.ADMIN_USER || 'admin';
      const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const salt = generateSalt();
      const hash = hashPassword(rawPassword, salt);
      sqliteDb.prepare('INSERT INTO admin_users (username, password_hash, salt) VALUES (?, ?, ?)')
        .run(username, hash, salt);
      console.log(`[Database] Seeded initial admin: ${username}`);
    }
    dbType = 'sqlite';
    console.log(`[Database] SQLite initialized at: ${sqlitePath}`);
    return;
  } catch (sqliteErr) {
    // 3. Robust JSON File Fallback (Zero native dependencies!)
    dbType = 'json';
    loadJsonData();

    if (jsonData.admin_users.length === 0) {
      const username = process.env.ADMIN_USER || 'admin';
      const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const salt = generateSalt();
      const hash = hashPassword(rawPassword, salt);
      jsonData.admin_users.push({
        id: 1,
        username,
        password_hash: hash,
        salt,
        created_at: new Date().toISOString()
      });
      saveJsonData();
      console.log(`[Database] Seeded initial admin (JSON store): ${username}`);
    }
    console.log(`[Database] Zero-dependency JSON Database initialized at: ${JSON_DB_PATH}`);
  }
}

// Unified Query Engine
async function query(sql, params = []) {
  if (dbType === 'postgres') {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const res = await pgPool.query(pgSql, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount,
      lastInsertId: res.rows[0]?.id || null
    };
  }

  if (dbType === 'sqlite' && sqliteDb) {
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT')) {
      const rows = sqliteDb.prepare(sql).all(...params);
      return { rows, rowCount: rows.length };
    } else {
      const info = sqliteDb.prepare(sql).run(...params);
      return {
        rows: [],
        rowCount: info.changes,
        lastInsertId: info.lastInsertRowid
      };
    }
  }

  // JSON Engine Fallback
  return handleJsonQuery(sql, params);
}

function handleJsonQuery(sql, params) {
  const cleanSql = sql.trim().replace(/\s+/g, ' ');
  const upper = cleanSql.toUpperCase();

  if (upper.startsWith('SELECT')) {
    // Admin Users
    if (upper.includes('FROM ADMIN_USERS')) {
      if (upper.includes('WHERE USERNAME = ?')) {
        const u = jsonData.admin_users.find(x => x.username.toLowerCase() === String(params[0]).toLowerCase());
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      if (upper.includes('WHERE ID = ?')) {
        const u = jsonData.admin_users.find(x => x.id === parseInt(params[0], 10));
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      return { rows: [...jsonData.admin_users], rowCount: jsonData.admin_users.length };
    }

    // Licenses
    if (upper.includes('FROM LICENSES')) {
      if (upper.includes('WHERE LICENSE_KEY = ?') || upper.includes('WHERE UPPER(LICENSE_KEY) = ?')) {
        const key = String(params[0]).toUpperCase();
        const l = jsonData.licenses.find(x => x.license_key.toUpperCase() === key);
        return { rows: l ? [l] : [], rowCount: l ? 1 : 0 };
      }
      if (upper.includes('WHERE ID = ?')) {
        const l = jsonData.licenses.find(x => x.id === parseInt(params[0], 10));
        return { rows: l ? [l] : [], rowCount: l ? 1 : 0 };
      }
      // Return list sorted descending
      const list = [...jsonData.licenses].sort((a, b) => b.id - a.id);
      return { rows: list, rowCount: list.length };
    }

    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('INSERT INTO LICENSES')) {
    const nextId = jsonData.licenses.reduce((max, x) => Math.max(max, x.id || 0), 0) + 1;
    const newLic = {
      id: nextId,
      license_key: params[0],
      client_name: params[1],
      store_name: params[2],
      phone: params[3] || '',
      email: params[4] || '',
      status: 'active',
      plan_type: params[5] || '1_year',
      expires_at: params[6],
      hwid: params[7] || '',
      max_devices: params[8] || 1,
      notes: params[9] || '',
      last_ping: null,
      ip_address: '',
      app_version: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    jsonData.licenses.push(newLic);
    saveJsonData();
    return { rows: [newLic], rowCount: 1, lastInsertId: nextId };
  }

  if (upper.startsWith('UPDATE LICENSES')) {
    // Find target ID
    const id = parseInt(params[params.length - 1], 10);
    const lic = jsonData.licenses.find(x => x.id === id);
    if (!lic) return { rows: [], rowCount: 0 };

    if (upper.includes('SET EXPIRES_AT = ?, STATUS = ?')) {
      lic.expires_at = params[0];
      lic.status = params[1];
      lic.updated_at = new Date().toISOString();
    } else if (upper.includes('SET STATUS = ?')) {
      lic.status = params[0];
      lic.updated_at = new Date().toISOString();
    } else if (upper.includes('SET HWID = ?')) {
      if (upper.includes('LAST_PING')) {
        lic.hwid = params[0];
        lic.ip_address = params[1] || '';
        lic.app_version = params[2] || '';
        lic.last_ping = new Date().toISOString();
      } else {
        lic.hwid = params[0];
      }
      lic.updated_at = new Date().toISOString();
    } else if (upper.includes('SET LAST_PING')) {
      lic.ip_address = params[0] || '';
      lic.app_version = params[1] || '';
      lic.last_ping = new Date().toISOString();
    } else {
      // General update
      lic.client_name = params[0];
      lic.store_name = params[1];
      lic.phone = params[2];
      lic.email = params[3];
      lic.max_devices = params[4];
      lic.notes = params[5];
      lic.expires_at = params[6];
      lic.status = params[7];
      lic.updated_at = new Date().toISOString();
    }

    saveJsonData();
    return { rows: [lic], rowCount: 1 };
  }

  if (upper.startsWith('DELETE FROM LICENSES')) {
    const id = parseInt(params[0], 10);
    const initialLen = jsonData.licenses.length;
    jsonData.licenses = jsonData.licenses.filter(x => x.id !== id);
    saveJsonData();
    return { rows: [], rowCount: initialLen - jsonData.licenses.length };
  }

  if (upper.startsWith('UPDATE ADMIN_USERS')) {
    const id = parseInt(params[params.length - 1], 10);
    const admin = jsonData.admin_users.find(x => x.id === id);
    if (admin) {
      admin.password_hash = params[0];
      admin.salt = params[1];
      saveJsonData();
      return { rows: [admin], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('INSERT INTO LOGS')) {
    const nextId = jsonData.logs.reduce((max, x) => Math.max(max, x.id || 0), 0) + 1;
    jsonData.logs.push({
      id: nextId,
      license_id: params[0],
      action: params[1],
      details: params[2],
      ip_address: params[3],
      created_at: new Date().toISOString()
    });
    saveJsonData();
    return { rows: [], rowCount: 1, lastInsertId: nextId };
  }

  return { rows: [], rowCount: 0 };
}

async function get(sql, params = []) {
  const res = await query(sql, params);
  return res.rows[0] || null;
}

async function all(sql, params = []) {
  const res = await query(sql, params);
  return res.rows || [];
}

async function run(sql, params = []) {
  return await query(sql, params);
}

module.exports = {
  initDatabase,
  query,
  get,
  all,
  run,
  hashPassword,
  generateSalt,
  getDbType: () => dbType
};
