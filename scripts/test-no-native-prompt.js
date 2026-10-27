/*
 * window.prompt() is not available everywhere this program runs.
 *
 * Electron does not implement it: the call THROWS "prompt() is not supported."
 * rather than returning null. Every one of these call sites sits in an async
 * click handler, so the throw became a rejected promise nobody was listening
 * for -- the button did nothing at all, with nothing on screen and nothing in
 * the status line. "Compile IMO DCS / EU MRV year…" was reported that way from
 * a ship: clicked, and nothing happened. The Android WebView has no prompt of
 * its own either.
 *
 * The same holds for handing over a file. A blob anchor click is a no-op in
 * both the Android WebView and Electron while still looking to the page like
 * it worked, which is why the JSON backups go through ChengSaveFile. The CSV
 * exports did not, so the DCS compilation a verifier asked for was assembled
 * correctly and then dropped on the floor.
 *
 * This file guards the source-level invariants. Whether the replacement dialog
 * actually paints is measured in tests/browser_ask_text_e2e.js -- it cannot be
 * settled by reading the text, and a first attempt at this fix placed the
 * dialog inside a display:none page where it opened at 0x0.
 *
 * Run: node scripts/test-no-native-prompt.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'modules', 'voyage', 'www', 'voyage_manager.html');
const HTML = fs.readFileSync(FILE, 'utf8');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

/* Strip comments so the explanation above a fix is not mistaken for the fix. */
const code = HTML
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '');

console.log('\nno call reaches the native prompt');
/* window.prompt inside askText's own fallback is deliberate and is spelled
   with the window. prefix; a bare prompt( is the pattern that breaks. */
const bare = code.match(/(^|[^.\w])prompt\s*\(/g) || [];
check('no bare prompt( remains in the program', bare.length, 0);
check('askText is defined', /function\s+askText\s*\(/.test(code), true);
check('askText has a prompt fallback for a document without the dialog',
  /window\.prompt\(/.test(code), true);

console.log('\nthe dialog the program asks with');
check('the overlay markup exists', /id="askTextOverlay"/.test(HTML), true);
for (const id of ['askTextTitle', 'askTextMessage', 'askTextLabel',
                  'askTextInput', 'askTextAccept', 'askTextCancel']) {
  check(`#${id} is in the markup`, HTML.includes(`id="${id}"`), true);
}
check('it reuses the program\'s own overlay styling',
  /id="askTextOverlay"[^>]*class="nv-leg-overlay"/.test(HTML), true);
check('it is marked up as a modal dialog',
  /id="askTextOverlay"[^>]*role="dialog"[^>]*aria-modal="true"/.test(HTML), true);

console.log('\nevery asking call site awaits it');
/* A missed await yields a Promise object, and String(Promise) is truthy --
   the year would parse as NaN and the vessel would be named [object Promise]. */
const sites = code.split('\n').filter(l => /[^.\w]askText\s*\(/.test(l)
  && !/function\s+askText/.test(l));
check('askText is called from the six places that used to prompt', sites.length, 6);
for (const m of code.split('\n')) {
  if (/[^.\w]askText\s*\(/.test(m) && !/await\s+askText\s*\(/.test(m)
      && !/function\s+askText/.test(m)) {
    check(`awaited: ${m.trim().slice(0, 48)}`, true, false);
  }
}
check('no askText call is left unawaited', true, true);

console.log('\nthe CSV exports hand the file over the way the backups do');
check('downloadCSV is async', /async\s+function\s+downloadCSV\s*\(/.test(code), true);
const dl = code.slice(code.indexOf('async function downloadCSV'));
check('downloadCSV goes through ChengSaveFile',
  /ChengSaveFile\.saveJson\(/.test(dl.slice(0, 700)), true);
check('and says text/csv rather than letting it default to JSON',
  /mime:\s*'text\/csv'/.test(dl.slice(0, 700)), true);
const callLines = code.split('\n').filter(l => /[^.\w]downloadCSV\s*\(/.test(l)
  && !/function\s+downloadCSV/.test(l));
check('all three CSV exports await it', callLines.length, 3);
for (const l of callLines) {
  check(`awaited: ${l.trim().slice(0, 44)}`, /await\s+downloadCSV\(/.test(l), true);
}

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
