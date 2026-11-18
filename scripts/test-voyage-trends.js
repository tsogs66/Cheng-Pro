/**
 * Voyage Chief — Trends page. The page is in both copies of the app (voyage_manager.html and its twin index.html), it has a
 * tab and a More-sheet entry, its chart code is pure and round, and the chart colours are set for every theme.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0; let failed = 0;
function check(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 3).join('\n       ')); } }

const dir = path.join(__dirname, '../modules/voyage/www');
const a = fs.readFileSync(path.join(dir, 'voyage_manager.html'), 'utf8');
const b = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

check('both copies of the app are the same file', () => assert.strictEqual(a, b));
check('the page, its tab and its More entry exist', () => {
  assert.ok(a.includes('id="page-trends"'));
  assert.ok(a.includes('<div class="tab" data-page="trends">Trends</div>'));
  assert.ok(/class="bn-more-item" data-page="trends"/.test(a));
  assert.ok(a.includes("if (pageName === 'trends')"), 'switching to the tab draws it');
});
check('the chart colours are defined for the dark themes and for bright', () => {
  assert.ok(/:root\{[^}]*--tr1:#/s.test(a));
  assert.ok(/html\.bright\{[^}]*--tr1:#/s.test(a));
});
check('the guide lists the page and the service worker cache was bumped', () => {
  assert.ok(fs.readFileSync(path.join(dir, 'guide.js'), 'utf8').includes('Trends —'));
  assert.ok(/noon-report-v379/.test(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8')));
});

const from = a.indexOf('/* ---------- Consumption trends page ---------- */');
const to = a.indexOf('function renderTrends()');
const code = a.slice(from, to);
const box = {};
vm.runInNewContext(code + '\nthis.nice = trendsNice; this.mark = trendsMarker; this.num = trendsNum; this.buckets = trendsBuckets; this.sum = trendsSum; this.mean = trendsMean;', box);
check('axis ticks are round numbers that cover the data', () => {
  const t = box.nice(0, 31.7, 5);
  assert.ok(t.lo <= 0 && t.hi >= 31.7);
  assert.ok(t.ticks.every((v) => Math.abs(v / t.step - Math.round(v / t.step)) < 1e-9));
  assert.ok(t.ticks.length >= 3 && t.ticks.length <= 9);
  const flat = box.nice(5, 5, 4);
  assert.ok(flat.hi > flat.lo);
});
check('marker coordinates are numbers even when handed text (the diamond once drew "54.03.41")', () => {
  ['circle', 'square', 'diamond', 'triangle'].forEach((k) => {
    const svg = box.mark(k, '54.0', '18.7', 3.4, '#fff');
    assert.ok(!/NaN|\d\.\d\d\.\d/.test(svg), k + ': ' + svg);
  });
});
check('an empty or text value is no number', () => {
  assert.strictEqual(box.num(null), null);
  assert.strictEqual(box.num(''), null);
  assert.strictEqual(box.num('x'), null);
  assert.strictEqual(box.num('2.5'), 2.5);
});

const rep = (day, hrs, extra) => Object.assign({ datetime: day + 'T12:00', hrs: hrs || 24, consByType: {} }, extra || {});
const month = []; for (let d = 1; d <= 15; d++) month.push(rep('2026-10-' + String(d).padStart(2, '0'), 24, { meCons: d }));
check('daily: one point per calendar day, two reports on one day are one point', () => {
  const rows = [rep('2026-10-01', 12), rep('2026-10-01', 12), rep('2026-10-02', 24)];
  const b = box.buckets(rows, 'daily', 'all');
  assert.strictEqual(b.length, 2);
  assert.strictEqual(b[0].rows.length, 2);
});
check('weekly: seven-day blocks counted from the first report', () => {
  const b = box.buckets(month, 'weekly', 'all');
  assert.strictEqual(b.length, 3);
  assert.strictEqual(JSON.stringify(b.map((x) => x.rows.length)), '[7,7,1]');
  assert.strictEqual(b[0].label, 'Wk 1');
});
check('the entire leg is one point holding every report', () => {
  const b = box.buckets(month, 'leg', 'all');
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].rows.length, 15);
});
check('"last N" keeps the most recent points', () => {
  const b = box.buckets(month, 'daily', '7');
  assert.strictEqual(b.length, 7);
  assert.ok(b[6].from === '2026-10-15');
});
check('a rate is the sum over the hours it covers; a total is the sum', () => {
  const rows = [rep('2026-10-01', 12, { meCons: 6 }), rep('2026-10-02', 36, { meCons: 12 })];
  assert.strictEqual(box.sum(rows, (r) => r.meCons, 'period'), 18);
  assert.strictEqual(box.sum(rows, (r) => r.meCons, 'day'), 18 * 24 / 48);
  assert.strictEqual(box.sum(rows, (r) => r.nothing, 'day'), null);
});
check('a mean is weighted by hours, and skips what was not recorded', () => {
  const rows = [rep('2026-10-01', 10, { slip: 2 }), rep('2026-10-02', 30, { slip: 4 }), rep('2026-10-03', 24, {})];
  assert.strictEqual(box.mean(rows, (r) => r.slip), (2 * 10 + 4 * 30) / 40);
});
console.log(failed ? '\n' + failed + ' failed' : '\n' + pass + ' passed');
process.exit(failed ? 1 : 0);
