#!/usr/bin/env node
// Validates scripts/sea-lane-network.js and writes data/sea-lanes/network.json (with edge lengths in nm).
'use strict';
const fs = require('fs'), path = require('path');
const { nodes, edges } = require('./sea-lane-network.js');
const outFile = process.argv[2] || path.join(__dirname, '../data/sea-lanes/network.json');
const R_NM = 3440.065, rad = Math.PI / 180;
const gc = (a, b) => { const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2; return 2 * R_NM * Math.asin(Math.sqrt(h)); };
const byId = new Map();
for (const [id, lat, lon] of nodes) {
  if (byId.has(id)) throw new Error('duplicate node ' + id);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) throw new Error('bad coords ' + id);
  byId.set(id, { id, lat, lon });
}
const seen = new Set(), outEdges = [];
for (const [a, b, o] of edges) {
  if (!byId.has(a) || !byId.has(b)) throw new Error(`edge ${a}-${b}: unknown node`);
  const k = [a, b].sort().join('|'); if (seen.has(k)) throw new Error('duplicate edge ' + k); seen.add(k);
  const nm = o && o.nm ? o.nm : Math.round(gc(byId.get(a), byId.get(b)) * 10) / 10;
  const e = { a, b, nm }; if (o && o.tag) e.tag = o.tag;
  outEdges.push(e);
}
// connectivity
const adj = new Map([...byId.keys()].map(k => [k, []]));
outEdges.forEach(e => { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); });
const first = nodes[0][0], vis = new Set([first]), st = [first];
while (st.length) for (const n of adj.get(st.pop())) if (!vis.has(n)) { vis.add(n); st.push(n); }
if (vis.size !== byId.size) throw new Error('disconnected nodes: ' + [...byId.keys()].filter(k => !vis.has(k)).join(','));
const long = outEdges.filter(e => e.nm > 3500).map(e => `${e.a}-${e.b}=${e.nm}`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({
  phase: 1, note: 'Coarse hand-authored backbone; approximate distances, NOT for navigation. See README.md.',
  nodes: [...byId.values()], edges: outEdges,
}) + '\n');
console.log(`wrote ${byId.size} nodes, ${outEdges.length} edges -> ${outFile}` + (long.length ? `\nlong edges (check): ${long.join(', ')}` : ''));
