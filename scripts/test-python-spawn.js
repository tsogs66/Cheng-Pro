/**
 * Regression: voyage-sync must not spawn bare `python3` (Windows ENOENT → Electron crash).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const voyageSyncSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'voyage-sync.js'), 'utf8');
assert(
  !/spawn\(\s*['"]python3['"]/.test(voyageSyncSrc),
  'voyage-sync.js must not hard-code spawn("python3")'
);
assert(
  /spawnPythonProcess/.test(voyageSyncSrc),
  'voyage-sync.js must use spawnPythonProcess'
);

const pythonRun = require('../modules/tanks/server/python-run');
assert.strictEqual(typeof pythonRun.spawnPythonProcess, 'function');
assert.strictEqual(typeof pythonRun.pythonCandidates, 'function');

const candidates = pythonRun.pythonCandidates();
assert(Array.isArray(candidates) && candidates.length > 0, 'expected python candidates');
if (process.platform === 'win32') {
  assert(!candidates.includes('python3'), 'Windows candidates should not prefer bare python3');
}

const tankIo = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'tanks', 'server', 'tank-table-io.js'),
  'utf8'
);
assert(!/spawn\(\s*['"]python3['"]/.test(tankIo), 'tank-table-io must not hard-code python3');

console.log('ok — python spawn helpers avoid bare python3 on Windows');
