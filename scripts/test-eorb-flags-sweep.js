/**
 * Every e-ORB entry type, for every flag.
 *
 * Builds each item of Part I, II and III and each scenario with sample values, for each flag state in
 * the program, and checks nothing throws, every entry produces record lines, no line carries
 * "undefined" or "NaN", and the signatory rules of each flag behave as its policy says. Changing the
 * flag in ORB Vessel Setup changes only the signatory policy, the notes and what is offered, never
 * whether an entry can be written.
 *
 * It found a real fault: Part II Code D (crude oil washing) items 13 and 14 were run through the
 * Part I wording for Code D 13 and 14 (bilge water quantity, times), which reads fields those items
 * do not have, so a crude oil washing entry could not be built at all.
 */
'use strict';
const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '..', 'modules', 'voyage', 'www', 'eorb.js'));
const E = globalThis.EORB;
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass += 1; };

const T = (id, name) => ({ id, name, frameNo: '', capacityM3: 50, robM3: 10 });
const base = E.defaultOrbSetup({
  shipName: 'MV SWEEP', shipType: 'tanker', chiefEng: 'Ana Ruiz',
  equipment: { odmeFitted: true, cowFitted: true, cbtFitted: true },
  tanks: {
    fuel: [{ id: 'fo1', name: 'HFO 1', capacityM3: 100, robM3: 10, service: 'residual' }, { id: 'do1', name: 'MDO 1', capacityM3: 50, robM3: 10, service: 'distillate' }],
    lube: [T('lo1', 'LO 1')], cargo: [T('c1', 'Cargo 1')], slop: [T('s1', 'Slop 1')], cbt: [T('b1', 'CBT 1')], dirtyBallast: [T('d1', 'DB 1')]
  }
});

function dummy(f, setup) {
  switch (f.type) {
    case 'number': return '1.5';
    case 'time': return '08:30';
    case 'date': return '2026-11-01';
    case 'select': return (f.options && f.options[0]) || 'Yes';
    case 'position': return '12°00.0N 045°00.0E';
    case 'tank': { const t = E.tanksForGroup(setup, f.tankGroup || 'any')[0]; return t ? t.id : ''; }
    case 'tankMulti': { const t = E.tanksForGroup(setup, f.tankGroup || 'any')[0]; return t ? [t.id] : []; }
    default: return 'Sample text';
  }
}
function valuesFor(part, code, items, setup) {
  const vals = {};
  const take = (p, c, nos) => {
    const op = E.getOperation(p, c);
    op.items.filter(i => nos.indexOf(i.no) !== -1).forEach(i => (i.fields || []).forEach(f => { vals[f.name] = dummy(f, setup); }));
  };
  take(part, code, items);
  /* Burning sludge or garbage continues into Part III E: position, time, oxygen, temperature. */
  take(3, 'E', ['6', '7', '8']);
  return vals;
}

let combos = 0;
for (const flag of E.FLAGS) {
  const setup = JSON.parse(JSON.stringify(base));
  setup.flag = flag.code;
  const pol = E.flagSignatoryPolicy(flag.code);

  /* Signatory policy of this flag. */
  const second = E.validateEntrySignatory(setup, { officerName: 'Bo Lee', officerRank: '2nd Engineer' });
  ok(pol.mode === 'chief_engineer_only' ? second.length > 0 : second.length === 0, flag.code + ': a 2nd Engineer is ' + (pol.mode === 'chief_engineer_only' ? 'refused' : 'accepted') + ' as signatory');
  const chief = E.validateEntrySignatory(setup, { officerName: 'Ana Ruiz', officerRank: 'Chief Engineer' });
  ok(chief.length === 0, flag.code + ': the Chief Engineer is always accepted');
  const lines = E.orbSignatoryLines({ officerName: 'Bo Lee', officerRank: '2nd Engineer', officerSignedAt: '2026-11-01' }, setup);
  ok(pol.mode === 'engineer_and_chief_engineer' ? lines.length === 2 : lines.length === 1, flag.code + ': signature rows follow the policy');

  for (const part of [1, 2, 3]) {
    for (const op of E.getPartOps(part)) {
      for (const it of op.items) {
        combos++;
        const vals = valuesFor(part, op.code, [it.no], setup);
        const where = flag.code + ' Part ' + part + ' ' + op.code + ' item ' + it.no;
        const errs = E.validateEntry(part, op.code, [it.no], vals, setup, '');
        ok(errs.length === 0, where + ' with every field filled: ' + errs.join(' | '));
        const out = E.buildItemLines(part, op.code, [it.no], vals, setup);
        ok(out.length > 0, where + ' produces record lines');
        ok(!/undefined|NaN|\[object/.test(out.map(l => l.text).join(' ')), where + ' has no undefined / NaN in its wording');
      }
    }
    for (const sc of E.getScenarios(setup, part)) {
      combos++;
      const vals = valuesFor(part, sc.code, sc.items, setup);
      const out = E.buildItemLines(part, sc.code, sc.items, vals, setup, sc.id);
      ok(out.length > 0, flag.code + ' scenario ' + sc.id + ' produces record lines');
      E.scenarioFlagWarning(setup, sc);
    }
  }
}
ok(combos > 1500, 'a thorough sweep: ' + combos + ' combinations');

/* Part II Code R ends with item 85, the port authority official's date, signature and stamp. */
ok(E.getOperation(2, 'R').items.some(i => i.no === '85' && /port authority official/i.test(i.label)), 'Part II R has item 85');
ok(/Total quantity of ballast water discharged/.test(E.getOperation(2, 'R').items.find(i => i.no === '84').label), 'Part II R 84 reads as the official form does');
{
  const pa = E.defaultOrbSetup({ flag: 'PA' }), lr = E.defaultOrbSetup({ flag: 'LR' });
  ok(E.getScenarios(pa, 1).some(x => x.id === 'incinerator-garbage'), 'the garbage-incineration entry is offered on Panama ships');
  ok(!E.getScenarios(lr, 1).some(x => x.id === 'incinerator-garbage'), 'and not on other flags');
}

/* Part II Code D 13 / 14 are the washing pattern and pressure. */
{
  const setup = JSON.parse(JSON.stringify(base));
  const out = E.buildItemLines(2, 'D', ['13', '14'], { pattern: 'Standard', pressure: '10 bar' }, setup);
  ok(out.some(l => l.itemNo === '13' && /Standard/.test(l.text)), 'COW item 13 carries the washing pattern');
  ok(out.some(l => l.itemNo === '14' && /10 bar/.test(l.text)), 'COW item 14 carries the line pressure');
}

/* Flag guide */
const pubs = E.FLAG_PUBLICATIONS;
['IMO', 'LR', 'MH', 'PA', 'BS', 'SG', 'MT', 'HK', 'CY', 'GB'].forEach(k => ok(pubs[k], k + ' has a publication list'));
Object.keys(pubs).forEach(k => {
  ok((pubs[k].documents || []).length > 0, k + ' lists documents');
  pubs[k].documents.forEach(d => {
    ok(d.ref && d.title, k + ' document has a number and a title');
    ok(!d.url || /^https:\/\//.test(d.url), k + ' ' + d.ref + ': links are https');
  });
});
ok(pubs.IMO.history.some(h => /Rev\.2/.test(h.change) && /6 Oct 2011/.test(h.date)), 'MEPC.1/Circ.736/Rev.2 (6 October 2011) is in the history');
ok(pubs.PA.history.some(h => /MMC-23/.test(h.change)), 'Panama MMC-215 replaces MMC-23, 83, 148, 154, 177');
ok(pubs.LR.documents.some(d => /08\/24/.test(d.date || '')), 'Liberia POL-012 is Rev. 08/24');
ok(pubs.MH.documents.some(d => d.ref === 'MI-402A' && /Nov\/2025/.test(d.date) && d.checked === 'read'), 'Marshall Islands MI-402A (Rev. Nov/2025) is listed and read');
ok(pubs.MH.documents.some(d => d.ref === 'MG 2-13-3' && /Dec\/2017/.test(d.date) && d.checked === 'read'), 'Marshall Islands MG 2-13-3 (Rev. Dec/2017) is listed and read');
ok(E.getFlag('MH').tips.some(t => /MI-402A/.test(t)), 'the Marshall Islands tips point at MI-402A');
ok(pubs.MH.documents.some(d => d.ref === 'MN 2-013-3' && /Mar\/2017/.test(d.date) && d.checked === 'read'), 'Marshall Islands MN 2-013-3 (Rev. Mar/2017) is read');
ok(E.getFlag('MH').tips.some(t => /sealing of overboard discharge valves/.test(t)), 'the Marshall Islands tips carry the sealing and inoperative-equipment rule');
ok(pubs.MT.documents.some(d => /MARPOL\.11 Rev\.1/.test(d.ref) && /8 August 2023/.test(d.date) && d.checked === 'read'), 'Malta Technical Notice MARPOL.11 Rev.1 (8 Aug 2023) is read');
ok(pubs.MT.documents.some(d => /MARPOL\.7/.test(d.ref) && /superseded/i.test(d.title)), 'Malta MARPOL.7 is shown as superseded');
ok(pubs.CY.documents.some(d => d.ref === 'Circular 22/2020' && d.checked === 'read'), 'Cyprus Circular 22/2020 is read');
ok(pubs.CY.history.some(h => /19\/2017/.test(h.change)), 'Cyprus Circular 19/2017 is shown as ceased');
ok(!E.flagHasPartIII({ flag: 'CY' }) && !E.flagHasPartIII({ flag: 'MT' }), 'Cyprus and Malta have no Part III (fuel changeover is a separate record)');
ok(E.flagSignatoryPolicy('MH').mode === 'engineer_or_ce', 'Marshall Islands: the officer in charge signs, the Chief Engineer reviews');
ok(pubs.BS.documents.some(d => /MN056/.test(d.ref)) && pubs.BS.documents.some(d => /v2\.3/.test(d.ref)), 'Bahamas lists MN056 and MN010 v2.3');
ok(/open the original/i.test(E.FLAG_GUIDE_NOTICE), 'the guide tells the reader to check the original');
ok(E.WASTE_RECORDING_GUIDE.length === 5, 'sludge in an incinerator and in a boiler, domestic garbage, oily rags and the Panama exception are covered');
const rags = E.WASTE_RECORDING_GUIDE.find(r => /oily rags/i.test(r.waste));
ok(rags && /Garbage Record Book only/.test(rags.book), 'oily rags and used filters: Garbage Record Book only');
ok(E.WASTE_RECORDING_GUIDE.some(r => /boiler/i.test(r.waste) && /12\.4/.test(r.book)), 'sludge burned in a boiler is C 12.4');
ok(/Garbage Record Book/.test(E.getScenario('incinerator-garbage').formNotes.join(' ')), 'the garbage-incineration entry says where garbage is recorded');
console.log(`e-ORB flags sweep: ${pass} checks passed (${combos} entry combinations)`);
