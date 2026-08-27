import React from 'react';
import { Loader2 } from 'lucide-react';

/** Inline spinner (icon only). */
export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`.trim()} />;
}

/** Full-panel loading state, sized like an EmptyState. */
export default function LoadingState({ label = 'Loading…', height = 200 }) {
  return (
    <div className="empty-state" style={{ height }}>
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
      <p>{label}</p>
    </div>
  );
}
