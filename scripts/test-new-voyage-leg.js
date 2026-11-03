/**
 * Log Entry → New Voyage must file the new leg and leave it as the working voyage.
 * An empty log used to fall back to the ballast leg just archived, or to whichever
 * voyage sorted first in the library.
 *
 * Run: node scripts/test-new-voyage-leg.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'modules/voyage/www/index.html'), 'utf8');
assert.strictEqual(html, index, 'voyage HTML copies diverged');

function between(src, start, end) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, 'missing ' + start);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, 'missing ' + end + ' after ' + start);
  return src.slice(i, j);
}

const create = between(html, 'async function createNewVoyageLeg', "document.getElementById('btnResetVoyage')");
const archiveAt = create.indexOf('await archiveActiveVoyageLeg()');
const saveNewAt = create.indexOf('await saveVoyageLegToLibrary(');
const loadAt = create.indexOf('await activateVoyageLeg(state.activeVesselId, newVoyageNo, newCondition, { persistCurrent: false })');
assert.ok(archiveAt >= 0 && saveNewAt > archiveAt, 'the previous leg is archived before the new one is filed');
assert.ok(loadAt > saveNewAt, 'the new leg is loaded after it is filed');
assert.match(create, /applyEntryDefaults\(\)/);
assert.match(create, /prefillFromLastEntry\(\)/);
assert.match(create, /carryover\.condition = newCondition/);
assert.match(html, /stayOnEntry: true/);
assert.doesNotMatch(create, /stayOnEntry: false/);

const openShip = between(html, 'async function loadVesselFromDb', 'function openWorkDraftKey');
assert.match(openShip, /preferredLibraryLeg\(index, vn, state\.setup\.shipCondition\)/);
assert.match(openShip, /persistCurrent: false/);
assert.doesNotMatch(openShip, /row\?\.B \? 'B'/);
assert.doesNotMatch(openShip, /index\[0\]/);

const preferSrc = between(html, 'function preferredLibraryLeg', 'function reportVesselLoad');
const prefer = new Function(preferSrc + '\nreturn preferredLibraryLeg;')();

const library = [
  { voyageNumber: '42', B: { entryCount: 4 }, L: { entryCount: 0 } },
  { voyageNumber: '43', B: { entryCount: 0 }, L: null },
];
assert.deepStrictEqual(prefer(library, '42', 'L'), { voyageNumber: '42', condition: 'L' });
assert.deepStrictEqual(prefer(library, '42', 'LADEN'), { voyageNumber: '42', condition: 'L' });
assert.deepStrictEqual(prefer(library, '42', 'B'), { voyageNumber: '42', condition: 'B' });
assert.deepStrictEqual(prefer(library, '43', 'B'), { voyageNumber: '43', condition: 'B' });
assert.strictEqual(prefer(library, '43', 'L'), null);
assert.strictEqual(prefer(library, '99', 'B'), null);
assert.deepStrictEqual(prefer(library, '', 'L'), { voyageNumber: '42', condition: 'B' });
assert.strictEqual(prefer([], '7', 'B'), null);

const stampStart = html.indexOf('function voyageLegEntryTime');
const stampEnd = html.indexOf('\nasync function loadLatestVoyageDataForActiveVessel');
assert.ok(stampStart > 0 && stampEnd > stampStart);
const pick = new Function(html.slice(stampStart, stampEnd) + '\nreturn pickLatestVoyageLeg;')();

const ranked = [
  { voyageNumber: '40', B: { updatedAt: '2026-10-27T00:00:00.000Z', entries: [{ datetime: '2026-01-01T00:00:00.000Z' }] }, L: null },
  { voyageNumber: '42', B: { contentAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, L: { contentAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } },
];
assert.deepStrictEqual(
  pick(ranked, { voyageNumber: '', condition: 'B', entries: [] }),
  { action: 'open', voyageNumber: '42', condition: 'L' }
);
assert.deepStrictEqual(
  pick(ranked, { voyageNumber: '42', condition: 'L', entries: [{ datetime: '2026-06-01T00:00:00.000Z' }] }),
  { action: 'keep', voyageNumber: '42', condition: 'L' }
);
assert.deepStrictEqual(
  pick(ranked, { voyageNumber: '40', condition: 'B', entries: [{ datetime: '2026-02-01T00:00:00.000Z' }] }),
  { action: 'open', voyageNumber: '42', condition: 'L' }
);

const justCreated = [
  { voyageNumber: '42', B: null, L: { updatedAt: '2026-11-01T00:00:00.000Z', entries: [{ datetime: '2026-11-03T12:00:00' }] } },
  { voyageNumber: '43', B: { updatedAt: '2026-11-03T01:15:00.000Z', entries: [] }, L: null },
];
assert.deepStrictEqual(
  pick(justCreated, { voyageNumber: '43', condition: 'B', entries: [] }),
  { action: 'keep', voyageNumber: '43', condition: 'B' }
);
assert.deepStrictEqual(
  pick(justCreated, { voyageNumber: '40', condition: 'B', entries: [] }),
  { action: 'open', voyageNumber: '42', condition: 'L' }
);

console.log('new voyage leg: ok');
