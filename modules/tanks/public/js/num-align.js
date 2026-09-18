/**
 * Numbers in a column line up, or they cannot be compared.
 *
 * A sounding sheet is read by running an eye down a column: 1,587.0 above
 * 46.80 above 2,353.33. Left-aligned, the decimal points land wherever the
 * integer part happens to end and the eye has to parse each figure instead of
 * scanning them. Right-aligned with tabular figures, the decimals stack and a
 * wrong order of magnitude shows up as a number that sticks out.
 *
 * The tables here are generated — Tank Chief builds its rows from readings,
 * Voyage Chief from log entries, the AIO from whatever two servers report — so
 * there is no markup to tag by hand. This works the other way round: look at
 * what a column actually contains, and align it only when every cell in it is
 * a plain number.
 *
 * Deliberately strict. A column is numeric only when nothing in it disagrees:
 * one date, one tank name, one "n/a" and the column stays as it is. Aligning a
 * column of names to the right looks like a bug, so the cost of a false
 * positive is higher than the cost of missing one.
 */
(function (root) {
  'use strict';

  /* A figure as these programs write them: thousands separators, an optional
     sign, an optional decimal part, an optional trailing % or unit-less tail.
     Not dates (two hyphens), not ranges, not "12/15", not "Fr. 42-48 (P)". */
  const NUMBER = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

  /* Cells that say "nothing here" neither qualify a column nor disqualify it.
     "none" and "n/r" are in here because Tank Chief writes them in the Fill and
     Reading columns of an unsounded tank — and without them the same column
     aligns on one table and not on the table below it, which reads worse than
     either choice made consistently. */
  const BLANK = /^(|-|–|—|n\/a|na|n\/r|nr|nil|none)$/i;

  function isNumeric(text) {
    return NUMBER.test(String(text).trim().replace(/\s+/g, ''));
  }

  function isBlank(text) {
    return BLANK.test(String(text).trim());
  }

  /**
   * Which column indexes of this table hold numbers only.
   *
   * Reads body rows, not the header: a header reads "100% M³" or "Vol m³",
   * which is not a number, and the header's job here is to follow whatever the
   * column below it turns out to be.
   */
  function numericColumns(table) {
    const rows = table.tBodies.length
      ? Array.from(table.tBodies).flatMap((b) => Array.from(b.rows))
      : Array.from(table.rows).filter((r) => !r.closest('thead'));
    if (!rows.length) return [];

    const verdict = new Map();
    for (const row of rows) {
      /* A row that spans the table ("Nothing saved yet…") describes the table,
         not a column, and must not decide one. */
      if (row.cells.length <= 1) continue;
      let col = 0;
      for (const cell of row.cells) {
        const span = cell.colSpan || 1;
        if (span === 1) {
          /* A cell holding a control carries its value in the field, not in
             the text, so it cannot be judged from here — leave the column be. */
          const text = cell.querySelector('input, select, textarea') ? null : cell.textContent;
          if (text === null) verdict.set(col, false);
          else if (!isBlank(text)) {
            if (isNumeric(text)) { if (!verdict.has(col)) verdict.set(col, true); }
            else verdict.set(col, false);
          }
        } else {
          /* A spanned cell says nothing about any single column it covers. */
          for (let i = 0; i < span; i += 1) if (!verdict.has(col + i)) verdict.set(col + i, undefined);
        }
        col += span;
      }
    }
    return [...verdict.entries()].filter(([, ok]) => ok === true).map(([i]) => i);
  }

  /** Tag one table's numeric columns. Returns how many columns were tagged. */
  function alignTable(table) {
    if (!table || table.hasAttribute('data-no-num-align')) return 0;
    const cols = numericColumns(table);
    /* Remember the shape we tagged for, so a redraw with different data is
       re-read but an unchanged table is not walked again on every mutation. */
    const shape = `${table.rows.length}:${cols.join(',')}`;
    if (table.dataset.numAlign === shape) return cols.length;

    for (const row of Array.from(table.rows)) {
      let col = 0;
      for (const cell of Array.from(row.cells)) {
        const span = cell.colSpan || 1;
        if (span === 1) cell.classList.toggle('num', cols.includes(col));
        col += span;
      }
    }
    table.dataset.numAlign = shape;
    return cols.length;
  }

  function alignAll(scope) {
    let n = 0;
    for (const t of (scope || document).querySelectorAll('table')) n += alignTable(t) ? 1 : 0;
    return n;
  }

  /* Tables appear whenever data arrives, so nothing calls this — it watches.
     childList only: the classes this adds are attributes, so its own work
     cannot wake it again. */
  let pending = null;
  function watch() {
    if (typeof MutationObserver !== 'function' || !document.body) return;
    const run = () => { pending = null; try { alignAll(document); } catch (_) { /* never break a page over alignment */ } };
    new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(run, 120);
    }).observe(document.body, { childList: true, subtree: true });
    run();
  }

  /* Only in a page. Loaded under Node (the matcher tests) there is nothing to
     watch, and the rules below are still worth testing on their own. */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();
  }

  const api = { alignTable, alignAll, isNumeric, isBlank, numericColumns, NUMBER };
  root.ChengNumAlign = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
