#!/usr/bin/env node
// Converts data/world-port-index/world_port_index.csv -> data/ports/ports.json
// Usage: node scripts/build-port-list.js [in.csv] [out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const inFile = process.argv[2] || path.join(root, 'data/world-port-index/world_port_index.csv');
const outFile = process.argv[3] || path.join(root, 'data/ports/ports.json');

function parseLine(l) { // simple CSV with optional "quoted,fields"
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

const lines = fs.readFileSync(inFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const hdr = parseLine(lines[0]);
const need = ['INDEX_NO', 'PORT_NAME', 'COUNTRY', 'LATITUDE', 'LONGITUDE', 'HARBORSIZE', 'HARBORTYPE'];
for (const n of need) if (!hdr.includes(n)) throw new Error('missing column ' + n);
const ix = n => hdr.indexOf(n);
const ports = []; let skipped = 0;
for (const l of lines.slice(1)) {
  const f = parseLine(l);
  const lat = parseFloat(f[ix('LATITUDE')]), lon = parseFloat(f[ix('LONGITUDE')]);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) { skipped++; continue; }
  ports.push({
    id: +f[ix('INDEX_NO')],
    name: f[ix('PORT_NAME')].trim(),
    cc: f[ix('COUNTRY')].trim(),
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    size: f[ix('HARBORSIZE')].trim() || null,
    type: f[ix('HARBORTYPE')].trim() || null,
  });
}
ports.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({
  source: 'data/world-port-index/SOURCE.md (third-party WPI extract, NOT the official NGA file)',
  sizeCodes: { V: 'very small', S: 'small', M: 'medium', L: 'large' },
  count: ports.length, ports,
}) + '\n');
console.log(`wrote ${ports.length} ports (${skipped} skipped) -> ${outFile}`);
