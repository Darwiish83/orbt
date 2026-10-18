var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, TrackingTimeline } = window.OrbitDesignSystem_da09b0;
const D = window.ORBIT_DATA;
const ME = D.customers.find(c => c.ref === D.me) || null;
const myLevel = (yr = 2026) => window.ORBIT_RULES.levelOf(D, ME.ref, yr); const myStatus = (yr = 2026) => window.ORBIT_RULES.statusOf(D, ME.ref, yr); const levelName = l => window.ORBIT_RULES.LEVEL_NAME[l];
const myLines = () => D.lines.filter(l => l.ref === D.me).map(l => { const s = D.shipments.find(x => x.code === l.shipment); return { ...s, ...l, tracking: s.code, total: D.lineTotal(l) }; });
function useCustYear() {
  const [yr, setYr] = React.useState(() => +(localStorage.getItem('orbit-cust-year') || 2026));
  React.useEffect(() => { const h = () => setYr(+(localStorage.getItem('orbit-cust-year') || 2026)); window.addEventListener('orbit-year', h); return () => window.removeEventListener('orbit-year', h); }, []);
  return [yr, v => { localStorage.setItem('orbit-cust-year', v); window.dispatchEvent(new Event('orbit-year')); }];
}
function YearPicker({ yr, onChange, years = [2026, 2025] }) {
  const t = useT();
  return <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-m)', background: '#fff', color: 'var(--navy-700)', font: '700 14px var(--font-body)', flex: 'none' }}><Icon name="calendar" size={15} />{yr}<Icon name="chevron-down" size={14} /><select aria-label={t('Year')} value={yr} onChange={e => onChange(+e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>;
}
function Phone({ children, dark, device = 'iphone' }) {
  const sam = device === 'samsung';
  const bar = { background: dark ? 'var(--navy-700)' : '#fff', color: dark ? '#fff' : 'var(--text-strong)' };
  return <div style={{ width: sam ? 384 : 390, height: sam ? 832 : 844, borderRadius: sam ? 34 : 52, background: sam ? '#1E2430' : '#0B1220', padding: sam ? 7 : 10, boxShadow: '0 40px 80px rgba(1,27,64,.28)', flex: 'none', position: 'relative' }}>
    {sam && <><span style={{ position: 'absolute', right: -3, top: 150, width: 3, height: 60, borderRadius: 2, background: '#1E2430' }} /><span style={{ position: 'absolute', right: -3, top: 230, width: 3, height: 36, borderRadius: 2, background: '#1E2430' }} /></>}
    <div style={{ width: '100%', height: '100%', borderRadius: sam ? 28 : 42, overflow: 'hidden', background: 'var(--surface-page)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {sam ? <div style={{ height: 34, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', font: '500 13px var(--font-body)', position: 'relative', ...bar }}><span>9:41</span><span style={{ position: 'absolute', left: '50%', top: 9, width: 14, height: 14, marginLeft: -7, borderRadius: 7, background: '#0B1220' }} /><span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Icon name="wifi" size={13} /><Icon name="signal" size={13} /><span style={{ fontSize: 11 }}>86%</span><Icon name="battery-medium" size={15} /></span></div>
      : <div style={{ height: 50, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px', font: '600 15px var(--font-body)', ...bar }}><span>9:41</span><span style={{ width: 112, height: 32, borderRadius: 16, background: '#0B1220' }} /><span style={{ display: 'flex', gap: 5 }}><Icon name="signal" size={15} /><Icon name="wifi" size={15} /><Icon name="battery-full" size={18} /></span></div>}
      {children}
      {sam ? <div style={{ height: 16, flex: 'none', background: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span style={{ width: 90, height: 4, borderRadius: 2, background: 'var(--gray-800)' }} /></div>
      : <span style={{ position: 'absolute', bottom: 8, left: '50%', width: 134, height: 5, marginLeft: -67, borderRadius: 3, background: '#0B1220', zIndex: 5 }} />}</div></div>;
}
function AppBar({ title, onBack, onBell, dark, unread, right }) {
  const t = useT();
  return <div style={{ flex: 'none', height: 86, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 0 ' + (onBack ? 6 : 10) + 'px', background: dark ? 'var(--navy-700)' : '#fff', color: dark ? '#fff' : 'var(--text-strong)', borderBottom: dark ? 0 : '1px solid var(--border-default)' }}>
    {onBack && <IconButton label={t('Back')} icon={<Icon name="chevron-left" size={22} />} onClick={onBack} style={{ color: 'inherit' }} />}
    {title ? <div style={{ flex: 1, font: '700 17px var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(title)}</div> : <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><img src={dark ? '../../assets/orbit-logo-reversed.png' : '../../assets/orbit-logo.png'} style={{ height: 74, display: 'block', flex: 'none' }} /></div>}
    {right}
    {onBell && <span style={{ position: 'relative' }}><IconButton label={t('Notifications')} icon={<Icon name="bell" size={20} />} onClick={onBell} style={{ color: 'inherit' }} />{unread > 0 && <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, background: 'var(--orange-500)', color: '#fff', font: '700 10px/16px var(--font-body)', textAlign: 'center', padding: '0 4px', boxSizing: 'border-box', pointerEvents: 'none' }}>{unread}</span>}</span>}
  </div>;
}
function BottomNav({ tab, go, device }) {
  const t = useT();
  const items = [['home', 'Home', 'house'], ['shipments', 'Shipments', 'package'], ['finance', 'Finance', 'wallet'], ['profile', 'Profile', 'user-round']];
  return <div style={{ flex: 'none', display: 'flex', background: '#fff', borderTop: '1px solid var(--border-default)', padding: device === 'samsung' ? '6px 6px 4px' : '6px 6px 26px' }}>
    {items.map(([k, l, i]) => { const on = tab === k; return <button key={k} onClick={() => go(k)} style={{ flex: 1, border: 0, background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 0', color: on ? 'var(--orange-500)' : 'var(--gray-500)', font: (on ? '700' : '500') + ' 11px var(--font-body)' }}>
      <span style={{ width: 44, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--orange-50)' : 'transparent' }}><Icon name={i} size={21} /></span>{t(l)}</button>; })}</div>;
}
function Scroll({ children, pad = 16, gap = 14 }) { return <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none' }}><div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap }}>{children}</div></div>; }
function SectionTitle({ children, action }) { const t = useT(); return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}><div style={{ font: '700 15px var(--font-display)', color: 'var(--text-strong)' }}>{t(children)}</div>{action}</div>; }
Object.assign(window, { myLevel, myStatus, levelName, useCustYear, YearPicker, ME, myLines, Phone, AppBar, BottomNav, Scroll, SectionTitle });
