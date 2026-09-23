'use strict';
/**
 * Home Calculated ROB grade book — LSMGO must use the same path as LSFO
 * (extras + per-grade override, not all-or-nothing).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../apps/web/js/voyage-bridge.js'), 'utf8');
const sandbox = { console, globalThis: {} };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox);
const Bridge = sandbox.ChengProVoyageBridge;
if (!Bridge || !Bridge.homeSavedFuelConsByGrade || !Bridge.buildHomeCalculatedRob) {
  console.error('FAIL: helpers not exported');
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('OK:', msg);
}

function roundFuelMt(n) {
  return Number(Number(n).toFixed(3));
}

const tanks = [
  { id: 'lsfo', name: 'LSFO', grade: 'LSFO' },
  { id: 'lsmgo', name: 'LSMGO', grade: 'LSMGO' },
  { id: 'mdo', name: 'MDO/MGO', grade: 'MDO/MGO' },
];

/* Extras must count for LSMGO (and MDO/MGO), same as Voyage. */
{
  const entries = [{
    datetime: '2026-09-01T12:00',
    me: { type: 'LSFO', meter: 100, sg: 0.95 },
    ge: { type: 'MDO/MGO', meter: 50, sg: 0.85 },
    blr: { type: 'MDO/MGO', meter: 10, sg: 0.85 },
    unitOverride: { ME: 12, GE: 2, BLR: 1 },
    miscCons: { 'MDO/MGO': 0.1, LSMGO: 0.4 },
    blrExtraCons: { 'MDO/MGO': 0.05, LSMGO: 0.2 },
    incExtraCons: { 'MDO/MGO': 0.02, LSMGO: 0.15 },
  }];
  const g = Bridge.homeSavedFuelConsByGrade(entries, tanks, null);
  assert(Math.abs(g.LSFO - 12) < 1e-9, `LSFO from ME override = 12 (got ${g.LSFO})`);
  assert(Math.abs(g['MDO/MGO'] - (2 + 1 + 0.1 + 0.05 + 0.02)) < 1e-9,
    `MDO/MGO includes GE+BLR+misc+extras (got ${g['MDO/MGO']})`);
  assert(Math.abs(g.LSMGO - (0.4 + 0.2 + 0.15)) < 1e-9,
    `LSMGO includes misc+blrExtra+incExtra (got ${g.LSMGO})`);
}

/* Per-grade override must not wipe other grades (old all-or-nothing bug). */
{
  const entries = [{
    datetime: '2026-09-02T12:00',
    me: { type: 'LSFO' },
    ge: { type: 'LSMGO' },
    blr: { type: 'LSMGO' },
    unitOverride: { ME: 10, GE: 3, BLR: 1 },
    miscCons: { 'MDO/MGO': 0, LSMGO: 0.5 },
    blrExtraCons: { LSMGO: 0.25 },
    incExtraCons: { LSMGO: 0.1 },
    consOverride: { LSFO: 9.5 },
  }];
  const g = Bridge.homeSavedFuelConsByGrade(entries, tanks, null);
  assert(Math.abs(g.LSFO - 9.5) < 1e-9, `LSFO uses grade override 9.5 (got ${g.LSFO})`);
  assert(Math.abs(g.LSMGO - (3 + 1 + 0.5 + 0.25 + 0.1)) < 1e-9,
    `LSMGO still accumulates when LSFO is overridden (got ${g.LSMGO})`);
}

/* Tank-id override (e.g. { lsmgo: 61 }) must apply like Voyage. */
{
  const entries = [{
    datetime: '2026-09-03T12:00',
    me: { type: 'LSFO' },
    ge: { type: 'LSMGO' },
    blr: { type: 'LSMGO' },
    unitOverride: { ME: 1, GE: 1, BLR: 1 },
    miscCons: {},
    blrExtraCons: {},
    incExtraCons: {},
    consOverride: { lsmgo: 61 },
  }];
  const g = Bridge.homeSavedFuelConsByGrade(entries, tanks, null);
  assert(Math.abs(g.LSMGO - 61) < 1e-9, `LSMGO tank-id override 61 (got ${g.LSMGO})`);
  assert(Math.abs(g.LSFO - 1) < 1e-9, `LSFO still from ME when LSMGO overridden (got ${g.LSFO})`);
}

/* Multi-tank same grade: deduct by live stock (matches Voyage robAsOf), not fixed share. */
{
  const setup = {
    fuelTanks: [
      { id: 't1', name: 'LSFO TK1', grade: 'LSFO' },
      { id: 't2', name: 'LSFO TK2', grade: 'LSFO' },
    ],
    rob: { t1: 100, t2: 100 },
    carryover: null,
  };
  const entries = [{
    datetime: '2026-09-05T12:00',
    me: { type: 'LSFO' },
    ge: { type: 'LSFO' },
    blr: { type: 'LSFO' },
    unitOverride: { ME: 50, GE: 0, BLR: 0 },
    miscCons: {},
    blrExtraCons: {},
    incExtraCons: {},
  }];
  const receipts = [{ date: '2026-09-05', category: 'fuel', tankId: 't1', qty: 100, source: 'hand' }];
  const calc = Bridge.buildHomeCalculatedRob(setup, entries, receipts);
  assert(Math.abs(calc.robCurrent.t1 - (200 - (200 / 300) * 50)) < 1e-6,
    `TK1 present after stock-weighted 50 MT burn (got ${calc.robCurrent.t1})`);
  assert(Math.abs(calc.robCurrent.t2 - (100 - (100 / 300) * 50)) < 1e-6,
    `TK2 present after stock-weighted 50 MT burn (got ${calc.robCurrent.t2})`);
}

/* Used = Opening + voyage Received − Present (Dep/Arr Consumed), prefer-once bunkers. */
{
  const setup = {
    fuelTanks: [{ id: 'lsfo1', name: 'LSFO TK', grade: 'LSFO' }],
    rob: { lsfo1: 500 },
    carryover: null,
  };
  const entries = [{
    id: 'e1',
    datetime: '2026-09-01T12:00',
    me: { type: 'LSFO', meter: 1000, sg: 0.95 },
    ge: { type: 'LSFO', meter: 100, sg: 0.95 },
    blr: { type: 'LSFO', meter: 10, sg: 0.95 },
    unitOverride: { ME: 30, GE: 0, BLR: 0 },
    robReceived: { lsfo1: 50 },
  }];
  const receipts = [
    { id: 'hand', date: '2026-09-01', category: 'fuel', tankId: 'lsfo1', qty: 50 },
    { id: 'mir', date: '2026-09-01', category: 'fuel', tankId: 'lsfo1', qty: 50, source: 'rob-survey', surveyEntryId: 'e1' },
  ];
  const calc = Bridge.buildHomeCalculatedRob(setup, entries, receipts);
  assert(Math.abs(calc.robUsed.lsfo1 - 30) < 1e-9,
    `Used matches burn when hand+stamp not doubled (got ${calc.robUsed.lsfo1})`);
  assert(Math.abs(calc.robCurrent.lsfo1 - 520) < 1e-9,
    `Present 500+50−30 (got ${calc.robCurrent.lsfo1})`);
}

/* Present book: Opening + Received − Consumed for LSMGO. */
{
  const setup = {
    fuelTanks: tanks,
    rob: { lsfo: 100, lsmgo: 50, mdo: 40 },
    carryover: null,
  };
  const entries = [{
    datetime: '2026-09-04T12:00',
    me: { type: 'LSFO' },
    ge: { type: 'LSMGO' },
    blr: { type: 'LSMGO' },
    unitOverride: { ME: 5, GE: 2, BLR: 1 },
    miscCons: { LSMGO: 0.5 },
    blrExtraCons: { LSMGO: 0.3 },
    incExtraCons: { LSMGO: 0.2 },
  }];
  const receipts = [{ date: '2026-09-04', category: 'fuel', tankId: 'lsmgo', qty: 10, source: 'hand' }];
  const calc = Bridge.buildHomeCalculatedRob(setup, entries, receipts);
  const lsmgoUsed = 2 + 1 + 0.5 + 0.3 + 0.2;
  assert(Math.abs(calc.robUsed.lsmgo - lsmgoUsed) < 1e-9, `LSMGO used ${lsmgoUsed} (got ${calc.robUsed.lsmgo})`);
  assert(Math.abs(calc.robCurrent.lsmgo - (50 + 10 - lsmgoUsed)) < 1e-9,
    `LSMGO present = open+recv-used (got ${calc.robCurrent.lsmgo})`);
  assert(Math.abs(calc.robUsed.lsfo - 5) < 1e-9, `LSFO used 5 (got ${calc.robUsed.lsfo})`);
  assert(Math.abs(calc.robCurrent.lsfo - (100 - 5)) < 1e-9, `LSFO present (got ${calc.robCurrent.lsfo})`);
}

/* DUAL_GE: naive M/E meter Δ must not inflate LSFO (matches Voyage computeDerived). */
{
  const setup = {
    flowArr: 'DUAL_GE',
    flowmeters: { main: { digits: 8 }, aux: { digits: 8 }, auxOut: { digits: 8 }, boiler: { digits: 8 }, rc: { digits: 8 } },
    fuelTanks: [{ id: 'lsfo', name: 'LSFO', grade: 'LSFO' }],
    rob: { lsfo: 1407.292 },
    carryover: {
      datetime: '2026-09-01T00:00',
      me: { type: 'LSFO', meter: 10000, sg: 0.95 },
      ge: { type: 'LSFO', meterIn: 5000, meterOut: 4800, sg: 0.95 },
      blr: { type: 'LSFO', meter: 100, sg: 0.95 },
      revCounter: 1000,
    },
  };
  const prev = setup.carryover;
  const entries = [{
    datetime: '2026-09-04T12:00',
    revCounter: 1000,
    me: { type: 'LSFO', meter: 11200, sg: 0.95 },
    ge: { type: 'LSFO', meterIn: 5600, meterOut: 5200, sg: 0.95 },
    blr: { type: 'LSFO', meter: 100, sg: 0.95 },
    miscCons: {},
    blrExtraCons: {},
    incExtraCons: {},
  }];
  /* geRaw 200 L + meRaw 1000 L (1200−200) → 1.14 MT total when both burn LSFO. */
  const g = Bridge.homeSavedFuelConsByGrade(entries, setup.fuelTanks, prev, setup);
  const expectedMt = roundFuelMt((1000 + 200) * 0.95 / 1000);
  assert(Math.abs(g.LSFO - expectedMt) < 1e-6, `DUAL_GE LSFO ${expectedMt} MT (got ${g.LSFO})`);
}

/* DUAL_GE with no ge.meter: must still pick up D/G dual inlet/outlet (not null GE). */
{
  const setup = {
    flowArr: 'DUAL_GE',
    flowmeters: { main: { digits: 8 }, aux: { digits: 8 }, auxOut: { digits: 8 }, boiler: { digits: 8 }, rc: { digits: 8 } },
    fuelTanks: [{ id: 'lsfo', name: 'LSFO', grade: 'LSFO' }],
    rob: { lsfo: 1000 },
    carryover: {
      datetime: '2026-09-01T00:00',
      me: { type: 'LSFO', meter: 10000, sg: 0.95 },
      ge: { type: 'LSFO', meterIn: 5000, meterOut: 4800, sg: 0.95 },
      blr: { type: 'LSFO', meter: 100, sg: 0.95 },
      revCounter: 100,
    },
  };
  const entries = [{
    datetime: '2026-09-02T12:00',
    revCounter: 200,
    me: { type: 'LSFO', meter: 11200, sg: 0.95 },
    ge: { type: 'LSFO', meterIn: 5600, meterOut: 5200, sg: 0.95 },
    blr: { type: 'LSFO', meter: 100, sg: 0.95 },
    miscCons: {},
    blrExtraCons: {},
    incExtraCons: {},
  }];
  const withArr = Bridge.homeSavedFuelConsByGrade(entries, setup.fuelTanks, setup.carryover, setup);
  const withoutArr = Bridge.homeSavedFuelConsByGrade(entries, setup.fuelTanks, setup.carryover, { flowmeters: setup.flowmeters });
  assert(Math.abs(withArr.LSFO - 1.14) < 1e-6, `DUAL_GE totals 1.14 MT (got ${withArr.LSFO})`);
  /* Without flowArr, ge has no ge.meter → old bug counted M/E meter only (1.14) — same one period.
     Multi-period drift comes from meStopped + per-period rounding; ensure GE path runs. */
  assert(withArr.LSFO >= withoutArr.LSFO - 1e-9, 'dual path includes GE litres');
}

/* M/E stopped (Δrevs = 0): blank nil M/E burn unless override > 0. */
{
  const setup = {
    flowmeters: { main: { digits: 8 }, rc: { digits: 8 }, boiler: { digits: 8 }, aux: { digits: 8 } },
    fuelTanks: [{ id: 'lsfo', name: 'LSFO', grade: 'LSFO' }],
    rob: { lsfo: 500 },
    carryover: {
      datetime: '2026-09-01T00:00',
      me: { type: 'LSFO', meter: 1000, sg: 0.95 },
      ge: { type: 'LSFO', meter: 100, sg: 0.95 },
      blr: { type: 'LSFO', meter: 10, sg: 0.95 },
      revCounter: 5000,
    },
  };
  const entries = [{
    datetime: '2026-09-02T12:00',
    revCounter: 5000,
    me: { type: 'LSFO', meter: 1000, sg: 0.95 },
    ge: { type: 'LSFO', meter: 150, sg: 0.95 },
    blr: { type: 'LSFO', meter: 10, sg: 0.95 },
    miscCons: {},
    blrExtraCons: {},
    incExtraCons: {},
  }];
  const g = Bridge.homeSavedFuelConsByGrade(entries, setup.fuelTanks, setup.carryover, setup);
  const geOnly = roundFuelMt(((150 - 100) * 0.95) / 1000);
  assert(Math.abs(g.LSFO - geOnly) < 1e-6, `stopped ME, nil M/E Δ: only GE burn (got ${g.LSFO})`);
}

console.log('All Home Calculated ROB grade-book checks passed.');
