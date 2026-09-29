#!/usr/bin/env node
/*
 * e-ORB: scenario item maps, weekly 7-day window, ROB side-effects, bunkering print.
 * Run: node tests/test_eorb.js
 */

'use strict';

require('../eorb.js');
const EORB = global.EORB;

const failures = [];
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) failures.push(label);
}

function checkTrue(label, value) {
  check(label, !!value, true);
}

console.log('\nscenario item numbers exist on that MARPOL code');
EORB.SCENARIOS.forEach(sc => {
  const op = EORB.getOperation(sc.part, sc.code);
  checkTrue(`${sc.id} maps to code ${sc.code}`, !!op);
  const valid = new Set((op && op.items || []).map(i => i.no));
  (sc.items || []).forEach(no => {
    checkTrue(`${sc.id} item ${no} exists on code ${sc.code}`, valid.has(no));
  });
});

console.log('\nroutine weekly scenarios');
const weekly = EORB.getScenario('weekly-sludge-bilge');
check('weekly sludge+bilge opens the inventory wizard', weekly && weekly.wizard, 'weekly');
check('weekly sludge+bilge is Code C', weekly && weekly.code, 'C');
const ows = EORB.getScenario('ows-weekly-test');
check('weekly OWS test is Code I', ows && ows.code, 'I');
checkTrue('weekly OWS test has a remarks preset', !!(ows && ows.presets && ows.presets.remarks));

console.log('\ncorrected failure / accidental / auto-mode maps');
check('OWS failure ticks Code F items', EORB.getScenario('ows-failure').items, ['19', '20', '21']);
check('accidental discharge ticks Code G items', EORB.getScenario('accidental-discharge').items, ['22', '23', '24', '25']);
check('auto overboard is item 16 only', EORB.getScenario('bilge-ows-auto-overboard').items, ['16']);
check('auto transfer is item 17 only', EORB.getScenario('bilge-ows-auto-transfer').items, ['17']);
check('wells-to-tank from-group is bilge wells',
  EORB.getScenario('bilge-well-to-tank').fieldTankGroups.fromTank, 'bilgeWells');

console.log('\nweekly 7-day window — sooner allowed, later not');
check('add 7 days', EORB.addDaysIso('2026-08-01', 7), '2026-08-08');
check('days between', EORB.daysBetweenIso('2026-08-01', '2026-08-08'), 7);
const due = EORB.weeklyDueStatus('2026-08-01', '2026-08-06');
check('not overdue on day 5', due.overdue, false);
check('due by last+7', due.dueBy, '2026-08-08');
check('days left', due.daysLeft, 2);
checkTrue('overdue the day after last+7', EORB.weeklyDueStatus('2026-08-01', '2026-08-09').overdue);
check('sooner than 7 days is accepted', EORB.weeklyInventoryDateError('2026-08-05', '2026-08-01'), null);
check('exactly 7 days is accepted', EORB.weeklyInventoryDateError('2026-08-08', '2026-08-01'), null);
checkTrue('later than 7 days is refused', !!EORB.weeklyInventoryDateError('2026-08-09', '2026-08-01'));
checkTrue('before last weekly is refused', !!EORB.weeklyInventoryDateError('2026-07-31', '2026-08-01'));
check('first inventory has no window', EORB.weeklyInventoryDateError('2026-08-14', null), null);
checkTrue('OWS label is used in the 7-day error',
  String(EORB.weeklyInventoryDateError('2026-08-09', '2026-08-01', 'Weekly 15 ppm / OWS test') || '')
    .indexOf('Weekly 15 ppm / OWS test') !== -1);
checkTrue('due date itself is not overdue (day 7 is allowed)',
  EORB.weeklyDueStatus('2026-08-01', '2026-08-08').overdue === false);
checkTrue('due date itself is dueSoon', EORB.weeklyDueStatus('2026-08-01', '2026-08-08').dueSoon);
checkTrue('warning flag when past 7 days', EORB.weeklyDueStatus('2026-08-01', '2026-08-09').overdue);

console.log('\ndisclaimerAck survives setup rebuild');
const ackOnce = EORB.defaultOrbSetup({ disclaimerAck: true, shipName: 'Test Vessel' });
check('first defaultOrbSetup keeps ack', ackOnce.disclaimerAck, true);
check('second defaultOrbSetup keeps ack', EORB.defaultOrbSetup(ackOnce).disclaimerAck, true);
check('unset ack stays false', EORB.defaultOrbSetup({ shipName: 'X' }).disclaimerAck, false);

console.log('\nweekly OWS test recognition');
checkTrue('scenario id counts as weekly OWS test',
  EORB.isWeeklyOwsTest({ scenarioId: 'ows-weekly-test', code: 'I' }));
checkTrue('weeklyKind counts as weekly OWS test',
  EORB.isWeeklyOwsTest({ weeklyKind: 'ows-test', code: 'I' }));
check('voided OWS test is ignored',
  EORB.isWeeklyOwsTest({ scenarioId: 'ows-weekly-test', voided: true }), false);
check('last OWS date ignores voided',
  EORB.lastMatchingEntryDate([
    { date: '2026-08-01', scenarioId: 'ows-weekly-test' },
    { date: '2026-08-10', scenarioId: 'ows-weekly-test', voided: true }
  ], EORB.isWeeklyOwsTest), '2026-08-01');

const book = [
  { code: 'C', part: 1, date: '2026-08-01', weeklyInventory: true, selectedItems: ['11.1', '11.2', '11.3'] },
  { code: 'H', part: 1, date: '2026-08-03', selectedItems: ['26.1'] },
  { code: 'C', part: 1, date: '2026-08-01', voided: true, weeklyInventory: true }
];
check('last weekly ignores voided', EORB.lastMatchingEntryDate(book, EORB.isWeeklySludgeInventory), '2026-08-01');
checkTrue('C.11 without 12.x counts as weekly inventory',
  EORB.isWeeklySludgeInventory({ code: 'C', selectedItems: ['11.1', '11.2', '11.3'] }));
check('C.12 transfer is not a weekly inventory',
  EORB.isWeeklySludgeInventory({ code: 'C', selectedItems: ['12.2'] }), false);

console.log('\nbunkering print uses total content, not the split string');
const bunkerLines = EORB.buildItemLines(1, 'H', ['26.3'], {
  fuelType: 'VLSFO', fuelQty: 200, fuelTank: 'fo1|fo2', fuelSplit: 'fo1=120, fo2=80', fuelTotal: 350
}, { tanks: { fuel: [
  { id: 'fo1', name: 'FO 1 P', frameNo: 'Fr. 10', capacityM3: 200, robM3: 50 },
  { id: 'fo2', name: 'FO 2 S', frameNo: 'Fr. 10', capacityM3: 200, robM3: 100 }
] } });
const bunkerText = (bunkerLines.find(l => l.itemNo === '26.3') || {}).text || '';
checkTrue('print names the grade and tonnes', bunkerText.indexOf('VLSFO') !== -1 && bunkerText.indexOf('200 t') !== -1);
checkTrue('print does not call the split the tank total', bunkerText.indexOf('total content fo1=120') === -1);
checkTrue('print states total content 350 t', bunkerText.indexOf('total content 350 t') !== -1);
checkTrue('print can include API gravity',
  EORB.buildItemLines(1, 'H', ['26.3'], {
    fuelType: 'VLSFO', fuelQty: 200, fuelTank: 'fo1', fuelApi: 28.5
  }, { tanks: { fuel: [{ id: 'fo1', name: 'FO 1 P', capacityM3: 200, robM3: 50 }] } })[0].text.indexOf('API 28.5') !== -1);

console.log('\nAPI calculator (141.5/SG − 131.5)');
check('API from SG 0.991', EORB.apiFromSpecificGravity(0.991), 11.285);
check('API from density 991 kg/m³', EORB.apiFromDensityKgM3(991), 11.285);

console.log('\nincinerator rate alignment autofill');
const incSetup = EORB.defaultOrbSetup({ equipment: { incineratorM3PerH: 0.05 } });
const incFill = EORB.autofillOperationValues(incSetup, 1, 'C', ['12.3'], { qtyDisposed: 0.5 });
check('hours from qty and rate', incFill.values.incinHours, 10);
const incHints = EORB.operationFieldHelpers(incSetup, 1, 'C', ['12.3'], { qtyDisposed: 0.5, incinHours: 10 });
checkTrue('incinerator helper mentions rated capacity', incHints.some(h => h.message.indexOf('0.05') !== -1));

console.log('\nbunkering split alignment helper');
const bunkerSetup = EORB.defaultOrbSetup({ tanks: { fuel: [
  { id: 'fo1', name: 'FO 1 P', capacityM3: 200, robM3: 50 },
  { id: 'fo2', name: 'FO 2 S', capacityM3: 200, robM3: 100 }
] } });
const bunkerHints = EORB.operationFieldHelpers(bunkerSetup, 1, 'H', ['26.3'], {
  fuelQty: 200, fuelTank: ['fo1', 'fo2'], fuelSplit: 'fo1=120, fo2=80'
});
checkTrue('split helper confirms total matches quantity added',
  bunkerHints.some(h => h.code === 'BUNKER_SPLIT' && h.message.indexOf('matches quantity added') !== -1));

console.log('\nsludge transfer ROB');
const setup = EORB.defaultOrbSetup({
  tanks: {
    sludge: [
      { id: 'sludge1', name: 'Sludge Settling', capacityM3: 5, robM3: 3 },
      { id: 'sludge2', name: 'Sludge Tank', capacityM3: 8, robM3: 1 }
    ]
  }
});
const filled = EORB.autofillOperationValues(setup, 1, 'C', ['12.2'], {
  fromTank: 'sludge1', toTank: 'sludge2', qtyDisposed: 1.5
});
check('source retained auto-fills', filled.values.retained, 1.5);
check('receiving total auto-fills', filled.values.toTotal, 2.5);
EORB.applyOperationRob(setup, 1, 'C', ['12.2'], filled.values);
check('source ROB after transfer', setup.tanks.sludge[0].robM3, 1.5);
check('receiving ROB after transfer', setup.tanks.sludge[1].robM3, 2.5);

console.log('\nweekly inventory builder covers sludge and bilge');
const inv = EORB.buildWeeklyInventory(setup, [
  { id: 'sludge1', group: 'sludge', name: 'Sludge Settling', capacityM3: 5, robM3: 1.5, include: true },
  { id: 'bilge1', group: 'bilge', name: 'Bilge Holding', capacityM3: 10, robM3: 4, include: true }
], {});
check('one Code C entry per sludge tank', inv.entries.filter(e => e.code === 'C').length, 1);
check('one Code I entry per bilge tank', inv.entries.filter(e => e.code === 'I').length, 1);
checkTrue('each sludge tank entry has 11.1–11.3', inv.entries[0].lines.map(l => l.itemNo).join(',') === '11.1,11.2,11.3');

console.log('\nper-item signatory materialization');
const shards = EORB.materializeOrbSaveRecords({
  id: 'orb_test', part: 1, code: 'D', date: '2026-08-18', selectedItems: ['13', '14'],
  lines: [{ itemNo: '13', text: '3 m³ bilge' }, { itemNo: '14', text: 'start 02:00' }],
  officerName: 'A. Ruiz', officerRank: 'C/E', officerSignedAt: '2026-08-18T12:00:00'
}, setup);
check('multi-item save splits to one record per line', shards.length, 2);
check('each shard keeps a single item number', shards.map(s => s.lines[0].itemNo), ['13', '14']);

const bookRows = EORB.bookRowsHtml([{
  date: '2026-08-18', code: 'D', part: 1, officerName: 'A. Ruiz', officerRank: 'C/E',
  officerSignedAt: '2026-08-18T12:00:00',
  lines: [{ itemNo: '13', text: '3 m³ bilge' }]
}]);
checkTrue('date and code appear on the entry head row', bookRows.indexOf('18-Aug-2026') !== -1 && bookRows.indexOf('orb-code">D<') !== -1);
checkTrue('one signatory row after the item line', (bookRows.match(/orb-sign-row/g) || []).length === 1);

console.log('\nprint keeps voided lines struck through');
const html = EORB.buildPrintHtml(setup, [
  { date: '2026-08-01', code: 'C', part: 1, lines: [{ itemNo: '11.1', text: 'Sludge Tank' }], officerName: 'A. Ruiz', voided: true, voidReason: 'wrong tank' }
], 'test');
checkTrue('voided row is marked', html.indexOf('orb-voided') !== -1);
checkTrue('voided text is struck', html.indexOf('<s>SLUDGE TANK</s>') !== -1);
checkTrue('void reason is printed', html.indexOf('VOID') !== -1 && html.indexOf('wrong tank') !== -1);

console.log('\nthe operation list covers what the flag e-ORB offers');
{
  /* Every operation on the reference list, by the code and item it is filed under.
     A missing one means the engineer has to file it as a bare general remark. */
  const WANTED = [
    ['C', '11.4', 'manual collection into a sludge tank'],
    ['C', '12.1', 'sludge ashore via shore connection'],
    ['C', '12.2', 'draining water from a sludge tank to a bilge holding tank'],
    ['C', '12.2', 'sludge tank to tank transfer'],
    ['C', '12.3', 'incineration of sludge'],
    ['C', '12.4', 'evaporation of water from a sludge tank'],
    ['C', '12.4', 'FO/LO regeneration from sludge'],
    ['D', '15.1', 'bilge water overboard from an IOPP 3.3 tank'],
    ['D', '15.2', 'bilge water ashore via shore connection'],
    ['D', '15.3', 'bilge wells to a holding tank'],
    ['D', '15.3', 'bilge water between IOPP 3.3 tanks'],
    ['D', '15.3', 'bilge water to a sludge tank'],
    ['F', '19', 'failure of the oily water separator'],
    ['F', '20', 'restore of the oily water separator'],
    ['G', '22', 'accidental pollution'],
    ['H', '26.3', 'bunkering of fuel oil'],
    ['H', '26.3', 'bunkering of diesel oil'],
    ['H', '26.4', 'bunkering of bulk lubricating oil'],
    ['I', 'I', 'emptying and filling the bilge separation unit for maintenance'],
    ['I', 'I', 'pumping oily bilge water to an IOPP 3.3 tank'],
    ['I', 'I', 'entry for an earlier missed operation'],
    ['I', 'I', 'de-bunkering of fuel oil'],
    ['I', 'I', 'de-bunkering of diesel oil'],
    ['I', 'I', 'sealing of an Annex I valve / equipment'],
    ['I', 'I', 'breaking a seal on an Annex I valve / equipment'],
    ['I', 'I', 'evaporation of water from a bilge tank'],
    ['I', 'I', 'OWS / OCM test'],
    ['I', 'I', 'condensate from air coolers to a bilge holding tank'],
    ['I', 'I', 'additional operational procedures and general remarks']
  ];
  const part1 = EORB.SCENARIOS.filter(s => Number(s.part) === 1);
  const covered = (code, item) => part1.some(s => s.code === code && (s.items || []).indexOf(item) !== -1);
  WANTED.forEach(([code, item, what]) => {
    checkTrue(`${code}.${item} — ${what}`, covered(code, item));
  });
  /* One scenario per operation, not one shared entry doing several jobs. */
  const ids = part1.map(s => s.id);
  check('scenario ids are unique', ids.length, new Set(ids).size);
}

console.log('\nCode I carries the tank, quantity and duration MARPOL gives it no field for');
{
  const s2 = EORB.defaultOrbSetup({});
  s2.tanks.sludge = [{ id: 'SL1', name: 'Sludge Tk', capacityM3: 30, robM3: 12 }];
  s2.tanks.bilge = [{ id: 'BW1', name: 'Bilge Holding Tk', capacityM3: 20, robM3: 8 }];

  const move = { remarks: 'Oily bilge water pumped to holding tank.', extraFromTank: 'SL1', extraToTank: 'BW1', extraQty: 2.5 };
  const line = EORB.buildItemLines(1, 'I', ['I'], move, s2)[0];
  checkTrue('the wording names the quantity', line.text.indexOf('2.5 m³') !== -1);
  checkTrue('and both tanks', line.text.indexOf('Sludge Tk') !== -1 && line.text.indexOf('Bilge Holding Tk') !== -1);

  /* The point of the extra fields: a Code I operation that moves oil moves R.O.B. too,
     or the next weekly inventory disagrees with the book. */
  const notes = EORB.applyOperationRob(s2, 1, 'I', ['I'], move);
  check('source drawn down', s2.tanks.sludge[0].robM3, 9.5);
  check('receiving topped up', s2.tanks.bilge[0].robM3, 10.5);
  check('both movements reported', notes.length, 2);

  /* A retained figure the engineer sounded beats the arithmetic. */
  const s3 = EORB.defaultOrbSetup({});
  s3.tanks.bilge = [{ id: 'BW1', name: 'Bilge Holding Tk', capacityM3: 20, robM3: 8 }];
  EORB.applyOperationRob(s3, 1, 'I', ['I'], { extraFromTank: 'BW1', extraQty: 3, extraFromRetained: 4.2 });
  check('sounded retention wins over the subtraction', s3.tanks.bilge[0].robM3, 4.2);

  /* Never below empty, however much is claimed. */
  const s4 = EORB.defaultOrbSetup({});
  s4.tanks.bilge = [{ id: 'BW1', name: 'Bilge Holding Tk', capacityM3: 20, robM3: 1 }];
  EORB.applyOperationRob(s4, 1, 'I', ['I'], { extraFromTank: 'BW1', extraQty: 5 });
  check('a tank cannot go negative', s4.tanks.bilge[0].robM3, 0);

  const test = EORB.buildItemLines(1, 'I', ['I'],
    { remarks: 'Operational test of OCM and 15 ppm bilge alarm carried out.', testDurationMin: 20 }, s2)[0];
  checkTrue('test duration reaches the entry', test.text.indexOf('duration of test 20 minutes') !== -1);

  const owsTest = EORB.SCENARIOS.find(x => x.id === 'ows-weekly-test');
  checkTrue('the weekly OWS test offers a duration box',
    (owsTest.extraFields || []).some(f => f.name === 'testDurationMin'));
}

console.log('\nPart III — fuel changeover (Annex VI Reg. 14.6)');
{
  const s5 = EORB.defaultOrbSetup({});
  check('Part III has its own operation table', EORB.getPartOps(3).length, 1);
  check('four changeover events', EORB.getPartOps(3)[0].items.map(i => i.no), ['1', '2', '3', '4']);
  check('and a scenario for each', EORB.getScenarios(s5, 3).length, 4);
  const v = { coTime: '06:30', coPosition: '51 20 N 002 10 E', coToGrade: 'LSMGO', coSulphur: 0.08, coVolume: 145 };
  const done = EORB.buildItemLines(3, 'C', ['2'], v, s5)[0];
  checkTrue('completion reads as completed', done.text.indexOf('Changeover completed') !== -1);
  checkTrue('to low-sulphur fuel', done.text.indexOf('low-sulphur fuel') !== -1);
  checkTrue('carries the position', done.text.indexOf('51 20 N 002 10 E') !== -1);
  checkTrue('and the volume on board', done.text.indexOf('145 m³') !== -1);
  const start = EORB.buildItemLines(3, 'C', ['3'], v, s5)[0];
  checkTrue('the reverse leg reads as commenced', start.text.indexOf('Changeover commenced') !== -1);
  checkTrue('and back to residual', start.text.indexOf('residual fuel') !== -1);
  /* Changeover moves fuel between service tanks, not Annex I oil residue. */
  check('no Annex I tank R.O.B. effect', EORB.applyOperationRob(s5, 3, 'C', ['2'], v), []);
  const html3 = EORB.buildPrintHtml(s5, [{ date: '2026-08-01', code: 'C', part: 3, lines: [done], officerName: 'A. Ruiz' }], 'test');
  checkTrue('prints under its own heading', html3.indexOf('Fuel Oil Changeover Record — Part III') !== -1);
  checkTrue('Part III code reads PART III C on the sheet', html3.indexOf('PART III C') !== -1);
}

console.log('\ndate and code once per entry set, signatory row after each set');
{
  const s6 = EORB.defaultOrbSetup({});
  const entry = {
    date: '2026-08-01', code: 'C', part: 1, officerName: 'A. Ruiz', officerSignedAt: '2026-08-01T12:00:00',
    lines: [
      { itemNo: '11.1', text: 'Sludge Tk 1' }, { itemNo: '11.2', text: '30 m³' }, { itemNo: '11.3', text: '12 m³' },
      { itemNo: '11.1', text: 'Sludge Tk 2' }, { itemNo: '11.2', text: '20 m³' }, { itemNo: '11.3', text: '4 m³' }
    ]
  };
  const html6 = EORB.buildPrintHtml(s6, [entry], 'test');
  const body = html6.slice(html6.indexOf('<tbody>'), html6.indexOf('</tbody>'));
  const dateCells = (body.match(/01-Aug-2026/g) || []).length;
  const codeCells = (body.match(/orb-code">C</g) || []).length;
  check('the date is printed once for the legacy multi-line entry', dateCells, 1);
  check('and so is the letter code', codeCells, 1);
  check('one signatory row for the whole multi-line entry', (body.match(/orb-sign-row/g) || []).length, 1);
  checkTrue('item lines plus one signature row', (body.match(/<tr/g) || []).length === 7);

  const group = EORB.materializeOrbSaveRecords({
    id: 'orb_grp', part: 1, code: 'D', date: '2026-08-18', selectedItems: ['13', '14'],
    lines: [{ itemNo: '13', text: '3 m³' }, { itemNo: '14', text: 'start 02:00' }],
    officerName: 'A. Ruiz', officerSignedAt: '2026-08-18T12:00:00'
  }, s6);
  const groupHtml = EORB.bookRowsHtml(group);
  check('split save shows date once for the code+item set', (groupHtml.match(/18-Aug-2026/g) || []).length, 1);
  check('one signatory row after both item lines', (groupHtml.match(/orb-sign-row/g) || []).length, 1);
}

console.log('\ntank R.O.B. carries how full each tank is');
{
  const st = EORB.defaultOrbSetup({});
  st.tanks.sludge = [
    { id: 'SL1', name: 'Sludge Tk', capacityM3: 20, robM3: 19 },
    { id: 'SL2', name: 'Settling', capacityM3: 10, robM3: 8 },
    { id: 'SL3', name: 'Quarter full', capacityM3: 20, robM3: 5 },
    { id: 'SL4', name: 'No capacity on record', robM3: 3 }
  ];
  st.tanks.bilge = [{ id: 'BW1', name: 'Bilge Holding', capacityM3: 30, robM3: 6 }];
  const rows = EORB.tankRobStatus(st);
  const by = (n) => rows.find(r => r.name === n);

  check('every configured tank is reported', rows.length >= 5, true);
  check('percentage is quantity over capacity', by('Sludge Tk').pct, 95);
  check('a tank at 95% is flagged full', by('Sludge Tk').status, 'full');
  check('a tank at 80% is flagged high', by('Settling').status, 'high');
  check('a tank at 25% is not flagged', by('Quarter full').status, 'ok');
  /* An invented percentage is worse than none: without a capacity there is nothing
     to be a percentage of, and the quantity still has to be reported. */
  check('no capacity means no percentage', by('No capacity on record').pct, null);
  check('but the quantity is still there', by('No capacity on record').robM3, 3);
  check('and it is marked unknown, not full', by('No capacity on record').status, 'unknown');
  check('spare room is capacity less what is in it', by('Bilge Holding').spareM3, 24);
  check('a tank over its capacity has no negative spare',
    EORB.tankRobStatus({ tanks: { sludge: [{ id: 'X', name: 'X', capacityM3: 5, robM3: 7 }] } })[0].spareM3, 0);
  check('the R.O.B. groups are named for the certificate',
    [...new Set(rows.map(r => r.groupLabel))].slice(0, 2),
    ['Oil residue / sludge (IOPP 3.1)', 'Oily bilge water holding (IOPP 3.3)']);
  check('the thresholds are the ones the cards colour by',
    [EORB.TANK_HIGH_PCT, EORB.TANK_FULL_PCT], [75, 90]);
}

console.log('\nthe on-screen book and the printed sheet are one document');
{
  const st = EORB.defaultOrbSetup({});
  const entries = [
    { date: '2026-08-18', code: 'D', part: 1, officerName: 'A. Ruiz', officerRank: 'Chief Engineer',
      createdAt: '2026-08-18T00:00:00Z',
      lines: [{ itemNo: '13', text: '3.500 m³ bilge water' }, { itemNo: '14', text: 'start: 02:10, stop: 04:35' }] },
    { date: '2026-08-16', code: 'C', part: 1, officerName: 'A. Ruiz', createdAt: '2026-08-16T00:00:00Z',
      lines: [{ itemNo: '11.1', text: 'Sludge Tk' }, { itemNo: '11.3', text: '16.10 m³' }] }
  ];
  const rowsHtml = EORB.bookRowsHtml(entries, st);
  /* The print sheet is built from the same helper, so what is on screen is what
     comes out of the printer — the pair that silently diverged once before. */
  const printed = EORB.buildPrintHtml(st, entries, 'test');
  check('the printed sheet contains exactly the shared rows', printed.indexOf(rowsHtml) !== -1, true);

  check('entries come out in book order, oldest first',
    rowsHtml.indexOf('SLUDGE TK') < rowsHtml.indexOf('3.500 M³ BILGE WATER'), true);
  check('item lines plus one signature row per entry set', (rowsHtml.match(/<tr/g) || []).length, 6);
  check('one signatory row per saved entry set',
    (rowsHtml.match(/orb-sign-row/g) || []).length, 2);
  checkTrue('signature follows beORB NAME - RANK, DD-MON-YYYY [SIGNATURE]',
    /A\. RUIZ - CHIEF ENGINEER, 18-AUG-2026 \[SIGNATURE\]/.test(rowsHtml) ||
    /A\. RUIZ - CHIEF ENGINEER/.test(rowsHtml));

  const voided = EORB.bookRowsHtml([{ date: '2026-08-16', code: 'C', part: 1, officerName: 'A',
    voided: true, voidReason: 'wrong tank', lines: [{ itemNo: '11.1', text: 'Sludge Tk' }] }]);
  check('a struck line is struck in the book too', /<s>SLUDGE TK<\/s>/.test(voided), true);
  check('with the reason it was struck', /wrong tank/.test(voided), true);
  check('an empty book builds nothing rather than throwing', EORB.bookRowsHtml([]), '');
}

console.log('\nOWS overboard discharge sequence (OCM test then valve unseal)');
{
  const book = [
    { id: '1', date: '2026-09-29', scenarioId: 'ows-ocm-test', voided: false, createdAt: '2026-09-29T08:00:00Z' },
    { id: '2', date: '2026-09-29', scenarioId: 'seal-broken', voided: false, createdAt: '2026-09-29T09:00:00Z' }
  ];
  check('blocks discharge without prerequisites', EORB.owsDischargePrereqErrors([], {
    date: '2026-09-29', scenarioId: 'bilge-ows-sea'
  }).length >= 2, true);
  check('allows discharge when OCM and unseal logged same day',
    EORB.owsDischargePrereqErrors(book, { date: '2026-09-29', scenarioId: 'bilge-ows-sea' }).length, 0);
  checkTrue('form sheet builder includes table headers',
    EORB.buildWizardFormSheet(1, 'D', EORB.getOperation(1, 'D'), EORB.defaultOrbSetup({}), { scenarioId: 'bilge-ows-sea' }, ['13']).html.indexOf('orb-form-sheet') !== -1);
}

console.log('\nbeORB-style date / code / item No. columns');
{
  check('Date column uses title-case month', EORB.formatOrbDate('2026-08-24'), '24-Aug-2026');
  check('signature date is all-caps month', EORB.formatOrbSignDate('2026-08-24'), '24-AUG-2026');
  const iLines = EORB.buildItemLines(1, 'I', ['I'], { remarks: 'Weekly OWS test OK' }, EORB.defaultOrbSetup({}));
  check('Code I leaves Item No. blank', iLines[0] && iLines[0].itemNo, '');
  const iHtml = EORB.bookRowsHtml([{
    date: '2026-08-29', code: 'I', part: 1, officerName: 'Marvin C. Endozo', officerRank: 'C/E',
    officerSignedAt: '2026-08-29T12:00:00Z',
    lines: [{ itemNo: 'I', text: 'Test of OWS through recirculation line' }]
  }]);
  checkTrue('legacy Code I item "I" is blanked in the book',
    /orb-code">I<\/td><td><\/td>/.test(iHtml));
  checkTrue('headers name Code (letter) and Item No. (number)',
    EORB.buildPrintHtml(EORB.defaultOrbSetup({}), [{
      date: '2026-08-24', code: 'D', part: 1, officerName: 'A',
      lines: [{ itemNo: '13', text: '3 M3' }]
    }], 'test').indexOf('Item No.') !== -1 &&
    EORB.buildPrintHtml(EORB.defaultOrbSetup({}), [{
      date: '2026-08-24', code: 'D', part: 1, officerName: 'A',
      lines: [{ itemNo: '13', text: '3 M3' }]
    }], 'test').indexOf('(letter)') !== -1);
  check('signature line matches company printout pattern',
    EORB.formatOrbSignature({
      officerName: 'Jaycee S. Lugtu', officerRank: '4/E', officerSignedAt: '2026-08-24'
    }), 'JAYCEE S. LUGTU - 4/E, 24-AUG-2026 [SIGNATURE]');
  check('Part III book code label', EORB.formatOrbBookCode({ part: 3, code: 'C' }), 'PART III C');
  const sheet = EORB.buildPrintHtml(EORB.defaultOrbSetup({ shipName: 'FLAG EVI', imo: '9619799', callSign: '3FQU7' }), [{
    date: '2026-09-05', code: 'H', part: 1, officerName: 'Test', lines: [{ itemNo: '26.1', text: 'Port sample' }]
  }], 'Sep 2026');
  checkTrue('beORB-style ship header fields', sheet.indexOf('Name of Ship:') !== -1 &&
    sheet.indexOf('Official Number:') !== -1 && sheet.indexOf('IMO Number:') !== -1);
  checkTrue('rendered timestamp footer', sheet.indexOf('e-ORB Report Rendered:') !== -1);
  checkTrue('zebra and grey header styles', sheet.indexOf('nth-child(even)') !== -1);
}

console.log('\nflag state ORB signatory policy');
{
  check('Marshall Islands requires dual signatures', EORB.flagSignatoryPolicy('MH').mode,
    EORB.SIGNATORY_MODES.engineer_and_chief_engineer);
  check('Liberia requires dual signatures (beORB layout)', EORB.flagSignatoryPolicy('LR').mode,
    EORB.SIGNATORY_MODES.engineer_and_chief_engineer);
  checkTrue('requiresDualSignatory helper', EORB.requiresDualSignatory('LR') && EORB.requiresDualSignatory('MH'));
  checkTrue('single-sign flags excluded', !EORB.requiresDualSignatory('PA') && !EORB.requiresDualSignatory('MT'));
  check('Malta expects Chief Engineer only', EORB.flagSignatoryPolicy('MT').mode,
    EORB.SIGNATORY_MODES.chief_engineer_only);
  checkTrue('C/E rank is recognised', EORB.isChiefEngineerRank('C/E'));
  checkTrue('4/E is not C/E', !EORB.isChiefEngineerRank('4/E'));
  const mtSetup = EORB.defaultOrbSetup({ flag: 'MT', chiefEng: 'A. Ruiz' });
  check('Malta rejects non-C/E rank on save',
    EORB.validateEntrySignatory(mtSetup, { officerName: 'Jay', officerRank: '4/E' }).length, 1);
  const mhSetup = EORB.defaultOrbSetup({ flag: 'MH', chiefEng: 'Marvin C. Endozo' });
  const mhEntry = {
    date: '2026-08-18', code: 'D', part: 1,
    officerName: 'Jaycee S. Lugtu', officerRank: '4/E', officerSignedAt: '2026-08-18',
    chiefEngName: 'Marvin C. Endozo', chiefEngRank: 'C/E', chiefEngSignedAt: '2026-08-18',
    lines: [{ itemNo: '13', text: '3 m³' }]
  };
  check('dual policy prints two signature rows',
    (EORB.bookRowsHtml([mhEntry], mhSetup).match(/orb-sign-row/g) || []).length, 2);
  check('dual signatory lines differ', EORB.orbSignatoryLines(mhEntry, mhSetup).length, 2);
}

console.log();
if (failures.length) {
  console.log(`FAILED — ${failures.length} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
