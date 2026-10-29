/*
 * Miscellaneous vessel data must survive a merge.
 *
 * Spares and stores requisitions, the Consumption Plan's saved snapshots and
 * the oil record book's configuration are not log entries, so none of them has
 * a store of its own: they live inside the vessel's `setup` object. That is how
 * they reach a backup file and the sync server at all -- and it was also how
 * they were lost.
 *
 * A merge took the WHOLE setup object from whichever side carried the newer
 * `sync.lastModifiedAt`. If the server's copy was a minute newer, every
 * requisition raised on this device since the last sync went with the half that
 * was thrown away. Silently: no comparison row, no warning. A requisition is a
 * purchase the ship is waiting on.
 *
 * These lists are now unioned by id across both sides, newest row per id
 * winning, with tombstones honoured. The book's configuration is still taken
 * whole from one side, deliberately, and this file pins that too.
 *
 * Run: node scripts/test-misc-vessel-data.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/voyage_manager.html'), 'utf8');
const EORB_SRC = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/eorb.js'), 'utf8');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

function extract(name, kind) {
  const decl = kind === 'const' ? `const ${name} = ` : `function ${name}(`;
  const start = HTML.indexOf(decl);
  if (start < 0) throw new Error(`${name} not found`);
  if (kind === 'const') {
    let i = HTML.indexOf('[', start), depth = 0;
    for (; i < HTML.length; i++) {
      if (HTML[i] === '[') depth++;
      else if (HTML[i] === ']') { depth--; if (depth === 0) break; }
    }
    return HTML.slice(start, HTML.indexOf(';', i) + 1);
  }
  let i = HTML.indexOf('(', start), paren = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '(') paren++;
    else if (HTML[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  i = HTML.indexOf('{', i);
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(start, i + 1);
}

const sb = { console, Object, String, Array, Set, Map, Number, state: { setup: {}, orbEntries: [] } };
vm.createContext(sb);
vm.runInContext([
  extract('MISC_VESSEL_DATA_LISTS', 'const'),
  extract('ORB_TANK_GROUPS', 'const'),
  extract('mergeOrbTankGroup'),
  extract('mergeOrbTanks'),
  extract('miscRowTs'),
  extract('mergeMiscList'),
  extract('newerMiscDoc'),
  extract('mergeMiscVesselData'),
  extract('miscVesselDataCounts'),
  extract('mergeDeletedIds'),
].join('\n'), sb);

const { mergeMiscList, mergeMiscVesselData, mergeDeletedIds, mergeOrbTankGroup } = sb;
const ids = (list) => (Array.isArray(list) ? list : []).map((r) => r.id);

/* ---- the reported loss ------------------------------------------------- */

const localReqs = [
  { id: 'rq_a', description: 'ME fuel pump plunger', updatedAt: '2026-10-20T10:00:00Z' },
  { id: 'rq_b', description: 'Air start valve', updatedAt: '2026-10-21T10:00:00Z' },
];
const remoteReqs = [
  { id: 'rq_a', description: 'ME fuel pump plunger', updatedAt: '2026-10-20T10:00:00Z' },
  { id: 'rq_c', description: 'Purifier bowl o-rings', updatedAt: '2026-10-22T10:00:00Z' },
];

/* The merge picks ONE setup; the lists on it must still hold both sides. */
const chosen = { sync: { lastModifiedAt: '2026-10-22T11:00:00Z' }, requisitions: remoteReqs.slice() };
mergeMiscVesselData(chosen, { requisitions: localReqs }, { requisitions: remoteReqs }, {});
check('a requisition raised only on this device survives the merge',
  ids(chosen.requisitions).sort(), ['rq_a', 'rq_b', 'rq_c']);
check('and is not duplicated where both sides hold it',
  chosen.requisitions.filter((r) => r.id === 'rq_a').length, 1);

/* The working consumption plan is one object. A newer setup stamp on the
   other side must not keep the older plan. */
const planChosen = { bunkerPlan: { voyageNo: '08', updatedAt: '2026-10-01T00:00:00Z' } };
mergeMiscVesselData(
  planChosen,
  { bunkerPlan: { voyageNo: '12', updatedAt: '2026-10-08T00:00:00Z' } },
  { bunkerPlan: { voyageNo: '08', updatedAt: '2026-10-01T00:00:00Z' } },
  {},
  true,
);
check('a newer consumption plan is kept when the other setup stamp won',
  planChosen.bunkerPlan.voyageNo, '12');

/* ---- newest edit per row wins ----------------------------------------- */

check('a correction made later elsewhere wins',
  mergeMiscList(
    [{ id: 'rq_a', description: 'typo', updatedAt: '2026-10-20T10:00:00Z' }],
    [{ id: 'rq_a', description: 'corrected', updatedAt: '2026-10-23T10:00:00Z' }],
    [], 0,
  )[0].description, 'corrected');
check('and a later local edit beats the server copy',
  mergeMiscList(
    [{ id: 'rq_a', description: 'corrected here', updatedAt: '2026-10-24T10:00:00Z' }],
    [{ id: 'rq_a', description: 'server', updatedAt: '2026-10-23T10:00:00Z' }],
    [], 0,
  )[0].description, 'corrected here');
check('createdAt serves as a stamp for a row that has no updatedAt',
  mergeMiscList(
    [{ id: 'rq_a', description: 'old', createdAt: '2026-10-01T10:00:00Z' }],
    [{ id: 'rq_a', description: 'new', createdAt: '2026-10-09T10:00:00Z' }],
    [], 0,
  )[0].description, 'new');

/* ---- a deletion stays deleted ----------------------------------------- */

check('a tombstoned requisition is not brought back by the other device',
  ids(mergeMiscList(localReqs, remoteReqs, ['rq_c'], 0)).sort(), ['rq_a', 'rq_b']);
check('and the tombstone list itself now survives the merge',
  mergeDeletedIds({ requisitions: ['rq_c'] }, {}).requisitions, ['rq_c']);
check('from either side',
  mergeDeletedIds({}, { requisitions: ['rq_c'] }).requisitions, ['rq_c']);
check('the five original stores are still there',
  Object.keys(mergeDeletedIds({}, {})).sort(),
  ['abstracts', 'documents', 'entries', 'printHistory', 'receipts']);

/* ---- a row with no id is kept rather than dropped --------------------- */
/* Better a duplicate the engineer can delete than a purchase order gone. */
check('an id-less row from each side is kept',
  mergeMiscList([{ description: 'no id local' }], [{ description: 'no id remote' }], [], 0).length, 2);

/* ---- the snapshot cap still holds ------------------------------------- */

const many = (prefix, n) => Array.from({ length: n }, (_, i) => ({
  id: prefix + i, savedAt: `2026-0${1 + (i % 9)}-01T00:00:00Z`,
}));
const capped = mergeMiscList(many('l', 40), many('r', 40), [], 50);
check('a merge of two long plan histories is capped', capped.length, 50);
check('and keeps the newest', capped[0].savedAt >= capped[capped.length - 1].savedAt, true);

/* ---- empty and missing ------------------------------------------------ */

const bare = {};
mergeMiscVesselData(bare, {}, {}, {});
check('nothing is invented when neither side has a list', Object.keys(bare), []);
check('a side that is not an array does not throw',
  ids(mergeMiscList(null, remoteReqs, null, 0)).sort(), ['rq_a', 'rq_c']);

/* ---- the book's settings come whole from one side, its tanks are merged -- */

/* A tank added on one device is a tank the ship has: dropping it took every
   entry that names it out of the selectable list. The SETTINGS are a different
   matter -- one coherent set, wrong if half comes from each device. */
const remoteOrb = {
  shipName: 'Server copy', ioppForm: 'B',
  tanks: { fuel: [{ id: 'f1', name: 'FO 1', robM3: 12 }], sludge: [{ id: 's1', robM3: 4 }] },
};
const localOrb = {
  shipName: 'Local copy', ioppForm: 'A',
  tanks: {
    fuel: [{ id: 'f1', name: 'FO 1', robM3: 9 }, { id: 'f2', name: 'FO 2', robM3: 7 }],
    sludge: [{ id: 's1', robM3: 1 }],
    lube: [{ id: 'l1', name: 'LO sump' }],
  },
};
const orbChosen = { orb: remoteOrb };
mergeMiscVesselData(orbChosen, { orb: localOrb }, { orb: remoteOrb }, {}, true);

check('the book settings are taken whole from the chosen side',
  [orbChosen.orb.shipName, orbChosen.orb.ioppForm], ['Server copy', 'B']);
check('a tank only the other device has is added',
  ids(orbChosen.orb.tanks.fuel), ['f1', 'f2']);
check('a whole group only the other device has is added',
  ids(orbChosen.orb.tanks.lube), ['l1']);
check('a tank both sides hold is not duplicated',
  (orbChosen.orb.tanks.sludge || []).length, 1);
/* robM3 is a running retained quantity that each entry mutates -- it is not
   recomputed from the entry list -- so the row from the side whose book won
   must be the one kept, or the figure and the entries disagree. */
check('and keeps the chosen side ROB, not the losing one',
  ((orbChosen.orb.tanks.fuel || [])[0] || {}).robM3, 12);
check('while a tank only the other side has keeps its own last figure',
  ((orbChosen.orb.tanks.fuel || [])[1] || {}).robM3, 7);
check('the chosen list order is not reshuffled',
  ids(mergeOrbTankGroup([{ id: 'b' }, { id: 'a' }], [{ id: 'c' }], [])),
  ['b', 'a', 'c']);

/* The other direction: local wins the setup choice. */
const orbLocalWins = { orb: localOrb };
mergeMiscVesselData(orbLocalWins, { orb: localOrb }, { orb: remoteOrb }, {}, false);
check('when this device wins, its ROB is the one kept',
  ((orbLocalWins.orb.tanks.fuel || [])[0] || {}).robM3, 9);
check('and the server-only tanks still come across',
  ids(orbLocalWins.orb.tanks.fuel).sort(), ['f1', 'f2']);

/* A removed tank must not come back with the other device's ROB against it. */
check('a tombstoned tank stays removed',
  ids(mergeOrbTankGroup([{ id: 'f1' }], [{ id: 'f2', robM3: 7 }], ['f2'])), ['f1']);
check('from the chosen side too',
  ids(mergeOrbTankGroup([{ id: 'f1' }, { id: 'f2' }], [], ['f2'])), ['f1']);

/* The groups are seeded with default tanks on both sides, so an id-less row
   from the losing side would duplicate a default rather than recover a tank. */
check('an id-less tank from the losing side is not added',
  mergeOrbTankGroup([{ name: 'Sludge Tank' }], [{ name: 'Sludge Tank' }], []).length, 1);
check('but an id-less row already on the chosen side is kept',
  mergeOrbTankGroup([{ name: 'Sludge Tank' }], [], []).length, 1);

check('a group neither side has is not invented',
  (() => {
    const o = { orb: { tanks: { fuel: [] } } };
    mergeMiscVesselData(o, { orb: { tanks: { fuel: [] } } }, { orb: { tanks: { fuel: [] } } }, {}, true);
    return Object.keys(o.orb.tanks);
  })(), ['fuel']);
check('a setup with no book at all does not throw',
  (() => { const o = {}; mergeMiscVesselData(o, {}, {}, {}, true); return o.orb; })(), undefined);
/* The group list is compared against eorb.js itself, not against a copy
   written out here: a group added to defaultOrbSetup and not to ORB_TANK_GROUPS
   would never be merged at all, and nothing else would say so. (`const` in a vm
   context is not a sandbox property, so the declaration is read as text.) */
const declaredGroups = (extract('ORB_TANK_GROUPS', 'const').match(/'([a-zA-Z]+)'/g) || [])
  .map((q) => q.slice(1, -1));
const orbDefault = EORB_SRC.slice(EORB_SRC.indexOf('      tanks: {'));
const actualGroups = orbDefault.slice(0, orbDefault.indexOf('\n      },'))
  .split('\n').map((line) => (line.match(/^\s{8}([a-zA-Z]+):/) || [])[1]).filter(Boolean);
check('eorb.js lays out the groups this test expects',
  actualGroups,
  ['sludge', 'bilge', 'bilgeWells', 'fuel', 'lube', 'dirtyBallast', 'cargo', 'slop', 'cbt']);
check('and every one of them is merged',
  declaredGroups, actualGroups);

/* ---- counts for the backup page -------------------------------------- */

sb.state.setup = { requisitions: localReqs, bunkerPlanHistory: many('p', 3), orb: { imo: '9876543' } };
sb.state.orbEntries = [{ id: 'o1' }, { id: 'o2' }];
check('the backup page is told what this device holds',
  sb.miscVesselDataCounts(),
  { requisitions: 2, bunkerPlanHistory: 3, orbEntries: 2, orbConfigured: true });
check('and an unconfigured book says so',
  (() => { sb.state.setup = {}; return sb.miscVesselDataCounts(); })(),
  { requisitions: 0, bunkerPlanHistory: 0, orbEntries: 2, orbConfigured: false });

/* ---- wiring ---------------------------------------------------------- */


check('a requisition edit is stamped so the newest can be chosen',
  /updatedAt: new Date\(\)\.toISOString\(\)\s*\n\s*\};/.test(HTML), true);
check('a deleted requisition is tombstoned',
  /rememberDeleted\('requisitions', id\);/.test(HTML), true);
check('and the shell can ask what is held',
  /msg\.action === 'misc-summary'/.test(HTML), true);
check('the caller tells the tank merge which side won the setup',
  /mergeMiscVesselData\(state\.setup, localSetup, remoteSetup, deleted, chosen === remoteSetup\);/.test(HTML), true);
check('and removing a tank tombstones it',
  /rememberDeleted\('orbTanks', removed\.id\)/.test(HTML), true);
/* It all rides inside setup, which is what the sync and the file both carry. */
check('setup is still what the sync payload sends',
  /setup: state\.setup,/.test(HTML), true);
check('saving an e-ORB entry queues a sync',
  /await saveSetup\(\);\s*\n\s*markPendingSync\(\);\s*\n\s*document\.getElementById\('orbEntryWizard'\)/.test(HTML), true);
check('saving weekly inventory queues a sync',
  /await saveSetup\(\);\s*\n\s*markPendingSync\(\);\s*\n\s*document\.getElementById\('orbWeeklyWizard'\)/.test(HTML), true);
check('saving ORB setup queues a sync',
  /btnOrbSaveSetup[\s\S]{0,220}await saveSetup\(\);\s*\n\s*markPendingSync\(\);/.test(HTML), true);
check('voiding an e-ORB line queues a sync',
  /await refreshOrbIntegrity\(\);\s*\n\s*markPendingSync\(\);\s*\n\s*renderOrbBrowse\(\);/.test(HTML), true);
check('a sync reloads e-ORB entries from IndexedDB first',
  /await refreshOrbEntriesFromDb\(\);\s*\n\s*takeLegSyncHold\(\);/.test(HTML), true);
check('a pull then unions e-ORB rows from every voyage on the server',
  /await unionOrbEntriesFromServer\(\);\s*\n\s*await persistAllToDb\(\);/.test(HTML), true);
check('an empty pulled book does not wipe this device',
  /pulledOrb.length \? pulledOrb : adoptOrbEntries/.test(HTML), true);
check('the book matches ship identity by slug or registry id',
  /function orbEntryMatchesShip/.test(HTML), true);
check('the sealed MEPC book rides inside setup.orb, not as a misc list',
  /function orbSealedBookEntries/.test(HTML) && /sealedBook/.test(HTML)
  && !/key: 'orbEntries', label: 'e-ORB entries'/.test(HTML), true);
check('saving setup snapshots the sealed book onto the ORB config',
  /state\.setup\.orb\.sealedBook = \{/.test(HTML), true);
check('a server check reloads e-ORB entries before it files the leg',
  /async function commitOpenWorkBeforeSync\(\)\{\s*\n\s*if \(!state\.activeVesselId\) return;\s*\n\s*await refreshOrbEntriesFromDb\(\);/.test(HTML), true);
check('the backup count reloads e-ORB entries from IndexedDB',
  /await refreshOrbEntriesFromDb\(\);\s*\n\s*reply\(\{ counts: miscVesselDataCounts\(\)/.test(HTML), true);
check('miscellaneous update opens a voyage if none is open so the book can go up',
  /if \(!vn\)\{\s*\n\s*try \{\s*\n\s*const opened = await openLatestVoyageLeg\(\);/.test(HTML), true);

/* ---- and the shell's backup page shows it -------------------------------- */
const BK = fs.readFileSync(path.join(__dirname, '..', 'apps/web/js/modules/backup.js'), 'utf8');
check('the AIO backup page asks the module what is held',
  /voyagePost\('misc-summary'/.test(BK), true);
check('and gives it a row of its own',
  /title: 'Miscellaneous vessel data'/.test(BK), true);
check('which cannot be ticked, because the legs carry it',
  /kind: 'voyage-misc',\s*\n\s*action: 'same',/.test(BK), true);
check('a module that cannot answer does not break the leg comparison',
  /Miscellaneous data summary skipped/.test(BK), true);
check('and the leg count in the status line excludes it',
  /rows\.length - \(miscRow \? 1 : 0\)/.test(BK), true);

(async function testRefresh() {
  const box = {
    console, Object, String, Array, Set, Map, Number, Promise,
    state: { activeVesselId: 'ship-a', orbEntries: [{ id: 'mem', vesselId: 'ship-a', updatedAt: '2026-10-01' }] },
    LEGACY_VESSEL_ID: 'legacy',
    vesselIdentityKeys(id) { return new Set([id]); },
    async dbGetAll() {
      return [
        { id: 'disk', vesselId: 'ship-a', updatedAt: '2026-10-30' },
        { id: 'other', vesselId: 'ship-b', updatedAt: '2026-10-30' },
      ];
    },
  };
  vm.createContext(box);
  vm.runInContext([extract('recordTs'), extract('mergeListsById'), 'async ' + extract('refreshOrbEntriesFromDb')].join('\n'), box);
  await box.refreshOrbEntriesFromDb();
  const ids = (box.state.orbEntries || []).map((row) => row.id).sort();
  check('reload unions IndexedDB e-ORB rows into the open book', ids, ['disk', 'mem']);
  check('and leaves another ship\'s book alone', ids.includes('other'), false);
})().then(() => {
  console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
  process.exit(fails ? 1 : 0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
