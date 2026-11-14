#!/usr/bin/env node
'use strict';
/* A page that finishes loading after the engineer has opened another one must not put
   its error over the page now showing. Vessel Setup reads the fleet register over the
   network; leaving it before the answer used to throw "Cannot read properties of null
   (reading 'addEventListener')" over the new page. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'apps/web/js/shell.js'), 'utf8');
const vessel = fs.readFileSync(path.join(root, 'apps/web/js/modules/vessel.js'), 'utf8');

assert.ok(/catch \(e\) \{\s*\/\*[\s\S]*?\*\/\s*if \(current !== next\) return;\s*setFullscreenEmbed\(false\);/.test(shell),
  'navigate drops the error of a page that is no longer the current one');
const afterFleet = vessel.slice(vessel.indexOf("await renderFleet(root.querySelector('#fleetTable tbody'));"));
assert.ok(/^await renderFleet[^\n]*\n[\s\S]{0,400}?if \(!root\.querySelector\('#vesselForm'\)\) return;/.test(afterFleet),
  'Vessel Setup stops wiring itself when its page has gone');
assert.ok(afterFleet.indexOf("if (!root.querySelector('#vesselForm')) return;") < afterFleet.indexOf("root.querySelector('#saveVessel').addEventListener"),
  'the guard comes before the first button is wired');
console.log('late page ok');
