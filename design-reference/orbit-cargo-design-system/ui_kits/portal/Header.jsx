var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, Tooltip, TrackingTimeline, ShipmentRow } = window.OrbitDesignSystem_da09b0;
function PortalHeader({ screen, go }) {
  const nav = [['track','Track'],['shipments','Shipments'],['quote','Ship now']];
  return <header style={{ background: 'var(--navy-700)', color: '#fff' }}>
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', height: 68, display: 'flex', alignItems: 'center', gap: 40 }}>
      <img src="../../assets/orbit-logo-reversed.png" alt="Orbit Cargo & Logistics" style={{ height: 44, cursor: 'pointer' }} onClick={() => go('track')} />
      <nav style={{ display: 'flex', gap: 28, flex: 1 }}>{nav.map(([k, l]) => <a key={k} onClick={() => go(k)} style={{ cursor: 'pointer', textDecoration: 'none', font: '600 14px var(--font-body)', color: screen === k ? '#fff' : 'var(--navy-300)', padding: '24px 0 21px', borderBottom: `3px solid ${screen === k ? 'var(--orange-500)' : 'transparent'}` }}>{l}</a>)}</nav>
      <IconButton label="Notifications" icon={<Icon name="bell" />} style={{ color: '#fff' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: '600 14px var(--font-body)' }}><span style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--orange-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px var(--font-body)' }}>AO</span>Adaeze O.</div>
    </div></header>;
}
const Overline = ({ children, color = 'var(--orange-600)' }) => <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: '700 11px var(--font-body)', letterSpacing: '.14em', textTransform: 'uppercase', color }}><span style={{ width: 24, height: 2, background: 'var(--orange-500)' }} />{children}</div>;
Object.assign(window, { PortalHeader, Overline });
