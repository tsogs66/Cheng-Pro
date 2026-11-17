/*
 * Compare this device with a paired one, item by item, and move only what the person ticks.
 *
 * No server is involved. Tank Chief's engine (on each device) lists vessels and moves them. Voyage Chief and
 * the other reports (requisitions, plan snapshots, e-ORB) live inside the app, so the other device's app is
 * asked through Tank's engine ("ask"), and answers with a list or the records themselves.
 *
 * A row is one thing that differs: { key, program, item, vessel, mine, theirs, suggest, options, note }.
 * `suggest` is pull (take theirs), push (send mine), both, or skip (cannot be moved, see `note`).
 *
 * Pure functions are exported for tests; create(deps) does the talking:
 *   deps.tank(path, init)            this device's Tank engine (HTTP or in-app)
 *   deps.voyage(action, extra)       this device's Voyage Chief, returns {payload}
 */
(function (root) {
  'use strict';

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function hullKey(h) { h = h || {}; return String(h.imo || '').trim() || norm(h.name); }
  function sameHull(a, b) {
    a = a || {}; b = b || {};
    var ai = String(a.imo || '').trim(), bi = String(b.imo || '').trim();
    if (ai && bi) return ai === bi;
    return !!norm(a.name) && norm(a.name) === norm(b.name);
  }
  function when(iso) {
    if (!iso) return 'no date';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso).slice(0, 16) : d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
  function newer(a, b) { return a > b ? 1 : a < b ? -1 : 0; }

  /** Voyage legs: one row per voyage + condition that is on one device only, or differs. */
  function compareVoyage(mine, theirs) {
    var rows = [];
    var same = 0;
    if (!mine || !theirs) return { rows: rows, same: same };
    var theirVessels = theirs.vessels || [];
    var myVessels = mine.vessels || [];
    function map(list) {
      var m = {};
      (list || []).forEach(function (l) { m[hullKey(l.hull) + '|' + norm(l.voyage) + '|' + l.condition] = l; });
      return m;
    }
    var a = map(mine.legs), b = map(theirs.legs);
    var keys = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).sort().forEach(function (k) {
      var m = a[k], t = b[k];
      var src = m || t;
      var label = 'Voyage ' + (src.voyage || '?') + ' · ' + (src.condition === 'L' ? 'Laden' : 'Ballast');
      var vessel = src.hull && src.hull.name || '';
      var row = { key: 'leg:' + k, program: 'Voyage Chief', kind: 'leg', item: label, vessel: vessel, ref: { mineId: m && m.id, theirId: t && t.id, hull: src.hull } };
      if (m && t) {
        var c = newer(m.stamp || '', t.stamp || '');
        if (!c && m.entries === t.entries) { same += 1; return; }
        if (!c) c = m.entries > t.entries ? 1 : m.entries < t.entries ? -1 : 0;
        row.mine = (m.entries || 0) + ' entries, last ' + when(m.stamp);
        row.theirs = (t.entries || 0) + ' entries, last ' + when(t.stamp);
        row.suggest = c > 0 ? 'push' : 'pull';
        row.options = ['pull', 'push'];
      } else if (m) {
        row.mine = (m.entries || 0) + ' entries, last ' + when(m.stamp);
        row.theirs = '—';
        if (!theirVessels.some(function (v) { return sameHull(v, m.hull); })) { row.suggest = 'skip'; row.options = []; row.note = 'This vessel is not on the other device'; }
        else { row.suggest = 'push'; row.options = ['push']; }
      } else {
        row.mine = '—';
        row.theirs = (t.entries || 0) + ' entries, last ' + when(t.stamp);
        if (!myVessels.some(function (v) { return sameHull(v, t.hull); })) { row.suggest = 'skip'; row.options = []; row.note = 'This vessel is not on this device'; }
        else { row.suggest = 'pull'; row.options = ['pull']; }
      }
      rows.push(row);
    });
    return { rows: rows, same: same };
  }

  var MISC_LABEL = { requisitions: 'Requisitions', plans: 'Consumption plan snapshots', orb: 'e-ORB entries' };

  /** Other reports of the vessel open in Voyage Chief on both devices. */
  function compareMisc(mine, theirs) {
    var rows = [];
    var same = 0;
    var a = mine && mine.misc, b = theirs && theirs.misc;
    if (!a || !b) return { rows: rows, same: same, note: !a ? 'No vessel is open in Voyage Chief on this device, so requisitions, plan snapshots and e-ORB were not compared.' : !b ? 'No vessel is open in Voyage Chief on the other device, so requisitions, plan snapshots and e-ORB were not compared.' : '' };
    if (!sameHull(a.hull, b.hull)) {
      return { rows: rows, same: same, note: 'Voyage Chief has ' + ((a.hull && a.hull.name) || 'one vessel') + ' open here and ' + ((b.hull && b.hull.name) || 'another') + ' on the other device. Open the same vessel on both to compare requisitions, plan snapshots and e-ORB.' };
    }
    Object.keys(MISC_LABEL).forEach(function (cat) {
      var m = a.categories[cat], t = b.categories[cat];
      if (!m || !t) return;
      if (m.count === t.count && (m.stamp || '') === (t.stamp || '')) { same += 1; return; }
      var c = newer(m.stamp || '', t.stamp || '');
      if (!c) c = m.count > t.count ? 1 : m.count < t.count ? -1 : 0;
      rows.push({
        key: 'misc:' + cat, program: 'Other reports', kind: 'misc', item: MISC_LABEL[cat], vessel: (a.hull && a.hull.name) || '',
        mine: m.count + ' · last ' + when(m.stamp), theirs: t.count + ' · last ' + when(t.stamp),
        suggest: c > 0 ? 'push' : c < 0 ? 'pull' : 'both', options: ['pull', 'push', 'both'], ref: { category: cat }
      });
    });
    return { rows: rows, same: same, note: '' };
  }

  function tankRows(out) {
    return ((out && out.rows) || []).map(function (r) {
      var rev = function (x) { return x ? 'saved ' + x.revision + ' times' : '—'; };
      return {
        key: r.key, program: 'Tank Chief', kind: 'tank', item: 'Vessel records, soundings, reports', vessel: r.name,
        mine: rev(r.mine), theirs: rev(r.theirs), suggest: r.suggest,
        options: !r.theirs ? ['push'] : !r.mine ? ['pull'] : ['pull', 'push', 'both'],
        ref: { vesselId: r.vesselId, peerId: r.peerId }
      };
    });
  }

  function msg(e) { return (e && e.message) || String(e || 'Failed'); }

  function create(deps) {
    var st = { deviceId: '', device: '', rows: [], same: 0, notes: [], checkedAt: null, busy: '' };

    async function ask(deviceId, op, args) {
      var out = await deps.tank('/api/lan/peer-ask', { method: 'POST', body: { deviceId: deviceId, op: op, args: args == null ? null : args } });
      return out && out.result;
    }
    async function mineVoyage(action, extra) {
      var r = await deps.voyage(action, extra || {});
      return r && r.payload !== undefined ? r.payload : r;
    }

    /** Build the list. Each program is asked separately so one that does not answer does not hide the others. */
    async function compare(deviceId) {
      st.busy = 'Checking…';
      st.deviceId = deviceId; st.rows = []; st.notes = []; st.same = 0;
      try {
        try {
          var t = await deps.tank('/api/lan/compare', { method: 'POST', body: { deviceId: deviceId } });
          st.device = t.peer || st.device;
          st.rows = st.rows.concat(tankRows(t));
          st.same += t.same || 0;
        } catch (e) { st.notes.push('Tank Chief: ' + msg(e)); }
        var mine = null, theirs = null;
        try { mine = await mineVoyage('p2p-manifest'); } catch (e) { st.notes.push('Voyage Chief on this device: ' + msg(e)); }
        if (mine) {
          try { theirs = await ask(deviceId, 'p2p-manifest'); } catch (e) { st.notes.push('Voyage Chief on the other device: ' + msg(e)); }
        }
        if (mine && theirs) {
          var v = compareVoyage(mine, theirs);
          st.rows = st.rows.concat(v.rows); st.same += v.same;
          var m = compareMisc(mine, theirs);
          st.rows = st.rows.concat(m.rows); st.same += m.same;
          if (m.note) st.notes.push(m.note);
        }
        st.checkedAt = new Date().toISOString();
      } finally { st.busy = ''; }
      return snapshot();
    }

    /** Move what was ticked. picks: [{key, action}] with action pull | push | both. */
    async function apply(picks) {
      var byKey = {}; st.rows.forEach(function (r) { byKey[r.key] = r; });
      var jobs = (picks || []).map(function (p) { return { row: byKey[p.key], action: p.action }; })
        .filter(function (j) { return j.row && j.action && j.action !== 'skip' && j.row.options.indexOf(j.action) >= 0; });
      var result = { done: 0, failed: [] };
      st.busy = 'Copying…';
      try {
        /* Tank Chief: one call, the engine does each vessel. */
        var tank = jobs.filter(function (j) { return j.row.kind === 'tank'; });
        if (tank.length) {
          try {
            var o = await deps.tank('/api/lan/apply-selected', { method: 'POST', body: { deviceId: st.deviceId, items: tank.map(function (j) { return { key: j.row.key, vesselId: j.row.ref.vesselId, peerId: j.row.ref.peerId, action: j.action }; }) } });
            result.done += (o.done || []).length;
            (o.failed || []).forEach(function (f) { result.failed.push('Tank Chief: ' + f.error); });
          } catch (e) { result.failed.push('Tank Chief: ' + msg(e)); }
        }
        /* Voyage legs: "both" is not offered (a leg is replaced by the newer copy), so each is a pull or a push. */
        var legs = jobs.filter(function (j) { return j.row.kind === 'leg'; });
        var pull = legs.filter(function (j) { return j.action === 'pull'; });
        var push = legs.filter(function (j) { return j.action === 'push'; });
        if (pull.length) {
          try {
            var got = await ask(st.deviceId, 'p2p-legs', { ids: pull.map(function (j) { return j.row.ref.theirId; }) });
            var r1 = await mineVoyage('p2p-apply', { payload: { legs: got || [] } });
            result.done += (r1 && r1.legs && r1.legs.done) || 0;
            ((r1 && r1.legs && r1.legs.problems) || []).forEach(function (p) { result.failed.push('Voyage Chief: ' + p); });
          } catch (e) { result.failed.push('Voyage Chief (pull): ' + msg(e)); }
        }
        if (push.length) {
          try {
            var mineLegs = await mineVoyage('p2p-legs', { ids: push.map(function (j) { return j.row.ref.mineId; }) });
            var r2 = await ask(st.deviceId, 'p2p-apply', { legs: mineLegs || [] });
            result.done += (r2 && r2.legs && r2.legs.done) || 0;
            ((r2 && r2.legs && r2.legs.problems) || []).forEach(function (p) { result.failed.push('Voyage Chief: ' + p); });
          } catch (e) { result.failed.push('Voyage Chief (push): ' + msg(e)); }
        }
        /* Other reports: pulls and pushes by category. */
        var misc = jobs.filter(function (j) { return j.row.kind === 'misc'; });
        var mPull = misc.filter(function (j) { return j.action === 'pull' || j.action === 'both'; }).map(function (j) { return j.row.ref.category; });
        var mPush = misc.filter(function (j) { return j.action === 'push' || j.action === 'both'; }).map(function (j) { return j.row.ref.category; });
        if (mPull.length) {
          try {
            var remote = await ask(st.deviceId, 'p2p-misc');
            await mineVoyage('p2p-apply', { payload: { misc: remote, categories: mPull } });
            result.done += mPull.length;
          } catch (e) { result.failed.push('Other reports (pull): ' + msg(e)); }
        }
        if (mPush.length) {
          try {
            var mineMisc = await mineVoyage('p2p-misc');
            await ask(st.deviceId, 'p2p-apply', { misc: mineMisc, categories: mPush });
            result.done += mPush.length;
          } catch (e) { result.failed.push('Other reports (push): ' + msg(e)); }
        }
      } finally { st.busy = ''; }
      await compare(st.deviceId);
      return result;
    }

    function snapshot() { return { deviceId: st.deviceId, device: st.device, rows: st.rows, same: st.same, notes: st.notes, checkedAt: st.checkedAt, busy: st.busy }; }
    return { compare: compare, apply: apply, snapshot: snapshot };
  }

  /**
   * The other side of "ask": this device's app answers what the paired device asks of Voyage Chief.
   * deps.tank(path, init) reaches this device's engine; deps.voyage(action, extra) this device's Voyage Chief.
   */
  var OPS = {
    'p2p-manifest': function () { return {}; },
    'p2p-legs': function (a) { return { ids: (a && a.ids) || [] }; },
    'p2p-misc': function () { return {}; },
    'p2p-apply': function (a) { return { payload: a || {} }; }
  };
  async function answerPending(deps) {
    var pend = await deps.tank('/api/lan/pending');
    var asks = (pend && pend.asks) || [];
    for (var i = 0; i < asks.length; i++) {
      var a = asks[i];
      try {
        if (!OPS[a.op]) throw new Error('This version cannot do that');
        var r = await deps.voyage(a.op, OPS[a.op](a.args));
        await deps.tank('/api/lan/answer', { method: 'POST', body: { id: a.id, result: r && r.payload !== undefined ? r.payload : r } });
      } catch (e) {
        await deps.tank('/api/lan/answer', { method: 'POST', body: { id: a.id, error: msg(e) } }).catch(function () {});
      }
    }
    return asks.length;
  }

  var api = { create: create, answerPending: answerPending, compareVoyage: compareVoyage, compareMisc: compareMisc, tankRows: tankRows, sameHull: sameHull };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChengLanCompare = api;
})(typeof window !== 'undefined' ? window : globalThis);
