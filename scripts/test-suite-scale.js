/**
 * One scale, three documents.
 *
 * The AIO shell, the Tank module and the Voyage module each carry their own
 * copy of the suite's control scale, because they are three documents that
 * cannot share a stylesheet. The comment above each copy says "change one,
 * change all three" — and until now nothing checked that anyone had.
 *
 * Drift here is quiet: a button in Tanks a few pixels off the same button in
 * Voyage, or a bottom bar that grows on a tablet in two programs out of
 * three. Nobody files that; they just notice the suite feels unfinished.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCUMENTS = [
  ['AIO shell', 'apps/web/css/shell.css'],
  ['Tank module', 'modules/tanks/public/css/app.css'],
  ['Voyage module', 'modules/voyage/www/voyage_manager.html'],
];

/* Heights are ergonomics and are shared. The radius is not: each program
   keeps its own edge — Voyage Chief's square 3px is its instrument look —
   so --ctl-r is deliberately absent from this list. */
const SHARED = [
  '--ctl-h',
  '--ctl-h-sm',
  '--cell-pad-y',
  '--cell-pad-x',
  '--nav-item-h',
  '--nav-ic',
  '--nav-label',
  '--nav-pad-y',
];

/** Every value a token is given, in source order. */
function valuesOf(text, token) {
  const found = [];
  const pattern = new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g');
  let match;
  while ((match = pattern.exec(text)) !== null) found.push(match[1].trim());
  return found;
}

let pass = 0;
const read = ([name, file]) => ({ name, file, text: fs.readFileSync(path.join(ROOT, file), 'utf8') });
const docs = DOCUMENTS.map(read);

for (const token of SHARED) {
  const perDoc = docs.map((doc) => ({ doc, values: valuesOf(doc.text, token) }));

  for (const { doc, values } of perDoc) {
    assert.ok(values.length > 0,
      `${doc.file} does not set ${token} — the suite's scale lives in all three documents`);
  }

  /* The first value is the base; later ones are the coarse-pointer and
     tablet steps, which must also agree across the three. */
  const [first, ...rest] = perDoc;
  for (const other of rest) {
    assert.deepStrictEqual(other.values, first.values,
      `${token} differs:\n  ${first.doc.file}: ${first.values.join(' then ')}\n`
      + `  ${other.doc.file}: ${other.values.join(' then ')}\n`
      + '  Change one, change all three.');
  }
  pass += 1;
}

/* The bar's height on a tablet is the point of the second step: a phone's
   bar and a tablet's must not be the same, or the step did nothing. */
const shell = docs[0].text;
const navHeights = valuesOf(shell, '--nav-item-h');
assert.ok(navHeights.length >= 2,
  '--nav-item-h has no second value — the tablet step is missing');
assert.notStrictEqual(navHeights[0], navHeights[1],
  'the tablet bar is the same height as the phone bar');
pass += 1;

/* The tablet step is told from a phone by having room on both sides. A
   phone in landscape is wide and short, and must keep the compact bar. */
for (const doc of docs) {
  assert.ok(/\(pointer:\s*coarse\)\s*and\s*\(min-width:\s*600px\)\s*and\s*\(min-height:\s*600px\)/.test(doc.text),
    `${doc.file} does not guard the tablet step on both width and height — `
    + 'a phone in landscape would take the tall bar');
  pass += 1;
}

console.log(`suite scale: ${pass} checks passed across ${docs.length} documents`);
