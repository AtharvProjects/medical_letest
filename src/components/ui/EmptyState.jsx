import React from 'react';

/**
 * EmptyState — consistent "nothing here yet" panel.
 * props: icon (lucide component), title, message, action (node), height
 */
export default function EmptyState({ icon: Icon, title, message, action, height = 200 }) {
  return (
    <div className="empty-state" style={{ height }}>
      {Icon && <Icon size={40} strokeWidth={1.5} style={{ opacity: 0.45 }} />}
      {title && <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</p>}
      {message && <p style={{ fontSize: 12.5 }}>{message}</p>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}
