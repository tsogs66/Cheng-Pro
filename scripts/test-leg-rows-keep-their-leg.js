#!/usr/bin/env node
/*
 * Voyage 66 Laden: 64 entries on the device, 54 on the server, 51 of those
 * tagged condition B. Update to the newest of both took the server's B copies
 * (same ids) and the leg filter then dropped them, leaving 13 with no error.
 * A row stored in a leg now belongs to that leg.
 * Run: node scripts/test-leg-rows-keep-their-leg.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'modules', 'voyage', 'www', 'voyage_manager.html'), 'utf8').replace(/\r\n/g, '\n');

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function extract(name) {
  const start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error('missing ' + name);
  let i = HTML.indexOf(') {', start);
  if (i < 0 || HTML.indexOf('{', start) < i) i = HTML.indexOf('{', start); else i += 2;
  let depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('unclosed ' + name);
}

const NAMES = ['normalizeCondition', 'fileRowsUnderLeg', 'takeLegSyncHold', 'restoreHeldLegRecords', 'applyRemoteSnapshot',
  'mergeListsById', 'filterDeleted', 'mergeDeletedIds', 'dedupeEntriesByContent', 'entryContentKey', 'recordTs',
  'entryMatchesActiveLeg', 'activeLegVoyageNumber', 'activeLegCondition'];

function run(device, server) {
  const box = {
    legSyncHold: null,
    _orbNeedsReseal: null,
    sync: { deletedIds: { entries: [] } },
  };
  vm.createContext(box);
  vm.runInContext('var legSyncHold = null; var _orbNeedsReseal = null;\n' + NAMES.map(extract).join('\n'), box);
  Object.assign(box, {
    localSyncCredentialSnapshot: () => ({ deletedIds: { entries: [] } }),
    migrateSetup: (s) => s,
    preserveLocalSyncOnSetup: (s) => ({ ...s }),
    mergeMiscVesselData: () => {},
    normalizeEntry: (e) => e,
    tagVesselId: (r) => r,
    slimPrintRecord: (r) => r,
    ensureSyncConfig: () => box.sync,
    applyVesselMiscCarry: () => {},
  });
  box.state = {
    activeVesselId: 'v1',
    setup: { voyageNumber: '66', shipCondition: 'L', sync: { lastModifiedAt: '2026-10-01' } },
    entries: device.map((e) => ({ ...e })),
    receipts: [], documents: [], abstracts: [], printHistory: [], orbEntries: [],
  };
  vm.runInContext('takeLegSyncHold(); applyRemoteSnapshot(remote, "merge");', Object.assign(box, {
    remote: { data: { setup: { voyageNumber: '66', shipCondition: 'B', sync: { lastModifiedAt: '2026-10-02' } }, entries: server, deletedIds: { entries: [] } } },
  }));
  return box;
}

const at = '2026-10-10T00:00:00Z';
const row = (id, cond, day) => ({ id, voyageNumber: '66', condition: cond, datetime: `2026-10-${String(day).padStart(2, '0')}T${String(id.length).padStart(2, '0')}:00`, operation: 'NOON ' + id, updatedAt: at });
/* As the server file shows it: the leg's first 51 rows carry condition B
   (logged before the leg became Laden), the last 13 carry L. */
const device = Array.from({ length: 64 }, (_, i) => row('e' + i, i < 51 ? 'B' : 'L', 1 + (i % 28)));
const later = '2026-10-12T00:00:00Z';
/* Saved again on the other device, so the server copies are the newer ones. */
const server = device.slice(0, 51).map((e) => ({ ...e, updatedAt: later }))
  .concat([row('s1', 'L', 2), row('s2', 'L', 3), row('s3', 'L', 4)]);

console.log('\nVoyage 66 L: 51 of its rows tagged Ballast, here and on the server');
const box = run(device, server);
const visible = box.state.entries.filter((e) => box.entryMatchesActiveLeg(e));
check('every entry of the leg is still there (64 + 3 from the server)', visible.length === 67, visible.length);
check('none of the device\'s 64 lost', device.every((d) => visible.some((v) => v.id === d.id)));
check('the server-only entries came down', ['s1', 's2', 's3'].every((id) => visible.some((v) => v.id === id)));
check('the Ballast-tagged rows are filed under Laden', visible.every((e) => e.condition === 'L' && e.voyageNumber === '66'));
check('the newer server copies won, edit times unchanged', visible.filter((e) => e.id[0] === 'e' && Number(e.id.slice(1)) < 51).every((e) => e.updatedAt === later));
check('nothing tombstoned', box.sync.deletedIds.entries.length === 0, JSON.stringify(box.sync.deletedIds));

console.log('\nRows of another voyage are not pulled into this one');
const box2 = run(device.slice(0, 5), [row('x1', 'L', 5), { ...row('x2', 'L', 6), voyageNumber: '65' }]);
const v2 = box2.state.entries.filter((e) => box2.entryMatchesActiveLeg(e)).map((e) => e.id).sort();
check('voyage 65 row stays voyage 65', !v2.includes('x2') && box2.state.entries.every((e) => e.id !== 'x2' || e.voyageNumber === '65'), v2.join(','));

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
