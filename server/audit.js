const db = require('./db');

function logAction(action, entityType, entityId, oldData = null, newData = null, userName = 'System') {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, user_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      action,
      entityType,
      entityId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      userName
    );
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
}

module.exports = {
  logAction
};
