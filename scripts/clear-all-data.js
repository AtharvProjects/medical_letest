const fs = require('fs');
const path = require('path');
let electronApp = null;
try {
  const electron = require('electron');
  electronApp = electron.app;
} catch (e) {}

function runCleanup() {
  const Database = require('better-sqlite3');

  const candidatePaths = [
    path.join(process.env.APPDATA || '', 'athass-medisync', 'pharmacy.db'),
    path.join(process.env.APPDATA || '', 'shree-samarth-medical', 'pharmacy.db'),
    path.join(__dirname, '..', 'data', 'pharmacy.db')
  ];

  console.log('=== ATHASSMEDISYNC DATA CLEANUP UTILITY ===\n');

  for (const dbPath of candidatePaths) {
    if (!fs.existsSync(dbPath)) {
      console.log(`[Skipped] Database not found at: ${dbPath}`);
      continue;
    }

    console.log(`\n[Processing] Found database at: ${dbPath}`);

    // Create a safety backup first
    const backupPath = dbPath + '.bak.' + Date.now();
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`  -> Created safety backup at: ${backupPath}`);
    } catch (err) {
      console.warn(`  -> Could not create safety backup: ${err.message}`);
    }

    try {
      const db = new Database(dbPath);
      db.pragma('foreign_keys = OFF');

      const tables = [
        'invoice_items',
        'invoice_h1_details',
        'invoices',
        'purchase_items',
        'supplier_payments',
        'purchases',
        'batches',
        'medicines',
        'customers',
        'doctors',
        'suppliers',
        'audit_logs',
        'backups'
      ];

      for (const table of tables) {
        try {
          const countBefore = db.prepare(`SELECT count(*) as count FROM ${table}`).get().count;
          db.prepare(`DELETE FROM ${table}`).run();
          console.log(`  -> Cleared table "${table}": deleted ${countBefore} records.`);
        } catch (err) {
          console.log(`  -> Note: table "${table}" (${err.message})`);
        }
      }

      try {
        db.prepare(`DELETE FROM sqlite_sequence`).run();
        console.log(`  -> Reset all auto-increment sequence counters.`);
      } catch (err) {
        // Ignored if sqlite_sequence doesn't exist
      }

      db.pragma('foreign_keys = ON');
      db.exec('VACUUM');
      db.close();

      console.log(`\n[Success] Successfully cleared database at: ${dbPath}`);
    } catch (err) {
      console.error(`  [Error] Failed to clear database: ${err.message}`);
    }
  }

  console.log('\n=== Cleanup finished! ===\n');
  if (electronApp && typeof electronApp.quit === 'function') {
    electronApp.quit();
  }
}

if (electronApp && typeof electronApp.whenReady === 'function') {
  electronApp.whenReady().then(runCleanup);
} else {
  runCleanup();
}
