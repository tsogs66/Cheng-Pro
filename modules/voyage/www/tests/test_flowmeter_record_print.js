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
check('single-page overflow lock', /max-height:210mm[\s\S]{0,80}overflow:hidden/.test(HTML) && HTML.includes('page-break-inside:avoid'));
check('fitLogEntryDataRoot helper', HTML.includes('function fitLogEntryDataRoot'));
check('print calls fit before print', /fitLogEntryDataRoot\(doc\)[\s\S]{0,200}runSystemPrint/.test(HTML));
check('two equal table-cell copies', HTML.includes('display:table') && HTML.includes('table-layout:fixed') && HTML.includes('pr-led-copy') && HTML.includes('148.5mm'));
check('page builds two copies', /buildLogEntryDataPageHtml[\s\S]{0,200}\$\{copy\}\$\{copy\}/.test(HTML));
check('same zoom both copies', HTML.includes('One scale for both copies') || /inners\.forEach\(el=>\{ el\.style\.zoom = String\(scale\)/.test(HTML));
check('centre cut dashed border', /pr-led-copy:first-child[\s\S]{0,120}border-right:0\.45pt dashed/.test(HTML));
check('Reports print button', HTML.includes('id="btnPrintLogEntryDataRecord"'));
check('Reports sample button', HTML.includes('id="btnPreviewLogEntryDataSample"'));
check('includes cylinder rack/exhaust', HTML.includes('Main engine — cylinders'));
check('includes flowmeters & counters section', HTML.includes('Flowmeters &amp; counters'));
check('log entry form uses flowmeterRecordRows', /buildLogEntryDataHalfHtml[\s\S]{0,400}flowmeterRecordRows\('all'\)/.test(HTML));
check('log entry dual Inlet/Outlet headers', HTML.includes('<th>Meter / counter</th><th>Inlet</th><th>Outlet</th>'));
check('includes Rev. Counter on log entry form', HTML.includes("'Rev. Counter'"));
check('marked-only: has Date/Time + Distance', HTML.includes("ledField('Date / Time'") && HTML.includes("ledField('Distance ship (nm)')"));
check('no weather & sea section', !HTML.includes('Weather &amp; sea'));
check('E/R S/T S/W under operation', HTML.includes("ledMini('E/R °C')") && HTML.includes("ledMini('S/T °C')") && HTML.includes("ledMini('S/W °C')"));
check('ME LO temp and press separate', HTML.includes("ledMini('ME LO temp')") && HTML.includes("ledMini('ME LO press')") && !HTML.includes("ME LO T/P"));
check('bilge and sludge ROB present', HTML.includes("ledMini('Bilge ROB m³')") && HTML.includes("ledMini('Sludge ROB m³')"));
check('grouped by machinery categories', HTML.includes('Main engine — cylinders') && HTML.includes('Auxiliaries — hrs / load') && HTML.includes('Tanks — ROB'));
check('marked-only: no fuel grade section', !HTML.includes('M/E run &amp; fuel grade'));
check('marked-only: no Condition / Time zone / Clock', !/ledField\('Condition B\/L'\)/.test(HTML) && !/ledField\('Time zone'\)/.test(HTML));
check('marked-only: no ECA fields', !HTML.includes("ledMini('ECA grade')"));
check('keeps FW ROB + remarks', HTML.includes("ledField('FW ROB m³')") && HTML.includes('pr-led-remarks-box'));
check('no subtitle under title', !HTML.includes('pr-led-sub') || !/LOG ENTRY DATA RECORD[\s\S]{0,200}pr-led-sub/.test(HTML));
check('no handoff subtitle text', !HTML.includes('Blank form — watchkeeper fills by hand → Chief Engineer'));
check('footer vessel — company — ts0gs', HTML.includes('— ts0gs') && /vessel[\s\S]{0,80}company[\s\S]{0,40}ts0gs/.test(HTML));
check('fuel temp aligned with pump mark', /ledMini\('Fuel temp'\)[\s\S]{0,40}ledMini\('Pump mark'\)/.test(HTML));
check('FW ROB below bilge/sludge', /Bilge ROB[\s\S]{0,120}Sludge ROB[\s\S]{0,160}FW ROB/.test(HTML));
check('remarks section present full-width', HTML.includes('pr-led-remarks') && HTML.includes('pr-led-remarks-box') && /pr-led-two[\s\S]{0,2000}pr-led-remarks/.test(HTML));
check('maximized layout body flex', HTML.includes('pr-led-body') && HTML.includes('flex:1 1 auto'));
check('wired print click', HTML.includes('printLogEntryDataRecord()'));
check('wired sample click', HTML.includes('previewLogEntryDataSample()'));

console.log('');
if (failures) {
  console.log(`FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
