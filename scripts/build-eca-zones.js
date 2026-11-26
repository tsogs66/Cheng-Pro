#!/usr/bin/env node
// Writes the official ECA outlines (from the IMO resolution texts in data/eca/source/) into the generated block of scripts/eca-zones.js.
// Usage: node scripts/build-eca-zones.js
'use strict';
const fs = require('fs'), path = require('path');
const { load } = require('./parse-eca.js');
const file = path.join(__dirname, 'eca-zones.js');
const { na, car, ne } = load();
const ring = rows => rows.map(r => [Math.round(r.lon * 1e4) / 1e4, Math.round(r.lat * 1e4) / 1e4]);
// Inland closing points ([lon, lat]) that join the end of each coastal list back to its start over land (the lists enclose the sea only up to the coast).
const CLOSE = {
  pacific: [[-152, 62.5], [-141, 63], [-128, 56], [-121, 49.5], [-120, 45], [-116, 35], [-114.5, 32.55]],
  // between table points 30 and 31 of the North-East Atlantic list the official line runs over land; follow the coasts of France, Spain and Portugal on the inside instead
  ne: [[-1.5, 48.5], [3.0, 44.0], [-1.0, 40.0], [-3.0, 37.2], [-5.2, 36.4]],
  atlantic: [[-98.5, 26.3], [-98.5, 31], [-91, 33.5], [-84, 34], [-80, 38], [-77, 42], [-75.5, 44], [-74.2, 45.6], [-72, 47.2], [-69, 49.2], [-66.5, 52], [-65, 56]],
};
const neRows = ne.filter((r, i, a) => r.n <= 157 && a.findIndex(x => x.n === r.n) === i).sort((a, b) => a.n - b.n);
const gen = {
  north_america: [ring(na[0]).concat(CLOSE.pacific), ring(na[1]).concat(CLOSE.atlantic), ring(na[2])],
  us_caribbean: [ring(car[0])],
  north_east_atlantic: [ring(neRows.filter(r => r.n <= 30)).concat(CLOSE.ne, ring(neRows.filter(r => r.n >= 31)))],
};
const text = '  // BEGIN GENERATED (node scripts/build-eca-zones.js): official outlines from data/eca/source/\n'
  + '  const OFFICIAL = ' + JSON.stringify(gen) + ';\n  // END GENERATED';
let s = fs.readFileSync(file, 'utf8');
const a = s.indexOf('  // BEGIN GENERATED'), b = s.indexOf('  // END GENERATED');
if (a < 0 || b < 0) throw new Error('markers missing in eca-zones.js');
s = s.slice(0, a) + text + s.slice(b + '  // END GENERATED'.length);
fs.writeFileSync(file, s);
console.log('official ECA outlines written:', Object.entries(gen).map(([k, v]) => k + ' ' + v.reduce((n, r) => n + r.length, 0) + ' pts').join(', '));
