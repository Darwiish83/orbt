import React from 'react';
export function Radio({ checked, onChange, label, description, name, value, disabled, style }) {
  return <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, ...style }}>
    <input type="radio" name={name} value={value} checked={!!checked} disabled={disabled} onChange={() => onChange && onChange(value)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
    <span style={{ flex: 'none', width: 18, height: 18, marginTop: 1, borderRadius: 9, border: `1.5px solid ${checked ? 'var(--navy-700)' : 'var(--gray-400)'}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {checked && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--orange-500)' }} />}</span>
    <span>{label && <span style={{ display: 'block', font: '500 14px/1.3 var(--font-body)', color: 'var(--text-strong)' }}>{label}</span>}
      {description && <span style={{ display: 'block', font: '400 13px/1.4 var(--font-body)', color: 'var(--text-muted)', marginTop: 2 }}>{description}</span>}</span></label>;
}
