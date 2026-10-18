(function () {
  var KEYS = { invoices: ['Invoice', function (x) { return x.no; }], payments: ['Payment', function (x) { return x.rcp || x.txn || (x.inv + ' ' + x.date); }], shipments: ['Shipment', function (x) { return x.code; }], customers: ['Customer', function (x) { return x.ref; }], lines: ['Shipment customer', function (x) { return x.shipment + ' · ' + x.ref; }], employees: ['Employee', function (x) { return x.id; }], announcements: ['Announcement', function (x) { return x.id; }], documents: ['Document', function (x) { return x.id || x.name; }] };
  var LABEL = { invoices: function (x) { return x.no; }, payments: function (x) { return (x.rcp || x.txn || '') + ' · $' + x.amount; }, announcements: function (x) { return x.title; }, documents: function (x) { return x.name || x.file || x.id; }, employees: function (x) { return x.id + ' · ' + x.name; }, customers: function (x) { return x.ref + ' · ' + x.name; } };
  var SKIP = { log: 1, line: 1, id: 1 };
  function who() { return window.__orbitActor || { id: 'EMP-001', name: 'Admin' }; }
  function fmt(v) { if (v == null || v === '') return '—'; if (typeof v === 'object') return Array.isArray(v) ? v.join(', ') : '…'; return String(v); }
  window.actEntry = function (action, entity, item, changes) { var w = who(); return { id: Date.now() + Math.random(), at: new Date().toISOString(), by: w.id, byName: w.name, action: action, entity: entity, item: item, changes: changes || [] }; };
  window.actDiff = function (k, A, B) {
    var m = KEYS[k]; if (!m || !Array.isArray(A) || !Array.isArray(B)) return [];
    var key = m[1], lab = LABEL[k] || key, out = [], ma = {}, mb = {};
    A.forEach(function (x) { ma[key(x)] = x; }); B.forEach(function (x) { mb[key(x)] = x; });
    B.forEach(function (x) { var o = ma[key(x)]; if (!o) { out.push(window.actEntry('Created', m[0], lab(x), [])); return; } if (o === x) return; var ch = []; Object.keys(Object.assign({}, o, x)).forEach(function (f) { if (SKIP[f]) return; var b = o[f], c = x[f]; if (JSON.stringify(b) !== JSON.stringify(c)) ch.push([f, fmt(b), fmt(c)]); }); if (o.line && x.line) Object.keys(Object.assign({}, o.line, x.line)).forEach(function (f) { if (JSON.stringify(o.line[f]) !== JSON.stringify(x.line[f])) ch.push([f, fmt(o.line[f]), fmt(x.line[f])]); }); if (ch.length) out.push(window.actEntry(ch.some(function (c) { return c[0] === 'status'; }) && ch.length === 1 ? 'Status changed' : 'Updated', m[0], lab(x), ch)); });
    A.forEach(function (x) { if (!mb[key(x)]) out.push(window.actEntry('Deleted', m[0], lab(x), [])); });
    return out;
  };
  var D = function (d, h) { return '2026-10-' + d + 'T' + h + ':00.000Z'; };
  window.ACT_SEED = [];
})();
