const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = process.env.APPDATA 
  ? path.join(process.env.APPDATA, 'athass-medisync', 'pharmacy.db')
  : path.join(os.homedir(), 'AppData', 'Roaming', 'athass-medisync', 'pharmacy.db');

if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  db.prepare("DELETE FROM settings WHERE key = 'license_key'").run();
  console.log('License key successfully removed from database.');
  db.close();
} else {
  console.log('Database not found at', dbPath);
}
