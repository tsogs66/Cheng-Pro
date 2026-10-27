/**
 * Records that ride with Export entire program, and the separate
 * miscellaneous-data file.
 *
 * Companion data is what the other programs need and what the Tank and Voyage
 * databases do not hold: notes, the ship clock, the active ship, and the
 * server addresses those programs call.
 *
 * The miscellaneous file is the ship's own lists that are not a log line —
 * spare and store requisitions, the consumption plan and its snapshots, the
 * oil record book — plus appearance choices on this device. The license key
 * and the sign-in session are never written into either file.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChengBackupExtra = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MISC_FORMAT = 'cheng-aio-misc-v1';

  const NOTE_KEYS = {
    aio: 'chengAioNotes:v1',
    tank: 'tankChiefNotes:v1',
    voyage: 'voyageChiefNotes:v1',
  };
  const JSON_KEYS = {
    shipClock: 'chengShipClock',
    voyageSync: 'noonReportSyncCredentials',
    activeVesselHint: 'chengProActiveVesselHint',
  };
  const TEXT_KEYS = {
    activeVesselId: 'chengProActiveVesselId',
    apiServerBase: 'apiServerBase',
    apiTransport: 'apiTransport',
    licenseApi: 'chengLicenseApi',
    licenseServerUrl: 'chengAioLicenseServerUrl',
  };
  const PREFERENCE_EXACT = [
    'marine_theme', 'marine_bright', 'vm_bright',
    'tankView', 'tankTabOpen', 'tankGroup',
    'noonReportDeviceId',
  ];
  const PREFERENCE_PREFIXES = ['chengpro.homeFuelGrid.', 'tc-nav-collapse:'];

  function readItem(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }

  function writeItem(storage, key, value) {
    try {
      if (value == null || value === '') storage.removeItem(key);
      else storage.setItem(key, String(value));
    } catch (e) { /* private mode */ }
  }

  function parseJson(raw) {
    if (raw == null || raw === '') return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function noteStamp(note) {
    return String((note && (note.updatedAt || note.createdAt)) || '');
  }

  function asNoteList(value) {
    return Array.isArray(value) ? value.filter((note) => note && note.id) : [];
  }

  function mergeNotes(local, incoming) {
    const byId = new Map();
    (local || []).forEach((note) => {
      if (note && note.id) byId.set(String(note.id), note);
    });
    (incoming || []).forEach((note) => {
      if (!note || !note.id) return;
      const id = String(note.id);
      const prev = byId.get(id);
      if (!prev || noteStamp(note) >= noteStamp(prev)) byId.set(id, note);
    });
    return [...byId.values()];
  }

  function collectCompanion(storage) {
    const notes = {};
    Object.keys(NOTE_KEYS).forEach((side) => {
      notes[side] = asNoteList(parseJson(readItem(storage, NOTE_KEYS[side])));
    });
    const companion = { notes };
    Object.keys(JSON_KEYS).forEach((name) => {
      companion[name] = parseJson(readItem(storage, JSON_KEYS[name]));
    });
    Object.keys(TEXT_KEYS).forEach((name) => {
      companion[name] = readItem(storage, TEXT_KEYS[name]) || '';
    });
    return companion;
  }

  /**
   * Write companion records back. An older suite file has no companion
   * object, and that leaves this device's notes and clock alone.
   * Merge keeps a note that exists on only one side and the newer edit
   * when both sides have it. Restore writes the file's lists.
   */
  function applyCompanion(storage, companion, merge) {
    if (!companion || typeof companion !== 'object') return { notes: 0, wrote: [] };
    const wrote = [];
    let notes = 0;
    if (companion.notes && typeof companion.notes === 'object') {
      const current = collectCompanion(storage);
      Object.keys(NOTE_KEYS).forEach((side) => {
        const incoming = asNoteList(companion.notes[side]);
        const local = asNoteList(current.notes && current.notes[side]);
        const next = merge ? mergeNotes(local, incoming) : incoming;
        writeItem(storage, NOTE_KEYS[side], JSON.stringify(next));
        notes += next.length;
      });
      wrote.push('notes');
    }
    Object.keys(JSON_KEYS).forEach((name) => {
      const value = companion[name];
      if (!value || typeof value !== 'object') return;
      writeItem(storage, JSON_KEYS[name], JSON.stringify(value));
      wrote.push(name);
    });
    Object.keys(TEXT_KEYS).forEach((name) => {
      if (!companion[name]) return;
      writeItem(storage, TEXT_KEYS[name], companion[name]);
      wrote.push(name);
    });
    return { notes, wrote };
  }

  function collectPreferences(storage) {
    const entries = {};
    PREFERENCE_EXACT.forEach((key) => {
      const value = readItem(storage, key);
      if (value != null && value !== '') entries[key] = value;
    });
    try {
      const length = Number(storage.length) || 0;
      for (let i = 0; i < length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        if (!PREFERENCE_PREFIXES.some((prefix) => key.indexOf(prefix) === 0)) continue;
        const value = readItem(storage, key);
        if (value != null) entries[key] = value;
      }
    } catch (e) { /* ignore */ }
    return entries;
  }

  function preferenceKeyAllowed(key) {
    return PREFERENCE_EXACT.indexOf(key) >= 0
      || PREFERENCE_PREFIXES.some((prefix) => String(key).indexOf(prefix) === 0);
  }

  function applyPreferences(storage, entries) {
    const written = [];
    if (!entries || typeof entries !== 'object') return written;
    Object.keys(entries).forEach((key) => {
      if (!preferenceKeyAllowed(key)) return;
      const value = entries[key];
      if (value == null || value === '') return;
      writeItem(storage, key, value);
      written.push(key);
    });
    return written;
  }

  function miscCountsFromVoyage(voyage) {
    const meta = (voyage && voyage.meta) || [];
    let requisitions = 0;
    let planSnapshots = 0;
    let plans = 0;
    let orbBooks = 0;
    meta.forEach((row) => {
      if (!row || String(row.key || '').indexOf('setup:') !== 0) return;
      const setup = row.value || {};
      if (Array.isArray(setup.requisitions)) requisitions += setup.requisitions.length;
      if (Array.isArray(setup.bunkerPlanHistory)) planSnapshots += setup.bunkerPlanHistory.length;
      if (setup.bunkerPlan && typeof setup.bunkerPlan === 'object') plans += 1;
      if (setup.orb && (setup.orb.shipName || setup.orb.imo)) orbBooks += 1;
    });
    const stores = (voyage && voyage.stores) || {};
    const orbEntries = Array.isArray(stores.orbEntries) ? stores.orbEntries.length : 0;
    return { requisitions, planSnapshots, plans, orbBooks, orbEntries };
  }

  function companionSummary(companion) {
    if (!companion || typeof companion !== 'object') return '';
    const notes = companion.notes || {};
    const count = asNoteList(notes.aio).length
      + asNoteList(notes.tank).length
      + asNoteList(notes.voyage).length;
    const parts = [];
    if (count) parts.push(count + ' note' + (count === 1 ? '' : 's'));
    if (companion.shipClock) parts.push('ship clock');
    if (companion.voyageSync) parts.push('voyage sync');
    if (companion.apiServerBase || companion.licenseApi || companion.licenseServerUrl) {
      parts.push('server addresses');
    }
    return parts.join(', ');
  }

  function miscFileSummary(payload) {
    const ships = (payload && payload.ships) || [];
    let requisitions = 0;
    let snapshots = 0;
    ships.forEach((ship) => {
      if (!ship) return;
      requisitions += Array.isArray(ship.requisitions) ? ship.requisitions.length : 0;
      snapshots += Array.isArray(ship.bunkerPlanHistory) ? ship.bunkerPlanHistory.length : 0;
    });
    const orbEntries = Array.isArray(payload && payload.orbEntries) ? payload.orbEntries.length : 0;
    const prefs = payload && payload.preferences ? Object.keys(payload.preferences).length : 0;
    return [
      ships.length + ' ship' + (ships.length === 1 ? '' : 's'),
      requisitions + ' requisition' + (requisitions === 1 ? '' : 's'),
      snapshots + ' consumption-plan snapshot' + (snapshots === 1 ? '' : 's'),
      orbEntries + ' e-ORB entr' + (orbEntries === 1 ? 'y' : 'ies'),
      prefs + ' display setting' + (prefs === 1 ? '' : 's'),
    ].join(' · ');
  }

  return {
    MISC_FORMAT,
    collectCompanion,
    applyCompanion,
    collectPreferences,
    applyPreferences,
    preferenceKeyAllowed,
    miscCountsFromVoyage,
    companionSummary,
    miscFileSummary,
    mergeNotes,
  };
});
