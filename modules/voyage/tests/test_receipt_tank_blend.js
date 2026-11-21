#!/usr/bin/env node
/*
 * Standalone Voyage Chief: a fuel receipt blends into the hand-typed row linked to its tank —
 * the tank's book ROB before it plus the quantity received, LCV/sulphur by mass, density by volume.
 * Run: node tests/test_receipt_tank_blend.js
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
function make({ rob, rows = [], setup = {} }) {
  const state = { setup: { tankFuelManual: [], ...setup }, entries: [] };
  const sb = {
    state, window: { TankFuelRegister: R }, TankFuelRegister: R, console, uid: (() => { let n = 0; return () => 'u' + (++n); })(),
    fuelTankList: () => [{ id: 'hfo1', name: 'HFO 1P', grade: 'HFO' }, { id: 'mgo1', name: 'MGO 1', grade: 'MDO/MGO' }],
    computeDerived: () => ({ rows }), robAsOfComputedRow: () => ({ rob }), effectiveCarryover: () => ({ rob: {} }),
    receiptMoment: (r) => r.time ? `${r.date}T${r.time}` : null, sortedEntries: () => [], getComputedRow: () => null,
    isChengAioEmbedded: () => false, tankFuelRegister: () => ({ tanks: {} }), tankFuelCache: () => null,
  };
  vm.createContext(sb);
  vm.runInContext("const FUEL_GRADE_IDS = { 'HFO': 'hfo', 'LSFO': 'lsfo', 'MDO/MGO': 'mdo', 'LSMGO': 'lsmgo' };", sb);
  vm.runInContext(['fuelGradeId', 'manualTankFuel', 'tankConsumedSince', 'bookTankRobAt', 'normalizedDensity', 'applyReceiptToTankFuel'].map(extract).join('\n'), sb);
  return sb;
}
const rcpt = (o) => ({ category: 'fuel', tankId: 'hfo1', qty: 300, date: '2026-11-10', time: '10:00', lcv: 40800, sulphur: 0.45, density15: 980, bdnNo: '222', ...o });
const row1 = [{ id: 'e1', datetime: '2026-11-09T12:00' }];

console.log('a tank that was empty takes the delivery');
{
  const sb = make({ rob: { hfo1: 0 }, rows: row1 });
  const note = sb.applyReceiptToTankFuel(rcpt());
  const r = sb.state.setup.tankFuelManual[0];
  check('a row is created, linked to the Voyage tank', r && r.linkTankId === 'hfo1' && r.grade === 'hfo');
  check('LCV, sulphur, density (kg/m³ → SG) and BDN come from the receipt', r.lcv === 40800 && near(r.sulphur, 0.45) && near(r.density, 0.98) && r.bdn === '222');
  check('ROB is the quantity received', near(r.mt, 300));
  check('the note says it was bunkered empty', /bunkered empty/.test(note));
}
console.log('a tank that held fuel is blended');
{
  const sb = make({ rob: { hfo1: 100 }, rows: row1, setup: { tankFuelManual: [{ id: 'tf-1', name: 'HFO 1P', grade: 'hfo', linkTankId: 'hfo1', mt: 100, asOf: '2026-11-01T00:00:00Z', bdn: '111', lcv: 40200, sulphur: 2.8, density: 0.985 }] } });
  const note = sb.applyReceiptToTankFuel(rcpt());
  const r = sb.state.setup.tankFuelManual[0];
  check('LCV is mass-weighted with the book ROB before it', near(r.lcv, (100 * 40200 + 300 * 40800) / 400, 1));
  check('sulphur is mass-weighted', near(r.sulphur, (100 * 2.8 + 300 * 0.45) / 400, 1e-3));
  check('density is blended by volume', near(r.density, 400 / (100 / 0.985 + 300 / 0.98), 1e-3));
  check('both BDN numbers are kept', r.bdn === '111 + 222');
  check('ROB is the sum and it is dated at the receipt', near(r.mt, 400) && /^2026-11-10/.test(r.asOf));
  check('still one row', sb.state.setup.tankFuelManual.length === 1 && /blended/.test(note));
}
console.log('a tank holding fuel with no figures on record');
{
  const sb = make({ rob: { hfo1: 700 }, rows: row1 });
  const note = sb.applyReceiptToTankFuel(rcpt());
  const r = sb.state.setup.tankFuelManual[0];
  check('S and LCV stay unknown rather than being invented', r.lcv === null && r.sulphur === null);
  check('and the note says why and what to do', /no figures on record/.test(note) && /Setup/.test(note));
  check('the ROB is still carried', near(r.mt, 1000));
}
console.log('what cannot be blended is said so');
{
  const sb = make({ rob: {}, rows: [] });
  const note = sb.applyReceiptToTankFuel(rcpt());
  const r = sb.state.setup.tankFuelManual[0];
  check('ROB before unknown: takes the delivery and asks for a check', r.needsCheck === true && r.lcv === 40800 && /check them in Setup/.test(note));
}
console.log('what does not apply');
{
  const sb = make({ rob: { hfo1: 10 }, rows: row1 });
  check('lube and fresh water receipts are ignored', sb.applyReceiptToTankFuel(rcpt({ category: 'lube' })) === '' && sb.state.setup.tankFuelManual.length === 0);
  check('a receipt for a tank the ship does not have is ignored', sb.applyReceiptToTankFuel(rcpt({ tankId: 'nope' })) === '');
  const sb2 = make({ rob: { hfo1: 10 }, rows: row1 });
  sb2.isChengAioEmbedded = () => true; sb2.tankFuelCache = () => ({}); sb2.tankFuelRegister = () => ({ tanks: { X: {} } });
  check('with Tank Chief supplying the figures, receipts do not blend by hand', sb2.applyReceiptToTankFuel(rcpt()) === '');
  const sb3 = make({ rob: { mgo1: 20 }, rows: row1 });
  sb3.applyReceiptToTankFuel(rcpt({ tankId: 'mgo1', qty: 50, lcv: 42700, sulphur: 0.09, density15: 860 }));
  check('a distillate tank gets the distillate grade', sb3.state.setup.tankFuelManual[0].grade === 'mdo');
}
console.log(failures ? `\nFAILED — ${failures} of ${checks}` : `\nPASSED — ${checks} checks`);
process.exit(failures ? 1 : 0);
