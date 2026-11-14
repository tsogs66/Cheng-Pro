/**
 * Uploaded files open in the in-app viewer with zoom, and the sounding card never pre-marks
 * Ullage or Depth.
 *
 * The user picks the method for each actual reading; a ticked box on the card (even on the
 * sample) reads as a recommendation.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass += 1; };

const index = read('modules/tanks/public/index.html');
ok(/<script src="js\/file-viewer\.js[^"]*"><\/script>/.test(index), 'the page loads the viewer');
ok(read('modules/tanks/public/sw.js').includes("'/js/file-viewer.js'"), 'the service worker caches the viewer');
const viewer = read('modules/tanks/public/js/file-viewer.js');
ok(/pinch/.test(viewer) && /wheel/.test(viewer) && /lastTap/.test(viewer), 'pinch, wheel and double-tap zoom');
ok(/min-height:44px/.test(viewer), 'finger-sized controls');
const bunk = read('modules/tanks/public/js/bunkering-report.js');
ok(/data-viewer data-viewer-title="BDN photo"/.test(bunk), 'the BDN photo opens full screen');
ok(/ChengFileViewer\.open\(\{ src: photo\.dataUrl/.test(bunk), 'a BDN PDF opens in the viewer');
const app = read('modules/tanks/public/js/app.js');
ok(/alt="Chief Engineer signature" data-viewer/.test(app), 'the signature preview opens full screen');
ok(/alt="Vessel logo" data-viewer/.test(app), 'the logo preview opens full screen');
const tsc = read('modules/tanks/public/js/tank-sounding-card.js');
ok(!/const (ullage|depth)Chk = [^'\n]*pr-tsc-checked/.test(tsc), 'Ullage / Depth are never ticked');
ok(/const ullageChk = '';/.test(tsc) && /const depthChk = '';/.test(tsc), 'both boxes are always empty, blank card and sample');
const shell = read('apps/web/index.html');
ok(/<script src="\/js\/file-viewer\.js"><\/script>/.test(shell), 'the AIO shell loads the viewer');
const vessel = read('apps/web/js/modules/vessel.js');
ok(/alt="Chief Engineer signature" data-viewer/.test(vessel) && /alt="Vessel stamp" data-viewer/.test(vessel), 'shell signature / stamp previews open full screen');
for (const f of ['modules/voyage/www/voyage_manager.html', 'modules/voyage/www/index.html']) {
  const h = read(f);
  ok(!/window\.open\(/.test(h), f + ': no preview opens a new tab');
  ok(/ChengFileViewer\.openHtml\(/.test(h), f + ': previews use the viewer');
  const popup = h.slice(h.indexOf('id="fmQuickOverlay"'), h.indexOf('fm-quick-actions', h.indexOf('id="fmQuickOverlay"')));
  ok(!/<select/i.test(popup), f + ': flowmeter popup has no list boxes');
}
for (const f of ['modules/voyage/www/file-viewer.js', 'modules/tanks/public/js/file-viewer.js', 'apps/web/js/file-viewer.js']) {
  ok(read(f) === read('modules/tanks/public/js/file-viewer.js'), f + ' is the same viewer');
}
console.log(`file viewer / sounding card: ${pass} checks passed`);
