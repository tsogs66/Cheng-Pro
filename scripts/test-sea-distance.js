'use strict';
// The Sea Distance page ships copies of the canonical data/libs; fail if they drift.
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const r = spawnSync(process.execPath, [path.join(__dirname, 'build-sea-distance.js'), '--check'], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
const html = fs.readFileSync(path.join(__dirname, '../modules/voyage/www/sea-distance/index.html'), 'utf8');
for (const s of ['port-list.js', 'sea-route.js', 'ports.json', 'marnet.json']) if (!html.includes(s)) { console.error('index.html does not reference ' + s); process.exit(1); }
console.log('sea-distance OK');
