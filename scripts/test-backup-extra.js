/**
 * Export entire program carries the records the other programs need, and
 * the miscellaneous file is the lists that are not a log line plus display
 * settings. The license key and the sign-in session stay out of both.
 *
 * Run: node scripts/test-backup-extra.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const extra = require('../apps/web/js/backup-extra.js');

function memoryStorage(seed) {
  const data = Object.assign({}, seed || {});
  return {
    get length() { return Object.keys(data).length; },
    key(i) { return Object.keys(data)[i] || null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    dump() { return data; },
  };
}

const storage = memoryStorage({
  'chengAioNotes:v1': JSON.stringify([
    { id: 'n1', text: 'Sound the settling tank', updatedAt: '2026-10-20T01:00:00Z', vesselId: 'harbour' },
  ]),
  'tankChiefNotes:v1': JSON.stringify([
    { id: 't1', text: 'Ullage the overflow', updatedAt: '2026-10-20T02:00:00Z', vesselId: 'harbour' },
  ]),
  'voyageChiefNotes:v1': '[]',
  chengShipClock: JSON.stringify({ offsetMin: 180, label: 'ship' }),
  noonReportSyncCredentials: JSON.stringify({ serverUrl: 'http://10.0.0.8:8080', apiToken: 'tok' }),
  chengProActiveVesselId: 'harbour-key',
  chengProActiveVesselHint: JSON.stringify({ name: 'M/V HARBOUR KEY', imo: '1234567' }),
  apiServerBase: 'http://10.0.0.8:8080',
  apiTransport: 'local',
  chengLicenseApi: 'http://10.0.0.8:8080/api/license',
  chengAioLicenseEntitlement: '{"key":"CA-SECRET"}',
  noonReportSession: '{"username":"chief"}',
  marine_theme: 'astrolabe',
  tankView: 'grid',
  'chengpro.homeFuelGrid.harbour-key': '{"hfo-port":["t1"]}',
  'tc-nav-collapse:Bunkering': '1',
  chengProSessionToken: 'session-secret',
});

const companion = extra.collectCompanion(storage);
assert.strictEqual(companion.notes.aio.length, 1);
assert.strictEqual(companion.notes.tank[0].text, 'Ullage the overflow');
assert.strictEqual(companion.shipClock.offsetMin, 180);
assert.strictEqual(companion.voyageSync.apiToken, 'tok');
assert.strictEqual(companion.activeVesselId, 'harbour-key');
assert.strictEqual(companion.activeVesselHint.name, 'M/V HARBOUR KEY');
assert.strictEqual(companion.apiServerBase, 'http://10.0.0.8:8080');
assert.strictEqual(companion.licenseApi, 'http://10.0.0.8:8080/api/license');
assert.ok(!JSON.stringify(companion).includes('CA-SECRET'), 'license key stays out of the suite companion');
assert.ok(!JSON.stringify(companion).includes('session-secret'), 'sign-in session stays out of the suite companion');
assert.ok(extra.companionSummary(companion).includes('note'));
assert.ok(extra.companionSummary(companion).includes('ship clock'));

const other = memoryStorage({
  'chengAioNotes:v1': JSON.stringify([
    { id: 'n1', text: 'older wording', updatedAt: '2026-10-19T01:00:00Z' },
    { id: 'n2', text: 'only here', updatedAt: '2026-10-21T01:00:00Z' },
  ]),
});
const merged = extra.applyCompanion(other, companion, true);
assert.strictEqual(merged.notes, 3);
const mergedNotes = JSON.parse(other.getItem('chengAioNotes:v1'));
assert.strictEqual(mergedNotes.find((n) => n.id === 'n1').text, 'Sound the settling tank');
assert.ok(mergedNotes.some((n) => n.id === 'n2'));
assert.strictEqual(other.getItem('chengShipClock') && JSON.parse(other.getItem('chengShipClock')).offsetMin, 180);
assert.strictEqual(other.getItem('chengAioLicenseEntitlement'), null);

extra.applyCompanion(other, companion, false);
const replaced = JSON.parse(other.getItem('chengAioNotes:v1'));
assert.deepStrictEqual(replaced.map((n) => n.id), ['n1']);

const prefs = extra.collectPreferences(storage);
assert.strictEqual(prefs.marine_theme, 'astrolabe');
assert.strictEqual(prefs.tankView, 'grid');
assert.ok(prefs['chengpro.homeFuelGrid.harbour-key']);
assert.ok(prefs['tc-nav-collapse:Bunkering']);
assert.ok(!prefs.chengAioLicenseEntitlement);
assert.ok(!prefs.chengProSessionToken);

const blank = memoryStorage({});
const written = extra.applyPreferences(blank, Object.assign({}, prefs, {
  chengAioLicenseEntitlement: '{"key":"CA-SECRET"}',
  noonReportSession: '{"username":"chief"}',
}));
assert.ok(written.includes('marine_theme'));
assert.strictEqual(blank.getItem('chengAioLicenseEntitlement'), null);
assert.strictEqual(blank.getItem('noonReportSession'), null);
assert.strictEqual(blank.getItem('marine_theme'), 'astrolabe');

const counts = extra.miscCountsFromVoyage({
  meta: [
    { key: 'setup:harbour-key', value: {
      requisitions: [{ id: 'rq1' }, { id: 'rq2' }],
      bunkerPlan: { date: '2026-10-20' },
      bunkerPlanHistory: [{ id: 's1' }],
      orb: { shipName: 'HARBOUR KEY', imo: '1234567' },
    } },
    { key: 'activeVesselId', value: 'harbour-key' },
  ],
  stores: { orbEntries: [{ id: 'orb1' }, { id: 'orb2' }, { id: 'orb3' }] },
});
assert.strictEqual(counts.requisitions, 2);
assert.strictEqual(counts.plans, 1);
assert.strictEqual(counts.planSnapshots, 1);
assert.strictEqual(counts.orbBooks, 1);
assert.strictEqual(counts.orbEntries, 3);

const summary = extra.miscFileSummary({
  ships: [{ requisitions: [{}, {}], bunkerPlanHistory: [{}] }],
  orbEntries: [{}, {}, {}],
  preferences: { marine_theme: 'night' },
});
assert.ok(summary.includes('1 ship'));
assert.ok(summary.includes('2 requisitions'));
assert.ok(summary.includes('1 consumption-plan snapshot'));
assert.ok(summary.includes('3 e-ORB entries'));
assert.ok(summary.includes('1 display setting'));

const root = path.join(__dirname, '..');
const voyage = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'));
const voyageCopy = fs.readFileSync(path.join(root, 'modules/voyage/www/index.html'));
assert.ok(voyage.equals(voyageCopy), 'Voyage HTML copies diverged');
const html = voyage.toString('utf8');
assert.ok(html.includes("msg.action === 'export-misc'"));
assert.ok(html.includes("msg.action === 'import-misc'"));
assert.ok(html.includes('function buildMiscDataExport'));
assert.ok(html.includes('function importMiscVesselData'));

const backup = fs.readFileSync(path.join(root, 'apps/web/js/modules/backup.js'), 'utf8');
assert.ok(backup.includes('id="bk-misc-export"'));
assert.ok(backup.includes('Export miscellaneous data'));
assert.ok(backup.includes('collectCompanion(localStorage)'));
assert.ok(backup.includes("voyagePost('export-misc'"));
assert.ok(backup.includes("voyagePost('import-misc'"));
assert.ok(!backup.includes('chengAioLicenseEntitlement'));

const page = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
assert.ok(page.includes('/js/backup-extra.js'));
assert.ok(page.indexOf('/js/backup-extra.js') < page.indexOf('/js/modules/backup.js'));

console.log('backup extra ok');
