import React from 'react';
export function IconButton({ icon, label, variant = 'ghost', size = 'm', style, ...rest }) {
  const [h, setH] = React.useState(false);
  const d = { s: 32, m: 40, l: 48 }[size] || 40;
  const map = { ghost: ['transparent', 'var(--gray-100)', 'var(--navy-700)', 'transparent'], outline: ['#fff', 'var(--navy-50)', 'var(--navy-700)', 'var(--border-strong)'], primary: ['var(--action-primary)', 'var(--action-primary-hover)', '#fff', 'transparent'], secondary: ['var(--action-secondary)', 'var(--action-secondary-hover)', '#fff', 'transparent'] };
  const [bg, hb, fg, bd] = map[variant] || map.ghost;
  return <button aria-label={label} title={label} {...rest} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ width: d, height: d, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: h ? hb : bg, color: fg, border: `1px solid ${bd}`, borderRadius: 'var(--radius-s)', cursor: 'pointer', padding: 0, transition: 'background var(--dur-fast)', ...style }}>{icon}</button>;
}
