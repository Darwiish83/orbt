import React from 'react';
const cache = {};
function load(name) {
  if (!cache[name]) cache[name] = fetch(`https://cdn.jsdelivr.net/npm/lucide-static@0.452.0/icons/${name}.svg`).then(r => r.ok ? r.text() : '').catch(() => '');
  return cache[name];
}
export function Icon({ name, size = 18, color = 'currentColor', style, ...rest }) {
  const [svg, setSvg] = React.useState('');
  React.useEffect(() => { let on = true; load(name).then(t => on && setSvg(t.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"'))); return () => { on = false; }; }, [name]);
  return <span aria-hidden="true" {...rest} dangerouslySetInnerHTML={{ __html: svg }} style={{ display: 'inline-flex', flex: 'none', width: size, height: size, color, lineHeight: 0, ...style }} />;
}
