var LangCtx = React.createContext({ lang: 'en', setLang: () => {} });
function LangProvider({ children }) {
  const [lang, setL] = React.useState(localStorage.getItem('orbit-lang') || 'en');
  const setLang = l => { localStorage.setItem('orbit-lang', l); setL(l); };
  React.useEffect(() => { document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang; }, [lang]);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}
function useLang() { return React.useContext(LangCtx); }
const DICTS = () => ({ so: window.ORBIT_SO || {}, ar: window.ORBIT_AR || {} });
function useT() { const { lang } = React.useContext(LangCtx); return s => (DICTS()[lang] || {})[s] || s; }
function LangToggle({ dark }) {
  const { lang, setLang } = useLang();
  return <div style={{ display: 'inline-flex', padding: 2, gap: 1, borderRadius: 4, background: dark ? 'rgba(255,255,255,.12)' : 'var(--gray-100)', border: dark ? 0 : '1px solid var(--border-default)', direction: 'ltr' }}>
    {[['so', 'SO'], ['en', 'EN'], ['ar', 'ع']].map(([k, l]) => <button key={k} onClick={() => setLang(k)} style={{ border: 0, cursor: 'pointer', padding: '3px 7px', minWidth: 26, borderRadius: 3, font: '700 10px/14px var(--font-body)', letterSpacing: '.04em', background: lang === k ? (dark ? '#fff' : 'var(--navy-700)') : 'transparent', color: lang === k ? (dark ? 'var(--navy-700)' : '#fff') : (dark ? 'var(--navy-100)' : 'var(--text-muted)') }}>{l}</button>)}</div>;
}
Object.assign(window, { LangCtx, LangProvider, useLang, useT, LangToggle });
