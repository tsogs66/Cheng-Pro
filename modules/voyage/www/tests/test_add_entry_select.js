#!/usr/bin/env node
/*
 * After Add Entry, the log-entry selector and Voyage Summary must land on the
 * watch that was just saved — not flip to a blank "New Entry" form.
 * Run: node tests/test_add_entry_select.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const marker = "document.getElementById('btnAdd').addEventListener('click', async ()=>{";
const start = HTML.indexOf(marker);
check('btnAdd click handler present', start >= 0);
const end = HTML.indexOf('function exitEditMode()', start);
check('exitEditMode follows btnAdd handler', end > start);
const body = HTML.slice(start, end);

check('post-save loads the saved entry into the form', body.includes('loadEntryIntoForm(entry.id)'));
check('does not exit edit mode before selecting the saved entry',
  !/exitEditMode\(\);\s*\n\s*render\(\);\s*\n[\s\S]*prefillFromLastEntry\(\);\s*\n\s*openVoyageSummary\(entry\.id\)/.test(body));
check('does not prefill a blank next entry after Add',
  !body.includes('prefillFromLastEntry();\n  openVoyageSummary(entry.id)'));

/* loadEntryIntoForm must open Voyage Summary for the selected id */
const loadStart = HTML.indexOf('function loadEntryIntoForm(id){');
const loadEnd = HTML.indexOf('/* ---------------- setup handlers ---------------- */', loadStart);
const loadBody = HTML.slice(loadStart, loadEnd);
check('loadEntryIntoForm selects the entry in the list', loadBody.includes('sel.value = id'));
check('loadEntryIntoForm opens Voyage Summary for that entry', loadBody.includes('openVoyageSummary(id)'));
check('loadEntryIntoForm sets editingId', /editingId\s*=\s*id/.test(loadBody));

console.log('');
if (failures) {
  console.log(`FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`PASSED — ${checks} checks`);
