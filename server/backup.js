const db = require('./db');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'pharmacy.db')), 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function createBackup(type = 'Manual') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `pharmacy_backup_${timestamp}.db`;
  const destPath = path.join(BACKUP_DIR, filename);

  try {
    await db.backup(destPath);
    const stats = fs.statSync(destPath);
    
    db.prepare(`
      INSERT INTO backups (file_path, file_size, backup_type, status)
      VALUES (?, ?, ?, ?)
    `).run(destPath, stats.size, type, 'Success');

    return { success: true, filename, path: destPath, size: stats.size };
  } catch (err) {
    console.error('Backup failed:', err);
    db.prepare(`
      INSERT INTO backups (file_path, file_size, backup_type, status)
      VALUES (?, ?, ?, ?)
    `).run(destPath, 0, type, 'Failed: ' + err.message);
    throw err;
  }
}

function listBackups() {
  return db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
}

function deleteBackup(id) {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  if (backup && fs.existsSync(backup.file_path)) {
    fs.unlinkSync(backup.file_path);
  }
  return db.prepare('DELETE FROM backups WHERE id = ?').run(id);
}

module.exports = {
  createBackup,
  listBackups,
  deleteBackup,
  BACKUP_DIR
};
