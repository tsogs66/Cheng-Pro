/*
 * Read a printed data card from a photo, on the device, with no internet.
 *
 * The cards (Tank Sounding Card, Log Entry Data Card) are printed by the app itself, so the app knows where every
 * write-in field is. Each card carries four square marks in its corners. From a photo this module
 *   1. finds the four marks (or lets the person place the corners by hand),
 *   2. straightens the card (perspective correction),
 *   3. cuts out each field from the card layout,
 *   4. reads the digits in each cut-out with Tesseract running locally (WebAssembly, bundled under /vendor/ocr/),
 *   5. shows a review screen: the cut-out next to what was read, so the person corrects it before anything is used.
 * Nothing leaves the device. Nothing is filled in without the review screen.
 *
 * Geometry and image helpers are plain functions so they can be tested in Node.
 */
(function (root) {
  'use strict';

  var VENDOR = '/vendor/ocr/';

  /* ------------------------------------------------------------- geometry */

  /** Solve for the 3x3 homography H (h33 = 1) that maps src[i] -> dst[i] for four point pairs. */
  function homography(src, dst) {
    var A = [];
    var b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i].x, y = src[i].y, u = dst[i].x, v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var n = 8;
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      var tA = A[c]; A[c] = A[piv]; A[piv] = tA;
      var tb = b[c]; b[c] = b[piv]; b[piv] = tb;
      for (var r2 = c + 1; r2 < n; r2++) {
        var f = A[r2][c] / A[c][c];
        for (var k = c; k < n; k++) A[r2][k] -= f * A[c][k];
        b[r2] -= f * b[c];
      }
    }
    var h = new Array(n);
    for (var r3 = n - 1; r3 >= 0; r3--) {
      var s = b[r3];
      for (var k2 = r3 + 1; k2 < n; k2++) s -= A[r3][k2] * h[k2];
      h[r3] = s / A[r3][r3];
    }
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function applyH(H, x, y) {
    var w = H[6] * x + H[7] * y + H[8];
    return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
  }

  /* ------------------------------------------------------------- image helpers (ImageData-like: {data,width,height}) */

  function toGray(img) {
    var n = img.width * img.height;
    var g = new Uint8ClampedArray(n);
    var d = img.data;
    for (var i = 0, p = 0; i < n; i++, p += 4) g[i] = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
    return g;
  }

  function otsu(gray) {
    var hist = new Array(256).fill(0);
    for (var i = 0; i < gray.length; i++) hist[gray[i]]++;
    var total = gray.length, sum = 0;
    for (var t = 0; t < 256; t++) sum += t * hist[t];
    var sumB = 0, wB = 0, best = 0, thr = 128;
    for (var k = 0; k < 256; k++) {
      wB += hist[k];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += k * hist[k];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = k; }
    }
    return thr;
  }

  /** Dark blobs (4-connected) of a grayscale image: [{minx,miny,maxx,maxy,area,cx,cy}]. */
  function darkBlobs(gray, w, h, thr, minArea, maxArea) {
    var seen = new Uint8Array(w * h);
    var out = [];
    var stack = new Int32Array(w * h);
    for (var start = 0; start < w * h; start++) {
      if (seen[start] || gray[start] > thr) continue;
      var sp = 0;
      stack[sp++] = start; seen[start] = 1;
      var minx = w, miny = h, maxx = 0, maxy = 0, area = 0, sx = 0, sy = 0;
      while (sp) {
        var p = stack[--sp];
        var y = (p / w) | 0, x = p - y * w;
        area++; sx += x; sy += y;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && !seen[p - 1] && gray[p - 1] <= thr) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && !seen[p + 1] && gray[p + 1] <= thr) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && !seen[p - w] && gray[p - w] <= thr) { seen[p - w] = 1; stack[sp++] = p - w; }
        if (y < h - 1 && !seen[p + w] && gray[p + w] <= thr) { seen[p + w] = 1; stack[sp++] = p + w; }
      }
      if (area >= minArea && area <= maxArea) out.push({ minx: minx, miny: miny, maxx: maxx, maxy: maxy, area: area, cx: sx / area, cy: sy / area });
    }
    return out;
  }

  /** Wear dark areas down by `iter` pixels on every side: thin printed lines disappear, solid marks stay. */
  function erodeDark(gray, w, h, thr, iter) {
    var cur = new Uint8Array(w * h);
    for (var i = 0; i < cur.length; i++) cur[i] = gray[i] <= thr ? 1 : 0;
    for (var k = 0; k < iter; k++) {
      var nxt = new Uint8Array(w * h);
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var p = y * w + x;
        if (cur[p] && cur[p - 1] && cur[p + 1] && cur[p - w] && cur[p + w]) nxt[p] = 1;
      }
      cur = nxt;
    }
    var out = new Uint8ClampedArray(w * h);
    for (var j = 0; j < out.length; j++) out[j] = cur[j] ? 0 : 255;
    return out;
  }

  /** Blobs that look like a solid square mark: roughly square, nearly filled. */
  function markCandidates(img) {
    var w = img.width, h = img.height;
    var gray = toGray(img);
    var thr = Math.min(otsu(gray), 150);
    var imgArea = w * h;
    /* A mark is about 2% of the picture's width; lines a card prints are a few pixels thick. */
    var iter = Math.max(1, Math.min(3, Math.round(w * 0.022 * 0.08)));
    var eroded = erodeDark(gray, w, h, thr, iter);
    var blobs = darkBlobs(eroded, w, h, 128, Math.max(12, imgArea * 0.00003), imgArea * 0.02);
    return blobs.filter(function (b) {
      var bw = b.maxx - b.minx + 1, bh = b.maxy - b.miny + 1;
      var aspect = bw / bh;
      var fill = b.area / (bw * bh);
      return aspect > 0.6 && aspect < 1.65 && fill > 0.72;
    });
  }

  function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }

  /** Order four points TL, TR, BR, BL. */
  function orderQuad(pts) {
    var sorted = pts.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
    var tl = sorted[0], br = sorted[3];
    var mid = [sorted[1], sorted[2]].sort(function (a, b) { return (a.y - a.x) - (b.y - b.x); });
    return [tl, mid[0], br, mid[1]];   // mid[0] has the smaller y-x: top-right
  }

  /**
   * Choose the four marks among the candidates: the quadrilateral that is convex, large, and whose
   * proportions match the card's (the marks' own rectangle, as measured from the layout).
   */
  function pickQuad(cands, wantAspect) {
    var pts = cands.map(function (b) { return { x: b.cx, y: b.cy, area: b.area }; });
    pts.sort(function (a, b) { return b.area - a.area; });
    pts = pts.slice(0, 14);
    var best = null, bestScore = -1;
    for (var a = 0; a < pts.length; a++) for (var b = a + 1; b < pts.length; b++) for (var c = b + 1; c < pts.length; c++) for (var d = c + 1; d < pts.length; d++) {
      var q = orderQuad([pts[a], pts[b], pts[c], pts[d]]);
      var s1 = cross(q[0], q[1], q[2]), s2 = cross(q[1], q[2], q[3]), s3 = cross(q[2], q[3], q[0]), s4 = cross(q[3], q[0], q[1]);
      if (!(s1 > 0 && s2 > 0 && s3 > 0 && s4 > 0)) continue;
      var top = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y), bot = Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y);
      var lef = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y), rig = Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y);
      var asp = ((top + bot) / 2) / ((lef + rig) / 2);
      var aspErr = Math.abs(Math.log(asp / wantAspect));
      if (aspErr > 0.35) continue;
      var area = Math.abs(s1 + s3) / 2;
      var sizes = [pts[a].area, pts[b].area, pts[c].area, pts[d].area];
      var sizeSpread = Math.max.apply(null, sizes) / Math.max(1, Math.min.apply(null, sizes));
      if (sizeSpread > 6) continue;
      var score = area * (1 - aspErr) / sizeSpread;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best ? best.map(function (p) { return { x: p.x, y: p.y }; }) : null;
  }

  /**
   * Straighten: card coordinates (0..1) -> photo pixels through H, sampled into an output of outW x outH.
   * src is ImageData-like. Returns an ImageData-like object.
   */
  function warpImage(src, H, outW, outH) {
    var out = { width: outW, height: outH, data: new Uint8ClampedArray(outW * outH * 4) };
    var sw = src.width, sh = src.height, sd = src.data, od = out.data;
    for (var y = 0; y < outH; y++) {
      for (var x = 0; x < outW; x++) {
        var p = applyH(H, (x + 0.5) / outW, (y + 0.5) / outH);
        var o = (y * outW + x) * 4;
        var fx = p.x - 0.5, fy = p.y - 0.5;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue; }
        var tx = fx - x0, ty = fy - y0;
        var i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        for (var ch = 0; ch < 3; ch++) {
          od[o + ch] = (sd[i00 + ch] * (1 - tx) + sd[i10 + ch] * tx) * (1 - ty) + (sd[i01 + ch] * (1 - tx) + sd[i11 + ch] * tx) * ty;
        }
        od[o + 3] = 255;
      }
    }
    return out;
  }

  /**
   * Prepare one field for reading: crop, keep ink only, drop the printed rules (long straight dark runs),
   * and return a black-on-white ImageData-like object plus how much ink there was.
   */
  function prepareField(img, rect, pad, dropTop) {
    var W = img.width, H = img.height;
    var x0 = Math.max(0, Math.round(rect.x * W)), y0 = Math.max(0, Math.round(rect.y * H));
    var x1 = Math.min(W, Math.round((rect.x + rect.w) * W)), y1 = Math.min(H, Math.round((rect.y + rect.h) * H));
    var cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
    var inset = pad == null ? 2 : pad;
    var gray = new Uint8ClampedArray(cw * ch);
    for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) {
      var p = ((y0 + y) * W + (x0 + x)) * 4;
      gray[y * cw + x] = (img.data[p] * 299 + img.data[p + 1] * 587 + img.data[p + 2] * 114) / 1000;
    }
    var thr = Math.max(60, Math.min(otsu(gray), 190));
    var ink = new Uint8Array(cw * ch);
    for (var i = 0; i < ink.length; i++) ink[i] = gray[i] <= thr ? 1 : 0;
    /* the border of the cut-out is where the printed box lines are */
    for (var yy = 0; yy < ch; yy++) for (var xx = 0; xx < cw; xx++) {
      if (xx < inset || yy < inset || xx >= cw - inset || yy >= ch - inset) ink[yy * cw + xx] = 0;
    }
    /* The printed rules: a straight line is a few pixels thick and runs most of the way across, but after the
       photo is straightened it can be a pixel or two off, so look at bands of three rows (and columns) together. */
    for (var r0 = 0; r0 < ch; r0++) {
      var covered = 0;
      for (var cx0 = 0; cx0 < cw; cx0++) {
        var hit = 0;
        for (var d0 = -2; d0 <= 2 && !hit; d0++) { var ry0 = r0 + d0; if (ry0 >= 0 && ry0 < ch && ink[ry0 * cw + cx0]) hit = 1; }
        covered += hit;
      }
      /* Only a thin band counts as a rule: a row of handwriting is thicker, so check that the band is thin. */
      if (covered > cw * 0.6) {
        var thick = 0;
        for (var t = Math.max(0, r0 - 3); t <= Math.min(ch - 1, r0 + 3); t++) {
          var rowInk = 0;
          for (var cx1 = 0; cx1 < cw; cx1++) rowInk += ink[t * cw + cx1];
          if (rowInk > cw * 0.45) thick++;
        }
        if (thick <= 4) {
          /* clear the rows of the band that look like a rule (a good part of the width is ink): handwriting rows have far less */
          for (var rr = Math.max(0, r0 - 3); rr <= Math.min(ch - 1, r0 + 3); rr++) {
            var ruleInk = 0;
            for (var cx4 = 0; cx4 < cw; cx4++) ruleInk += ink[rr * cw + cx4];
            if (ruleInk > cw * 0.2) for (var cx2 = 0; cx2 < cw; cx2++) ink[rr * cw + cx2] = 0;
          }
        }
      }
    }
    for (var c0 = 0; c0 < cw; c0++) {
      var vcov = 0;
      for (var cy0 = 0; cy0 < ch; cy0++) {
        var vhit = 0;
        for (var e0 = -2; e0 <= 2 && !vhit; e0++) { var cx3 = c0 + e0; if (cx3 >= 0 && cx3 < cw && ink[cy0 * cw + cx3]) vhit = 1; }
        vcov += vhit;
      }
      if (vcov > ch * 0.7) for (var cc = Math.max(0, c0 - 2); cc <= Math.min(cw - 1, c0 + 2); cc++) for (var cy1 = 0; cy1 < ch; cy1++) ink[cy1 * cw + cc] = 0;
    }
    /* On a line the writing sits low in the cut-out; ink wholly in the top part belongs to the row above. */
    if (dropTop) {
      var seen = new Uint8Array(cw * ch);
      var stk = new Int32Array(cw * ch);
      for (var st0 = 0; st0 < cw * ch; st0++) {
        if (!ink[st0] || seen[st0]) continue;
        var sp = 0, members = [];
        var miny = ch, maxy = 0;
        stk[sp++] = st0; seen[st0] = 1;
        while (sp) {
          var q = stk[--sp];
          members.push(q);
          var qy = (q / cw) | 0, qx = q - qy * cw;
          if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
          if (qx > 0 && ink[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stk[sp++] = q - 1; }
          if (qx < cw - 1 && ink[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stk[sp++] = q + 1; }
          if (qy > 0 && ink[q - cw] && !seen[q - cw]) { seen[q - cw] = 1; stk[sp++] = q - cw; }
          if (qy < ch - 1 && ink[q + cw] && !seen[q + cw]) { seen[q + cw] = 1; stk[sp++] = q + cw; }
        }
        if (maxy < ch * 0.42) for (var m = 0; m < members.length; m++) ink[members[m]] = 0;
      }
    }
    var inkCount = 0;
    var out = { width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) };
    for (var j = 0; j < ink.length; j++) {
      inkCount += ink[j];
      var v = ink[j] ? 0 : 255;
      out.data[j * 4] = out.data[j * 4 + 1] = out.data[j * 4 + 2] = v; out.data[j * 4 + 3] = 255;
    }
    return { image: out, inkRatio: inkCount / (cw * ch) };
  }

  /** How dark a tick box is: 0 (empty paper) .. 1 (filled). */
  function boxDarkness(img, rect) {
    var W = img.width, H = img.height;
    var x0 = Math.round((rect.x + rect.w * 0.2) * W), x1 = Math.round((rect.x + rect.w * 0.8) * W);
    var y0 = Math.round((rect.y + rect.h * 0.2) * H), y1 = Math.round((rect.y + rect.h * 0.8) * H);
    var dark = 0, n = 0;
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
      var p = (y * W + x) * 4;
      var g = (img.data[p] * 299 + img.data[p + 1] * 587 + img.data[p + 2] * 114) / 1000;
      n++; if (g < 140) dark++;
    }
    return n ? dark / n : 0;
  }

  /** Make a number out of what OCR read: digits, one decimal point, optional minus. */
  function cleanNumber(text) {
    var t = String(text || '').replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
    var neg = t.charAt(0) === '-';
    t = t.replace(/-/g, '');
    var parts = t.split('.');
    if (parts.length > 2) t = parts[0] + '.' + parts.slice(1).join('');
    return (neg ? '-' : '') + t;
  }

  /* ------------------------------------------------------------- browser: layout, OCR, review */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var workerPromise = null;
  function getWorker(onProgress) {
    if (workerPromise) return workerPromise;
    workerPromise = (async function () {
      if (!root.Tesseract) await loadScript(VENDOR + 'tesseract.min.js');
      var worker = await root.Tesseract.createWorker('eng', 1, {
        workerPath: VENDOR + 'worker.min.js',
        corePath: VENDOR,
        langPath: VENDOR + 'lang/',
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: function (m) { if (onProgress && m && m.status) onProgress(m); },
      });
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789.-',
        tessedit_pageseg_mode: '7',
        user_defined_dpi: '300',
      });
      return worker;
    })();
    workerPromise.catch(function () { workerPromise = null; });
    return workerPromise;
  }

  function imageDataToCanvas(img) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }

  /** Scale a prepared field up to a comfortable height for the reader, with white margin around it. */
  function readableCanvas(prepared) {
    var img = prepared.image;
    var targetH = 72;
    var scale = Math.max(1, targetH / img.height);
    var src = imageDataToCanvas(img);
    var c = document.createElement('canvas');
    var m = 14;
    c.width = Math.round(img.width * scale) + m * 2; c.height = Math.round(img.height * scale) + m * 2;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, m, m, c.width - m * 2, c.height - m * 2);
    return c;
  }

  var WHITELIST = { number: '0123456789.-', date: '0123456789/-.', time: '0123456789:.', datetime: '0123456789/-.: ' };
  var lastWhitelist = '';
  async function ocrField(worker, prepared, type) {
    if (prepared.inkRatio < 0.004) return { text: '', conf: 100, blank: true };
    var want = WHITELIST[type] || WHITELIST.number;
    if (want !== lastWhitelist) { await worker.setParameters({ tessedit_char_whitelist: want }); lastWhitelist = want; }
    var res = await worker.recognize(readableCanvas(prepared));
    var d = res && res.data ? res.data : {};
    var text = type === 'datetime' ? String(d.text || '').replace(/[oO]/g, '0').replace(/[^0-9\/:.\- ]/g, '').replace(/\s+/g, ' ').trim()
      : type === 'date' || type === 'time' ? String(d.text || '').replace(/[oO]/g, '0').replace(/[^0-9\/:.\-]/g, '') : cleanNumber(d.text);
    return { text: text, conf: Math.round(d.confidence || 0), blank: false };
  }

  /**
   * Measure a card's layout from its printed HTML. The card is laid out in a hidden frame; every element marked
   * data-card-field / data-card-mark / data-card-box is measured against the card's own box (0..1).
   * html: a full document string (the same one that is printed). cardSelector: the card to measure.
   */
  async function measureLayout(html, cardSelector, frameWidthMm, frameHeightMm) {
    var frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    var mm = 96 / 25.4;
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:' + Math.ceil((frameWidthMm || 297) * mm) + 'px;height:' + Math.ceil((frameHeightMm || 210) * mm) + 'px';
    document.body.appendChild(frame);
    try {
      await new Promise(function (resolve) { frame.onload = resolve; frame.srcdoc = html; });
      await new Promise(function (r) { setTimeout(r, 350); });
      var doc = frame.contentDocument;
      var card = doc.querySelector(cardSelector);
      if (!card) throw new Error('The card layout could not be measured');
      var cr = card.getBoundingClientRect();
      var rel = function (el) {
        var r = el.getBoundingClientRect();
        return { x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height, w: r.width / cr.width, h: r.height / cr.height };
      };
      var marks = {};
      card.querySelectorAll('[data-card-mark]').forEach(function (el) { var r = rel(el); marks[el.getAttribute('data-card-mark')] = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
      var fields = [];
      card.querySelectorAll('[data-card-field]').forEach(function (el) {
        var rc = rel(el);
        if (el.tagName === 'TD') { rc = { x: rc.x + rc.w * 0.04, y: rc.y + rc.h * 0.1, w: rc.w * 0.92, h: rc.h * 0.8 }; }
        /* writing on a line sits on it and rises above it: cut out more above than the printed line box */
        else if (el.getAttribute('data-card-grow') === 'up') { rc = { x: rc.x, y: rc.y - rc.h * 0.8, w: rc.w, h: rc.h * 1.8 }; }
        fields.push({ key: el.getAttribute('data-card-field'), type: el.getAttribute('data-card-type') || 'number', label: el.getAttribute('data-card-label') || '', group: el.getAttribute('data-card-group') || '', rect: rc, grow: el.getAttribute('data-card-grow') === 'up' });
      });
      var boxes = [];
      card.querySelectorAll('[data-card-box]').forEach(function (el) { boxes.push({ key: el.getAttribute('data-card-box'), label: el.getAttribute('data-card-label') || '', group: el.getAttribute('data-card-group') || '', rect: rel(el) }); });
      return { aspect: cr.width / cr.height, widthMm: cr.width / mm, heightMm: cr.height / mm, marks: marks, fields: fields, boxes: boxes };
    } finally { frame.remove(); }
  }

  function photoToImageData(source, maxSide) {
    return new Promise(function (resolve, reject) {
      var done = function (bmp, w, h) {
        var scale = Math.min(1, (maxSide || 2200) / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        var ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        resolve({ canvas: c, image: ctx.getImageData(0, 0, c.width, c.height) });
      };
      if (source instanceof HTMLCanvasElement) return done(source, source.width, source.height);
      if (source instanceof HTMLImageElement) return done(source, source.naturalWidth, source.naturalHeight);
      var url = URL.createObjectURL(source);
      var im = new Image();
      im.onload = function () { try { done(im, im.naturalWidth, im.naturalHeight); } finally { URL.revokeObjectURL(url); } };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened')); };
      im.src = url;
    });
  }

  /** Corner points -> straightened card as ImageData-like, 1000 px wide. */
  function straighten(photo, corners, layout) {
    var m = layout.marks;
    var dst = [m.tl, m.tr, m.br, m.bl];
    /* card (0..1) -> photo: from the four mark positions on the card to where they are in the photo */
    var H = homography(dst, corners);
    if (!H) return null;
    var outW = 1000, outH = Math.round(1000 / layout.aspect);
    return warpImage(photo.image, H, outW, outH);
  }

  /** Find the card's four marks in a photo. Returns four points in photo pixels, or null. */
  function findCorners(photo, layout) {
    var m = layout.marks;
    if (!m.tl || !m.tr || !m.br || !m.bl) return null;
    var wantAspect = ((m.tr.x - m.tl.x) + (m.br.x - m.bl.x)) / 2 * layout.aspect / (((m.bl.y - m.tl.y) + (m.br.y - m.tr.y)) / 2);
    var cands = markCandidates(photo.image);
    return pickQuad(cands, wantAspect);
  }

  /** Read every field of a straightened card. Returns [{key,label,group,type,text,conf,blank,crop}] and the boxes' state. */
  async function readFields(card, layout, onProgress) {
    var worker = await getWorker(onProgress);
    var rows = [];
    for (var i = 0; i < layout.fields.length; i++) {
      var f = layout.fields[i];
      if (onProgress) onProgress({ status: 'reading', index: i, total: layout.fields.length, label: f.label });
      var prep = prepareField(card, f.rect, 3, f.grow);
      var r = f.type === 'text' ? { text: '', conf: 0, blank: prep.inkRatio < 0.004 } : await ocrField(worker, prep, f.type);
      rows.push({ key: f.key, label: f.label, group: f.group, type: f.type, text: r.text, conf: r.conf, blank: r.blank, crop: imageDataToCanvas(prep.image) });
    }
    var boxes = layout.boxes.map(function (b) { return { key: b.key, label: b.label, group: b.group, dark: boxDarkness(card, b.rect) }; });
    return { rows: rows, boxes: boxes };
  }

  /**
   * The whole read: photo -> corners -> straightened card -> fields. If the marks are not found, `needCorners` is true
   * and the caller can ask the person to place the corners (see pickCornersByHand) and call readWithCorners.
   */
  async function readPhoto(file, layout, onProgress) {
    var photo = await photoToImageData(file, 2200);
    var corners = findCorners(photo, layout);
    return { photo: photo, corners: corners, needCorners: !corners };
  }

  async function readWithCorners(photo, corners, layout, onProgress) {
    var card = straighten(photo, corners, layout);
    if (!card) throw new Error('The card could not be straightened from those corners');
    var res = await readFields(card, layout, onProgress);
    res.card = card;
    return res;
  }


  /* ------------------------------------------------------------- the screen: photo, corners, review */

  var CSS = '.ccr-ov{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:10px}' +
    '.ccr-dlg{background:var(--panel,#122a35);color:var(--text,#e8eef0);border:1px solid rgba(255,255,255,.18);border-radius:10px;width:min(980px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;font-family:inherit}' +
    '.ccr-hd{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.14);display:flex;gap:10px;align-items:center;justify-content:space-between}.ccr-hd h2{margin:0;font-size:17px}' +
    '.ccr-bd{padding:12px 14px;overflow:auto;flex:1 1 auto}.ccr-ft{padding:10px 14px;border-top:1px solid rgba(255,255,255,.14);display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}' +
    '.ccr-btn{font:inherit;font-weight:600;padding:9px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;min-height:42px;cursor:pointer}.ccr-btn.pri{background:#c99a53;color:#1a1208;border-color:#c99a53}' +
    '.ccr-hint{font-size:13px;opacity:.85;margin:6px 0}.ccr-grp{margin:10px 0 2px;font-weight:700;font-size:14px;border-top:1px solid rgba(255,255,255,.12);padding-top:8px}' +
    '.ccr-row{display:grid;grid-template-columns:minmax(90px,1fr) minmax(110px,170px) minmax(110px,170px) 18px;gap:8px;align-items:center;margin:3px 0}.ccr-row canvas{max-width:100%;height:34px;object-fit:contain;background:#fff;border-radius:3px;justify-self:start}' +
    '.ccr-row input[type=text]{font:inherit;font-size:16px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.25);color:inherit;width:100%;min-width:0}' +
    '.ccr-row input.low{border-color:#d9822b;background:rgba(217,130,43,.18)}.ccr-row input.blank{opacity:.7}.ccr-dot{width:10px;height:10px;border-radius:50%;background:#2a9d8f}.ccr-dot.low{background:#d9822b}.ccr-dot.blank{background:#667}' +
    '.ccr-meth{display:flex;gap:14px;margin:2px 0 4px;font-size:14px}.ccr-meth label{display:flex;gap:6px;align-items:center}.ccr-stage{position:relative;touch-action:none;margin:0 auto;max-width:100%}.ccr-stage canvas{display:block;max-width:100%;height:auto}' +
    '.ccr-h{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #c99a53;background:rgba(201,154,83,.28);touch-action:none}.ccr-bar{height:8px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden}.ccr-bar i{display:block;height:100%;background:#c99a53;width:0}' +
    '@media (max-width:640px){.ccr-row{grid-template-columns:1fr 110px 14px}.ccr-row canvas{grid-column:1/-1}}';

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  /** Four draggable corners over the photo. Resolves with the corners in photo pixels, or null if cancelled. */
  function pickCornersByHand(dlgBody, photo, start) {
    return new Promise(function (resolve) {
      dlgBody.innerHTML = '';
      dlgBody.appendChild(el('div', { class: 'ccr-hint', text: 'The card\'s corner marks were not found. Drag the four circles onto the four black corner marks of the card, then press Read the card.' }));
      var stage = el('div', { class: 'ccr-stage' });
      var cv = photo.canvas;
      var view = document.createElement('canvas');
      view.width = cv.width; view.height = cv.height;
      view.getContext('2d').drawImage(cv, 0, 0);
      stage.appendChild(view);
      var w = cv.width, h = cv.height;
      var pts = (start && start.length === 4) ? start.map(function (p) { return { x: p.x, y: p.y }; })
        : [{ x: w * 0.12, y: h * 0.1 }, { x: w * 0.88, y: h * 0.1 }, { x: w * 0.88, y: h * 0.9 }, { x: w * 0.12, y: h * 0.9 }];
      var handles = pts.map(function (p, i) {
        var hnd = el('div', { class: 'ccr-h', 'aria-label': 'Corner ' + (i + 1) });
        stage.appendChild(hnd);
        var place = function () { hnd.style.left = (p.x / w * 100) + '%'; hnd.style.top = (p.y / h * 100) + '%'; };
        place();
        hnd.addEventListener('pointerdown', function (ev) {
          ev.preventDefault(); hnd.setPointerCapture(ev.pointerId);
          var move = function (e2) { var r = view.getBoundingClientRect(); p.x = Math.max(0, Math.min(w, (e2.clientX - r.left) / r.width * w)); p.y = Math.max(0, Math.min(h, (e2.clientY - r.top) / r.height * h)); place(); };
          var up = function () { hnd.removeEventListener('pointermove', move); hnd.removeEventListener('pointerup', up); };
          hnd.addEventListener('pointermove', move); hnd.addEventListener('pointerup', up);
        });
        return hnd;
      });
      dlgBody.appendChild(stage);
      var foot = dlgBody.parentNode.querySelector('.ccr-ft');
      foot.innerHTML = '';
      var go = el('button', { class: 'ccr-btn pri', type: 'button', text: 'Read the card' });
      var no = el('button', { class: 'ccr-btn', type: 'button', text: 'Cancel' });
      go.onclick = function () { resolve(orderQuad(pts)); };
      no.onclick = function () { resolve(null); };
      foot.appendChild(no); foot.appendChild(go);
    });
  }

  /**
   * The whole flow in a dialog.
   * opts: { title, hint, layout (a layout or a function returning a promise of one), apply(result) }
   * result passed to apply: { fields: {key: text}, boxes: {key: true/false}, rows, boxesRaw }
   */
  function capture(opts) {
    if (!document.getElementById('ccr-css')) { var st = document.createElement('style'); st.id = 'ccr-css'; st.textContent = CSS; document.head.appendChild(st); }
    return new Promise(function (resolve) {
      var ov = el('div', { class: 'ccr-ov', role: 'dialog', 'aria-modal': 'true' });
      var dlg = el('div', { class: 'ccr-dlg' });
      var title = el('h2', { text: opts.title || 'Capture from photo' });
      var x = el('button', { class: 'ccr-btn', type: 'button', text: 'Close', 'aria-label': 'Close' });
      var hd = el('div', { class: 'ccr-hd' }, [title, x]);
      var bd = el('div', { class: 'ccr-bd' });
      var ft = el('div', { class: 'ccr-ft' });
      dlg.appendChild(hd); dlg.appendChild(bd); dlg.appendChild(ft); ov.appendChild(dlg);
      document.body.appendChild(ov);
      var closed = false;
      var close = function (val) { if (closed) return; closed = true; ov.remove(); resolve(val || null); };
      x.onclick = function () { close(null); };

      var layoutP = typeof opts.layout === 'function' ? opts.layout() : Promise.resolve(opts.layout);
      var message = function (t) { bd.innerHTML = ''; bd.appendChild(el('div', { class: 'ccr-hint', text: t })); };

      var chooseStep = function () {
        bd.innerHTML = ''; ft.innerHTML = '';
        bd.appendChild(el('div', { class: 'ccr-hint', text: opts.hint || 'Lay the card flat in good light with all four black corner marks in the picture. Fill the frame, and keep the phone steady.' }));
        bd.appendChild(el('div', { class: 'ccr-hint', text: 'The photo is read on this device. Nothing is sent anywhere, and nothing is filled in until you have checked it.' }));
        var file = el('input', { type: 'file', accept: 'image/*', hidden: 'hidden', 'data-ccr-file': '1' });
        file.onchange = function () { if (file.files && file.files[0]) process(file.files[0]); };
        var take = el('button', { class: 'ccr-btn pri', type: 'button', text: 'Take photo' });
        if (opts.previous) {
          var again = el('button', { class: 'ccr-btn', type: 'button', text: 'Use the card read earlier', 'data-ccr-previous': '1' });
          again.onclick = function () { reviewStep(opts.previous); };
          ft.appendChild(again);
        }
        var pick = el('button', { class: 'ccr-btn', type: 'button', text: 'Choose picture' });
        pick.onclick = function () { file.click(); };
        take.onclick = async function () {
          if (!root.ChengCamera || !root.ChengCamera.takePicture) { file.click(); return; }
          try { var f = await root.ChengCamera.takePicture({ title: opts.title || 'Card', basename: 'card', preferSystem: /Android/i.test(navigator.userAgent || '') }); if (f) process(f); }
          catch (e) { if (!e || String(e.message) !== 'cancelled') file.click(); }
        };
        ft.appendChild(file); ft.appendChild(pick); ft.appendChild(take);
      };

      var process = async function (fileOrBlob) {
        try {
          ft.innerHTML = '';
          message('Looking for the card…');
          var layout = await layoutP;
          var read = await readPhoto(fileOrBlob, layout);
          var corners = read.corners;
          if (!corners) {
            corners = await pickCornersByHand(bd, read.photo, null);
            if (!corners) { chooseStep(); return; }
          }
          message('Reading…');
          var bar = el('div', { class: 'ccr-bar' }, [el('i')]);
          bd.appendChild(bar);
          var result = await readWithCorners(read.photo, corners, layout, function (m) {
            if (m && m.status === 'reading') { bar.firstChild.style.width = Math.round((m.index + 1) / m.total * 100) + '%'; }
          });
          reviewStep(result, layout, read);
        } catch (e) {
          bd.innerHTML = ''; bd.appendChild(el('div', { class: 'ccr-hint', text: 'The card could not be read: ' + ((e && e.message) || e) }));
          ft.innerHTML = ''; var again = el('button', { class: 'ccr-btn pri', type: 'button', text: 'Try another photo' }); again.onclick = chooseStep; ft.appendChild(again);
        }
      };

      var reviewStep = function (result, layout, read) {
        bd.innerHTML = ''; ft.innerHTML = '';
        if (opts.remember && read) opts.remember(result);
        bd.appendChild(el('div', { class: 'ccr-hint', text: 'Check every value against the picture beside it. Orange ones were hard to read. Empty boxes stay empty. Nothing is filled in until you press Use these values.' }));
        var inputs = {};
        var boxInputs = {};
        var groups = [];
        var byGroup = {};
        result.rows.forEach(function (r) { var g = r.group || ''; if (!byGroup[g]) { byGroup[g] = { name: g, rows: [], boxes: [] }; groups.push(byGroup[g]); } byGroup[g].rows.push(r); });
        result.boxes.forEach(function (b) { var g = b.group || ''; if (!byGroup[g]) { byGroup[g] = { name: g, rows: [], boxes: [] }; groups.push(byGroup[g]); } byGroup[g].boxes.push(b); });
        groups.forEach(function (g) {
          if (g.name) bd.appendChild(el('div', { class: 'ccr-grp', text: g.name }));
          if (g.boxes.length) {
            var meth = el('div', { class: 'ccr-meth' });
            g.boxes.forEach(function (b) {
              var cb = el('input', { type: 'checkbox', 'data-ccr-box': b.key });
              cb.checked = b.dark > 0.22;
              boxInputs[b.key] = cb;
              meth.appendChild(el('label', {}, [cb, el('span', { text: b.label })]));
            });
            bd.appendChild(meth);
          }
          g.rows.forEach(function (r) {
            var rg = opts.ranges && opts.ranges[r.key];
            var rv = parseFloat(r.text);
            var outside = !!(rg && r.text !== '' && Number.isFinite(rv) && (rv < rg[0] || rv > rg[1]));
            var low = !r.blank && r.type !== 'text' && (r.conf < 70 || outside);
            var inp = el('input', { type: 'text', inputmode: r.type === 'time' || r.type === 'date' ? 'text' : 'decimal', 'data-ccr-field': r.key, 'aria-label': r.label });
            inp.value = r.text || '';
            if (outside) inp.title = 'Outside the usual range (' + rg[0] + ' to ' + rg[1] + '): check the decimal point.';
            if (low) inp.className = 'low'; else if (r.blank) inp.className = 'blank';
            /* a figure typed over in the review is checked again the same way */
            inp.addEventListener('input', function () {
              var v = parseFloat(inp.value);
              var bad = !!(rg && inp.value !== '' && Number.isFinite(v) && (v < rg[0] || v > rg[1]));
              inp.className = bad ? 'low' : (inp.value === '' ? 'blank' : '');
            });
            inputs[r.key] = inp;
            var crop = r.crop; crop.style.height = '34px';
            bd.appendChild(el('div', { class: 'ccr-row' }, [el('span', { text: r.label }), crop, inp, el('i', { class: 'ccr-dot' + (low ? ' low' : r.blank ? ' blank' : '') })]));
          });
        });
        var retake = el('button', { class: 'ccr-btn', type: 'button', text: 'Retake' });
        var use = el('button', { class: 'ccr-btn pri', type: 'button', text: 'Use these values', 'data-ccr-use': '1' });
        retake.onclick = chooseStep;
        use.onclick = async function () {
          var fields = {}, boxes = {};
          Object.keys(inputs).forEach(function (k) { fields[k] = inputs[k].value.trim(); });
          Object.keys(boxInputs).forEach(function (k) { boxes[k] = !!boxInputs[k].checked; });
          try {
            var said = opts.apply ? await opts.apply({ fields: fields, boxes: boxes }) : null;
            if (typeof said === 'string' && said) {
              /* Say what was done, in this dialog, until the person has read it. */
              bd.innerHTML = ''; ft.innerHTML = '';
              bd.appendChild(el('div', { class: 'ccr-hint', 'data-ccr-done': '1', text: said }));
              var done = el('button', { class: 'ccr-btn pri', type: 'button', text: 'Done' });
              done.onclick = function () { close({ fields: fields, boxes: boxes }); };
              ft.appendChild(done);
            } else close({ fields: fields, boxes: boxes });
          } catch (e) { bd.insertBefore(el('div', { class: 'ccr-hint', style: 'color:#ff9d7a', text: (e && e.message) || 'Could not fill in the values' }), bd.firstChild); }
        };
        ft.appendChild(retake); ft.appendChild(use);
      };

      chooseStep();
    });
  }

  var api = {
    homography: homography, applyH: applyH, toGray: toGray, otsu: otsu, darkBlobs: darkBlobs, erodeDark: erodeDark, markCandidates: markCandidates,
    orderQuad: orderQuad, pickQuad: pickQuad, warpImage: warpImage, prepareField: prepareField, boxDarkness: boxDarkness, cleanNumber: cleanNumber,
    measureLayout: measureLayout, photoToImageData: photoToImageData, findCorners: findCorners, straighten: straighten,
    readPhoto: readPhoto, readWithCorners: readWithCorners, readFields: readFields, getWorker: getWorker, imageDataToCanvas: imageDataToCanvas,
    pickCornersByHand: pickCornersByHand, capture: capture,
    VENDOR: VENDOR,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChengCardReader = api;
})(typeof window !== 'undefined' ? window : globalThis);
