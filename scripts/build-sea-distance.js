#!/usr/bin/env node
// Copies the canonical port list + sea-lane data and libs into modules/voyage/www/sea-distance/ so the page
// ships inside the Voyage bundle (Electron `modules/**`, Android www copy). Run after changing any source below.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'modules/voyage/www/sea-distance');
const FILES = { 'scripts/port-list.js': 'port-list.js', 'scripts/sea-route.js': 'sea-route.js',
  'data/ports/ports.json': 'ports.json', 'data/sea-lanes/marnet.json': 'marnet.json' };
const check = process.argv.includes('--check');
let bad = 0;
for (const [src, dst] of Object.entries(FILES)) {
  const a = fs.readFileSync(path.join(root, src)), p = path.join(out, dst);
  if (check) { if (!fs.existsSync(p) || !fs.readFileSync(p).equals(a)) { console.error('out of date: ' + dst); bad++; } }
  else { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(p, a); console.log('copied ' + dst); }
}
if (bad) { console.error('run: node scripts/build-sea-distance.js'); process.exit(1); }
