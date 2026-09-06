#!/usr/bin/env node
/*
 * Voyage-chief ROB scenarios (log entry + summary):
 *  - first entry baselines Vessel Setup ROB + flowmeters (ignore stale carryover)
 *  - Received only when stamped (no phantom derived figures)
 *  - stamp + rob-survey receipt never double-count
 *  - next report Previous = prior closing
 *  - multi-tank same grade does not invent Received from grade-level cons
 *
 * Run: node tests/test_rob_voyage_chief_scenarios.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');

let checks = 0, failures = 0;
function check(label, cond) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
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
check('Received not derived from balance', HTML.includes('Received is user/stamped input only'));
check('FW live update does not invent Received', HTML.includes('Do not auto-fill Received from the FW balance'));
check('Create New Voyage syncs flowmeters', HTML.includes('Keep Vessel Setup flowmeters in step with the carryover'));
check('empty log prefers setup meters', HTML.includes('const logEmpty = !sortedEntries().length'));
check('rob-survey mirror is stamp fallback only', HTML.includes('ONLY a fallback when an old entry has no'));

const FUEL = [
  { id: 'hfo1', name: 'HFO TK1', grade: 'HFO' },
  { id: 'hfo2', name: 'HFO TK2', grade: 'HFO' },
  { id: 'mdo', name: 'MDO', grade: 'MDO/MGO' },
];
const LUBE = [{ id: 'cylhigh', name: 'CYL HIGH', kind: 'cylHigh' }];
const FW = [{ id: 'fw', name: 'FRESH WATER' }];

function makeSandbox(state) {
  const sandbox = {
    state,
    FUEL_TYPES: ['HFO', 'LSFO', 'MDO/MGO', 'LSMGO'],
    fuelTankList: () => FUEL,
    lubeTankList: () => LUBE,
    fwTankList: () => FW,
    tankRobValue: (store, t) => store?.[t.id] ?? store?.[t.name] ?? 0,
    receiptMatchesTank: (r, tank, cat) => !!(r && tank && r.category === cat && r.tankId === tank.id),
    deductGradeConsumption: (rob, tanks, grade, key, amount) => {
      const group = tanks.filter(t => t[key] === grade);
      if (!group.length || !(amount > 0)) return;
      const total = group.reduce((s, t) => s + (rob[t.id] || 0), 0);
      if (total <= 0) { rob[group[0].id] = (rob[group[0].id] || 0) - amount; return; }
      group.forEach(t => { rob[t.id] = (rob[t.id] || 0) - amount * ((rob[t.id] || 0) / total); });
    },
    deductLubeConsumption: (robLube, kind, amount) => {
      if (!(amount > 0)) return;
      const t = LUBE.find(x => x.kind === kind);
      if (t) robLube[t.id] = (robLube[t.id] || 0) - amount;
    },
    latestRobSurveyAtOrBefore: () => null,
    receiptDayAfter: (a, b) => String(a || '').slice(0, 10) > String(b || '').slice(0, 10),
    computeDerived: () => ({ rows: state._rows }),
    latestFwRob: () => 50000,
    sortedEntries: () => (state.entries || []).slice().sort((a, b) => new Date(a.datetime) - new Date(b.datetime)),
    voyageInitReference: (setup) => setup && setup.initDateTime
      ? { datetime: setup.initDateTime, tzOffsetMin: setup.tzOffsetMin ?? 0 }
      : null,
    getRobRows: () => [
      ...FUEL.map(t => ({ key: t.id, label: t.name, cat: 'fuel', grade: t.grade })),
      ...LUBE.map(t => ({ key: t.id, label: t.name, cat: 'lube', kind: t.kind })),
      ...FW.map(t => ({ key: t.id, label: t.name, cat: 'fw' })),
    ],
    robRowCons: (row, r) => (r.cat === 'fuel' ? (row.consByType?.[r.grade] ?? null) : 0),
    robDec: () => 3,
    totalLubeRob: (m) => Object.values(m || {}).reduce((s, v) => s + (Number(v) || 0), 0),
    totalFwRob: (m) => Number(m?.fw) || 0,
    sumRobCons: () => 0,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    'entryHasStampedReceived',
    'stampedReceivedAsOf',
    'robAsOfComputedRow',
    'entryRobReceivedQty',
    'robBalanceRows',
    'carryoverFromSetup',
    'effectiveCarryover',
  ].map(extract).join('\n'), sandbox);
  return sandbox;
}

function makeRow(id, dt, cumHfo, cumMdo, extra) {
  return Object.assign({
    id, datetime: dt,
    cumFuel: { HFO: cumHfo, 'MDO/MGO': cumMdo || 0, LSFO: 0, LSMGO: 0 },
    cumLube: { 'CYL HIGH': 0, 'CYL LOW': 0, 'ME SYS OIL': 0, 'GE SYS OIL': 0 },
    consByType: { HFO: 0, 'MDO/MGO': 0 },
  }, extra || {});
}

console.log('\n1) first entry Previous = Vessel Setup ROB; empty log ignores stale carryover meters');
{
  const state = {
    setup: {
      initDateTime: '2026-09-01T00:00',
      tzOffsetMin: 0,
      flowArr: 'SINGLE',
      flowmeters: {
        main: { reading: 100000, digits: 8 },
        aux: { reading: 20000, digits: 8 },
        boiler: { reading: 5000, digits: 8 },
        cyl: { reading: 1000, digits: 8 },
        rc: { reading: 500000, digits: 8 },
        fw: { reading: 100, digits: 8 },
      },
      defaults: {},
      rob: { hfo1: 400, hfo2: 200, mdo: 80 },
      robLube: { cylhigh: 5000, fw: 60000 },
      carryover: {
        datetime: '2026-08-01T00:00',
        me: { meter: 9000000 },
        ge: { meter: 8000000 },
        blr: { meter: 700000 },
      },
    },
    entries: [],
    receipts: [],
    _rows: [],
  };
  const sb = makeSandbox(state);
  const co = sb.effectiveCarryover();
  checkEq('empty log ME meter from setup (not stale carryover)', co.me.meter, 100000);
  checkEq('empty log GE meter from setup', co.ge.meter, 20000);

  state.entries = [{ id: 'e1', datetime: '2026-09-01T12:00', robReceived: null, robReceivedLube: null }];
  state._rows = [makeRow('e1', '2026-09-01T12:00', 12, 1, { consByType: { HFO: 12, 'MDO/MGO': 1 } })];
  const asOf = sb.robAsOfComputedRow(state._rows[0], state._rows);
  checkEq('first closing HFO TK1 without bunker', asOf.rob.hfo1, 392);
  checkEq('first closing HFO TK2 without bunker', asOf.rob.hfo2, 196);
  const bal = sb.robBalanceRows(state._rows[0], { rob: state.setup.rob, robLube: state.setup.robLube }, asOf, state.entries[0]);
  const hfoRows = bal.filter(r => r.key === 'hfo1' || r.key === 'hfo2');
  check('no ghost Received on new first entry', hfoRows.every(r => r.recvVal == null));
  checkEq('Previous on first entry is setup ROB TK1', hfoRows.find(r => r.key === 'hfo1').prevVal, 400);
}

console.log('\n2) typed Received stamps once — next Previous = closing, not stacked');
{
  const state = {
    setup: { rob: { hfo1: 400, hfo2: 200, mdo: 80 }, robLube: { cylhigh: 5000, fw: 60000 } },
    entries: [
      { id: 'e1', datetime: '2026-09-01T12:00', robReceived: { hfo1: 50 }, robReceivedLube: {} },
      { id: 'e2', datetime: '2026-09-02T12:00', robReceived: null, robReceivedLube: null },
    ],
    receipts: [
      { id: 'r1', date: '2026-09-01T12:00', category: 'fuel', tankId: 'hfo1', qty: 50, source: 'rob-survey', surveyEntryId: 'e1' },
    ],
    _rows: [
      makeRow('e1', '2026-09-01T12:00', 10, 1, { consByType: { HFO: 10, 'MDO/MGO': 1 } }),
      makeRow('e2', '2026-09-02T12:00', 20, 2, { consByType: { HFO: 10, 'MDO/MGO': 1 } }),
    ],
  };
  const sb = makeSandbox(state);
  const e1 = sb.robAsOfComputedRow(state._rows[0], state._rows);
  const e2 = sb.robAsOfComputedRow(state._rows[1], state._rows);
  checkEq('e1 HFO total with single 50 received (no double)', e1.rob.hfo1 + e1.rob.hfo2, 640);
  checkEq('e2 HFO total after further burn', e2.rob.hfo1 + e2.rob.hfo2, 630);

  const bal2 = sb.robBalanceRows(state._rows[1], e1, e2, state.entries[1]);
  const h1 = bal2.find(r => r.key === 'hfo1');
  checkEq('e2 Previous TK1 equals e1 closing', h1.prevVal, e1.rob.hfo1);
  check('e2 Received blank when not stamped', h1.recvVal == null);
  const again = sb.robAsOfComputedRow(state._rows[0], state._rows);
  checkEq('recompute e1 still single-count', again.rob.hfo1 + again.rob.hfo2, 640);
}

console.log('\n3) legacy rob-survey receipt without stamp still counts once');
{
  const state = {
    setup: { rob: { hfo1: 100, hfo2: 0, mdo: 0 }, robLube: {} },
    entries: [{ id: 'e1', datetime: '2026-09-01T12:00', robReceived: null, robReceivedLube: null }],
    receipts: [
      { id: 'r1', date: '2026-09-01T12:00', category: 'fuel', tankId: 'hfo1', qty: 30, source: 'rob-survey', surveyEntryId: 'e1' },
    ],
    _rows: [makeRow('e1', '2026-09-01T12:00', 0, 0)],
  };
  const sb = makeSandbox(state);
  checkEq('unstamped survey receipt still applies', sb.robAsOfComputedRow(state._rows[0], state._rows).rob.hfo1, 130);
}

console.log('\n4) hand-logged bunker stacks with stamped Received on another tank');
{
  const state = {
    setup: { rob: { hfo1: 100, hfo2: 100, mdo: 0 }, robLube: {} },
    entries: [{ id: 'e1', datetime: '2026-09-01T12:00', robReceived: { hfo2: 20 }, robReceivedLube: {} }],
    receipts: [
      { id: 'hand', date: '2026-09-01T12:00', category: 'fuel', tankId: 'hfo1', qty: 15, source: 'manual' },
      { id: 'mir', date: '2026-09-01T12:00', category: 'fuel', tankId: 'hfo2', qty: 20, source: 'rob-survey', surveyEntryId: 'e1' },
    ],
    _rows: [makeRow('e1', '2026-09-01T12:00', 0, 0)],
  };
  const sb = makeSandbox(state);
  const asOf = sb.robAsOfComputedRow(state._rows[0], state._rows);
  checkEq('manual receipt on TK1', asOf.rob.hfo1, 115);
  checkEq('stamped (not mirrored twice) on TK2', asOf.rob.hfo2, 120);
}

console.log('\n5) multi-tank grade cons must not invent Received in the balance table');
{
  const state = {
    setup: { rob: { hfo1: 300, hfo2: 300, mdo: 50 }, robLube: {} },
    entries: [{ id: 'e1', datetime: '2026-09-01T12:00' }],
    receipts: [],
    _rows: [makeRow('e1', '2026-09-01T12:00', 30, 0, { consByType: { HFO: 30, 'MDO/MGO': 0 } })],
  };
  const sb = makeSandbox(state);
  const asOf = sb.robAsOfComputedRow(state._rows[0], state._rows);
  const bal = sb.robBalanceRows(state._rows[0], { rob: state.setup.rob, robLube: {} }, asOf, state.entries[0]);
  check('multi-tank HFO shows no derived Received',
    bal.filter(r => (r.key === 'hfo1' || r.key === 'hfo2') && r.recvVal).length === 0);
  const wouldHavePhantom = bal.filter(r => r.key === 'hfo1' || r.key === 'hfo2').some(r => {
    const derived = (Number(r.nowVal) || 0) - (Number(r.prevVal) || 0) + 30;
    return Math.abs(derived - 15) < 1e-6;
  });
  check('old derived formula would have shown ~15 phantom (sanity)', wouldHavePhantom);
}

console.log();
if (failures) {
  console.log(`FAILED — ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
