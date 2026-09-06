/*
 * Fresh Water Generator flowmeter in Ship Details → start-of-voyage carryover.
 * Run: node tests/test_fw_gen_flowmeter.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');
const failures = [];
let checks = 0;

function check(label, ok) {
  checks += 1;
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}`);
  if (!ok) failures.push(label);
}

console.log('\nFW generator flowmeter — ship details + voyage start');

check('Ship Details has Fresh Water Generator row', HTML.includes('id="s_fm_fw_reading"') && HTML.includes('Fresh Water Generator'));
check('Max digits field for FW generator', HTML.includes('id="s_fm_fw_digits"'));
check('Default setup includes flowmeters.fw', /fw:\{\s*reading:null,\s*digits:8\s*}/.test(HTML));
check('migrateSetup ensures fw key', HTML.includes("['main','mainOut','aux','auxOut','boiler','cyl','rc','fw']"));
check('effectiveCarryover uses fm.fw reading for fwProd', HTML.includes('fwProd: fm.fw?.reading ?? null'));
check('meterRollovers exposes fw digits', /fw:\s*dig\('fw'\)/.test(HTML));
check('Derived FW production uses rolls.fw', /meterDelta\([^)]*fwProd[^)]*,\s*rolls\.fw\)/.test(HTML));
check('Save setup persists s_fm_fw_*', HTML.includes("numOrNull('s_fm_fw_reading')") && HTML.includes("intOr8('s_fm_fw_digits')"));
check('Load-from-last copies last.fwProd into flowmeters.fw', /fw:\s*\{\s*reading:\s*last\.fwProd/.test(HTML));
check('Fill setup form reads fm.fw', HTML.includes("getElementById('s_fm_fw_reading')"));

console.log(`\n${checks - failures.length}/${checks} passed`);
if (failures.length) {
  console.error('Failed:', failures.join(', '));
  process.exit(1);
}
