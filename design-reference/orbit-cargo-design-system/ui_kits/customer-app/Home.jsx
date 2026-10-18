var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, TrackingTimeline } = window.OrbitDesignSystem_da09b0;
function HomeScreen({ nav }) {
  const t = useT(); const L = myLines();
  const kg = L.filter(l => l.mode === 'Air').reduce((a, l) => a + l.measure, 0), cbm = L.filter(l => l.mode === 'Sea').reduce((a, l) => a + l.measure, 0);
  const quick = [['package', 'Shipments', () => nav.tab('shipments')], ['receipt-text', 'Invoices', () => nav.tab('finance')], ['wallet', 'Finance', () => nav.tab('finance')], ['folder-open', 'Documents', () => nav.push('documents')], ['user-round', 'My Profile', () => nav.tab('profile')], ['headset', 'Support', () => nav.push('support')]];
  return <Scroll>
    <div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('Welcome back')},</div><div style={{ font: '700 22px/1.2 var(--font-display)', color: 'var(--text-strong)' }}>{ME.name.split(' ')[0]} {ME.name.split(' ')[1]}</div></div>
    <div style={{ background: 'var(--navy-700)', color: '#fff', borderRadius: 'var(--radius-l)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Overline color="var(--orange-400)">{t('Customer information')}</Overline><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '700 11px var(--font-body)', color: '#3DDC97', letterSpacing: '.06em', textTransform: 'uppercase' }}><span style={{ width: 7, height: 7, borderRadius: 4, background: '#3DDC97' }} />{t('Active')}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
        <div><div style={{ fontSize: 12, color: 'var(--navy-300)' }}>{t('Customer Reference')}</div><div style={{ font: '600 18px var(--font-mono)', marginTop: 2 }}>{ME.ref}</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: 'var(--navy-300)', marginBottom: 4 }}>{t('Customer Level')}</div><span style={{ display: 'inline-block', padding: '3px 7px', borderRadius: 'var(--radius-xs)', background: 'var(--orange-500)', font: '800 10px var(--font-body)', letterSpacing: '.06em' }}>{levelName(myLevel())}</span></div></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 6 }}>
      {[['package', 'Shipments', 24, 'var(--navy-700)'], ['package-check', 'Arrived', 19, 'var(--status-success)'], ['plane', 'Air Freight KG', num(1240.5, 1), 'var(--orange-600)'], ['ship', 'Sea Freight CBM', num(38.5, 1), 'var(--navy-700)']].map(([ic, l, v, c]) => <div key={l} style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-m)', padding: '8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textAlign: 'center', minWidth: 0 }}>
        <Icon name={ic} size={14} color={c} />
        <div style={{ font: '800 14px/1.1 var(--font-display)', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{v}</div>
        <div style={{ font: '500 9px/1.2 var(--font-body)', color: 'var(--text-muted)' }}>{t(l)}</div></div>)}</div>
    <div style={{ position: 'relative', height: 140, borderRadius: 'var(--radius-l)', overflow: 'hidden', background: 'var(--navy-700)', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 18px' }}>
      <img src="https://images.pexels.com/photos/2226458/pexels-photo-2226458.jpeg?auto=compress&w=900" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(1,27,64,.85) 0%, rgba(1,27,64,.45) 50%, rgba(1,27,64,.1) 100%)', pointerEvents: 'none' }}></div>
      <div style={{ position: 'relative', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 118", fontWeight: 850, fontSize: 21, lineHeight: 1.02, textTransform: 'uppercase', maxWidth: 210 }}>{t('Your Cargo, Our Priority')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 250 }}>{[['plane', 'Air Freight'], ['ship', 'Sea Freight'], ['file-check', 'Customs Clearance'], ['handshake', 'Supplier Services']].map(([ic, l]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 3, background: 'var(--navy-700)', font: '700 9px var(--font-body)', letterSpacing: '.04em' }}><Icon name={ic} size={12} />{t(l)}</span>)}</div></div></div>
    <SectionTitle>Quick Access</SectionTitle>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>{quick.map(([i, l, fn]) => <button key={l} onClick={fn} style={{ border: '1px solid var(--border-default)', background: '#fff', borderRadius: 'var(--radius-m)', padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', font: '600 10px var(--font-body)', color: 'var(--text-strong)' }}><span style={{ width: 26, height: 26, borderRadius: 'var(--radius-s)', background: 'var(--navy-50)', color: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={i} size={14} /></span>{t(l)}</button>)}</div>
    <SectionTitle action={<a onClick={() => nav.tab('shipments')} style={{ fontSize: 13, cursor: 'pointer' }}>{t('View all')}</a>}>Shipments</SectionTitle>
    {L.slice(0, 2).map(s => <ShipmentCard key={s.tracking} s={s} onOpen={() => nav.push('shipment', s)} />)}
  </Scroll>;
}
window.HomeScreen = HomeScreen;
