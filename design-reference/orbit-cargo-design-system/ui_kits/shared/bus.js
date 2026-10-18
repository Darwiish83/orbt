// Shared admin → customer message bus (prototype only; same-origin localStorage)
(function () {
  var K = 'orbit-bus-notifs-v1', subs = [];
  function all() { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch (e) { return []; } }
  function save(a) { localStorage.setItem(K, JSON.stringify(a.slice(0, 300))); subs.forEach(function (f) { f(); }); }
  window.addEventListener('storage', function (e) { if (e.key === K) subs.forEach(function (f) { f(); }); });
  window.OrbitBus = {
    push: function (items) { var a = all(), now = new Date().toISOString(); (Array.isArray(items) ? items : [items]).forEach(function (n, i) { a.unshift(Object.assign({ id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 6), at: now, read: false }, n)); }); save(a); },
    list: function (ref) { return all().filter(function (n) { return n.ref === ref; }); },
    unread: function (ref) { return all().filter(function (n) { return n.ref === ref && !n.read; }).length; },
    markRead: function (ref, id) { save(all().map(function (n) { return n.ref === ref && (!id || n.id === id) ? Object.assign({}, n, { read: true }) : n; })); },
    subscribe: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  };
})();
