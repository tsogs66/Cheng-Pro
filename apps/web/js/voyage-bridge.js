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

  function slugify(name) {
    return String(name || 'vessel')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'vessel';
  }

  function normalizeImo(imo) {
    return String(imo || '').replace(/^IMO\s*/i, '').trim();
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
    if (imo) {
      const byImo = list.find((v) => normalizeImo(v.imo) === imo);
      if (byImo) return byImo;
    }
    const bySlug = list.find((v) => v.id === slug || v.voyageSlug === slug);
    if (bySlug) return bySlug;
    const byVoyageId = list.find((v) => v.voyageRegistryId && v.voyageRegistryId === patch.voyageRegistryId);
    if (byVoyageId) return byVoyageId;
    const name = String(patch.name || '').trim().toLowerCase();
    if (name) return list.find((v) => String(v.name || '').trim().toLowerCase() === name) || null;
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
      let reg = vessels.find((v) => v.id === vessel.voyageRegistryId || v.slug === vessel.voyageSlug || v.slug === vessel.id);
      if (!reg && imo) {
        for (const v of vessels) {
          const setup = byKey.get(`setup:${v.id}`) || {};
          if (normalizeImo(setup.imoNo) === imo) { reg = v; break; }
        }
      }
      if (!reg) {
        reg = vessels.find((v) => String(v.name || '').toLowerCase() === String(vessel.name).toLowerCase());
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

  root.ChengProVoyageBridge = {
    readVoyageFleet,
    importIntoChengPro,
    exportVesselToVoyage,
    autoImportIfNeeded,
    readActiveHint,
    writeActiveHint,
    mapSetupToPatch,
    HINT_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
