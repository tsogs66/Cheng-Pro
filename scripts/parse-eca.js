'use strict';
// Reads the official ECA coordinate tables (text extracted from the IMO resolutions in data/eca/source/) into rings of [lon, lat].
// MEPC.190(60) and MEPC.202(62) are scans, so the text has OCR slips (T for 7, O for 0, J for 7, l for 1, stray quotes); the clean-up below is
// checked by the step-length test in test-eca.js (no two consecutive points of a ring further apart than the table allows).
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '../data/eca/source', f), 'utf8');
function clean(s) { return s.replace(/JO/g, '7 ').replace(/O/g, '0').replace(/T/g, '7').replace(/[lI]/g, '1'); }
function dm(d, m, s) { return Number(d) + Number(m) / 60 + Number(s || 0) / 3600; }
/** Rows "POINT lat° ' \" N. lon° ' \" W." -> {n, lat, lon}. */
function rowsDMS(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = clean(raw);
    let m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\D{1,4}(\d{1,2})\D{1,4}(\d{1,2})\D*?[NS]\D+(\d{1,3})\D{1,4}(\d{1,2})\D{1,4}(\d{1,2})\D*[EW]/);
    let g = m;
    if (!g) { // the scan sometimes runs minutes and seconds together ("1T44" = 17' 44"): split a four-digit group
      if (!/^\s*\d{1,3}\s+\d{1,3}\D/.test(line) || !/[NS]/.test(line) || !/[EW]/.test(line)) continue;
      const nums = (line.match(/\d+/g) || []).flatMap((t, i) => (i > 0 && t.length === 4 ? [t.slice(0, 2), t.slice(2)] : [t]));
      if (nums.length !== 7) continue;
      g = [null, ...nums];
    }
    const lat = dm(g[2], g[3], g[4]), lon = dm(g[5], g[6], g[7]);
    m = g;
    out.push({ n: Number(m[1]), lat: /S/.test(line.slice(line.indexOf(m[4]), line.indexOf(m[5]))) ? -lat : lat, lon: /E\./.test(line) && !/W/.test(line) ? lon : -lon });
  }
  return out;
}
/** Rows with degrees and decimal minutes: "35°57'.59 N 05°58'.27 W" (MEPC.407(84), two or three columns per line). */
function rowsDM(text) {
  const out = []; const re = /(\d{1,3})\s+(\d{1,2})°(\d{2})'\.(\d{2})\s*([NS])\s+(\d{1,3})°(\d{2})'\.(\d{2})\s*([EW])/g;
  for (const raw of text.split('\n')) { let m; re.lastIndex = 0; while ((m = re.exec(raw))) {
    const lat = Number(m[2]) + (Number(m[3]) + Number(m[4]) / 100) / 60, lon = Number(m[6]) + (Number(m[7]) + Number(m[8]) / 100) / 60;
    out.push({ n: Number(m[1]), lat: m[5] === 'S' ? -lat : lat, lon: m[9] === 'W' ? -lon : lon });
  } }
  return out;
}
/** Split a numbered list into runs that restart at 1 (the resolutions list several areas, each numbered from 1). */
function runs(rows) { const out = []; let cur = null; for (const r of rows) { if (r.n === 1 || !cur) { cur = []; out.push(cur); } cur.push(r); } return out; }
function load() {
  const na = runs(rowsDMS(src('MEPC.190-60_north_american_eca.txt')));
  const car = runs(rowsDMS(src('MEPC.202-62_us_caribbean_eca.txt')));
  const ne = rowsDM(src('MEPC.407-84_north_east_atlantic_eca.txt')).sort((a, b) => a.n - b.n);
  return { na, car, ne };
}
module.exports = { rowsDMS, rowsDM, runs, load };
if (require.main === module) {
  const { na, car, ne } = load();
  console.log('NA runs', na.map(r => r.length + ' pts (first ' + r[0].n + ', last ' + r[r.length - 1].n + ')').join(' | '));
  console.log('Caribbean runs', car.map(r => r.length + ' pts').join(' | '));
  console.log('NE Atlantic', ne.length, 'pts; first', ne[0].n, 'last', ne[ne.length - 1].n, 'missing', Array.from({ length: 157 }, (_, i) => i + 1).filter(i => !ne.some(r => r.n === i)).join(','));
  const R = 3440.065, rad = Math.PI / 180, gc = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2));
  const check = (name, rows, max) => rows.forEach((r, i) => { if (i && gc(rows[i - 1], r) > max) console.log('  step', name, rows[i - 1].n, '->', r.n, Math.round(gc(rows[i - 1], r)), 'nm', JSON.stringify(rows[i - 1]), JSON.stringify(r)); });
  na.forEach((r, k) => check('NA' + (k + 1), r, 130)); car.forEach((r, k) => check('CAR' + (k + 1), r, 130)); check('NE', ne.filter(r => r.n <= 157), 330);
}
