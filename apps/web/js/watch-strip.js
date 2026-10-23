/* Watch strip — ship's clock, next port, ROB, sludge, weekly oil-record inventory.
   Reads the voyage database and the tank bundle already on this device. */
(function (root) {
  'use strict';

  const DB_NAME = 'noonReportDB';
  let timer = null;
  let snap = null;
  let sludgeLabel = '—';
  let weeklyLabel = '—';
  let weeklyWarn = false;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function b(s) {
    return '<b>' + esc(s) + '</b>';
  }
  function fmtMt(n) {
    if (n == null || isNaN(Number(n))) return '—';
    return Number(n).toFixed(3);
  }
  function shipNow(tzMin) {
    const tz = Number(tzMin);
    if (!isFinite(tz)) return null;
    return new Date(Date.now() + tz * 60000);
  }
  function clockText(tzMin) {
    const d = shipNow(tzMin);
    if (!d) return '—';
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const sign = tzMin >= 0 ? '+' : '−';
    const abs = Math.abs(Math.round(Number(tzMin)));
    const zh = String(Math.floor(abs / 60)).padStart(2, '0');
    const zm = abs % 60;
    return hh + ':' + mm + ' UTC' + sign + zh + (zm ? String(zm).padStart(2, '0') : '');
  }
  function shipDateIso(tzMin) {
    const d = shipNow(tzMin);
    if (!d) return new Date().toISOString().slice(0, 10);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function addDays(iso, days) {
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME);
      req.onerror = function () { reject(req.error || new Error('voyage db')); };
      req.onsuccess = function () { resolve(req.result); };
    });
  }
  function getAll(db, store) {
    return new Promise(function (resolve, reject) {
      if (!db.objectStoreNames.contains(store)) { resolve([]); return; }
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(req.result || []); };
    });
  }

  function robByGrade(snapshot) {
    const out = [];
    const tanks = (snapshot && snapshot.fuelTanks) || [];
    const rob = (snapshot && snapshot.robCurrent) || {};
    const totals = {};
    tanks.forEach(function (t) {
      const v = rob[t.id];
      if (v == null || isNaN(Number(v))) return;
      const g = t.grade || t.name || 'Fuel';
      totals[g] = (totals[g] || 0) + Number(v);
    });
    Object.keys(totals).forEach(function (g) {
      if (Math.abs(totals[g]) < 0.0005) return;
      out.push(g + ' ' + fmtMt(totals[g]));
    });
    return out;
  }

  function collectTanks(bundle) {
    const tanks = bundle && bundle.tanks;
    if (!tanks) return [];
    if (Array.isArray(tanks)) return tanks;
    const out = [];
    Object.keys(tanks).forEach(function (key) {
      if (Array.isArray(tanks[key])) out.push.apply(out, tanks[key]);
    });
    return out;
  }
  function readingFor(bundle, id) {
    const readings = bundle && bundle.readings;
    if (!readings || !id) return null;
    if (Array.isArray(readings)) {
      return readings.find(function (r) { return r && (r.tankId === id || r.id === id); }) || null;
    }
    return readings[id] || null;
  }
  function fillPct(tank, reading) {
    const result = (reading && (reading.result || reading)) || {};
    if (result.fillPct != null && isFinite(Number(result.fillPct))) return Number(result.fillPct);
    const vol = Number(result.volumeObserved);
    const cap = Number(tank && tank.capacity && (tank.capacity.m3 || tank.capacity.volume || tank.capacity));
    const capN = isFinite(cap) ? cap : Number(tank && tank.capacityM3);
    if (isFinite(vol) && isFinite(capN) && capN > 0) return (vol / capN) * 100;
    return null;
  }
  function sludgeText(bundle) {
    const tanks = collectTanks(bundle).filter(function (t) {
      const name = String((t && (t.name || t.id)) || '').toLowerCase();
      return /sludge/.test(name);
    });
    if (!tanks.length) return 'No sludge tank';
    return tanks.map(function (t) {
      const pct = fillPct(t, readingFor(bundle, t.id));
      const name = t.name || 'Sludge';
      return pct == null ? name : name + ' ' + Math.round(pct) + '%';
    }).join(' · ');
  }

  async function loadWeekly(registryId, tzMin) {
    let db;
    try { db = await openDb(); }
    catch (_) { return { text: 'Oil record book not opened yet', warn: false }; }
    try {
      const rows = await getAll(db, 'orbEntries');
      const mine = (rows || []).filter(function (e) {
        if (!e || e.voided) return false;
        if (e.scenarioId !== 'weekly-sludge-bilge') return false;
        if (registryId && e.vesselId && e.vesselId !== registryId) return false;
        return !!e.date;
      });
      mine.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      if (!mine.length) return { text: 'Weekly inventory not recorded', warn: false };
      const last = String(mine[0].date).slice(0, 10);
      const due = addDays(last, 7);
      const today = shipDateIso(tzMin);
      const overdue = due && today > due;
      return {
        text: overdue
          ? 'Weekly inventory overdue · last ' + last
          : 'Weekly inventory in date · last ' + last,
        warn: overdue,
      };
    } catch (_) {
      return { text: 'Weekly inventory unread', warn: false };
    } finally {
      try { db.close(); } catch (_) {}
    }
  }

  function paint() {
    const host = document.getElementById('watchStrip');
    if (!host) return;
    const tz = snap && snap.lastTzOffsetMin != null ? snap.lastTzOffsetMin : null;
    const clock = tz == null ? 'Set a log entry' : clockText(tz);
    const port = snap && snap.ok
      ? ((snap.departPort || 'Departure') + ' → ' + (snap.arrivePort || 'Arrival'))
      : 'No voyage yet';
    const rob = snap && snap.ok ? robByGrade(snap) : [];
    const robHtml = rob.length ? rob.map(function (part) {
      const bits = part.split(' ');
      const n = bits.pop();
      return esc(bits.join(' ')) + ' ' + b(n);
    }).join(' · ') : '—';
    host.innerHTML = [
      item('Ship', b(clock), false),
      item('Next', esc(port), false),
      item('ROB MT', robHtml, false),
      item('Sludge', esc(sludgeLabel), false),
      item('e-ORB', esc(weeklyLabel), weeklyWarn),
    ].join('');
    host.hidden = false;
  }
  function item(k, vHtml, warn) {
    return '<span class="ws-item' + (warn ? ' ws-warn' : '') + '"><span class="ws-k">' + esc(k) + '</span><span class="ws-v">' + vHtml + '</span></span>';
  }

  async function refresh() {
    const active = root.ChengPro && ChengPro.vessel && ChengPro.vessel.getActive && ChengPro.vessel.getActive();
    if (root.ChengProVoyageBridge && typeof ChengProVoyageBridge.readHomeSnapshot === 'function') {
      try { snap = await ChengProVoyageBridge.readHomeSnapshot(active); }
      catch (_) { snap = null; }
    }
    const tz = snap && snap.lastTzOffsetMin;
    const regId = snap && snap.registry && snap.registry.id;
    const weekly = await loadWeekly(regId, tz);
    weeklyLabel = weekly.text;
    weeklyWarn = !!weekly.warn;
    sludgeLabel = '—';
    if (active && typeof loadTankBundleForActive === 'function') {
      try {
        const bundle = await loadTankBundleForActive(active);
        sludgeLabel = bundle ? sludgeText(bundle) : 'Open Tank Chief once';
      } catch (_) {
        sludgeLabel = 'Tank data unread';
      }
    }
    paint();
  }

  function start() {
    refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(function () { paint(); }, 15000);
    setInterval(refresh, 60000);
  }

  root.ChengWatchStrip = { start: start, refresh: refresh, paint: paint };
})(window);
