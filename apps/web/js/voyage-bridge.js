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

  function folderIdKey(id) {
    let s = String(id || '').toLowerCase();
    let prev = '';
    while (s !== prev) {
      prev = s;
      s = s.replace(/^m[._-]?v[._-]+/, '').replace(/^[-._]+/, '');
    }
    return s;
  }

  function findMatch(list, patch) {
    const imo = normalizeImo(patch.imo);
    const slug = patch.voyageSlug || patch.slug || patch.id || slugify(patch.name);
    const slugCore = slugify(patch.name || patch.vesselName);
    const slugKeys = new Set(
      [slug, slugCore, folderIdKey(slug), folderIdKey(slugCore), folderIdKey(patch.id)]
        .filter(Boolean)
    );
    /* 1) IMO is authoritative when both sides have it. */
    if (imo) {
      const byImo = list.find((v) => normalizeImo(v.imo) === imo);
      if (byImo) return byImo;
    }
    /* 2) Slug / folder id (MV vs M/V now slugify to the same core; also ignore legacy mv- prefix). */
    const bySlug = list.find((v) => {
      const keys = [v.id, v.voyageSlug, v.slug, folderIdKey(v.id), folderIdKey(v.slug), folderIdKey(v.voyageSlug)];
      return keys.some((k) => k && (slugKeys.has(k) || slugKeys.has(folderIdKey(k))));
    });
    if (bySlug) return bySlug;
    /* 3) Voyage registry id when present. */
    const byVoyageId = list.find((v) => v.voyageRegistryId && v.voyageRegistryId === patch.voyageRegistryId);
    if (byVoyageId) return byVoyageId;
    /* 4) Exact folder / shell id. */
    if (patch.id) {
      const byId = list.find((v) => v.id === patch.id || folderIdKey(v.id) === folderIdKey(patch.id));
      if (byId) return byId;
    }
    /* 5) Name ignoring MV / M/V / M.V. prefixes and punctuation. */
    const nameKey = normalizeVesselName(patch.name || patch.vesselName);
    if (nameKey) {
      const byName = list.find((v) =>
        normalizeVesselName(v.name || v.vesselName) === nameKey
      );
      if (byName) return byName;
    }
    return null;
  }

  /**
   * Resolve a Tank or Voyage vessel row from an AIO shell vessel (or hint).
   * Folder ids often differ across apps; IMO then name/slug are the real keys.
   */
  function resolveFromList(list, hint) {
    if (!Array.isArray(list) || !list.length || !hint) return null;
    const shaped = list.map((v) => ({
      id: v.id,
      name: v.name || v.vesselName || '',
      vesselName: v.vesselName || v.name || '',
      imo: v.imo,
      slug: v.slug || v.voyageSlug || v.id,
      voyageSlug: v.voyageSlug || v.slug || v.id,
      voyageRegistryId: v.voyageRegistryId || null,
    }));
    return findMatch(shaped, {
      id: hint.id || '',
      name: hint.name || hint.vesselName || '',
      vesselName: hint.vesselName || hint.name || '',
      imo: hint.imo,
      slug: hint.slug || hint.voyageSlug || hint.id || '',
      voyageSlug: hint.voyageSlug || hint.slug || hint.id || '',
      voyageRegistryId: hint.voyageRegistryId || null,
    });
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
   * Fuel Calculated ROB for Home: Opening / Received / Present / Consumed.
   * Same grade book as Voyage Dep/Arr (LSFO path for every fuel): unitOverride or
   * meter Δ, misc + boiler/incinerator distillate extras, per-grade consOverride.
   * Present prefers survey measured ROB when saved.
   */
  function homeRoundFuelMt(n) {
    if (n == null || n === '' || !isFinite(Number(n))) return null;
    return Number(Number(n).toFixed(3));
  }

  function homeReceiptDayAfter(receiptDate, surveyDatetime) {
    const d = String(receiptDate || '').slice(0, 10);
    const s = String(surveyDatetime || '').slice(0, 10);
    return d > s;
  }

  /** Dep/Arr match: tankId only; else exact tank name — never grade alone. */
  function homeReceiptMatchesTankStrict(r, tank, cat) {
    if (!r || !tank || r.category !== cat) return false;
    if (r.tankId) return r.tankId === tank.id;
    return r.type === tank.name;
  }

  function homeEntryHasStampedReceived(entries, entryId, tankId, cat) {
    const e = (entries || []).find((x) => x.id === entryId);
    if (!e) return false;
    const map = cat === 'fuel' ? e.robReceived : e.robReceivedLube;
    return !!(map && map[tankId] != null);
  }

  function homeStampedReceivedAsOf(entries, tankId, cat, cutoff, survey) {
    let sum = 0;
    const limit = cutoff && cutoff.getTime ? cutoff.getTime() : Infinity;
    for (const e of entries || []) {
      if (!e) continue;
      if (e.datetime) {
        const t = new Date(e.datetime).getTime();
        if (Number.isFinite(t) && t > limit) continue;
        if (survey && !homeReceiptDayAfter(e.datetime, survey.date)) continue;
      } else if (survey) continue;
      const map = cat === 'fuel' ? e.robReceived : e.robReceivedLube;
      if (map && map[tankId] != null) sum += Number(map[tankId]) || 0;
    }
    return sum;
  }

  /** Same as Voyage bookReceivedPreferOnce / voyageReceivedQty (Dep/Arr Received column). */
  function homeBookReceivedPreferOnce(receipts, entries, tank, cat, opts) {
    const o = opts || {};
    const survey = o.survey || null;
    const cutoff = o.cutoff || null;
    const cutoffDay = o.cutoffDay
      || (cutoff ? String(cutoff instanceof Date ? cutoff.toISOString() : cutoff).slice(0, 10) : null);
    const allowReceipt = (r) => {
      if (!homeReceiptMatchesTankStrict(r, tank, cat)) return false;
      if (!cutoffDay) return true;
      const rDay = String(r.date || '').slice(0, 10);
      if (!rDay || rDay > cutoffDay) return false;
      return !survey || homeReceiptDayAfter(r.date, survey.date);
    };
    let hand = 0;
    let surveyFallback = 0;
    for (const r of receipts || []) {
      if (!allowReceipt(r)) continue;
      const qty = Number(r.qty) || 0;
      if (r.source === 'rob-survey') {
        if (!homeEntryHasStampedReceived(entries, r.surveyEntryId, tank.id, cat)) surveyFallback += qty;
      } else hand += qty;
    }
    if (hand > 0) return hand;
    if (surveyFallback > 0) return surveyFallback;
    const stampCutoff = cutoff || new Date('2999-12-31T23:59:59Z');
    return homeStampedReceivedAsOf(entries, tank.id, cat, stampCutoff, survey);
  }

  function homeVoyageReceivedQty(receipts, entries, tank, cat) {
    return homeBookReceivedPreferOnce(receipts, entries, tank, cat || 'fuel', {});
  }

  /** Credit bunker/lube/FW receipts to one tank — legacy simple sum (tests / lube). */
  function homeFuelReceiptQty(receipts, tank) {
    return homeVoyageReceivedQty(receipts, [], tank, 'fuel');
  }

  function homeLatestRobSurveyAtOrBefore(entries, cutoff) {
    const limit = cutoff instanceof Date ? cutoff.getTime() : new Date(cutoff).getTime();
    let best = null;
    let bestTime = -Infinity;
    for (const e of entries || []) {
      if (!e || !e.robSurvey) continue;
      const t = new Date(e.datetime).getTime();
      if (!isFinite(t) || t > limit || t <= bestTime) continue;
      bestTime = t;
      best = Object.assign({ entryId: e.id, date: e.datetime }, e.robSurvey);
    }
    return best;
  }

  function homeOpenShare(peers, tank, openStore) {
    if (!peers.length) return 0;
    let total = 0;
    let mine = 0;
    peers.forEach((p) => {
      const v = Number(openStore && openStore[p.id]) || 0;
      total += v;
      if (p.id === tank.id) mine = v;
    });
    if (total > 0) return mine / total;
    return 1 / peers.length;
  }

  /** Opening+Received stock share (matches Voyage deductGradeConsumption / Calculated ROB). */
  function homeStockShare(peers, tank, openStore, receipts) {
    if (!peers.length) return 0;
    let total = 0;
    let mine = 0;
    peers.forEach((p) => {
      const open = Number(openStore && openStore[p.id]) || 0;
      const recv = homeFuelReceiptQty(receipts, p);
      const stock = Math.max(0, open + recv);
      total += stock;
      if (p.id === tank.id) mine = stock;
    });
    if (total > 0) return mine / total;
    return 1 / peers.length;
  }

  /**
   * Period fuel consumption by grade — same book as Voyage Dep/Arr / Calculated ROB:
   * unitOverride (or single-meter Δ×SG), plus misc + boiler/incinerator distillate extras,
   * with consOverride applied per grade (grade key or tank id), never all-or-nothing.
   * LSFO and LSMGO (and HFO / MDO/MGO) share this path.
   */
  const HOME_FUEL_GRADES = ['HFO', 'LSFO', 'MDO/MGO', 'LSMGO'];
  const HOME_EXTRA_DO_GRADES = ['MDO/MGO', 'LSMGO'];

  function homeOverrideForGrade(override, grade, tanks) {
    if (!override) return null;
    if (override[grade] != null && override[grade] !== '') return override[grade];
    for (const t of tanks || []) {
      if ((t.grade === grade || t.name === grade)
          && override[t.id] != null && override[t.id] !== '') {
        return override[t.id];
      }
    }
    return null;
  }

  function homeMeterDelta(curr, prev, roll) {
    if (curr == null || prev == null || isNaN(Number(curr)) || isNaN(Number(prev))) return null;
    let d = Number(curr) - Number(prev);
    if (d < 0) d = (Number(curr) + (Number(roll) || 1e8)) - Number(prev);
    return d;
  }

  function homeDualDelta(currIn, prevIn, currOut, prevOut, rollIn, rollOut) {
    const inD = homeMeterDelta(currIn, prevIn, rollIn);
    const outD = homeMeterDelta(currOut, prevOut, rollOut != null ? rollOut : rollIn);
    if (inD == null || outD == null) return null;
    return inD - outD;
  }

  function homeMeterRollovers(setup) {
    const fm = (setup && setup.flowmeters) || {};
    const dig = (m, d) => Math.pow(10, (fm[m] && fm[m].digits) || d || 8);
    return {
      main: dig('main'),
      mainOut: dig('mainOut'),
      aux: dig('aux'),
      auxOut: dig('auxOut'),
      boiler: dig('boiler'),
      cyl: dig('cyl'),
      rc: dig('rc'),
      fw: dig('fw'),
      generic: 100000000,
    };
  }

  /** Same formulas as Voyage meGeRawLitres (SINGLE / DUAL_GE / DUAL_ME / DUAL_BOTH). */
  function homeMeGeRawLitres(e, prev, rolls, flowArr) {
    const arr = flowArr || 'SINGLE';
    let meRaw = null;
    let geRaw = null;
    if (!e || !prev) return { meRaw, geRaw };
    if (arr === 'SINGLE') {
      meRaw = homeMeterDelta(e.me && e.me.meter, prev.me && prev.me.meter, rolls.main);
      geRaw = homeMeterDelta(e.ge && e.ge.meter, prev.ge && prev.ge.meter, rolls.aux);
    } else if (arr === 'DUAL_ME') {
      meRaw = homeDualDelta(
        e.me && e.me.meterIn, prev.me && prev.me.meterIn,
        e.me && e.me.meterOut, prev.me && prev.me.meterOut,
        rolls.main, rolls.mainOut,
      );
      const geMeterD = homeMeterDelta(e.ge && e.ge.meter, prev.ge && prev.ge.meter, rolls.aux);
      geRaw = (geMeterD != null && meRaw != null) ? (geMeterD - meRaw) : null;
    } else if (arr === 'DUAL_GE') {
      geRaw = homeDualDelta(
        e.ge && e.ge.meterIn, prev.ge && prev.ge.meterIn,
        e.ge && e.ge.meterOut, prev.ge && prev.ge.meterOut,
        rolls.aux, rolls.auxOut,
      );
      const meMeterD = homeMeterDelta(e.me && e.me.meter, prev.me && prev.me.meter, rolls.main);
      meRaw = (meMeterD != null && geRaw != null) ? (meMeterD - geRaw) : null;
    } else if (arr === 'DUAL_BOTH') {
      meRaw = homeDualDelta(
        e.me && e.me.meterIn, prev.me && prev.me.meterIn,
        e.me && e.me.meterOut, prev.me && prev.me.meterOut,
        rolls.main, rolls.mainOut,
      );
      geRaw = homeDualDelta(
        e.ge && e.ge.meterIn, prev.ge && prev.ge.meterIn,
        e.ge && e.ge.meterOut, prev.ge && prev.ge.meterOut,
        rolls.aux, rolls.auxOut,
      );
    }
    return { meRaw, geRaw };
  }

  function homeLitresToMt(litres, sg) {
    if (litres == null || sg == null || isNaN(Number(sg))) return null;
    return (Number(litres) * Number(sg)) / 1000;
  }

  /** ME / GE / BLR MT for one period — mirrors computeDerived fuel path. */
  function homePeriodFuelMt(e, prev, setup) {
    const rolls = homeMeterRollovers(setup);
    const flowArr = (setup && setup.flowArr) || 'SINGLE';
    const u = (e && e.unitOverride) || {};
    let meCons = null;
    let geCons = null;
    let blrCons = null;
    if (prev) {
      const dailyRevs = homeMeterDelta(e.revCounter, prev.revCounter, rolls.rc);
      const meStopped = (dailyRevs === 0);
      const { meRaw, geRaw } = homeMeGeRawLitres(e, prev, rolls, flowArr);
      const blrD = homeMeterDelta(e.blr && e.blr.meter, prev.blr && prev.blr.meter, rolls.boiler);
      meCons = meRaw != null && e.me ? homeRoundFuelMt(homeLitresToMt(meRaw, e.me.sg)) : null;
      geCons = geRaw != null && e.ge ? homeRoundFuelMt(homeLitresToMt(geRaw, e.ge.sg)) : null;
      blrCons = blrD != null && e.blr ? homeRoundFuelMt(homeLitresToMt(blrD, e.blr.sg)) : null;
      if (u.ME != null && u.ME !== '' && !isNaN(Number(u.ME))) meCons = homeRoundFuelMt(Number(u.ME));
      if (u.GE != null && u.GE !== '' && !isNaN(Number(u.GE))) geCons = homeRoundFuelMt(Number(u.GE));
      if (u.BLR != null && u.BLR !== '' && !isNaN(Number(u.BLR))) blrCons = homeRoundFuelMt(Number(u.BLR));
      if (meStopped && !(meCons > 0)) meCons = null;
    } else {
      if (u.ME != null && u.ME !== '' && !isNaN(Number(u.ME))) meCons = homeRoundFuelMt(Number(u.ME));
      if (u.GE != null && u.GE !== '' && !isNaN(Number(u.GE))) geCons = homeRoundFuelMt(Number(u.GE));
      if (u.BLR != null && u.BLR !== '' && !isNaN(Number(u.BLR))) blrCons = homeRoundFuelMt(Number(u.BLR));
    }
    return { meCons, geCons, blrCons };
  }

  function homeSavedFuelConsByGrade(entries, fuelTanks, carryover, setup) {
    const grades = { HFO: 0, LSFO: 0, 'MDO/MGO': 0, LSMGO: 0 };
    const list = (entries || []).slice()
      .sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')));
    let prev = carryover || null;
    for (const e of list) {
      const raw = { HFO: 0, LSFO: 0, 'MDO/MGO': 0, LSMGO: 0 };
      const add = (type, mt) => {
        if (mt == null || isNaN(Number(mt)) || !type || raw[type] == null) return;
        raw[type] += Number(mt) || 0;
      };
      const { meCons, geCons, blrCons } = homePeriodFuelMt(e, prev, setup);
      add(e.me && e.me.type, meCons);
      add(e.ge && e.ge.type, geCons);
      add(e.blr && e.blr.type, blrCons);
      const misc = e.miscCons || {};
      raw['MDO/MGO'] += Number(misc['MDO/MGO']) || 0;
      raw['LSMGO'] += Number(misc['LSMGO']) || 0;
      const blrExtra = e.blrExtraCons || {};
      const incExtra = e.incExtraCons || {};
      HOME_EXTRA_DO_GRADES.forEach((t) => {
        raw[t] += Number(blrExtra[t]) || 0;
        raw[t] += Number(incExtra[t]) || 0;
      });
      const ov = e.consOverride || {};
      HOME_FUEL_GRADES.forEach((g) => {
        const o = homeOverrideForGrade(ov, g, fuelTanks);
        grades[g] += o != null ? Number(o) || 0 : raw[g];
      });
      prev = e;
    }
    return grades;
  }

  function homeDeductGradeConsumption(robMap, fuelTanks, grade, consumed) {
    const c = Number(consumed) || 0;
    if (!(c > 0)) return;
    const group = fuelTanks.filter((p) => (p.grade || p.name) === grade);
    if (!group.length) return;
    const total = group.reduce((s, p) => s + (Number(robMap[p.id]) || 0), 0);
    if (total <= 0) {
      robMap[group[0].id] = (Number(robMap[group[0].id]) || 0) - c;
      return;
    }
    group.forEach((p) => {
      const share = (Number(robMap[p.id]) || 0) / total;
      robMap[p.id] = (Number(robMap[p.id]) || 0) - c * share;
    });
  }

  function homeFuelConsUpToTime(entries, fuelTanks, carryover, limitMs, setup) {
    const filtered = (entries || []).filter((e) => {
      if (limitMs == null) return true;
      const t = new Date(e.datetime).getTime();
      return Number.isFinite(t) && t <= limitMs;
    });
    return homeSavedFuelConsByGrade(filtered, fuelTanks, carryover, setup);
  }

  /** Fuel present per tank — mirrors Voyage robAsOfComputedRow on the last entry. */
  function homeRobAsOfFuel(setup, entries, receipts, fuelTanks, lastEntry) {
    if (!lastEntry || !lastEntry.datetime) return {};
    const cutoff = new Date(lastEntry.datetime);
    const cutoffDay = String(lastEntry.datetime).slice(0, 10);
    const survey = homeLatestRobSurveyAtOrBefore(entries, cutoff);
    const carryover = setup && setup.carryover;
    const cumAll = homeSavedFuelConsByGrade(entries, fuelTanks, carryover, setup);
    let cumSurvey = null;
    if (survey) {
      const st = new Date(survey.date).getTime();
      cumSurvey = homeFuelConsUpToTime(entries, fuelTanks, carryover, st, setup);
    }
    const receivedOpts = { cutoff, cutoffDay, survey };
    const openStore = (setup && setup.rob) || {};
    const rob = {};
    for (const t of fuelTanks) {
      let base = Number(openStore[t.id]) || 0;
      if (survey) {
        if (survey.measured && survey.measured[t.id] != null) base = Number(survey.measured[t.id]);
        else if (survey.calculated && survey.calculated[t.id] != null) base = Number(survey.calculated[t.id]);
      }
      const received = homeBookReceivedPreferOnce(receipts, entries, t, 'fuel', receivedOpts);
      rob[t.id] = base + received;
    }
    HOME_FUEL_GRADES.forEach((g) => {
      const total = Number(cumAll[g]) || 0;
      const base = survey ? Number(cumSurvey[g]) || 0 : 0;
      homeDeductGradeConsumption(rob, fuelTanks, g, Math.max(0, total - base));
    });
    return rob;
  }

  /**
   * Present fuel ROB for Home / Dep/Arr parity — survey sounding correction included.
   * Last-entry survey: measured, else calculated + difference (+/− correction), else log chain.
   */
  function homeFuelPresentForTank(t, setup, entries, receipts, lastEntry, robChain) {
    const sv = lastEntry && lastEntry.robSurvey;
    if (sv) {
      const rawM = sv.measured && sv.measured[t.id];
      if (rawM != null && rawM !== '' && Number.isFinite(Number(rawM))) {
        return Number(rawM);
      }
      const calc = sv.calculated && sv.calculated[t.id] != null ? Number(sv.calculated[t.id]) : null;
      const diff = sv.difference && sv.difference[t.id] != null ? Number(sv.difference[t.id]) : null;
      if (calc != null && diff != null && Number.isFinite(calc) && Number.isFinite(diff)) {
        const corrected = homeRoundFuelMt(calc + diff);
        return corrected != null ? corrected : calc + diff;
      }
      if (diff != null && Number.isFinite(diff) && robChain && robChain[t.id] != null) {
        const chain = Number(robChain[t.id]);
        if (calc != null && Number.isFinite(calc) && Math.abs(chain - calc) < 0.05) {
          const corrected = homeRoundFuelMt(calc + diff);
          return corrected != null ? corrected : calc + diff;
        }
        const corrected = homeRoundFuelMt(chain + diff);
        return corrected != null ? corrected : chain + diff;
      }
    }
    if (robChain && robChain[t.id] != null && !isNaN(Number(robChain[t.id]))) {
      return Number(robChain[t.id]);
    }
    const open = Number((setup && setup.rob && setup.rob[t.id]) || 0);
    return open + homeVoyageReceivedQty(receipts, entries, t, 'fuel');
  }

  function buildHomeCalculatedRob(setup, entries, receipts) {
    const fuelTanks = Array.isArray(setup && setup.fuelTanks) ? setup.fuelTanks : [];
    const robStart = { ...((setup && setup.rob) || {}) };
    const robCurrent = {};
    const robUsed = {};
    const list = (entries || []).slice()
      .sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')));
    const lastEntry = list.length ? list[list.length - 1] : null;
    const robChain = homeRobAsOfFuel(setup, list, receipts, fuelTanks, lastEntry);

    for (const t of fuelTanks) {
      const open = Number(robStart[t.id]) || 0;
      /* Dep/Arr Consumed = Opening + voyage Received − Present (same Received column). */
      const received = homeVoyageReceivedQty(receipts, list, t, 'fuel');
      const present = homeFuelPresentForTank(t, setup, list, receipts, lastEntry, robChain);
      robCurrent[t.id] = present;
      robUsed[t.id] = homeRoundFuelMt(Math.max(0, open + received - present)) ?? 0;
    }
    return { robStart, robCurrent, robUsed };
  }

  /** Default Voyage lube tanks when setup.lubeTanks is empty. */
  const DEFAULT_HOME_LUBE_TANKS = [
    { id: 'cylhigh', name: 'CYL HIGH', kind: 'cylHigh' },
    { id: 'cyllow', name: 'CYL LOW', kind: 'cylLow' },
    { id: 'mesysoil', name: 'ME SYS OIL', kind: 'meSys' },
    { id: 'gesysoil', name: 'GE SYS OIL', kind: 'geSys' },
  ];
  const HOME_LUBE_KIND_LABEL = {
    cylHigh: 'CYL HIGH',
    cylLow: 'CYL LOW',
    meSys: 'ME SYS OIL',
    geSys: 'GE SYS OIL',
  };

  function homeLubeTankList(setup) {
    const list = Array.isArray(setup && setup.lubeTanks) ? setup.lubeTanks : [];
    return list.length ? list : DEFAULT_HOME_LUBE_TANKS.slice();
  }

  function homeLubeReceiptQty(receipts, tank) {
    let hand = 0;
    let survey = 0;
    for (const r of receipts || []) {
      if (!r || r.category !== 'lube') continue;
      const match = (r.tankId && r.tankId === tank.id)
        || (!r.tankId && r.type && tank.name && String(r.type) === String(tank.name));
      if (!match) continue;
      const qty = Number(r.qty) || 0;
      if (r.source === 'rob-survey') survey += qty;
      else hand += qty;
    }
    return hand > 0 ? hand : survey;
  }

  /**
   * Period lube consumption by kind (litres) — cyl / ME LO / GE LO meter deltas,
   * matching the Voyage Calculated ROB book when no survey re-base applies.
   */
  function homeSavedLubeConsByKind(entries, carryover) {
    const kinds = { 'CYL HIGH': 0, 'CYL LOW': 0, 'ME SYS OIL': 0, 'GE SYS OIL': 0 };
    const list = (entries || []).slice()
      .sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')));
    let prev = carryover || null;
    for (const e of list) {
      if (!prev) { prev = e; continue; }
      const cylD = homeMeterDelta(e.cylMeter, prev.cylMeter);
      const meLoD = homeMeterDelta(e.meLo, prev.meLo);
      const geLoD = homeMeterDelta(e.geLo, prev.geLo);
      const raw = { 'CYL HIGH': 0, 'CYL LOW': 0, 'ME SYS OIL': 0, 'GE SYS OIL': 0 };
      if (cylD != null && cylD > 0) {
        raw[e.tbn === 'LOW' ? 'CYL LOW' : 'CYL HIGH'] += cylD;
      }
      if (meLoD != null && meLoD > 0) raw['ME SYS OIL'] += meLoD;
      if (geLoD != null && geLoD > 0) raw['GE SYS OIL'] += geLoD;
      const ov = e.consOverride || {};
      Object.keys(kinds).forEach((label) => {
        const o = ov[label];
        kinds[label] += (o != null && o !== '' && !isNaN(Number(o))) ? Number(o) : raw[label];
      });
      prev = e;
    }
    return kinds;
  }

  function homeLubeStockShare(peers, tank, openStore, receipts) {
    if (!peers.length) return 0;
    let total = 0;
    let mine = 0;
    peers.forEach((p) => {
      const open = Number(openStore && openStore[p.id]) || 0;
      const recv = homeLubeReceiptQty(receipts, p);
      const stock = Math.max(0, open + recv);
      total += stock;
      if (p.id === tank.id) mine = stock;
    });
    if (total > 0) return mine / total;
    return 1 / peers.length;
  }

  /** Opening + received − consumed (or latest measuredLube survey) for each lube tank. */
  function buildHomeCalculatedLubeRob(setup, entries, receipts) {
    const lubeTanks = homeLubeTankList(setup);
    const robStart = { ...((setup && setup.robLube) || {}) };
    const robCurrent = {};
    const list = Array.isArray(entries) ? entries : [];
    const consByKind = homeSavedLubeConsByKind(list, setup && setup.carryover);

    for (const t of lubeTanks) {
      const open = Number(robStart[t.id]) || Number(robStart[t.name]) || 0;
      const received = homeLubeReceiptQty(receipts, t);
      const kindKey = t.kind || '';
      const kindLabel = HOME_LUBE_KIND_LABEL[kindKey] || t.name;
      const peers = lubeTanks.filter((p) => (p.kind || p.name) === (t.kind || t.name));
      const consumed = (Number(consByKind[kindLabel]) || 0)
        * homeLubeStockShare(peers, t, robStart, receipts);
      let measured = null;
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i] && list[i].robSurvey && list[i].robSurvey.measuredLube
          ? list[i].robSurvey.measuredLube[t.id]
          : null;
        if (m != null && m !== '' && !isNaN(Number(m))) {
          measured = Number(m);
          break;
        }
      }
      if (measured != null) robCurrent[t.id] = measured;
      else robCurrent[t.id] = open + received - Math.max(0, consumed);
    }
    return { robStart, robCurrent, lubeTanks };
  }

  /**
   * Lightweight voyage snapshot for the AIO Home dashboard (progress + Calculated ROB).
   * Fuel gauges use Opening / Received / Present & consumption from the Voyage Calculated ROB book.
   */

  const NM_METERS = 1852;

  function meterDeltaSafe(curr, prev, rollover){
    if (curr == null || prev == null || isNaN(curr) || isNaN(prev)) return null;
    let d = curr - prev;
    if (d < 0) d = (curr + (rollover || 1e8)) - prev;
    return d;
  }

  function engineDistanceNm(pitchM, dailyRevs, rpm, hrs){
    if (pitchM > 0 && dailyRevs != null && !isNaN(dailyRevs) && dailyRevs >= 0){
      return (pitchM * dailyRevs) / NM_METERS;
    }
    if (pitchM > 0 && rpm != null && !isNaN(rpm) && hrs > 0){
      return rpm * (pitchM * 60 / NM_METERS) * hrs;
    }
    return null;
  }

  /**
   * Slip / kW / %MCR are computed in Voyage Chief for display and are not always
   * persisted on saved entries. Recompute them here for the Home voyage progress.
   */
  function deriveLastEntryPerf(setup, entries){
    const list = Array.isArray(entries) ? entries : [];
    const last = list.length ? list[list.length - 1] : null;
    if (!last){
      return { lastRpm: null, lastSlip: null, lastKw: null, lastMcrPct: null, shipStatus: 'UNDERWAY' };
    }

    const pitch = Number(setup && setup.pitch) || 0;
    const mcrRpm = Number(setup && setup.mcrRpm) || 1;
    const mcrKw = Number(setup && setup.mcrKw) || 0;
    const exp = (setup && setup.propLawExp != null && isFinite(Number(setup.propLawExp)))
      ? Number(setup.propLawExp) : 3;

    let lastRpm = last.rpm != null && last.rpm !== '' ? Number(last.rpm) : null;
    let lastSlip = last.slip != null && last.slip !== '' ? Number(last.slip) : null;
    let lastKw = last.kwEst != null && last.kwEst !== '' ? Number(last.kwEst) : null;
    let lastMcrPct = last.mcrPct != null && last.mcrPct !== '' ? Number(last.mcrPct) : null;

    let prev = list.length >= 2 ? list[list.length - 2] : null;
    if (!prev && setup && setup.carryover) prev = setup.carryover;

    let hrs = null;
    if (prev && prev.datetime && last.datetime){
      hrs = elapsedShipHours(prev.datetime, last.datetime, last.clockChangeMin);
    }

    let dailyRevs = null;
    if (prev && last.revCounter != null && prev.revCounter != null){
      const fm = (setup && setup.flowmeters) || {};
      const digits = (fm.rc && fm.rc.digits) || 8;
      dailyRevs = meterDeltaSafe(Number(last.revCounter), Number(prev.revCounter), Math.pow(10, digits));
    }
    if ((lastRpm == null || !isFinite(lastRpm)) && dailyRevs != null && hrs > 0){
      lastRpm = dailyRevs / (hrs * 60);
    }

    if (lastRpm != null && isFinite(lastRpm) && mcrRpm > 0){
      if (lastMcrPct == null || !isFinite(lastMcrPct)){
        lastMcrPct = Math.pow(lastRpm / mcrRpm, exp) * 100;
      }
      if (lastKw == null || !isFinite(lastKw)){
        const shaftKw = last.shaftKw != null ? Number(last.shaftKw)
          : (last.report && last.report.shaftKw != null ? Number(last.report.shaftKw) : null);
        if (shaftKw != null && isFinite(shaftKw) && shaftKw > 0) lastKw = shaftKw;
        else lastKw = Math.pow(lastRpm / mcrRpm, exp) * mcrKw;
      }
    }

    if ((lastSlip == null || !isFinite(lastSlip)) && pitch > 0){
      const distEngine = engineDistanceNm(pitch, dailyRevs, lastRpm, hrs);
      const distShip = last.distanceShip != null && last.distanceShip !== '' ? Number(last.distanceShip) : null;
      if (distEngine != null && distEngine > 0 && distShip != null && isFinite(distShip)){
        lastSlip = ((distEngine - distShip) / distEngine) * 100;
      }
    }

    const PORT_OPS = new Set([
      'DEPARTURE - STANDBY','DEPARTURE - LAST LINE','DEPARTURE - PORT','DEPARTURE - PILOT ONBOARD',
      'NOON - AT PORT','ARRIVAL - STANDBY','ARRIVAL - FIRST LINE','ARRIVAL - FINISHED ENGINE',
      'END OF SEA PASSAGE','SHIFTING STATIONS','BUNKERING','BUNKER SURVEY',
      'CARGO - LOADING','CARGO - DISCHARGING','IDLE IN PORT'
    ]);
    const ANCHOR_OPS = new Set(['NOON - ANCHORAGE','DEPARTURE - ANCHORAGE','ARRIVAL - ANCHORAGE']);
    const DRIFT_OPS = new Set(['DRIFTING - START','DRIFTING - END','NOON - DRIFTING','DRIFTING']);
    let shipStatus = 'UNDERWAY';
    const op = last.operation || '';
    if (ANCHOR_OPS.has(op)) shipStatus = 'ANCHORED';
    else if (DRIFT_OPS.has(op)) shipStatus = 'DRIFTING';
    else if (PORT_OPS.has(op)) shipStatus = 'PORT';
    else if (!(lastKw > 0) && !(Number(last.distanceShip) > 0)) shipStatus = 'PORT';

    return {
      lastRpm: lastRpm != null && isFinite(lastRpm) ? lastRpm : null,
      lastSlip: lastSlip != null && isFinite(lastSlip) ? lastSlip : null,
      lastKw: lastKw != null && isFinite(lastKw) ? lastKw : null,
      lastMcrPct: lastMcrPct != null && isFinite(lastMcrPct) ? lastMcrPct : null,
      shipStatus,
    };
  }

  async function readHomeSnapshot(activeVessel) {
    const empty = {
      ok: false,
      setup: null,
      entries: [],
      traveled: 0,
      totalDistance: null,
      weather: null,
      fuelTanks: [],
      lubeTanks: [],
      capacity: {},
      robStart: {},
      robCurrent: {},
      robUsed: {},
      robLubeStart: {},
      robLubeCurrent: {},
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
      const allReceipts = await idbGetAll(db, 'receipts');
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
      let receipts = (allReceipts || []).filter((r) => {
        if (!r) return false;
        if (r.vesselId && vesselKeys.size) return vesselKeys.has(r.vesselId);
        return !r.vesselId;
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
      const calc = buildHomeCalculatedRob(setup, entries, receipts);
      const robStart = calc.robStart;
      const robCurrent = calc.robCurrent;
      const robUsed = calc.robUsed;
      const lubeCalc = buildHomeCalculatedLubeRob(setup, entries, receipts);
      const lubeTanks = lubeCalc.lubeTanks;
      const robLubeStart = lubeCalc.robStart;
      const robLubeCurrent = lubeCalc.robCurrent;

      const progress = computeVoyageProgressMetrics(setup, entries);

      const lastEntry = entries.length ? entries[entries.length - 1] : null;
      const robSurveyCorr = {};
      if (lastEntry && lastEntry.robSurvey && lastEntry.robSurvey.difference) {
        fuelTanks.forEach((t) => {
          const d = lastEntry.robSurvey.difference[t.id];
          if (d != null && Number.isFinite(Number(d))) robSurveyCorr[t.id] = Number(d);
        });
      }

      const perf = deriveLastEntryPerf(setup, entries);
      const lastRpm = perf.lastRpm;
      const lastSlip = perf.lastSlip;
      const lastKw = perf.lastKw;
      const lastMcrPct = perf.lastMcrPct;
      const shipStatus = perf.shipStatus;

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
        lubeTanks,
        capacity,
        robStart,
        robCurrent,
        robUsed,
        robSurveyCorr,
        robLubeStart,
        robLubeCurrent,
        lastSpeed: progress.lastSpeed,
        avgSpeed: progress.avgSpeed,
        lastRpm,
        lastSlip,
        lastKw,
        lastMcrPct,
        shipStatus,
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
    resolveFromList,
    computeVoyageProgressMetrics,
    deriveLastEntryPerf,
    elapsedShipHours,
    slugify,
    normalizeImo,
    normalizeVesselName,
    buildHomeCalculatedRob,
    homeFuelPresentForTank,
    buildHomeCalculatedLubeRob,
    homeSavedFuelConsByGrade,
    homeSavedLubeConsByKind,
    HINT_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
