'use strict';

/**
 * What counts as a number in a ship's table, and what must not.
 *
 * The cost of a false positive is the higher one: a column of tank names
 * shoved to the right reads as a broken page, while a numeric column left
 * alone merely stays as it was. Every case here that returns false is a case
 * that appears in a real Tank Chief or Voyage Chief table.
 *
 * Run: node scripts/num-align-test.js
 */
const NA = require('../apps/web/js/num-align.js');

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures += 1;
}

console.log('\nfigures these programs actually print');
for (const n of ['1587.0', '46.80', '2,353.33', '0', '-12', '+3.5', '79.5%', '100%', '430.67', '0.000', '4,510']) {
  check(`"${n}"`, NA.isNumeric(n), true);
}

console.log('\nthings in the same tables that are not figures');
for (const s of ['2026-09-04', 'NO.1 H.F.O. TANK (P)', 'port', 'storage', 'HFO', '7/9', 'Fr. 42–48 (P)',
  '12 MT', '65 B', 'MV CAPTAIN VENIAMIS', '1,2', '1.2.3', '--', '1-2']) {
  check(`"${s}"`, NA.isNumeric(s), false);
}

console.log('\nempty cells decide nothing');
for (const s of ['', ' ', '–', '—', '-', 'n/a', 'NIL', 'none', 'NONE', 'n/r']) check(`"${s}"`, NA.isBlank(s), true);
check('"none" keeps a Fill column aligned with its neighbours',
  NA.numericColumns(table([['A', '62%'], ['B', 'none'], ['C', '10%']])), [1]);
check('"0" is a value, not a blank', NA.isBlank('0'), false);

/* A table is only ever asked for .rows / .cells / .colSpan / .textContent and
   whether a cell holds a control, so a few lines of stub beat a DOM
   dependency — and keep this test runnable wherever node is. */
function cell(text) {
  const control = /^<input/.test(text);
  return { colSpan: (text.match(/colspan=(\d+)/) || [])[1] ? +text.match(/colspan=(\d+)/)[1] : 1,
           textContent: control ? '' : text.replace(/^colspan=\d+\|/, ''),
           querySelector: () => (control ? {} : null),
           classList: { toggle() {} } };
}
function table(rows) {
  const rs = rows.map((cells) => ({ cells: cells.map(cell), closest: () => null }));
  return { tBodies: [], rows: rs };
}

console.log('\nwhole columns');
check('a plain numeric column is found',
  NA.numericColumns(table([['HFO', '420.000'], ['LSFO', '95.000']])), [1]);
check('one non-number disqualifies the column',
  NA.numericColumns(table([['A', '420.0'], ['B', 'no gauge']])), []);
check('blanks do not disqualify',
  NA.numericColumns(table([['A', '420.0'], ['B', '\u2014']])), [1]);
check('a column of only blanks is not numeric',
  NA.numericColumns(table([['A', '\u2014'], ['B', '']])), []);
check('an "empty table" row does not decide a column',
  NA.numericColumns(table([['colspan=2|Nothing saved yet'], ['A', '1.0']])), [1]);
check('a cell holding an input leaves its column alone',
  NA.numericColumns(table([['A', '<input>'], ['B', '2.0']])), []);
check('two numeric columns side by side',
  NA.numericColumns(table([['A', '1.0', '2.0'], ['B', '3.0', '4.0']])), [1, 2]);
check('dates stay left, the figure beside them moves',
  NA.numericColumns(table([['2026-09-04', '1.0'], ['2026-09-05', '2.0']])), [1]);
check('a single-cell row decides nothing at all',
  NA.numericColumns(table([['just a note'], ['A', '1.0']])), [1]);

if (failures) {
  console.log(`\nFAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`\nPASSED — ${checks} checks`);
