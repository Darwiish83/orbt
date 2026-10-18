import React from 'react';
const V = {
  primary: { bg: 'var(--action-primary)', hover: 'var(--action-primary-hover)', press: 'var(--action-primary-press)', fg: '#fff', bd: 'transparent' },
  secondary: { bg: 'var(--action-secondary)', hover: 'var(--action-secondary-hover)', press: 'var(--action-secondary-press)', fg: '#fff', bd: 'transparent' },
  outline: { bg: 'transparent', hover: 'var(--navy-50)', press: 'var(--navy-100)', fg: 'var(--navy-700)', bd: 'var(--navy-700)' },
  ghost: { bg: 'transparent', hover: 'var(--gray-100)', press: 'var(--gray-200)', fg: 'var(--navy-700)', bd: 'transparent' },
  inverse: { bg: '#fff', hover: 'var(--navy-50)', press: 'var(--navy-100)', fg: 'var(--navy-700)', bd: 'transparent' },
};
const S = { s: { h: 'var(--control-h-s)', px: 12, fs: 13 }, m: { h: 'var(--control-h-m)', px: 16, fs: 14 }, l: { h: 'var(--control-h-l)', px: 22, fs: 15 } };
export function Button({ variant = 'primary', size = 'm', leadingIcon, trailingIcon, fullWidth, disabled, children, style, ...rest }) {
  const [st, setSt] = React.useState('rest');
  const v = V[variant] || V.primary, s = S[size] || S.m;
  const bg = disabled ? (variant === 'ghost' || variant === 'outline' ? 'transparent' : 'var(--gray-200)') : st === 'press' ? v.press : st === 'hover' ? v.hover : v.bg;
  return (
    <button disabled={disabled} {...rest}
      onMouseEnter={() => setSt('hover')} onMouseLeave={() => setSt('rest')} onMouseDown={() => setSt('press')} onMouseUp={() => setSt('hover')}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: s.h, padding: `0 ${s.px}px`, width: fullWidth ? '100%' : undefined,
        font: `700 ${s.fs}px/1 var(--font-body)`, letterSpacing: '.01em', color: disabled ? 'var(--gray-500)' : v.fg, background: bg,
        border: `1.5px solid ${disabled && variant === 'outline' ? 'var(--gray-300)' : v.bd}`, borderRadius: 'var(--radius-s)', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease-out)', whiteSpace: 'nowrap', ...style }}>
      {leadingIcon}{children}{trailingIcon}
    </button>
  );
}
