import React from 'react';
import { Badge } from '../core/Badge.jsx';
const ST = { transit: ['info', 'In transit'], delivered: ['success', 'Delivered'], delayed: ['warning', 'Delayed'], exception: ['danger', 'Exception'], booked: ['neutral', 'Booked'] };
export function ShipmentRow({ id, origin, destination, mode, eta, status = 'transit', selected, onClick, style }) {
  const [h, setH] = React.useState(false); const [tone, lab] = ST[status] || ST.transit;
  return <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,2fr) minmax(0,.8fr) minmax(0,1fr) auto', gap: 16, alignItems: 'center', padding: '14px 16px', background: selected ? 'var(--navy-50)' : h ? 'var(--gray-50)' : '#fff', borderBottom: '1px solid var(--border-default)', boxShadow: selected ? 'inset 3px 0 0 var(--orange-500)' : 'none', cursor: onClick ? 'pointer' : 'default', ...style }}>
    <span style={{ font: '600 13px var(--font-mono)', color: 'var(--text-strong)' }}>{id}</span>
    <span style={{ font: '500 14px var(--font-body)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{origin} <span style={{ color: 'var(--orange-500)' }}>→</span> {destination}</span>
    <span style={{ font: '400 13px var(--font-body)', color: 'var(--text-muted)' }}>{mode}</span>
    <span style={{ font: '400 13px var(--font-body)', color: 'var(--text-muted)' }}>{eta}</span>
    <Badge tone={tone} dot>{lab}</Badge></div>;
}
