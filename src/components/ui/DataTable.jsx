import React from 'react';
import EmptyState from './EmptyState';
import LoadingState from './Spinner';

/**
 * DataTable — dense, config-driven table over the .data-table classes.
 *
 * columns: [{ header, key?, render?(row,i), align?: 'left'|'right'|'center', width? }]
 * rows:    array of records
 * rowKey:  (row, i) => key   (defaults to row.id ?? i)
 * loading: show LoadingState
 * empty:   node shown when there are no rows (defaults to a plain EmptyState)
 * onRowClick: (row) => void  (makes rows clickable)
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (r, i) => (r && r.id != null ? r.id : i),
  loading = false,
  empty,
  onRowClick,
}) {
  if (loading) return <LoadingState />;
  if (!rows || rows.length === 0) {
    return empty || <EmptyState message="No records found." />;
  }

  const alignClass = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : '');

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} className={alignClass(c.align)} style={c.width ? { width: c.width } : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr
            key={rowKey(row, ri)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            {columns.map((c, ci) => (
              <td key={ci} className={alignClass(c.align)}>
                {c.render ? c.render(row, ri) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
