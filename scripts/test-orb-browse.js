/**
 * e-ORB Browse & Print is the record book's own table: Date, Code, Item No., Record of operations,
 * with no ship header and no page footer, ten lines tall with the rest scrolling, and nothing
 * ticked until the engineer ticks it.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'modules/voyage/www/eorb.js'));
const EORB = globalThis.EORB;
const html = fs.readFileSync(path.join(ROOT, 'modules/voyage/www/index.html'), 'utf8');
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass += 1; };

const setup = EORB.defaultOrbSetup({ shipName: 'MV TEST' });
const entries = [
  { id: 'a1', part: 1, code: 'C', date: '2026-11-02', officerName: 'Ana Ruiz', officerRank: 'Chief Engineer',
    lines: [{ itemNo: '11.1', text: 'Sludge tank' }, { itemNo: '11.2', text: 'Capacity 4.20 m3' }] },
  { id: 'a2', part: 1, code: 'D', date: '2026-11-03', officerName: 'Ana Ruiz', officerRank: 'Chief Engineer',
    lines: [{ itemNo: '13', text: 'Bilge discharged 1 m3' }] }
];
const table = EORB.browseTableHtml(setup, entries, {});
ok(!/orb-book-head|orb-book-foot|orb-book-brand|orb-book-master|orb-book-partline/.test(table), 'no heading, no footer, no Master block');
ok(/<th>Date<\/th><th>Code<\/th><th>Item No\.<\/th><th>Record of operations/.test(table), 'the four columns of the book');
const boxes = table.match(/<input type="checkbox" class="orb-browse-check"[^>]*>/g) || [];
ok(boxes.length === 2, 'one tick per entry, not per line: ' + boxes.length);
ok(boxes.every(b => !/ checked/.test(b)), 'nothing ticked by default');
const picked = EORB.browseTableHtml(setup, entries, { selected: new Set(['a2']) });
ok((picked.match(/ checked/g) || []).length === 1 && /value="a2" checked/.test(picked), 'a selected entry shows ticked');
ok(/class="orb-code">C</.test(table) && /<td>11\.1<\/td>/.test(table), 'code and item number are in their own cells');
ok(/orb-sign-row/.test(table), 'the signature line is there, as in the book');
ok(/\.orb-browse thead th\{position:sticky/.test(EORB.BOOK_CSS), 'the column heads stay put while the lines scroll');
ok(/font-size:12px/.test(EORB.BOOK_CSS.slice(EORB.BOOK_CSS.indexOf('.orb-browse{'))), 'readable on a phone');
ok(/const ORB_BROWSE_LINES = 10;/.test(html), 'ten lines show at a time');
ok(/id="orbBrowseBook"/.test(html) && !/orbBrowseBody/.test(html), 'the page draws the book table, not the old list');
ok(!/class="orb-browse-check" value="\$\{[^}]*\}" checked/.test(html), 'the page never pre-ticks');
console.log(`e-ORB browse: ${pass} checks passed`);
