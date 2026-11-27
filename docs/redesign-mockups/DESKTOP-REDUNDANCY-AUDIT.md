# Desktop redundancy audit

Read-only. No application code was changed. Checked 2026-11-27.

ChEng AIO is this repository. Voyage Chief and Tank Chief were also read from GitHub (`tsogs66/voyage-manager` `main`, `tsogs66/tank-management` `main`). The copies AIO actually runs are `modules/voyage` and `modules/tanks`. The boot-time nav tests match the standalone files. Line numbers below are the copies in this repo unless noted.

The pattern that puts phone chrome on a Windows laptop is the same in all three: a window is treated as a phone when its **short side is 900px or less**, or its **width is 1180px or less**, or the machine reports a coarse/touch pointer and the **screen’s** short side is 1100px or less. A 1366×768 laptop fails the first test (768 ≤ 900). A 1920×1080 touch laptop fails the touch test (1080 ≤ 1100). A plain 1920×1080 mouse desktop does not.

ChEng AIO’s `shell.js` later **replaces** that first guess and ignores window height. Voyage Chief and Tank Chief do not. So the same laptop can show the AIO sidebar and, inside the module, Voyage or Tank’s bottom bar.

## ChEng AIO

| What | Where | Why it exists | Gated today? | Recommendation |
| --- | --- | --- | --- | --- |
| Bottom bar (Voyage, Tanks, Cons Plan, Bnk Plan, e-ORB, Perf, More) and the More sheet | `apps/web/index.html` 154–210. Shown by `html.use-bottom-nav` in `apps/web/css/shell.css` 581–594. Class set in `apps/web/index.html` 56–63, then replaced in `apps/web/js/shell.js` 533–565 and 789 | Phone and tablet primary nav. Replaces the sidebar | **Partly.** The inline script still uses `min(width, height) ≤ 900`, so a 1366×768 window is a phone until `shell.js` runs. After that, height is ignored, but a touch screen whose short side is ≤ 1100px (including 1920×1080) still forces the bar. Width ≤ 1180 also forces it | Hide on desktop: gate on `(hover: none) and (pointer: coarse)` **and** a narrow viewport, not on `screen` size and not on window height. Delete the height test in `index.html` 57 so the first paint matches `shell.js` |
| Hamburger (`#menuBtn`) | `apps/web/index.html` 96. Hidden at `apps/web/css/shell.css` 555 when width ≥ 901px, and hidden when the bottom bar is on (`shell.css` 517–518) | Opens the sidebar drawer on a phone that is not using the bottom bar | Yes for a wide mouse window. If the bottom-nav test above misfires, the hamburger is hidden and the bar shows instead | Keep the CSS hide. Fix the bottom-nav test so a desktop never takes the bar |
| Android menu button (`#navFab`) | `apps/web/index.html` 113. Shown only for `html.aio-android-nav` and not the bottom bar (`shell.css` 513–516, `shell.js` 566) | Android drawer when the bottom bar is not used | Yes. `isAndroidNav()` is Capacitor Android, license seat `android`, or an Android user agent (`shell.js` 500–529) | Keep |
| Full-screen toggle in More | `apps/web/index.html` 208. `shell.js` 90 and 100–108 | Hides the Android system bars | Yes. `fullscreenEnabled` and an Android user agent. The button starts `hidden` | Keep |
| Three Day/Night buttons (top bar, sidebar, More sheet) plus a fourth on the embed strip | `apps/web/index.html` 118, 144, 207, 217 | One control per chrome that might be the only chrome on screen | Sidebar copy is `display: none` (`shell.css` 493). Top bar copy hides inside a full-screen embed (`shell.css` 492). More-sheet copy is only reachable with the bottom bar | Keep one visible control per layout. Do not show the More-sheet copy on the desktop sidebar |
| “‹ Dashboard” strip over an embedded module | `apps/web/index.html` 215–220. Shown when `shell.js` `wantsFullscreenEmbed()` is true (574–597), which is **also true for a Windows user agent and Electron** | Tells you which module and vessel are active, and how to get back | It is meant to show on Windows. It replaces the AIO sidebar while Voyage or Tank is open | Keep. It is not a phone-only control that leaked. The module underneath still has its own menu, so Windows has two menus stacked. A later shell can own the menu and drop the module’s bar while embedded |
| Page-zoom magnet (`#cheng-zoom`) | `apps/web/js/ui-zoom.js` 1–62, loaded from `apps/web/index.html` | Magnifier for small text. Positioned 96px up so it clears a phone bar | **No.** The button is added on every page, including Windows. Ctrl/Cmd plus wheel still works without it | Hide the floating button when `(hover: hover) and (pointer: fine)` and the window is wide. Keep the keyboard shortcut |
| Viewport lock | `apps/web/index.html` 66–84 | Stops a phone browser’s “Desktop site” from widening the layout | The script runs on every load, including Windows. It only rewrites the viewport meta to `device-width`, which is already the desktop meta | Keep. It does not add a control |

## Voyage Chief

Standalone `voyage_manager.html` lines 37–61 match `modules/voyage/www/voyage_manager.html` 37–61. CSS that shows the bar is `voyage_manager.html` 2628–2635 in this repo (2628–2629 on standalone `main`).

| What | Where | Why it exists | Gated today? | Recommendation |
| --- | --- | --- | --- | --- |
| Bottom bar (Summary, Log, Reports, ROB, Totals, Voyage, More) | Markup near the end of `voyage_manager.html` (`<nav class="bottom-nav" id="bottomNav">`, about line 6391 in this copy). Display forced by `html.use-bottom-nav .bottom-nav` and `.tabs{display:none}` at 2634–2635 | Phone/tablet replacement for the Watch / Voyage / Books / Ship tabs | **No, for a short laptop.** The class is added when `min(width, height) ≤ 900` or `width ≤ 1180` or the touch-screen test above. It is removed only when width ≥ 1181 **and** the short side is over 900. A 1366×768 Windows window keeps the bar and loses the tab row. Confirmed on a local 1366×768 capture of this copy | Hide the bar on desktop: do not use window height. Same pointer-and-width test as recommended for AIO. This file has no later correction like `shell.js` |
| Day/Night floating button (`.theme-fab`) and the one in the header | `voyage_manager.html` 3636 and 3643 | Header control, plus a thumb button when the header scrolls away | The floating one is `display: none` at line 260, and again inside AIO (331) and when the bottom bar is on (3448) | Keep the header button. The floating one is already hidden; leave it hidden on Windows |
| Page-zoom magnet | `voyage_manager.html` loads `ui-zoom.js` (same file as AIO) | Same magnifier | **No** platform gate | Same as AIO: hide the button on a fine pointer |
| “Install app / Add to Home screen” | About / guide copy and `beforeinstallprompt` near the bottom of `voyage_manager.html` (around 33051–33136 in this copy) | Android and iOS install | The prompt handler runs only if the browser fires `beforeinstallprompt`. Desktop Chrome can fire it for an installed PWA | Keep the event handler. Do not add a permanent Install button on the Windows toolbar. The guide text can say it is for a phone |

## Tank Chief

Standalone `public/index.html` lines 45–74 and 116–117 match `modules/tanks/public/index.html`.

| What | Where | Why it exists | Gated today? | Recommendation |
| --- | --- | --- | --- | --- |
| Bottom bar (Summary, Monitor, Bunker, Bnk Sum, Report, Sounding, More) and More sheet | `modules/tanks/public/index.html` 144–173. Display in `modules/tanks/public/css/app.css` 366–380 and 475 | Phone primary nav | **No, for a short laptop.** `isMobileChrome()` (index.html 47–59) is true when `min(width, height) ≤ 900` or `width ≤ 1180`, and that sets both `use-bottom-nav` and `is-mobile-chrome`. The desktop rule that hides the bar (`app.css` 512–518) applies only at width ≥ 1025px **and** when `is-mobile-chrome` is absent. A 1366×768 window is classified as mobile chrome, so the hide does not run. Confirmed on a local 1366×768 capture | Same fix as Voyage: stop using window height. Then the existing `min-width: 1025px` hide will cover a normal Windows window |
| “☰ Menu” (`#menu-toggle`) | `index.html` 116. Default `display: none` (`app.css` 351). Forced on for a 901–1024px window that is not mobile chrome (`app.css` 532–536) | Drawer for a tablet-width window that is not on the bottom bar | Hidden when the bottom bar is on (`app.css` 476). On a short 1366×768 window the bar is on, so the hamburger stays hidden. On a non-touch window between 901 and 1024px wide, the hamburger shows and the sidebar is a drawer | Keep for that narrow band. Do not show it at ≥ 1366px. The height bug currently chooses the bottom bar instead, which is the wrong desktop chrome |
| Floating Bright button (`.theme-fab`) | `index.html` 117 | Thumb control | Hidden for non-mobile chrome at width ≥ 1025px (`app.css` 528). Still present in the DOM. On a 1366×768 “mobile chrome” window it can sit on top of the page as well as any theme control in the menu | Hide whenever the window is a fine pointer and width ≥ 1025px, even if `is-mobile-chrome` was set by the height test |
| Page-zoom magnet | Tank loads the shared `ui-zoom.js` | Same magnifier | **No** | Same as AIO |
| Monitoring cell popup (Actual, Temp, SG) | `modules/tanks/public/js/fuel-report.js` 1791–1804 | Large fields for a finger instead of a dense grid | **Yes.** Returns false when the pointer is fine **and** width ≥ 1101px. A 1366×768 mouse window types in the grid. A coarse pointer still gets the popup at any width | Keep. This one is gated correctly |
| Main padding of 70px at the bottom on every width | `app.css` 346–349 | Room for the phone bar | The padding is unconditional. On a desktop with the bar hidden, the page keeps an empty strip | Drop the extra padding when the bottom bar is `display: none` |

## Duplicate desktop features

These are not phone controls, but they are two ways to do the same thing on Windows.

- **Two menus while a module is open.** AIO’s sidebar (or the return strip) and Voyage’s tab row, or Tank’s sidebar, are both on screen. `wantsFullscreenEmbed` hides the AIO sidebar on Windows and leaves the return strip, so the module menu remains. Recommendation: when embedded, the shell owns navigation and the module menu is not drawn. That is the mockup’s model. Do not remove the module menu from the standalone apps.
- **Three theme buttons in the AIO markup.** Only one is shown on a correct desktop layout. Recommendation: keep a single visible control. The extras are already hidden by CSS when the layout is right.
- **Voyage top tabs and Voyage bottom bar.** They are alternatives, not both visible: `use-bottom-nav` hides `.tabs`. The bug is choosing the bar on a desktop window, not showing both.
- **Tank sidebar and Tank bottom bar.** Same relationship. The desktop CSS tries to force the sidebar back, then the height test marks the window as mobile and skips that rule.

## What is already in good shape

- AIO’s Android-only full-screen control and `#navFab` stay off Windows.
- Tank’s sounding popup stays off a wide mouse window.
- The floating theme button in Voyage is forced off.
- AIO `shell.js` already documents the old height bug (lines 544–552) and no longer uses window height. Voyage and Tank still have the old test. AIO’s own `index.html` still has it for the first paint, and AIO’s touch test still uses the **screen** size, so a touch 1080p Windows PC still gets the phone bar.
