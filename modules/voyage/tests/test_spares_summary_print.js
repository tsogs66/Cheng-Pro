#!/usr/bin/env node
/*
 * Spares summary printout: tally first, then the sent and received lists.
 * Runs the real functions from voyage_manager.html; the page probe is stubbed,
 * so pagination takes its fixed fallback (8 rows on page 1, then 22 a page).
 * ChEng AIO copy: www/voyage_manager.html, with www/index.html kept identical.
 * Run: node modules/voyage/tests/test_spares_summary_print.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', 'www');
const HTML = fs.readFileSync(path.join(WWW, 'voyage_manager.html'), 'utf8');

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function extractFunction(name) {
  const start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  let i = HTML.indexOf('{', start);
  let depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error(`unbalanced function ${name}`);
}
function extractConst(name) {
  const m = HTML.match(new RegExp(`const ${name} = \\[[\\s\\S]*?\\n\\];`));
  if (!m) throw new Error(`missing const ${name}`);
  return m[0].replace(/^const /, 'var ');
}

const src = [
  extractConst('REQ_STATUSES'),
  ...['reqStatusLabel', 'reqKindLabel', 'reqSortByDate', 'requisitionLists', 'requisitionTally',
    'buildRequisitionPrintSheets', 'paginateRangeTotalSheets', 'printKpiRow', 'printSection',
    'printMetaGrid', 'escPrint'].map(extractFunction),
].join('\n');

const sandbox = {
  state: { setup: { vesselName: 'MV TEST', voyageNumber: '42' } },
  RANGE_PRINT_MIN_SCALE: 0.8,
  createPortraitPageProbe: () => ({ usable: false, destroy() {} }),
  printDocHeader: (o) => `<header>${o.title} | ${o.subtitle}</header>`,
  printSignatory: () => '<footer>SIGNATORY</footer>',
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

let seq = 0;
function req(kind, status, desc, sentDate, receiveDate) {
  seq++;
  return { id: 'rq' + seq, kind, status, description: desc, sentDate, receiveDate: receiveDate || '',
    createdAt: `2026-10-${String(seq).padStart(2, '0')}T00:00:00Z`, files: seq % 3 ? [] : [{ id: 'f' }] };
}

console.log('\nAIO copies');
check('www/index.html matches www/voyage_manager.html', fs.readFileSync(path.join(WWW, 'index.html'), 'utf8') === HTML);

console.log('\nTally');
const mixed = [
  req('spare', 'sent', 'Fuel pump plunger', '2026-10-01'),
  req('spare', 'follow-up', 'Exhaust valve spindle', '2026-09-20'),
  req('store', 'receiving', 'Paint, 40 L', '2026-10-05'),
  req('store', 'received', 'Rags', '2026-09-01', '2026-09-15'),
  req('spare', 'received', 'O-rings', '2026-09-03', '2026-09-20'),
  req('spare', 'mystery', 'Unknown status line', '2026-10-10'),
];
const t = sandbox.requisitionTally(mixed);
check('total counts every line', t.total === 6, t.total);
check('outstanding = all but received', t.outstanding === 4, t.outstanding);
check('received count', t.received === 2, t.received);
check('unknown status counted as Sent', t.byStatus.sent === 2, JSON.stringify(t.byStatus));
check('per-kind split', t.byKind.spare.received === 1 && t.byKind.store.received === 1 && t.byKind.store.receiving === 1,
  JSON.stringify(t.byKind));
check('status columns add up to total',
  Object.values(t.byStatus).reduce((a, b) => a + b, 0) === t.total);

console.log('\nSingle page');
const one = sandbox.buildRequisitionPrintSheets(mixed);
check('fits on one page', one.length === 1, one.length);
const p = one[0];
const iTally = p.indexOf('Tally'), iSent = p.indexOf('Sent — Still With The Supplier'), iRecv = p.indexOf('Received — On Board');
check('tally before the lists', iTally > 0 && iTally < iSent, `${iTally} / ${iSent}`);
check('sent list before received list', iSent < iRecv, `${iSent} / ${iRecv}`);
check('KPI shows total requisitions', /<div class="pr-kpi-val">6<\/div><div class="pr-kpi-lbl">Requisitions/.test(p));
check('list headers carry counts', p.includes('Sent — Still With The Supplier (4)') && p.includes('Received — On Board (2)'));
const tallyRows = [...p.slice(iTally, iSent).matchAll(/<td class="row-lbl">(?:<strong>)?([^<]+)/g)].map(m => m[1]);
check('tally rows in the order a line moves',
  JSON.stringify(tallyRows) === JSON.stringify(['Sent', 'For follow up', 'For receiving', 'On sent list', 'Received', 'All requisitions']),
  JSON.stringify(tallyRows));
check('"On sent list" subtotal matches the sent list count', /On sent list<\/strong><\/td>\s*<td><strong>\d+<\/strong><\/td>\s*<td><strong>\d+<\/strong><\/td>\s*<td><strong>4<\/strong>/.test(p));
check('KPI "On Sent List" matches', /<div class="pr-kpi-val">4<\/div><div class="pr-kpi-lbl">On Sent List/.test(p));
check('status labels printed', p.includes('For follow up') && p.includes('For receiving'));
check('follow-up line highlighted', p.includes('pr-req-follow'));
const sentBlock = p.slice(iSent, iRecv);
check('received lines not on the sent list', !sentBlock.includes('O-rings') && !sentBlock.includes('Rags'));
check('received dates printed', p.slice(iRecv).includes('2026-09-15'));
check('signatory on the page', p.includes('SIGNATORY'));
check('no "continued" on a single page', !p.includes('Continued'));

console.log('\nEscaping');
const esc = sandbox.buildRequisitionPrintSheets([req('spare', 'sent', '<b>Gasket</b> & seal', '2026-10-01')])[0];
check('description is escaped', esc.includes('&lt;b&gt;Gasket&lt;/b&gt; &amp; seal') && !esc.includes('<b>Gasket'));

console.log('\nEmpty list on the sheet');
const onlySent = sandbox.buildRequisitionPrintSheets([req('spare', 'sent', 'Filter', '2026-10-01')])[0];
check('empty received list says so', onlySent.includes('Received — On Board (0)') && onlySent.includes('Nothing on the received list.'));
const onlyRecv = sandbox.buildRequisitionPrintSheets([req('store', 'received', 'Soap', '2026-10-01', '2026-10-03')])[0];
check('empty sent list says so, before received',
  onlyRecv.indexOf('Nothing on the sent list.') > 0 && onlyRecv.indexOf('Nothing on the sent list.') < onlyRecv.indexOf('Received — On Board (1)'));

console.log('\nLong log across pages');
const long = [];
for (let i = 0; i < 25; i++) long.push(req('spare', i % 5 === 0 ? 'follow-up' : 'sent', `Sent item ${i + 1}`, `2026-08-${String((i % 28) + 1).padStart(2, '0')}`));
for (let i = 0; i < 15; i++) long.push(req('store', 'received', `Received item ${i + 1}`, '2026-07-01', `2026-07-${String((i % 28) + 1).padStart(2, '0')}`));
const pages = sandbox.buildRequisitionPrintSheets(long);
check('40 lines make 3 pages (8 + 22 + 10)', pages.length === 3, pages.length);
check('page numbers in subtitle', pages[0].includes('Page 1 of 3') && pages[2].includes('Page 3 of 3'));
check('tally only on the first page', pages[0].includes('>Tally<') && !pages[1].includes('>Tally<') && !pages[2].includes('>Tally<'));
check('signatory only on the last page', !pages[0].includes('SIGNATORY') && !pages[1].includes('SIGNATORY') && pages[2].includes('SIGNATORY'));
check('"continued" note on all but the last', pages[0].includes('Continued on the next page.') && pages[1].includes('Continued on the next page.') && !pages[2].includes('Continued on the next page.'));
check('sent list continues on page 2', pages[1].includes('Sent — Still With The Supplier (25) — Continued'));
check('received list starts on page 2 without "continued"', pages[1].includes('Received — On Board (15)<') || /Received — On Board \(15\)<\/h3>/.test(pages[1]));
check('received list continues on page 3', pages[2].includes('Received — On Board (15) — Continued'));
const all = pages.join('');
const sentNos = [...all.matchAll(/Sent item (\d+)/g)].length;
const recvNos = [...all.matchAll(/Received item (\d+)/g)].length;
check('every line printed once', sentNos === 25 && recvNos === 15, `${sentNos} / ${recvNos}`);
check('numbering runs per list (sent ends 25, received 15)', /<td>25<\/td>\s*<td>Spare/.test(all) && /<td>15<\/td>\s*<td>Store/.test(all));

console.log('\nPage wiring');
check('Print summary button on the spares page', /id="page-spares"[\s\S]{0,1200}id="btnReqPrint"/.test(HTML));
check('button wired to printRequisitionSummary', HTML.includes("getElementById('btnReqPrint')?.addEventListener('click', printRequisitionSummary)"));
check('prints through the portrait page printer', /function printRequisitionSummary\(\)\{[\s\S]{0,300}printPortraitPages\(buildRequisitionPrintSheets\(rows\)\)/.test(HTML));
check('screen and print share one list split', /function renderRequisitions\(\)\{[\s\S]{0,700}requisitionLists\(rows\)/.test(HTML));

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
