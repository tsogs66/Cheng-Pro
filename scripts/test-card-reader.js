/* The offline card reader: geometry, finding the corner marks, cutting out a field, and the cards themselves. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../apps/web/js/card-reader.js');
let pass = 0, failed = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 4).join('\n       ')); } };

/* a white picture, with helpers to draw dark rectangles and lines */
const canvas = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
const fillRect = (img, x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * img.width + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; } };

console.log('Geometry');
check('a straightening round-trips: card point -> photo point -> card point', () => {
  const card = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const photo = [{ x: 120, y: 80 }, { x: 900, y: 140 }, { x: 960, y: 1300 }, { x: 90, y: 1250 }];
  const H = R.homography(card, photo);
  const back = R.homography(photo, card);
  const p = R.applyH(H, 0.37, 0.62);
  const q = R.applyH(back, p.x, p.y);
  assert.ok(Math.abs(q.x - 0.37) < 1e-6 && Math.abs(q.y - 0.62) < 1e-6);
  card.forEach((c, i) => { const m = R.applyH(H, c.x, c.y); assert.ok(Math.hypot(m.x - photo[i].x, m.y - photo[i].y) < 1e-6); });
});
check('four collinear points have no straightening', () => {
  assert.strictEqual(R.homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]), null);
});

console.log('Finding the corner marks');
function photoWithMarks(opts = {}) {
  const img = canvas(1200, 1500);
  fillRect(img, 0, 0, 1200, 1500, 215);                      // the table / paper
  const marks = [[160, 140], [1010, 160], [1040, 1330], [140, 1300]];   // top-left, top-right, bottom-right, bottom-left
  marks.forEach(([x, y]) => fillRect(img, x, y, x + 30, y + 30, 10));
  if (opts.lines) {
    fillRect(img, 170, 1290, 1050, 1294, 20);                // a printed rule touching the bottom marks' height
    fillRect(img, 150, 300, 1060, 303, 20);
    for (let i = 0; i < 6; i++) fillRect(img, 200 + i * 120, 500, 215 + i * 120, 515, 30);   // small dark specks
  }
  return img;
}
check('the four marks are found in a clean picture', () => {
  const c = R.markCandidates(photoWithMarks());
  assert.strictEqual(c.length, 4);
  const q = R.pickQuad(c, 850 / 1160);
  assert.ok(q && q.length === 4);
  assert.ok(q[0].x < 400 && q[0].y < 400 && q[1].x > 800 && q[2].y > 1000 && q[3].x < 400, 'in order: top-left, top-right, bottom-right, bottom-left');
});
check('printed rules touching a mark, and specks, do not hide the marks', () => {
  const c = R.markCandidates(photoWithMarks({ lines: true }));
  const q = R.pickQuad(c, 850 / 1160);
  assert.ok(q, 'the quad is still found');
  assert.ok(Math.abs(q[2].x - 1055) < 10 && Math.abs(q[2].y - 1345) < 10, 'and sits on the right marks: ' + JSON.stringify(q[2]));
});
check('a picture with no card in it gives no corners', () => {
  const img = canvas(900, 1100); fillRect(img, 100, 100, 130, 130, 10);
  assert.strictEqual(R.pickQuad(R.markCandidates(img), 0.73), null);
});

console.log('Cutting out a field');
check('a printed rule is removed, the writing stays', () => {
  const img = canvas(400, 100);
  fillRect(img, 0, 0, 400, 100, 255);
  fillRect(img, 4, 88, 396, 91, 30);                                   // underline across the field
  fillRect(img, 120, 30, 130, 80, 30); fillRect(img, 150, 30, 160, 80, 30);  // two strokes of handwriting
  const prep = R.prepareField(img, { x: 0, y: 0, w: 1, h: 1 }, 2, false);
  let rule = 0, strokes = 0;
  for (let x = 20; x < 380; x++) { if (prep.image.data[(89 * 400 + x) * 4] === 0) rule++; if (prep.image.data[(50 * 400 + x) * 4] === 0) strokes++; }
  assert.strictEqual(rule, 0, 'rule gone');
  assert.ok(strokes >= 18, 'strokes kept');
});
check('a rule that is a pixel off after straightening is still removed', () => {
  const img = canvas(400, 100);
  fillRect(img, 4, 20, 200, 22, 30); fillRect(img, 200, 21, 396, 23, 30);      // a line with a step in it
  fillRect(img, 180, 45, 190, 85, 30);
  const prep = R.prepareField(img, { x: 0, y: 0, w: 1, h: 1 }, 2, false);
  let left = 0;
  for (let y = 15; y < 30; y++) for (let x = 10; x < 390; x++) if (prep.image.data[(y * 400 + x) * 4] === 0) left++;
  assert.strictEqual(left, 0);
});
check('on a line, ink wholly in the top part is the row above, not this field', () => {
  const img = canvas(300, 100);
  fillRect(img, 40, 4, 120, 24, 30);                                   // the row above, in the top part
  fillRect(img, 150, 45, 162, 90, 30);                                 // the writing, low in the cut-out
  const prep = R.prepareField(img, { x: 0, y: 0, w: 1, h: 1 }, 2, true);
  assert.strictEqual(prep.image.data[(14 * 300 + 80) * 4], 255, 'top ink dropped');
  assert.strictEqual(prep.image.data[(65 * 300 + 156) * 4], 0, 'writing kept');
});
check('an empty field has almost no ink, a ticked box is dark', () => {
  const img = canvas(300, 100);
  assert.ok(R.prepareField(img, { x: 0, y: 0, w: 1, h: 1 }, 2, false).inkRatio < 0.004);
  const box = canvas(100, 100); fillRect(box, 20, 20, 80, 80, 20);
  assert.ok(R.boxDarkness(box, { x: 0, y: 0, w: 1, h: 1 }) > 0.5);
  assert.ok(R.boxDarkness(canvas(100, 100), { x: 0, y: 0, w: 1, h: 1 }) < 0.05);
});
check('what is read becomes a number: look-alike letters, comma decimals, stray marks', () => {
  assert.strictEqual(R.cleanNumber('1O5,5'), '105.5');
  assert.strictEqual(R.cleanNumber(' l2.3\n'), '12.3');
  assert.strictEqual(R.cleanNumber('-4.5'), '-4.5');
  assert.strictEqual(R.cleanNumber('1.2.3'), '1.23');
  assert.strictEqual(R.cleanNumber(''), '');
});

console.log('The cards carry what the reader needs');
const tsc = fs.readFileSync(path.join(__dirname, '../modules/tanks/public/js/tank-sounding-card.js'), 'utf8');
const voy = fs.readFileSync(path.join(__dirname, '../modules/voyage/www/voyage_manager.html'), 'utf8');
check('both cards print four corner marks and mark their write-in fields', () => {
  [tsc, voy].forEach((src) => {
    ['tl', 'tr', 'bl', 'br'].forEach((c) => assert.ok(src.includes(`data-card-mark="${c}"`), 'mark ' + c));
    assert.ok(/\.pr-card-mark\{[^}]*background:#000/.test(src.replace(/\s+/g, ' ').replace(/\{ /g, '{').replace(/ \}/g, '}')) || /\.pr-card-mark\{\s*position:absolute[^}]*background:#000/.test(src), 'marks are solid black');
    assert.ok(src.includes('data-card-field'), 'fields marked');
  });
  assert.ok(tsc.includes('data-card-box="ullage:') && tsc.includes('data-card-box="depth:'), 'the Ullage and Depth boxes are marked');
  assert.ok(tsc.includes('layoutDocument'), 'the sounding card gives the reader its layout');
  assert.ok(voy.includes('function logEntryCardLayoutDocument'), 'the log card gives the reader its layout');
});
check('the program\'s pages load the reader and show the buttons', () => {
  const tank = fs.readFileSync(path.join(__dirname, '../modules/tanks/public/index.html'), 'utf8');
  assert.ok(tank.includes('/js/card-reader.js') && tank.includes('tank-card-capture.js'));
  assert.ok(voy.includes('<script src="/js/card-reader.js"></script>'));
  const rep = fs.readFileSync(path.join(__dirname, '../modules/tanks/public/js/bunkering-report.js'), 'utf8');
  assert.ok(rep.includes("'bp-capture', 'monitoring'") && rep.includes("'ba-capture', 'after'"), 'monitoring and after-bunkering pages have the button');
  assert.ok(voy.includes("make('btnCaptureCard', 'btnClearForm'") && voy.includes("'btnCaptureCardSummary'"), 'log entry and voyage summary have the button');
});
check('the reader ships with the app and nothing in it reaches the internet', () => {
  const dir = path.join(__dirname, '../apps/web/vendor/ocr');
  ['tesseract.min.js', 'worker.min.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js', 'lang/eng.traineddata.gz'].forEach((f) => assert.ok(fs.existsSync(path.join(dir, f)), f));
  const reader = fs.readFileSync(path.join(__dirname, '../apps/web/js/card-reader.js'), 'utf8');
  assert.ok(/VENDOR = '\/vendor\/ocr\/'/.test(reader));
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(reader), 'no web address in the reader');
});

const pending = [(async () => {
  try {
    let gaveUp = false;
    try { await R.withTimeout(new Promise(() => {}), 30, 'The text reader'); } catch (e) { gaveUp = /did not answer/.test(e.message); }
    assert.ok(gaveUp, 'it must reject');
    assert.strictEqual(await R.withTimeout(Promise.resolve(7), 1000, 'x'), 7);
    pass++; console.log('  ok   a reader that never answers gives up, so the dialog cannot say "Reading..." for ever');
  } catch (e) { failed++; console.log('  FAIL a reader that never answers gives up\n       ' + e.message); }
})()];
check('no text reader: the way up is the end where the bold title is, the darker of the two', () => {
  const W = 400, H = 560, mk = (bandTop) => {
    const d = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let y = bandTop; y < bandTop + 14; y++) for (let x = 120; x < 280; x++) if ((x >> 2) % 2 === 0) { const o = (y * W + x) * 4; d[o] = d[o + 1] = d[o + 2] = 20; }
    return { width: W, height: H, data: d };
  };
  const layout = { title: { text: 'TANK SOUNDING CARD', rect: { x: 0.2, y: 0.04, w: 0.6, h: 0.05 } } };
  const upright = R.titleInk(mk(Math.round(0.04 * H) + 4), layout);
  const upside = R.titleInk(mk(Math.round(0.9 * H)), layout);
  assert.ok(upright > 0.15 && upside < 0.01, upright + ' vs ' + upside);
  assert.strictEqual(R.titleInk({ width: 10, height: 10, data: new Uint8ClampedArray(400) }, {}), null);
});

Promise.all(pending).then(() => {
  console.log(`\n${pass} passed${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
});
