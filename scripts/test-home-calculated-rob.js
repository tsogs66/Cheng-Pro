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
  const receipts = [{ category: 'fuel', tankId: 'lsmgo', qty: 10, source: 'hand' }];
  const calc = Bridge.buildHomeCalculatedRob(setup, entries, receipts);
  const lsmgoUsed = 2 + 1 + 0.5 + 0.3 + 0.2;
  assert(Math.abs(calc.robUsed.lsmgo - lsmgoUsed) < 1e-9, `LSMGO used ${lsmgoUsed} (got ${calc.robUsed.lsmgo})`);
  assert(Math.abs(calc.robCurrent.lsmgo - (50 + 10 - lsmgoUsed)) < 1e-9,
    `LSMGO present = open+recv-used (got ${calc.robCurrent.lsmgo})`);
  assert(Math.abs(calc.robUsed.lsfo - 5) < 1e-9, `LSFO used 5 (got ${calc.robUsed.lsfo})`);
  assert(Math.abs(calc.robCurrent.lsfo - (100 - 5)) < 1e-9, `LSFO present (got ${calc.robCurrent.lsfo})`);
}

console.log('All Home Calculated ROB grade-book checks passed.');
