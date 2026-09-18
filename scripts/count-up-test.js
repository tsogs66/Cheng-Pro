'use strict';

/**
 * The count-up must never change what a figure says — only how it arrives.
 *
 * Every check here is about the value the engineer ends up reading: the last
 * frame is the text that was handed in, anything that is not a figure is
 * written straight through, and a redraw that produces the same number does
 * nothing at all.
 *
 * Run: node scripts/count-up-test.js
 */
const CU = require('../apps/web/js/count-up.js');

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures += 1;
}

console.log('\nfigures these programs print');
check('plain', CU.parse('420.0'), { n: 420, tail: '', raw: '420.0' });
check('grouped', CU.parse('3,598.7'), { n: 3598.7, tail: '', raw: '3,598.7' });
check('with a unit', CU.parse('44.7 MT'), { n: 44.7, tail: ' MT', raw: '44.7' });
check('cubic metres', CU.parse('456.74 m³'), { n: 456.74, tail: ' m³', raw: '456.74' });
check('percent', CU.parse('79.8%'), { n: 79.8, tail: '%', raw: '79.8' });
check('negative', CU.parse('-12.5'), { n: -12.5, tail: '', raw: '-12.5' });
check('zero is a figure', CU.parse('0').n, 0);

console.log('\nthings that are not figures and must pass straight through');
for (const s of ['—', '', 'n/a', 'NO.1 H.F.O. TANK (P)', '2026-09-04', '7/9', '65 B', '1.2.3']) {
  check(`"${s}"`, CU.parse(s), null);
}

console.log('\nthe element only ever ends on the text it was given');
function fakeEl(text) {
  return { textContent: text, _chengCount: null };
}
/* No requestAnimationFrame here, so to() takes the straight-through path for
   anything it cannot animate — which is exactly what must be verified. */
global.window = { matchMedia: () => ({ matches: true }) };   // reduced motion
let el = fakeEl('420.0');
check('reduced motion writes through, no animation', CU.to(el, '350.0'), false);
check('  and the text is exact', el.textContent, '350.0');

global.window = { matchMedia: () => ({ matches: false }) };
el = fakeEl('—');
check('a dash to a figure is not animated', CU.to(el, '420.0'), false);
check('  and the text is exact', el.textContent, '420.0');

el = fakeEl('420.0');
check('a figure to a dash is not animated', CU.to(el, '—'), false);
check('  and the text is exact', el.textContent, '—');

el = fakeEl('420.0');
check('the same value again does nothing', CU.to(el, '420.0'), false);
check('  and the text is exact', el.textContent, '420.0');

el = fakeEl('420.000');
check('same number, different spelling, still nothing', CU.to(el, '420.0'), false);

if (failures) {
  console.log(`\nFAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`\nPASSED — ${checks} checks`);
