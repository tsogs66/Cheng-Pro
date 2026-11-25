#!/usr/bin/env node
// Converts the official NGA World Port Index shapefile attributes (data/world-port-index/official/WPI.dbf)
// -> data/ports/ports.json (a slim list for the offline From/To pickers).
// Usage: node scripts/build-port-list.js [in.dbf] [out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const readDbf = require('./dbf-read.js');
const root = path.join(__dirname, '..');
const inFile = process.argv[2] || path.join(root, 'data/world-port-index/official/WPI.dbf');
const outFile = process.argv[3] || path.join(root, 'data/ports/ports.json');

const { fields, rows } = readDbf(inFile);
const names = fields.map(f => f.name);
for (const n of ['INDEX_NO', 'PORT_NAME', 'COUNTRY', 'LATITUDE', 'LONGITUDE', 'HARBORSIZE', 'HARBORTYPE', 'FUEL_OIL', 'DIESEL']) {
  if (!names.includes(n)) throw new Error('missing column ' + n);
}
const yn = v => (v === 'Y' || v === 'N' ? v : null); // WPI: Y = supplied, N = not supplied, blank = not stated
const ports = []; let skipped = 0;
for (const r of rows) {
  const lat = parseFloat(r.LATITUDE), lon = parseFloat(r.LONGITUDE);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) { skipped++; continue; }
  ports.push({
    id: Math.round(parseFloat(r.INDEX_NO)),
    name: r.PORT_NAME,
    cc: r.COUNTRY,
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    size: r.HARBORSIZE || null,
    type: r.HARBORTYPE || null,
    fo: yn(r.FUEL_OIL),
    do: yn(r.DIESEL),
  });
}
ports.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({
  source: 'NGA World Port Index (Pub. 150), shapefile package dated 2017-03-28; see data/world-port-index/SOURCE.md. Licence statement still to be recorded.',
  sizeCodes: { V: 'very small', S: 'small', M: 'medium', L: 'large' },
  supply: 'fo / do = fuel oil / diesel supplied at the port: Y yes, N no, null not stated',
  count: ports.length, ports,
}) + '\n');
console.log(`wrote ${ports.length} ports (${skipped} skipped) -> ${outFile}`);
