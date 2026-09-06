/*
 * ROB re-basing after a bunker survey.
 *
 * The ROB chain is the numerically critical part of this app: every report's
 * opening figure is the previous report's closing figure, so an error at one
 * entry is carried for the rest of the voyage. These checks pin down what a
 * survey does to that chain.
 *
 * Run: node tests/test_rob_survey.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');

let failures = 0, checks = 0;
function check(label, actual, expected) {
  checks++;
  const ok = Math.abs((actual ?? NaN) - expected) < 1e-6 || actual === expected;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `: expected ${expected}, got ${actual}`}`);
  if (!ok) failures++;
}

/* Pull the ROB engine out of the page and run it against a hand-built state, so
   the arithmetic is tested without a browser or the rest of the app. */
function extract(name) {
  const start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in voyage_manager.html`);
  let depth = 0, i = HTML.indexOf('{', start);
  const from = i;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(start, i + 1);
}

const FUEL_TANKS = [
  { id: 'hfo', name: 'HFO', grade: 'HFO' },
  { id: 'mdomgo', name: 'MDO/MGO', grade: 'MDO/MGO' },
];
const LUBE_TANKS = [{ id: 'cylhigh', name: 'CYL HIGH', kind: 'cylHigh' }];
const FW_TANKS = [{ id: 'freshwater', name: 'FRESH WATER' }];

function makeSandbox(state) {
  const sandbox = {
    state,
    FUEL_TYPES: ['HFO', 'MDO/MGO'],
    fuelTankList: () => FUEL_TANKS,
    lubeTankList: () => LUBE_TANKS,
    fwTankList: () => FW_TANKS,
    tankRobValue: (store, t) => store?.[t.id] ?? store?.[t.name] ?? 0,
    lubeKindToLabel: k => ({ cylHigh: 'CYL HIGH' }[k] || k),
    receiptMatchesTank: (r, tank, cats) => {
      const list = Array.isArray(cats) ? cats : [cats];
      if (!r || !tank || !list.includes(r.category)) return false;
      return r.tankId ? r.tankId === tank.id : r.type === tank.name || r.type === tank.grade;
    },
    deductGradeConsumption: (rob, tanks, grade, key, amount) => {
      const t = tanks.find(x => x[key] === grade);
      if (t) rob[t.id] -= amount;
    },
    deductLubeConsumption: (robLube, kind, amount) => {
      const t = LUBE_TANKS.find(x => x.kind === kind);
      if (t) robLube[t.id] -= amount;
    },
    latestFwRob: () => null,
    computeDerived: () => ({ rows: state.rows }),
    console,
  };
  vm.createContext(sandbox);
  /* robAsOfComputedRow now folds stamped summary Received (with rob-survey
     receipt mirrors only as a no-stamp fallback) — extract those helpers too. */
  vm.runInContext(
    [
      extract('latestRobSurveyAtOrBefore'),
      extract('receiptDayAfter'),
      extract('entryHasStampedReceived'),
      extract('stampedReceivedAsOf'),
      extract('robAsOfComputedRow'),
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

/* Two reports, then a bunker, then two more. HFO burns 10 MT per report. */
function baseState() {
  const rows = [
    { id: 'e1', datetime: '2026-03-01T12:00', cumFuel: { HFO: 10, 'MDO/MGO': 1 }, cumLube: { 'CYL HIGH': 100 } },
    { id: 'e2', datetime: '2026-03-02T12:00', cumFuel: { HFO: 20, 'MDO/MGO': 2 }, cumLube: { 'CYL HIGH': 200 } },
    { id: 'e3', datetime: '2026-03-03T12:00', cumFuel: { HFO: 30, 'MDO/MGO': 3 }, cumLube: { 'CYL HIGH': 300 } },
    { id: 'e4', datetime: '2026-03-04T12:00', cumFuel: { HFO: 40, 'MDO/MGO': 4 }, cumLube: { 'CYL HIGH': 400 } },
  ];
  return {
    rows,
    entries: rows.map(r => ({ id: r.id, datetime: r.datetime, robSurvey: null })),
    receipts: [],
    setup: { rob: { hfo: 500, mdomgo: 100 }, robLube: { cylhigh: 5000, freshwater: 60000 } },
  };
}

const robOf = (sb, st, id) => sb.robAsOfComputedRow(st.rows.find(r => r.id === id), st.rows);

console.log('\nthe ordinary chain, with no survey');
{
  const st = baseState();
  const sb = makeSandbox(st);
  check('HFO falls by consumption', robOf(sb, st, 'e2').rob.hfo, 480);
  check('and keeps falling', robOf(sb, st, 'e4').rob.hfo, 460);
}

console.log('\na bunker received is added, and carries into later reports');
{
  const st = baseState();
  st.receipts.push({ id: 'r1', date: '2026-03-02', category: 'fuel', tankId: 'hfo', qty: 300 });
  const sb = makeSandbox(st);
  check('the report before the bunker is untouched', robOf(sb, st, 'e1').rob.hfo, 490);
  check('the bunker lands on the day it was received', robOf(sb, st, 'e2').rob.hfo, 780);
  check('and the next report opens from it', robOf(sb, st, 'e3').rob.hfo, 770);
}

console.log('\na plain tank survey, no bunkering involved');
{
  const st = baseState();
  /* The book says 480 at e2; the tanks actually sound 475 — a 5 MT shortfall. */
  st.entries[1].robSurvey = {
    measured: { hfo: 475, mdomgo: 98 },
    measuredLube: { cylhigh: 4790, freshwater: 59000 },
    calculated: { hfo: 480, mdomgo: 98 },
    calculatedLube: { cylhigh: 4800, freshwater: 60000 },
    difference: { hfo: -5 },
  };
  const sb = makeSandbox(st);
  check('the surveyed report shows the measured figure', robOf(sb, st, 'e2').rob.hfo, 475);
  check('reports before the survey are untouched', robOf(sb, st, 'e1').rob.hfo, 490);
  check('the next report opens from the measured figure', robOf(sb, st, 'e3').rob.hfo, 465);
  check('and the shortfall is not re-applied later', robOf(sb, st, 'e4').rob.hfo, 455);
  check('lube re-bases too', robOf(sb, st, 'e3').robLube.cylhigh, 4690);
  check('an unsounded tank falls back to the book figure at the survey',
    robOf(sb, st, 'e3').rob.mdomgo, 97);
}

console.log('\na bunker taken before the survey is not counted twice');
{
  const st = baseState();
  st.receipts.push({ id: 'r1', date: '2026-03-02', category: 'fuel', tankId: 'hfo', qty: 300 });
  /* Surveyed after bunkering on the same day: the measurement already includes it. */
  st.entries[1].robSurvey = {
    measured: { hfo: 778 }, calculated: { hfo: 780 },
    measuredLube: {}, calculatedLube: {}, difference: { hfo: -2 },
  };
  const sb = makeSandbox(st);
  check('the survey figure stands, not survey + bunker', robOf(sb, st, 'e2').rob.hfo, 778);
  check('and the next report opens from it', robOf(sb, st, 'e3').rob.hfo, 768);
}

console.log('\na bunker received after the survey still adds');
{
  const st = baseState();
  st.entries[1].robSurvey = {
    measured: { hfo: 475 }, calculated: { hfo: 480 },
    measuredLube: {}, calculatedLube: {}, difference: { hfo: -5 },
  };
  st.receipts.push({ id: 'r2', date: '2026-03-03', category: 'fuel', tankId: 'hfo', qty: 200 });
  const sb = makeSandbox(st);
  check('the later bunker is added to the re-based figure', robOf(sb, st, 'e3').rob.hfo, 665);
  check('and carries on', robOf(sb, st, 'e4').rob.hfo, 655);
}

console.log('\nthe later of two surveys wins');
{
  const st = baseState();
  st.entries[1].robSurvey = { measured: { hfo: 475 }, calculated: { hfo: 480 }, measuredLube: {}, calculatedLube: {} };
  st.entries[2].robSurvey = { measured: { hfo: 900 }, calculated: { hfo: 465 }, measuredLube: {}, calculatedLube: {} };
  const sb = makeSandbox(st);
  check('the second survey re-bases again', robOf(sb, st, 'e3').rob.hfo, 900);
  check('and the next report follows it', robOf(sb, st, 'e4').rob.hfo, 890);
  check('the first survey still governs its own report', robOf(sb, st, 'e2').rob.hfo, 475);
}


console.log('\na survey after bunkering: the measurement is the delivery check');
{
  const st = baseState();
  /* 300 MT delivered on the BDN; the survey that follows finds only 296 in the
     tanks. The 4 MT is a short delivery, and the chain must go on from what is
     actually aboard — not from what the BDN claimed. */
  st.receipts.push({ id: 'r1', date: '2026-03-02', category: 'fuel', tankId: 'hfo', qty: 300 });
  st.entries[1].robSurvey = {
    measured: { hfo: 776 }, calculated: { hfo: 780 },
    measuredLube: {}, calculatedLube: {}, difference: { hfo: -4 },
  };
  const sb = makeSandbox(st);
  const noSurvey = baseState();
  noSurvey.receipts.push({ id: 'r1', date: '2026-03-02', category: 'fuel', tankId: 'hfo', qty: 300 });
  check('the book expected the full BDN quantity',
    robOf(makeSandbox(noSurvey), noSurvey, 'e2').rob.hfo, 780);
  check('the chain goes on from what is aboard', robOf(sb, st, 'e2').rob.hfo, 776);
  check('the short delivery is not silently made up later', robOf(sb, st, 'e3').rob.hfo, 766);
  check('and the receipt is still on file for the claim', st.receipts[0].qty, 300);
}

console.log('\na survey on a voyage that has never bunkered');
{
  const st = baseState();                       // no receipts at all, ever
  st.entries[2].robSurvey = {
    measured: { hfo: 468 }, calculated: { hfo: 470 },
    measuredLube: { cylhigh: 4680 }, calculatedLube: { cylhigh: 4700 },
    difference: { hfo: -2 }, differenceLube: { cylhigh: -20 },
  };
  const sb = makeSandbox(st);
  check('no receipts are needed for a survey to apply', robOf(sb, st, 'e3').rob.hfo, 468);
  check('the next report follows the tanks', robOf(sb, st, 'e4').rob.hfo, 458);
  check('lube too', robOf(sb, st, 'e4').robLube.cylhigh, 4580);
  check('reports before it keep the book figure', robOf(sb, st, 'e2').rob.hfo, 480);
}

console.log(failures ? `\nFAILED — ${failures} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(failures ? 1 : 0);
