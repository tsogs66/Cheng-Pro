#!/usr/bin/env node
/*
 * Flowmeter Record + Log Entry Data handouts.
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
check('flowmeterRecordArrangement helper', HTML.includes('function flowmeterRecordArrangement'));
check('buildFlowmeterRecordPageHtml helper', HTML.includes('function buildFlowmeterRecordPageHtml'));
check('printFlowmeterRecord helper', HTML.includes('function printFlowmeterRecord'));
check('preview sample helper', HTML.includes('function previewFlowmeterRecordSample'));
check('8-up grid CSS', HTML.includes('grid-template-rows:repeat(4, 1fr)') && HTML.includes('grid-template-columns:1fr 1fr'));
check('Reports All Meters button', HTML.includes('id="btnPrintFlowmeterRecordAll"'));
check('Reports Fuel Only button', HTML.includes('id="btnPrintFlowmeterRecordFuel"'));
check('Show Sample button', HTML.includes('id="btnPreviewFlowmeterRecordSample"'));
check('fuel mode excludes cyl/rc/fw', /mode !== 'fuel'[\s\S]{0,200}Cylinder Oil[\s\S]{0,120}Rev\. Counter[\s\S]{0,120}FW Generator/.test(HTML));
check('dual layout uses Inlet/Outlet headers', HTML.includes('<th>Inlet</th><th>Outlet</th>'));
check('reads arrangement from vessel setup select', HTML.includes("getElementById('s_flowArr')"));
check('DUAL_ME / DUAL_BOTH mark M/E dual', /DUAL_ME[\s\S]{0,80}DUAL_BOTH[\s\S]{0,40}meDual/.test(HTML));
check('DUAL_GE / DUAL_BOTH mark G/E dual', /DUAL_GE[\s\S]{0,80}DUAL_BOTH[\s\S]{0,40}geDual/.test(HTML));
check('wired print all click', HTML.includes("printFlowmeterRecord('all')"));
check('wired print fuel click', HTML.includes("printFlowmeterRecord('fuel')"));
check('hint updates with flowArr change', HTML.includes('updateFlowmeterRecordArrHint'));

console.log('\nLog Entry Data record (A4 landscape ÷2)');
check('buildLogEntryDataHalfHtml helper', HTML.includes('function buildLogEntryDataHalfHtml'));
check('buildLogEntryDataPageHtml helper', HTML.includes('function buildLogEntryDataPageHtml'));
check('printLogEntryDataRecord helper', HTML.includes('function printLogEntryDataRecord'));
check('preview log entry sample', HTML.includes('function previewLogEntryDataSample'));
check('landscape A4 page size', HTML.includes('size: A4 landscape') && HTML.includes('.pr-led-page'));
check('two equal halves grid', /pr-led-page\{[\s\S]{0,200}grid-template-columns:1fr 1fr/.test(HTML));
check('Reports print button', HTML.includes('id="btnPrintLogEntryDataRecord"'));
check('Reports sample button', HTML.includes('id="btnPreviewLogEntryDataSample"'));
check('excludes flowmeters from title/sub', HTML.includes('not flowmeters or consumption'));
check('includes cylinder rack/exhaust', HTML.includes('M/E cylinders — pump rack'));
check('wired print click', HTML.includes('printLogEntryDataRecord()'));
check('wired sample click', HTML.includes('previewLogEntryDataSample()'));

console.log('');
if (failures) {
  console.log(`FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
