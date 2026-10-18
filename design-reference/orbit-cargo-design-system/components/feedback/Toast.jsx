import React from 'react';
const T = { success: 'var(--status-success)', info: 'var(--status-info)', warning: 'var(--status-warning)', danger: 'var(--status-danger)' };
export function Toast({ tone = 'success', title, message, onClose, style }) {
  return <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: 360, maxWidth: '100%', padding: '14px 16px', background: 'var(--navy-900)', color: '#fff', borderRadius: 'var(--radius-m)', boxShadow: 'var(--shadow-3)', ...style }}>
    <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 4, marginTop: 6, background: T[tone] === T.success ? '#3DDC97' : tone === 'danger' ? '#FF6B63' : tone === 'warning' ? '#FFC24D' : '#6FB0FF' }} />
    <div style={{ flex: 1 }}><div style={{ font: '700 14px/1.3 var(--font-body)' }}>{title}</div>{message && <div style={{ font: '400 13px/1.4 var(--font-body)', color: 'var(--navy-300)', marginTop: 2 }}>{message}</div>}</div>
    {onClose && <button aria-label="Dismiss" onClick={onClose} style={{ border: 0, background: 'none', color: 'var(--navy-300)', cursor: 'pointer', font: '400 18px/1 var(--font-body)' }}>×</button>}</div>;
}
