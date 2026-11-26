#!/usr/bin/env node
// Builds the compact offline land outline for the route map: data/map/source/ne_50m_land.geojson (Natural Earth, public domain)
// -> data/map/land.json. Rings are simplified (Douglas-Peucker, TOL degrees) and stored as integers in 1/Q degree, delta-encoded.
// Usage: node scripts/build-land.js [in.geojson] [out.json]
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const inFile = process.argv[2] || path.join(root, 'data/map/source/ne_50m_land.geojson');
const outFile = process.argv[3] || path.join(root, 'data/map/land.json');
const Q = 100, TOL = 0.05;
function dp(pts, tol) { // iterative Douglas-Peucker, planar degrees (fine at this tolerance)
  const n = pts.length; if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = L === 0 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const gj = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const rings = []; let inPts = 0, outPts = 0;
const add = (ring) => {
  inPts += ring.length;
  const s = dp(ring, TOL); if (s.length < 4) return;
  const xs = s.map(p => Math.round(p[0] * Q)), ys = s.map(p => Math.round(p[1] * Q)), flat = [xs[0], ys[0]];
  for (let i = 1; i < s.length; i++) flat.push(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  outPts += s.length; rings.push(flat);
};
for (const f of gj.features) {
  const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) add(p[0]); // outer rings only: lakes and holes do not matter for a route map
}
fs.writeFileSync(outFile, JSON.stringify({ format: 'land-v1', q: Q, source: 'Natural Earth 1:50m land (public domain), see data/map/SOURCE.md', rings }) + '\n');
console.log(`land: ${rings.length} rings, ${inPts} -> ${outPts} points, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB -> ${path.relative(root, outFile)}`);
