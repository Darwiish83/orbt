var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, TrackingTimeline } = window.OrbitDesignSystem_da09b0;
const myInv = () => window.ORBIT_DATA.invoices.filter(i => i.ref === window.ORBIT_DATA.me);
const myPay = () => [...(window.OrbitBus ? window.OrbitBus.list(window.ORBIT_DATA.me).filter(n => n.kind === 'payment').map(n => ({ rcp: n.rcp, date: n.date, inv: n.inv, ref: n.ref, amount: n.amount, bank: n.bank, balance: n.balance, txn: n.rcp })) : []), ...window.ORBIT_DATA.payments.filter(p => p.ref === window.ORBIT_DATA.me)];
const myPayAll = () => { const P = myPay(), seen = new Set(); const R = P.filter(p => { const k = (p.rcp || '') + '|' + p.inv + '|' + p.date + '|' + p.amount; if (seen.has(k)) return false; seen.add(k); return true; }); myInv().forEach(i => { const got = R.filter(p => p.inv === i.no).reduce((a, p) => a + (+p.amount || 0), 0), gap = +((+i.paid || 0) - got).toFixed(2); if (gap > 0.009) R.push({ inv: i.no, ref: i.ref, date: i.paidDate || i.date, amount: gap, bank: i.bank || 'Orbit Cargo', txn: i.no, rcp: 'RCP-' + i.no.replace(/^INV-/, '') }); }); return R; };
const invBal = p => p.balance ?? ((window.ORBIT_DATA.invoices.find(i => i.no === p.inv) || {}).balance || 0);
function FinanceScreen({ nav }) {
  const t = useT(); const [tab, setTab] = React.useState('invoices'); const [q, setQ] = React.useState(''); const [st, setSt] = React.useState('All');
  const [rc, setRc] = React.useState(null); if (window.useBus) window.useBus(window.ORBIT_DATA.me); const [from, setFrom] = React.useState('2026-01-01'); const [to, setTo] = React.useState(new Date().toISOString().slice(0, 10));
  const [yr, pickYr] = useCustYear(); const I = myInv().filter(i => i.date.startsWith(yr)), P = myPayAll().filter(p => String(p.date).startsWith(yr));
  const tot = I.reduce((a, i) => a + i.total, 0), paid = I.reduce((a, i) => a + i.paid, 0);
  const rows = I.filter(i => (st === 'All' || i.status === st) && (!q || (i.no + i.shipment).toLowerCase().includes(q.toLowerCase())));
  const pay = P.filter(p => p.date >= from && p.date <= to);
  const byBank = Object.entries(P.reduce((m, p) => { const b = p.bank || 'Other'; m[b] = (m[b] || 0) + (+p.amount || 0); return m; }, {})).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const recent = [...P.map(p => ({ d: p.date, ic: 'circle-check', c: 'var(--status-success)', a: t('Payment received') + ' · ' + money(p.amount), b: p.inv + ' · ' + fdate(p.date) })), ...I.map(i => ({ d: i.date, ic: 'file-text', c: 'var(--navy-700)', a: t('New invoice') + ' · ' + i.no, b: money(i.total) + ' · ' + fdate(i.date) }))].sort((x, y) => x.d < y.d ? 1 : x.d > y.d ? -1 : 0).slice(0, 5);
  const maxB = Math.max(1, ...byBank.map(b => b[1]));
  const rcSheet = rc && <ReceiptSheet p={rc} name={(window.ORBIT_DATA.customers.find(c => c.ref === rc.ref) || {}).name} balance={invBal(rc)} onClose={() => setRc(null)} onDownload={() => { nav.toast(t('Receipt downloaded'), rcpNo(rc) + '.pdf'); setRc(null); }} />;
  return <><Scroll>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><h1 style={{ margin: 0, font: '700 24px/1.2 var(--font-display)', color: 'var(--text-strong)' }}>{t('Finance')}</h1><YearPicker yr={yr} onChange={pickYr} /></div>
    <div style={{ background: 'var(--navy-700)', color: '#fff', borderRadius: 'var(--radius-l)', padding: 16 }}>
      <Overline color="var(--orange-400)">{t('Account Summary')}</Overline>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px', marginTop: 14 }}>
        {[['Total Invoices', I.length], ['Total Invoiced', money(tot)], ['Total Paid', money(paid)], ['Balance Due', money(tot - paid)]].map(([l, v], i) => <div key={l}><div style={{ fontSize: 12, color: 'var(--navy-300)' }}>{t(l)}</div><div style={{ font: '800 19px var(--font-display)', color: i === 3 ? 'var(--orange-400)' : '#fff', marginTop: 2 }}>{v}</div></div>)}</div></div>
    <Tabs value={tab} onChange={setTab} tabs={[{ value: 'invoices', label: t('Invoices'), count: I.length }, { value: 'statement', label: t('Statement') }]} />
    {tab === 'invoices' && <>
      <SearchBox value={q} onChange={setQ} placeholder="Search invoice number" />
      <div style={{ display: 'flex', gap: 8 }}>{['All', 'Paid', 'Partial Paid', 'Unpaid'].map(s => <Tag key={s} selected={st === s} onClick={() => setSt(s)}>{t(s)}</Tag>)}</div>
      {rows.map(i => <Card key={i.no} interactive padding={14}><div onClick={() => nav.push('invoice', i)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span style={{ font: '600 13px var(--font-mono)', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{i.no}</span><StatusBadge status={i.status} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}><span>{scode(i.shipment)} · {t(i.mode === 'Air' ? 'Air Freight' : 'Sea Freight')}</span><span>{fdate(i.date)}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border-default)' }}>{[['Amount', money(i.total)], ['Paid', money(i.paid)], ['Balance', money(i.balance)]].map(([l, v], k) => <div key={l}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t(l)}</div><div style={{ font: '700 13px var(--font-body)', color: k === 2 && i.balance > 0 ? 'var(--status-danger)' : 'var(--text-strong)' }}>{v}</div></div>)}</div></div></Card>)}
      {!rows.length && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>{t('No records found')}</div>}</>}
    {tab === 'statement' && <>
      <Card padding={14}><KV label="Customer ID" value={ME.ref} mono /><KV label="Member Since" value={ME.since} /><KV label="Total Shipments" value={24} /></Card>
      <SectionTitle>Payment history</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><DateField label="From" value={from} onChange={setFrom} /><DateField label="To" value={to} onChange={setTo} /></div>
      <Button variant="secondary" fullWidth leadingIcon={<Icon name="file-down" size={16} />} onClick={() => nav.toast(t('Statement downloaded'), 'Statement_' + ME.ref + '.pdf')}>{t('Download Statement PDF')}</Button>
      <Card padding={0}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 14px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-default)', font: '700 10px var(--font-body)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', borderRadius: '10px 10px 0 0' }}><span>{t('Date')} · {t('Invoice No.')}</span><span style={{ textAlign: 'right' }}>{t('Amount')} · {t('Bank')}</span></div>
        {pay.map(p => <div key={p.txn} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, padding: '11px 14px', borderBottom: '1px solid var(--border-default)', fontSize: 13 }}>
          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{fdate(p.date)}</span><span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-success)' }}>{money(p.amount)}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{p.inv}</span><span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{p.bank}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-subtle)', alignSelf: 'center' }}>{rcpNo(p)}</span><span style={{ textAlign: 'right' }}><button onClick={() => setRc(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 14, background: '#fff', cursor: 'pointer', font: '600 12px var(--font-body)', color: 'var(--navy-700)' }}><Icon name="receipt" size={13} />{t('Receipt')}</button></span></div>)}
        {!pay.length && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{t('No records found')}</div>}</Card>
      <SectionTitle>Payment Breakdown by Bank</SectionTitle>
      <Card padding={14}><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{byBank.map(([b, v]) => <div key={b}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{b}</span><span style={{ fontWeight: 700 }}>{money(v)}</span></div><div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3 }}><div style={{ width: v / maxB * 100 + '%', height: 6, borderRadius: 3, background: 'var(--navy-700)' }} /></div></div>)}{!byBank.length && <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{t('No records found')}</div>}</div></Card>
      <SectionTitle>Recent Activity</SectionTitle>
      <Card padding={14}><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{recent.map(r => [r.ic, r.c, r.a, r.b]).map(([i, c, a, b]) => <div key={a} style={{ display: 'flex', gap: 10 }}><span style={{ color: c, marginTop: 1 }}><Icon name={i} size={18} /></span><div><div style={{ font: '600 13px var(--font-body)', color: 'var(--text-strong)' }}>{a}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b}</div></div></div>)}{!recent.length && <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{t('No records found')}</div>}</div></Card></>}
  </Scroll>{rcSheet}</>;
}
window.FinanceScreen = FinanceScreen;
