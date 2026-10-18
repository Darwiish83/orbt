import React from 'react';
const Label = ({ children, htmlFor }) => <label htmlFor={htmlFor} style={{ display: 'block', font: '600 13px/1.2 var(--font-body)', color: 'var(--text-strong)', marginBottom: 6 }}>{children}</label>;
const Help = ({ error, children }) => <div style={{ marginTop: 6, font: '400 12px/1.4 var(--font-body)', color: error ? 'var(--status-danger)' : 'var(--text-muted)' }}>{children}</div>;
export function Input({ label, hint, error, leadingIcon, id, size = 'm', style, inputStyle, ...rest }) {
  const [f, setF] = React.useState(false);
  const iid = id || React.useId();
  const h = { s: 'var(--control-h-s)', m: 'var(--control-h-m)', l: 'var(--control-h-l)' }[size];
  return <div style={style}>{label && <Label htmlFor={iid}>{label}</Label>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: h, padding: '0 12px', background: rest.disabled ? 'var(--gray-100)' : '#fff', border: `1px solid ${error ? 'var(--status-danger)' : f ? 'var(--border-focus)' : 'var(--border-strong)'}`, borderRadius: 'var(--radius-s)', boxShadow: f ? 'var(--focus-ring)' : 'none', color: 'var(--text-muted)', transition: 'box-shadow var(--dur-fast)' }}>
      {leadingIcon}<input id={iid} {...rest} onFocus={e => { setF(true); rest.onFocus && rest.onFocus(e); }} onBlur={e => { setF(false); rest.onBlur && rest.onBlur(e); }} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: '400 15px var(--font-body)', color: 'var(--text-strong)', ...inputStyle }} /></div>
    {(hint || error) && <Help error={!!error}>{error || hint}</Help>}</div>;
}
