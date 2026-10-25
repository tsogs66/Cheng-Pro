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
  extract('miscRowTs'),
  extract('mergeMiscList'),
  extract('mergeMiscVesselData'),
  extract('miscVesselDataCounts'),
  extract('mergeDeletedIds'),
].join('\n'), sb);

const { mergeMiscList, mergeMiscVesselData, mergeDeletedIds } = sb;
const ids = (list) => list.map((r) => r.id);

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

/* ---- the book's configuration is NOT row-merged ---------------------- */

const orbChosen = { orb: { shipName: 'Server copy', tanks: { fuel: [{ id: 'f1' }] } } };
mergeMiscVesselData(orbChosen,
  { orb: { shipName: 'Local copy', tanks: { fuel: [{ id: 'f2' }] } } },
  { orb: { shipName: 'Server copy', tanks: { fuel: [{ id: 'f1' }] } } }, {});
check('the oil record book configuration is taken whole from one side',
  orbChosen.orb.shipName, 'Server copy');
check('and its tank list is not half from each device',
  orbChosen.orb.tanks.fuel.map((t) => t.id), ['f1']);

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

check('the merge calls it with both sides and the tombstones',
  /mergeMiscVesselData\(state\.setup, localSetup, remoteSetup, deleted\);/.test(HTML), true);
check('a requisition edit is stamped so the newest can be chosen',
  /updatedAt: new Date\(\)\.toISOString\(\)\s*\n\s*\};/.test(HTML), true);
check('a deleted requisition is tombstoned',
  /rememberDeleted\('requisitions', id\);/.test(HTML), true);
check('and the shell can ask what is held',
  /msg\.action === 'misc-summary'/.test(HTML), true);
/* It all rides inside setup, which is what the sync and the file both carry. */
check('setup is still what the sync payload sends',
  /setup: state\.setup,/.test(HTML), true);

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

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
