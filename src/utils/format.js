// Shared display/formatting helpers used across pages.
// Pure functions only — safe to import anywhere.

// Local YYYY-MM-DD. Using toLocaleDateString('en-CA') avoids the UTC off-by-one
// that new Date().toISOString().slice(0,10) causes in +05:30 (IST) near midnight.
export const todayStr = () => new Date().toLocaleDateString('en-CA');

// Whole days from today until the given YYYY-MM-DD date (negative = past).
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.floor((d - new Date(todayStr() + 'T00:00:00')) / 86400000);
};

// ₹ amount with 2 decimals, null/NaN-safe.
export const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

// ₹ amount with Indian thousands grouping (₹1,23,456.00). Use for dashboard/report
// aggregates where large sums benefit from grouping; keep money() for line items.
export const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Human date: 05 Jan 2026. Accepts YYYY-MM-DD or a datetime string.
export const formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
