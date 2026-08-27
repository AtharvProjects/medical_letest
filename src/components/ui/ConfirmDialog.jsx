import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * ConfirmDialog — replaces window.confirm() with an in-app dialog.
 * variant controls the confirm button colour (danger by default).
 */
export default function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onClose,
}) {
  const tone = {
    danger: { color: 'var(--danger)', bg: 'var(--danger-bg)' },
    warning: { color: 'var(--warning)', bg: 'var(--warning-bg)' },
    primary: { color: 'var(--primary)', bg: 'var(--primary-bg)' },
  }[variant] || { color: 'var(--danger)', bg: 'var(--danger-bg)' };

  return (
    <Modal
      title={title}
      onClose={onClose}
      size={430}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: tone.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertTriangle size={18} style={{ color: tone.color }} />
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 2 }}>
          {message}
        </p>
      </div>
    </Modal>
  );
}
