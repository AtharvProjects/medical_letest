import React from 'react';

/**
 * Badge — small status pill.
 * tone: blue | green | red | yellow | purple | gray
 */
const TONES = {
  blue: 'badge-blue',
  green: 'badge-green',
  red: 'badge-red',
  yellow: 'badge-yellow',
  purple: 'badge-purple',
  gray: 'badge-gray',
};

export default function Badge({ tone = 'gray', className = '', children, ...rest }) {
  return (
    <span className={['badge', TONES[tone] || TONES.gray, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}
