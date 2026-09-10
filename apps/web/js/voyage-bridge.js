/**
 * Bridge Voyage Chief (IndexedDB noonReportDB) ↔ Cheng-Pro shared vessel.json.
 * Same Capacitor origin on Android, so the shell can read Voyage’s on-device data.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'noonReportDB';
  const HINT_KEY = 'chengProVoyageActiveHint';
  const AUTO_FLAG = 'chengProVoyageImportDone';

  const ENGINE_KEYS = [
    'mcrRpm', 'mcrKw', 'csrRpm', 'csrKw', 'pitch',
    'sfoc100', 'sfoc85', 'lcvRef', 'lcvActual', 'slocRef',
    'mechEff', 'fuelDensity', 'lubeDensity', 'propLawExp',
  ];

  /**
   * Strip common ship-name prefixes so "MV FOO", "M/V FOO", and "M.V. FOO" match.
   * Repeated prefixes are removed (e.g. "MV M/V FOO" → "FOO").
   */
  function stripShipNamePrefix(name) {
    let s = String(name || '').trim();
    let prev = '';
    while (s !== prev) {
      prev = s;
      s = s.replace(/^(m\s*[./]?\s*v\.?)\s+/i, '').trim();
    }
    return s;
  }

  function normalizeVesselName(name) {
    return stripShipNamePrefix(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(name) {
    const core = stripShipNamePrefix(name) || String(name || 'vessel');
    return String(core)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'vessel';
  }

  function normalizeImo(imo) {
    return String(imo || '').replace(/^IMO\s*/i, '').replace(/\D/g, '').trim();
  }

  /** Match Voyage Chief: ignore bogus clock changes larger than 3 h. */
  function sanitizeClockChangeMin(min) {
    const n = Number(min);
    if (!isFinite(n) || n === 0) return 0;
    if (Math.abs(n) > 180) return 0;
    return n;
  }

  /**
   * Actual hours between two ship's-clock stamps (clocks advanced are subtracted).
   * Same rule as Voyage Chief / ShipTime.elapsedShipHours.
   */
  function elapsedShipHours(prevDt, curDt, clockChangeMin) {
    if (root.ShipTime && typeof root.ShipTime.elapsedShipHours === 'function') {
      return root.ShipTime.elapsedShipHours(prevDt, curDt, clockChangeMin);
    }
    if (!prevDt || !curDt) return null;
    const naive = (new Date(curDt) - new Date(prevDt)) / 3600000;
    if (!isFinite(naive)) return null;
    const adj = naive - sanitizeClockChangeMin(clockChangeMin) / 60;
    return adj > 0 ? adj : null;
  }

  /**
   * Days at Sea / Days To Go / ETA — same formulas as Voyage Summary progress strip.
   */
  function computeVoyageProgressMetrics(setup, entries) {
    const list = Array.isArray(entries) ? entries : [];
    let traveled = 0;
    for (const e of list) traveled += Number(e && e.distanceShip) || 0;

    let prevDt = null;
    if (list.length && setup && setup.carryover && setup.carryover.datetime) {
      prevDt = setup.carryover.datetime;
    } else if (setup && setup.initDateTime) {
      prevDt = setup.initDateTime;
    }

    let totalHrs = 0;
    let lastPeriodHrs = null;
    let lastDistance = null;
    for (const e of list) {
      if (!e || !e.datetime) continue;
      if (prevDt) {
        const hrs = elapsedShipHours(prevDt, e.datetime, e.clockChangeMin);
        if (hrs != null && hrs > 0) {
          totalHrs += hrs;
          lastPeriodHrs = hrs;
          lastDistance = Number(e.distanceShip) || 0;
        }
      }
      prevDt = e.datetime;
    }

    const avgSpeed = totalHrs > 0 ? traveled / totalHrs : null;
    let lastSpeed = null;
    if (lastPeriodHrs > 0) lastSpeed = lastDistance / lastPeriodHrs;
    else if (list.length && list[list.length - 1].speedShip != null) {
      lastSpeed = Number(list[list.length - 1].speedShip);
    }

    const totalDistance = setup && setup.voyageDistance != null && setup.voyageDistance !== ''
      ? Number(setup.voyageDistance)
      : null;
    const daysAtSea = totalHrs / 24;
    let distToGo = null;
    let daysToGo = null;
    let etaIso = null;
    let etaLabel = null;
    if (list.length && totalDistance != null && isFinite(totalDistance) && totalDistance > 0) {
      distToGo = totalDistance - traveled;
      const last = list[list.length - 1];
      const refSpeed = (lastSpeed != null && lastSpeed > 0) ? lastSpeed : avgSpeed;
      if (refSpeed > 0) {
        daysToGo = (distToGo / refSpeed) / 24;
        if (last && last.datetime) {
          const eta = new Date(new Date(last.datetime).getTime() + daysToGo * 24 * 3600000);
          if (!isNaN(eta.getTime())) {
            etaIso = eta.toISOString();
            etaLabel = eta.toLocaleString(undefined, {
              year: 'numeric', month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            });
          }
        }
      }
    }

    return {
      traveled,
      totalDistance: totalDistance != null && isFinite(totalDistance) && totalDistance > 0
        ? totalDistance
        : null,
      totalHrs,
      daysAtSea,
      distToGo,
      daysToGo,
      etaIso,
      etaLabel,
      lastSpeed,
      avgSpeed,
    };
  }

  /**
   * Open Voyage's DB read-only without creating/upgrading schema.
   * Never pass a version here: opening at v6 with an empty onupgradeneeded
   * created an empty noonReportDB and broke Voyage login (missing object stores).
   */
  function openVoyageDb() {
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME);
      } catch (err) {
        reject(err);
        return;
      }
      req.onerror = () => reject(req.error || new Error('Could not open Voyage Chief database'));
      req.onupgradeneeded = (e) => {
        // Abort creating a blank DB — Voyage Chief owns schema creation.
        try { e.target.transaction.abort(); } catch { /* ignore */ }
        reject(new Error('Voyage Chief database not initialized yet'));
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) {
          try { db.close(); } catch { /* ignore */ }
          reject(new Error('Voyage Chief database not initialized yet'));
          return;
        }
        resolve(db);
      };
    });
  }

  function idbGetAll(db, storeName) {
    return new Promise((resolve, reject) => {
      try {
        if (!db.objectStoreNames.contains(storeName)) {
          resolve([]);
          return;
        }
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function idbPut(db, storeName, value) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function formatShipType(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    if (v === 'tanker') return 'Oil tanker';
    if (v === 'other') return 'Cargo / other';
    return v;
  }

  function mapSetupToPatch(setup, registry) {
    const s = setup || {};
    const orb = s.orb || {};
    const name = (s.vesselName || orb.shipName || registry?.name || '').trim() || 'Vessel';
    const patch = {
      name,
      imo: normalizeImo(s.imoNo || orb.imo),
      callSign: String(s.callSign || orb.callSign || '').trim(),
      flag: String(s.flag || orb.flag || '').trim(),
      company: String(s.company || orb.company || '').trim(),
      type: formatShipType(s.shipType || s.type || s.ciiShipType || orb.shipType),
      dwt: s.dwt != null && s.dwt !== '' ? String(s.dwt) : (orb.dwt != null ? String(orb.dwt) : ''),
      notes: s.notes || '',
      voyageRegistryId: registry?.id || null,
      voyageSlug: registry?.slug || s.sync?.vesselId || slugify(name),
    };
    for (const key of ENGINE_KEYS) {
      if (s[key] != null && s[key] !== '') patch[key] = s[key];
    }
    return patch;
  }

  async function readVoyageFleet() {
    let db;
    try {
      db = await openVoyageDb();
    } catch {
      return { vessels: [], activeId: null, credentials: readVoyageCredentials() };
    }
    try {
      const meta = await idbGetAll(db, 'meta');
      const byKey = new Map(meta.map((row) => [row.key, row.value]));
      const vessels = Array.isArray(byKey.get('vessels')) ? byKey.get('vessels') : [];
      const activeId = byKey.get('activeVesselId') || null;
      const rows = [];
      for (const reg of vessels) {
        if (!reg || !reg.id) continue;
        const setup = byKey.get(`setup:${reg.id}`) || (reg.id === activeId ? byKey.get('setup') : null) || {};
        rows.push({ registry: reg, setup, patch: mapSetupToPatch(setup, reg) });
      }
      if (!rows.length && byKey.get('setup')) {
        const setup = byKey.get('setup');
        const name = setup.vesselName || 'Vessel';
        const reg = { id: 'legacy', name, slug: slugify(name) };
        rows.push({ registry: reg, setup, patch: mapSetupToPatch(setup, reg) });
      }
      return { vessels: rows, activeId, credentials: readVoyageCredentials() };
    } finally {
      try { db.close(); } catch { /* ignore */ }
    }
  }

  function readVoyageCredentials() {
    try {
      const raw = localStorage.getItem('noonReportSyncCredentials');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function readActiveHint() {
    try {
      const raw = localStorage.getItem(HINT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeActiveHint(hint) {
    try {
      localStorage.setItem(HINT_KEY, JSON.stringify(hint));
    } catch { /* ignore */ }
  }

  function findMatch(list, patch) {
    const imo = normalizeImo(patch.imo);
    const slug = patch.voyageSlug || slugify(patch.name);
    const slugCore = slugify(patch.name);
    /* 1) IMO is authoritative when both sides have it. */
    if (imo) {
      const byImo = list.find((v) => normalizeImo(v.imo) === imo);
      if (byImo) return byImo;
    }
    /* 2) Slug / folder id (MV vs M/V now slugify to the same core). */
    const bySlug = list.find((v) =>
      v.id === slug || v.id === slugCore
      || v.voyageSlug === slug || v.voyageSlug === slugCore
    );
    if (bySlug) return bySlug;
    /* 3) Voyage registry id when present. */
    const byVoyageId = list.find((v) => v.voyageRegistryId && v.voyageRegistryId === patch.voyageRegistryId);
    if (byVoyageId) return byVoyageId;
    /* 4) Name ignoring MV / M/V / M.V. prefixes and punctuation. */
    const nameKey = normalizeVesselName(patch.name);
    if (nameKey) {
      const byName = list.find((v) => normalizeVesselName(v.name) === nameKey);
      if (byName) return byName;
    }
    return null;
  }

  async function importIntoChengPro(options = {}) {
    const api = root.ChengPro && root.ChengPro.api;
    if (!api || !api.fetch) throw new Error('Cheng-Pro API not ready');

    const fleet = await readVoyageFleet();
    if (!fleet.vessels.length) {
      const hint = readActiveHint();
      if (hint && (hint.name || hint.imo)) {
        fleet.vessels.push({
          registry: { id: hint.voyageId || 'hint', name: hint.name, slug: hint.slug },
          setup: hint,
          patch: mapSetupToPatch(hint, { id: hint.voyageId, name: hint.name, slug: hint.slug }),
        });
      }
    }
    if (!fleet.vessels.length) {
      return { ok: false, imported: 0, updated: 0, message: 'No Voyage Chief vessels found on this device. Open Voyage Chief once, then import again.' };
    }

    let listRes;
    try {
      listRes = await api.fetch('/api/shell/vessels');
    } catch (err) {
      throw new Error(err.message || 'Could not list Cheng-Pro vessels');
    }
    const existing = listRes.vessels || [];
    let imported = 0;
    let updated = 0;
    let activeId = null;
    const details = [];

    for (const row of fleet.vessels) {
      const patch = { ...row.patch };
      const preferredId = patch.voyageSlug || slugify(patch.name);
      const match = findMatch(existing, patch);
      try {
        if (match) {
          const saved = await api.fetch('/api/shell/vessels/' + encodeURIComponent(match.id), {
            method: 'PUT',
            body: JSON.stringify(patch),
          });
          updated += 1;
          details.push({ id: saved.id || match.id, name: patch.name, action: 'updated' });
          if (fleet.activeId && (row.registry.id === fleet.activeId || row.registry.slug === fleet.activeId)) {
            activeId = saved.id || match.id;
          }
          // refresh local match list
          const idx = existing.findIndex((v) => v.id === match.id);
          if (idx >= 0) existing[idx] = { ...existing[idx], ...patch, id: match.id };
        } else {
          const created = await api.fetch('/api/shell/vessels', {
            method: 'POST',
            body: JSON.stringify({ ...patch, id: preferredId }),
          });
          imported += 1;
          details.push({ id: created.id, name: patch.name, action: 'created' });
          existing.push(created);
          if (fleet.activeId && (row.registry.id === fleet.activeId || row.registry.slug === fleet.activeId)) {
            activeId = created.id;
          }
          if (!activeId) activeId = created.id;
        }
      } catch (err) {
        details.push({ name: patch.name, action: 'error', error: err.message });
      }
    }

    if (options.setActive !== false) {
      const hint = readActiveHint();
      if (!activeId && hint) {
        const m = findMatch(existing, mapSetupToPatch(hint, hint));
        if (m) activeId = m.id;
      }
      if (!activeId && existing.length) activeId = existing[0].id;
      if (activeId && root.ChengPro?.vessel?.setActive) {
        try { await root.ChengPro.vessel.setActive(activeId); } catch { /* ignore */ }
      } else if (activeId) {
        try {
          await api.fetch('/api/shell/vessels/active', {
            method: 'POST',
            body: JSON.stringify({ id: activeId }),
          });
        } catch { /* ignore */ }
      }
    }

    try { localStorage.setItem(AUTO_FLAG, new Date().toISOString()); } catch { /* ignore */ }

    return {
      ok: true,
      imported,
      updated,
      activeId,
      details,
      message: `Imported ${imported} new, updated ${updated} from Voyage Chief.`,
    };
  }

  /** Push Cheng-Pro vessel identity/engine into Voyage setup for the matching ship. */
  async function exportVesselToVoyage(vessel) {
    if (!vessel || !vessel.name) return { ok: false, message: 'No vessel to export' };
    let db;
    try {
      db = await openVoyageDb();
    } catch {
      return { ok: false, message: 'Open Voyage Chief once before pushing vessel data back.' };
    }
    try {
      const meta = await idbGetAll(db, 'meta');
      const byKey = new Map(meta.map((row) => [row.key, row.value]));
      const vessels = Array.isArray(byKey.get('vessels')) ? byKey.get('vessels') : [];
      const imo = normalizeImo(vessel.imo);
      let reg = vessels.find((v) =>
        v.id === vessel.voyageRegistryId
        || v.slug === vessel.voyageSlug
        || v.slug === vessel.id
        || v.slug === slugify(vessel.name)
      );
      if (!reg && imo) {
        for (const v of vessels) {
          const setup = byKey.get(`setup:${v.id}`) || {};
          if (normalizeImo(setup.imoNo) === imo || normalizeImo(setup.orb && setup.orb.imo) === imo) {
            reg = v;
            break;
          }
        }
      }
      if (!reg) {
        const nameKey = normalizeVesselName(vessel.name);
        reg = vessels.find((v) => normalizeVesselName(v.name) === nameKey) || null;
      }
      if (!reg) {
        reg = {
          id: 'v-' + slugify(vessel.name).slice(0, 20),
          name: vessel.name,
          slug: vessel.voyageSlug || vessel.id || slugify(vessel.name),
          createdAt: new Date().toISOString(),
        };
        vessels.push(reg);
        await idbPut(db, 'meta', { key: 'vessels', value: vessels });
      }

      const setupKey = `setup:${reg.id}`;
      const setup = { ...(byKey.get(setupKey) || byKey.get('setup') || {}) };
      setup.vesselName = vessel.name;
      setup.imoNo = vessel.imo || setup.imoNo || '';
      setup.callSign = vessel.callSign || setup.callSign || '';
      setup.flag = vessel.flag || '';
      setup.company = vessel.company || vessel.owner || '';
      setup.dwt = vessel.dwt !== '' && vessel.dwt != null ? vessel.dwt : setup.dwt;
      if (!setup.orb) setup.orb = {};
      if (vessel.callSign) setup.orb.callSign = vessel.callSign;
      if (vessel.name) setup.orb.shipName = vessel.name;
      if (vessel.imo) setup.orb.imo = vessel.imo;
      if (vessel.flag) setup.orb.flag = vessel.flag;
      for (const key of ENGINE_KEYS) {
        if (vessel[key] != null && vessel[key] !== '') setup[key] = vessel[key];
      }
      if (!setup.sync) setup.sync = {};
      setup.sync.vesselId = setup.sync.vesselId || reg.slug || vessel.id;
      await idbPut(db, 'meta', { key: setupKey, value: setup });
      writeActiveHint({
        voyageId: reg.id,
        slug: reg.slug,
        name: vessel.name,
        imo: vessel.imo,
        company: vessel.company,
        flag: vessel.flag,
        dwt: vessel.dwt,
        ...Object.fromEntries(ENGINE_KEYS.map((k) => [k, vessel[k]])),
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, voyageId: reg.id, message: 'Pushed identity & engine data into Voyage Chief on this device.' };
    } finally {
      try { db.close(); } catch { /* ignore */ }
    }
  }

  function profileFieldEmpty(vessel, key) {
    if (!vessel) return true;
    const v = vessel[key];
    if (key === 'company') {
      const c = vessel.company || vessel.owner;
      return c == null || String(c).trim() === '';
    }
    return v == null || String(v).trim() === '';
  }

  function patchHasRicherIdentity(stored, patch) {
    const keys = ['callSign', 'flag', 'company', 'type', 'dwt', 'mcrRpm', 'mcrKw', 'pitch'];
    return keys.some((k) => {
      const pv = patch[k];
      if (pv == null || String(pv).trim() === '') return false;
      return profileFieldEmpty(stored, k);
    });
  }

  async function profileNeedsRefresh(list, fleet) {
    for (const row of fleet.vessels) {
      const match = findMatch(list, row.patch);
      if (!match) return true;
      let vessel = null;
      try {
        const data = await root.ChengPro.api.fetch('/api/shell/vessels/' + encodeURIComponent(match.id));
        vessel = data && data.vessel;
      } catch { /* treat as needs refresh */ return true; }
      if (patchHasRicherIdentity(vessel, row.patch)) return true;
    }
    return false;
  }

  async function autoImportIfNeeded() {
    try {
      const fleet = await readVoyageFleet();
      if (!fleet.vessels.length && !readActiveHint()) return null;
      let list = root.ChengPro?.vessel?.getListSync?.() || [];
      if (!list.length && root.ChengPro?.vessel?.refresh) {
        try {
          await root.ChengPro.vessel.refresh();
          list = root.ChengPro.vessel.getListSync?.() || [];
        } catch { /* import can still create */ }
      }
      const already = localStorage.getItem(AUTO_FLAG);
      const missing = fleet.vessels.some((row) => !findMatch(list, row.patch));
      const refresh = await profileNeedsRefresh(list, fleet);
      if (missing || !list.length || !already || refresh) {
        return importIntoChengPro({ setActive: !list.length });
      }
    } catch (err) {
      console.warn('Voyage→Cheng-Pro auto-import skipped:', err.message);
    }
    return null;
  }

  /**
   * Lightweight voyage snapshot for the AIO Home dashboard (progress + opening ROB gauges).
   * Does not re-run Voyage's full computeDerived chain — gauges use opening ROB vs capacity;
   * when a bunker survey measured map exists on the latest entry, that becomes current ROB.
   */
  async function readHomeSnapshot(activeVessel) {
    const empty = {
      ok: false,
      setup: null,
      entries: [],
      traveled: 0,
      totalDistance: null,
      weather: null,
      fuelTanks: [],
      capacity: {},
      robStart: {},
      robCurrent: {},
    };
    let db;
    try {
      db = await openVoyageDb();
    } catch {
      return empty;
    }
    try {
      const meta = await idbGetAll(db, 'meta');
      const byKey = new Map(meta.map((row) => [row.key, row.value]));
      const vessels = Array.isArray(byKey.get('vessels')) ? byKey.get('vessels') : [];
      const activeId = byKey.get('activeVesselId') || null;

      let reg = null;
      if (activeVessel) {
        const imo = normalizeImo(activeVessel.imo);
        const nameKey = normalizeVesselName(activeVessel.name);
        const slug = activeVessel.voyageSlug || activeVessel.id || slugify(activeVessel.name);
        const slugCore = slugify(activeVessel.name);
        if (imo) {
          for (const v of vessels) {
            const setup = byKey.get(`setup:${v.id}`) || {};
            if (normalizeImo(setup.imoNo) === imo || normalizeImo(setup.orb && setup.orb.imo) === imo) {
              reg = v;
              break;
            }
          }
        }
        if (!reg) {
          reg = vessels.find((v) =>
            v.id === activeVessel.voyageRegistryId
            || v.slug === slug || v.slug === slugCore
            || v.id === slug || v.id === slugCore
            || (nameKey && normalizeVesselName(v.name) === nameKey)
          ) || null;
        }
      }
      if (!reg && activeId) reg = vessels.find((v) => v.id === activeId) || null;
      if (!reg && vessels.length) reg = vessels[0];

      const setup = (reg && byKey.get(`setup:${reg.id}`)) || byKey.get('setup') || null;
      if (!setup) return empty;

      const allEntries = await idbGetAll(db, 'entries');
      const vesselKeys = new Set();
      if (reg) {
        vesselKeys.add(reg.id);
        if (reg.slug) vesselKeys.add(reg.slug);
      }
      let entries = (allEntries || []).filter((e) => {
        if (!e) return false;
        if (e.vesselId && vesselKeys.size) return vesselKeys.has(e.vesselId);
        return !e.vesselId && (!reg || reg.id === 'legacy');
      });
      const vn = String(setup.voyageNumber || '').trim();
      if (vn) {
        const scoped = entries.filter((e) => String(e.voyageNumber || setup.voyageNumber || '').trim() === vn
          || !e.voyageNumber);
        if (scoped.length) entries = scoped;
      }
      entries = entries.slice().sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')));

      let weather = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        const w = entries[i] && entries[i].weather;
        if (!w) continue;
        if (w.windDir || w.windBft != null || w.seaState != null) {
          weather = w;
          break;
        }
      }

      const fuelTanks = Array.isArray(setup.fuelTanks) ? setup.fuelTanks : [];
      const capacity = setup.capacity || {};
      const robStart = { ...(setup.rob || {}) };
      const robCurrent = { ...robStart };
      for (let i = entries.length - 1; i >= 0; i--) {
        const measured = entries[i]?.robSurvey?.measured;
        if (measured && typeof measured === 'object' && Object.keys(measured).length) {
          Object.assign(robCurrent, measured);
          break;
        }
      }

      const progress = computeVoyageProgressMetrics(setup, entries);

      return {
        ok: true,
        registry: reg,
        setup,
        entries,
        traveled: progress.traveled,
        totalDistance: progress.totalDistance,
        totalHrs: progress.totalHrs,
        daysAtSea: progress.daysAtSea,
        distToGo: progress.distToGo,
        daysToGo: progress.daysToGo,
        etaIso: progress.etaIso,
        etaLabel: progress.etaLabel,
        departPort: setup.departPort || 'Departure',
        arrivePort: setup.arrivePort || 'Arrival',
        weather,
        fuelTanks,
        capacity,
        robStart,
        robCurrent,
        lastSpeed: progress.lastSpeed,
        avgSpeed: progress.avgSpeed,
        entryCount: entries.length,
      };
    } finally {
      try { db.close(); } catch { /* ignore */ }
    }
  }

  root.ChengProVoyageBridge = {
    readVoyageFleet,
    readHomeSnapshot,
    importIntoChengPro,
    exportVesselToVoyage,
    autoImportIfNeeded,
    readActiveHint,
    writeActiveHint,
    mapSetupToPatch,
    findMatch,
    computeVoyageProgressMetrics,
    elapsedShipHours,
    slugify,
    normalizeImo,
    normalizeVesselName,
    HINT_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
