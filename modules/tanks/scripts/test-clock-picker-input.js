/**
 * Clock picker must not leave a full-screen overlay that blocks inputs,
 * and datetime-local must offer a Date tab (see scripts/test-clock-picker-input.js).
 *
 * Run: node modules/tanks/scripts/test-clock-picker-input.js
 */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const rootTest = path.join(__dirname, '..', '..', '..', 'scripts', 'test-clock-picker-input.js');
execFileSync(process.execPath, [rootTest], { stdio: 'inherit' });
