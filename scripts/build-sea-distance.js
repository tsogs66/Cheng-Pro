#!/usr/bin/env node
// Copies the canonical port list + sea-lane data and libs into the Voyage bundle (modules/voyage/www/sea-distance/, also the Sea Distance page) and the Tank bundle
// (modules/tanks/public/sea-distance/), so both ship inside the app bundles (Electron `modules/**`, Android www copy). Run after changing any source below.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const OUTS = [path.join(root, 'modules/voyage/www/sea-distance'), path.join(root, 'modules/tanks/public/sea-distance')];
const FILES = { 'scripts/port-list.js': 'port-list.js', 'scripts/sea-route.js': 'sea-route.js', 'scripts/eca-zones.js': 'eca-zones.js', 'scripts/sea-map.js': 'sea-map.js', 'scripts/route-exchange.js': 'route-exchange.js', 'data/map/land.json': 'land.json', 'data/map/detail-land.json': 'detail-land.json', 'data/map/detail-water.json': 'detail-water.json', 'data/map/detail-places.json': 'detail-places.json',
  'data/ports/ports.json': 'ports.json', 'data/sea-lanes/marnet.json': 'marnet.json', 'data/sea-lanes/source/EUROSTAT_SEAROUTE_LICENSE_EUPL-1.2.txt': 'LICENSE-EUPL-1.2.txt' };
// DATA-SOURCES.md: the provenance notes of the data files, one text for every bundle (so the standalone Tank and Voyage repos carry the attribution and licence statements).
const DOCS = ['data/world-port-index/SOURCE.md', 'data/sea-lanes/SOURCE.md', 'data/map/SOURCE.md', 'data/eca/SOURCE.md'];
const dataSources = () => Buffer.from('# Data sources for the sea-distance files in this folder\n\nThese are the provenance notes kept in Cheng-Pro (`data/*/SOURCE.md`). Port data: NGA World Port Index (U.S. Government work, public domain; attribution and disclaimer below). Sea lanes: Eurostat SeaRoute network, EUPL-1.2 (`LICENSE-EUPL-1.2.txt` is in this folder). Coastline: Natural Earth (public domain). ECA outlines: IMO resolutions and the Chinese Ministry of Transport scheme.\n\n'
  + DOCS.map(d => '---\n\n' + fs.readFileSync(path.join(root, d), 'utf8').trim() + '\n').join('\n'));
const check = process.argv.includes('--check');
let bad = 0;
for (const out of OUTS) {
  for (const [src, dst] of Object.entries(FILES).concat([[null, 'DATA-SOURCES.md']])) {
    const a = src ? fs.readFileSync(path.join(root, src)) : dataSources(), p = path.join(out, dst);
    if (check) { if (!fs.existsSync(p) || !fs.readFileSync(p).equals(a)) { console.error('out of date: ' + path.relative(root, p)); bad++; } }
    else { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(p, a); console.log('copied ' + path.relative(root, p)); }
  }
}
if (bad) { console.error('run: node scripts/build-sea-distance.js'); process.exit(1); }
