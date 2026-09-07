#!/usr/bin/env node
/*
 * Flowmeter Record printout — A4 ÷ 8 watchkeeper slips.
 * Run: node tests/test_flowmeter_record_print.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log('\nFlowmeter Record printout');
check('flowmeterRecordRows helper', HTML.includes('function flowmeterRecordRows'));
check('buildFlowmeterRecordPageHtml helper', HTML.includes('function buildFlowmeterRecordPageHtml'));
check('printFlowmeterRecord helper', HTML.includes('function printFlowmeterRecord'));
check('preview sample helper', HTML.includes('function previewFlowmeterRecordSample'));
check('8-up grid CSS', HTML.includes('grid-template-rows:repeat(4, 1fr)') && HTML.includes('grid-template-columns:1fr 1fr'));
check('Reports All Meters button', HTML.includes('id="btnPrintFlowmeterRecordAll"'));
check('Reports Fuel Only button', HTML.includes('id="btnPrintFlowmeterRecordFuel"'));
check('Show Sample button', HTML.includes('id="btnPreviewFlowmeterRecordSample"'));
check('fuel mode excludes cyl/rc/fw', /mode !== 'fuel'[\s\S]{0,120}Cylinder Oil Meter[\s\S]{0,80}Rev\. Counter[\s\S]{0,80}FW Generator/.test(HTML));
check('all mode includes rev counter label', HTML.includes("'Rev. Counter'"));
check('wired print all click', HTML.includes("printFlowmeterRecord('all')"));
check('wired print fuel click', HTML.includes("printFlowmeterRecord('fuel')"));

console.log('');
if (failures) {
  console.log(`FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
