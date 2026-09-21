'use strict';

/**
 * Voyage Chief inside ChEng AIO must ship the same log-entry date/time picker
 * as standalone Voyage (clock-picker.js at /voyage/clock-picker.js).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const www = path.join(__dirname, '..', 'www');
const picker = path.join(www, 'clock-picker.js');
assert.ok(fs.existsSync(picker), 'modules/voyage/www/clock-picker.js is required for AIO Voyage');

const src = fs.readFileSync(picker, 'utf8');
assert(/data-ccp-tab="date"/.test(src), 'AIO Voyage clock picker must include Date tab for datetime-local');
assert(/bindInput\(el\)/.test(src) && /datetime-local/.test(src),
  'clock picker must bind datetime-local inputs (log entry Date & Time)');

for (const name of ['voyage_manager.html', 'index.html']) {
  const html = fs.readFileSync(path.join(www, name), 'utf8');
  assert(html.includes('clock-picker.js'), `${name} must reference clock-picker.js`);
  assert(/ChengClockPicker\.install/.test(html), `${name} must call ChengClockPicker.install()`);
}

console.log('ok — AIO Voyage module clock picker (log entry date + time)');
