/*
 * A bunker received after the latest report is not in any R.O.B. gauge yet. The R.O.B. page says so,
 * with the quantity, instead of leaving the old figure to be read as the whole picture.
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'modules', 'voyage', 'www', 'voyage_manager.html'), 'utf8');
function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function not found: ' + name);
  let depth = 0, j = html.indexOf('{', i);
  const start = i;
  for (; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) break;
  }
  return html.slice(start, j + 1);
}
let failed = 0, checks = 0;
const check = (label, actual, expected) => {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failed++; console.log(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
};
function build(entries, receipts) {
  const code = [grab('receiptDayAfter'), grab('pendingReceiptsAfterLatest')].join('\n') +
    '\nreturn pendingReceiptsAfterLatest;';
  return new Function('sortedEntries', 'state', code)(() => entries, { receipts })();
}
const entries = [{ datetime: '2026-07-04T12:00' }, { datetime: '2026-07-05T12:00' }];
check('no receipts, nothing pending', build(entries, []), []);
check('a receipt before the latest report is already in it',
  build(entries, [{ id: 'a', date: '2026-07-04', category: 'fuel', qty: 10 }]), []);
check('a receipt on the latest report day is counted in it',
  build(entries, [{ id: 'a', date: '2026-07-05', category: 'fuel', qty: 10 }]), []);
check('a receipt after the latest report is pending',
  build(entries, [{ id: 'a', date: '2026-11-15', category: 'fuel', qty: 1250.5 }]).map(r => r.id), ['a']);
check('a zero quantity is ignored',
  build(entries, [{ id: 'a', date: '2026-11-15', category: 'fuel', qty: 0 }]), []);
check('no entries yet: nothing to be pending against', build([], [{ id: 'a', date: '2026-11-15', category: 'fuel', qty: 5 }]), []);
console.log(failed ? `FAILED — ${failed} of ${checks}` : `PASSED — ${checks} checks`);
process.exit(failed ? 1 : 0);
