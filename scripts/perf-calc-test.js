'use strict';

const assert = require('assert');
const path = require('path');
const calc = require(path.join(__dirname, '../apps/web/js/perf-calc.js'));

const basis = {
  mcrRpm: 91,
  mcrKw: 18630,
  pitch: 5.85,
  sfoc100: 178.5,
  sfoc85: 175.2,
  slocRef: 0.85,
  mechEff: 0.90,
  fuelDensity: 0.96,
  lubeDensity: 0.89,
  lcvRef: 42700,
  lcvActual: 41200,
};

// Propeller law: 85% MCR power → RPM
const fromPct = calc.solve(basis, { mcrPct: 85, hours: 24 });
assert.ok(fromPct.values.kw > 15000 && fromPct.values.kw < 16000, '85% kW');
assert.ok(fromPct.values.rpm > 80 && fromPct.values.rpm < 90, '85% rpm');
assert.ok(fromPct.values.sfoc > 170 && fromPct.values.sfoc < 180, 'curve sfoc');
assert.ok(fromPct.values.fuelKgHr > 0, 'fuel kg/h');
assert.ok(fromPct.values.lubeL24h > 0, 'lo 24h');
assert.ok(fromPct.values.ihpKw > fromPct.values.shpKw, 'IHP > SHP');

// ISO SFOC = measured × (42700/41200)
const measured = 180;
const iso = calc.isoCorrectedSfoc(measured, 42700, 41200);
assert.ok(Math.abs(iso - measured * (42700 / 41200)) < 1e-6, 'ISO formula');
const withSfoc = calc.solve(basis, { kw: 10000, sfoc: measured, hours: 24 });
assert.ok(withSfoc.values.sfocIso > measured, 'ISO SFOC higher when LCV actual lower');
assert.ok(withSfoc.values.fuelKgHrIso > withSfoc.values.fuelKgHr, 'ISO fuel rate');
assert.ok(withSfoc.values.fuelMtIsoPeriod > withSfoc.values.fuelMtPeriod, 'ISO period MT');

// Scramble: fuel + SFOC → kW → RPM
const fromFuel = calc.solve(basis, { fuelKgHr: 2500, sfoc: 175 });
assert.ok(fromFuel.values.kw > 14000, 'kw from fuel');
assert.ok(fromFuel.values.rpm > 0, 'rpm from fuel');

// Scramble: RPM only → full chain
const fromRpm = calc.solve(basis, { rpm: 78 });
assert.ok(fromRpm.values.mcrPct > 0, 'mcr from rpm');
assert.ok(fromRpm.values.fuelLhr > 0, 'fuel L/h');
assert.ok(fromRpm.values.engineSpeedKn > 0, 'engine speed');

console.log('perf-calc-test: ok');
