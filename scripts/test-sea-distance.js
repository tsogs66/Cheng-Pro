'use strict';
// The Sea Distance page ships copies of the canonical data/libs; fail if they drift.
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const r = spawnSync(process.execPath, [path.join(__dirname, 'build-sea-distance.js'), '--check'], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
const html = fs.readFileSync(path.join(__dirname, '../modules/voyage/www/sea-distance/index.html'), 'utf8');
for (const s of ['port-list.js', 'sea-route.js', 'ports.json', 'marnet.json']) if (!html.includes(s)) { console.error('index.html does not reference ' + s); process.exit(1); }
// New Voyage Leg dialog integration (both identical copies of the Voyage page) + offline precache
for (const f of ['index.html', 'voyage_manager.html']) {
  const h = fs.readFileSync(path.join(__dirname, '../modules/voyage/www', f), 'utf8');
  for (const s of ['id="nvLegCalc"', 'id="sdOverlay"', 'id="sdFrame"', "sea-distance/index.html?", "type !== 'seaDistance'"]) if (!h.includes(s)) { console.error(f + ' missing ' + s); process.exit(1); }
}
const sw = fs.readFileSync(path.join(__dirname, '../modules/voyage/www/sw.js'), 'utf8');
for (const s of ['index.html', 'port-list.js', 'sea-route.js', 'ports.json', 'marnet.json']) if (!sw.includes("'./sea-distance/" + s + "'")) { console.error('sw.js does not precache ' + s); process.exit(1); }
console.log('sea-distance OK');
