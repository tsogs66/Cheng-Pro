#!/usr/bin/env node
// Builds the marine layers of the route map: IHO sea areas, EEZ boundary lines, and lights (lighthouses, major lights).
//   data/map/detail-marine.json  = { areas:[{n, r:[rings]}], eez:[{t, f}] }   (Marine Regions, CC BY 4.0)
//   data/map/detail-lights.json  = { lights:[[lon, lat, name, text, kind]] }   (OpenStreetMap / OpenSeaMap, ODbL)
// The raw downloads are not kept in git: this script fetches them (curl) into data/map/source/{mr,osm}/ when missing.
// Usage: node scripts/build-detail-marine.js
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), MR = path.join(root, 'data/map/source/mr'), OSM = path.join(root, 'data/map/source/osm');
fs.mkdirSync(MR, { recursive: true }); fs.mkdirSync(OSM, { recursive: true });
const Q = 100;
const curl = (args) => execFileSync('curl', ['-sS', '-L', '--fail', '-m', '280'].concat(args), { stdio: 'inherit' });
const have = (f) => fs.existsSync(f) && fs.statSync(f).size > 1000;
// ---- IHO sea areas (Marine Regions IHO Sea Areas v3, simplified GeoJSON of the oceans-seas.geojson package, CC BY 4.0) ----
const iho = path.join(MR, 'iho-simplified.json');
if (!have(iho)) { console.log('downloading IHO sea areas'); curl(['-o', iho, 'https://unpkg.com/oceans-seas.geojson@0.5.0/oceans-seas.geo.json']); }
// ---- EEZ boundary lines (Marine Regions WFS, paged) ----
const W = 'https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json&typeName=MarineRegions:eez_boundaries&sortBy=line_id';
const eezPages = [];
for (let s = 0; ; s += 100) {
  const f = path.join(MR, 'eezb_' + s + '.json');
  if (!have(f)) { console.log('downloading EEZ lines ' + s); curl(['-o', f, W + '&maxFeatures=100&startIndex=' + s]); }
  const n = JSON.parse(fs.readFileSync(f, 'utf8')).features.length; eezPages.push(f); if (n < 100) break;
}
// ---- lights (OpenStreetMap seamark nodes through an Overpass mirror, ODbL) ----
const lf = path.join(OSM, 'lights-overpass.json');
if (!have(lf)) { console.log('downloading lights'); curl(['-o', lf, '--data-urlencode', 'data=[out:json][timeout:120];(node["seamark:type"="light_major"];node["man_made"="lighthouse"]["seamark:type"!~"."];);out center qt;', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']); }
function dp(pts, tol) {
  const n = pts.length; if (n < 3) return pts; const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) { const d = L === 0 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const enc = (pts) => { const xs = pts.map((p) => Math.round(p[0] * Q)), ys = pts.map((p) => Math.round(p[1] * Q)), flat = [xs[0], ys[0]]; for (let i = 1; i < pts.length; i++) flat.push(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); return flat; };
const areas = JSON.parse(fs.readFileSync(iho, 'utf8')).features.map((f) => {
  const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return { n: f.properties.NAME, r: polys.map((p) => dp(p[0], 0.05)).filter((r) => r.length >= 4).map(enc) };
}).filter((a) => a.n && a.r.length);
const KEEP = { '200 NM': 'e', 'Treaty': 't', 'Median line': 't', 'Court ruling': 't', 'Joint regime': 'j', 'Unsettled (maritime)': 'u', 'Unsettled median line (maritime)': 'u', 'Unilateral claim (undisputed)': 'e' };
const eez = [];
for (const f of eezPages) for (const ft of JSON.parse(fs.readFileSync(f, 'utf8')).features) {
  const t = KEEP[ft.properties.line_type]; if (!t) continue; const g = ft.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  for (const l of lines) { const s = dp(l, 0.02); if (s.length >= 2) eez.push({ t, f: enc(s) }); }
}
const marine = { format: 'detail-marine-v1', q: Q, areas, eez, source: 'IHO Sea Areas v3 and EEZ boundary lines: Flanders Marine Institute, Marine Regions (CC BY 4.0), see data/map/SOURCE.md' };
// lights: [lon, lat, name, text, kind(1 major light, 0 lighthouse)]
const lights = [], num = (x) => (x == null || x === '' ? null : Number(String(x).replace(',', '.')));
for (const e of JSON.parse(fs.readFileSync(lf, 'utf8')).elements) {
  const lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon; if (lat == null) continue;
  const t = e.tags || {}, tg = (k) => t['seamark:light:' + k] != null ? t['seamark:light:' + k] : t['seamark:light:1:' + k];
  const ch = tg('character'), grp = tg('group'), col = tg('colour'), per = num(tg('period')), rng = num(tg('range')), hgt = num(tg('height'));
  const C = { white: 'W', red: 'R', green: 'G', yellow: 'Y', blue: 'Bu', orange: 'Or', violet: 'Vi' };
  let text = ''; if (ch) text = ch + (grp && grp !== '1' ? '(' + grp + ')' : '') + (col ? ' ' + String(col).split(';').map((c) => C[c] || c).join('') : '') + (per ? ' ' + per + 's' : '') + (hgt ? ' ' + hgt + 'm' : '') + (rng ? ' ' + rng + 'M' : '');
  lights.push([Math.round(lon * 10000) / 10000, Math.round(lat * 10000) / 10000, String(t['seamark:name'] || t.name || '').slice(0, 40), text, t['seamark:type'] === 'light_major' ? 1 : 0]);
}
const out = (name, obj) => { const f = path.join(root, 'data/map', name); fs.writeFileSync(f, JSON.stringify(obj) + '\n'); console.log(name + ': ' + (fs.statSync(f).size / 1024).toFixed(0) + ' KB'); };
out('detail-marine.json', marine);
out('detail-lights.json', { format: 'detail-lights-v1', lights, source: 'OpenStreetMap contributors (OpenSeaMap seamarks), ODbL, see data/map/SOURCE.md' });
console.log({ areas: areas.length, eez: eez.length, lights: lights.length, withCharacter: lights.filter((l) => l[3]).length });
