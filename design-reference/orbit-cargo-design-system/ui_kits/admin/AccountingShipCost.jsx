window.PROFIT_SPLIT = { Turkey: { Air: [43, 50, 7], Sea: [45, 50, 5] } };
window.profitSplit = s => ((window.PROFIT_SPLIT[s.ocountry] || {})[s.mode]) || [100, 0, 0];
window.commissionOf = (db, code) => +(db.commissions || []).filter(c => c.shipment === code).reduce((a, c) => { const l = db.lines.find(x => x.shipment === code && x.ref === c.ref); const q = c.qty !== '' && c.qty != null ? +c.qty : l ? +(l.actual ?? l.measure) || 0 : 0; return a + q * (+c.rate || 0); }, 0).toFixed(2);
window.comFullyPaid = (db, c) => { if (!c.auto) return true; const iv = (db.invoices || []).find(i => i.shipment === c.shipment && i.ref === c.ref); return !!iv && (+iv.balance || 0) <= 0.009; };
window.commissionEarnedOf = (db, code) => window.commissionOf({ ...db, commissions: (db.commissions || []).filter(c => c.shipment === code && window.comFullyPaid(db, c)) }, code);
window.shipCostRow = (db, s) => { const n = x => +x || 0; const C = db.shipCosts || {};
  const LS = code => db.lines.filter(l => l.shipment === code);
  const income = code => +LS(code).reduce((a, l) => { const iv = db.invoices.find(i => i.shipment === code && i.ref === l.ref); return a + (iv ? iv.total : window.ORBIT_DATA.lineTotal(l)); }, 0).toFixed(2);
  const qtyOf = code => +LS(code).reduce((a, l) => a + n(l.actual ?? l.measure), 0).toFixed(2);
  const collected = code => { const nos = new Set(db.invoices.filter(i => i.shipment === code).map(i => i.no)); return +db.payments.filter(p => nos.has(p.inv)).reduce((a, p) => a + n(p.amount), 0).toFixed(2); };
  return (s => { const c = C[s.code] || {}; const L = LS(s.code); const q = qtyOf(s.code); const localDel = +L.reduce((a, l) => a + n(l.delivery), 0).toFixed(2); const invCharge = +L.reduce((a, l) => a + n(l.fatura), 0).toFixed(2); const com = window.commissionOf ? window.commissionOf(db, s.code) : 0; const gross = collected(s.code); const so = +(gross - com).toFixed(2);
    const base = n(c.rateTr) * q + n(c.awbTr) + n(c.customTr) + n(c.delivPack) + invCharge + n(c.brandTr);
    const trFee = +((base + localDel) * n(c.trFeePct) / 100).toFixed(2); const trTotal = base + localDel + trFee; const costRateTr = q ? (base + trFee) / q : 0; const AR = window.arrCostOf ? window.arrCostOf(db, s.code) : { any: false }; const mgq = AR.any ? AR.total : 0; const rateMgq = AR.q ? AR.total / AR.q : 0; const totCost = trTotal + mgq; const totInc = so - n(c.paidTr);
    const sp = window.profitSplit(s); const pr = totInc - totCost;
    return { trFee, com, gross, sh: sp, orb: pr * sp[0] / 100, som: pr * sp[1] / 100 + n(c.paidTr), trm: n(c.paidTr), mah: pr * sp[2] / 100, s, c, q, localDel, invCharge, trTotal, costRateTr, mgq, rateMgq, totCostRate: costRateTr + rateMgq, totCost, so, totInc, incRate: q ? totInc / q : 0, profit: totInc - totCost }; })(s);
};
function ShipCostTable() {
  const t = useT(); const { db, setDb, year, toast } = useAdmin();
  const [mode, setMode] = React.useState('Air'); const air = mode === 'Air'; const u = air ? 'KGS' : 'CBM';
  const C = db.shipCosts || {};
  const ships = db.shipments.filter(s => s.year === year && s.mode === mode).sort((a, b) => a.date < b.date ? -1 : 1);
  const n = x => +x || 0;
  const row = sh => window.shipCostRow(db, sh);
  const rowOld = s => { const c = C[s.code] || {}; const q = (c.qty === '' || c.qty == null) ? qtyOf(s.code) : c.qty; const trTotal = n(c.awbTr) + n(c.rateTr) * n(q) + n(c.customTr) + n(c.delivPack) + n(c.localDel) + n(c.invCharge) + n(c.brandTr); const costRateTr = q ? (trTotal - n(c.brandTr)) / q : 0; const mgq = n(c.rateMgq) * n(q); const totCost = trTotal + mgq; const so = c.incomeSo ?? income(s.code); const totInc = n(so) + n(c.paidTr); return { s, c, q, trTotal, costRateTr, mgq, totCostRate: costRateTr + n(c.rateMgq), totCost, so, totInc, incRate: q ? totInc / q : 0, profit: totInc - totCost }; };
  const R = ships.map(row);
  const upd = (code, k, v) => setDb('shipCosts', A => ({ ...(A || {}), [code]: { ...((A || {})[code] || {}), [k]: v === '' ? '' : (k === 'awbNo' ? v : +v) } }));
  const tot = k => R.reduce((a, r) => a + n(typeof k === 'function' ? k(r) : r[k]), 0);
  const m = v => money(v); const r2 = v => '$' + n(v).toFixed(2);
  const TR = '#FDEBDD', MG = '#DCE8FB', PR = '#FFE7A8', SP = '#E6F4EA';
  const th = bg => ({ background: bg || 'var(--surface-sunken)', font: '700 10px/1.25 var(--font-body)', textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-strong)', padding: '8px 6px', borderRight: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-strong)', textAlign: 'center', minWidth: 74, verticalAlign: 'bottom', position: 'sticky', top: 0, zIndex: 1 });
  const td = (bg, b) => ({ background: bg || '#fff', padding: '4px 6px', borderRight: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', font: (b ? '700' : '500') + ' 12px var(--font-body)', color: 'var(--text-strong)', textAlign: 'right', whiteSpace: 'nowrap' });
  const inp = (r, k, w, txt) => <input type={txt ? 'text' : 'number'} step="0.01" value={k === 'qty' ? r.q : (r.c[k] ?? '')} placeholder={txt ? '' : '0'} onChange={e => upd(r.s.code, k, e.target.value)} style={{ width: w || 64, height: 26, border: '1px solid transparent', borderRadius: 4, background: 'transparent', font: '500 12px var(--font-body)', textAlign: txt ? 'left' : 'right', color: 'var(--text-strong)', outline: 0, padding: '0 4px', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor = 'var(--navy-700)'; e.target.style.background = '#fff'; }} onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }} />;
  const cols = [['#', null], ['Date', null], ['Week', null], [air ? 'AWB No' : 'B/L No', null], [air ? 'AWB Cost' : 'B/L Cost', TR], ['Rate', TR], [u, TR], ['Custom', TR], ['Delivery & Packaging', TR], ['Local Delivery for Customers', TR], ['Invoice Charge', TR], ['Branded Charges', TR], ['Cost Rate', null], ['Total Shipment Cost Amount', null], ['Rate MGQ', null], ['Total Cost MGQ', MG], ['Total Cost Rate', null], ['Total Shipment Cost', MG], ['Income Rate', null], ['Total Income Somalia', MG], ['Transfer Money', MG], ['Total Income', null], ['Profit', PR], ['Orbit Cargo', SP], ['Somali Transport', SP], ['Mahad', SP]];
  if (mode === 'Sea') return <SeaProfitTable onMode={setMode} />;
  return <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><Seg options={[['Air', 'Airways ' + year, 'plane'], ['Sea', 'Seaways ' + year, 'ship']]} value={mode} onChange={setMode} />
      <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}><span>{t('Total Shipment Cost')}: <b>{m(tot('totCost'))}</b></span><span>{t('Total Income')}: <b>{m(tot('totInc'))}</b></span><span>{t('Profit')}: <b style={{ color: tot('profit') >= 0 ? 'var(--green-600)' : 'var(--red-600)' }}>{m(tot('profit'))}</b></span></div></div>
    <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-l)', overflow: 'auto', maxHeight: '70vh' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
        <thead><tr>{cols.map(([l, bg]) => <th key={l} style={th(bg)}>{t(l)}</th>)}</tr></thead>
        <tbody>{R.map((r, i) => <tr key={r.s.code}>
          <td style={{ ...td(), textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
          <td style={{ ...td(), textAlign: 'left' }}>{fdate(r.s.date)}</td>
          <td style={{ ...td(), textAlign: 'left', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{scode(r.s.code)}</td>
          <td style={{ ...td(), textAlign: 'left', fontFamily: 'var(--font-mono)' }}>{r.s.awb || '—'}</td>
          <td style={td(TR)}>{inp(r, 'awbTr')}</td><td style={td(TR)}>{inp(r, 'rateTr', 56)}</td><td style={td(TR, 1)}>{num(r.q, air ? 1 : 2)}</td><td style={td(TR)}>{inp(r, 'customTr')}</td><td style={td(TR)}>{inp(r, 'delivPack')}</td><td style={td(TR)}>{m(r.localDel)}</td><td style={td(TR)}>{m(r.invCharge)}</td><td style={td(TR)}>{inp(r, 'brandTr')}</td>
          <td style={td()}>{r2(r.costRateTr)}</td><td style={td()}>{m(r.trTotal)}</td>
          <td style={td()}>{r2(r.rateMgq)}</td><td style={td(MG)} title={t('From Arrival cost (Mogadishu) → TOTAL AIR COST')}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="link" size={11} color="var(--navy-700)" />{m(r.mgq)}</span></td>
          <td style={td()}>{r2(r.totCostRate)}</td><td style={td(MG, 1)}>{m(r.totCost)}</td>
          <td style={td()}>{r2(r.incRate)}</td><td style={td(MG)} title={t('Collected') + ' ' + m(r.gross) + (r.com ? ' − ' + t('Commission') + ' ' + m(r.com) : '')}>{m(r.so)}</td><td style={td(MG)}>{inp(r, 'paidTr')}</td>
          <td style={td()}>{m(r.totInc)}</td><td style={{ ...td(PR, 1), color: r.profit >= 0 ? 'var(--text-strong)' : 'var(--red-600)' }}>{m(r.profit)}</td>{[['orb', 0], ['som', 1], ['mah', 2]].map(([k, j]) => <td key={k} style={td(SP, k === 'orb')}>{r.sh[j] ? <>{m(r[k])}<span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)' }}>{r.sh[j]}%{k === 'som' && r.trm ? ' + ' + m(r.trm) : ''}</span></> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>)}</tr>)}
          {!R.length && <tr><td colSpan={cols.length} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{t('No shipments')}</td></tr>}
        </tbody>
        
      </table></div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('Date, Week, AWB No, KGS, Local Delivery, Invoice Charge and Total Income Somalia come from the shipment automatically. You type AWB Cost, Rate, Custom, Delivery & Packaging, Branded Charges, Total Cost MGQ and Transfer Money.')}</div>
  </>;
}
Object.assign(window, { ShipCostTable });

function ShipCostPage() { const t = useT(); const { db, country } = useAdmin(); const CL = db.originCountries || []; const oc = country && CL.includes(country) ? country : CL[0]; const setOc = () => {}; const [v, setV] = React.useState('origin'); return <><PageHead title="Shipment cost" sub="Shipment profit" /><div><Seg options={[['origin', 'Shipment cost & profit', 'calculator'], ['opcost', t('Operation cost') + ' (' + t(oc || 'Origin') + ')', 'plane-takeoff'], ['arrival', t('Operation cost') + ' (MGQ)', 'plane-landing']]} value={v} onChange={setV} /></div>{v === 'origin' ? <ShipCostTable /> : v === 'opcost' ? <OriginCostSheet oc={oc} setOc={setOc} /> : <ArrivalCostSheet />}</>; }
Object.assign(window, { ShipCostPage });
