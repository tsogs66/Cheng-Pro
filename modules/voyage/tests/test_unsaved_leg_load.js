#!/usr/bin/env node
/*
 * Loading a voyage leg from the library must warn when the current working
 * leg is not yet in voyageLegs, with Save / Load without saving / Cancel.
 * Run: node modules/voyage/tests/test_unsaved_leg_load.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', 'www');
const FILES = ['voyage_manager.html', 'index.html'];

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

for (const file of FILES) {
  const HTML = fs.readFileSync(path.join(WWW, file), 'utf8');
  console.log('\nUnsaved voyage-leg load warning — ' + file);
  check(file + ': unsaved-leg overlay markup exists',
    HTML.includes('id="unsavedLegOverlay"')
    && HTML.includes('id="unsavedLegSave"')
    && HTML.includes('id="unsavedLegDiscard"')
    && HTML.includes('id="unsavedLegCancel"')
    && HTML.includes('Save, then load')
    && HTML.includes('Load without saving'));
  check(file + ': load paths go through loadSelectedVoyageLeg',
    /btnLoadVoyageLeg[\s\S]{0,280}loadSelectedVoyageLeg\(vn, cond, \{ successAlert: true \}\)/.test(HTML)
    && /voyage-leg-load[\s\S]{0,400}loadSelectedVoyageLeg\(vn, cond, \{ goSummary: true \}\)/.test(HTML));
  check(file + ': warns when current identity is missing from voyageLegs',
    HTML.includes('function currentVoyageLegIsInLibrary')
    && HTML.includes('async function confirmUnsavedVoyageLegBeforeLoad')
    && /is not saved in the voyage library/.test(HTML));
  check(file + ': Save archives the working leg before load',
    HTML.includes('async function saveActiveVoyageLegFromLoadWarning')
    && /choice === 'save'[\s\S]{0,180}saveActiveVoyageLegFromLoadWarning/.test(HTML));
  check(file + ': Load without saving skips archive of the current vessel',
    /choice !== 'discard'/.test(HTML)
    && /persistCurrent: persistSource/.test(HTML)
    && /opts\.persistCurrent !== false/.test(HTML));
  check(file + ': activateVoyageLeg honours persistCurrent:false',
    /async function activateVoyageLeg\(vesselId, voyageNumber, condition, opts\)/.test(HTML));
}

if (failures) {
  console.log(`\n${failures}/${checks} failed`);
  process.exit(1);
}
console.log(`\n${checks} checks passed`);
