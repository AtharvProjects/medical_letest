import React, { useState, useMemo } from 'react';
import EmptyState from './EmptyState';
import LoadingState from './Spinner';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * DataTable — high-performance, dense, config-driven table.
 *
 * Props:
 *   columns: [{ header, key?, render?(row,i), align?: 'left'|'right'|'center', width? }]
 *   rows:    array of records
 *   rowKey:  (row, i) => key
 *   loading: boolean
 *   empty:   custom empty component
 *   onRowClick: (row) => void
 *   pagination: { page, pageSize, total, totalPages, onPageChange, onPageSizeChange } (server-side)
 *   pageSize: default page size for client-side pagination (default: 50)
 *   paginate: boolean (enable client-side pagination, default true if rows > 50)
 */
export default function DataTable({
  columns,
  rows = [],
  rowKey = (r, i) => (r && r.id != null ? r.id : i),
  loading = false,
  empty,
  onRowClick,
  pagination,
  pageSize: initialPageSize = 50,
  paginate = true,
}) {
  const [clientPage, setClientPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(initialPageSize);

  // Determine if using server-side pagination or client-side slicing
  const isServerPaged = !!pagination;

  const totalItems = isServerPaged ? pagination.total : rows.length;
  const currentPage = isServerPaged ? pagination.page : clientPage;
  const currentPageSize = isServerPaged ? pagination.pageSize : clientPageSize;
  const totalPages = isServerPaged
    ? pagination.totalPages || Math.ceil(totalItems / currentPageSize) || 1
    : Math.ceil(totalItems / currentPageSize) || 1;

  // Windowed visible rows
  const displayRows = useMemo(() => {
    if (isServerPaged || !paginate) return rows;
    const start = (clientPage - 1) * clientPageSize;
    return rows.slice(start, start + clientPageSize);
  }, [rows, isServerPaged, paginate, clientPage, clientPageSize]);

  const handlePageChange = (newPage) => {
    const target = Math.max(1, Math.min(totalPages, newPage));
    if (isServerPaged) {
      if (pagination.onPageChange) pagination.onPageChange(target);
    } else {
      setClientPage(target);
    }
  };

  const handleSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10) || 50;
    if (isServerPaged) {
      if (pagination.onPageSizeChange) pagination.onPageSizeChange(newSize);
    } else {
      setClientPageSize(newSize);
      setClientPage(1);
    }
  };

  if (loading) return <LoadingState />;
  if (!rows || rows.length === 0) {
    return empty || <EmptyState message="No records found." />;
  }

  const alignClass = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : '');

  const startItem = (currentPage - 1) * currentPageSize + 1;
  const endItem = Math.min(totalItems, currentPage * currentPageSize);

  return (
    <div className="table-container" style={{ width: '100%' }}>
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
          {displayRows.map((row, ri) => (
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

      {/* Pagination Footer */}
      {(paginate || isServerPaged) && totalItems > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: '1px solid var(--border, rgba(0,0,0,0.06))',
          background: 'var(--bg-glass, rgba(255,255,255,0.7))',
          fontSize: 13,
          color: 'var(--text-secondary, #64748b)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>
              Showing <b style={{ color: 'var(--text-primary)' }}>{startItem.toLocaleString()}</b>–<b style={{ color: 'var(--text-primary)' }}>{endItem.toLocaleString()}</b> of <b style={{ color: 'var(--text-primary)' }}>{totalItems.toLocaleString()}</b> records
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12 }}>Rows:</span>
              <select
                value={currentPageSize}
                onChange={handleSizeChange}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border, #cbd5e1)',
                  background: 'var(--bg-card, #ffffff)',
                  fontSize: 12,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <PaginationButton
              icon={ChevronsLeft}
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(1)}
              title="First Page"
            />
            <PaginationButton
              icon={ChevronLeft}
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              title="Previous Page"
            />
            
            <span style={{ padding: '0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Page {currentPage} of {totalPages}
            </span>

            <PaginationButton
              icon={ChevronRight}
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              title="Next Page"
            />
            <PaginationButton
              icon={ChevronsRight}
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(totalPages)}
              title="Last Page"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationButton({ icon: Icon, disabled, onClick, title }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        border: '1px solid var(--border, rgba(0,0,0,0.1))',
        background: disabled ? 'transparent' : 'var(--bg-card, #ffffff)',
        color: disabled ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary, #1e293b)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.15s ease',
      }}
    >
      <Icon size={14} />
    </button>
  );
}

