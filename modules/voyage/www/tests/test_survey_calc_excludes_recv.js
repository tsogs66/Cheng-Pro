#!/usr/bin/env node
/*
 * Bunker Survey Calculated must exclude this report's Received.
 * Otherwise Calculated jumps with Received and invites a second add that
 * raises every later Previous / ROB.
 * Run: node tests/test_survey_calc_excludes_recv.js
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

console.log('\nsource guards');
check('surveyCalculatedBook helper', HTML.includes('function surveyCalculatedBook'));
check('entryReceivedOrMirrorQty helper', HTML.includes('function entryReceivedOrMirrorQty'));
check('renderVsSurvey uses surveyCalculatedBook', /function renderVsSurvey\([\s\S]{0,400}surveyCalculatedBook/.test(HTML));
check('recordRobSurvey uses surveyCalculatedBook', /function recordRobSurvey\([\s\S]{0,500}surveyCalculatedBook/.test(HTML));
check('Apply Survey stamps Received before sync', /stampRobReceivedOnEntry\(entry\)[\s\S]{0,200}syncRobSurveyReceivedReceipts/.test(HTML));
check('status copy says Calculated is before Received', HTML.includes('Calculated is the book before today'));

console.log('');
if (failures) {
  console.log(`FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
