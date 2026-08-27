import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * SearchInput — search box with a leading icon and a clear button.
 * onChange receives the raw string value (not the event) for convenience.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  autoFocus = false,
  inputRef,
  onKeyDown,
  style,
  width,
}) {
  return (
    <div className="search-box" style={{ ...(width ? { width } : null), ...style }}>
      <Search />
      <input
        ref={inputRef}
        className="form-input"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: 4,
            borderRadius: 4,
          }}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
