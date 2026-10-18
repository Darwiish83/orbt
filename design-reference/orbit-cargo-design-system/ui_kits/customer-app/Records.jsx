var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, TrackingTimeline } = window.OrbitDesignSystem_da09b0;
function DocumentsScreen({ nav, initial = 'packing' }) {
  const t = useT(); const D = window.ORBIT_DATA;
  const [tab, setTab] = React.useState(initial); const [q, setQ] = React.useState(''); const [yr, setYr] = React.useState('2026'); const [tr, setTr] = React.useState('All');
  const [from, setFrom] = React.useState('2026-01-01'); const [to, setTo] = React.useState('2026-10-07'); const [page, setPage] = React.useState(1);
  const docs = D.documents.filter(d => d.customer === D.me && String(d.year) === yr && (tr === 'All' || d.mode === tr) && (!q || (d.file + d.shipment).toLowerCase().includes(q.toLowerCase())));
  const L = myLines(); const inv = D.invoices.filter(i => i.ref === D.me);
  const recs = L.filter(l => l.date >= from && l.date <= to).map(l => { const i = inv.find(x => x.shipment === l.code) || { no: '—', paid: 0, balance: l.total, status: 'Unpaid' }; return { ...l, inv: i }; });
  const per = 3, pages = Math.max(1, Math.ceil(recs.length / per)), shown = recs.slice((page - 1) * per, page * per);
  const sum = [['Total Shipments', recs.length], ['Total KG', num(recs.filter(r => r.mode === 'Air').reduce((a, r) => a + r.measure, 0), 1)], ['Total CBM', num(recs.filter(r => r.mode === 'Sea').reduce((a, r) => a + r.measure, 0), 1)], ['Invoices', money(recs.reduce((a, r) => a + r.total, 0))], ['Paid Money', money(recs.reduce((a, r) => a + r.inv.paid, 0))], ['Remaining Money', money(recs.reduce((a, r) => a + r.inv.balance, 0))]];
  return <Scroll>
    <Tabs value={tab} onChange={setTab} tabs={[{ value: 'packing', label: t('My Packing Lists') }, { value: 'records', label: t('My Records') }]} />
    {tab === 'packing' && <>
      <SearchBox value={q} onChange={setQ} placeholder="Search packing lists" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><Select label={t('Year')} value={yr} onChange={e => setYr(e.target.value)} options={['2026', '2025']} /><Select label={t('Transport')} value={tr} onChange={e => setTr(e.target.value)} options={[{ value: 'All', label: t('All') }, { value: 'Air', label: t('Air Freight') }, { value: 'Sea', label: t('Sea Freight') }]} /></div>
      <SectionTitle>Available Packing Lists</SectionTitle>
      {docs.map(d => <Card key={d.ref} padding={12}><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ width: 40, height: 48, flex: 'none', borderRadius: 4, background: 'var(--red-50)', color: 'var(--red-600)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, font: '800 9px var(--font-body)' }}><Icon name="file-text" size={18} />PDF</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: '600 13px var(--font-body)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('Shipment')} {scode(d.shipment)} · {fdate(d.date)} · {d.size}</div></div>
        <IconButton size="s" variant="outline" label={t('View')} icon={<Icon name="eye" size={15} />} onClick={() => nav.toast(t('Opening'), d.file)} />
        <IconButton size="s" variant="secondary" label={t('Download')} icon={<Icon name="download" size={15} />} onClick={() => nav.toast(t('Downloaded'), d.file)} /></div></Card>)}
      {!docs.length && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>{t('No records found')}</div>}</>}
    {tab === 'records' && <>
      <SectionTitle action={<Button size="s" variant="outline" leadingIcon={<Icon name="file-down" size={14} />} onClick={() => nav.toast(t('Exported'), 'Records_' + D.me + '.xlsx')}>{t('Export')}</Button>}>Shipment Records</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><DateField label="From Date" value={from} onChange={v => { setFrom(v); setPage(1); }} /><DateField label="To Date" value={to} onChange={v => { setTo(v); setPage(1); }} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{sum.map(([l, v], i) => <div key={l} style={{ background: i > 2 ? (i === 5 ? 'var(--status-danger-bg)' : i === 4 ? 'var(--status-success-bg)' : 'var(--navy-50)') : '#fff', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-m)', padding: '10px 8px' }}><div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.25 }}>{t(l)}</div><div style={{ font: '800 14px var(--font-display)', color: i === 5 ? 'var(--status-danger)' : i === 4 ? 'var(--status-success)' : 'var(--text-strong)', marginTop: 4, whiteSpace: 'nowrap' }}>{v}</div></div>)}</div>
      {shown.map(r => <Card key={r.tracking} interactive padding={12}><div onClick={() => nav.push('record', r)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span style={{ font: '600 13px var(--font-mono)', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{scode(r.code)}</span><StatusBadge status={r.inv.status} /></div>
        <div style={{ fontSize: 13, color: 'var(--text-body)' }}>{t(r.mode === 'Air' ? 'Air Cargo' : 'Sea Cargo')} · {r.origin} → {r.dest}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, fontSize: 12 }}>{[['Date', fdate(r.date)], ['Packages', r.packages], ['Invoice', r.inv.no]].map(([l, v]) => <div key={l}><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t(l)}</div><div style={{ fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div></div>)}</div></div></Card>)}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        <IconButton size="s" variant="outline" label={t('Previous')} icon={<Icon name="chevron-left" size={16} />} onClick={() => setPage(Math.max(1, page - 1))} />
        {Array.from({ length: pages }, (_, i) => i + 1).map(n => <button key={n} onClick={() => setPage(n)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-s)', border: '1px solid ' + (n === page ? 'var(--navy-700)' : 'var(--border-strong)'), background: n === page ? 'var(--navy-700)' : '#fff', color: n === page ? '#fff' : 'var(--text-strong)', font: '700 13px var(--font-body)', cursor: 'pointer' }}>{n}</button>)}
        <IconButton size="s" variant="outline" label={t('Next')} icon={<Icon name="chevron-right" size={16} />} onClick={() => setPage(Math.min(pages, page + 1))} /></div></>}
  </Scroll>;
}
function RecordDetail({ r, nav }) {
  const t = useT(); const [tab, setTab] = React.useState('overview'); const D = window.ORBIT_DATA;
  const docs = D.documents.filter(d => d.shipment === r.code && (d.customer === D.me || d.kind === 'Shipment'));
  const pays = D.payments.filter(p => p.inv === r.inv.no);
  return <Scroll>
    <div style={{ background: 'var(--navy-700)', color: '#fff', borderRadius: 'var(--radius-l)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Overline color="var(--orange-400)">{t('Shipment No.')}</Overline><StatusBadge status={r.status} /></div>
      <div style={{ font: '600 18px var(--font-mono)', margin: '8px 0 12px' }}>{scode(r.code)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{[['Paid', money(r.inv.paid), '#3DDC97'], ['Remaining', money(r.inv.balance), 'var(--orange-400)']].map(([l, v, c]) => <div key={l} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 'var(--radius-m)', padding: 10 }}><div style={{ fontSize: 11, color: 'var(--navy-300)' }}>{t(l)}</div><div style={{ font: '800 18px var(--font-display)', color: c }}>{v}</div></div>)}</div></div>
    <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: t('Overview') }, { value: 'documents', label: t('Documents'), count: docs.length }, { value: 'transactions', label: t('Transactions'), count: pays.length }]} />
    {tab === 'overview' && <>
      <Card padding={14} title={t('Shipment information')}><KV label="Type" value={t(r.mode === 'Air' ? 'Air Cargo' : 'Sea Cargo')} /><KV label="Origin" value={r.origin + ' (' + r.oc + ')'} /><KV label="Destination" value={r.dest + ' (' + r.dc + ')'} /><KV label="Date" value={fdate(r.date)} /><KV label="Arrival" value={fdate(r.arrival)} /><KV label="Packages" value={r.packages} /><KV label={r.mode === 'Air' ? 'Weight' : 'CBM'} value={num(r.measure, 1) + (r.mode === 'Air' ? ' kg' : ' m³')} /><KV label="Invoice" value={r.inv.no} mono /><KV label="Status" value={<StatusBadge status={r.inv.status} />} /></Card>
      <Card padding={14} title={t('Customer information')}><KV label="Full Name" value={ME.name} /><KV label="Customer Reference" value={ME.ref} mono /><KV label="Phone Number" value={ME.phone} /><KV label="Location" value={ME.location} /></Card></>}
    {tab === 'documents' && docs.map(d => <Card key={d.ref} padding={12}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: 'var(--red-600)' }}><Icon name="file-text" size={22} /></span><div style={{ flex: 1, minWidth: 0 }}><div style={{ font: '600 13px var(--font-body)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fdate(d.date)} · {d.size}</div></div><IconButton size="s" variant="outline" label={t('Download')} icon={<Icon name="download" size={15} />} onClick={() => nav.toast(t('Downloaded'), d.file)} /></div></Card>)}
    {tab === 'transactions' && <Card padding={14} title={t('Transaction history')}>{pays.length ? pays.map(p => <div key={p.txn} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-default)', fontSize: 13 }}><div><div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{p.bank}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.txn} · {fdate(p.date)}</div></div><b style={{ color: 'var(--status-success)' }}>{money(p.amount)}</b></div>) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('No payments yet')}</div>}</Card>}
  </Scroll>;
}
Object.assign(window, { DocumentsScreen, RecordDetail });
