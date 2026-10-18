import React from 'react';
export function Switch({ checked, onChange, label, disabled, style }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, ...style }}>
    <button type="button" role="switch" aria-checked={!!checked} disabled={disabled} onClick={() => onChange && onChange(!checked)} style={{ width: 36, height: 20, padding: 2, border: 0, borderRadius: 10, background: checked ? 'var(--orange-500)' : 'var(--gray-300)', cursor: 'inherit', transition: 'background var(--dur-base) var(--ease-out)' }}>
      <span style={{ display: 'block', width: 16, height: 16, borderRadius: 8, background: '#fff', boxShadow: 'var(--shadow-1)', transform: checked ? 'translateX(16px)' : 'none', transition: 'transform var(--dur-base) var(--ease-out)' }} /></button>
    {label && <span style={{ font: '500 14px var(--font-body)', color: 'var(--text-strong)' }}>{label}</span>}</label>;
}
