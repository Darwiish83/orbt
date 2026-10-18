var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, Tooltip, TrackingTimeline, ShipmentRow } = window.OrbitDesignSystem_da09b0;
const SHIPMENTS = [
  { id: 'ORB-2048-7731', origin: 'Lagos', destination: 'London LHR', mode: 'Air', eta: 'Oct 9', status: 'transit', tab: 'active' },
  { id: 'ORB-2048-6102', origin: 'Accra', destination: 'Rotterdam', mode: 'Sea', eta: 'Oct 21', status: 'delayed', tab: 'active' },
  { id: 'ORB-2048-5540', origin: 'Port Harcourt', destination: 'Dubai DXB', mode: 'Air', eta: 'Oct 8', status: 'exception', tab: 'active' },
  { id: 'ORB-2048-8013', origin: 'Lagos', destination: 'Abuja', mode: 'Road', eta: 'Oct 10', status: 'booked', tab: 'active' },
  { id: 'ORB-2047-9915', origin: 'Abuja', destination: 'Kano', mode: 'Road', eta: 'Oct 3', status: 'delivered', tab: 'delivered' },
  { id: 'ORB-2047-9402', origin: 'Lagos', destination: 'Houston IAH', mode: 'Air', eta: 'Sep 29', status: 'delivered', tab: 'delivered' }];
function ShipmentsScreen({ go }) {
  const [tab, setTab] = React.useState('active');
  const [mode, setMode] = React.useState('All');
  const [sel, setSel] = React.useState('ORB-2048-7731');
  const [cancel, setCancel] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const rows = SHIPMENTS.filter(s => s.tab === tab && (mode === 'All' || s.mode === mode));
  const cur = SHIPMENTS.find(s => s.id === sel);
  const stats = [['Active', 4], ['In transit', 1], ['Needs attention', 2], ['Delivered (30d)', 18]];
  return <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
      <div><Overline>Dashboard</Overline><h1 style={{ margin: '10px 0 0', font: '700 30px/1.25 var(--font-display)', color: 'var(--text-strong)' }}>Shipments</h1></div>
      <div style={{ display: 'flex', gap: 8 }}><Button variant="outline" leadingIcon={<Icon name="download" size={16} />}>Export</Button><Button onClick={() => go('quote')} leadingIcon={<Icon name="plus" size={16} />}>New shipment</Button></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16, marginBottom: 24 }}>{stats.map(([l, n]) => <Card key={l} padding={18}><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{l}</div><div style={{ font: '800 30px/1.2 var(--font-display)', color: 'var(--navy-700)', marginTop: 4 }}>{n}</div></Card>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.8fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
      <Card padding={0}>
        <div style={{ padding: '4px 16px 0' }}><Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'Active', count: 4 }, { value: 'delivered', label: 'Delivered' }]} /></div>
        <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>{['All', 'Air', 'Sea', 'Road'].map(m => <Tag key={m} selected={mode === m} onClick={() => setMode(m)}>{m}</Tag>)}</div>
        {rows.map(s => <ShipmentRow key={s.id} {...s} selected={s.id === sel} onClick={() => setSel(s.id)} />)}
        {!rows.length && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No shipments match this filter.</div>}</Card>
      {cur && <Card eyebrow={cur.mode + ' freight'} title={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 17 }}>{cur.id}</span>}>
        <div style={{ font: '600 15px var(--font-body)', color: 'var(--text-strong)', marginBottom: 16 }}>{cur.origin} <span style={{ color: 'var(--orange-500)' }}>→</span> {cur.destination}</div>
        <TrackingTimeline events={cur.status === 'delivered' ? [{ title: 'Picked up', location: cur.origin, state: 'done' }, { title: 'Delivered', location: cur.destination, time: cur.eta, state: 'done' }] : [{ title: 'Picked up', location: cur.origin, state: cur.status === 'booked' ? 'current' : 'done' }, { title: cur.status === 'delayed' ? 'Delayed at port' : cur.status === 'exception' ? 'Customs hold — invoice needed' : 'In transit', state: cur.status === 'booked' ? 'upcoming' : 'current' }, { title: 'Delivered', location: cur.destination, time: 'ETA ' + cur.eta, state: 'upcoming' }]} />
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}><Button variant="secondary" size="s" onClick={() => go('track')}>Full tracking</Button>{cur.status === 'booked' && <Button variant="ghost" size="s" onClick={() => setCancel(true)}>Cancel</Button>}</div></Card>}
    </div>
    <Dialog open={cancel} onClose={() => setCancel(false)} title="Cancel shipment?" footer={<><Button variant="ghost" onClick={() => setCancel(false)}>Keep shipment</Button><Button onClick={() => { setCancel(false); setToast('Shipment cancelled'); setTimeout(() => setToast(null), 2600); }}>Cancel shipment</Button></>}>
      <p style={{ margin: 0, fontSize: 14 }}>{sel} hasn't been picked up yet. You won't be charged.</p></Dialog>
    {toast && <Toast title={toast} message="A confirmation has been sent to your email." style={{ position: 'fixed', right: 24, bottom: 24 }} onClose={() => setToast(null)} />}
  </div>;
}
window.ShipmentsScreen = ShipmentsScreen;
