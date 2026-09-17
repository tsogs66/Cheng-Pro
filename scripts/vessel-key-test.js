'use strict';

/**
 * One ship, one identity.
 *
 * The cases that matter are the ones where a ship is written down differently
 * in Tank Chief than in Voyage Chief, and the ones where two ships must NOT be
 * folded together — a wrong merge puts one vessel's soundings under another's
 * name, which is worse than showing two rows.
 *
 * Run: node scripts/vessel-key-test.js
 */
const VK = require('../apps/web/js/vessel-key.js');

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures += 1;
}

console.log('\nthe prefix a crew writes is not part of the name');
for (const spelling of ['MV CAPTAIN VENIAMIS', 'M/V Captain Veniamis', 'M.V. captain veniamis',
  'm v  captain   veniamis', 'Captain Veniamis', 'MOTOR VESSEL Captain Veniamis']) {
  check(`"${spelling}"`, VK.normalizeName(spelling), 'CAPTAIN VENIAMIS');
}
check('tankers too', VK.normalizeName('M/T Pacific Trader'), 'PACIFIC TRADER');
check('a name that is only the prefix is kept', VK.normalizeName('MV'), 'MV');
check('a prefix inside the name is left alone', VK.normalizeName('Ocean MV Star'), 'OCEAN MV STAR');
check('nothing in, nothing out', VK.normalizeName('   '), '');

console.log('\nIMO numbers');
check('digits are pulled out of any spelling', VK.normalizeImo('IMO 9684412'), '9684412');
check('and out of punctuation', VK.normalizeImo('IMO-968.4412'), '9684412');
check('six digits is not an IMO', VK.normalizeImo('968441'), '');
check('nor is eight', VK.normalizeImo('96844123'), '');
check('a real IMO passes its check digit', VK.isValidImo('9074729'), true);
check('a mistyped one is reported, not rejected', VK.isValidImo('9684413'), false);
check('but it still normalises, so it can still match', VK.normalizeImo('9684413'), '9684413');

console.log('\nwhich identifier decides');
check('IMO when there is one', VK.vesselKey({ name: 'MV Athena', imo: '9074729' }), 'imo:9074729');
check('name when there is not', VK.vesselKey({ name: 'MV Athena' }), 'name:ATHENA');
check('neither is not a key', VK.vesselKey({}), '');

console.log('\nthe same ship, written two ways');
check('Tank spelling vs Voyage spelling',
  VK.sameVessel({ name: 'MV CAPTAIN VENIAMIS' }, { name: 'M/V Captain Veniamis' }), true);
check('IMO agrees though the names differ (renamed ship)',
  VK.sameVessel({ name: 'Athena', imo: '9074729' }, { name: 'Athena II', imo: '9074729' }), true);
check('one side has the IMO, the other only the name',
  VK.sameVessel({ name: 'MV Athena', imo: '9074729' }, { name: 'M/V ATHENA' }), true);

console.log('\ntwo different ships must stay apart');
check('same name, different IMO — two ships do share names',
  VK.sameVessel({ name: 'Athena', imo: '9074729' }, { name: 'Athena', imo: '9684412' }), false);
check('different names, no IMO',
  VK.sameVessel({ name: 'Athena' }, { name: 'Artemis' }), false);
check('an empty record matches nothing',
  VK.sameVessel({}, {}), false);
check('not even another empty one, via the key',
  VK.vesselKey({}) === VK.vesselKey({ name: '' }) && VK.vesselKey({}) === '', true);

console.log('\nfolding both programs into one row per ship');
const merged = VK.mergeVessels([
  { source: 'tank', ownerEmail: 'ce@example.com', record: { name: 'MV CAPTAIN VENIAMIS', imo: '' } },
  { source: 'voyage', ownerEmail: 'ce@example.com', record: { name: 'M/V Captain Veniamis', imo: '9074729' } },
  { source: 'tank', ownerEmail: 'other@example.com', record: { name: 'MT Pacific Trader', imo: '9684412' } },
  { source: 'voyage', ownerEmail: 'other@example.com', record: { name: 'Pacific Trader', imo: '9684412' } },
  { source: 'tank', ownerEmail: 'other@example.com', record: { name: 'Artemis' } },
]);
check('three ships out of five records', merged.length, 3);
const veniamis = merged.find((r) => r.name.includes('Veniamis') || r.name.includes('VENIAMIS'));
check('the pair is one row', veniamis.sources.length, 2);
check('and carries the IMO from whichever side had it', veniamis.imo, '9074729');
check('keyed by IMO once it has one', veniamis.key, 'imo:9074729');
const trader = merged.find((r) => r.imo === '9684412');
check('matched on IMO across programs', trader.sources.length, 2);
const artemis = merged.find((r) => r.key === 'name:ARTEMIS');
check('a ship in one program only stays on its own', artemis.sources.length, 1);

console.log('\nthe engineer’s own ships come first');
const sorted = VK.sortForOwner(merged, 'ce@example.com');
check('his vessel is at the top', sorted[0].imo, '9074729');
check('the rest follow alphabetically', sorted.slice(1).map((r) => r.name),
  ['Artemis', 'MT Pacific Trader']);
check('the server’s folder slug counts as the same owner',
  VK.sortForOwner(VK.mergeVessels([
    { source: 'tank', ownerSlug: 'ce-example-com', record: { name: 'Zulu' } },
    { source: 'tank', ownerSlug: 'other-example-com', record: { name: 'Alpha' } },
  ]), 'ce@example.com')[0].name, 'Zulu');
check('no email signed in — plain alphabetical, nothing pinned',
  VK.sortForOwner(merged, '').map((r) => r.name),
  ['Artemis', 'MT Pacific Trader', 'MV CAPTAIN VENIAMIS']);

if (failures) {
  console.log(`\nFAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`\nPASSED — ${checks} checks`);
