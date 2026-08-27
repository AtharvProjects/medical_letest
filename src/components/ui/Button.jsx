import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Button — the single button primitive for the whole app.
 * Wraps the .btn design-system classes so variants/sizes stay consistent.
 *
 * props:
 *   variant: primary | secondary | success | danger | warning | ghost
 *   size:    sm | md | lg
 *   icon:    a lucide icon component (rendered before the label)
 *   loading: show a spinner and disable
 */
const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  danger: 'btn-danger',
  warning: 'btn-warning',
  ghost: 'btn-ghost',
};

const SIZES = { sm: 'btn-sm', md: '', lg: 'btn-lg' };

const Button = React.forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    icon: Icon,
    iconSize,
    loading = false,
    disabled = false,
    className = '',
    children,
    ...rest
  },
  ref
) {
  const cls = ['btn', VARIANTS[variant] || VARIANTS.primary, SIZES[size] || '', className]
    .filter(Boolean)
    .join(' ');
  const resolvedIconSize = iconSize || (size === 'sm' ? 13 : size === 'lg' ? 17 : 15);

  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? (
        <Loader2 size={resolvedIconSize} className="animate-spin" />
      ) : Icon ? (
        <Icon size={resolvedIconSize} />
      ) : null}
      {children}
    </button>
  );
});

export default Button;
