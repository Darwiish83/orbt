import React from 'react';
const Label = ({ children, htmlFor }) => <label htmlFor={htmlFor} style={{ display: 'block', font: '600 13px/1.2 var(--font-body)', color: 'var(--text-strong)', marginBottom: 6 }}>{children}</label>;
const Help = ({ error, children }) => <div style={{ marginTop: 6, font: '400 12px/1.4 var(--font-body)', color: error ? 'var(--status-danger)' : 'var(--text-muted)' }}>{children}</div>;
export function Select({ label, hint, error, options = [], id, style, ...rest }) {
  const [f, setF] = React.useState(false);
  const iid = id || React.useId();
  return <div style={style}>{label && <Label htmlFor={iid}>{label}</Label>}
    <div style={{ position: 'relative' }}>
      <select id={iid} {...rest} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ width: '100%', appearance: 'none', height: 'var(--control-h-m)', padding: '0 36px 0 12px', background: '#fff', border: `1px solid ${error ? 'var(--status-danger)' : f ? 'var(--border-focus)' : 'var(--border-strong)'}`, borderRadius: 'var(--radius-s)', boxShadow: f ? 'var(--focus-ring)' : 'none', outline: 0, font: '400 15px var(--font-body)', color: 'var(--text-strong)', cursor: 'pointer' }}>
        {options.map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <span style={{ position: 'absolute', right: 14, top: '50%', width: 8, height: 8, borderRight: '2px solid var(--navy-700)', borderBottom: '2px solid var(--navy-700)', transform: 'translateY(-70%) rotate(45deg)', pointerEvents: 'none' }} /></div>
    {(hint || error) && <Help error={!!error}>{error || hint}</Help>}</div>;
}
