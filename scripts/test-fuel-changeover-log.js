/*
 * The fuel changeover regulation log: the company's own Appendix VI form as a record, with the tank
 * columns following the active ship's distillate tanks.
 * Run: node tests/test_fuel_changeover_log.js
 */
'use strict';
const L = require('../modules/voyage/www/fuel-changeover-log.js');
let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}
const ok = (label, v) => check(label, !!v, true);

/* The company's own log, 26-27 Oct 2021, LT = UTC+8. */
const tanks = { distillate: [
  { id: 'mgost', name: 'MGO ST. TANK', capacityM3: 100 }, { id: 'mgosv', name: 'MGO SERV TANK' },
  { id: 'mdosv', name: 'MDO SERV. TANK' }, { id: 'mdoset', name: 'MDO SETTL. TANK' }],
  residual: [{ id: 'hfo3s', name: 'HFO 3(S)' }] };
const stage = (no, d, t, lat, lon, rob) => Object.assign(L.blankStage(no, { offsetMin: 480, officerName: 'J.R. SOLUTA', officerRank: 'C/E' }), {
  dateLT: d, timeLT: t, latDeg: lat[0], latMin: lat[1], latHem: 'N', lonDeg: lon[0], lonMin: lon[1], lonHem: 'E', rob });
const rec = L.newRecord('eca', { offsetMin: 480, officerName: 'J.R. SOLUTA', officerRank: 'C/E' });
rec.stages = [
  stage(1, '2021-10-26', '21:48', [30, 11.5], [123, 20.7], { mgost: 1.8, mgosv: 18, mdosv: 17.7, mdoset: 18.4 }),
  stage(2, '2021-10-27', '00:30', [29, 46.2], [123, '02.0'], { mgost: 1.8, mgosv: 15.6, mdosv: 17.7, mdoset: 18.4 }),
  stage(3, '2021-10-27', '00:50', [29, 44.6], [123, 58.3], { mgost: 1.8, mgosv: 15.3, mdosv: 17.7, mdoset: 18.4 }),
  stage(4, '2021-10-27', '23:30', [29, 38.5], [122, 55.1], { mgost: 74.4, mgosv: 10.3, mdosv: 17.7, mdoset: 18.4 }),
  stage(5, '2021-10-27', '23:48', [31, 32.7], [121, 19.9], { mgost: 74.4, mgosv: 10.0, mdosv: 17.7, mdoset: 18.4 })];

console.log('\ntime');
check('21:48 at UTC+8 is 13:48 UTC', L.utcFromLocal('2021-10-26', '21:48', 480), '2021-10-26T13:48');
check('00:30 at UTC+8 crosses back a day in UTC', L.utcFromLocal('2021-10-27', '00:30', 480), '2021-10-26T16:30');
check('west of Greenwich: 08:00 at UTC-5 is 13:00', L.utcFromLocal('2026-01-05', '08:00', -300), '2026-01-05T13:00');
check('a missing zone gives no UTC', L.utcFromLocal('2026-01-05', '08:00', null), '');

console.log('\nposition');
check('company style', L.formatPosition(rec.stages[0]).text, 'LAT.30°-11.5 N  LONG.123°-20.7 E');

console.log('\ntank columns follow the ship');
check('four distillate columns', L.tankColumns(tanks, rec).map(c => c.name), ['MGO ST. TANK', 'MGO SERV TANK', 'MDO SERV. TANK', 'MDO SETTL. TANK']);
const small = { distillate: [{ id: 'mgost', name: 'LSMGO STOR' }], residual: [] };
check('a ship with one distillate tank has one column', L.tankColumns(small, L.newRecord('eca', {})).length, 1);
const kept = L.tankColumns(small, rec);
check('a tank no longer on the ship keeps its column, named as it was', kept.slice(1).map(c => c.name.indexOf('(not on this ship now)') !== -1), [true, true, true]);
check('residual tanks only when asked', L.tankColumns(tanks, rec, { includeResidual: true }).map(c => c.group).join(','), 'compliant,compliant,compliant,compliant,other');

console.log('\nthe printed log');
const html = L.buildLogHtml(rec, { vessel: { name: 'M/V FLAG EVI', imo: '9619799', company: 'GOLDEN UNION SHIPPING CO. S.A.' }, tanks });
ok('company form heading', html.indexOf('APPENDIX VI') !== -1 && html.indexOf('Fuel Changeover Regulation Log Book') !== -1);
ok('ship and IMO', html.indexOf("Ship's Name: M/V FLAG EVI") !== -1 && html.indexOf('IMO Number: 9619799') !== -1);
ok('stage 1 times and position as the form writes them', html.indexOf('2148 H LT') !== -1 && html.indexOf('1348 H UTC') !== -1 && html.indexOf('LAT.30°-11.5 N') !== -1 && html.indexOf('LONG.123°-20.7 E') !== -1);
ok('every tank is a column with its quantity', html.indexOf('MDO SETTL. TANK') !== -1 && html.indexOf('18.4 MT') !== -1);
ok('all five stages', [1, 2, 3, 4, 5].every(n => html.indexOf('>' + n + '. ') !== -1));
ok('signature column', html.indexOf('J.R. SOLUTA') !== -1 && html.indexOf('Signature of officer in charge') !== -1);
ok('the form footer', html.indexOf('Revision No.') !== -1 && html.indexOf('Date effective') !== -1);
const eu = L.newRecord('eu', {});
check('EU berth record has four stages', L.buildLogHtml(eu, { tanks }).match(/<td class="st">/g).length, 4);
ok('EU note mentions the directive', L.buildLogHtml(eu, { tanks }).indexOf('Directive 2005/33/EC') !== -1);

console.log('\nchecks');
check('the company\'s own log passes', L.validate(rec, tanks), []);
const late = JSON.parse(JSON.stringify(rec)); late.stages[1].timeLT = '01:30';
check('completion after entry is an error', L.validate(late, tanks).filter(w => w.level === 'error').length >= 1, true);
const early = JSON.parse(JSON.stringify(rec)); early.stages[4].timeLT = '23:00';
ok('change back before leaving the ECA is an error', L.validate(early, tanks).some(w => w.level === 'error' && w.stage === 5));
const noPos = JSON.parse(JSON.stringify(rec)); noPos.stages[1].latDeg = '';
ok('completion without a position warns (Reg. 14.6)', L.validate(noPos, tanks).some(w => w.stage === 2 && /position/.test(w.msg)));
const noRob = JSON.parse(JSON.stringify(rec)); noRob.stages[4].rob = {};
ok('completion without tank quantities warns', L.validate(noRob, tanks).some(w => w.stage === 5 && /each tank/.test(w.msg)));
const neg = JSON.parse(JSON.stringify(rec)); neg.stages[0].rob.mgost = -1;
ok('a negative quantity is an error', L.validate(neg, tanks).some(w => w.level === 'error' && /negative/.test(w.msg)));
const noZone = JSON.parse(JSON.stringify(rec)); noZone.stages[2].offsetMin = null;
ok('a time with no zone warns', L.validate(noZone, tanks).some(w => w.stage === 3));
const swapped = JSON.parse(JSON.stringify(rec)); swapped.stages[3].dateLT = '2021-10-26';
ok('stages out of order warn', L.validate(swapped, tanks).some(w => /earlier than stage/.test(w.msg)));

console.log('\nplan against actual');
rec.plan = { latestStartIso: '2021-10-26T13:00:00Z', hours: 2.5 };
const cmp = L.compareToPlan(rec);
check('start was 48 min after the plan', cmp.startDiffMin, 48);
check('duration from commencement to completion', cmp.durationMin, 162);
check('no plan, no comparison', L.compareToPlan(L.newRecord('eca', {})), null);


console.log('\nlow-sulphur fuel for the passage');
{
  const ok1 = L.ecaFuelCheck({ changeoverUsedMt: 5.2, transitHours: 30, consMtDay: 24, onBoardMt: 40 });
  check('need = changeover + transit', [ok1.changeoverMt, ok1.transitMt, Math.round(ok1.needMt * 100) / 100], [5.2, 30, 35.2]);
  check('enough with a reserve to spare', [ok1.enough, ok1.comfortable], [true, true]);
  const tight = L.ecaFuelCheck({ changeoverUsedMt: 5.2, transitHours: 30, consMtDay: 24, onBoardMt: 36 });
  check('enough but inside the reserve', [tight.enough, tight.comfortable], [true, false]);
  const short = L.ecaFuelCheck({ changeoverUsedMt: 5.2, transitHours: 30, consMtDay: 24, onBoardMt: 30 });
  check('not enough is flagged', short.enough, false);
  check('a missing figure gives no verdict', L.ecaFuelCheck({ changeoverUsedMt: 5.2, consMtDay: 24, onBoardMt: 30 }).ok, false);
  check('a zero reserve is respected', L.ecaFuelCheck({ changeoverUsedMt: 1, transitHours: 24, consMtDay: 10, onBoardMt: 11, reservePct: 0 }).comfortable, true);
}

console.log('\nEU port call');
{
  const arr = Date.UTC(2026, 0, 1, 8), dep = Date.UTC(2026, 0, 1, 20);
  const p = L.euBerthPlan({ arrivalMs: arr, departureMs: dep, changeoverHours: 3, changeoverUsedMt: 1.2, consMtDay: 4, onBoardMt: 5 });
  check('start on arrival, compliant three hours later', [p.startMs === arr, p.compliantByMs - arr], [true, 3 * 3600000]);
  check('change back at departure when no margin', p.changeBackStartMs, dep);
  check('stay and compliant hours', [p.stayHours, p.compliantHours], [12, 9]);
  check('low-sulphur fuel for the stay', Math.round(p.needMt * 100) / 100, 2.7);
  check('covered by what is on board', p.enough, true);
  const shortStay = L.euBerthPlan({ arrivalMs: arr, departureMs: arr + 90 * 60000, changeoverHours: 3, consMtDay: 4 });
  check('a stay shorter than the changeover cannot finish in time', shortStay.completesInTime, false);
  check('a stay under two hours is reported as exempt', shortStay.exemptShortStay, true);
  const margin = L.euBerthPlan({ arrivalMs: arr, departureMs: dep, changeoverHours: 3, consMtDay: 4, changeBackMarginHours: 1 });
  check('change back an hour before departure', margin.changeBackStartMs, dep - 3600000);
  check('departure before arrival gives no plan', L.euBerthPlan({ arrivalMs: dep, departureMs: arr, changeoverHours: 3, consMtDay: 4 }).ok, false);
}


console.log('\nhand-over to the e-ORB Part III C item 4 (Panama)');
{
  const rec2 = L.newRecord('eca', { offsetMin: 480 });
  const st2 = Object.assign(L.blankStage(2, { offsetMin: 480 }), { dateLT: '2021-10-27', timeLT: '00:30', latDeg: 29, latMin: 46.2, lonDeg: 123, lonMin: '02.0', rob: { a: 1.8, b: 15.6 } });
  const pv = L.partThreeValues(rec2, st2, 890);
  check('completion before the ECA', [pv.event, pv.scenarioId], ['Completed before entering the ECA', 'p3-changeover-complete']);
  check('the UTC date and time, not the local ones', [pv.date, pv.time], ['2021-10-26', '16:30']);
  check('tanks and the volume in m³ from the MT and the density', [pv.tankIds, pv.volumeM3], [['a', 'b'], 19.55]);
  check('position carried over', [pv.position.latDeg, pv.position.lonMin], [29, '02.0']);
  const st5 = Object.assign({}, st2, { no: 5 });
  check('the change back after the ECA', L.partThreeValues(rec2, st5, 890).scenarioId, 'p3-changeover-start');
  check('entry into the ECA has no Part III item', L.partThreeValues(rec2, Object.assign({}, st2, { no: 3 }), 890), null);
  check('an EU port call has none either', L.partThreeValues(L.newRecord('eu', {}), st2, 890), null);
  check('a stage with no time gives nothing', L.partThreeValues(rec2, L.blankStage(2, { offsetMin: 480 }), 890), null);
  check('no density falls back to 890', L.partThreeValues(rec2, st2, null).volumeM3, 19.55);
}

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
