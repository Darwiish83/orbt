import React from 'react';
export function TrackingTimeline({ events = [], style }) {
  return <ol style={{ listStyle: 'none', margin: 0, padding: 0, ...style }}>
    {events.map((e, i) => { const last = i === events.length - 1; const cur = e.state === 'current', done = e.state === 'done';
      const c = cur ? 'var(--orange-500)' : done ? 'var(--navy-700)' : 'var(--gray-300)';
      return <li key={i} style={{ display: 'flex', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 18, flex: 'none' }}>
          <span style={{ width: cur ? 18 : 12, height: cur ? 18 : 12, marginTop: cur ? 1 : 4, borderRadius: '50%', background: done || cur ? c : '#fff', border: `2px solid ${c}`, boxShadow: cur ? '0 0 0 4px var(--orange-50)' : 'none', boxSizing: 'border-box' }} />
          {!last && <span style={{ flex: 1, width: 2, minHeight: 24, background: done ? 'var(--navy-700)' : 'var(--gray-200)', margin: '4px 0' }} />}</div>
        <div style={{ paddingBottom: last ? 0 : 18, flex: 1 }}>
          <div style={{ font: `${cur ? 700 : 600} 14px/1.3 var(--font-body)`, color: e.state === 'upcoming' ? 'var(--text-subtle)' : 'var(--text-strong)' }}>{e.title}</div>
          <div style={{ font: '400 13px/1.4 var(--font-body)', color: 'var(--text-muted)', marginTop: 2 }}>{[e.location, e.time].filter(Boolean).join(' · ')}</div></div></li>; })}</ol>;
}
