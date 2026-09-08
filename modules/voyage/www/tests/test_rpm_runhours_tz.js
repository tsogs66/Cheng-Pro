#!/usr/bin/env node
/*
 * Editing an existing log entry: RPM must follow typed M/E run hours and TZ /
 * clock-change period length (rev counter held, RPM = Δrevs / (hrs×60)).
 * Run: node tests/test_rpm_runhours_tz.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function checkEq(label, actual, expected) {
  const ok = Object.is(actual, expected) ||
    (typeof actual === 'number' && typeof expected === 'number' && Math.abs(actual - expected) < 1e-6);
  checks++;
  console.log(ok ? `  ok  ${label}` : `  FAIL ${label}: expected ${expected}, got ${actual}`);
  if (!ok) failures++;
}

function extract(name) {
  const start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(name + ' not found');
  let depth = 0, i = HTML.indexOf('{', start);
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(start, i + 1);
}

console.log('\nsource guards');
check('liveMeRunHours helper', HTML.includes('function liveMeRunHours'));
check('syncRpmFromPeriodChange helper', HTML.includes('function syncRpmFromPeriodChange'));
check('getActivePeriodContext uses form when editing', HTML.includes('editingThis'));
check('run-hours input syncs RPM from period change', /me_runtime_period[\s\S]{0,200}syncRpmFromPeriodChange/.test(HTML));
check('TZ change prefers rev→RPM sync', /applyShipTzChange[\s\S]{0,2500}syncRpmFromPeriodChange/.test(HTML));
check('syncRpmRevCounter uses liveMeRunHours', /function syncRpmRevCounter[\s\S]{0,400}liveMeRunHours/.test(HTML));

console.log('\nRPM from revs / typed run hours');
const sandbox = { console, Math, isFinite, Number, Object };
vm.createContext(sandbox);
vm.runInContext(
  extract('entryMeRunHours') + '\n' +
  extract('rpmFromRevs') + '\n' +
  extract('effectiveRpm'),
  sandbox
);

const wall = 24;
const typed = 12;
const meHrs = sandbox.entryMeRunHours({ meRunHours: typed }, wall);
checkEq('typed run hours win over wall', meHrs, 12);
const dRevs = 12 * 60 * 80; // 80 RPM over 12 h
checkEq('RPM from typed hours', sandbox.rpmFromRevs(dRevs, meHrs), 80);
checkEq('effectiveRpm prefers Δrevs/hrs', sandbox.effectiveRpm(99, dRevs, meHrs), 80);
checkEq('halving hours doubles RPM', sandbox.rpmFromRevs(dRevs, 6), 160);
checkEq('no typed → wall hours', sandbox.entryMeRunHours({ meRunHours: null }, wall), 24);

console.log('');
if (failures) {
  console.log(`FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
