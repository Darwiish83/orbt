import React from 'react';
export function Card({ title, eyebrow, actions, padding = 24, elevated, interactive, children, style }) {
  const [h, setH] = React.useState(false);
  return <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-l)', boxShadow: elevated || (interactive && h) ? 'var(--shadow-2)' : 'var(--shadow-1)', padding, transition: 'box-shadow var(--dur-base) var(--ease-out), border-color var(--dur-base)', borderColor: interactive && h ? 'var(--navy-300)' : 'var(--border-default)', cursor: interactive ? 'pointer' : 'default', ...style }}>
    {(title || eyebrow || actions) && <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <div>{eyebrow && <div style={{ font: '700 11px/1 var(--font-body)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--orange-600)', marginBottom: 8 }}>{eyebrow}</div>}
      {title && <div style={{ font: '700 19px/1.25 var(--font-display)', color: 'var(--text-strong)' }}>{title}</div>}</div>{actions}</div>}
    {children}</div>;
}
