/*
 * Live sync over Wi-Fi or a phone hotspot — Voyage Chief's side.
 *
 * Voyage Chief already syncs through its server (the PC runs it; the phone and the PC's own app
 * are both clients). This adds what made that tedious and what nothing checked:
 *   - Find the server on the network instead of typing its address.
 *   - Pair once with a six-digit code shown on the PC, which hands over the address and a
 *     credential — the ship's own token, or the server's when the person at the PC shares every vessel.
 *   - Tell the server which ship this device has open and ask who else is there. The open leg is
 *     kept level only while another device is on the SAME ship.
 *   - "Whole database": when on, voyage legs and vessels one side lacks are copied (when the
 *     device has been idle a minute); when off, they are listed with a button.
 *
 * It does the work with the app's own functions (syncNow, compareLocalAndServerLegs,
 * reconcileVoyageLegs, the vessel library) so the data takes the path it always took.
 * The pure parts are exported for tests.
 */
(function (root) {
  'use strict';

  var PORTS = [8787, 8080];
  var SUBNETS = ['192.168.0', '192.168.1', '192.168.43', '192.168.137', '192.168.2', '192.168.8', '192.168.100',
    '172.20.10', '10.0.0', '10.0.1', '192.168.4', '192.168.10', '192.168.50', '192.168.68'];
  var KEY = 'voyageLanSync';
  var TICK_MS = 30000;

  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function imoOf(v) { return String((v && (v.imo || v.imoNo)) || '').replace(/\D/g, ''); }
  function nameOf(v) { return norm(v && (v.name || v.vesselName)); }

  /** Same ship: the IMO number when both have one, otherwise the name. */
  function sameHull(a, b) {
    if (!a || !b) return false;
    var ia = imoOf(a), ib = imoOf(b);
    if (ia && ib) return ia === ib;
    var na = nameOf(a), nb = nameOf(b);
    return !!na && na === nb;
  }

  /** What to do this round, from who else is here. Pure, so it can be tested. */
  function decide(me, myId, devices) {
    var others = (devices || []).filter(function (d) { return d.deviceId !== myId; });
    if (!others.length) return { action: 'wait', message: 'No other device is connected to the server right now' };
    var same = others.filter(function (d) { return sameHull(d.vessel, me); });
    if (!same.length) {
      var on = others.map(function (d) { return (d.name || 'Device') + ' is on ' + ((d.vessel && d.vessel.name) || 'no vessel'); }).join('; ');
      return { action: 'wait', message: 'Not syncing: ' + on + ' (you are on ' + ((me && me.name) || 'no vessel') + ')', different: true };
    }
    return { action: 'sync', message: 'With ' + same.map(function (d) { return d.name; }).join(', '), peers: same };
  }

  function candidates(origin, known) {
    var urls = [];
    var seen = {};
    function add(u) { if (!seen[u]) { seen[u] = 1; urls.push(u); } }
    if (origin && /^https?:\/\//i.test(origin) && !/\/\/(localhost|127\.)/i.test(origin)) add(origin.replace(/\/$/, ''));
    (known || []).forEach(function (h) { PORTS.forEach(function (p) { add('http://' + h + ':' + p); }); });
    SUBNETS.forEach(function (s) {
      for (var i = 1; i < 255; i++) PORTS.forEach(function (p) { add('http://' + s + '.' + i + ':' + p); });
    });
    return urls;
  }

  function timedFetch(url, init, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    var opts = Object.assign({}, init || {}, ctl ? { signal: ctl.signal } : {});
    return fetch(url, opts).finally(function () { if (timer) clearTimeout(timer); });
  }

  async function scan(extraHosts) {
    var list = candidates(typeof location !== 'undefined' ? location.origin : '', extraHosts);
    var found = [];
    var next = 0;
    async function worker() {
      while (next < list.length) {
        var url = list[next++];
        try {
          var r = await timedFetch(url + '/api/voyage-lan/hello', { method: 'GET' }, 700);
          if (!r.ok) continue;
          var j = await r.json();
          if (j && j.format === 'cheng-lan-sync' && j.product === 'voyage-chief') found.push({ url: url, name: j.deviceName || 'Server', deviceId: j.deviceId });
        } catch (_) { /* nobody there */ }
      }
    }
    await Promise.all(Array.from({ length: 48 }, worker));
    return found;
  }

  /* ----------------------------------------------------------- the app side */

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* private mode */ } }

  var st = { status: '', message: '', last: null, missingLegs: [], missingVessels: [], found: [], pairing: null, busy: false };
  var timer = null;
  var lastInput = Date.now();
  var lastWide = 0;

  function g(name) { try { return (0, eval)(name); } catch (_) { return undefined; } }
  function me() { var s = g('state'); var su = (s && s.setup) || {}; return { name: su.vesselName || '', imo: su.imoNo || '' }; }
  function deviceId() { var c = g('ensureSyncConfig'); try { var s = c && c(); return (s && s.deviceId) || 'device'; } catch (_) { return 'device'; } }
  function deviceName() { var c = g('ensureSyncConfig'); try { var s = c && c(); return (s && s.deviceName) || 'Voyage Chief device'; } catch (_) { return 'Voyage Chief device'; } }
  function base() { var f = g('syncApiBase'); try { return f ? f() : ''; } catch (_) { return ''; } }
  function headers(extra) { var f = g('syncRequestHeaders'); try { return f ? f(extra) : (extra || {}); } catch (_) { return extra || {}; } }
  function idle(ms) { return Date.now() - lastInput >= ms; }

  async function api(path, method, body) {
    var r = await timedFetch(base() + path, {
      method: method || 'GET',
      headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    }, 15000);
    var j = null;
    try { j = await r.json(); } catch (_) { j = null; }
    if (!r.ok) { var e = new Error((j && j.error) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return j;
  }

  function blockedReason() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    var ph = g('printHoldActive'); if (ph && ph()) return 'printing';
    var inflight = g('syncInFlight'); if (inflight) return 'a sync is already running';
    var stack = g('_activityStack'); if (stack && stack.length) return 'another job is running';
    return '';
  }

  async function tick(forceWide) {
    var cfg = load();
    if (!cfg.enabled || !base() || st.busy) return;
    var why = blockedReason();
    if (why) return;
    st.busy = true;
    try {
      var mine = me();
      var out = await api('/api/voyage-lan/presence', 'POST', { deviceId: deviceId(), deviceName: deviceName(), vessel: mine });
      var d = decide(mine, deviceId(), out && out.devices);
      st.status = d.action === 'sync' ? 'connected' : (d.different ? 'different-vessel' : 'waiting');
      st.message = d.message;
      if (d.action === 'sync') {
        var sync = g('syncNow');
        await sync({ background: true, policy: 'merge' });
        st.last = { at: new Date().toISOString() };
        st.status = 'connected';
        st.message = 'Records level ' + d.message.toLowerCase().replace(/^with /, 'with ');
      }
      /* Legs and ships one side lacks: found often, copied only when asked, or when the device is idle and the
         whole database was chosen. */
      if (d.action === 'sync' && (forceWide || Date.now() - lastWide > 5 * 60 * 1000)) {
        lastWide = Date.now();
        await wide(cfg.scopeAll && idle(60000));
      }
    } catch (e) {
      st.status = e.status === 401 ? 'unpaired' : 'offline';
      st.message = e.status === 401 ? 'The server no longer accepts this device. Pair again.' : 'Server not reachable right now';
    } finally { st.busy = false; render(); }
  }

  async function wide(autoCopy) {
    try {
      var cmp = g('compareLocalAndServerLegs');
      var compared = await cmp();
      st.missingLegs = ((compared && compared.rows) || []).filter(function (r) { return r.action !== 'same'; });
      if (autoCopy && st.missingLegs.length) {
        var rec = g('reconcileVoyageLegs');
        await rec(st.missingLegs.map(function (r) { return { voyage: r.voyage, condition: r.condition }; }), { openLatest: false });
        st.missingLegs = [];
        st.last = { at: new Date().toISOString(), copied: true };
      }
    } catch (_) { /* the legs are compared again next time */ }
    try {
      var lib = await g('fetchVesselLibrary')();
      var s = g('state');
      var have = (s && s.vessels) || [];
      st.missingVessels = lib.filter(function (v) {
        return !have.some(function (h) { return sameHull({ imo: h.imoNo || h.imo, name: h.name }, { imo: v.imo, name: v.name }) || (h.slug && h.slug === v.vesselId); });
      });
      if (autoCopy) {
        for (var i = 0; i < st.missingVessels.length; i++) {
          var v = st.missingVessels[i];
          var res = await g('importVesselLibraryEntry')(v.ownerSlug || null, v.vesselId);
          await g('mirrorVesselLibraryImportLocally')(res);
        }
        st.missingVessels = [];
      }
    } catch (_) { /* the library is listed again next time */ }
  }

  async function copyLegs() {
    var rec = g('reconcileVoyageLegs');
    await rec(st.missingLegs.map(function (r) { return { voyage: r.voyage, condition: r.condition }; }), { openLatest: false });
    st.missingLegs = [];
  }

  async function copyVessel(i) {
    var v = st.missingVessels[i];
    if (!v) return;
    var res = await g('importVesselLibraryEntry')(v.ownerSlug || null, v.vesselId);
    await g('mirrorVesselLibraryImportLocally')(res);
    st.missingVessels.splice(i, 1);
  }

  async function showCode(shareAll) {
    var out = await api('/api/voyage-lan/pair/start', 'POST', { vessel: me(), shareAll: !!shareAll });
    st.pairing = { code: out.code, shareAll: !!shareAll, until: Date.now() + (out.expiresIn || 300) * 1000, address: base() };
  }

  async function pairWith(url, code) {
    var r = await timedFetch(url + '/api/voyage-lan/pair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, deviceId: deviceId(), deviceName: deviceName() })
    }, 10000);
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.ok) throw new Error(j.error || 'Pairing failed');
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
    set('sync_serverUrl', url);
    set('sync_apiToken', j.token || '');
    set('sync_auto', 'true');
    var saver = g('saveSyncSettingsFromForm');
    if (saver) await saver({ silent: true, fromAutosave: false });
    var cfg = load(); cfg.enabled = true; cfg.server = j.serverName || ''; cfg.scope = j.scope; save(cfg);
    setTimeout(function () { tick(true); }, 300);
    return j;
  }

  /* --------------------------------------------------------------- the panel */

  var host = null;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function render() {
    if (!host || !document.body.contains(host)) return;
    var typing = host.contains(document.activeElement) || Array.prototype.some.call(host.querySelectorAll('input[type=text],input:not([type])'), function (i) { return i.value; });
    if (typing && host.dataset.drawn) return;
    var cfg = load();
    var tone = { connected: 'var(--teal,#2a9d8f)', 'different-vessel': 'var(--brass,#c99a53)', unpaired: '#c0392b', offline: '#c0392b' }[st.status] || '#667';
    var code = st.pairing && Date.now() < st.pairing.until
      ? '<div style="font-size:26px;letter-spacing:6px;font-weight:700;margin:6px 0">' + esc(st.pairing.code) + '</div>' +
        '<div class="hint">Type this on the other device. It works once, for five minutes' + (st.pairing.shareAll ? ', and hands over access to every vessel on this server' : ', and gives access to this vessel only') + '. This server is at <code>' + esc(st.pairing.address) + '</code>.</div>'
      : '';
    var found = st.found.map(function (f, i) {
      return '<div style="display:flex;gap:8px;align-items:center;margin:4px 0;flex-wrap:wrap"><span><b>' + esc(f.name) + '</b> <span class="hint">' + esc(f.url) + '</span></span>' +
        '<input data-code="' + i + '" placeholder="code" inputmode="numeric" maxlength="6" style="width:90px">' +
        '<button type="button" class="primary small" data-pair="' + i + '">Pair</button></div>';
    }).join('');
    var legs = st.missingLegs.length
      ? '<div class="hint" style="margin-top:8px">' + st.missingLegs.length + ' voyage leg(s) are on only one side (' + esc(st.missingLegs.slice(0, 4).map(function (r) { return 'voyage ' + r.voyage + ' ' + r.condition; }).join(', ')) + '). <button type="button" class="ghost small" id="lanCopyLegs">Copy them so both have them</button></div>' : '';
    var vessels = st.missingVessels.map(function (v, i) {
      return '<div class="hint" style="margin-top:6px">This device does not have <b>' + esc(v.name || v.vesselId) + '</b>. <button type="button" class="ghost small" data-lan-vessel="' + i + '">Copy here</button></div>';
    }).join('');
    host.dataset.drawn = '1';
    host.innerHTML =
      '<h2>Live sync (Wi-Fi / hotspot)</h2>' +
      '<div class="hint">Keep this device level with another one on the same Wi-Fi or phone hotspot. Voyage Chief syncs through the server (the PC that runs it); this finds it, pairs once with a code, and syncs the open voyage leg while the other device has the <b>same vessel</b> open. Nothing is deleted.</div>' +
      '<label style="display:block;margin:8px 0"><input type="checkbox" id="lanEnabled" ' + (cfg.enabled ? 'checked' : '') + '> Sync automatically while the other device is on this vessel</label>' +
      '<div style="margin:6px 0;font-size:13px">' +
      '<label style="display:block"><input type="radio" name="lanScope" value="vessel" ' + (!cfg.scopeAll ? 'checked' : '') + '> Only this vessel; list legs and ships one side lacks, with a button to copy them</label>' +
      '<label style="display:block"><input type="radio" name="lanScope" value="all" ' + (cfg.scopeAll ? 'checked' : '') + '> Whole database: copy legs and ships one side is missing (when idle for a minute)</label></div>' +
      '<div class="btn-row"><button type="button" class="ghost small" id="lanShowCode">Show pairing code</button>' +
      '<label style="font-size:12px;align-self:center"><input type="checkbox" id="lanShareAll"> share every vessel on this server</label>' +
      '<button type="button" class="ghost small" id="lanScan">Find server</button>' +
      '<button type="button" class="primary small" id="lanNow">Sync now</button></div>' +
      code +
      '<div id="lanFound" style="margin-top:8px">' + found + '</div>' +
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><input id="lanUrl" placeholder="or type the server: http://192.168.43.1:8787" style="flex:1;min-width:200px">' +
      '<input id="lanCode" placeholder="code" inputmode="numeric" maxlength="6" style="width:90px"><button type="button" class="ghost small" id="lanPairUrl">Pair</button></div>' +
      '<div style="margin-top:10px;font-size:13px"><b style="color:' + tone + '">' + esc({ connected: 'Connected', 'different-vessel': 'Different vessel', unpaired: 'Pair again', offline: 'Not reachable', waiting: 'Waiting' }[st.status] || (base() ? 'Checking…' : 'Not paired')) + '</b> ' + esc(st.message) +
      (st.last ? ' · last ' + new Date(st.last.at).toLocaleTimeString() : '') + '</div>' + legs + vessels +
      '<div class="hint" style="margin-top:8px">A phone always makes the connection. Bluetooth is not used. Syncing runs while the app is open.</div>';
    wire();
  }

  function wire() {
    var q = function (s) { return host.querySelector(s); };
    var run = async function (fn, ok) {
      try { await fn(); if (ok) alert(ok); } catch (e) { alert((e && e.message) || 'Failed'); } finally { delete host.dataset.drawn; render(); }
    };
    q('#lanEnabled').onchange = function (e) { var c = load(); c.enabled = e.target.checked; save(c); if (c.enabled) tick(true); render(); };
    Array.prototype.forEach.call(host.querySelectorAll('input[name=lanScope]'), function (r) {
      r.onchange = function () { var c = load(); c.scopeAll = r.value === 'all'; save(c); };
    });
    q('#lanShowCode').onclick = function () { run(function () { return showCode(q('#lanShareAll').checked); }); };
    q('#lanScan').onclick = function () {
      run(async function () {
        var known = []; try { known.push(new URL(base()).hostname); } catch (_) { /* none */ }
        st.found = await scan(known);
        if (!st.found.length) alert('No server found. Check both devices are on the same Wi-Fi or hotspot, and the server is running, or type its address.');
      });
    };
    q('#lanNow').onclick = function () { run(function () { return tick(true); }); };
    q('#lanPairUrl').onclick = function () { run(function () { return pairWith(q('#lanUrl').value.trim().replace(/\/$/, ''), q('#lanCode').value.trim()); }, 'Paired'); };
    Array.prototype.forEach.call(host.querySelectorAll('[data-pair]'), function (b) {
      b.onclick = function () {
        var i = Number(b.getAttribute('data-pair'));
        run(function () { return pairWith(st.found[i].url, host.querySelector('[data-code="' + i + '"]').value.trim()); }, 'Paired');
      };
    });
    var cl = q('#lanCopyLegs'); if (cl) cl.onclick = function () { run(copyLegs, 'Copied'); };
    Array.prototype.forEach.call(host.querySelectorAll('[data-lan-vessel]'), function (b) {
      b.onclick = function () { run(function () { return copyVessel(Number(b.getAttribute('data-lan-vessel'))); }, 'Copied'); };
    });
  }

  function mount() {
    var anchor = document.getElementById('serverSyncPanel');
    if (!anchor || host) return;
    host = document.createElement('div');
    host.className = 'panel';
    host.id = 'lanSyncPanel';
    anchor.parentNode.insertBefore(host, anchor.nextSibling);
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true }); });
    render();
    timer = setInterval(function () { tick(false); render(); }, TICK_MS);
    if (load().enabled) setTimeout(function () { tick(true); }, 4000);
  }

  var api2 = {
    sameHull: sameHull, decide: decide, candidates: candidates, mount: mount, scan: scan,
    tick: tick, pairWith: pairWith, _state: st, _touch: function (t) { lastInput = t; }
  };
  if (typeof module === 'object' && module.exports) module.exports = api2;
  root.VoyageLanSync = api2;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else setTimeout(mount, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
