#!/usr/bin/env node
/*
 * Backup & Restore saves open work before it reads, sends or replaces data,
 * and Database consistency has a check of its own for miscellaneous data.
 * Run: node scripts/test-backup-saves-first.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BACKUP = fs.readFileSync(path.join(ROOT, 'apps/web/js/modules/backup.js'), 'utf8').replace(/\r\n/g, '\n');
const VOYAGE = fs.readFileSync(path.join(ROOT, 'modules/voyage/www/voyage_manager.html'), 'utf8').replace(/\r\n/g, '\n');

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
/* The code that runs for an action: from its anchor to the next 1200 chars. */
function after(src, anchor, span = 1200) {
  const i = src.indexOf(anchor);
  return i < 0 ? '' : src.slice(i, i + span);
}

console.log('\nBackup page saves open work first');
const SAVE = 'await flushTankFrames()';
for (const [label, anchor, span = 1200] of [
  ['entire program export', "root.querySelector('#bk-suite-all')"],
  ['entire program restore / merge', 'const suiteImport = async'],
  ['miscellaneous export', "root.querySelector('#bk-misc-export')"],
  ['miscellaneous restore / merge', 'const miscImport = async'],
  ['Tank Chief full backup', "root.querySelector('#bk-tank-full')"],
  ['voyage database export', "root.querySelector('#bk-voyage-db')"],
  ['voyage database restore / merge', 'const voyageDbImport = async'],
  ['voyage vessel export', "root.querySelector('#bk-voyage-vessel')"],
  ['voyage vessel import', "root.querySelector('#bk-voyage-vessel-file').onchange"],
  ['tank peer pull', "root.querySelector('#bk-sync-pull')"],
  ['tank peer push', "root.querySelector('#bk-sync-push')"],
  ['voyage push active leg', "root.querySelector('#bk-voy-sync-push')"],
  ['voyage pull active leg', "root.querySelector('#bk-voy-sync-pull')"],
  ['voyage pull one leg', "root.querySelector('#bk-voy-sync-pull-leg')"],
  ['Keep data persistent', "root.querySelector('#bk-voy-sync-persist')"],
  ['check voyage legs', "root.querySelector('#bk-check-voyage')"],
  ['check miscellaneous data', "root.querySelector('#bk-check-misc')"],
  ['Update to the newest of both', "root.querySelector('#bk-consistency-apply').onclick"],
]) {
  check(label, after(BACKUP, anchor, span).includes(SAVE), anchor);
}
check('tank peer pull makes the open Tank Chief screen read again',
  /tankRequest\('\/api\/sync\/pull'[\s\S]{0,600}reloadOpenTankFrames\(\)/.test(BACKUP));

console.log('\nVoyage Chief bridge saves the open leg first');
const bridge = after(VOYAGE, "if (msg.type !== 'chengaio-voyage-backup') return;", 40000);
for (const action of ['export-db', 'restore-db', 'merge-db', 'export-vessel', 'push-active', 'pull-active', 'export-misc', 'import-misc', 'compare-misc', 'reconcile-misc']) {
  check(action, new RegExp(`msg\\.action === '${action}'\\)? \\{\\n\\s*await commitOpenWorkBeforeSync\\(\\)`).test(bridge)
    || new RegExp(`msg\\.action === '${action}'[\\s\\S]{0,400}?await commitOpenWorkBeforeSync\\(\\)`).test(bridge), action);
}
check('import-vessel', /msg\.action === 'import-vessel'[\s\S]{0,200}await commitOpenWorkBeforeSync\(\)/.test(bridge));

console.log('\nMiscellaneous data check');
check('Check miscellaneous data button', BACKUP.includes('id="bk-check-misc"'));
check('check asks Voyage Chief to compare with the server', /refreshMiscConsistency[\s\S]{0,800}voyagePost\('compare-misc'/.test(BACKUP));
check('Update sends the miscellaneous data both ways', /consistencyPlan\.kind === 'misc'[\s\S]{0,400}voyagePost\('reconcile-misc'/.test(BACKUP));
check('Voyage Chief reads the server union of every leg', VOYAGE.includes('/api/voyage-misc/${encodeURIComponent(vessel)}'));

function extract(name) {
  const start = VOYAGE.indexOf(`function ${name}(`);
  let i = VOYAGE.indexOf('{', start), depth = 0;
  for (; i < VOYAGE.length; i++) {
    if (VOYAGE[i] === '{') depth++;
    else if (VOYAGE[i] === '}' && --depth === 0) return VOYAGE.slice(start, i + 1);
  }
  throw new Error('missing ' + name);
}
const box = {};
vm.createContext(box);
vm.runInContext(extract('miscRowStamp') + '\n' + extract('compareMiscList'), box);
const local = [
  { id: 'a', updatedAt: '2026-10-01' },
  { id: 'b', updatedAt: '2026-10-05' },
  { id: 'c', updatedAt: '2026-10-01' },
];
const remote = [
  { id: 'b', at: '2026-10-02' },
  { id: 'c', at: '2026-10-03' },
  { id: 'd', at: '2026-10-04' },
  { id: 'gone', at: '2026-10-04' },
];
const row = box.compareMiscList('Requisitions', 'requisitions', local, remote, ['gone']);
check('counts what is only here, only there, newer each side',
  row.reason === '1 only on this device, 1 only on the server, 1 newer here, 1 newer on the server', row.reason);
check('a line deleted here is not counted as missing from this device', row.remoteCount === 3, row.remoteCount);
check('a difference asks for an update', row.action === 'update');
const same = box.compareMiscList('Requisitions', 'requisitions', [{ id: 'a', savedAt: 'x' }], [{ id: 'a', at: 'x' }], []);
check('same on both sides needs nothing', same.action === 'same' && same.reason === 'Same on both sides', same.reason);

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
