/**
 * One scrollbar, not two.
 *
 * The AIO shell pins the window and lets the pane scroll, so a module's own
 * page scrolls inside its frame. Every desktop rule that does this is written
 * `:not(.use-bottom-nav)`, which made the whole layout hinge on one line of
 * nav detection — and that line tested the viewport's SHORTER side:
 *
 *     Math.min(vw, vh) <= 900
 *
 * A 1440x900 desktop, a 1366x768 laptop, a maximised window on a 1080p screen:
 * all have an inner height under 900, all were classified as phones, and all
 * therefore lost the pinned shell. The window scrolled instead of the pane, and
 * at full screen the page grew taller than the viewport so the window took the
 * scroll and the embedded module never got the wheel — Bunkering Plan could not
 * be scrolled at all.
 *
 * Two rules hold it now, and this file guards both:
 *   1. nav mode is decided by WIDTH and real touch signals, never by height
 *   2. full screen pins the window regardless of nav mode
 *
 * Run: node scripts/test-shell-scroll.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'apps/web/js/shell.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'apps/web/css/shell.css'), 'utf8');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

/* ---- 1. nav detection must not look at height ---------------------------- */

const navFn = (() => {
  const start = JS.indexOf('function wantsBottomNav()');
  if (start < 0) throw new Error('wantsBottomNav not found');
  let depth = 0, i = JS.indexOf('{', start);
  for (; i < JS.length; i++) {
    if (JS[i] === '{') depth++;
    else if (JS[i] === '}') { depth--; if (depth === 0) break; }
  }
  return JS.slice(start, i + 1);
})();

/* Assert on CODE, not on the comment that explains what was removed —
   the comment names the old test on purpose. */
const navCode = navFn
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

check('the height-based test is gone',
  /Math\.min\(vw,\s*vh\)/.test(navCode), false);
check('the screen-min test is gone too (900 on a 1600x900 monitor)',
  /screenMin/.test(navCode), false);
check('innerHeight is not consulted at all',
  /innerHeight/.test(navCode), false);
check('width still decides', /vw\s*<=\s*1180/.test(navCode), true);
check('and so do the real touch signals',
  /pointer: coarse/.test(navCode) && /maxTouchPoints/.test(navCode), true);
check('native and mobile platforms still force it',
  /isNativePlatform/.test(navFn) && /Android\|iPhone\|iPad\|iPod/.test(navFn), true);
check('and the reason is written down',
  /WIDTH decides, never height/.test(navFn), true);

/* Run the predicate for real against viewport sizes, with the browser bits
   stubbed, so the decision is tested rather than the text of it. */
function wantsBottomNavAt(vw, vh, opts) {
  const o = opts || {};
  const sandbox = {
    window: {
      innerWidth: vw,
      innerHeight: vh,
      matchMedia: (q) => ({ matches: !!o.coarse && /coarse/.test(q) }),
      Capacitor: o.capacitor || undefined,
    },
    navigator: { userAgent: o.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: o.touchPoints || 0 },
    screen: { width: o.screenW || vw, height: o.screenH || vh },
  };
  const fn = new Function('window', 'navigator', 'screen',
    `${navFn} return wantsBottomNav();`);
  return fn(sandbox.window, sandbox.navigator, sandbox.screen);
}

check('1440x900 desktop is a desktop', wantsBottomNavAt(1440, 900), false);
check('1366x768 laptop is a desktop', wantsBottomNavAt(1366, 768), false);
check('1920x937 maximised on 1080p is a desktop', wantsBottomNavAt(1920, 937), false);
check('2560x1297 is a desktop', wantsBottomNavAt(2560, 1297), false);
check('a very short desktop window is still a desktop', wantsBottomNavAt(1920, 500), false);

check('a narrow window gets the bottom bar', wantsBottomNavAt(1100, 900), true);
check('a phone gets it', wantsBottomNavAt(390, 844, { ua: 'iPhone', coarse: true }), true);
check('a phone in landscape gets it', wantsBottomNavAt(844, 390, { ua: 'iPhone', coarse: true }), true);
check('an Android tablet gets it', wantsBottomNavAt(1280, 800, { ua: 'Android', coarse: true }), true);
check('a touchscreen laptop gets it', wantsBottomNavAt(1920, 1080, { coarse: true }), true);

/* ---- 2. full screen pins the window, whatever the nav mode --------------- */

/* The fullscreen block must NOT be guarded by :not(.use-bottom-nav): that
   guard is what switched the whole thing off on a short desktop window. */
const fsBlock = CSS.slice(CSS.indexOf('html.aio-fullscreen-embed,'),
  CSS.indexOf('html.aio-fullscreen-embed .main:has(.aio-embed-wrap)') + 400);

check('full screen hides the window overflow',
  /html\.aio-fullscreen-embed,\s*\n\s*html\.aio-fullscreen-embed body\s*\{[^}]*overflow:\s*hidden/.test(CSS), true);
check('and caps it to the viewport',
  /html\.aio-fullscreen-embed,\s*\n\s*html\.aio-fullscreen-embed body\s*\{[^}]*max-height:\s*100dvh/.test(CSS), true);
check('the fullscreen rules are not gated on nav mode',
  /html\.aio-fullscreen-embed:not\(\.use-bottom-nav\)/.test(CSS), false);
check('the pane scrolls itself in full screen',
  /html\.aio-fullscreen-embed \.main\s*\{[^}]*overflow-y:\s*auto/.test(CSS), true);
check('but not behind an embedded frame, which scrolls on its own',
  /html\.aio-fullscreen-embed \.main:has\(\.aio-embed-wrap\)[\s\S]{0,120}overflow:\s*hidden/.test(CSS), true);
check('overscroll chaining is stopped so the window cannot rubber-band',
  /html\.aio-fullscreen-embed[\s\S]{0,200}overscroll-behavior:\s*none/.test(CSS), true);
check('and the reason is written down',
  /the window itself must never scroll, whatever the nav mode/.test(CSS), true);
void fsBlock;

/* The windowed desktop block must still exist and still pin the window —
   that behaviour was correct, it simply never applied. */
check('the windowed desktop block still pins html and body',
  /@media \(min-width: 901px\)[\s\S]{0,400}?html:not\(\.aio-android-nav\):not\(\.use-bottom-nav\):not\(\.aio-fullscreen-embed\) body \{[^}]*overflow:\s*hidden/.test(CSS), true);
check('and still gives the pane its own scrollbar',
  /html:not\(\.aio-android-nav\):not\(\.use-bottom-nav\):not\(\.aio-fullscreen-embed\) \.main \{[^}]*overflow-y:\s*auto/.test(CSS), true);

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
