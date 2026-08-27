import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Shared, mount-ordered stack so that when modals are nested (e.g. a confirm
// dialog opened on top of a panel) only the top-most one reacts to Escape.
const modalStack = [];

/**
 * Modal — overlay dialog built on the .modal design-system classes.
 *
 * - Closes on Escape (top-most modal only) and on overlay click (can be disabled).
 * - If `onSubmit` is provided, the body + footer are wrapped in a <form>, so a
 *   footer button with type="submit" (and the Enter key) submits the form.
 *
 * props: title, onClose, footer, children, wide, size (px maxWidth override),
 *        onSubmit, closeOnOverlay
 */
export default function Modal({
  title,
  onClose,
  footer,
  children,
  wide = false,
  size,
  onSubmit,
  closeOnOverlay = true,
}) {
  // Keep the latest onClose in a ref so the keydown listener can register once
  // per mount — otherwise an inline onClose would re-run the effect every render
  // and reshuffle the stack, breaking the "top-most only" guarantee.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const onKey = (e) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(token);
      if (i !== -1) modalStack.splice(i, 1);
    };
  }, []);

  const body = (
    <>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </>
  );

  return (
    <div className="modal-overlay" onClick={closeOnOverlay ? onClose : undefined}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        style={size ? { maxWidth: size } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {onSubmit ? <form onSubmit={onSubmit}>{body}</form> : body}
      </div>
    </div>
  );
}
