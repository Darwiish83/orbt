var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, Tooltip, TrackingTimeline, ShipmentRow } = window.OrbitDesignSystem_da09b0;
function QuoteScreen({ go }) {
  const [mode, setMode] = React.useState('Air');
  const [speed, setSpeed] = React.useState('express');
  const [ins, setIns] = React.useState(true);
  const [sig, setSig] = React.useState(false);
  const [w, setW] = React.useState('12.4');
  const [done, setDone] = React.useState(false);
  const base = { Air: 9.8, Sea: 2.1, Road: 3.4 }[mode] * (parseFloat(w) || 0) * (speed === 'express' ? 1.45 : 1);
  const total = base + (ins ? 18 : 0) + (sig ? 4 : 0);
  const fmt = n => '$' + n.toFixed(2);
  if (done) return <div style={{ maxWidth: 560, margin: '64px auto', padding: '0 32px' }}><Card padding={32}><Badge tone="success" dot>Booked</Badge>
    <h1 style={{ margin: '16px 0 8px', font: '700 30px/1.25 var(--font-display)', color: 'var(--text-strong)' }}>Shipment booked</h1>
    <p style={{ margin: '0 0 20px', color: 'var(--text-muted)' }}>Your tracking number is <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>ORB-2048-8122</b>. We'll text you when the driver is on the way.</p>
    <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => go('shipments')}>View shipments</Button><Button variant="outline" onClick={() => setDone(false)}>Book another</Button></div></Card></div>;
  return <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>
    <Overline>Ship now</Overline><h1 style={{ margin: '10px 0 24px', font: '700 30px/1.25 var(--font-display)', color: 'var(--text-strong)' }}>Get a quote</h1>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.8fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card title="Route"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Input label="From" defaultValue="Ikeja, Lagos, NG" leadingIcon={<Icon name="map-pin" size={16} />} />
          <Input label="To" defaultValue="Camden, London, UK" leadingIcon={<Icon name="flag" size={16} />} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>{[['Air', 'plane'], ['Sea', 'ship'], ['Road', 'truck']].map(([m, i]) => <Tag key={m} selected={mode === m} onClick={() => setMode(m)} icon={<Icon name={i} size={14} />}>{m}</Tag>)}</div></Card>
        <Card title="Package"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Select label="Type" options={['Parcel', 'Pallet', 'Document', 'Container (20ft)']} />
          <Input label="Weight (kg)" value={w} onChange={e => setW(e.target.value)} error={parseFloat(w) > 0 ? '' : 'Enter a weight'} />
          <Input label="Dimensions (cm)" defaultValue="40 × 30 × 25" /></div></Card>
        <Card title="Service"><div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Radio name="speed" value="express" checked={speed === 'express'} onChange={setSpeed} label="Express" description="Delivered in 1–3 business days" />
          <Radio name="speed" value="standard" checked={speed === 'standard'} onChange={setSpeed} label="Standard" description="Delivered in 4–7 business days" />
          <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
          <Checkbox checked={ins} onChange={setIns} label="Cargo insurance" description="Covers loss or damage up to $5,000" />
          <Checkbox checked={sig} onChange={setSig} label="Signature on delivery" /></div></Card></div>
      <div style={{ position: 'sticky', top: 24, background: 'var(--navy-700)', color: '#fff', borderRadius: 'var(--radius-l)', padding: 24, boxShadow: 'var(--shadow-2)' }}>
        <Overline color="var(--orange-400)">Your quote</Overline>
        <div style={{ font: '850 48px/1.1 var(--font-display)', fontVariationSettings: "'wdth' 118", margin: '16px 0 4px' }}>{fmt(total)}</div>
        <div style={{ fontSize: 13, color: 'var(--navy-300)', marginBottom: 20 }}>Incl. fuel surcharge · excl. duties</div>
        {[[mode + ' freight · ' + (speed === 'express' ? 'Express' : 'Standard'), base], ins && ['Insurance', 18], sig && ['Signature', 4]].filter(Boolean).map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,.12)' }}><span style={{ color: 'var(--navy-100)' }}>{l}</span><span style={{ fontWeight: 600 }}>{fmt(v)}</span></div>)}
        <Button fullWidth size="l" style={{ marginTop: 20 }} onClick={() => setDone(true)} disabled={!(parseFloat(w) > 0)}>Book shipment</Button></div>
    </div></div>;
}
window.QuoteScreen = QuoteScreen;
