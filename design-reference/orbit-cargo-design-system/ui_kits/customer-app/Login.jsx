var { Button, IconButton, Badge, Tag, Card, Icon, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Toast, TrackingTimeline } = window.OrbitDesignSystem_da09b0;
function LoginScreen({ onDone }) {
  const t = useT();
  const [mode, setMode] = React.useState('existing');
  const [step, setStep] = React.useState('form');
  const [ref, setRef] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [err, setErr] = React.useState('');
  const PW = () => { try { return JSON.parse(localStorage.getItem('orbit-cust-pw') || '{}'); } catch (e) { return {}; } };
  const hp = (r, p) => { let h = 7; const s = r + '|' + p + '|orbit'; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 2147483647; return String(h); };
  const R = ref.trim().toUpperCase(); const hasPw = !!PW()[R];
  const [pw, setPw] = React.useState(''); const [pw2, setPw2] = React.useState(''); const [forgot, setForgot] = React.useState(false);
  const finish = r => { localStorage.setItem('orbit-cust-me', r); if (window.ORBIT_DATA.me !== r) { location.reload(); return; } onDone(); };
  const login = () => { if (!window.ORBIT_DATA.customers.some(c => c.ref === R)) { setErr(t('Customer reference not found')); return; } if (PW()[R] !== hp(R, pw)) { setErr(t('Wrong password')); return; } setErr(''); finish(R); };
  const savePw = () => { const r = (newRef || ref || '').trim().toUpperCase(); if (pw.length < 6) { setErr(t('Password must be at least 6 characters')); return; } if (pw !== pw2) { setErr(t('Passwords do not match')); return; } localStorage.setItem('orbit-cust-pw', JSON.stringify({ ...PW(), [r]: hp(r, pw) })); setErr(''); finish(r); };
  const send = () => { if (!ref.trim() || phone.replace(/\D/g, '').length < 7 || !/^\S+@\S+\.\S+$/.test(email)) { setErr(t('Enter your customer reference, phone number and email')); return; } setErr(''); setStep('otp'); };
  const [nc, setNcS] = React.useState({ name: '', phone: '', email: '', company: '', location: '', buy: '' });
  const [newRef, setNewRef] = React.useState('');
  const setNc = (k, v) => setNcS(o => ({ ...o, [k]: v }));
  const create = () => {
    if (Object.values(nc).some(v => !v.trim()) || !/^\S+@\S+\.\S+$/.test(nc.email)) { setErr(t('Please fill in all required fields')); return; }
    const saved = JSON.parse(localStorage.getItem('orbit-new-customers') || '[]'); const ph = s => String(s || '').replace(/\D/g, '').slice(-9); const E = nc.email.trim().toLowerCase(), P = ph(nc.phone); const ex = [...window.ORBIT_DATA.customers, ...saved].find(c => String(c.email || '').toLowerCase() === E || (P.length >= 7 && ph(c.phone) === P)); if (ex) { setErr(t('This email or phone is already registered. Log in with your Customer Reference.')); return; }
    const ref = window.nextCustRef(window.ORBIT_DATA.customers);
    const c = { ref, name: nc.name.trim(), company: nc.company.trim(), phone: '+252 ' + nc.phone.trim(), email: nc.email.trim(), location: nc.location.trim(), business: nc.buy.trim(), category: nc.buy.trim(), service: 'Air & Sea', year: 2026, level: 'D', status: 'Active', since: 'Oct 2026', isNew: true, created: new Date().toISOString() };
    localStorage.setItem('orbit-new-customers', JSON.stringify([...saved, c])); if (!window.ORBIT_DATA.customers.some(x => x.ref === ref)) window.ORBIT_DATA.customers.push(c); if (window.OrbitBus) window.OrbitBus.push({ ref, kind: 'welcome', title: 'Welcome to Orbit — your Customer Reference', body: ref, date: new Date().toISOString().slice(0, 10) });
    window.ORBIT_DATA.announcements.unshift({ id: 'new-' + ref, type: 'Customer', title: t('Welcome to Orbit — your Customer Reference'), message: t('Your account has been created. Your Customer Reference is') + ' ' + ref + '. ' + t('Use it to log in and as your payment reference.'), origin: '', dest: '', lastDay: '', flightDate: '', status: 'Sent' });
    setNewRef(ref); setRef(ref); setEmail(c.email); setPhone(nc.phone.trim()); setErr(''); setOtp(''); setStep('otp');
  };
  const feats = [['shield-check', 'Fast and Secure'], ['truck', 'Reliable Logistics'], ['globe', 'Worldwide Coverage']];
  return <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column' }}>
    <div style={{ background: 'var(--navy-700)', color: '#fff', padding: '8px 22px 70px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><LangToggle dark /></div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}><img src="../../assets/orbit-logo-reversed.png" style={{ height: 72 }} /></div>
      <div style={{ textAlign: 'center', marginTop: 18 }}><h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 118", fontWeight: 850, fontSize: 34, lineHeight: 1.05, textTransform: 'uppercase' }}>{t('Welcome to Orbit')}</h1>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, font: '700 15px var(--font-body)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--orange-400)', marginTop: 8 }}><span style={{ width: 22, height: 2, background: 'var(--orange-500)' }}></span>Cargo &amp; Logistics<span style={{ width: 22, height: 2, background: 'var(--orange-500)' }}></span></div></div></div>
    <div style={{ padding: '0 16px', marginTop: -48, position: 'relative' }}>
      <Card elevated padding={18}>
        {step === 'form' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Seg full options={[['existing', 'Existing Customer'], ['new', 'New Customer']]} value={mode} onChange={m => { setMode(m); setErr(''); }} />
          {mode === 'existing' ? <>
            <Input label={t('Customer Reference')} value={ref} onChange={e => setRef(e.target.value)} leadingIcon={<Icon name="id-card" size={16} />} inputStyle={{ fontFamily: 'var(--font-mono)', fontSize: 14 }} />
            {hasPw && !forgot ? <>
            <Input label={t('Password')} type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} leadingIcon={<Icon name="lock" size={16} />} error={err} />
            <Button fullWidth size="l" onClick={login} trailingIcon={<Icon name="arrow-right" size={16} />}>{t('Log in')}</Button>
            <a onClick={() => { setForgot(true); setErr(''); setPw(''); }} style={{ alignSelf: 'center', fontSize: 13, cursor: 'pointer' }}>{t('Forgot password?')}</a></> : <>
            <Input label={t('Phone Number')} value={phone} onChange={e => setPhone(e.target.value)} leadingIcon={<span style={{ font: '600 14px var(--font-body)', color: 'var(--text-strong)' }}>+252</span>} />
            <Input label={t('Email')} type="email" value={email} onChange={e => setEmail(e.target.value)} leadingIcon={<Icon name="mail" size={16} />} hint={t('Your OTP code will be sent to this email')} error={err} />
            <Button fullWidth size="l" onClick={send} trailingIcon={<Icon name="arrow-right" size={16} />}>{t('Send OTP')}</Button>{forgot && <a onClick={() => { setForgot(false); setErr(''); }} style={{ alignSelf: 'center', fontSize: 13, cursor: 'pointer' }}>{t('Back')}</a>}</>}</> : <>
            <Input label={t('Full Name') + ' *'} value={nc.name} onChange={e => setNc('name', e.target.value)} placeholder="Abdirahman Hassan" />
            <Input label={t('Phone Number') + ' *'} value={nc.phone} onChange={e => setNc('phone', e.target.value)} leadingIcon={<span style={{ font: '600 14px var(--font-body)', color: 'var(--text-strong)' }}>+252</span>} placeholder="61 000 0000" />
            <Input label={t('Email') + ' *'} type="email" value={nc.email} onChange={e => setNc('email', e.target.value)} leadingIcon={<Icon name="mail" size={16} />} placeholder="name@example.com" hint={t('Your OTP code will be sent to this email')} />
            <Input label={t('Company') + ' *'} value={nc.company} onChange={e => setNc('company', e.target.value)} leadingIcon={<Icon name="building-2" size={16} />} placeholder="Hassan General Trading" />
            <Input label={t('Location') + ' *'} value={nc.location} onChange={e => setNc('location', e.target.value)} leadingIcon={<Icon name="map-pin" size={16} />} placeholder={t('e.g. Mogadishu, Bakara')} />
            <Input label={t('What do you buy?') + ' *'} value={nc.buy} onChange={e => setNc('buy', e.target.value)} leadingIcon={<Icon name="shopping-bag" size={16} />} placeholder={t('e.g. Electronics, clothes, spare parts')} />
            {err && <div style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 'var(--radius-s)', background: 'var(--status-danger-bg)', color: 'var(--status-danger)', fontSize: 13, fontWeight: 600 }}><Icon name="circle-alert" size={16} />{err}</div>}
            <Button fullWidth size="l" onClick={create}>{t('Create New Account')}</Button></>}
        </div>}
        {step === 'otp' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {newRef && <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 'var(--radius-m)', background: 'var(--status-success-bg)', color: 'var(--status-success)' }}><span style={{ flex: 'none', marginTop: 1 }}><Icon name="circle-check" size={18} /></span><div style={{ fontSize: 13, color: 'var(--gray-800)' }}><b style={{ color: 'var(--status-success)' }}>{t('Account created')}</b><div style={{ marginTop: 2 }}>{t('Your OTP code was sent to your email.')}</div><div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bell" size={14} />{t('Your Customer Reference will be sent to your app notifications.')}</div></div></div>}
          <div style={{ font: '700 17px var(--font-display)', color: 'var(--text-strong)' }}>{t('Enter verification code')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('We sent a 6-digit code to')} <b style={{ color: 'var(--text-strong)' }}>{email}</b></div>
          <div style={{ position: 'relative', display: 'flex', gap: 8 }}>{[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ flex: 1, height: 50, borderRadius: 'var(--radius-s)', border: '1.5px solid ' + (otp.length === i ? 'var(--orange-500)' : 'var(--border-strong)'), display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 22px var(--font-mono)', color: 'var(--text-strong)', background: '#fff' }}>{otp[i] || ''}</div>)}
            <input autoFocus inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'text' }} /></div>
          <Button fullWidth size="l" disabled={otp.length < 6} onClick={() => { const r = (newRef || ref || '').trim().toUpperCase(); if (!window.ORBIT_DATA.customers.some(c => c.ref === r)) { alert(t('Customer reference not found')); return; } setPw(''); setPw2(''); setErr(''); setStep('setpw'); }}>{t('Verify')}</Button>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><a onClick={() => { setStep('form'); setOtp(''); setNewRef(''); if (newRef) setMode('existing'); }} style={{ cursor: 'pointer' }}>{t('Back')}</a><a onClick={() => setOtp('482913')} style={{ cursor: 'pointer' }}>{t('Resend code')}</a></div>
        </div>}
        {step === 'setpw' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 40, height: 40, borderRadius: 'var(--radius-m)', background: 'var(--orange-50)', color: 'var(--orange-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="key-round" size={20} /></span><div><div style={{ font: '700 17px var(--font-display)', color: 'var(--text-strong)' }}>{t(forgot ? 'Set a new password' : 'Create your password')}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('Next time, log in with your Customer Reference and password.')}</div></div></div>
          <Input label={t('Customer Reference')} value={(newRef || ref).toUpperCase()} disabled inputStyle={{ fontFamily: 'var(--font-mono)' }} />
          <Input label={t('Password')} type="password" value={pw} onChange={e => setPw(e.target.value)} leadingIcon={<Icon name="lock" size={16} />} hint={t('At least 6 characters')} />
          <Input label={t('Confirm Password')} type="password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePw()} leadingIcon={<Icon name="lock" size={16} />} error={err} />
          <Button fullWidth size="l" onClick={savePw}>{t('Save password & continue')}</Button>
        </div>}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '20px 0 24px' }}>{feats.map(([i, l]) => <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', font: '600 12px/1.3 var(--font-body)', color: 'var(--text-strong)' }}><span style={{ width: 42, height: 42, borderRadius: 'var(--radius-m)', background: 'var(--orange-50)', color: 'var(--orange-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={i} size={20} /></span>{t(l)}</div>)}</div>
    </div></div>;
}
window.LoginScreen = LoginScreen;
