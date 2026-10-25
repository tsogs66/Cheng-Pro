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

/* ---- 3. a bar above the frame must not push its bottom off the screen ---- */

/* Consumption Plan and Bunkering Plan are the only modules that put a
   .bunker-file-bar above the embed wrap. The fullscreen rules used to size the
   pane, the wrap AND the frame each to 100dvh and give the embed strip back
   with a margin on the frame -- which holds only while the frame is the pane's
   one and only child. With the bar above it, a 100dvh wrap started 101px down
   a 100dvh pane (55px in landscape) and its bottom fell outside a pane that is
   overflow:hidden by design, so the module's own footer could not be reached.
   Measured in Chromium before the fix: 101px unreachable in Android portrait
   and 55px in all three landscape/portrait desktop cases, on both pages, while
   every embed without a file bar was fine.

   The fix is the same principle as the nav-mode fix above: let the layout do
   the arithmetic. The strip and safe-area insets are padding on the pane,
   counted once, and the wrap and frame are flex children taking the rest. */

const fsEmbed = CSS.slice(
  CSS.indexOf('html.aio-fullscreen-embed .main,'),
  CSS.indexOf('html.aio-fullscreen-embed .aio-return-fabs')
);

check('the pane carries the strip and safe-area inset as padding',
  /padding:\s*calc\(var\(--embed-bar-h\) \+ env\(safe-area-inset-top, 0px\)\) 0\s*\n\s*env\(safe-area-inset-bottom, 0px\) !important;/.test(fsEmbed), true);
check('and sizes itself with border-box, so that padding is inside the 100dvh',
  /box-sizing:\s*border-box/.test(fsEmbed), true);
check('the pane is a flex column, so a sibling bar is accounted for',
  /display:\s*flex;\s*\n\s*flex-direction:\s*column;/.test(fsEmbed), true);

check('the wrap takes the remaining space rather than a whole viewport',
  /html\.aio-fullscreen-embed \.aio-embed-wrap,\s*\nhtml\.aio-fullscreen-embed \.eorb-embed-wrap \{[^}]*flex:\s*1 1 auto/.test(fsEmbed), true);
check('and no longer hard-sets itself to 100dvh',
  /html\.aio-fullscreen-embed \.aio-embed-wrap,\s*\nhtml\.aio-fullscreen-embed \.eorb-embed-wrap \{[^}]*(min-)?height:\s*100dvh/.test(fsEmbed), false);

check('the frame takes the remaining space too',
  /html\.aio-fullscreen-embed \.aio-embed-frame,[\s\S]{0,400}?flex:\s*1 1 auto/.test(fsEmbed), true);
/* The margin was the double-count: the pane already gives back the strip. */
check('the frame no longer carries the strip as a margin',
  /html\.aio-fullscreen-embed \.aio-embed-frame,[\s\S]{0,500}?margin-top:\s*calc\(var\(--embed-bar-h\)/.test(fsEmbed), false);
check('its margin-top is explicitly zeroed, so a base rule cannot reintroduce it',
  /html\.aio-fullscreen-embed \.aio-embed-frame,[\s\S]{0,400}?margin-top:\s*0;/.test(fsEmbed), true);
check('and it no longer caps itself to a computed viewport height',
  /html\.aio-fullscreen-embed \.aio-embed-frame,[\s\S]{0,500}?max-height:\s*calc\(100dvh/.test(fsEmbed), false);
check('the file bar keeps its own height and only the frame gives way',
  /html\.aio-fullscreen-embed \.main > \.bunker-file-bar \{\s*\n\s*flex:\s*0 0 auto;/.test(CSS), true);
/* The comment wraps, so match with whitespace flexible rather than editing
   the comment to suit the test. */
check('and the reason is written down',
  /works only while the\s+frame is the pane's one and only child/.test(CSS), true);
check('including the measurement that found it',
  /101px unreachable in\s+Android portrait/.test(CSS), true);

/* The two modules this protects are the two that have such a bar. If a third
   grows one, this list is how the next reader learns the rule applies to it. */
const modules = ['bunkerplan', 'bunkeringplan'];
for (const m of modules) {
  const src = fs.readFileSync(path.join(ROOT, `apps/web/js/modules/${m}.js`), 'utf8');
  check(`${m} still puts its file bar above the embed wrap`,
    src.indexOf('bunker-file-bar') < src.indexOf('aio-embed-wrap'), true);
}

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
