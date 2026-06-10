const { app } = require('electron');
const fs = require('fs');
app.whenReady().then(() => {
  const db = require('./server/db.js');
  const tables = ['medicines','suppliers','doctors','customers','batches','purchases','invoices','invoice_items','customers'];
  let out = '';
  for (const t of tables) {
    const c = db.prepare('SELECT COUNT(*) as c FROM ' + t).get();
    out += t + '=' + c.c + '\n';
  }
  const rev = db.prepare('SELECT SUM(total_amount) as r FROM invoices').get();
  out += 'revenue=' + Math.round(rev.r) + '\n';
  const lowStock = db.prepare('SELECT COUNT(*) as c FROM batches WHERE quantity <= 10').get();
  out += 'low_stock_batches=' + lowStock.c;
  fs.writeFileSync('data/verify.txt', out);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
