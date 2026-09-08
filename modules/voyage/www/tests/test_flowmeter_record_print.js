#!/usr/bin/env node
/*
 * Flowmeter Card + Log Entry Data Card handouts.
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

console.log('\nFlowmeter Card printout');
check('flowmeterRecordRows helper', HTML.includes('function flowmeterRecordRows'));
check('flowmeterRecordArrangement helper', HTML.includes('function flowmeterRecordArrangement'));
check('buildFlowmeterRecordPageHtml helper', HTML.includes('function buildFlowmeterRecordPageHtml'));
check('printFlowmeterRecord helper', HTML.includes('function printFlowmeterRecord'));
check('flowmeter print is synchronous with click', /function printFlowmeterRecord\([\s\S]*?runSystemPrint\(win,\s*cleanup\)[\s\S]*?catch/.test(HTML));
check('flowmeter print has no fonts.ready defer', !/function printFlowmeterRecord\([^)]*\)\{[^}]*fonts\.ready/.test(HTML) && /function printFlowmeterRecord[\s\S]{0,1500}?runSystemPrint\(win,\s*cleanup\)/.test(HTML));
check('preview sample helper', HTML.includes('function previewFlowmeterRecordSample'));
check('8-up grid CSS', HTML.includes('grid-template-rows:repeat(4, minmax(0, 1fr))') && HTML.includes('grid-template-columns:1fr 1fr'));
check('flowmeter equal slip inset for cut align', /pr-fm-page\{[\s\S]{0,280}padding:4mm/.test(HTML) && /pr-fm-slip\{[\s\S]{0,280}padding:2\.6mm 2\.8mm/.test(HTML));
check('flowmeter all-meters dense single-page', HTML.includes('pr-fm-dense') && /mode !== 'fuel' \? ' pr-fm-dense'/.test(HTML) && /max-height:297mm/.test(HTML) && /grid-template-rows:repeat\(4, minmax\(0, 1fr\)\)/.test(HTML));
check('flowmeter slips stretch to maximize meter height', /pr-fm-slip-inner\{[\s\S]{0,220}flex-direction:column/.test(HTML) && /pr-fm-table\{[\s\S]{0,180}flex:1 1 auto/.test(HTML) && /pr-fm-foot\{[\s\S]{0,120}margin-top:auto/.test(HTML));
check('flowmeter all-meters keeps equal page/slip padding', /\.pr-fm-dense\{[\s\S]{0,80}padding:4mm/.test(HTML) && /\.pr-fm-dense \.pr-fm-slip\{ padding:2\.6mm 2\.8mm/.test(HTML));
check('flowmeter all-meters reading cells grow with space', /\.pr-fm-dense \.pr-fm-reading\{ min-height:5\.2mm; height:auto/.test(HTML));
check('flowmeter print title is CARD', HTML.includes('FLOWMETER CARD') && HTML.includes('<h2>Flowmeter Card</h2>'));
check('flowmeter title no longer says RECORD', !HTML.includes('FLOWMETER RECORD') && !HTML.includes('<title>Flowmeter Record</title>') && !HTML.includes('<h2>Flowmeter Record</h2>'));
check('flowmeter print jobs have distinct titles', HTML.includes('Flowmeter Card — All Meters') && HTML.includes('Flowmeter Card — Fuel Only'));
check('print prefers same-window bridge before postMessage', /Prefer a same-window native\/AIO bridge/.test(HTML));
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
check('all-meters subtitle vessel - at sea / maneuvering', /subtitle[\s\S]{0,200}at sea \/ maneuvering/.test(HTML) || /at sea \/ maneuvering/.test(HTML));
check('fuel-only subtitle vessel - at port / anchorage', /at port \/ anchorage/.test(HTML));
check('flowmeter mode picks sea vs port subtitle', /mode === 'fuel'[\s\S]{0,120}at port \/ anchorage[\s\S]{0,80}at sea \/ maneuvering/.test(HTML));
check('flowmeter footer matches LED vessel — company — ts0gs', /pr-fm-foot\}?\$\{vessel\} — \$\{company\} — ts0gs/.test(HTML) || /pr-fm-foot">\$\{vessel\} — \$\{company\} — ts0gs/.test(HTML));
check('hint updates with flowArr change', HTML.includes('updateFlowmeterRecordArrHint'));

console.log('\nLog Entry Data card (A4 landscape ÷2)');
check('buildLogEntryDataHalfHtml helper', HTML.includes('function buildLogEntryDataHalfHtml'));
check('buildLogEntryDataPageHtml helper', HTML.includes('function buildLogEntryDataPageHtml'));
check('printLogEntryDataRecord helper', HTML.includes('function printLogEntryDataRecord'));
check('preview log entry sample', HTML.includes('function previewLogEntryDataSample'));
check('landscape A4 page size', HTML.includes('size: A4 landscape') && HTML.includes('.pr-led-page'));
check('log entry print title is CARD', HTML.includes('LOG ENTRY DATA CARD') && HTML.includes('<title>Log Entry Data Card</title>') && HTML.includes('<h2>Log Entry Data Card</h2>'));
check('log entry title no longer says RECORD', !HTML.includes('LOG ENTRY DATA RECORD') && !HTML.includes('<title>Log Entry Data Record</title>') && !HTML.includes('<h2>Log Entry Data Record</h2>'));
check('single-page overflow lock', /max-height:210mm[\s\S]{0,80}overflow:hidden/.test(HTML) && HTML.includes('page-break-inside:avoid'));
check('fitLogEntryDataRoot helper', HTML.includes('function fitLogEntryDataRoot'));
check('print calls fit before print', /fitLogEntryDataRoot\(doc\)[\s\S]{0,200}runSystemPrint/.test(HTML));
check('LED print is synchronous with click', /function printLogEntryDataRecord\(\)\{[\s\S]*?runSystemPrint\(win,\s*cleanup\)[\s\S]*?catch/.test(HTML));
check('LED print has no fonts.ready defer', /function printLogEntryDataRecord\(\)\{[\s\S]{0,1500}?runSystemPrint\(win,\s*cleanup\)/.test(HTML) && !/function printLogEntryDataRecord\(\)\{[\s\S]{0,1500}?fonts\.ready/.test(HTML));
check('two equal table-cell copies', HTML.includes('display:table') && HTML.includes('table-layout:fixed') && HTML.includes('pr-led-copy') && HTML.includes('148.5mm'));
check('page builds two copies', /buildLogEntryDataPageHtml[\s\S]{0,200}\$\{copy\}\$\{copy\}/.test(HTML));
check('same scale both copies', /function applyScale|const applyScale/.test(HTML) && /inners\.forEach\(el=>\{/.test(HTML) && /el\.style\.zoom = String\(scale\)/.test(HTML));
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
check('wind/sea above S/W temps', /ledMini\('Wind Dir'\)[\s\S]{0,120}ledMini\('Wind state'\)[\s\S]{0,120}ledMini\('Sea state'\)[\s\S]{0,160}ledMini\('E\/R °C'\)[\s\S]{0,80}ledMini\('S\/W °C'\)/.test(HTML));
check('ME LO temp and press separate', HTML.includes("ledMini('ME LO temp')") && HTML.includes("ledMini('ME LO press')") && !HTML.includes("ME LO T/P"));
check('bilge and sludge ROB present', HTML.includes("ledMini('Bilge ROB m³')") && HTML.includes("ledMini('Sludge ROB m³')"));
check('grouped by machinery categories', HTML.includes('Main engine — cylinders') && HTML.includes('Auxiliaries — hrs / load') && HTML.includes('Tanks — ROB'));
check('marked-only: no fuel grade section', !HTML.includes('M/E run &amp; fuel grade'));
check('marked-only: no Condition / Time zone / Clock', !/ledField\('Condition B\/L'\)/.test(HTML) && !/ledField\('Time zone'\)/.test(HTML));
check('marked-only: no ECA fields', !HTML.includes("ledMini('ECA grade')"));
check('keeps FW ROB + remarks', HTML.includes("ledField('FW ROB m³')") && HTML.includes('pr-led-remarks-box'));
check('subtitle Voyage Chief - vessel', /pr-led-sub">Voyage Chief - \$\{vessel\}/.test(HTML) && HTML.includes('.pr-led-sub'));
check('no handoff subtitle text', !HTML.includes('Blank form — watchkeeper fills by hand → Chief Engineer'));
check('footer vessel — company — ts0gs', HTML.includes('— ts0gs') && /vessel[\s\S]{0,80}company[\s\S]{0,40}ts0gs/.test(HTML));
check('fuel temp aligned with pump mark', /ledMini\('Fuel temp'\)[\s\S]{0,40}ledMini\('Pump mark'\)/.test(HTML));
check('FW ROB below bilge/sludge', /Bilge ROB[\s\S]{0,120}Sludge ROB[\s\S]{0,160}FW ROB/.test(HTML));
check('remarks section present full-width', HTML.includes('pr-led-remarks') && HTML.includes('pr-led-remarks-box') && /pr-led-two[\s\S]{0,2000}pr-led-remarks/.test(HTML));
check('remarks compact fixed height', /pr-led-remarks-box\{[\s\S]{0,160}height:13\.6mm/.test(HTML) && /pr-led-remarks\{[\s\S]{0,200}flex:0 0 auto/.test(HTML));
check('remarks height is 4x prior strip', /height:13\.6mm/.test(HTML) && /pr-led-dense[\s\S]{0,80}height:12mm/.test(HTML));
check('footer clears remarks with margin', /pr-led-foot\{[\s\S]{0,120}margin-top:1\.6mm/.test(HTML) && !/pr-led-remarks\{[\s\S]{0,120}max-height:4\.8mm/.test(HTML));
check('data fields use --led-row variable', HTML.includes('--led-row') && /height:var\(--led-row/.test(HTML) && /min-height:var\(--led-row/.test(HTML));
check('fit packs rows then shrink-to-fit', /Pack write-in rows around the tall remarks|packs --led-row first/.test(HTML) && /without clipping/.test(HTML));
check('fit forces layout before measure', /void doc\.body\.offsetHeight/.test(HTML) && /void page\.offsetHeight/.test(HTML));
check('fit prefers zoom on desktop, transform on Android', /zoom shrinks layout height/.test(HTML) && /androidPrint[\s\S]{0,200}scale\(/.test(HTML) && /el\.style\.zoom = String\(scale\)/.test(HTML));
check('print document re-fits on load for Android', /Android print WebView re-fits/.test(HTML) && /fitLogEntryDataRoot\.toString\(\)/.test(HTML));
check('print forces iframe layout before fit', /void iframe\.offsetHeight[\s\S]{0,80}fitLogEntryDataRoot\(doc\)/.test(HTML));
check('LED includes ME LO and tanks ROB fields', /ledMini\('ME LO temp'\)/.test(HTML) && /ledMini\('Bilge ROB/.test(HTML) && /ledField\('FW ROB/.test(HTML));
check('preview sample opens without noopener flag', /function previewLogEntryDataSample\(\)\{[\s\S]{0,250}window\.open\('',\s*'_blank',\s*'width=1280,height=900'\)/.test(HTML));
check('remarks outside body above footer', /<\/div>\s*<div class="pr-led-remarks">[\s\S]{0,200}pr-led-foot/.test(HTML));
check('maximized layout packed body', /pr-led-body\{[\s\S]{0,80}flex:0 0 auto/.test(HTML));
check('edge inset avoids left/top clip', /padding:4\.5mm 4\.2mm 4\.2mm/.test(HTML));
check('LED halves equal pad for cut align', /Equal L\/R\/T\/B so both cut halves match/.test(HTML) && /padding:4\.5mm 4\.2mm 4\.2mm !important/.test(HTML) && !/padding-left:4\.8mm !important/.test(HTML) && !/padding-right:4\.8mm !important/.test(HTML));
check('wired print click', HTML.includes('printLogEntryDataRecord()'));
check('wired sample click', HTML.includes('previewLogEntryDataSample()'));

console.log('');
if (failures) {
  console.log(`FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
