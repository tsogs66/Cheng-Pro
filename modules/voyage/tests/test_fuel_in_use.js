#!/usr/bin/env node
/*
 * Log entry: fuel in use (storage tank per grade), the tank's LCV in the SFOC, and the tank's estimated ROB.
 *  - fuel-in-use tanks come from the tank fuel register (Tank Chief's bunkerings) and hand-typed tanks;
 *  - the entry keeps the tank and a copy of its figures; SFOC is corrected with that LCV, else the Setup LCV;
 *  - the estimate = last monitoring + bunkered − burned from that tank since; empty is flagged.
 * Run: node tests/test_fuel_in_use.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'www', 'voyage_manager.html'), 'utf8');
const R = require('../www/tank-fuel-register.js');
let checks = 0, failures = 0;
function check(label, cond) { checks++; if (!cond) failures++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); }
const near = (a, b, e = 1e-6) => a != null && Math.abs(a - b) <= e;
function extract(name) {
  const start = HTML.indexOf(`function ${name}(`); if (start < 0) throw new Error(name + ' not found');
  let depth = 0, i = HTML.indexOf('{', start);
  for (; i < HTML.length; i++) { if (HTML[i] === '{') depth++; else if (HTML[i] === '}') { depth--; if (!depth) break; } }
  return HTML.slice(start, i + 1);
}
const DEFAULT_LCV_REF = 42700;
function make(setup, entries, rows) {
  const state = { setup, entries };
  const sb = {
    state, window: { TankFuelRegister: R }, TankFuelRegister: R, DEFAULT_LCV_REF,
    sortedEntries: () => entries.slice().sort((a, b) => new Date(a.datetime) - new Date(b.datetime)),
    getComputedRow: (id) => rows[id], document: { getElementById: () => null }, console,
  };
  vm.createContext(sb);
  vm.runInContext("const FUEL_GRADE_IDS = { 'HFO': 'hfo', 'LSFO': 'lsfo', 'MDO/MGO': 'mdo', 'LSMGO': 'lsmgo' }; let _tankRegMemo = null;", sb);
  vm.runInContext(['fuelGradeId', 'tankFuelCache', 'manualTankFuel', 'tankFuelRegister', 'tankConsumedSince', 'fuelTanksOfGrade', 'entryLcv', 'lcvCorrectionFactor', 'isoCorrectedSfoc']
    .map(extract).join('\n'), sb);
  return sb;
}
const events = [{ id: 'b1', ts: '2026-10-20T10:00:00Z', tanks: [{ tankId: 'T2P', tankName: 'HFO 2P', grade: 'hfo', beforeMt: 0, afterMt: 300 }, { tankId: 'T3P', tankName: 'HFO 3P', grade: 'hfo', beforeMt: 0, afterMt: 100 }],
  bdns: [{ number: '111', grade: 'hfo', qty: 400, lcv: 40200, sulphur: 2.8, density: 0.985 }] }];
const setup = { lcvRef: 42700, lcvActual: 41000, tankFuel: { fetchedAt: '2026-11-01T00:00:00Z', events,
  monitoring: { ts: '2026-11-01T00:00:00Z', rob: { T2P: { mt: 300, grade: 'hfo', name: 'HFO 2P' }, T3P: { mt: 30, grade: 'hfo', name: 'HFO 3P' } } } } };
const mkEntry = (id, dt, tank) => ({ id, datetime: dt, me: { type: 'HFO' }, ge: { type: 'MDO/MGO' }, blr: { type: 'MDO/MGO' },
  fuelInUse: tank ? { hfo: { tankId: tank, tankName: tank, lcv: 40200 } } : undefined });
const entries = [mkEntry('e1', '2026-11-02T06:00', 'T3P'), mkEntry('e2', '2026-11-03T06:00', 'T3P'), mkEntry('e3', '2026-11-04T06:00', 'T2P')];
const rows = { e1: { meCons: 10, geCons: 2, blrCons: 0, hrs: 24 }, e2: { meCons: 12, geCons: 0, blrCons: 0, hrs: 24 }, e3: { meCons: 11, geCons: 0, blrCons: 0, hrs: 24 } };
const sb = make(setup, entries, rows);

console.log('tanks that can feed a grade');
const hfo = sb.fuelTanksOfGrade('hfo', '2026-11-05T00:00:00Z');
check('both HFO storage tanks are offered', hfo.length === 2 && hfo.map(t => t.id).sort().join() === 'T2P,T3P');
check('each carries its BDN figures', hfo.every(t => t.lcv === 40200 && near(t.sulphur, 2.8) && t.bdn === '111'));
check('a grade with no tank gives none', sb.fuelTanksOfGrade('lsmgo', null).length === 0);

console.log('estimated ROB: last monitoring − burned from that tank since');
const t3 = hfo.find(t => t.id === 'T3P'), t2 = hfo.find(t => t.id === 'T2P');
check('T3P: 30 − 10 − 12 = 8 (only entries that named it)', near(t3.estMt, 8));
check('T2P: 300 − 11 = 289', near(t2.estMt, 289));
check('the status flags a tank that cannot cover the burn', R.tankStatus({ estMt: t3.estMt, entryConsMt: 10 }).level === 'empty');
check('and one that has about a day left', R.tankStatus({ estMt: 8, burnMtPerDay: 11, lowHours: 24 }).level === 'low');

console.log('hand-typed tanks');
const setup2 = { lcvRef: 42700, tankFuelManual: [{ id: 'tf-1', name: 'HFO 1S', grade: 'hfo', mt: 120, asOf: '2026-11-01T00:00:00Z', bdn: '777', lcv: 40.5, sulphur: 0.49, density: 0.98 }] };
const sb2 = make(setup2, [], {});
const man = sb2.fuelTanksOfGrade('hfo', null);
check('a typed tank is offered with its ROB and LCV (MJ/kg read as kJ/kg)', man.length === 1 && man[0].lcv === 40500 && man[0].estMt === 120 && man[0].bdn === '777');

console.log('SFOC correction');
const withTank = { me: { type: 'HFO' }, fuelInUse: { hfo: { tankId: 'T2P', lcv: 40200 } } };
check('uses the tank LCV: ref ÷ tank LCV', near(sb.lcvCorrectionFactor(withTank), 42700 / 40200));
check('no tank chosen falls back to the Setup LCV (as before)', near(sb.lcvCorrectionFactor({ me: { type: 'HFO' } }), 42700 / 41000));
check('no entry at all is the Setup LCV too', near(sb.lcvCorrectionFactor(), 42700 / 41000));
check('a tank with no LCV falls back as well', near(sb.lcvCorrectionFactor({ me: { type: 'HFO' }, fuelInUse: { hfo: { tankId: 'x', lcv: null } } }), 42700 / 41000));
check('the grade is the main engine\'s: an MDO tank does not correct an HFO engine', sb.entryLcv({ me: { type: 'HFO' }, fuelInUse: { mdo: { lcv: 42700 } } }) === null);
check('corrected SFOC = measured × factor', near(sb.isoCorrectedSfoc(180, withTank), 180 * 42700 / 40200));
check('no setup LCV and no tank leaves SFOC as measured', (() => { const s = make({ lcvRef: 42700 }, [], {}); return near(s.isoCorrectedSfoc(180, { me: { type: 'HFO' } }), 180); })());

console.log(failures ? `\nFAILED — ${failures} of ${checks}` : `\nPASSED — ${checks} checks`);
process.exit(failures ? 1 : 0);
