var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, Tooltip, TrackingTimeline, ShipmentRow } = window.OrbitDesignSystem_da09b0;
const EVENTS = [{ title: 'Shipment booked', location: 'Ikeja, Lagos', time: 'Mon 6 Oct · 08:30', state: 'done' }, { title: 'Picked up', location: 'Ikeja, Lagos', time: 'Mon 6 Oct · 11:02', state: 'done' }, { title: 'Departed Orbit hub', location: 'Lagos LOS', time: 'Mon 6 Oct · 22:40', state: 'done' }, { title: 'In transit to London', location: 'Flight OB 312', time: 'Tue 7 Oct · 06:05', state: 'current' }, { title: 'Customs clearance', location: 'London LHR', state: 'upcoming' }, { title: 'Delivered', location: 'Camden, London', state: 'upcoming' }];
function TrackScreen() {
  const [q, setQ] = React.useState('ORB-2048-7731');
  const [res, setRes] = React.useState(null);
  const [err, setErr] = React.useState('');
  const go = () => { if (!/^ORB-/i.test(q.trim())) { setErr('Tracking numbers start with ORB-'); setRes(null); return; } setErr(''); setRes(q.trim().toUpperCase()); };
  return <div>
    <section style={{ background: 'var(--navy-700)', color: '#fff', padding: '56px 32px 88px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Overline color="var(--orange-400)">Air · Sea · Road</Overline>
        <h1 style={{ margin: '16px 0 12px', fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 118", fontWeight: 850, fontSize: 48, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '-.01em' }}>Track your <span style={{ color: 'var(--orange-500)' }}>shipment</span></h1>
        <p style={{ margin: 0, color: 'var(--navy-300)', fontSize: 17 }}>Enter your Orbit tracking number for live status.</p></div></section>
    <div style={{ maxWidth: 1200, margin: '-48px auto 0', padding: '0 32px 48px' }}>
      <Card elevated padding={20}><div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Input size="l" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} error={err} placeholder="ORB-0000-0000" leadingIcon={<Icon name="search" size={18} />} style={{ flex: 1 }} inputStyle={{ fontFamily: 'var(--font-mono)', fontSize: 16 }} />
        <Button size="l" onClick={go} trailingIcon={<Icon name="arrow-right" size={16} />}>Track</Button></div></Card>
      {res && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 24, marginTop: 24 }}>
        <Card eyebrow="Tracking" title={<span style={{ fontFamily: 'var(--font-mono)' }}>{res}</span>} actions={<Badge tone="info" dot>In transit</Badge>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0 24px', borderBottom: '1px solid var(--border-default)', marginBottom: 24 }}>
            <div><div style={{ font: '700 24px var(--font-display)', color: 'var(--text-strong)' }}>LOS</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lagos, NG</div></div>
            <div style={{ flex: 1, position: 'relative', height: 2, background: 'var(--gray-200)' }}><div style={{ width: '62%', height: 2, background: 'var(--orange-500)' }} /><span style={{ position: 'absolute', left: '62%', top: -11, transform: 'translateX(-50%)', color: 'var(--orange-500)', background: '#fff', padding: '0 4px' }}><Icon name="plane" size={20} /></span></div>
            <div style={{ textAlign: 'right' }}><div style={{ font: '700 24px var(--font-display)', color: 'var(--text-strong)' }}>LHR</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>London, UK</div></div></div>
          <TrackingTimeline events={EVENTS} /></Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card title="Estimated delivery"><div style={{ font: '800 30px var(--font-display)', color: 'var(--navy-700)' }}>Thu 9 Oct</div><div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>By 18:00 local time</div></Card>
          <Card title="Shipment details"><dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 14 }}>
            {[['Service', 'Express Air'], ['Pieces', '2'], ['Weight', '12.40 kg'], ['Reference', 'PO-55821']].map(([k, v]) => <React.Fragment key={k}><dt style={{ color: 'var(--text-muted)' }}>{k}</dt><dd style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 600, textAlign: 'right' }}>{v}</dd></React.Fragment>)}</dl></Card>
          <Card><Switch checked label="Text me when it's out for delivery" onChange={() => {}} /></Card></div></div>}
    </div></div>;
}
window.TrackScreen = TrackScreen;
