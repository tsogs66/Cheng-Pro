/* A NOON report is at 12:00 ship's time: on a new entry the clock goes to 12:00 when a NOON operation is
   chosen, comes from the entry before, or the date is moved while one is chosen. An edited entry keeps its time. */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'modules', 'voyage', 'www', 'voyage_manager.html'), 'utf8');
assert(/function applyNoonClock\(\)\{\s*if \(editingId\) return false;/.test(html), 'an entry being edited is never moved');
assert(/\\bNOON\\b/.test(html), 'only NOON operations');
assert(/dt\.value = dt\.value\.slice\(0, 10\) \+ 'T12:00'/.test(html), 'the clock goes to 12:00');
assert(/setOperationSelectValue\(document\.getElementById\('in_operation'\), last\.operation\);\s*applyNoonClock\(\);/.test(html), 'the operation taken from the entry before also gets 12:00');
assert(/if \(evt === 'input'\) applyNoonClock\(\);/.test(html), 'moving the date keeps a NOON on 12:00');
console.log('noon clock ok');
