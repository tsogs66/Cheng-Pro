'use strict';
/* The Back button steps through the pages visited, and full screen is an opt-in switch in More. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'apps/web/js/shell.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
const java = fs.readFileSync(path.join(root, 'scripts/apply-android-print-bridge.js'), 'utf8');

assert.match(shell, /history\.pushState\(\{ aioModule: module \}/, 'each page opened is a history entry');
assert.match(shell, /addEventListener\('popstate'/, 'Back is handled');
assert.match(shell, /navigate\(st\.aioModule, \{ fromHistory: true \}\)/, 'Back returns to the page before');
assert.match(shell, /Press Back again to exit/, 'the first page asks before exiting');
assert.match(shell, /if \(!\(opts && opts\.fromHistory\)\) recordPage\(next\)/, 'going back does not add another entry');
assert.match(shell, /chengAioFullscreen/, 'full screen is remembered');
assert.match(shell, /localStorage\.getItem\(FS_KEY\) === '1'/, 'full screen is off until switched on');
assert.match(html, /id="bnMoreFullscreen"[^>]*hidden/, 'the switch is in More and hidden where it cannot work');
assert.match(java, /addJavascriptInterface\(new FullscreenBridge\(\), "ChengAndroidFullscreen"\)/, 'the Android app offers the bridge');
assert.match(java, /onWindowFocusChanged/, 'the bars are hidden again after a dialog');
assert.match(java, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/, 'swiping from the edge brings the bars back');
console.log('back and full screen: ok');
