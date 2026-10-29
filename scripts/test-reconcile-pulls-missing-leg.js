#!/usr/bin/env node
/*
 * Update to the newest of both, voyage legs. A leg only on the server is
 * pulled, never pushed: when the server could not hand it over, the upload
 * that followed put an empty leg there in its place. Legs pair by the server
 * folder they sync to, so "V 12" here and V-12 there are one leg, not two.
 * Run: node scripts/test-reconcile-pulls-missing-leg.js
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
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(HTML.lastIndexOf('\n', start) + 1, i + 1);
  }
  throw new Error('unclosed ' + name);
}

const box = {};
vm.createContext(box);
vm.runInContext(['slugVoyageNo', 'normalizeCondition', 'adviseLegPair', 'remoteLegSummaries', 'compareLocalAndServerLegs', 'legFailureNote', 'reconcileVoyageLegs', 'openLegForReconcile']
  .map(extract).join('\n'), box);

(async () => {
  console.log('\nLegs pair by the server folder');
  box.commitOpenWorkBeforeSync = async () => {};
  box.syncApiBase = () => 'http://sync';
  box.vesselSyncSlug = () => 'mv-test';
  box.syncRequestHeaders = () => ({});
  box.state = { setup: { vesselName: 'MV TEST' } };
  box.listLocalLegSummaries = async () => [{ voyageNumber: 'V 12', condition: 'B', entryCount: 3, contentAt: '2026-10-01' }];
  box.fetchSyncJson = async () => ({ body: { voyages: [{ voyageNumber: 'V-12', conditions: [{ voyageNumber: 'V-12', condition: 'B', entryCount: 3, updatedAt: '2026-10-01' }] }] } });
  const compared = await box.compareLocalAndServerLegs();
  check('one row for "V 12" here and V-12 on the server', compared.rows.length === 1, JSON.stringify(compared.rows));
  check('the row uses this device\'s number', compared.rows[0] && compared.rows[0].voyage === 'V 12');

  console.log('\nA leg only on the server is pulled, not pushed');
  const calls = [];
  const known = new Set(['20|B']);
  box.state = { activeVesselId: 'v1', setup: { voyageNumber: '20', shipCondition: 'B' }, entries: [] };
  box.rememberVesselMiscForSync = () => {};
  box.updateActivity = () => {};
  box.applyVesselMiscCarry = () => {};
  box.archiveActiveVoyageLeg = async () => { calls.push('archive ' + (box.state.setup.voyageNumber || '(none)')); };
  box.restoreOpenWorkDraft = async () => {};
  box.vesselMiscCarry = null;
  box.migrateSetup = (s) => s;
  box.clearActiveVesselWorkingData = async () => {};
  box.saveSetup = async () => {};
  box.activateVoyageLeg = async (vid, vn, cond) => {
    if (!known.has(vn + '|' + cond)) throw new Error(`No ${cond} records for voyage ${vn} on this vessel`);
    box.state.setup = { voyageNumber: vn, shipCondition: cond };
  };
  box.syncNow = async (opts) => {
    const leg = box.state.setup.voyageNumber + ' ' + box.state.setup.shipCondition;
    calls.push(`sync ${leg} ${opts.pullOnly ? 'pull' : 'push+pull'}`);
    if (leg === '31 L') throw new Error('No remote voyage snapshot found on server');
  };
  const out = await box.reconcileVoyageLegs([
    { voyage: '20', condition: 'B' },
    { voyage: '30', condition: 'B' },
    { voyage: '31', condition: 'L' },
  ], {});
  check('leg on this device syncs both ways', calls.includes('sync 20 B push+pull'), calls.join(', '));
  check('leg only on the server is pulled only', calls.includes('sync 30 B pull'), calls.join(', '));
  check('a leg the server cannot hand over is not pushed', calls.includes('sync 31 L pull') && !calls.includes('sync 31 L push+pull'), calls.join(', '));
  check('the empty leg left behind is not filed', !calls.includes('archive 31'), calls.join(', '));
  check('the other legs still update', out.results.map((r) => r.voyage).join(',') === '20,30', JSON.stringify(out.results));
  check('the failed leg is reported by name', out.failed.length === 1 && out.failed[0].voyage === '31' && /No remote voyage/.test(out.failed[0].error), JSON.stringify(out.failed));
  check('the message names it', /Not downloaded: voyage 31 L \(No remote voyage snapshot/.test(box.legFailureNote(out.failed)), box.legFailureNote(out.failed));
  check('nothing to say when every leg came down', box.legFailureNote([]) === '');

  console.log(`\n${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
