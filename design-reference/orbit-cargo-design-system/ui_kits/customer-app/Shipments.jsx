const COUNTRY = { Mumbai: 'India', 'Nhava Sheva': 'India', Guangzhou: 'China', Dubai: 'UAE', 'Jebel Ali': 'UAE', Istanbul: 'Turkey', Mersin: 'Turkey', Mogadishu: 'Somalia', Hargeisa: 'Somalia', Berbera: 'Somalia' };
var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, TrackingTimeline } = window.OrbitDesignSystem_da09b0;
function ShipmentCard({ s, onOpen }) {
  const t = useT(); const air = s.mode === 'Air';
  return <Card interactive padding={14}><div onClick={onOpen} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 30, height: 30, borderRadius: 'var(--radius-s)', background: air ? 'var(--orange-50)' : 'var(--navy-50)', color: air ? 'var(--orange-600)' : 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name={air ? 'plane' : 'ship'} size={16} /></span>
        <span><span style={{ display: 'block', font: '600 13px var(--font-mono)', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{s.tracking}</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t(air ? 'Air Cargo' : 'Sea Cargo')}</span></span></span>
      <StatusBadge status={s.status} /></div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('Origin')}</div><div style={{ font: '700 14px var(--font-body)', color: 'var(--text-strong)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flag country={s.ocountry || COUNTRY[s.origin]} size={13} />{t(s.ocountry || COUNTRY[s.origin] || s.origin)}</span></div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.origin} · {s.oc}</div></div>
      <div style={{ flex: 1, height: 2, background: 'repeating-linear-gradient(90deg,var(--orange-500) 0 6px,transparent 6px 10px)', minWidth: 20 }} />
      <div style={{ textAlign: 'right', minWidth: 0 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('Destination')}</div><div style={{ font: '700 14px var(--font-body)', color: 'var(--text-strong)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flag country={s.dcountry || COUNTRY[s.dest]} size={13} />{t(s.dcountry || COUNTRY[s.dest] || s.dest)}</span></div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.dest} · {s.dc}</div></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border-default)' }}>
      {[[air ? 'Weight' : 'CBM', air ? num(s.measure, 1) + ' kg' : num(s.measure, 1) + ' m³'], ['Packages', window.ORBIT_MIX.label(s, t)]].map(([l, v]) => <div key={l}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t(l)}</div><div style={{ font: '700 13px var(--font-body)', color: 'var(--text-strong)' }}>{v}</div></div>)}</div>
  </div></Card>;
}
function ShipmentsScreen({ nav }) {
  const t = useT(); const [f, setF] = React.useState('all'); const [q, setQ] = React.useState(''); const [yr, pickYr] = useCustYear();
  const L = myLines().filter(s => s.year === yr && (f === 'all' || s.mode === f) && (!q || (s.tracking + s.origin + s.dest + s.status).toLowerCase().includes(q.toLowerCase())));
  return <Scroll>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}><div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>{t('Customer Reference')}:<span style={{ font: '700 13px var(--font-mono)', color: 'var(--navy-700)', letterSpacing: 0 }}>{ME.ref}</span></div><h1 style={{ margin: '6px 0 0', font: '700 24px/1.2 var(--font-display)', color: 'var(--text-strong)' }}>{t('My Shipments')}</h1></div><YearPicker yr={yr} onChange={pickYr} /></div>
    <SearchBox value={q} onChange={setQ} placeholder="Search tracking number" />
    <Seg full size="s" options={[['all', 'All Shipments'], ['Air', 'Air Freight', 'plane'], ['Sea', 'Sea Freight', 'ship']]} value={f} onChange={setF} />
    {L.map(s => <ShipmentCard key={s.tracking} s={s} onOpen={() => nav.push('shipment', s)} />)}
    {!L.length && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 14 }}>{t('No records found')}</div>}
  </Scroll>;
}
function ShipmentDetail({ s }) {
  const t = useT(); const air = s.mode === 'Air';
  const idx = { 'At Origin Store': 0, Pending: 0, Departed: 1, 'On Hold': 1, 'In Transit': 2, Arrived: 3, Delivered: 3 }[s.status] ?? 0;
  const ev = [['At Origin Store', s.origin + ' ' + t('warehouse'), fdate(s.date)], ['Departed', s.origin + ' · ' + t(COUNTRY[s.origin] || ''), ''], ['In Transit', t(air ? 'Flight' : 'Vessel'), ''], ['Arrived', s.dest + ' · ' + t(COUNTRY[s.dest] || ''), fdate(s.arrival)]].map(([l, loc, tm], i) => ({ title: t(l), location: loc, time: tm, state: i < idx ? 'done' : i === idx ? 'current' : 'upcoming' }));
  return <Scroll>
    <div style={{ background: 'var(--navy-700)', color: '#fff', borderRadius: 'var(--radius-l)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Overline color="var(--orange-400)">{t('Tracking number')}</Overline><StatusBadge status={s.status} /></div>
      <div style={{ font: '600 18px var(--font-mono)', margin: '8px 0 14px' }}>{s.tracking}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div><div style={{ font: '800 20px var(--font-display)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flag country={s.ocountry || COUNTRY[s.origin]} size={13} />{t(s.ocountry || COUNTRY[s.origin] || s.origin)}</span></div><div style={{ fontSize: 12, color: 'var(--navy-300)' }}>{s.origin}</div></div>
        <div style={{ flex: 1, position: 'relative', height: 2, background: 'rgba(255,255,255,.2)' }}><div style={{ width: Math.max(8, idx / 3 * 100) + '%', height: 2, background: 'var(--orange-500)' }} /><span style={{ position: 'absolute', left: Math.max(8, idx / 3 * 100) + '%', top: -10, transform: 'translateX(-50%)', color: 'var(--orange-500)' }}><Icon name={air ? 'plane' : 'ship'} size={20} /></span></div>
        <div style={{ textAlign: 'right' }}><div style={{ font: '800 20px var(--font-display)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flag country={s.dcountry || COUNTRY[s.dest]} size={13} />{t(s.dcountry || COUNTRY[s.dest] || s.dest)}</span></div><div style={{ fontSize: 12, color: 'var(--navy-300)' }}>{s.dest}</div></div></div></div>
    <Card padding={16}><TrackingTimeline events={ev} /></Card>
    <Card padding={16} title={t('Shipment details')}>
      <KV label="Customer Reference" value={ME.ref} mono /><KV label="Shipment" value={scode(s.code)} mono /><KV label="Type" value={t(air ? 'Air Cargo' : 'Sea Cargo')} />
      
      <KV label={air ? 'Weight' : 'CBM'} value={air ? num(s.measure, 1) + ' kg' : num(s.measure, 1) + ' m³'} /><KV label="Packages" value={window.ORBIT_MIX.label(s, t)} />
      <KV label="Date" value={fdate(s.date)} /><KV label="Arrival" value={fdate(s.arrival)} /></Card>
    <AskShipmentBtn s={s} />
  </Scroll>;
}
Object.assign(window, { ShipmentCard, ShipmentsScreen, ShipmentDetail });
