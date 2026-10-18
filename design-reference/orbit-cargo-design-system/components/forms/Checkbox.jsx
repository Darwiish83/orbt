import React from 'react';
export function Checkbox({ checked, onChange, label, description, disabled, style }) {
  return <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, ...style }}>
    <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange && onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
    <span style={{ flex: 'none', width: 18, height: 18, marginTop: 1, borderRadius: 'var(--radius-xs)', border: `1.5px solid ${checked ? 'var(--navy-700)' : 'var(--gray-400)'}`, background: checked ? 'var(--navy-700)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--dur-fast)' }}>
      {checked && <span style={{ width: 5, height: 9, borderRight: '2px solid #fff', borderBottom: '2px solid #fff', transform: 'translateY(-1px) rotate(45deg)' }} />}</span>
    <span>{label && <span style={{ display: 'block', font: '500 14px/1.3 var(--font-body)', color: 'var(--text-strong)' }}>{label}</span>}
      {description && <span style={{ display: 'block', font: '400 13px/1.4 var(--font-body)', color: 'var(--text-muted)', marginTop: 2 }}>{description}</span>}</span></label>;
}
