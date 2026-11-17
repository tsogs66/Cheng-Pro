/* The Android manifest must declare the configuration changes a keyboard cover/pen fires, and the shell
   must come back to the page that was open after a restart. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const prep = fs.readFileSync(path.join(__dirname, 'android-release-prep.js'), 'utf8');
['navigation', 'touchscreen', 'density', 'fontScale', 'layoutDirection', 'colorMode'].forEach((f) =>
  assert(prep.includes("'" + f + "'"), 'configChanges must include ' + f));
const shell = fs.readFileSync(path.join(__dirname, '../apps/web/js/shell.js'), 'utf8');
assert(/resumeAtStart\s*=\s*JSON\.parse/.test(shell), 'resume is read once at script start');
assert(/navigate\(back \|\| 'home'\)/.test(shell), 'boot opens the page that was open');
console.log('restart resume ok');
/* A slow earlier navigation must not paint over the page opened after it, and the hidden Voyage bridge frame
   must never be placed into the page that is showing. */
assert(/if \(current !== next\) return;\s*\n\s*const draw = pageHost\(\);/.test(shell), 'stale navigation stops before drawing');
const bk = fs.readFileSync(path.join(__dirname, '../apps/web/js/modules/backup.js'), 'utf8');
assert(/aio-voyage-bridge-holder/.test(bk) && !/else if \(host\) host\.appendChild\(voyageFrame\)/.test(bk), 'bridge frame has its own holder');
console.log('stale page + bridge frame ok');
