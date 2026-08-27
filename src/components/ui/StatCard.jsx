import React from 'react';

/**
 * StatCard — a single KPI tile (label + value) with a semantic accent stripe.
 * accent: blue | green | purple | amber | red
 */
const ACCENTS = {
  blue: 'stat-blue',
  green: 'stat-green',
  purple: 'stat-purple',
  amber: 'stat-peach',
  red: 'stat-rose',
};

export default function StatCard({ label, value, accent = 'blue', icon: Icon, sub, onClick }) {
  return (
    <div
      className={`glass-card ${ACCENTS[accent] || ''}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="flex justify-between items-start">
        <div style={{ minWidth: 0 }}>
          <div className="card-title">{label}</div>
          <div className="card-value">{value}</div>
          {sub && (
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              {sub}
            </div>
          )}
        </div>
        {Icon && <Icon size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
      </div>
    </div>
  );
}
