var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, TrackingTimeline } = window.OrbitDesignSystem_da09b0;
const TITLES = { shipment: 'Shipment details', invoice: 'Invoice information', notifications: 'Notifications', documents: 'Documents', record: 'Record details', support: 'Support' };
function useCustomerNav(start) {
  const init = start || { authed: false, tab: 'home', stack: [] };
  const [s, setS] = React.useState(() => ({ ...init, authed: !!init.authed && !!window.ORBIT_DATA.me })); const [toast, setToast] = React.useState(null);
  const nav = { tab: k => setS(x => ({ ...x, tab: k, stack: [] })), push: (n, p) => setS(x => ({ ...x, stack: [...x.stack, [n, p]] })), back: () => setS(x => ({ ...x, stack: x.stack.slice(0, -1) })), login: () => setS(x => ({ ...x, authed: true })), logout: () => { localStorage.removeItem('orbit-cust-me'); setS({ authed: false, tab: 'home', stack: [] }); }, toast: (title, message) => { setToast({ title, message }); clearTimeout(window.__otT); window.__otT = setTimeout(() => setToast(null), 2600); } };
  const top = s.stack[s.stack.length - 1];
  return { s, nav, top, toast, setToast };
}
function CustomerBody({ s, nav, top }) {
  if (top) { const [n, p] = top; return n === 'shipment' ? <ShipmentDetail s={p} /> : n === 'invoice' ? <InvoiceDetail inv={p} nav={nav} /> : n === 'notifications' ? <NotificationsScreen /> : n === 'documents' ? <DocumentsScreen nav={nav} /> : n === 'record' ? <RecordDetail r={p} nav={nav} /> : n === 'support' ? <SupportScreen nav={nav} /> : null; }
  return s.tab === 'home' ? <HomeScreen nav={nav} /> : s.tab === 'shipments' ? <ShipmentsScreen nav={nav} /> : s.tab === 'finance' ? <FinanceScreen nav={nav} /> : <ProfileScreen nav={nav} />;
}
function MobileCustomerApp({ device = 'iphone', start }) {
  const { s, nav, top, toast, setToast } = useCustomerNav(start);
  const homeTop = !top && s.tab === 'home';
  const busList = window.useBus ? window.useBus(window.ME_REF) : []; const busUnread = busList.filter(x => !x.read).length;
  return <Phone device={device} dark={!s.authed || homeTop}>
    {!s.authed ? <LoginScreen onDone={nav.login} /> : <>
      <AppBar dark={homeTop} title={top ? TITLES[top[0]] : null} onBack={top ? nav.back : null} onBell={top && top[0] === 'notifications' ? null : () => nav.push('notifications')} unread={busUnread} />
      <CustomerBody s={s} nav={nav} top={top} />
      <BottomNav tab={s.tab} go={nav.tab} device={device} /></>}
    {toast && <div style={{ position: 'absolute', left: 12, right: 12, bottom: 100, zIndex: 20 }}><Toast title={toast.title} message={toast.message} onClose={() => setToast(null)} style={{ width: 'auto' }} /></div>}
  </Phone>;
}
function DesktopCustomerApp({ start }) {
  const t = useT(); const { s, nav, top, toast, setToast } = useCustomerNav(start);
  const items = [['home', 'Home', 'house'], ['shipments', 'Shipments', 'package'], ['finance', 'Finance', 'wallet'], ['profile', 'Profile', 'user-round']];
  const extra = [['documents', 'Documents', 'folder-open'], ['notifications', 'Notifications', 'bell']];
  return <div style={{ width: 1180, height: 760, borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 40px 80px rgba(1,27,64,.25)', display: 'flex', flexDirection: 'column', flex: 'none', border: '1px solid var(--gray-300)' }}>
    <div style={{ height: 40, flex: 'none', background: 'var(--gray-100)', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px' }}>
      <span style={{ display: 'flex', gap: 7 }}>{['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}</span>
      <div style={{ flex: 1, maxWidth: 520, margin: '0 auto', height: 26, borderRadius: 6, background: '#fff', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}><Icon name="lock" size={11} />app.orbitcargo.so</div><span style={{ width: 60 }} /></div>
    {!s.authed ? <div style={{ flex: 1, display: 'flex', background: 'var(--navy-700)' }}>
      <div style={{ flex: 1, padding: 56, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}><Overline color="var(--orange-400)">Orbit Cargo ERP • Customer App</Overline><div style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 118", fontWeight: 850, fontSize: 48, lineHeight: 1.02, textTransform: 'uppercase' }}>{t('Your Cargo, Our Priority')}</div><div style={{ color: 'var(--navy-300)', fontSize: 16, maxWidth: 420 }}>{t('Air & sea freight from China, Dubai and Turkey to Somalia.')}</div></div>
      <div style={{ width: 430, background: 'var(--surface-page)', display: 'flex', flexDirection: 'column' }}><LoginScreen onDone={nav.login} /></div></div> :
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 232, flex: 'none', background: 'var(--navy-700)', display: 'flex', flexDirection: 'column', padding: '18px 12px', gap: 4 }}>
        <img src="../../assets/orbit-logo-reversed.png" style={{ height: 46, alignSelf: 'flex-start', margin: '0 0 18px 6px' }} />
        {items.map(([k, l, i]) => { const on = !top && s.tab === k; return <button key={k} onClick={() => nav.tab(k)} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 42, padding: '0 12px', border: 0, borderRadius: 'var(--radius-s)', cursor: 'pointer', background: on ? 'rgba(255,255,255,.1)' : 'transparent', color: on ? '#fff' : 'var(--navy-300)', font: (on ? '700' : '500') + ' 14px var(--font-body)', boxShadow: on ? 'inset 3px 0 0 var(--orange-500)' : 'none', textAlign: 'left' }}><Icon name={i} size={18} />{t(l)}</button>; })}
        <div style={{ height: 1, background: 'rgba(255,255,255,.12)', margin: '10px 4px' }} />
        {extra.map(([k, l, i]) => { const on = top && top[0] === k; return <button key={k} onClick={() => { nav.tab(s.tab); setTimeout(() => nav.push(k), 0); }} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 42, padding: '0 12px', border: 0, borderRadius: 'var(--radius-s)', cursor: 'pointer', background: on ? 'rgba(255,255,255,.1)' : 'transparent', color: on ? '#fff' : 'var(--navy-300)', font: '500 14px var(--font-body)', boxShadow: on ? 'inset 3px 0 0 var(--orange-500)' : 'none', textAlign: 'left' }}><Icon name={i} size={18} />{t(l)}</button>; })}
        <div style={{ marginTop: 'auto', padding: 12, borderRadius: 'var(--radius-m)', background: 'rgba(255,255,255,.06)', color: '#fff' }}><div style={{ font: '600 13px var(--font-body)' }}>{ME.name.split(' ').slice(0, 2).join(' ')}</div><div style={{ font: '500 11px var(--font-mono)', color: 'var(--navy-300)' }}>{ME.ref} · {levelName(myLevel())}</div></div></aside>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-page)', minWidth: 0, position: 'relative' }}>
        <div style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', background: '#fff', borderBottom: '1px solid var(--border-default)' }}>
          {top && <IconButton label={t('Back')} icon={<Icon name="chevron-left" size={20} />} onClick={nav.back} />}
          <div style={{ flex: 1, font: '700 18px var(--font-display)', color: 'var(--text-strong)' }}>{t(top ? TITLES[top[0]] : items.find(i => i[0] === s.tab)[1])}</div>
          <LangToggle /><IconButton variant="outline" label={t('Notifications')} icon={<Icon name="bell" size={18} />} onClick={() => nav.push('notifications')} /></div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minHeight: 0 }}><div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', minHeight: 0 }}><CustomerBody s={s} nav={nav} top={top} /></div></div>
        {toast && <div style={{ position: 'absolute', right: 24, bottom: 24 }}><Toast title={toast.title} message={toast.message} onClose={() => setToast(null)} /></div>}</main></div>}
  </div>;
}
Object.assign(window, { MobileCustomerApp, DesktopCustomerApp });
