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

  /* SHA-256, plain JS: crypto.subtle is missing on http:// pages, which is what a ship's LAN serves. */
  function sha256(text) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var bytes = unescape(encodeURIComponent(String(text))).split('').map(function (c) { return c.charCodeAt(0); });
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 255);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < bytes.length; off += 64) {
      var w = new Array(64);
      for (var t = 0; t < 16; t++) w[t] = ((bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) | (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3]) | 0;
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g2 = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g2);
        var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g2; g2 = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g2) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  /** What two devices compare: a hash of the license's email and id, so the id itself is never sent. */
  function licenseTagOf(email, licenseId) {
    var e = String(email || '').trim().toLowerCase(), id = String(licenseId || '').trim();
    return e && id ? sha256('lan-license|' + e + '|' + id) : '';
  }
  /** This device's license tag, or '' when there is no valid license here. */
  function licenseTag() {
    try {
      var L = root.ChengLicense;
      var ent = L && L.loadEntitlement && L.loadEntitlement();
      if (!ent || !ent.email || !ent.licenseId) return '';
      if (L.isValid && !L.isValid(ent)) return '';
      return licenseTagOf(ent.email, ent.licenseId);
    } catch (_) { return ''; }
  }
  var LICENSE_NONE = 'Activate your license on this device first: live sync works only between devices on the same license (same email and license).';
  var LICENSE_DIFFERENT = 'These two devices are on different licenses. Live sync works only when both use the same email and license.';

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
  function decide(me, myId, devices, myTag) {
    if (!myTag) return { action: 'wait', message: LICENSE_NONE, license: 'none' };
    var all = (devices || []).filter(function (d) { return d.deviceId !== myId; });
    var others = all.filter(function (d) { return d.license && d.license === myTag; });
    if (all.length && !others.length) {
      return { action: 'wait', message: 'Not syncing: ' + LICENSE_DIFFERENT, license: 'different' };
    }
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
    var tag = licenseTag();
    if (!tag) { st.status = 'no-license'; st.message = LICENSE_NONE; render(); return; }
    var why = blockedReason();
    if (why) return;
    st.busy = true;
    try {
      var mine = me();
      var out = await api('/api/voyage-lan/presence', 'POST', { deviceId: deviceId(), deviceName: deviceName(), vessel: mine, license: tag });
      var d = decide(mine, deviceId(), out && out.devices, tag);
      st.status = d.action === 'sync' ? 'connected' : (d.license === 'different' ? 'different-license' : (d.different ? 'different-vessel' : 'waiting'));
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
    var tag = licenseTag();
    if (!tag) throw new Error(LICENSE_NONE);
    var out = await api('/api/voyage-lan/pair/start', 'POST', { vessel: me(), shareAll: !!shareAll, license: tag });
    st.pairing = { code: out.code, shareAll: !!shareAll, until: Date.now() + (out.expiresIn || 300) * 1000, address: base() };
  }

  async function pairWith(url, code) {
    var tag = licenseTag();
    if (!tag) throw new Error(LICENSE_NONE);
    var r = await timedFetch(url + '/api/voyage-lan/pair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, deviceId: deviceId(), deviceName: deviceName(), license: tag })
    }, 10000);
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.ok) throw new Error(j.error || 'Pairing failed');
    /* The server must be on this license too (an older server says nothing). */
    if (!j.license || j.license !== tag) throw new Error(j.license ? LICENSE_DIFFERENT : 'The other device runs a version that does not check licenses. Update it, then pair again.');
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
    var tone = { connected: 'var(--teal,#2a9d8f)', 'different-vessel': 'var(--brass,#c99a53)', 'different-license': '#c0392b', 'no-license': '#c0392b', unpaired: '#c0392b', offline: '#c0392b' }[st.status] || '#667';
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
      (licenseTag()
        ? '<div class="hint">Only devices on this same license (same email and license) can pair and sync with this one.</div>'
        : '<div class="hint" style="color:#c0392b"><b>No active license on this device.</b> ' + esc(LICENSE_NONE) + '</div>') +
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
      '<div style="margin-top:10px;font-size:13px"><b style="color:' + tone + '">' + esc({ connected: 'Connected', 'different-vessel': 'Different vessel', 'different-license': 'Different license', 'no-license': 'No license', unpaired: 'Pair again', offline: 'Not reachable', waiting: 'Waiting' }[st.status] || (base() ? 'Checking…' : 'Not paired')) + '</b> ' + esc(st.message) +
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
    sameHull: sameHull, decide: decide, sha256: sha256, licenseTagOf: licenseTagOf, licenseTag: licenseTag, candidates: candidates, mount: mount, scan: scan,
    tick: tick, pairWith: pairWith, _state: st, _touch: function (t) { lastInput = t; }
  };
  if (typeof module === 'object' && module.exports) module.exports = api2;
  root.VoyageLanSync = api2;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else setTimeout(mount, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
