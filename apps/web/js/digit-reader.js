/**
 * Handwritten numbers, read on the device.
 *
 * Tesseract is built for print and reads a hand-written 29 or 317 poorly. This reads the written digits with a small
 * network (two convolution layers, trained on MNIST with shifted, slanted, thick and thin copies; the weights are
 * vendor/ocr/digit-net.js) after cutting the field into characters: connected strokes are joined into one digit,
 * a joined pair is split where the ink is thinnest, a small mark low in the field is a decimal point and a flat
 * one in the middle a minus.
 *
 * Input is a field as ink: ink[i] = 1 for dark, width cw, height ch. Pure functions, no DOM, so they are tested in Node.
 */
(function (root) {
  'use strict';

  var NET = null;

  function decodeB64(b64) {
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Float32Array(u.buffer);
  }

  /** net: { w1,b1,w2,b2,w3,b3,w4,b4 } as base64 float32 strings or Float32Arrays. */
  function setNet(net) {
    var out = {};
    ['w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4'].forEach(function (k) { out[k] = typeof net[k] === 'string' ? decodeB64(net[k]) : net[k]; });
    NET = out;
  }
  function hasNet() { return !!NET; }

  /** 28x28 float image (0..1, ink = 1) -> probabilities of the ten digits. */
  function classify(img) {
    var n = NET;
    var c1 = new Float32Array(8 * 24 * 24), p1 = new Float32Array(8 * 12 * 12);
    var f, y, x, ky, kx, s;
    for (f = 0; f < 8; f++) {
      for (y = 0; y < 24; y++) for (x = 0; x < 24; x++) {
        s = n.b1[f];
        for (ky = 0; ky < 5; ky++) for (kx = 0; kx < 5; kx++) s += n.w1[f * 25 + ky * 5 + kx] * img[(y + ky) * 28 + x + kx];
        c1[(f * 24 + y) * 24 + x] = s > 0 ? s : 0;
      }
      for (y = 0; y < 12; y++) for (x = 0; x < 12; x++) {
        var a = c1[(f * 24 + 2 * y) * 24 + 2 * x], b = c1[(f * 24 + 2 * y) * 24 + 2 * x + 1];
        var c = c1[(f * 24 + 2 * y + 1) * 24 + 2 * x], d = c1[(f * 24 + 2 * y + 1) * 24 + 2 * x + 1];
        p1[(f * 12 + y) * 12 + x] = Math.max(a, b, c, d);
      }
    }
    var c2 = new Float32Array(16 * 8 * 8), flat = new Float32Array(256);
    var g;
    for (g = 0; g < 16; g++) {
      for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
        s = n.b2[g];
        for (f = 0; f < 8; f++) for (ky = 0; ky < 5; ky++) for (kx = 0; kx < 5; kx++) s += n.w2[g * 200 + f * 25 + ky * 5 + kx] * p1[(f * 12 + y + ky) * 12 + x + kx];
        c2[(g * 8 + y) * 8 + x] = s > 0 ? s : 0;
      }
      for (y = 0; y < 4; y++) for (x = 0; x < 4; x++) {
        flat[g * 16 + y * 4 + x] = Math.max(c2[(g * 8 + 2 * y) * 8 + 2 * x], c2[(g * 8 + 2 * y) * 8 + 2 * x + 1], c2[(g * 8 + 2 * y + 1) * 8 + 2 * x], c2[(g * 8 + 2 * y + 1) * 8 + 2 * x + 1]);
      }
    }
    var h = new Float32Array(64), j, i;
    for (j = 0; j < 64; j++) {
      s = n.b3[j];
      for (i = 0; i < 256; i++) s += flat[i] * n.w3[i * 64 + j];
      h[j] = s > 0 ? s : 0;
    }
    var o = new Float32Array(10), mx = -1e9;
    for (var k = 0; k < 10; k++) {
      s = n.b4[k];
      for (j = 0; j < 64; j++) s += h[j] * n.w4[j * 10 + k];
      o[k] = s; if (s > mx) mx = s;
    }
    var sum = 0;
    for (k = 0; k < 10; k++) { o[k] = Math.exp(o[k] - mx); sum += o[k]; }
    for (k = 0; k < 10; k++) o[k] /= sum;
    return o;
  }

  /** Average-pool resize of a float image (sw x sh) to (dw x dh). */
  function resizeAvg(src, sw, sh, dw, dh) {
    var out = new Float32Array(dw * dh);
    for (var y = 0; y < dh; y++) {
      var y0 = y * sh / dh, y1 = (y + 1) * sh / dh;
      for (var x = 0; x < dw; x++) {
        var x0 = x * sw / dw, x1 = (x + 1) * sw / dw;
        var sum = 0, wsum = 0;
        for (var yy = Math.floor(y0); yy < Math.ceil(y1) && yy < sh; yy++) {
          var wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
          for (var xx = Math.floor(x0); xx < Math.ceil(x1) && xx < sw; xx++) {
            var wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
            sum += src[yy * sw + xx] * wx * wy; wsum += wx * wy;
          }
        }
        out[y * dw + x] = wsum ? sum / wsum : 0;
      }
    }
    return out;
  }

  /** One character's ink (bbox of a cut-out) -> a 28x28 image the way MNIST is made: 20 px box, centred by mass. */
  function toMnist(ink, cw, bx0, by0, bx1, by1) {
    var w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    var src = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) src[y * w + x] = ink[(by0 + y) * cw + bx0 + x] ? 1 : 0;
    /* the strokes of a hand are thin next to the box they are scaled into; a stroke about 2 px wide at 20 px is what the net knows */
    var scale = 20 / Math.max(w, h);
    var dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
    var small = resizeAvg(src, w, h, dw, dh);
    var mx = 0;
    for (var i = 0; i < small.length; i++) if (small[i] > mx) mx = small[i];
    if (mx > 0) for (var i2 = 0; i2 < small.length; i2++) small[i2] = Math.min(1, small[i2] / mx * 1.25);
    var sum = 0, cx = 0, cy = 0;
    for (var yy = 0; yy < dh; yy++) for (var xx = 0; xx < dw; xx++) { var v = small[yy * dw + xx]; sum += v; cx += v * xx; cy += v * yy; }
    cx = sum ? cx / sum : dw / 2; cy = sum ? cy / sum : dh / 2;
    var ox = Math.round(14 - cx), oy = Math.round(14 - cy);
    var out = new Float32Array(784);
    for (var y2 = 0; y2 < dh; y2++) for (var x2 = 0; x2 < dw; x2++) {
      var tx = x2 + ox, ty = y2 + oy;
      if (tx >= 0 && tx < 28 && ty >= 0 && ty < 28) out[ty * 28 + tx] = small[y2 * dw + x2];
    }
    return out;
  }

  /* ------------------------------------------------------------- cutting a field into characters */

  /** 8-connected components: [{x0,y0,x1,y1,area,px:[idx]}] */
  function components(ink, cw, ch) {
    var seen = new Uint8Array(cw * ch), out = [], stack = [];
    for (var s = 0; s < cw * ch; s++) {
      if (!ink[s] || seen[s]) continue;
      var comp = { x0: cw, y0: ch, x1: 0, y1: 0, area: 0, px: [] };
      stack.push(s); seen[s] = 1;
      while (stack.length) {
        var p = stack.pop();
        var y = (p / cw) | 0, x = p - y * cw;
        comp.px.push(p); comp.area++;
        if (x < comp.x0) comp.x0 = x; if (x > comp.x1) comp.x1 = x; if (y < comp.y0) comp.y0 = y; if (y > comp.y1) comp.y1 = y;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          var q = ny * cw + nx;
          if (ink[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      out.push(comp);
    }
    return out;
  }

  /** Split a joined pair of digits where the ink is thinnest near the middle. Returns the x of the cut, or -1. */
  function splitX(ink, cw, g) {
    var w = g.x1 - g.x0 + 1;
    if (w < 6) return -1;
    var col = new Array(w).fill(0);
    g.px.forEach(function (p) { col[(p % cw) - g.x0]++; });
    var lo = Math.floor(w * 0.3), hi = Math.ceil(w * 0.7), best = -1, bv = 1e9;
    for (var i = lo; i <= hi && i < w; i++) {
      var v = col[i] + 0.35 * ((i > 0 ? col[i - 1] : 0) + (i < w - 1 ? col[i + 1] : 0));
      if (v < bv) { bv = v; best = i; }
    }
    return best < 0 ? -1 : g.x0 + best;
  }

  function groupOf(comps) {
    var g = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, area: 0, px: [] };
    comps.forEach(function (c) { g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0); g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1); g.area += c.area; g.px = g.px.concat(c.px); });
    return g;
  }

  /** Cut a field into its characters: [{kind:'digit'|'dot'|'minus', box, img (28x28, digits)}], left to right. */
  function segmentNumber(ink, cw, ch, allowSlash) {
    var comps = components(ink, cw, ch).filter(function (c) {
      var w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
      /* a thin sliver along the edge is a bit of the printed box, not writing */
      if (h <= 3 && w >= cw * 0.25 && (c.y0 <= 4 || c.y1 >= ch - 5)) return false;
      if (w <= 3 && h >= ch * 0.6 && (c.x0 <= 4 || c.x1 >= cw - 5)) return false;
      return c.area >= 3;
    });
    if (!comps.length) return [];
    var Hd = 0, bigArea = 0;
    comps.forEach(function (c) { Hd = Math.max(Hd, c.y1 - c.y0 + 1); bigArea = Math.max(bigArea, c.area); });
    /* specks: a few pixels of the box line above or beside the field, or a stray dot, are not characters. A decimal
       point is small too, but it sits low in the field and is not at its edge. */
    comps = comps.filter(function (c) {
      var h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
      if (c.area < bigArea * 0.04 && (c.y0 <= 2 || c.x0 <= 2 || c.x1 >= cw - 3)) return false;
      if (c.area < bigArea * 0.02 && !(c.area >= 3 && c.y1 >= ch * 0.55 && h <= Hd * 0.35 && w <= Hd * 0.4)) return false;   // a small point low in the field may be a decimal point
      if (h <= 4 && w >= Hd * 1.2) return false;   // a long thin line: a piece of a printed rule, whatever height it is at
      /* a piece of the neighbouring row's writing poking over the box line: it touches the top or bottom edge and is short */
      if ((c.y0 <= 1 || c.y1 >= ch - 2) && h < Hd * 0.7 && w < Hd * 0.8) return false;
      if (h < Hd * 0.3 && w < Hd * 0.4 && c.y1 < ch * 0.5) return false;   // a small mark high in the field
      return true;
    });
    if (!comps.length) return [];
    /* join strokes that sit one above the other (a 4, a 5 with its bar, a 7 with a crossbar) */
    comps.sort(function (a, b) { return a.x0 - b.x0; });
    var groups = [];
    comps.forEach(function (c) {
      var small = (c.y1 - c.y0 + 1) < Hd * 0.3 && (c.x1 - c.x0 + 1) < Hd * 0.35;
      for (var i = groups.length - 1; i >= 0; i--) {
        var g = groups[i];
        var ov = Math.min(g.x1, c.x1) - Math.max(g.x0, c.x0) + 1;
        var minW = Math.min(g.x1 - g.x0 + 1, c.x1 - c.x0 + 1);
        /* a dot low in the field is a decimal point, not part of the digit beside it, unless it sits inside the digit's box */
        if (ov > 0 && ov >= (small ? 0.9 : 0.3) * minW && !(small && c.y0 > g.y0 + (g.y1 - g.y0) * 0.75 && c.x0 > g.x1 - 1)) {
          groups[i] = groupOf([g, c]); return;
        }
        /* the two halves of an open 0 or 6 or 8: close together and, joined, no wider than one digit */
        var gap = c.x0 - g.x1 - 1;
        if (gap <= Hd * 0.08 && (c.x1 - g.x0 + 1) <= Hd * 0.75 && (g.x1 - g.x0 + 1) < Hd * 0.45 && (c.x1 - c.x0 + 1) < Hd * 0.45 && !small) {
          groups[i] = groupOf([g, c]); return;
        }
        break;
      }
      groups.push(groupOf([c]));
    });
    /* Two neighbouring pieces that, put together, read as one digit with more confidence than either alone are one
       digit written in two strokes (an open 0, a 4, a 5): let the network judge, when it is loaded. */
    if (NET) {
      var best = function (gp) { var pr = classify(toMnist(ink, cw, gp.x0, gp.y0, gp.x1, gp.y1)); var m = 0; for (var q = 0; q < 10; q++) if (pr[q] > m) m = pr[q]; return m; };
      groups.sort(function (a, b) { return a.x0 - b.x0; });
      for (var gi = 0; gi + 1 < groups.length;) {
        var ga = groups[gi], gb = groups[gi + 1];
        var gap2 = gb.x0 - ga.x1 - 1;
        var both = groupOf([ga, gb]);
        var tall = (both.y1 - both.y0 + 1) >= Hd * 0.6;
        if (tall && gap2 <= Hd * 0.4 && (both.x1 - both.x0 + 1) <= Hd * 1.3) {
          var pm = best(both), pa = best(ga), pb = best(gb);
          if (pm >= 0.85 && pm > Math.min(pa, pb) + 0.1) { groups.splice(gi, 2, both); continue; }
        }
        gi++;
      }
    }
    /* a group much wider than tall is two digits that touch */
    var chars = [];
    var queue = groups.slice();
    var guard = 0;
    while (queue.length && guard++ < 40) {
      var g2 = queue.shift();
      var w2 = g2.x1 - g2.x0 + 1, h2 = g2.y1 - g2.y0 + 1;
      /* wide handwriting (a round 0, a spread 2) is one digit: only a group the network does not recognise as one digit,
         or one far wider than tall, is two that touch */
      var tooWide = w2 > h2 * 1.6;
      if (!tooWide && w2 > h2 * 0.95 && NET) {
        var pr1 = classify(toMnist(ink, cw, g2.x0, g2.y0, g2.x1, g2.y1)), mx1 = 0;
        for (var q1 = 0; q1 < 10; q1++) if (pr1[q1] > mx1) mx1 = pr1[q1];
        if (mx1 >= 0.9) { chars.push(g2); continue; }
      }
      if (h2 > Hd * 0.55 && w2 > h2 * 0.95) {
        var cut = splitX(ink, cw, g2);
        if (cut > g2.x0 + 2 && cut < g2.x1 - 2) {
          var left = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, area: 0, px: [] }, right = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, area: 0, px: [] };
          g2.px.forEach(function (p) {
            var x = p % cw, y = (p / cw) | 0, t = x < cut ? left : right;
            t.x0 = Math.min(t.x0, x); t.x1 = Math.max(t.x1, x); t.y0 = Math.min(t.y0, y); t.y1 = Math.max(t.y1, y); t.area++; t.px.push(p);
          });
          if (left.area && right.area) { queue.unshift(right); queue.unshift(left); continue; }
        }
      }
      chars.push(g2);
    }
    chars.sort(function (a, b) { return a.x0 - b.x0; });
    var bottoms = chars.filter(function (o) { return (o.y1 - o.y0 + 1) >= Hd * 0.6; }).map(function (o) { return o.y1; }).sort(function (a, b) { return a - b; });
    var baseline = bottoms.length ? bottoms[bottoms.length >> 1] : ch;
    var out = [];
    chars.forEach(function (g) {
      var w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
      var cyRel = ((g.y0 + g.y1) / 2) / ch;
      var box = [g.x0, g.y0, g.x1, g.y1];
      if (h <= Hd * 0.4 && w <= Hd * 0.5 && g.y1 >= baseline - Hd * 0.3 && g.y0 >= baseline - Hd * 0.55) { if (g.area >= Math.max(5, 0.012 * Hd * Hd)) out.push({ kind: 'dot', box: box }); return; }
      if (h <= Hd * 0.25 && w >= Hd * 0.3 && cyRel > 0.25 && cyRel < 0.75) { out.push({ kind: 'minus', box: box }); return; }
      if (h < Hd * 0.5) return;   // a small mark that is neither a point nor a minus: part of the printed label, not a digit
      /* a slash (only where the field may hold one): one narrow stroke that leans right, or runs well above and below
         the digits beside it */
      if (allowSlash && h >= Hd * 0.85 && w <= h * 0.75) {
        var tx = 0, tn = 0, bx = 0, bn = 0;
        g.px.forEach(function (p) { var yy = ((p / cw) | 0) - g.y0, xx = (p % cw); if (yy < h * 0.3) { tx += xx; tn++; } else if (yy > h * 0.7) { bx += xx; bn++; } });
        var lean = tn && bn ? (tx / tn - bx / bn) / h : 0;
        var others = chars.filter(function (o) { return o !== g; }).map(function (o) { return o.y1 - o.y0 + 1; }).sort(function (a, b) { return a - b; });
        var med = others.length ? others[others.length >> 1] : h;
        /* or a narrow bar that stands clear of the digits on both sides: the space a hand leaves round a separator */
        var like = chars.filter(function (o) { return (o.y1 - o.y0 + 1) >= Hd * 0.5; });   // flat marks are not neighbours
        var ci = like.indexOf(g), pv = like[ci - 1], nx = like[ci + 1];
        var gaps = [];
        for (var gq = 0; gq + 1 < like.length; gq++) gaps.push(like[gq + 1].x0 - like[gq].x1 - 1);
        gaps.sort(function (a, b) { return a - b; });
        var medGap = gaps.length ? gaps[gaps.length >> 1] : 0;
        var clear = pv && nx && w <= h * 0.3 && (g.x0 - pv.x1 - 1) >= Math.max(Hd * 0.35, medGap * 1.8) && (nx.x0 - g.x1 - 1) >= Math.max(Hd * 0.2, medGap * 1.2);
        var thin = g.area <= w * h * 0.5;
        if ((thin && (lean > 0.22 || (h > med * 1.18 && lean > 0.05 && others.length >= 2))) || clear) { out.push({ kind: 'slash', box: box }); return; }
      }
      out.push({ kind: 'digit', box: box, img: toMnist(ink, cw, g.x0, g.y0, g.x1, g.y1) });
    });
    /* A decimal point sits between two digits; a minus comes before the first. Anywhere else it is a smudge or a bit of print. */
    var kept = [];
    out.forEach(function (pt, idx) {
      if (pt.kind === 'dot') {
        var prev = idx > 0 && out[idx - 1].kind === 'digit' ? out[idx - 1] : null;
        var next = idx + 1 < out.length && out[idx + 1].kind === 'digit' ? out[idx + 1] : null;
        if (!prev || !next) return;
        if (pt.box[0] - prev.box[2] > Hd * 0.8 || next.box[0] - pt.box[2] > Hd * 0.8) return;
      } else if (pt.kind === 'slash') {
        var hasBefore = out.slice(0, idx).some(function (q) { return q.kind === 'digit'; });
        var hasAfter = out.slice(idx + 1).some(function (q) { return q.kind === 'digit'; });
        if (!hasBefore || !hasAfter) return;
      } else if (pt.kind === 'minus') {
        var after = idx + 1 < out.length && out[idx + 1].kind === 'digit';
        var first = !out.slice(0, idx).some(function (q) { return q.kind === 'digit'; });
        if (!after || !first) return;
      }
      kept.push(pt);
    });
    return kept;
  }

  /**
   * Read a handwritten number. Returns { text, conf, chars:[{ch,conf,box}] }.
   * opts.allow: '0123456789.-' (what the field may hold).
   */
  function readNumber(ink, cw, ch, opts) {
    if (!NET) throw new Error('The digit reader is not loaded');
    var allow = (opts && opts.allow) || '0123456789.-';
    var parts = segmentNumber(ink, cw, ch, allow.indexOf('/') >= 0);
    var out = [], text = '', conf = 100;
    parts.forEach(function (pt) {
      if (pt.kind === 'dot') { if (allow.indexOf('.') >= 0) { out.push({ ch: '.', conf: 90, box: pt.box }); text += '.'; } return; }
      if (pt.kind === 'minus') { if (allow.indexOf('-') >= 0) { out.push({ ch: '-', conf: 85, box: pt.box }); text += '-'; } return; }
      if (pt.kind === 'slash') { if (allow.indexOf('/') >= 0) { out.push({ ch: '/', conf: 85, box: pt.box }); text += '/'; } return; }
      var pr = classify(pt.img);
      var bi = 0;
      for (var k = 1; k < 10; k++) if (pr[k] > pr[bi]) bi = k;
      var c100 = Math.round(pr[bi] * 100);
      out.push({ ch: String(bi), conf: c100, box: pt.box });
      text += String(bi);
      if (c100 < conf) conf = c100;
    });
    /* only one decimal point, and a minus only at the start */
    var seenDot = false, clean = '';
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === '/') seenDot = false;   // each number of a pair has its own decimal point
      if (c === '.') { if (seenDot) continue; seenDot = true; }
      if (c === '-' && clean.length) continue;
      clean += c;
    }
    clean = clean.replace(/^[.\/]+/, '').replace(/[.\/]+$/, '');
    return { text: clean, conf: conf, chars: out };
  }

  /**
   * A line of handwriting as words: [{ text (the characters read as digits), chars, x0, x1 }]. A word is a run of
   * characters with no wide gap; letters read as digits are meaningless but the word's place and length are not
   * (13 NOV 2026 1200H is a 2-digit word, a 3-letter word, a 4-digit word and a 4-digit word with an H).
   */
  function readWords(ink, cw, ch) {
    if (!NET) throw new Error('The digit reader is not loaded');
    var parts = segmentNumber(ink, cw, ch).filter(function (p) { return p.kind === 'digit'; });
    var Hd = 0;
    parts.forEach(function (p) { Hd = Math.max(Hd, p.box[3] - p.box[1] + 1); });
    var words = [], cur = null;
    parts.forEach(function (pt) {
      var pr = classify(pt.img), bi = 0;
      for (var k = 1; k < 10; k++) if (pr[k] > pr[bi]) bi = k;
      var c = { ch: String(bi), conf: Math.round(pr[bi] * 100), box: pt.box };
      if (!cur || pt.box[0] - cur.chars[cur.chars.length - 1].box[2] > Hd * 0.55) { cur = { chars: [], x0: pt.box[0], x1: pt.box[2] }; words.push(cur); }
      cur.chars.push(c); cur.x1 = pt.box[2];
    });
    words.forEach(function (w) { w.text = w.chars.map(function (c) { return c.ch; }).join(''); });
    return words;
  }

  var api = { readWords: readWords, segmentNumber: segmentNumber, setNet: setNet, hasNet: hasNet, classify: classify, toMnist: toMnist, readNumber: readNumber, components: components, resizeAvg: resizeAvg, decodeB64: decodeB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChengDigitReader = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
