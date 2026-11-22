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
const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');
const R = require('../tank-fuel-register.js');
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
  vm.runInContext(['fuelGradeId', 'tankFuelCache', 'typedTankFuel', 'withTypedFigures', 'manualTankFuel', 'tankFuelRegister', 'tankConsumedSince', 'computeTankDrift', 'fuelTanksOfGrade', 'entryLcv', 'lcvCorrectionFactor', 'isoCorrectedSfoc']
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

console.log('figures typed on a Tank Chief tank');
setup.tankFuelTyped = { T3P: { lcv: 41234, sulphur: 0.51, density: 0.95, bdn: 'MY-9' } };
const typedList = sb.fuelTanksOfGrade('hfo', '2026-11-05T00:00:00Z');
const ty3 = typedList.find(t => t.id === 'T3P'), ty2 = typedList.find(t => t.id === 'T2P');
check('typed LCV / S / density / BDN replace the register ones on that tank', ty3.lcv === 41234 && near(ty3.sulphur, 0.51) && near(ty3.density, 0.95) && ty3.bdn === 'MY-9');
check('other tanks keep the register figures', ty2.lcv === 40200 && ty2.bdn === '111');
delete setup.tankFuelTyped;
check('clearing them gives the register figures back', sb.fuelTanksOfGrade('hfo', '2026-11-05T00:00:00Z').find(t => t.id === 'T3P').lcv === 40200);

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

console.log('only storage tanks with fuel are offered');
{
  const mon = { ts: '2026-11-01T00:00:00Z', rob: {
    S1: { mt: 100, grade: 'hfo', name: 'HFO STORAGE 1', role: 'storage' },
    S2: { mt: 0, grade: 'hfo', name: 'HFO STORAGE 2 (empty)', role: 'storage' },
    SE: { mt: 40, grade: 'hfo', name: 'HFO SETTLING', role: 'settling' },
    SV: { mt: 30, grade: 'hfo', name: 'HFO SERVICE', role: 'service' },
    OV: { mt: 5, grade: 'hfo', name: 'HFO OVERFLOW', role: 'overflow' },
    OLD: { mt: 60, grade: 'hfo', name: 'cached before roles existed' } } };
  /* the bunkering history carries every tank, settling and service ones included */
  const evAll = [{ id: 'x1', ts: '2026-10-01T00:00:00Z', tanks: ['S1', 'S2', 'SE', 'SV', 'OV', 'OLD'].map((id) => ({ tankId: id, tankName: id, grade: 'hfo', beforeMt: 0, afterMt: 10 })),
    bdns: [{ number: '1', grade: 'hfo', qty: 60, lcv: 40000, sulphur: 0.5, density: 0.98 }] }];
  const s3 = make({ lcvRef: 42700, tankFuel: { fetchedAt: '2026-11-01T00:00:00Z', events: evAll, monitoring: mon } }, [], {});
  const ids = (keep) => s3.fuelTanksOfGrade('hfo', null, keep).map((x) => x.id).sort().join();
  check('storage tanks with fuel, and old caches with no role, are offered', ids() === 'OLD,S1');
  check('settling, service, overflow and empty tanks are not', !/SE|SV|OV|S2/.test(ids().replace('OLD', '')));
  check('a settling tank the entry already names stays on the list', ids('SE') === 'OLD,S1,SE');
  check('and so does an empty tank that is the one chosen, so its warning shows', ids('S2') === 'OLD,S1,S2');
}

console.log('drift at the next monitoring');
{
  const oldC = { monitoring: { ts: '2026-11-01T00:00:00Z', rob: { T3P: { mt: 30, grade: 'hfo', name: 'HFO 3P' }, T2P: { mt: 300, grade: 'hfo', name: 'HFO 2P' } } }, events };
  /* entries e1,e2 burned 10+12 from T3P (est. 8); e3 burned 11 from T2P (est. 289) */
  const sounded = (t3, t2) => ({ monitoring: { ts: '2026-11-05T00:00:00Z', rob: { T3P: { mt: t3, grade: 'hfo', name: 'HFO 3P' }, T2P: { mt: t2, grade: 'hfo', name: 'HFO 2P' } } }, events });
  check('a sounding that matches the estimate raises nothing', sb.computeTankDrift(oldC, sounded(8, 289)).length === 0);
  const d = sb.computeTankDrift(oldC, sounded(8, 262));
  check('a tank 27 MT under the estimate is flagged with the gap', d.length === 1 && d[0].tankId === 'T2P' && near(d[0].diffMt, -27));
  check('an older sounding is not compared', sb.computeTankDrift(sounded(8, 289), oldC).length === 0);
  check('without a previous monitoring there is nothing to compare', sb.computeTankDrift(null, sounded(8, 289)).length === 0);
}

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
