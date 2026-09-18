/**
 * A figure that changes counts to its new value instead of jumping to it.
 *
 * This is the one piece of motion in the suite that earns its place on a ship.
 * A gauge that snaps from 420.0 to 350.0 tells you the number; a gauge that
 * runs down to it tells you something moved, and roughly how far — which is
 * what an engineer watching a transfer actually wants to know. It is also the
 * difference between a readout and a table cell.
 *
 * Rules it works to:
 *
 *   - Only figures. Anything that does not parse as a number on both sides is
 *     written straight through.
 *   - Only on arrival. A re-render that produces the same value animates
 *     nothing, so a panel that redraws on a timer does not shimmer.
 *   - The final frame is the exact text that was handed in, never a rounding
 *     of it. Whatever the engineer copies onto a sheet is what the program
 *     meant to show, down to the last digit.
 *   - Under 400ms, and never on a value he is in the middle of typing.
 *
 * Deliberately not applied to table cells: a table redraw would set forty
 * numbers running at once, which is a light show, not information.
 */
(function (root) {
  'use strict';

  const DURATION = 380;

  /* Figures as these programs write them — thousands separators, an optional
     sign and decimal part, and a unit from a named list.
     The list is explicit rather than "any letters" because "65 B" is a voyage
     number and its condition, not sixty-five of something, and a parser loose
     enough to read it as a figure is a trap for whoever wires this up next. */
  const UNIT = '%|MT|m³|m3|kg|t|L|l|kW|kWh|g/kWh|nm|NM|kn|rpm|RPM|hrs|hr|h|°C|°|mm|cm|m';
  const FIGURE = new RegExp('^([-+]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)(\\s*(?:' + UNIT + '))?$');

  function parse(text) {
    const m = FIGURE.exec(String(text == null ? '' : text).trim());
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? { n, tail: m[2] || '', raw: m[1] } : null;
  }

  /* Match the decimals and the grouping of the value being counted to, so the
     digits do not change width or shape on the way there. */
  function shape(sample) {
    const dot = sample.raw.indexOf('.');
    const decimals = dot < 0 ? 0 : sample.raw.length - dot - 1;
    const grouped = sample.raw.indexOf(',') >= 0;
    return (v) => (grouped
      ? v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : v.toFixed(decimals)) + sample.tail;
  }

  function reduced() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) { return false; }
  }

  /**
   * Show `text` in `el`, counting from whatever is there now.
   *
   * Returns true when it animated, false when it wrote the value straight
   * through — which is the honest answer for anything that is not a figure.
   */
  function to(el, text) {
    if (!el) return false;
    const next = parse(text);
    const prev = parse(el.textContent);
    if (!next || !prev || next.n === prev.n || reduced()) {
      el.textContent = text;
      return false;
    }

    if (el._chengCount) cancelAnimationFrame(el._chengCount);
    const fmt = shape(next);
    const from = prev.n;
    const delta = next.n - from;
    const started = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - started) / DURATION);
      /* Fast away, settling in — a needle arriving, not a linear ramp. */
      const eased = 1 - Math.pow(1 - t, 3);
      if (t >= 1) {
        el._chengCount = null;
        /* The exact text that was handed in, never a rounding of it. */
        el.textContent = text;
        return;
      }
      el.textContent = fmt(from + delta * eased);
      el._chengCount = requestAnimationFrame(step);
    };
    el._chengCount = requestAnimationFrame(step);
    return true;
  }

  /**
   * Redraw a tile grid and let its figures count to their new values.
   *
   * The render replaces the whole grid, so there is nothing left to count
   * from afterwards — the old figures are read off first, keyed by the label
   * beside them, and put back for one frame before the count starts.
   *
   * Only the leading text node of each .value is touched. A tile reads
   * "3,598.7" then a smaller "m³ / 4,510" in its own element, and the second
   * half is a capacity that did not change.
   */
  function through(container, render) {
    if (!container || typeof render !== 'function') { if (render) render(); return; }
    const labelOf = (v) => {
      const card = v.closest ? v.closest('.card') : null;
      const label = card && card.querySelector('.label');
      return label ? label.textContent.trim() : '';
    };
    const before = new Map();
    for (const v of container.querySelectorAll('.value')) {
      const first = v.firstChild;
      if (first && first.nodeType === 3) before.set(labelOf(v), first.nodeValue);
    }

    render();

    for (const v of container.querySelectorAll('.value')) {
      const first = v.firstChild;
      if (!first || first.nodeType !== 3) continue;
      const old = before.get(labelOf(v));
      if (old == null) continue;
      const next = first.nodeValue;
      first.nodeValue = old;
      to(first, next);
    }
  }

  const api = { to, through, parse, DURATION, FIGURE };
  root.ChengCountUp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
