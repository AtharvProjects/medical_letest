const db = require('./db');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'pharmacy.db')), 'backups');

// How many automatic backups to keep on disk, and the minimum gap between them.
const MAX_AUTO_BACKUPS = 20;
const AUTO_BACKUP_MIN_INTERVAL_HOURS = 6;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function createBackup(type = 'Manual') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `pharmacy_backup_${timestamp}.db`;
  const destPath = path.join(BACKUP_DIR, filename);

  try {
    // better-sqlite3's backup() produces a single consistent .db file even with
    // WAL enabled, so restoring a copied file no longer risks losing the -wal tail.
    await db.backup(destPath);
    const stats = fs.statSync(destPath);

    db.prepare(`
      INSERT INTO backups (file_path, file_size, backup_type, status)
      VALUES (?, ?, ?, ?)
    `).run(destPath, stats.size, type, 'Success');

    // Keep the backups folder bounded — prune only the automatic ones so that
    // deliberate, user-initiated Manual backups are never silently deleted.
    if (type === 'Auto') pruneAutoBackups();

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

// Delete successful Auto backups beyond the most recent MAX_AUTO_BACKUPS,
// removing both the file on disk and its row in the backups table.
function pruneAutoBackups(keep = MAX_AUTO_BACKUPS) {
  const stale = db.prepare(`
    SELECT id, file_path FROM backups
    WHERE backup_type = 'Auto' AND status = 'Success'
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT -1 OFFSET ?
  `).all(keep);

  for (const b of stale) {
    try {
      if (b.file_path && fs.existsSync(b.file_path)) fs.unlinkSync(b.file_path);
    } catch (err) {
      console.error('Failed to delete old backup file:', b.file_path, err.message);
    }
    db.prepare('DELETE FROM backups WHERE id = ?').run(b.id);
  }
  return stale.length;
}

// Create an automatic backup on boot, but skip it if a recent one already exists.
// This stops the backups folder from filling with near-identical copies when the
// dev server restarts repeatedly, while still capturing a daily snapshot in use.
async function maybeAutoBackup() {
  const recent = db.prepare(`
    SELECT COUNT(*) as n FROM backups
    WHERE backup_type = 'Auto' AND status = 'Success'
      AND datetime(created_at) > datetime('now', ?)
  `).get(`-${AUTO_BACKUP_MIN_INTERVAL_HOURS} hours`);

  if (recent && recent.n > 0) {
    return { skipped: true, reason: 'A recent automatic backup already exists.' };
  }
  return createBackup('Auto');
}

function listBackups() {
  return db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
}

function deleteBackup(id) {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  if (backup && backup.file_path && fs.existsSync(backup.file_path)) {
    fs.unlinkSync(backup.file_path);
  }
  return db.prepare('DELETE FROM backups WHERE id = ?').run(id);
}

module.exports = {
  createBackup,
  maybeAutoBackup,
  pruneAutoBackups,
  listBackups,
  deleteBackup,
  BACKUP_DIR
};
