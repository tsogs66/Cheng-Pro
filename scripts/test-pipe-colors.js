/**
 * Distillate and lube use one pipe palette on the dashboard, the tank
 * drawings and the voyage ROB gauges.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  'apps/web/js/tank-graphics.js',
  'modules/tanks/public/js/tank-graphics.js',
  'apps/web/js/home-dashboard.js',
  'modules/voyage/www/voyage_manager.html',
  'modules/voyage/www/index.html',
].map((rel) => fs.readFileSync(path.join(root, rel), 'utf8'));

const shared = ['#E07A7A', '#E8A8B8', '#F0C14A', '#6B3A1F', '#1F6FB2'];
const tankOnly = ['#E8926A'];
let failed = 0;
files.forEach((text, i) => {
  shared.forEach((hex) => {
    if (!text.includes(hex)) {
      console.log('FAIL missing ' + hex + ' in file ' + i);
      failed += 1;
    }
  });
  if (i < 3) {
    tankOnly.forEach((hex) => {
      if (!text.includes(hex)) {
        console.log('FAIL missing ' + hex + ' in file ' + i);
        failed += 1;
      }
    });
  }
  if (text.includes('#E6A817') || text.includes('#E8771A') || text.includes('#C8960A') || text.includes('#eab331') || text.includes('#ea8633')) {
    console.log('FAIL old distillate/lube hex still present in file ' + i);
    failed += 1;
  }
});

const dash = files[2];
if (!dash.includes("return '#E07A7A'") || !dash.includes("return '#F0C14A'") || !dash.includes("return '#E8A8B8'")) {
  console.log('FAIL dashboard gaugeColor is not on the pipe palette');
  failed += 1;
}
if (files[3] !== files[4]) {
  console.log('FAIL voyage HTML copies differ');
  failed += 1;
}
if (failed) {
  console.log(failed + ' pipe-color checks failed');
  process.exit(1);
}
console.log('pipe colors ok');
