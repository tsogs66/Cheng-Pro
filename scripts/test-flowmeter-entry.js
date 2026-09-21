#!/usr/bin/env node
/*
 * The Enter Flowmeters popup, and the log entry fields behind it, have to be
 * typeable — on a tablet, with a finger or a stylus. The popup used to
 * re-select the whole reading on every tap inside it and cancel the tap with
 * preventDefault, so once a field was open its value stayed highlighted: a
 * caret could not be placed, and the first stroke wiped the figure.
 *
 * Both copies of the Voyage page are checked, because the server serves
 * index.html for a direct /voyage/ and voyage_manager.html for the module.
 *
 * Run: node scripts/test-flowmeter-entry.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILES = [
  'modules/voyage/www/voyage_manager.html',
  'modules/voyage/www/index.html',
];

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log('\nFlowmeter entry — typing and caret placement');
for (const rel of FILES) {
  const html = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const name = path.basename(path.dirname(rel)) + '/' + path.basename(rel);
  check(`${name}: a tap on the field being edited places a caret`,
    /let wasFocused = false;/.test(html)
    && /overlay\.addEventListener\('pointerdown'[\s\S]{0,200}wasFocused =/.test(html)
    && /const keep = \(e\)=>\{[\s\S]{0,400}if \(wasFocused\) return;/.test(html));
  check(`${name}: the popup does not cancel the tap it fires on`,
    !/e\.cancelable && e\.type !== 'touchend'\) e\.preventDefault\(\)/.test(html));
  check(`${name}: the deferred re-select gives way to a placed caret`,
    /setTimeout\(\(\)=>\{[\s\S]{0,420}el\.selectionStart !== el\.selectionEnd\) return;[\s\S]{0,120}el\.selectionStart !== 0\) return;/.test(html));
  check(`${name}: selectionStart on a number input cannot abort the coercion`,
    /let start = null;\s*try \{ start = el\.selectionStart; \} catch\(_e\)\{\}\s*el\.value = out;/.test(html));
  check(`${name}: RPM/rev sync must not toFixed the field being typed`,
    /function setFmqUnlessFocused/.test(html)
    && /setFmqUnlessFocused\('fmq_revCounter'/.test(html)
    && /finalizeFmqDecimalField/.test(html));
}

if (failures) {
  console.log(`\n${failures}/${checks} failed`);
  process.exit(1);
}
console.log(`\nflowmeter entry: ${checks} checks passed across ${FILES.length} copies`);
