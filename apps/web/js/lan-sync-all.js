/*
 * One live sync for the whole AIO, on the Backup & Restore page.
 *
 * Tank Chief and Voyage Chief each have their own sync engine (Tank on the gateway, Voyage in its
 * own frame), and the records that belong to neither (spare and store requisitions, the
 * consumption plan and its snapshots, the oil record book, e-ORB) live in Voyage's database. This
 * is the one place that sets all of it up and shows all of it:
 *
 *   - one pairing code, shown once and typed once: it is handed to both engines;
 *   - one switch, one scope (this vessel / the whole database), one "Sync now";
 *   - one status per kind of record, and the license both engines are held to.
 *
 * It does no syncing itself. It tells each engine what to do, through `deps`:
 *   deps.tank(path, init)      -> JSON    Tank Chief's engine on the gateway (/tanks/api/lan/...)
 *   deps.voyage(action, extra) -> reply   Voyage Chief's engine, over the frame's postMessage bridge
 * so it can be tested with plain fakes. The panel (mount) is the only part that touches the page.
 */
(function (root) {
  'use strict';

  var CODE_MS = 5 * 60 * 1000;
  var MISC_EVERY_MS = 5 * 60 * 1000;
  var IDLE_MS = 60 * 1000;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function msg(e) { return (e && e.message) || String(e || 'Failed'); }
  function hostOf(url) { try { return new URL(url).hostname; } catch (_) { return String(url || ''); } }
  function randomCode() {
    var n;
    try {
      var a = new Uint32Array(1);
      (root.crypto || {}).getRandomValues(a);
      n = a[0] % 1000000;
    } catch (_) { n = Math.floor(Math.random() * 1000000); }
    return String(n).padStart(6, '0');
  }

  /* What the status of one engine means for the person reading it. */
  var LABEL = {
    connected: ['ok', 'Connected'],
    waiting: ['dim', 'Waiting'],
    off: ['dim', 'Off'],
    offline: ['warn', 'Not reachable'],
    unpaired: ['bad', 'Pair again'],
    'different-vessel': ['warn', 'Different vessel'],
    'different-license': ['bad', 'Different license'],
    'no-license': ['bad', 'No license'],
    error: ['bad', 'Problem'],
    unavailable: ['dim', 'Not available'],
    unknown: ['dim', 'Checking…']
  };

  /** One line for Tank Chief out of its peers: the worst thing wins, "connected" only if every peer is. */
  function tankRow(t) {
    if (!t) return { key: 'tank', label: 'Tank Chief', status: 'unavailable', message: 'Tank Chief did not answer.' };
    if (!t.license || !t.license.active) return { key: 'tank', label: 'Tank Chief', status: 'no-license', message: 'No active license on this device.' };
    var peers = t.peers || [];
    if (!peers.length) return { key: 'tank', label: 'Tank Chief', status: t.enabled ? 'waiting' : 'off', message: t.enabled ? 'No device paired yet.' : 'Not paired.' };
    var order = ['different-license', 'no-license', 'unpaired', 'error', 'offline', 'different-vessel', 'unknown', 'connected'];
    var worst = peers.slice().sort(function (a, b) {
      var ia = order.indexOf(a.status), ib = order.indexOf(b.status);
      return (ia < 0 ? 5 : ia) - (ib < 0 ? 5 : ib);
    })[0];
    var last = peers.map(function (p) { return p.lastSync && p.lastSync.at; }).filter(Boolean).sort().pop();
    return {
      key: 'tank', label: 'Tank Chief', status: worst.status || 'unknown',
      message: (worst.message || '') + (peers.length > 1 ? ' (' + peers.length + ' devices)' : ''),
      peer: worst.name, last: last || null
    };
  }

  function voyageRow(v) {
    if (!v) return { key: 'voyage', label: 'Voyage Chief', status: 'unavailable', message: 'Voyage Chief is still loading.' };
    if (!v.license || !v.license.active) return { key: 'voyage', label: 'Voyage Chief', status: 'no-license', message: 'No active license on this device.' };
    if (!v.paired) return { key: 'voyage', label: 'Voyage Chief', status: v.enabled ? 'waiting' : 'off', message: v.enabled ? 'No server paired yet.' : 'Not paired.' };
    var s = v.status || (v.enabled ? 'unknown' : 'off');
    var note = v.missingLegs ? v.missingLegs + ' voyage leg' + (v.missingLegs === 1 ? '' : 's') + ' on one side only. ' : '';
    return { key: 'voyage', label: 'Voyage Chief', status: s, message: note + (v.message || ''), last: v.last && v.last.at || null };
  }

  /**
   * The records that belong to neither program — requisitions, consumption plan, oil record book —
   * ride on Voyage's database, so they sync when Voyage is connected, and on "Sync now".
   */
  function miscRow(misc, voyage) {
    if (!voyage || !voyage.license || !voyage.license.active) return { key: 'misc', label: 'Other reports', status: 'no-license', message: 'No active license on this device.' };
    if (!voyage.paired) return { key: 'misc', label: 'Other reports', status: voyage.enabled ? 'waiting' : 'off', message: 'Requisitions, consumption plan and e-ORB sync once paired.' };
    if (misc && misc.status === 'error') return { key: 'misc', label: 'Other reports', status: 'error', message: misc.message };
    if (misc && misc.at) return { key: 'misc', label: 'Other reports', status: 'connected', message: misc.message || 'Up to date', last: misc.at };
    var s = voyage.status === 'connected' ? 'waiting' : (voyage.status || 'waiting');
    return { key: 'misc', label: 'Other reports', status: s === 'connected' ? 'waiting' : s, message: 'Requisitions, consumption plan and e-ORB are compared when Voyage is connected.' };
  }

  function create(deps) {
    var now = deps.now || function () { return Date.now(); };
    var toast = deps.toast || function () {};
    var rand = deps.randomCode || randomCode;
    var idle = deps.idle || function () { return true; };
    var st = {
      tank: null, voyage: null, misc: null,
      pairing: null, found: [], busy: '', lastMiscAt: 0, timer: null, errors: {}, notice: null
    };

    async function safe(key, fn) {
      try { var out = await fn(); delete st.errors[key]; return out; } catch (e) { st.errors[key] = msg(e); return null; }
    }

    /* Tank's engine learns whose license this device is on from whoever is signed in. The Tank frame does it
       when it is open; the shell does it too, so the page works without Tank Chief ever having been opened. */
    var announced = '';
    async function announceLicense() {
      var lic = deps.license ? deps.license() : null;
      var key = lic && lic.email && lic.licenseId ? lic.email + '|' + lic.licenseId : '';
      if (key === announced) return;
      try {
        await deps.tank('/api/lan/license', { method: 'POST', body: { email: key ? lic.email : '', licenseId: key ? lic.licenseId : '' } });
        announced = key;
      } catch (_) { /* tried again on the next refresh */ }
    }

    var inflight = null;
    function refresh() {
      /* The page polls; a slow engine (Voyage still loading) must not pile up requests. */
      if (!inflight) inflight = doRefresh().finally(function () { inflight = null; });
      return inflight;
    }
    async function doRefresh() {
      await announceLicense();
      var t = await safe('tank', function () { return deps.tank('/api/lan/state'); });
      var v = await safe('voyage', function () { return deps.voyage('lan-state', {}).then(function (r) { return r && r.lan; }); });
      st.tank = t; st.voyage = v;
      if (!t && !v) throw new Error(st.errors.tank || st.errors.voyage || 'Nothing answered');
      var expires = (t && t.pairing && Date.parse(t.pairing.expiresAt)) || (v && v.pairing && v.pairing.until) || 0;
      if (expires > now()) {
        var keep = st.pairing && st.pairing.code === ((t && t.pairing && t.pairing.code) || (v && v.pairing && v.pairing.code)) ? st.pairing.note : '';
        st.pairing = { code: (t && t.pairing && t.pairing.code) || v.pairing.code, until: expires, address: (t && t.address) || (v && v.address) || '', note: keep || '' };
      } else if (st.pairing && st.pairing.until <= now()) {
        st.pairing = null;
      }
      return snapshot();
    }

    function licenseOf() {
      var l = st.tank && st.tank.license;
      var lv = st.voyage && st.voyage.license;
      return { active: !!(l && l.active) && !!(lv && lv.active), email: (l && l.email) || '' };
    }
    function enabled() { return !!((st.tank && st.tank.enabled) || (st.voyage && st.voyage.enabled)); }
    function scopeAll() { return !!((st.tank && st.tank.scope === 'all') || (st.voyage && st.voyage.scopeAll)); }

    function snapshot() {
      return {
        license: licenseOf(),
        enabled: enabled(),
        scopeAll: scopeAll(),
        deviceName: (st.tank && st.tank.deviceName) || '',
        address: (st.tank && st.tank.address) || '',
        rows: [tankRow(st.tank), voyageRow(st.voyage), miscRow(st.misc, st.voyage)],
        peers: (st.tank && st.tank.peers) || [],
        pairing: st.pairing,
        found: st.found,
        busy: st.busy,
        errors: st.errors,
        notice: st.notice
      };
    }

    async function setEnabled(on) {
      await safe('tank', function () { return deps.tank('/api/lan/config', { method: 'POST', body: { enabled: !!on } }); });
      await safe('voyage', function () { return deps.voyage('lan-config', { config: { enabled: !!on } }); });
      return refresh();
    }

    async function setScope(all) {
      await safe('tank', function () { return deps.tank('/api/lan/config', { method: 'POST', body: { scope: all ? 'all' : 'active' } }); });
      await safe('voyage', function () { return deps.voyage('lan-config', { config: { scopeAll: !!all } }); });
      return refresh();
    }

    async function setDeviceName(name) {
      await deps.tank('/api/lan/config', { method: 'POST', body: { deviceName: String(name || '') } });
      return refresh();
    }

    /** One code, handed to both engines. It works once, for five minutes, on whichever device shows it. */
    async function showCode(opts) {
      var code = rand();
      var shareAll = !!(opts && opts.shareAll);
      var okTank = await safe('tank', function () { return deps.tank('/api/lan/pair/start', { method: 'POST', body: { code: code } }); });
      var okVoy = await safe('voyage', function () { return deps.voyage('lan-code', { code: code, shareAll: shareAll }); });
      if (!okTank && !okVoy) throw new Error(st.errors.tank || st.errors.voyage || 'Could not show a code');
      /* Say which program could not start the code: the next refresh would otherwise wipe that error. */
      var note = [];
      if (!okTank) note.push('Tank Chief: ' + (st.errors.tank || 'did not start the code'));
      if (!okVoy) note.push('Voyage Chief: ' + (st.errors.voyage || 'did not start the code'));
      /* A device showing a code is waiting to be joined: it has to be switched on to announce itself to the other. */
      if (!enabled()) await setEnabled(true).catch(function () {});
      await refresh().catch(function () {});
      st.notice = null;
      st.pairing = { code: code, until: now() + CODE_MS, address: (st.tank && st.tank.address) || '', note: note.join(' · ') };
      return st.pairing;
    }

    /** Look for the other device on the network: both engines are asked, and a device found by either is listed once. */
    async function find() {
      var t = await safe('tank', function () { return deps.tank('/api/lan/scan', { method: 'POST', body: {} }); });
      var v = await safe('voyage', function () { return deps.voyage('lan-scan', { hosts: [] }).then(function (r) { return r && r.found; }); });
      var byHost = {};
      ((t && t.found) || []).forEach(function (d) { byHost[hostOf(d.url)] = { url: d.url, name: d.name, via: 'tank' }; });
      (v || []).forEach(function (d) { var h = hostOf(d.url); if (!byHost[h]) byHost[h] = { url: d.url, name: d.name, via: 'voyage' }; });
      st.found = Object.keys(byHost).map(function (h) { return byHost[h]; });
      return st.found;
    }

    /** One address, one code: pair Tank Chief and Voyage Chief with the same device. */
    async function pair(url, code) {
      var u = String(url || '').trim().replace(/\/$/, '');
      var c = String(code || '').replace(/\D/g, '');
      if (!/^https?:\/\//i.test(u)) throw new Error('Give the other device address, like http://192.168.0.20:8080');
      if (c.length !== 6) throw new Error('Type the six-digit code showing on the other device');
      var errs = [];
      var tankOk = false;
      var voyOk = false;
      try { await deps.tank('/api/lan/peers/pair', { method: 'POST', body: { url: u, code: c } }); tankOk = true; } catch (e) { errs.push('Tank Chief: ' + msg(e)); }
      try { await deps.voyage('lan-pair', { url: u, code: c }); voyOk = true; } catch (e) { errs.push('Voyage Chief: ' + msg(e)); }
      if (!tankOk && !voyOk) {
        /* Kept on the page: a toast is gone in seconds, and this is the answer to "why did it not pair". */
        st.notice = { kind: 'bad', text: errs.join(' · ') };
        throw new Error(errs.join(' · '));
      }
      await setEnabled(true).catch(function () {});
      st.found = [];
      st.notice = errs.length ? { kind: 'warn', text: 'Paired, but ' + errs.join(' · ') } : null;
      return { tank: tankOk, voyage: voyOk, problems: errs };
    }

    async function forget(deviceId) {
      await deps.tank('/api/lan/peers/forget', { method: 'POST', body: { deviceId: deviceId } });
      return refresh();
    }

    /** The other reports travel with Voyage's database; they are compared only while Voyage is connected. */
    async function syncMisc() {
      if (!st.voyage || st.voyage.status !== 'connected') return null;
      try {
        var r = await deps.voyage('reconcile-misc', {});
        st.misc = { status: 'ok', at: new Date(now()).toISOString(), message: (r && r.message) || 'Other reports are level' };
      } catch (e) {
        st.misc = { status: 'error', message: msg(e), at: null };
      }
      st.lastMiscAt = now();
      return st.misc;
    }

    async function syncNow() {
      st.busy = 'Syncing…';
      try {
        await safe('tank', function () { return deps.tank('/api/lan/sync-now', { method: 'POST', body: { force: true } }); });
        await safe('voyage', function () { return deps.voyage('lan-now', {}); });
        await refresh();
        await syncMisc();
        return await refresh();
      } finally { st.busy = ''; }
    }

    /** Called on a timer while the page is open: refresh the status, and compare the other reports now and then. */
    async function tick() {
      try { await refresh(); } catch (_) { return snapshot(); }
      var due = now() - st.lastMiscAt >= MISC_EVERY_MS;
      if (enabled() && due && idle(IDLE_MS)) await syncMisc();
      return snapshot();
    }

    function setIdle(fn) { idle = fn; }
    function start(ms) {
      stop();
      st.timer = setInterval(function () { tick().catch(function () {}); }, ms || 5000);
    }
    function stop() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }

    return {
      refresh: refresh, snapshot: snapshot, setEnabled: setEnabled, setScope: setScope, setDeviceName: setDeviceName,
      showCode: showCode, find: find, pair: pair, forget: forget, syncNow: syncNow, syncMisc: syncMisc, tick: tick,
      start: start, stop: stop, setIdle: setIdle, _state: st
    };
  }

  /* ------------------------------------------------------------------ the panel */

  function mount(parent, controller, ctx) {
    var toast = (ctx && ctx.toast) || function () {};
    var host = document.createElement('div');
    host.className = 'form-panel backup-section';
    host.id = 'bk-live-sync';
    parent.appendChild(host);
    var snap = null;
    var busy = false;
    var lastInput = Date.now();
    controller.setIdle(function (ms) { return Date.now() - lastInput >= ms; });
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true });
    });

    function typing() {
      return host.contains(document.activeElement) ||
        Array.prototype.some.call(host.querySelectorAll('#ls-url,#ls-code,[data-ls-code]'), function (i) { return i.value; });
    }

    function rowHtml(r) {
      var lab = LABEL[r.status] || LABEL.unknown;
      var tone = lab[0] === 'ok' ? 'var(--ok,#2a9d8f)' : lab[0] === 'bad' ? 'var(--danger,#c0392b)' : lab[0] === 'warn' ? 'var(--warn,#c99a53)' : '#667';
      var last = r.last ? ' · last ' + esc(new Date(r.last).toLocaleTimeString()) : '';
      return '<div class="ls-row" data-ls-row="' + esc(r.key) + '" style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:6px 0">' +
        '<b style="min-width:120px">' + esc(r.label) + '</b>' +
        '<span class="ls-badge" style="font-size:12px;padding:1px 9px;border-radius:10px;background:' + tone + ';color:#fff">' + esc(lab[1]) + '</span>' +
        '<span class="hint" style="margin:0">' + esc(r.message || '') + last + '</span></div>';
    }

    function draw() {
      var s = snap;
      if (!s) { host.innerHTML = '<div class="backup-section-head"><span class="backup-section-title">Live sync (Wi-Fi / hotspot) — all programs</span></div><p class="hint">Looking for Tank Chief and Voyage Chief…</p>'; return; }
      var code = s.pairing
        ? '<div id="ls-code-show" style="font-size:26px;letter-spacing:6px;font-weight:700;margin:6px 0">' + esc(s.pairing.code) + '</div>' +
          '<div class="hint">Type this on the other device. It works once, for five minutes, for Tank Chief and Voyage Chief together.' +
          (s.pairing.address ? ' This device is at <code>' + esc(s.pairing.address) + '</code>.' : '') + '</div>' +
          (s.pairing.note ? '<div class="hint" style="color:var(--warn,#c99a53)">The code is not working for everything: ' + esc(s.pairing.note) + '</div>' : '')
        : '';
      var found = (s.found || []).map(function (d) {
        return '<div style="display:flex;gap:8px;align-items:center;margin:4px 0;flex-wrap:wrap"><span><b>' + esc(d.name || 'Device') +
          '</b> <span class="hint">' + esc(d.url) + '</span></span>' +
          '<input data-ls-code="' + esc(d.url) + '" placeholder="Code" inputmode="numeric" maxlength="6" autocomplete="off" style="width:110px">' +
          '<button type="button" class="btn primary" data-ls-pair="' + esc(d.url) + '">Pair</button></div>';
      }).join('');
      var peers = (s.peers || []).map(function (p) {
        return '<div class="hint" style="margin:4px 0">Paired with <b>' + esc(p.name) + '</b> <span>' + esc(p.url) + '</span> ' +
          '<button type="button" class="btn small" data-ls-forget="' + esc(p.deviceId) + '">Forget</button></div>';
      }).join('');
      var lic = s.license.active
        ? '<p class="hint">Licensed to <b>' + esc(s.license.email) + '</b>. Only devices on this same license (same email, same license) can pair and sync with this one.</p>'
        : '<p class="hint" style="color:var(--warn,#c99a53)"><b>No active license on this device.</b> Activate it first: live sync works only between devices on the same license.</p>';
      var notice = s.notice
        ? '<div class="hint" id="ls-notice" style="color:' + (s.notice.kind === 'bad' ? 'var(--danger,#c0392b)' : 'var(--warn,#c99a53)') + '"><b>' + esc(s.notice.text) + '</b></div>' : '';
      var errs = Object.keys(s.errors || {}).map(function (k) { return '<div class="hint" style="color:var(--danger,#c0392b)">' + esc(k === 'tank' ? 'Tank Chief' : 'Voyage Chief') + ': ' + esc(s.errors[k]) + '</div>'; }).join('');
      host.innerHTML =
        '<div class="backup-section-head"><span class="backup-section-title">Live sync (Wi-Fi / hotspot) — all programs</span></div>' +
        '<p class="hint">Keep this device level with another one on the same Wi-Fi or phone hotspot: Tank Chief, Voyage Chief, and the other reports (requisitions, consumption plan, oil record book, e-ORB). Pair once; everything follows. The newest copy of a record wins, and nothing is deleted.</p>' +
        lic +
        '<label style="display:block;margin:6px 0"><input type="checkbox" id="ls-enabled" ' + (s.enabled ? 'checked' : '') + '> Sync automatically while both devices are open</label>' +
        '<div style="margin:6px 0;font-size:13px">' +
        '<label style="display:block"><input type="radio" name="ls-scope" value="active" ' + (!s.scopeAll ? 'checked' : '') + '> Only the vessel both devices have open</label>' +
        '<label style="display:block"><input type="radio" name="ls-scope" value="all" ' + (s.scopeAll ? 'checked' : '') + '> The whole database — a vessel or leg one device is missing is copied to it</label></div>' +
        '<div class="btn-row">' +
        '<button type="button" class="btn" id="ls-show-code">Show pairing code</button>' +
        '<button type="button" class="btn" id="ls-find">Find devices</button>' +
        '<button type="button" class="btn primary" id="ls-now">' + (s.busy ? esc(s.busy) : 'Sync now') + '</button></div>' +
        code +
        '<div id="ls-found" style="margin-top:8px">' + found + '</div>' +
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<input id="ls-url" placeholder="Address: http://192.168.43.1:8080" inputmode="url" autocapitalize="off" autocomplete="off" style="flex:1 1 100%;min-width:0">' +
        '<input id="ls-code" placeholder="Code" inputmode="numeric" maxlength="6" autocomplete="off" style="flex:1 1 120px;min-width:0">' +
        '<button type="button" class="btn" id="ls-pair-url">Pair</button></div>' +
        notice +
        '<div style="margin-top:10px">' + s.rows.map(rowHtml).join('') + '</div>' +
        peers + errs +
        '<p class="hint" style="margin-top:8px">Both devices must have the same vessel open for a vessel to sync. A phone always makes the connection; two PCs can each find the other. Bluetooth is not used.</p>';
      wire();
    }

    function wire() {
      var q = function (sel) { return host.querySelector(sel); };
      var act = async function (fn, okMsg) {
        if (busy) return;
        busy = true;
        try { var r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(msg(e)); } finally { busy = false; await reload(); }
      };
      q('#ls-enabled').onchange = function (e) { act(function () { return controller.setEnabled(e.target.checked); }); };
      host.querySelectorAll('input[name="ls-scope"]').forEach(function (r) {
        r.onchange = function () { act(function () { return controller.setScope(r.value === 'all'); }, r.value === 'all' ? 'The whole database will be kept level' : 'Only the shared vessel will be kept level'); };
      });
      q('#ls-show-code').onclick = function () { act(function () { return controller.showCode({}); }); };
      q('#ls-find').onclick = function () {
        act(async function () {
          toast('Looking for devices…');
          var f = await controller.find();
          if (!f.length) toast('Nobody found. Check both are on the same Wi-Fi or hotspot, or type the address.');
        });
      };
      q('#ls-now').onclick = function () { act(function () { return controller.syncNow(); }, 'Synced'); };
      q('#ls-pair-url').onclick = function () {
        act(async function () { var r = await controller.pair(q('#ls-url').value, q('#ls-code').value); toast(r.problems.length ? 'Paired, but ' + r.problems.join(' · ') : 'Paired'); });
      };
      host.querySelectorAll('[data-ls-pair]').forEach(function (b) {
        b.onclick = function () {
          var url = b.getAttribute('data-ls-pair');
          var code = host.querySelector('[data-ls-code="' + url + '"]').value;
          act(async function () { var r = await controller.pair(url, code); toast(r.problems.length ? 'Paired, but ' + r.problems.join(' · ') : 'Paired'); });
        };
      });
      host.querySelectorAll('[data-ls-forget]').forEach(function (b) {
        b.onclick = function () { act(function () { return controller.forget(b.getAttribute('data-ls-forget')); }, 'Forgotten'); };
      });
    }

    async function reload() {
      try { snap = await controller.refresh(); } catch (e) { snap = null; }
      if (!document.body.contains(host)) { controller.stop(); return; }
      draw();
    }

    reload();
    controller.start(5000);
    var redraw = setInterval(function () {
      if (!document.body.contains(host)) { clearInterval(redraw); controller.stop(); return; }
      if (busy || typing()) return;
      snap = controller.snapshot();
      draw();
    }, 4000);
    return { host: host, reload: reload, idleFor: function () { return Date.now() - lastInput; } };
  }

  var api = { create: create, mount: mount, tankRow: tankRow, voyageRow: voyageRow, miscRow: miscRow, randomCode: randomCode, LABEL: LABEL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChengLanSyncAll = api;
})(typeof window !== 'undefined' ? window : globalThis);
