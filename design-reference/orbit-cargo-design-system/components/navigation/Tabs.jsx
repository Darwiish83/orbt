import React from 'react';
export function Tabs({ tabs = [], value, onChange, style }) {
  return <div role="tablist" style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border-default)', ...style }}>
    {tabs.map(t => { const id = typeof t === 'string' ? t : t.value, lab = typeof t === 'string' ? t : t.label, on = id === value;
      return <button key={id} role="tab" aria-selected={on} onClick={() => onChange && onChange(id)} style={{ position: 'relative', padding: '12px 0', marginBottom: -1, border: 0, background: 'none', cursor: 'pointer', font: `${on ? 700 : 500} 14px/1 var(--font-body)`, color: on ? 'var(--navy-700)' : 'var(--text-muted)', borderBottom: `3px solid ${on ? 'var(--orange-500)' : 'transparent'}`, display: 'flex', gap: 6, alignItems: 'center' }}>
        {lab}{t.count != null && <span style={{ font: '600 11px/1 var(--font-body)', padding: '3px 6px', borderRadius: 'var(--radius-xs)', background: on ? 'var(--navy-700)' : 'var(--gray-200)', color: on ? '#fff' : 'var(--gray-700)' }}>{t.count}</span>}</button>; })}</div>;
}
