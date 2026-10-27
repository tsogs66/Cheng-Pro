/*
 * A saved print is the report line as text, with a type that names the sheet.
 * The stamp and the signature are not part of that file.
 *
 * Run: node scripts/test-print-history-text.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/voyage_manager.html'), 'utf8');

const INDEX = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/index.html'), 'utf8');
if (INDEX !== HTML) {
  console.log('  FAIL the two embedded Voyage pages differ');
  process.exit(1);
}
console.log('  ok   both embedded Voyage pages match');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

function extract(name) {
  const start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
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

const sb = { console, JSON, Object, Array, String, Date, state: { entries: [] } };
vm.createContext(sb);
vm.runInContext([
  extract('omitPrintDataUrls'),
  extract('findPrintEntry'),
  extract('printReportText'),
  extract('slimPrintRecord'),
  extract('printHistoryFileName')
].join('\n'), sb);

const photo = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
const entry = {
  id: 'e1',
  datetime: '2026-10-01T12:00',
  operation: 'NOON',
  condition: 'B',
  chEng: 'A. Santos',
  distanceShip: 180,
  vesselStamp: photo,
  report: { remarks: 'All well', photo: photo }
};
const old = {
  id: 'p1',
  printedAt: '2026-10-01T13:00:00.000Z',
  label: 'noon-report',
  vesselId: 'v1',
  entryDatetime: '2026-10-01T12:00',
  operation: 'NOON',
  html: '<html>' + photo + '</html>'
};

const slim = sb.slimPrintRecord(old, [entry]);
check('the web page is dropped', slim.html, undefined);
check('the type is the sheet', slim.type, 'noon-report');
const parsed = JSON.parse(slim.text);
check('the file names the sheet', parsed.type, 'noon-report');
check('the file keeps the chief engineer name', parsed.chiefEngineer, 'A. Santos');
check('the file keeps the report figures', parsed.line.distanceShip, 180);
check('the file keeps the remarks', parsed.line.report.remarks, 'All well');
check('the photo is not in the file', parsed.line.report.photo, undefined);
check('a stamp carried on the line is blank', parsed.line.vesselStamp, '');
check('no picture text remains', slim.text.includes('data:image'), false);
check('download is a text file', sb.printHistoryFileName(slim).endsWith('.txt'), true);

const gone = sb.slimPrintRecord({
  id: 'p2',
  printedAt: '2026-10-02T00:00:00.000Z',
  label: 'voyage-summary',
  entryDatetime: 'missing',
  html: '<html>page</html>'
}, []);
check('a page with no report line still drops the web page', gone.html, undefined);
check('its type is kept', JSON.parse(gone.text).type, 'voyage-summary');
check('its line is empty', JSON.parse(gone.text).line, null);

const again = sb.slimPrintRecord(slim, []);
check('a text record is kept as it is', again.text, slim.text);
check('reading it again does not put the page back', again.html, undefined);

const saved = extract('recordPrintHistory');
check('a new print is not stored as a web page', saved.includes('html:'), false);
check('print again asks for the sheet of that type', HTML.includes('sheetHtmlForPrintType(type, entry)'), true);

if (fails) {
  console.log(`\nFAILED — ${fails} of ${checks}`);
  process.exit(1);
}
console.log(`\nPASSED — ${checks} checks`);
