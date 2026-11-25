#!/usr/bin/env node
// Copies the canonical port list + sea-lane data and libs into the Voyage bundle (modules/voyage/www/sea-distance/, also the Sea Distance page) and the Tank bundle
// (modules/tanks/public/sea-distance/), so both ship inside the app bundles (Electron `modules/**`, Android www copy). Run after changing any source below.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const OUTS = [path.join(root, 'modules/voyage/www/sea-distance'), path.join(root, 'modules/tanks/public/sea-distance')];
const FILES = { 'scripts/port-list.js': 'port-list.js', 'scripts/sea-route.js': 'sea-route.js', 'scripts/eca-zones.js': 'eca-zones.js', 'scripts/sea-map.js': 'sea-map.js', 'data/map/land.json': 'land.json',
  'data/ports/ports.json': 'ports.json', 'data/sea-lanes/marnet.json': 'marnet.json' };
const check = process.argv.includes('--check');
let bad = 0;
for (const out of OUTS) {
  for (const [src, dst] of Object.entries(FILES)) {
    const a = fs.readFileSync(path.join(root, src)), p = path.join(out, dst);
    if (check) { if (!fs.existsSync(p) || !fs.readFileSync(p).equals(a)) { console.error('out of date: ' + path.relative(root, p)); bad++; } }
    else { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(p, a); console.log('copied ' + path.relative(root, p)); }
  }
}
if (bad) { console.error('run: node scripts/build-sea-distance.js'); process.exit(1); }
