#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const checks = [];

function check(label, ok, detail) {
  checks.push({ label, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

console.log('\nLoading splash — shared assets and hooks');

const css = fs.readFileSync(path.join(ROOT, 'apps/web/css/loading-splash.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'apps/web/js/loading-splash.js'), 'utf8');

check('CSS defines ship pull motion', /loading-splash-ship-motion/.test(css));
check('JS exports LoadingSplash stack API', /function show\(id, label/.test(js) && /window\.LoadingSplash/.test(js));

const copies = [
  ['modules/voyage/www/loading-splash.js', js],
  ['modules/tanks/public/js/loading-splash.js', js],
];
for (const [rel, expected] of copies) {
  const p = path.join(ROOT, rel);
  check(`${rel} exists and matches apps/web`, fs.existsSync(p) && fs.readFileSync(p, 'utf8') === expected);
}

const shell = fs.readFileSync(path.join(ROOT, 'apps/web/js/shell.js'), 'utf8');
check('AIO shell ends boot splash', /LoadingSplash\.endBoot\(\)/.test(shell));

const progress = fs.readFileSync(path.join(ROOT, 'apps/web/js/progress.js'), 'utf8');
check('Progress ties to LoadingSplash', /LoadingSplash\.show\('task-progress'/.test(progress));

for (const rel of ['modules/voyage/www/voyage_manager.html', 'modules/voyage/www/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const base = path.basename(rel);
  check(`${base} links loading-splash.css`, /loading-splash\.css/.test(html));
  check(`${base} hooks paintActivity to splash`, /LoadingSplash\.show\('activity'/.test(html));
}

const tankIdx = fs.readFileSync(path.join(ROOT, 'modules/tanks/public/index.html'), 'utf8');
check('Tank index loads loading-splash.js', /loading-splash\.js/.test(tankIdx));

const failures = checks.filter((c) => !c.ok).length;
if (failures) {
  console.log(`\n${failures}/${checks.length} failed`);
  process.exit(1);
}
console.log(`\nloading splash: ${checks.length} checks passed`);
