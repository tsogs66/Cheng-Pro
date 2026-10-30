/*
 * One Chief Engineer, one signature, one place to change them.
 *
 * The name was being entered in three places: Vessel Data, the Chief Engineer
 * box on the voyage tab, and again on the e-ORB setup page, which kept its own
 * `orb.chiefEng`. The ORB copy was seeded from Vessel Data ONLY WHEN BLANK, so
 * after a crew change the two drifted and the oil record book went on carrying
 * the name of an officer who had left the ship -- in a book an inspector reads.
 *
 * Vessel Data now owns the name: the ORB copy follows it, its box is read-only,
 * and inside ChEng AIO the voyage-tab box is read-only too because AIO Vessel
 * Setup owns the record there and pushes it in.
 *
 * Entries already written keep the officer who signed them. That is deliberate
 * and tested: rewriting a signed entry under the relieving Chief's name would
 * falsify the book.
 *
 * Run: node scripts/test-cheng-identity-source.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/voyage_manager.html'), 'utf8');
const EORB = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/eorb.js'), 'utf8');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

function extract(name) {
  let start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const asyncAt = HTML.lastIndexOf('async ', start);
  if (asyncAt >= 0 && asyncAt + 'async '.length === start) start = asyncAt;
  let i = HTML.indexOf('(', start);
  let paren = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '(') paren++;
    else if (HTML[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  i = HTML.indexOf('{', i);
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(start, i + 1);
}

/* ---- the ORB copy follows Vessel Data, it is not seeded from it once ---- */

function orbSetupWith(vesselChEng, storedOrb) {
  const sb = { console, Object, String, Array, state: { setup: { chEng: vesselChEng, orb: storedOrb } } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(EORB, sb);                     /* window.EORB */
  vm.runInContext(extract('ensureOrbSetup') + '\n' + extract('orbSetup'), sb);
  return sb.orbSetup();
}

check('an ORB book with no Chief yet takes the one on Vessel Data',
  orbSetupWith('A. Reyes', {}).chiefEng, 'A. Reyes');
/* The reported fault. */
check('and a crew change on Vessel Data reaches the book',
  orbSetupWith('B. Santos', { chiefEng: 'A. Reyes' }).chiefEng, 'B. Santos');
check('the stored name is kept only while Vessel Data names nobody',
  orbSetupWith('', { chiefEng: 'A. Reyes' }).chiefEng, 'A. Reyes');
check('and a book never opened does not throw',
  typeof orbSetupWith('A. Reyes', null).chiefEng, 'string');

/* ---- nothing writes the name back from the ORB page -------------------- */

const readForm = extract('readOrbSetupFromForm');
check('the read-only box is no longer read back into the book',
  /getElementById\('orb_ce'\)/.test(readForm), false);
check('the name is taken from Vessel Data instead',
  /setup\.chiefEng = state\.setup\.chEng \|\| setup\.chiefEng/.test(readForm), true);
check('the box itself is read-only',
  /<input id="orb_ce" readonly>/.test(HTML), true);
check('and says where to change it',
  /From Vessel Setup\. Change it there at a crew change/.test(HTML), true);
check('the signatory guidance no longer falls back to that box',
  /getElementById\('orb_ce'\)\?\.value\?\.trim\(\)/.test(HTML), false);

/* ---- inside AIO, the voyage-tab box is read-only too ------------------- */

const lock = extract('applyChengAioVesselHubLock');
check('the voyage-tab Chief Engineer box is locked when embedded',
  /chEngVoy\.readOnly = !!hub;/.test(lock), true);
check('and tells the engineer where the record lives',
  /From ChEng AIO Vessel Setup/.test(lock), true);
check('the note under it changes with the mode',
  /chEngVoyageNote/.test(lock) && /id="chEngVoyageNote"/.test(HTML), true);
check('standalone keeps it editable',
  /chEngVoy\.readOnly = !!hub;[\s\S]{0,400}'Update at crew change'/.test(lock), true);
check('the whole identity panel is still hidden when embedded',
  /html\.chengaio-embed #vesselIdentityPanel\{display:none !important;\}/.test(HTML), true);

/* ---- a signed entry is never re-signed -------------------------------- */

check('a printed entry prefers the officer stored on it',
  /const signer = \(entry && entry\.chEng\) \? entry\.chEng : currentChEngName\(\);/.test(HTML), true);
check('and its signature image is looked up under that name',
  /signatureForChEng\(entry\?\.chEng \|\| currentChEngName\(\)\)/.test(HTML), true);
check('embedded printouts take the live AIO Chief Engineer when no entry is stamped',
  /function currentChEngName\(/.test(HTML) && /function aioPrintIdentity\(/.test(HTML), true);
check('AIO signatures are found under the lower-cased name Vessel Setup files them under',
  /map\[key\] \|\| map\[key\.toLowerCase\(\)\]/.test(HTML), true);
check('the hub lock overlays AIO identity onto Voyage setup',
  /if \(hub\) applyChengAioIdentityOverlay\(\);/.test(lock), true);
check('the ORB second signature falls back to setup, not to a blank',
  /draftEntry\.chiefEngName = nameEl\?\.value\?\.trim\(\) \|\| setup\.chiefEng \|\| '';/.test(HTML), true);

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
