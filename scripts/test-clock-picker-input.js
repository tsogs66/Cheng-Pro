/**
 * Clock picker — Voyage Chief (AIO module), Tank, and shell must stay identical.
 * Standalone Voyage Chief carries the same file at repo root (voyage-manager).
 *
 * Run: node scripts/test-clock-picker-input.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const COPIES = [
  ['Voyage module (AIO /voyage/)', path.join(ROOT, 'modules/voyage/www/clock-picker.js')],
  ['Tank module', path.join(ROOT, 'modules/tanks/public/js/clock-picker.js')],
  ['AIO shell', path.join(ROOT, 'apps/web/js/clock-picker.js')],
];

for (const [label, file] of COPIES) {
  assert.ok(fs.existsSync(file), `${label} missing: ${file}`);
}

const bodies = COPIES.map(([, file]) => fs.readFileSync(file, 'utf8'));
assert.ok(bodies.every((b) => b === bodies[0]),
  'clock-picker.js must be byte-identical in modules/voyage/www, modules/tanks, and apps/web');

for (const [label, file] of COPIES) {
  const src = fs.readFileSync(file, 'utf8');
  assert(/inputmode="numeric"/.test(src) || /inputmode='numeric'/.test(src),
    `${label}: HH:MM parts must be typeable inputs`);
  assert(/detachActiveListeners|listeners:\s*\{/.test(src),
    `${label}: close() must detach window pointer listeners`);
  assert(/key === 'Escape'|key !== 'Escape'/.test(src),
    `${label}: Escape must dismiss the overlay`);
  assert(/querySelectorAll\('\.ccp-overlay'\)/.test(src),
    `${label}: close() must remove orphan overlays`);
  assert(!/user-select:none/.test(src.match(/\.ccp-readout\{[^}]+\}/)?.[0] || ''),
    `${label}: readout must not be user-select:none (blocks typing)`);
  assert(/data-ccp-tab="date"/.test(src),
    `${label}: datetime-local fields need a Date tab in the clock picker`);
  assert(/data-ccp-date-grid/.test(src),
    `${label}: clock picker must render a date grid for missed-report dates`);
  console.log('ok —', label);
}

const voyageHtml = path.join(ROOT, 'modules/voyage/www/voyage_manager.html');
const voyageIndex = path.join(ROOT, 'modules/voyage/www/index.html');
for (const [name, htmlPath] of [['voyage_manager.html', voyageHtml], ['index.html', voyageIndex]]) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert(/clock-picker\.js/.test(html), `${name} must load clock-picker.js`);
  assert(/ChengClockPicker\.install/.test(html), `${name} must install ChengClockPicker`);
  assert(/id="in_datetime"[^>]*type="datetime-local"|type="datetime-local"[^>]*id="in_datetime"/.test(html),
    `${name} log entry must use datetime-local for in_datetime`);
  console.log('ok — Voyage www', name, 'wires log entry datetime to clock picker');
}
