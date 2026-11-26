#!/usr/bin/env node
// Builds the detailed offline map layers for the route map from Natural Earth 1:10m (public domain):
//   land + minor islands (two detail levels), lakes, rivers, the 200 m shelf, and the names of seas, straits, channels, gulfs and bays.
// -> data/map/detail-land.json and data/map/detail-water.json  (rings and lines simplified with Douglas-Peucker, stored as integers in 1/Q degree, delta-encoded)
// The raw downloads are large and are not kept in the repository: this script fetches them (curl) into data/map/source/ne10m/ (ignored by git) when missing.
// Usage: node scripts/build-detail-map.js
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const SRC = path.join(root, 'data/map/source/ne10m');
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const NEED = ['ne_10m_land', 'ne_10m_minor_islands', 'ne_10m_lakes', 'ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_rivers_north_america', 'ne_10m_geography_marine_polys', 'ne_10m_bathymetry_K_200', 'ne_10m_populated_places_simple'];
const Q = 200; // 1/200 degree (about 0.3 nm) per integer step
fs.mkdirSync(SRC, { recursive: true });
for (const n of NEED) {
  const f = path.join(SRC, n + '.geojson');
  if (!fs.existsSync(f) || fs.statSync(f).size < 1000) { console.log('downloading ' + n); execFileSync('curl', ['-sS', '-L', '--fail', '-m', '300', '-o', f, BASE + n + '.geojson'], { stdio: 'inherit' }); }
}
const load = (n) => JSON.parse(fs.readFileSync(path.join(SRC, n + '.geojson'), 'utf8')).features.filter((f) => f.geometry);
function dp(pts, tol) { // iterative Douglas-Peucker in planar degrees
  const n = pts.length; if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) { const d = L === 0 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const enc = (pts) => { const xs = pts.map((p) => Math.round(p[0] * Q)), ys = pts.map((p) => Math.round(p[1] * Q)), flat = [xs[0], ys[0]]; for (let i = 1; i < pts.length; i++) flat.push(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); return flat; };
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const area = (r) => { let a = 0; for (let i = 1; i < r.length; i++) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]; return a / 2; };
const stats = {};
function rings(features, tol, minPts, label) {
  const out = []; let inP = 0, outP = 0;
  for (const f of features) for (const p of polys(f.geometry)) { // outer rings only: the lakes are their own layer
    const r = p[0]; inP += r.length; const s = dp(r, tol); if (s.length < (minPts || 4)) continue; out.push(enc(s)); outP += s.length;
  }
  stats[label] = `${out.length} rings, ${inP} -> ${outP} points`; return out;
}
// ---- land: two levels ----
const land = load('ne_10m_land').concat(load('ne_10m_minor_islands'));
const detailLand = { format: 'detail-land-v1', q: Q, mid: rings(land, 0.012, 4, 'land mid'), fine: rings(land, 0.003, 4, 'land fine'),
  source: 'Natural Earth 1:10m land and minor islands (public domain), see data/map/SOURCE.md' };
// ---- water: lakes, rivers, shelf, names ----
const lakes = rings(load('ne_10m_lakes').filter((f) => (f.properties.scalerank == null || f.properties.scalerank <= 9)), 0.008, 4, 'lakes');
const inBox = (pt, b) => pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];
const EU = [-25, 34, 60, 72], NA = [-170, 5, -50, 84]; // the regional river sets replace the world set where they exist
const riverFeatures = (fs_, tag, skipBoxes) => {
  const out = [];
  for (const f of fs_) {
    if (f.properties.featurecla === 'Lake Centerline') continue; // a centreline through a lake is only a drawing aid
    const rank = Number(f.properties.scalerank); const name = f.properties.name || f.properties.name_en || '';
    for (const l of lines(f.geometry)) {
      if (skipBoxes && skipBoxes.some((b) => inBox(l[0], b))) continue;
      const s = dp(l, 0.006); if (s.length < 2) continue;
      out.push({ r: isFinite(rank) ? Math.min(12, rank) : 8, n: name, f: enc(s) });
    }
  }
  return out;
};
const rivers = riverFeatures(load('ne_10m_rivers_lake_centerlines'), 'world', [EU, NA]).concat(riverFeatures(load('ne_10m_rivers_europe'), 'eu'), riverFeatures(load('ne_10m_rivers_north_america'), 'na'));
stats.rivers = rivers.length + ' lines, ' + rivers.reduce((a, r) => a + r.f.length / 2, 0) + ' points';
const shelfFeatures = load('ne_10m_bathymetry_K_200');
const shelf = rings(shelfFeatures, 0.04, 4, 'deeper than 200 m');
// names of seas, straits, channels, gulfs, bays: the centre of the largest part
const names = [];
for (const f of load('ne_10m_geography_marine_polys')) {
  const p = f.properties; const nm = p.name_en || p.name; if (!nm) continue;
  let best = null, ba = 0; for (const poly of polys(f.geometry)) { const a = Math.abs(area(poly[0])); if (a > ba) { ba = a; best = poly[0]; } }
  if (!best) continue;
  let sx = 0, sy = 0, sa = 0; for (let i = 1; i < best.length; i++) { const c = best[i - 1][0] * best[i][1] - best[i][0] * best[i - 1][1]; sx += (best[i - 1][0] + best[i][0]) * c; sy += (best[i - 1][1] + best[i][1]) * c; sa += c; }
  let lon = sa ? sx / (3 * sa) : best[0][0], lat = sa ? sy / (3 * sa) : best[0][1];
  if (!isFinite(lon) || !isFinite(lat)) continue;
  names.push([nm, Math.round(lon * 100) / 100, Math.round(lat * 100) / 100, String(p.featurecla || '').toLowerCase(), p.min_label != null ? Number(p.min_label) : null, Math.round(Math.sqrt(ba) * 10) / 10]);
}
stats.names = names.length + ' names';
const water = { format: 'detail-water-v1', q: Q, lakes, rivers, shelf, names, source: 'Natural Earth 1:10m lakes, rivers, bathymetry 200 m and marine names (public domain), see data/map/SOURCE.md' };
// towns and cities: [name, lon, lat, min zoom, capital 0/1, population]; only those a web map would label by zoom 11
const places = load('ne_10m_populated_places_simple').map((f) => { const p = f.properties; const g = f.geometry.coordinates; const nm = p.nameascii || p.name; if (!nm) return null;
  return [nm, Math.round(g[0] * 1000) / 1000, Math.round(g[1] * 1000) / 1000, p.min_zoom != null ? Math.round(Number(p.min_zoom) * 10) / 10 : 8, p.adm0cap ? 1 : 0, Math.round(Number(p.pop_max) || 0)]; }).filter(Boolean).sort((a, b) => a[3] - b[3] || b[5] - a[5]);
stats.places = places.length + ' places';
const placesFile = { format: 'detail-places-v1', places, source: 'Natural Earth 1:10m populated places (public domain), see data/map/SOURCE.md' };
for (const [name, obj] of [['detail-land.json', detailLand], ['detail-water.json', water], ['detail-places.json', placesFile]]) {
  const out = path.join(root, 'data/map', name); fs.writeFileSync(out, JSON.stringify(obj) + '\n'); console.log(name + ': ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}
console.log(stats);
