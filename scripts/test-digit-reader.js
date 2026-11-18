/**
 * Handwritten numbers: the network reads real handwriting from the ship's own cards, a joined pair is told apart from
 * one digit, a point sits between digits, a minus starts a number and a slash keeps two numbers apart. Pure code, in Node.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); pass += 1; console.log('  ok   ' + name); } catch (e) { failed += 1; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 4).join('\n       ')); }
}

const D = require('../apps/web/js/digit-reader.js');
const netSrc = fs.readFileSync(path.join(__dirname, '../apps/web/vendor/ocr/digit-net.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(netSrc, sandbox);
D.setNet(sandbox.window.CHENG_DIGIT_NET);

/* ink drawing helpers: a field is cw x ch with flags */
function field(cw, ch) { return { cw, ch, ink: new Uint8Array(cw * ch) }; }
function line(f, x0, y0, x1, y1, t) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) { const px = Math.round(x + dx), py = Math.round(y + dy); if (px >= 0 && py >= 0 && px < f.cw && py < f.ch) f.ink[py * f.cw + px] = 1; }
  }
}

console.log('A temperature written with its unit');
const dg = (x0, y0, x1, y1) => ({ kind: 'digit', box: [x0, y0, x1, y1], img: new Float32Array(784) });
check('30°C: the degree ring and the C are the unit, not digits (a ring of its own, then the C)', () => {
  const parts = D.dropUnit([dg(77, 43, 93, 61), dg(97, 46, 115, 61), dg(125, 38, 136, 50), dg(136, 40, 153, 61)]);
  assert.strictEqual(parts.length, 2);
});
check('30°C: the ring and the C touching make one tall mark that is dropped', () => {
  const parts = D.dropUnit([dg(91, 41, 104, 60), dg(109, 45, 121, 60), dg(129, 35, 146, 60)]);
  assert.strictEqual(parts.length, 2);
});
check('42 °C: a C standing well apart from the number is dropped', () => {
  const parts = D.dropUnit([dg(62, 33, 84, 61), dg(89, 41, 107, 60), dg(141, 38, 155, 61)]);
  assert.strictEqual(parts.length, 2);
});
check('a plain number with no unit keeps every digit', () => {
  const parts = D.dropUnit([dg(40, 43, 60, 61), dg(64, 44, 84, 60), dg(88, 42, 108, 61), dg(112, 43, 132, 60)]);
  assert.strictEqual(parts.length, 4);
});

console.log('The network');
check('it reads digits written by hand on the ship\'s cards', () => {
  const samples = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/digit-samples.json'), 'utf8'));
  let ok = 0;
  samples.forEach((s) => {
    const pr = D.classify(Float32Array.from(s.img));
    let b = 0; for (let k = 1; k < 10; k++) if (pr[k] > pr[b]) b = k;
    if (b === s.l) ok++;
  });
  assert.ok(ok / samples.length >= 0.9, ok + ' of ' + samples.length);
});

console.log('Cutting a field into characters');
check('two upright strokes a hand apart are two digits, 1 and 1', () => {
  const f = field(200, 60);
  line(f, 60, 8, 60, 52, 1); line(f, 110, 8, 110, 52, 1);
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, {}).text, '11');
});
check('a small mark low between two digits is a decimal point', () => {
  const f = field(220, 60);
  line(f, 50, 8, 50, 52, 1); line(f, 130, 8, 130, 52, 1);
  line(f, 90, 50, 90, 52, 2);
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, {}).text, '1.1');
});
check('a small mark with no digit after it is a smudge, not a point', () => {
  const f = field(200, 60);
  line(f, 50, 8, 50, 52, 1); line(f, 120, 50, 120, 52, 2);
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, {}).text, '1');
});
check('a leaning stroke between two numbers is a slash: 11/11 is two numbers', () => {
  const f = field(320, 60);
  line(f, 30, 8, 30, 52, 1); line(f, 46, 8, 46, 52, 1);
  line(f, 120, 54, 150, 6, 1);
  line(f, 200, 8, 200, 52, 1); line(f, 216, 8, 216, 52, 1);
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, { allow: '0123456789./' }).text, '11/11');
});
check('a narrow bar with a clear space each side is the separator in 112/111', () => {
  const f = field(360, 60);
  [20, 36, 52].forEach((x) => line(f, x, 8, x, 52, 1));
  line(f, 120, 52, 124, 8, 1);
  [170, 186, 202].forEach((x) => line(f, x, 8, x, 52, 1));
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, { allow: '0123456789./' }).text, '111/111');
});
check('a flat stroke before the digits is a minus, only where the field allows one', () => {
  const f = field(220, 60);
  line(f, 20, 30, 60, 30, 1); line(f, 110, 8, 110, 52, 1);
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, { allow: '0123456789.-' }).text, '-1');
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, { allow: '0123456789.' }).text, '1');
});
check('a sliver of the box line along the edge is not a digit', () => {
  const f = field(200, 60);
  line(f, 10, 1, 190, 1, 1); line(f, 100, 10, 100, 52, 1);
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, {}).text, '1');
});
check('an empty field reads as nothing', () => {
  const f = field(200, 60);
  assert.strictEqual(D.readNumber(f.ink, f.cw, f.ch, {}).text, '');
});

console.log('Where a card value goes');
const ctx = { window: {}, document: {}, Event: class {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../modules/tanks/public/js/tank-card-capture.js'), 'utf8'), ctx);
const T = ctx.window.TankCardCapture;
check('a written date becomes the page\'s date: 13/11/2026, 13 NOV 2026, 13-11-26', () => {
  assert.strictEqual(T.parseCardDate('13/11/2026'), '2026-11-13');
  assert.strictEqual(T.parseCardDate('13 NOV 2026'), '2026-11-13');
  assert.strictEqual(T.parseCardDate('13-11-26'), '2026-11-13');
  assert.strictEqual(T.parseCardDate('32/13/2026'), '');
  assert.strictEqual(T.parseCardDate('garbage'), '');
});
check('military time: 0800H, 1200H, 08:00, 800 are the time of day; 2560 is not', () => {
  assert.strictEqual(T.parseCardTime('0800H'), '08:00');
  assert.strictEqual(T.parseCardTime('1200H'), '12:00');
  assert.strictEqual(T.parseCardTime('08:00'), '08:00');
  assert.strictEqual(T.parseCardTime('800'), '08:00');
  assert.strictEqual(T.parseCardTime('2560'), '');
});

console.log(`\n${pass} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
