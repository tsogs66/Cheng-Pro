/**
 * Cheng-Pro multi-vessel store.
 *
 * Layout (shared identity; separate module planes):
 *
 *   data/
 *     settings.json
 *     vessels-index.json
 *     vessels/<id>/
 *       vessel.json          SHARED
 *       assets.json          SHARED
 *       meta.json            SHARED watermark
 *       tanks/               Tank Chief plane
 *       voyage/              Voyage Chief plane
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.CHENG_PRO_DATA_DIR || process.env.TMS_DATA_DIR || path.join(ROOT, 'data');
const VESSELS_DIR = path.join(DATA_DIR, 'vessels');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const INDEX_PATH = path.join(DATA_DIR, 'vessels-index.json');

const TANK_FILES = {
  tanks: 'tanks.json',
  readings: 'readings.json',
  voyage: 'voyage.json',
  bunkering: 'bunkering.json',
  transfers: 'transfers.json',
  bunkerOps: 'bunker-ops.json',
  fuelReport: 'fuel-report.json',
  reportHistory: 'report-history.json',
  bunkerPlan: 'bunker-plan.json',
  bunkerAfter: 'bunker-after.json',
  bunkerSummary: 'bunker-summary.json',
  bunkerHistory: 'bunker-history.json',
};

const VOYAGE_FILES = {
  setup: 'setup.json',
  entries: 'entries.json',
  receipts: 'receipts.json',
  documents: 'documents.json',
  abstracts: 'abstracts.json',
  printHistory: 'print-history.json',
  orbEntries: 'orb-entries.json',
  deletedIds: 'deleted-ids.json',
};

function now() {
  return new Date().toISOString();
}

function slugify(name) {
  return String(name || 'vessel')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'vessel';
}

function normalizeImo(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(0, 15);
}

function defaultSettings() {
  return {
    syncUrl: '',
    syncEnabled: false,
    autoSave: true,
    units: { volume: 'm3', weight: 'MT', density: 'kg/L' },
    defaultDensity: { hfo: 0.96, lsfo: 0.95, mdo: 0.89, mgo: 0.85 },
    offlineQueueFlushIntervalSec: 30,
    authRequired: false,
    updatedAt: now(),
  };
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('readJson failed', file, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function vesselDir(id) {
  return path.join(VESSELS_DIR, id);
}

function sharedPath(id, file) {
  return path.join(vesselDir(id), file);
}

function tanksPath(id, file) {
  return path.join(vesselDir(id), 'tanks', file);
}

function voyagePath(id, file) {
  return path.join(vesselDir(id), 'voyage', file);
}

function voyageLegsDir(id) {
  return path.join(vesselDir(id), 'voyage', 'legs');
}

function ensureDirs() {
  fs.mkdirSync(VESSELS_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_PATH)) writeJson(SETTINGS_PATH, defaultSettings());
  if (!fs.existsSync(INDEX_PATH)) {
    writeJson(INDEX_PATH, { vessels: [], activeVesselId: null, updatedAt: now() });
  }
}

function loadIndex() {
  ensureDirs();
  return readJson(INDEX_PATH, { vessels: [], activeVesselId: null, updatedAt: now() });
}

function saveIndex(index) {
  index.updatedAt = now();
  writeJson(INDEX_PATH, index);
}

function getSettings() {
  ensureDirs();
  return readJson(SETTINGS_PATH, defaultSettings());
}

function saveSettings(patch) {
  const next = { ...getSettings(), ...patch, updatedAt: now() };
  writeJson(SETTINGS_PATH, next);
  return next;
}

function listVessels() {
  return loadIndex().vessels;
}

function getActiveVesselId() {
  return loadIndex().activeVesselId;
}

function setActiveVessel(id) {
  const index = loadIndex();
  if (id && !index.vessels.find((v) => v.id === id)) {
    throw new Error('Vessel not found: ' + id);
  }
  index.activeVesselId = id || null;
  saveIndex(index);
  return index;
}

function emptyTanks() {
  return { fuel: [], lube: [], misc: [], water: [] };
}

function emptyVoyageFuel() {
  return {
    vessel: '',
    voyageNo: '',
    port: '',
    reportType: 'Departure',
    date: new Date().toISOString().slice(0, 10),
    time: '08:00',
    draftFwd: 0,
    draftAft: 0,
    trim: 0,
    heel: 0,
    seaTemp: 25,
    engineRoomTemp: 35,
  };
}

function emptyLegs(n = 10) {
  return Array.from({ length: n }, () => ({
    from: '', to: '', distance: '', speed: '', daily: '', port: false,
  }));
}

function emptyBunkering() {
  return {
    hfo: { departureRob: 0, received: 0, margin: 0, legs: emptyLegs(10) },
    mgo: { departureRob: 0, received: 0, margin: 0, legs: emptyLegs(10) },
    mdo: { departureRob: 0, received: 0, margin: 0, legs: emptyLegs(10) },
    lsfo: { departureRob: 0, received: 0, margin: 0, legs: emptyLegs(10) },
  };
}

function emptyAssets() {
  return { vesselLogo: null, chEngSignatures: {} };
}

function emptyBunkerHistory() {
  return { plans: [], after: [], summaries: [] };
}

function emptyVoyageSetup() {
  return {
    vesselName: '',
    chEng: '',
    voyageNumber: '',
    shipCondition: 'B',
    departPort: '',
    arrivePort: '',
    tzOffsetMin: 0,
    dwt: '',
    imoNo: '',
    company: '',
    flag: '',
    updatedAt: now(),
  };
}

function ensureTankPlane(id) {
  const dir = path.join(vesselDir(id), 'tanks');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(tanksPath(id, 'tanks.json'))) writeJson(tanksPath(id, 'tanks.json'), emptyTanks());
  if (!fs.existsSync(tanksPath(id, 'readings.json'))) writeJson(tanksPath(id, 'readings.json'), {});
  if (!fs.existsSync(tanksPath(id, 'voyage.json'))) writeJson(tanksPath(id, 'voyage.json'), emptyVoyageFuel());
  if (!fs.existsSync(tanksPath(id, 'bunkering.json'))) writeJson(tanksPath(id, 'bunkering.json'), emptyBunkering());
  if (!fs.existsSync(tanksPath(id, 'transfers.json'))) writeJson(tanksPath(id, 'transfers.json'), []);
  if (!fs.existsSync(tanksPath(id, 'bunker-ops.json'))) writeJson(tanksPath(id, 'bunker-ops.json'), []);
  if (!fs.existsSync(tanksPath(id, 'fuel-report.json'))) writeJson(tanksPath(id, 'fuel-report.json'), null);
  if (!fs.existsSync(tanksPath(id, 'report-history.json'))) writeJson(tanksPath(id, 'report-history.json'), []);
  if (!fs.existsSync(tanksPath(id, 'bunker-plan.json'))) writeJson(tanksPath(id, 'bunker-plan.json'), null);
  if (!fs.existsSync(tanksPath(id, 'bunker-after.json'))) writeJson(tanksPath(id, 'bunker-after.json'), null);
  if (!fs.existsSync(tanksPath(id, 'bunker-summary.json'))) writeJson(tanksPath(id, 'bunker-summary.json'), null);
  if (!fs.existsSync(tanksPath(id, 'bunker-history.json'))) {
    writeJson(tanksPath(id, 'bunker-history.json'), emptyBunkerHistory());
  }
}

function ensureVoyagePlane(id) {
  const dir = path.join(vesselDir(id), 'voyage');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(voyageLegsDir(id), { recursive: true });
  if (!fs.existsSync(voyagePath(id, 'setup.json'))) writeJson(voyagePath(id, 'setup.json'), emptyVoyageSetup());
  if (!fs.existsSync(voyagePath(id, 'entries.json'))) writeJson(voyagePath(id, 'entries.json'), []);
  if (!fs.existsSync(voyagePath(id, 'receipts.json'))) writeJson(voyagePath(id, 'receipts.json'), []);
  if (!fs.existsSync(voyagePath(id, 'documents.json'))) writeJson(voyagePath(id, 'documents.json'), []);
  if (!fs.existsSync(voyagePath(id, 'abstracts.json'))) writeJson(voyagePath(id, 'abstracts.json'), []);
  if (!fs.existsSync(voyagePath(id, 'print-history.json'))) writeJson(voyagePath(id, 'print-history.json'), []);
  if (!fs.existsSync(voyagePath(id, 'orb-entries.json'))) writeJson(voyagePath(id, 'orb-entries.json'), []);
  if (!fs.existsSync(voyagePath(id, 'deleted-ids.json'))) {
    writeJson(voyagePath(id, 'deleted-ids.json'), {
      entries: [], receipts: [], documents: [], abstracts: [], printHistory: [], orbEntries: [],
    });
  }
}

function createVessel(details = {}) {
  ensureDirs();
  const base = slugify(details.name || details.id || 'new-vessel');
  let id = details.id || base;
  let n = 1;
  while (fs.existsSync(vesselDir(id))) {
    id = `${base}-${++n}`;
  }

  const vessel = {
    id,
    name: String(details.name || 'New Vessel').trim() || 'New Vessel',
    imo: normalizeImo(details.imo),
    callSign: details.callSign || '',
    flag: details.flag || '',
    company: details.company || details.owner || '',
    type: details.type || '',
    dwt: details.dwt || '',
    notes: details.notes || '',
    createdAt: now(),
    updatedAt: now(),
  };

  fs.mkdirSync(vesselDir(id), { recursive: true });
  writeJson(sharedPath(id, 'vessel.json'), vessel);
  writeJson(sharedPath(id, 'assets.json'), details.assets || emptyAssets());
  writeJson(sharedPath(id, 'meta.json'), {
    version: 1,
    revision: 1,
    lastSyncedAt: null,
    updatedAt: now(),
  });

  ensureTankPlane(id);
  ensureVoyagePlane(id);

  // Optional seed into tank plane
  if (details.tanks) writeJson(tanksPath(id, 'tanks.json'), details.tanks);
  if (details.readings) writeJson(tanksPath(id, 'readings.json'), details.readings);

  // Seed voyage setup from shared identity
  const setup = {
    ...emptyVoyageSetup(),
    vesselName: vessel.name,
    imoNo: vessel.imo,
    company: vessel.company,
    flag: vessel.flag,
    dwt: vessel.dwt,
    ...(details.voyageSetup || {}),
  };
  writeJson(voyagePath(id, 'setup.json'), setup);

  const index = loadIndex();
  index.vessels.push({
    id: vessel.id,
    name: vessel.name,
    imo: vessel.imo,
    updatedAt: vessel.updatedAt,
  });
  if (!index.activeVesselId) index.activeVesselId = id;
  saveIndex(index);
  return vessel;
}

function deleteVessel(id) {
  const dir = vesselDir(id);
  if (!fs.existsSync(dir)) throw new Error('Vessel not found');
  fs.rmSync(dir, { recursive: true, force: true });
  const index = loadIndex();
  index.vessels = index.vessels.filter((v) => v.id !== id);
  if (index.activeVesselId === id) {
    index.activeVesselId = index.vessels[0]?.id || null;
  }
  saveIndex(index);
  return { ok: true };
}

function touchVessel(id) {
  const vessel = readJson(sharedPath(id, 'vessel.json'));
  if (!vessel) throw new Error('Vessel not found');
  vessel.updatedAt = now();
  writeJson(sharedPath(id, 'vessel.json'), vessel);

  const meta = readJson(sharedPath(id, 'meta.json'), { version: 1, revision: 0 });
  meta.revision = (meta.revision || 0) + 1;
  meta.updatedAt = now();
  writeJson(sharedPath(id, 'meta.json'), meta);

  const index = loadIndex();
  const entry = index.vessels.find((v) => v.id === id);
  if (entry) {
    entry.name = vessel.name;
    entry.imo = vessel.imo;
    entry.updatedAt = vessel.updatedAt;
    saveIndex(index);
  }
  return vessel;
}

function getSharedVessel(id) {
  if (!fs.existsSync(vesselDir(id))) throw new Error('Vessel not found');
  ensureTankPlane(id);
  ensureVoyagePlane(id);
  return {
    vessel: readJson(sharedPath(id, 'vessel.json')),
    assets: readJson(sharedPath(id, 'assets.json'), emptyAssets()),
    meta: readJson(sharedPath(id, 'meta.json'), {}),
  };
}

function updateVesselDetails(id, patch) {
  const vessel = readJson(sharedPath(id, 'vessel.json'));
  if (!vessel) throw new Error('Vessel not found');
  const next = {
    ...vessel,
    ...patch,
    id: vessel.id,
    imo: patch.imo !== undefined ? normalizeImo(patch.imo) : vessel.imo,
    updatedAt: now(),
  };
  if (patch.company === undefined && patch.owner !== undefined) {
    next.company = patch.owner;
  }
  writeJson(sharedPath(id, 'vessel.json'), next);

  // Keep voyage setup identity fields in sync (shared ship details only)
  ensureVoyagePlane(id);
  const setup = readJson(voyagePath(id, 'setup.json'), emptyVoyageSetup());
  setup.vesselName = next.name;
  setup.imoNo = next.imo;
  setup.company = next.company;
  setup.flag = next.flag;
  setup.dwt = next.dwt;
  setup.updatedAt = now();
  writeJson(voyagePath(id, 'setup.json'), setup);

  touchVessel(id);
  return next;
}

function saveAssets(id, assets) {
  if (!fs.existsSync(vesselDir(id))) throw new Error('Vessel not found');
  writeJson(sharedPath(id, 'assets.json'), { ...emptyAssets(), ...assets });
  touchVessel(id);
  return readJson(sharedPath(id, 'assets.json'));
}

/* ---------- Tank plane ---------- */

function getTanksBundle(id) {
  if (!fs.existsSync(vesselDir(id))) throw new Error('Vessel not found');
  ensureTankPlane(id);
  const shared = getSharedVessel(id);
  return {
    vessel: shared.vessel,
    assets: shared.assets,
    meta: shared.meta,
    tanks: readJson(tanksPath(id, 'tanks.json'), emptyTanks()),
    readings: readJson(tanksPath(id, 'readings.json'), {}),
    voyage: readJson(tanksPath(id, 'voyage.json'), emptyVoyageFuel()),
    bunkering: readJson(tanksPath(id, 'bunkering.json'), emptyBunkering()),
    transfers: readJson(tanksPath(id, 'transfers.json'), []),
    bunkerOps: readJson(tanksPath(id, 'bunker-ops.json'), []),
    fuelReport: readJson(tanksPath(id, 'fuel-report.json'), null),
    reportHistory: readJson(tanksPath(id, 'report-history.json'), []),
    bunkerPlan: readJson(tanksPath(id, 'bunker-plan.json'), null),
    bunkerAfter: readJson(tanksPath(id, 'bunker-after.json'), null),
    bunkerSummary: readJson(tanksPath(id, 'bunker-summary.json'), null),
    bunkerHistory: readJson(tanksPath(id, 'bunker-history.json'), emptyBunkerHistory()),
  };
}

function unionById(currentList, incomingList, stampKey) {
  const current = Array.isArray(currentList) ? currentList : [];
  const incoming = Array.isArray(incomingList) ? incomingList : [];
  if (!current.length) return incoming;
  if (!incoming.length) return current;
  const byId = new Map();
  const order = [];
  const put = (item) => {
    if (!item || typeof item !== 'object') return;
    const key = item.id != null ? String(item.id) : null;
    if (key == null) {
      order.push({ key: Symbol('anon'), item });
      return;
    }
    const seen = byId.get(key);
    if (!seen) {
      byId.set(key, item);
      order.push({ key, item });
      return;
    }
    const a = String(seen[stampKey] || '');
    const b = String(item[stampKey] || '');
    if (b > a) byId.set(key, item);
  };
  current.forEach(put);
  incoming.forEach(put);
  return order
    .map((e) => (typeof e.key === 'string' ? byId.get(e.key) : e.item))
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function saveTankPart(id, part, data) {
  const file = TANK_FILES[part];
  if (!file) throw new Error('Unknown tank part: ' + part);
  if (!fs.existsSync(vesselDir(id))) throw new Error('Vessel not found');
  ensureTankPlane(id);

  let merged = data;
  if (part === 'reportHistory') {
    merged = unionById(readJson(tanksPath(id, file), []), data, 'savedAt');
  } else if (part === 'bunkerHistory') {
    const current = readJson(tanksPath(id, file), emptyBunkerHistory());
    const incoming = data && typeof data === 'object' ? data : {};
    merged = { ...current };
    for (const key of ['plans', 'after', 'summaries']) {
      merged[key] = unionById(current[key], incoming[key], 'savedAt');
    }
  }

  writeJson(tanksPath(id, file), merged);
  touchVessel(id);
  return merged;
}

function findTankInBundle(tanks, tankId) {
  for (const cat of Object.keys(tanks)) {
    const t = (tanks[cat] || []).find((x) => x.id === tankId);
    if (t) return t;
  }
  return null;
}

function upsertTank(vesselId, tank) {
  ensureTankPlane(vesselId);
  const tanks = readJson(tanksPath(vesselId, 'tanks.json'), emptyTanks());
  const category = tank.category || 'fuel';
  if (!tanks[category]) tanks[category] = [];
  const idx = tanks[category].findIndex((t) => t.id === tank.id);
  const normalized = {
    calcType: 'correction',
    correctionDivisor: 10,
    trimAxis: [],
    trimVals: [],
    trimGrid: [],
    listAxis: [],
    listVals: [],
    listGrid: [],
    volumeCurve: { x: [], v: [] },
    capacity: 0,
    pipeHeight: 0,
    soundingMethod: 'ullage',
    fuelRole: 'storage',
    side: 'center',
    tankNo: null,
    fuelGrade: 'hfo',
    ...tank,
    category,
    updatedAt: now(),
  };
  if (idx >= 0) tanks[category][idx] = { ...tanks[category][idx], ...normalized };
  else {
    if (!normalized.id) normalized.id = `${category}${Date.now().toString(36)}`;
    tanks[category].push(normalized);
  }
  writeJson(tanksPath(vesselId, 'tanks.json'), tanks);
  touchVessel(vesselId);
  return normalized;
}

function deleteTank(vesselId, tankId) {
  ensureTankPlane(vesselId);
  const tanks = readJson(tanksPath(vesselId, 'tanks.json'), emptyTanks());
  let removed = false;
  for (const cat of Object.keys(tanks)) {
    const before = tanks[cat].length;
    tanks[cat] = tanks[cat].filter((t) => t.id !== tankId);
    if (tanks[cat].length !== before) removed = true;
  }
  if (!removed) throw new Error('Tank not found');
  const readings = readJson(tanksPath(vesselId, 'readings.json'), {});
  delete readings[tankId];
  writeJson(tanksPath(vesselId, 'tanks.json'), tanks);
  writeJson(tanksPath(vesselId, 'readings.json'), readings);
  touchVessel(vesselId);
  return { ok: true };
}

function updateCalibration(vesselId, tankId, calibration) {
  ensureTankPlane(vesselId);
  const tanks = readJson(tanksPath(vesselId, 'tanks.json'), emptyTanks());
  const tank = findTankInBundle(tanks, tankId);
  if (!tank) throw new Error('Tank not found');
  const fields = [
    'calcType', 'correctionDivisor', 'trimAxis', 'trimVals', 'trimGrid',
    'listAxis', 'listVals', 'listGrid', 'volumeCurve', 'capacity', 'pipeHeight',
    'soundingMethod', 'soundingIncrement', 'heelIncrement',
  ];
  for (const f of fields) {
    if (calibration[f] !== undefined) tank[f] = calibration[f];
  }
  tank.updatedAt = now();
  writeJson(tanksPath(vesselId, 'tanks.json'), tanks);
  touchVessel(vesselId);
  return tank;
}

/* ---------- Voyage plane ---------- */

function getVoyageBundle(id) {
  if (!fs.existsSync(vesselDir(id))) throw new Error('Vessel not found');
  ensureVoyagePlane(id);
  const shared = getSharedVessel(id);
  return {
    vessel: shared.vessel,
    assets: shared.assets,
    meta: shared.meta,
    setup: readJson(voyagePath(id, 'setup.json'), emptyVoyageSetup()),
    entries: readJson(voyagePath(id, 'entries.json'), []),
    receipts: readJson(voyagePath(id, 'receipts.json'), []),
    documents: readJson(voyagePath(id, 'documents.json'), []),
    abstracts: readJson(voyagePath(id, 'abstracts.json'), []),
    printHistory: readJson(voyagePath(id, 'print-history.json'), []),
    orbEntries: readJson(voyagePath(id, 'orb-entries.json'), []),
    deletedIds: readJson(voyagePath(id, 'deleted-ids.json'), {}),
  };
}

function saveVoyagePart(id, part, data) {
  const file = VOYAGE_FILES[part];
  if (!file) throw new Error('Unknown voyage part: ' + part);
  if (!fs.existsSync(vesselDir(id))) throw new Error('Vessel not found');
  ensureVoyagePlane(id);
  writeJson(voyagePath(id, file), data);
  touchVessel(id);
  return data;
}

function mergeById(localList, remoteList, deletedSet) {
  const map = new Map();
  for (const item of localList || []) {
    if (item && item.id != null) map.set(String(item.id), item);
  }
  for (const item of remoteList || []) {
    if (!item || item.id == null) continue;
    const key = String(item.id);
    if (deletedSet.has(key)) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      continue;
    }
    const a = String(prev.updatedAt || prev.savedAt || prev.datetime || '');
    const b = String(item.updatedAt || item.savedAt || item.datetime || '');
    if (b >= a) map.set(key, item);
  }
  for (const key of deletedSet) map.delete(key);
  return Array.from(map.values());
}

function putVoyageLeg(vesselId, voyageNumber, condition, payload) {
  if (!fs.existsSync(vesselDir(vesselId))) throw new Error('Vessel not found');
  ensureVoyagePlane(vesselId);
  const cond = String(condition || 'B').toUpperCase() === 'L' ? 'L' : 'B';
  const voyageNo = String(voyageNumber || '000').trim() || '000';
  const legDir = path.join(voyageLegsDir(vesselId), slugify(voyageNo));
  fs.mkdirSync(legDir, { recursive: true });
  const legPath = path.join(legDir, `${cond}.json`);

  const incoming = payload && payload.data ? payload.data : (payload || {});
  const existing = readJson(legPath, null);

  const deleted = {
    entries: new Set([...(existing?.deletedIds?.entries || []), ...(incoming.deletedIds?.entries || [])].map(String)),
    receipts: new Set([...(existing?.deletedIds?.receipts || []), ...(incoming.deletedIds?.receipts || [])].map(String)),
    documents: new Set([...(existing?.deletedIds?.documents || []), ...(incoming.deletedIds?.documents || [])].map(String)),
    abstracts: new Set([...(existing?.deletedIds?.abstracts || []), ...(incoming.deletedIds?.abstracts || [])].map(String)),
    printHistory: new Set([...(existing?.deletedIds?.printHistory || []), ...(incoming.deletedIds?.printHistory || [])].map(String)),
    orbEntries: new Set([...(existing?.deletedIds?.orbEntries || []), ...(incoming.deletedIds?.orbEntries || [])].map(String)),
  };

  const merged = {
    vesselId,
    voyageNumber: voyageNo,
    condition: cond,
    updatedAt: now(),
    deviceId: payload?.deviceId || existing?.deviceId || null,
    deviceName: payload?.deviceName || existing?.deviceName || null,
    data: {
      setup: incoming.setup || existing?.data?.setup || emptyVoyageSetup(),
      entries: mergeById(existing?.data?.entries, incoming.entries, deleted.entries),
      receipts: mergeById(existing?.data?.receipts, incoming.receipts, deleted.receipts),
      documents: mergeById(existing?.data?.documents, incoming.documents, deleted.documents),
      abstracts: mergeById(existing?.data?.abstracts, incoming.abstracts, deleted.abstracts),
      printHistory: mergeById(existing?.data?.printHistory, incoming.printHistory, deleted.printHistory),
      orbEntries: mergeById(existing?.data?.orbEntries, incoming.orbEntries, deleted.orbEntries),
      deletedIds: {
        entries: Array.from(deleted.entries).slice(-500),
        receipts: Array.from(deleted.receipts).slice(-500),
        documents: Array.from(deleted.documents).slice(-500),
        abstracts: Array.from(deleted.abstracts).slice(-500),
        printHistory: Array.from(deleted.printHistory).slice(-500),
        orbEntries: Array.from(deleted.orbEntries).slice(-500),
      },
    },
  };

  writeJson(legPath, merged);

  // Mirror active working set when this is the current voyage in setup
  const setup = readJson(voyagePath(vesselId, 'setup.json'), emptyVoyageSetup());
  if (!setup.voyageNumber || String(setup.voyageNumber) === voyageNo) {
    writeJson(voyagePath(vesselId, 'setup.json'), { ...setup, ...(merged.data.setup || {}), voyageNumber: voyageNo, shipCondition: cond });
    writeJson(voyagePath(vesselId, 'entries.json'), merged.data.entries);
    writeJson(voyagePath(vesselId, 'receipts.json'), merged.data.receipts);
    writeJson(voyagePath(vesselId, 'documents.json'), merged.data.documents);
    writeJson(voyagePath(vesselId, 'abstracts.json'), merged.data.abstracts);
    writeJson(voyagePath(vesselId, 'print-history.json'), merged.data.printHistory);
    writeJson(voyagePath(vesselId, 'orb-entries.json'), merged.data.orbEntries);
    writeJson(voyagePath(vesselId, 'deleted-ids.json'), merged.data.deletedIds);
  }

  touchVessel(vesselId);
  return merged;
}

function getVoyageLeg(vesselId, voyageNumber, condition) {
  if (!fs.existsSync(vesselDir(vesselId))) throw new Error('Vessel not found');
  const cond = String(condition || 'B').toUpperCase() === 'L' ? 'L' : 'B';
  const voyageNo = String(voyageNumber || '').trim();
  const legPath = path.join(voyageLegsDir(vesselId), slugify(voyageNo), `${cond}.json`);
  const leg = readJson(legPath, null);
  if (!leg) throw new Error('Voyage leg not found');
  return leg;
}

function listVoyageLegs(vesselId) {
  if (!fs.existsSync(vesselDir(vesselId))) throw new Error('Vessel not found');
  ensureVoyagePlane(vesselId);
  const root = voyageLegsDir(vesselId);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const voyageNo of fs.readdirSync(root)) {
    const dir = path.join(root, voyageNo);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!/^[BL]\.json$/i.test(file)) continue;
      const leg = readJson(path.join(dir, file), null);
      if (!leg) continue;
      out.push({
        vesselId,
        voyageNumber: leg.voyageNumber || voyageNo,
        condition: leg.condition || file[0].toUpperCase(),
        updatedAt: leg.updatedAt,
        entryCount: (leg.data?.entries || []).length,
      });
    }
  }
  return out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function exportBackup() {
  ensureDirs();
  const index = loadIndex();
  const vessels = {};
  for (const v of index.vessels) {
    vessels[v.id] = {
      ...getSharedVessel(v.id),
      tanks: getTanksBundle(v.id),
      voyage: getVoyageBundle(v.id),
      legs: listVoyageLegs(v.id).map((leg) => {
        try {
          return getVoyageLeg(v.id, leg.voyageNumber, leg.condition);
        } catch {
          return null;
        }
      }).filter(Boolean),
    };
  }
  return {
    format: 'cheng-pro-backup',
    version: 1,
    exportedAt: now(),
    settings: getSettings(),
    index,
    vessels,
  };
}

module.exports = {
  DATA_DIR,
  VESSELS_DIR,
  ensureDirs,
  now,
  slugify,
  getSettings,
  saveSettings,
  listVessels,
  getActiveVesselId,
  setActiveVessel,
  createVessel,
  deleteVessel,
  getSharedVessel,
  updateVesselDetails,
  saveAssets,
  touchVessel,
  getTanksBundle,
  saveTankPart,
  upsertTank,
  deleteTank,
  updateCalibration,
  findTankInBundle,
  getVoyageBundle,
  saveVoyagePart,
  putVoyageLeg,
  getVoyageLeg,
  listVoyageLegs,
  exportBackup,
  emptyTanks,
  emptyAssets,
  emptyVoyageSetup,
  emptyBunkerHistory,
};
