/*
 * Bunker survey correction parsing (+/− only or measured).
 * Run: node tests/test_survey_correction_input.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');

function extract(name) {
  const start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0;
  let i = HTML.indexOf('{', start);
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(start, i + 1);
}

const sandbox = {
  console,
  fmtRob: (n) => String(Number(n).toFixed(3)),
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extract('parseSurveySignedNumber'),
    extract('formatSurveyCorrectionInput'),
    extract('formatSurveyCorrectionParen'),
  ].join('\n'),
  sandbox
);

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected || (typeof expected === 'number' && Math.abs(actual - expected) < 1e-9);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${expected}, got ${actual}`);
  if (!ok) failures++;
}

console.log('\nparseSurveySignedNumber');
check('+4.062', sandbox.parseSurveySignedNumber('+4.062'), 4.062);
check('−4.062 unicode', sandbox.parseSurveySignedNumber('−4.062'), -4.062);
check('-4.062', sandbox.parseSurveySignedNumber('-4.062'), -4.062);
check('4.062 no sign', sandbox.parseSurveySignedNumber('4.062'), 4.062);
check('empty', sandbox.parseSurveySignedNumber(''), null);

console.log('\nformatSurveyCorrectionParen');
check('negative paren', sandbox.formatSurveyCorrectionParen(-4.062, 'fuel'), ' (−4.062)');
check('positive paren', sandbox.formatSurveyCorrectionParen(2, 'fuel'), ' (+2.000)');

console.log('\nformatSurveyCorrectionInput');
check('neg input', sandbox.formatSurveyCorrectionInput(-4.062), '-4.062');
check('pos input', sandbox.formatSurveyCorrectionInput(2), '+2');

console.log(failures ? `\nFAILED — ${failures}` : '\nPASSED');
process.exit(failures ? 1 : 0);
