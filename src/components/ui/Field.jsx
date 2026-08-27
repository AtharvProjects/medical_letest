import React from 'react';

/**
 * Form primitives. FormField renders the label + validation text; Input/Select/
 * Textarea are thin wrappers over the .form-input/.form-select classes that add
 * an `error` prop for the red invalid state.
 */

export function FormField({ label, required, error, hint, htmlFor, className = '', style, children }) {
  return (
    <div className={`form-group ${className}`.trim()} style={style}>
      {label && (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
          {required && <span style={{ color: 'var(--danger)' }}> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <div style={{ fontSize: 10.5, color: 'var(--danger)', marginTop: 4, fontWeight: 600 }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  );
}

export function Input({ error = false, className = '', ...rest }) {
  return <input className={`form-input${error ? ' input-error' : ''} ${className}`.trim()} {...rest} />;
}

export function Select({ error = false, className = '', children, ...rest }) {
  return (
    <select className={`form-select${error ? ' input-error' : ''} ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ error = false, className = '', ...rest }) {
  return <textarea className={`form-input${error ? ' input-error' : ''} ${className}`.trim()} {...rest} />;
}
