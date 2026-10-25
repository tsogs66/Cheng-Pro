/*
 * Calculated-value cards: the title must not be the value in a weaker shade.
 *
 * The Consumption/Bunkering Plan result cards print a figure and, under it, the
 * name of what was calculated. The title was written `color:inherit; opacity:.92`
 * -- the value's own colour at 92% -- so on every theme the label and the number
 * it labels were the same hue at nearly the same lightness. Nothing told the eye
 * which was the answer.
 *
 * Now: value --paper, unit suffix the brass accent, title --paper-dim. This file
 * pins both halves of the requirement:
 *
 *   1. the three roles use three DIFFERENT tokens, in every theme
 *   2. each is readable on the card it sits on
 *
 * The card backgrounds below are not guessed. They were sampled from a rendered
 * page in Chromium (a full-viewport screenshot, because `backdrop-filter` is not
 * composited into an element screenshot, averaged over a text-free band near the
 * top of a card). Re-sample them if the card styling changes.
 *
 * Run: node scripts/test-bp-result-colors.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/voyage_manager.html'), 'utf8');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

/* ---- 1. the roles are distinct, and the old fault cannot come back ------- */

/* The declaration that sets the colour. A selector can appear more than once --
   `.bp-result-title` is also in a shared `font-weight:500` group -- so take the
   block that actually carries a `color`, not simply the first one. */
function rule(selector) {
  let at = -1, found = null;
  while ((at = HTML.indexOf('  ' + selector + '{', at + 1)) >= 0) {
    const block = HTML.slice(at, HTML.indexOf('}', at));
    if (/color:/.test(block)) { found = block; break; }
  }
  if (found == null) throw new Error(selector + ': no block setting a colour');
  return found;
}

check('the value carries the full-strength paper token',
  /color:var\(--paper\)/.test(rule('.bp-result-value')), true);
check('the title is a different token, not the value in a weaker shade',
  /color:var\(--paper-dim\)/.test(rule('.bp-result-title')), true);
check('and no longer inherits the value colour',
  /color:inherit/.test(rule('.bp-result-title')), false);
check('nor leans on opacity to tell them apart',
  /opacity:\s*\.9/.test(rule('.bp-result-title')), false);
check('the unit suffix is the accent',
  /color:var\(--brass\)/.test(rule('.bp-result-unit')), true);
check('an empty card does not show a bright dash as if it were a figure',
  /\.bp-result-value:not\(:has\(\.bp-result-unit\)\)\{color:var\(--paper-dim\)\}/
    .test(HTML.replace(/;\}/g, '}')), true);
check('bright overrides the unit, whose own brass is too light on a white card',
  /html\.bright \.bp-result-unit\{color:#5e3c0e;\}/.test(HTML), true);

/* ---- 2. every theme resolves the tokens to readable colours -------------- */

function themeTokens(cls) {
  /* The `:root` block is the default (night); the others are html.<cls>. */
  const at = cls ? HTML.indexOf('html.' + cls + '{') : HTML.indexOf(':root{');
  if (at < 0) throw new Error('theme ' + cls + ' not found');
  const block = HTML.slice(at, HTML.indexOf('}', at));
  const out = {};
  block.replace(/(--[a-z-]+)\s*:\s*(#[0-9a-f]{3,8})/gi, (m, k, v) => { out[k] = v; return m; });
  return out;
}

function lum(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c) : h.match(/../g);
  const [r, g, b] = n.slice(0, 3).map((p) => {
    const c = parseInt(p, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const round = (n) => Math.round(n * 100) / 100;

/* Sampled card backgrounds, per theme. */
const CARD = {
  night: '#20262f',
  bright: '#b8b9bc',
  prism: '#1f272f',
  astrolabe: '#20252e',
};
/* The unit is overridden only in bright. */
const UNIT = { bright: '#5e3c0e' };

const THEMES = [['night', ''], ['bright', 'bright'], ['prism', 'prism'], ['astrolabe', 'astrolabe']];

for (const [name, cls] of THEMES) {
  const t = themeTokens(cls);
  const bg = CARD[name];
  const value = t['--paper'], title = t['--paper-dim'], unit = UNIT[name] || t['--brass'];

  /* 22px at weight 800 is large text: the 3:1 floor applies to it. */
  check(`${name}: the value reads on the card`, round(ratio(value, bg)) >= 3, true);
  /* 11px and 13px are small text: 4.5:1. */
  check(`${name}: the title reads on the card`, round(ratio(title, bg)) >= 4.5, true);
  check(`${name}: the unit reads on the card`, round(ratio(unit, bg)) >= 4.5, true);
  /* And the point of the whole change: the two are told apart by colour.
     1.5:1 between label and figure is the separation the sampled values give
     at their worst (bright, 1.78:1); it is a floor, not a target. */
  check(`${name}: title and value are visibly different`, round(ratio(value, title)) >= 1.5, true);
  console.log(`       ${name}: value ${round(ratio(value, bg))}:1  title ${round(ratio(title, bg))}:1  `
    + `unit ${round(ratio(unit, bg))}:1  value/title ${round(ratio(value, title))}:1`);
}

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
