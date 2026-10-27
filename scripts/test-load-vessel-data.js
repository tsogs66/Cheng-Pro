/**
 * Load vessel data: the top-bar button, and which voyage leg it opens.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'modules/voyage/www/voyage_manager.html');
const indexPath = path.join(root, 'modules/voyage/www/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const shell = fs.readFileSync(path.join(root, 'apps/web/js/shell.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
const tank = fs.readFileSync(path.join(root, 'modules/tanks/public/js/cheng-bridge.js'), 'utf8');

assert.strictEqual(html, fs.readFileSync(indexPath, 'utf8'), 'voyage HTML copies diverged');

assert.match(page, /id="activeVessel"/);
assert.match(page, /id="btnLoadVesselData"/);
const selectAt = page.indexOf('id="activeVessel"');
const buttonAt = page.indexOf('id="btnLoadVesselData"');
assert.ok(selectAt > 0 && buttonAt > selectAt, 'Load vessel data sits beside the vessel list');
assert.match(page, /class="vessel-switcher-row"[\s\S]*id="activeVessel"[\s\S]*id="btnLoadVesselData"/);

assert.match(shell, /async function loadSelectedVesselData/);
assert.match(shell, /chengAioLoadInProgress/);
assert.match(shell, /aioLoadLatest=1/);
assert.match(shell, /\/tanks\/api\/vessels\/active/);
assert.doesNotMatch(shell, /activeSelect\.addEventListener\('change'/);

assert.match(html, /function pickLatestVoyageLeg/);
assert.match(html, /chengaio-load-vessel-data/);
assert.match(html, /aioLoadLatest/);
assert.match(tank, /chengaio-load-vessel-data/);
assert.match(tank, /pendingForceReload/);

const start = html.indexOf('function voyageLegEntryTime');
const end = html.indexOf('\nasync function loadLatestVoyageDataForActiveVessel');
assert.ok(start > 0 && end > start);
const fns = new Function(html.slice(start, end) + '\nreturn { voyageLegContentStamp, pickLatestVoyageLeg };');
const { voyageLegContentStamp, pickLatestVoyageLeg } = fns();

assert.strictEqual(voyageLegContentStamp({ contentAt: '2026-02-01', updatedAt: '2026-10-01' }), '2026-02-01');
assert.strictEqual(
  voyageLegContentStamp({ updatedAt: '2026-10-01', entries: [{ datetime: '2026-03-01' }] }),
  '2026-03-01'
);
assert.strictEqual(
  voyageLegContentStamp({
    contentAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    entries: [{ datetime: '2024-01-01T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z' }],
  }),
  '2024-01-01T00:00:00.000Z'
);

const library = [
  { voyageNumber: '40', B: { updatedAt: '2026-10-27T00:00:00.000Z', entries: [{ datetime: '2026-01-01T00:00:00.000Z' }] }, L: null },
  { voyageNumber: '42', B: { contentAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, L: { contentAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } },
];

assert.deepStrictEqual(
  pickLatestVoyageLeg(library, { voyageNumber: '', condition: 'B', entries: [] }),
  { action: 'open', voyageNumber: '42', condition: 'L' }
);

assert.deepStrictEqual(
  pickLatestVoyageLeg(library, {
    voyageNumber: '42',
    condition: 'L',
    entries: [{ datetime: '2026-06-01T00:00:00.000Z' }],
  }),
  { action: 'keep', voyageNumber: '42', condition: 'L' }
);

assert.deepStrictEqual(
  pickLatestVoyageLeg(library, {
    voyageNumber: '40',
    condition: 'B',
    entries: [{ datetime: '2026-08-01T00:00:00.000Z' }],
  }),
  { action: 'keep', voyageNumber: '40', condition: 'B' }
);

assert.deepStrictEqual(
  pickLatestVoyageLeg(library, {
    voyageNumber: '40',
    condition: 'B',
    entries: [{ datetime: '2026-02-01T00:00:00.000Z' }],
  }),
  { action: 'open', voyageNumber: '42', condition: 'L' }
);

assert.deepStrictEqual(
  pickLatestVoyageLeg([], { voyageNumber: '7', condition: 'B', entries: [] }),
  { action: 'empty', voyageNumber: '7', condition: 'B' }
);

console.log('load vessel data: ok');
