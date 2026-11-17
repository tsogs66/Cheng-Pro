(function () {
  const main = document.getElementById('main');
  const activeSelect = document.getElementById('activeVessel');
  const healthDot = document.getElementById('healthDot');
  const menuBtn = document.getElementById('menuBtn');
  const navFab = document.getElementById('navFab');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toastEl = document.getElementById('toast');
  let current = 'home';
  let unfinishedLogKept = false;
  let vesselLoadDepth = 0;
  let toastTimer = null;
  let booted = false;
  const frameFlushJobs = new WeakMap();
  const BOTTOM_PRIMARY = new Set(['voyage', 'tanks', 'bunkerplan', 'bunkeringplan', 'eorb', 'performance']);
  const moreSheet = document.getElementById('bnMoreSheet');

  function setNavActive(module) {
    const inMore = !BOTTOM_PRIMARY.has(module);
    document.querySelectorAll('.nav-item, .bottom-item').forEach((el) => {
      const key = el.dataset.module;
      el.classList.toggle('active', key === 'more' ? inMore : key === module);
    });
    document.querySelectorAll('#bnMoreSheet .bn-more-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.module === module);
    });
  }

  /* ---- Back: one step back through the pages visited ----
     Every page opened is one history entry, so the Android Back button (and the
     browser's) returns to the page before instead of leaving the program. From the
     first page, Back asks once more before it exits. */
  let exitArmed = false;
  let exitTimer = null;
  /* If the system restarts the app anyway (low memory, a setting change), come back to the page that was open
     rather than the dashboard. Only a restart within a minute counts, so a normal start still opens Home. */
  const RESUME_KEY = 'chengAioResume';
  function rememberPage(module) {
    try { localStorage.setItem(RESUME_KEY, JSON.stringify({ module: module, at: Date.now() })); } catch { /* ignore */ }
  }
  /* Read once, before anything this load does can overwrite it with Home. */
  let resumeAtStart = null;
  try { resumeAtStart = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch { /* ignore */ }
  function pageToResume() {
    try {
      const r = resumeAtStart;
      resumeAtStart = null;
      if (!r || !r.module || r.module === 'home' || Date.now() - r.at > 60000) return '';
      return document.querySelector('.nav-item[data-module="' + r.module + '"], #bnMoreSheet .bn-more-item[data-module="' + r.module + '"]') ? r.module : '';
    } catch { return ''; }
  }
  window.addEventListener('pagehide', () => { if (current) rememberPage(current); });
  setInterval(() => { if (current && !document.hidden) rememberPage(current); }, 10000);

  function recordPage(module) {
    rememberPage(module);
    try {
      if (!history.state || history.state.aioModule !== module) {
        history.pushState({ aioModule: module }, '');
      }
    } catch { /* history is a convenience, never a blocker */ }
  }
  window.addEventListener('popstate', (e) => {
    const st = e.state;
    if (moreSheet && moreSheet.classList.contains('open')) {
      closeMoreSheet();
      try { history.pushState({ aioModule: current }, ''); } catch { /* ignore */ }
      return;
    }
    if (st && st.aioModule) {
      if (st.aioModule !== current) navigate(st.aioModule, { fromHistory: true });
      return;
    }
    /* The bottom of the stack: the first page was reached. */
    exitArmed = true;
    showToast('Press Back again to exit', 2200);
    clearTimeout(exitTimer);
    exitTimer = setTimeout(() => {
      exitArmed = false;
      try { history.pushState({ aioModule: current }, ''); } catch { /* ignore */ }
    }, 2300);
  });

  /* ---- Full screen (opt in, in More) ---- */
  const FS_KEY = 'chengAioFullscreen';
  const fsButton = document.getElementById('bnMoreFullscreen');
  function fsSupported() {
    if (window.ChengAndroidFullscreen) return true;
    return !!(document.fullscreenEnabled && /Android/i.test(navigator.userAgent || ''));
  }
  function fsWanted() {
    try { return localStorage.getItem(FS_KEY) === '1'; } catch { return false; }
  }
  function fsApply(on) {
    try {
      if (window.ChengAndroidFullscreen) { window.ChengAndroidFullscreen.set(!!on); return; }
    } catch { /* fall through to the browser's own full screen */ }
    try {
      if (on) {
        if (!document.fullscreenElement) {
          const p = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
          if (p && p.catch) p.catch(() => {});
        }
      } else if (document.fullscreenElement) {
        const p = document.exitFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch { /* not allowed without a tap: the next tap tries again */ }
  }
  function fsPaint() {
    if (!fsButton) return;
    fsButton.hidden = !fsSupported();
    const on = fsWanted();
    fsButton.textContent = 'Full screen: ' + (on ? 'On' : 'Off');
    fsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (fsButton) {
    fsButton.addEventListener('click', () => {
      const on = !fsWanted();
      try { localStorage.setItem(FS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
      fsApply(on);
      fsPaint();
    });
    fsPaint();
    /* The Android app announces its bridge a moment after the page starts. */
    window.addEventListener('cheng-android-print-ready', () => {
      fsPaint();
      if (fsWanted()) fsApply(true);
    });
    if (fsWanted()) {
      if (window.ChengAndroidFullscreen) fsApply(true);
      else document.addEventListener('pointerdown', function once() {
        document.removeEventListener('pointerdown', once, true);
        if (fsWanted()) fsApply(true);
      }, true);
    }
  }

  function closeMoreSheet() {
    if (!moreSheet) return;
    moreSheet.classList.remove('open');
    moreSheet.setAttribute('aria-hidden', 'true');
  }

  function openMoreSheet() {
    if (!moreSheet) return;
    moreSheet.classList.add('open');
    moreSheet.setAttribute('aria-hidden', 'false');
    setNavActive(current);
  }

  function toggleMoreSheet() {
    if (moreSheet && moreSheet.classList.contains('open')) closeMoreSheet();
    else openMoreSheet();
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    document.documentElement.classList.remove('aio-nav-open');
    backdrop.hidden = true;
    if (navFab) {
      navFab.hidden = !isAndroidNav() || wantsBottomNav();
      navFab.classList.remove('is-drawer-open');
      navFab.setAttribute('aria-expanded', 'false');
      navFab.setAttribute('aria-label', 'Open menu');
      navFab.title = 'Menu';
    }
  }

  function openSidebar() {
    sidebar.classList.add('open');
    document.documentElement.classList.add('aio-nav-open');
    backdrop.hidden = false;
    if (navFab) {
      /* Hide while drawer is open so it does not sit on top of the menu panel. */
      navFab.classList.add('is-drawer-open');
      navFab.hidden = true;
      navFab.setAttribute('aria-expanded', 'true');
      navFab.setAttribute('aria-label', 'Close menu');
      navFab.title = 'Close menu';
    }
  }

  async function fillVesselSelect() {
    const vessels = ChengPro.vessel.getListSync();
    const active = ChengPro.vessel.getActive();
    activeSelect.innerHTML =
      '<option value="">Select vessel…</option>' +
      vessels.map((v) => {
        const selected = active && v.id === active.id ? ' selected' : '';
        return `<option value="${v.id}"${selected}>${escapeHtml(v.name)}${v.imo ? ' · ' + escapeHtml(v.imo) : ''}</option>`;
      }).join('');
  }

  function isSoftEmbedModule(id) {
    return id === 'voyage' || id === 'tanks' || id === 'eorb' || id === 'bunkerplan' || id === 'bunkeringplan' || id === 'spares' || id === 'eca';
  }

  /** Voyage-family and Tank-family embeds each keep one database. */
  function embedFamily(moduleId) {
    if (moduleId === 'tanks' || moduleId === 'bunkeringplan') return 'tanks';
    if (moduleId === 'voyage' || moduleId === 'eorb' || moduleId === 'bunkerplan' || moduleId === 'spares' || moduleId === 'eca') return 'voyage';
    return '';
  }

  function backgroundWraps() {
    return [...main.querySelectorAll('.aio-embed-wrap.aio-background-save')];
  }

  function reclaimParkedFrame(moduleId) {
    if (!moduleId) return null;
    const frame = backgroundWraps()
      .flatMap((wrap) => [...wrap.querySelectorAll('iframe.aio-embed-frame')])
      .find((el) => el.dataset.aioModule === moduleId);
    if (!frame) return null;
    return frame.closest('.aio-embed-wrap') || frame;
  }

  function parkSuiteChrome(wrap) {
    if (!wrap || !wrap.parentNode) return;
    [...wrap.parentNode.children].forEach((el) => {
      if (el !== wrap && el.classList && el.classList.contains('bunker-file-bar')) {
        wrap.insertBefore(el, wrap.firstChild);
      }
    });
  }

  function restoreSuiteChrome(wrap) {
    if (!wrap || !wrap.parentNode) return;
    [...wrap.querySelectorAll(':scope > .bunker-file-bar')].forEach((bar) => {
      wrap.parentNode.insertBefore(bar, wrap);
    });
  }

  function dropStraySuiteChrome() {
    [...main.children].forEach((el) => {
      if (el.classList && el.classList.contains('bunker-file-bar')) el.remove();
    });
  }

  function dismissBlockingOverlays() {
    try {
      document.querySelectorAll('.ccp-overlay, #tankSheetPopup, .tsp-overlay').forEach((n) => n.remove());
    } catch { /* ignore */ }
    const app = document.getElementById('app');
    if (vesselLoadDepth <= 0 && app && app.inert) {
      app.inert = false;
      document.documentElement.classList.remove('aio-vessel-load-locked');
    }
  }

  function showReclaimedFrame(wrap) {
    restoreSuiteChrome(wrap);
    wrap.classList.remove('aio-background-save');
    const host = document.getElementById('aioPageHost');
    if (host) host.remove();
    setFullscreenEmbed(isSoftEmbedModule(current));
    syncThemeChrome();
  }

  /**
   * Keep the open program in the page and let it finish writing off to the side.
   * Moving the iframe, or even its wrapper, reloads the document and drops the save.
   * A frame under aioHold stays up so a vessel load can still reach it.
   */
  function startBackgroundSave(moduleId) {
    const wraps = [...main.querySelectorAll('.aio-embed-wrap:not(.aio-background-save)')];
    const frames = wraps.flatMap((wrap) => [...wrap.querySelectorAll('iframe.aio-embed-frame')]);
    if (!frames.length) return null;
    const family = embedFamily(moduleId);
    frames.forEach((frame) => {
      frame.dataset.aioModule = moduleId;
      frame.dataset.aioFamily = family;
    });
    wraps.forEach((wrap) => {
      parkSuiteChrome(wrap);
      wrap.classList.add('aio-background-save');
    });
    const job = flushFrames(frames).then((flushed) => {
      if (flushed.some((row) => row && row.keptLog)) unfinishedLogKept = true;
      return flushed;
    }).finally(() => {
      frames.forEach((frame) => dropParkedFrame(frame));
    });
    frames.forEach((frame) => frameFlushJobs.set(frame, job));
    return job;
  }

  function dropParkedFrame(frame) {
    if (!frame || frame.dataset.aioHold === '1') return;
    /* A Tank embed with a bunkering warning up keeps running off to the side:
       closing it would silence the alarm while fuel is still going aboard. */
    if (frame === bunkerAlertFrame) return;
    const wrap = frame.closest('.aio-embed-wrap');
    if (wrap && wrap.classList.contains('aio-background-save')) wrap.remove();
  }

  function holdParkedFrames() {
    backgroundWraps().forEach((wrap) => {
      wrap.querySelectorAll('iframe').forEach((frame) => { frame.dataset.aioHold = '1'; });
    });
  }

  function releaseParkedFrames() {
    backgroundWraps().forEach((wrap) => {
      wrap.querySelectorAll('iframe').forEach((frame) => {
        delete frame.dataset.aioHold;
        const drop = () => dropParkedFrame(frame);
        const job = frameFlushJobs.get(frame);
        if (job) job.then(drop, drop);
        else drop();
      });
    });
  }

  /** Where the next page is drawn while a program is still saving beside it. */
  function pageHost() {
    if (!backgroundWraps().length) return main;
    let host = document.getElementById('aioPageHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'aioPageHost';
      main.appendChild(host);
    }
    return host;
  }

  function setVesselLoadHold(on, name, detail) {
    let hold = document.getElementById('aioVesselLoadHold');
    if (!hold) {
      hold = document.createElement('div');
      hold.id = 'aioVesselLoadHold';
      hold.className = 'aio-vessel-load-hold';
      hold.setAttribute('role', 'alertdialog');
      hold.setAttribute('aria-modal', 'true');
      hold.setAttribute('aria-labelledby', 'aioVesselLoadTitle');
      hold.innerHTML = [
        '<div class="aio-vessel-load-card">',
        '<p class="aio-vessel-load-kicker">Loading vessel</p>',
        '<p class="aio-vessel-load-name" id="aioVesselLoadTitle"></p>',
        '<p class="aio-vessel-load-note"></p>',
        '</div>',
      ].join('');
      document.body.appendChild(hold);
    }
    const title = hold.querySelector('.aio-vessel-load-name');
    const note = hold.querySelector('.aio-vessel-load-note');
    if (title) title.textContent = name || 'this ship';
    if (note) note.textContent = detail || 'This page stays here until the ship is fully open.';
    hold.hidden = !on;
    document.documentElement.classList.toggle('aio-vessel-load-locked', !!on);
    const app = document.getElementById('app');
    if (app) app.inert = !!on;
  }

  function notifyProgramFramesOfVessel(vessel) {
    const payload = { type: 'chengaio-vessel-changed', vessel: vesselPayload(vessel) };
    document.querySelectorAll('iframe').forEach((frame) => {
      try {
        if (frame.contentWindow) frame.contentWindow.postMessage(payload, '*');
      } catch { /* ignore */ }
    });
  }

  let settledPage = '';
  async function navigate(module, opts) {
    /* A vessel load owns the page until its records are open. */
    if (vesselLoadDepth > 0 && !(opts && opts.allowDuringLoad)) return;
    let next = module || 'home';
    const force = !!(opts && opts.force);
    if (window.ChengLicense && next !== 'license') {
      try {
        const ent = ChengLicense.loadEntitlement();
        if (ChengLicense.enforceEnabled() && !ChengLicense.isValid(ent) && !ChengLicense.isEmbeddedInAio()) {
          /* Soft program tabs still open so they can show Open License (like e-ORB). */
          if (!isSoftEmbedModule(next)) {
            next = 'license';
            showToast('Activate a license to use the suite');
          }
        } else if (ChengLicense.isValid(ent) && !ChengLicense.moduleAllowed(next, ent)) {
          const soft = isSoftEmbedModule(next);
          if (soft) {
            /* Stay on the module so it can show the missing-program warning. */
            showToast('Not included on this license — see details');
          } else {
            showToast('Not included on this license (' + (ent.sku || '') + ')');
            next = 'home';
          }
        }
      } catch { /* ignore */ }
    }
    /* Re-entering the same embed module must not tear down the iframe — that
       stopped the bunkering pump clock and bounced operators back through a
       remount that felt like returning to the main menu. Vessel switches pass
       force:true so the embed can reload for the new ship. */
    if (
      !force &&
      next === current &&
      isSoftEmbedModule(next) &&
      main.querySelector('.aio-embed-wrap:not(.aio-background-save) iframe.aio-embed-frame')
    ) {
      setNavActive(current);
      closeSidebar();
      const embedded = !!main.querySelector('.aio-embed-wrap:not(.aio-background-save)');
      setFullscreenEmbed(embedded);
      syncThemeChrome();
      return;
    }
    /* The open program keeps writing after the page has changed. Parking the
       iframe off-screen lets that save finish without holding the next page. */
    dismissBlockingOverlays();
    const leavingEmbed = isSoftEmbedModule(current) && current !== next;
    const saveJob = leavingEmbed ? startBackgroundSave(current) : null;
    const parked = !force ? reclaimParkedFrame(next) : null;
    if (parked) {
      current = next;
      if (!(opts && opts.fromHistory)) recordPage(next);
      setNavActive(current);
      closeSidebar();
      closeMoreSheet();
      showReclaimedFrame(parked);
      return;
    }
    const nextFamily = embedFamily(next);
    const familyWait = [];
    /* A second copy of the same program would share one database and could
       put the previous ship's name back on screen. Wait only for that copy. */
    if (saveJob && nextFamily && nextFamily === embedFamily(current)) familyWait.push(saveJob);
    if (nextFamily) {
      backgroundWraps().forEach((wrap) => {
        wrap.querySelectorAll('iframe.aio-embed-frame').forEach((frame) => {
          if (frame.dataset.aioFamily !== nextFamily) return;
          const job = frameFlushJobs.get(frame);
          if (job && familyWait.indexOf(job) < 0) familyWait.push(job);
        });
      });
    }
    current = next;
    if (!(opts && opts.fromHistory)) recordPage(next);
    setNavActive(current);
    closeSidebar();
    closeMoreSheet();
    syncThemeChrome();
    const mod = window.ChengProModules[current];
    if (!mod) {
      setFullscreenEmbed(false);
      pageHost().innerHTML = '<section class="panel"><p class="empty">Unknown module.</p></section>';
      return;
    }
    const host = pageHost();
    host.innerHTML = '<section class="panel"><p class="empty">Loading…</p></section>';
    try {
      if (familyWait.length) {
        /* Wait for the program being left to finish saving, but not for ever: a slow save
           used to leave "Loading…" on screen with nothing coming. After a few seconds the
           next page opens anyway and the old frame stays off to the side until its save is
           done, then removes itself. */
        const finished = await Promise.race([
          Promise.all(familyWait).then(() => true, () => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
        ]);
        if (finished) {
          backgroundWraps().forEach((wrap) => {
            if (wrap.querySelector('iframe') && wrap.querySelector('iframe').dataset.aioFamily === nextFamily) {
              wrap.querySelectorAll('iframe').forEach((frame) => { delete frame.dataset.aioHold; });
              wrap.remove();
            }
          });
        }
      }
      /* A newer click already opened another page while this one waited: painting now would put this page
         (an e-ORB or Spares frame, say) on top of the page the person is actually on. */
      if (current !== next) return;
      const draw = pageHost();
      await mod.render(draw);
      if (current !== next) {
        /* Another page was opened while this one was drawing. If that one has already finished, this one has
           just painted over it: draw the current page again. If not, it will replace this one itself. */
        if (settledPage === current) setTimeout(() => navigate(current, { force: true, allowDuringLoad: true }), 0);
        return;
      }
      settledPage = next;
      if (current !== 'bunkerplan' && current !== 'bunkeringplan') dropStraySuiteChrome();
      draw.querySelectorAll('iframe.aio-embed-frame').forEach((frame) => {
        frame.dataset.aioModule = current;
        frame.dataset.aioFamily = embedFamily(current);
      });
      const embedded = !!main.querySelector('.aio-embed-wrap:not(.aio-background-save)');
      setFullscreenEmbed(embedded && isSoftEmbedModule(current));
      /* Re-apply after rotate: Android stays fullscreen; Windows stays with chrome. */
      if (!window.__aioFsOrientBound) {
        window.__aioFsOrientBound = true;
        const reapply = () => {
          if (!document.querySelector('.aio-embed-wrap:not(.aio-background-save)')) return;
          if (isSoftEmbedModule(current)) {
            setFullscreenEmbed(true);
          }
        };
        window.addEventListener('orientationchange', () => setTimeout(reapply, 120));
        window.addEventListener('resize', () => {
          clearTimeout(window.__aioFsResizeTimer);
          window.__aioFsResizeTimer = setTimeout(reapply, 160);
        });
      }
    } catch (e) {
      /* A page that finished late, after another one was opened, must not put its
         error over the page now showing. */
      if (current !== next) return;
      setFullscreenEmbed(false);
      pageHost().innerHTML = `<section class="panel"><p class="empty">${escapeHtml(e.message)}</p></section>`;
    }
  }

  /** True on Android APK / Android browser — floating nav, full-width home. */
  function isAndroidNav() {
    try {
      const cap = window.Capacitor;
      const plat = cap && cap.getPlatform ? String(cap.getPlatform()) : '';
      if (plat === 'android') return true;
    } catch { /* ignore */ }
    try {
      if (window.ChengLicense && typeof ChengLicense.detectSeat === 'function'
          && ChengLicense.detectSeat() === 'android') {
        return true;
      }
    } catch { /* ignore */ }
    const ua = navigator.userAgent || '';
    return /Android/i.test(ua);
  }

  /** Phone / tablet chrome — bottom bar in both orientations, like Voyage/Tank. */
  function wantsBottomNav() {
    try {
      const cap = window.Capacitor;
      const plat = cap && cap.getPlatform ? String(cap.getPlatform()) : '';
      const native = !!(cap && (cap.isNativePlatform ? cap.isNativePlatform() : (plat && plat !== 'web')));
      const ua = navigator.userAgent || '';
      const mobileOs = /Android|iPhone|iPad|iPod/i.test(ua) || plat === 'android' || plat === 'ios';
      if (native || mobileOs) return true;
      const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
        || ((navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width, screen.height) <= 1100);
      const vw = window.innerWidth || 0;
      /* WIDTH decides, never height.
         This used to read `Math.min(vw, vh) <= 900`, so a 1440x900 desktop --
         or any laptop, or a maximised window on a 1080p screen, where the
         inner height lands under 900 -- was classified as a phone. Every
         desktop layout rule is written `:not(.use-bottom-nav)`, so that one
         test switched off the pinned shell and the scrolling pane, and the
         whole window scrolled instead. A short window is still a desktop.
         The same went for `screen` min side, which is 900 on a 1600x900
         monitor and 768 on a 1366x768 laptop. */
      if (touch || (vw > 0 && vw <= 1180)) {
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  function applyAndroidNavShell() {
    const on = isAndroidNav();
    const bottom = wantsBottomNav();
    document.documentElement.classList.toggle('aio-android-nav', on);
    document.body.classList.toggle('aio-android-nav', on);
    document.documentElement.classList.toggle('use-bottom-nav', bottom);
    if (navFab) navFab.hidden = !on || bottom;
    if (!on) {
      document.documentElement.classList.remove('sidebar-collapsed');
      closeSidebar();
    }
    if (bottom) closeSidebar();
  }

  /** Full webapp embeds on Android and Windows/Electron — hide AIO chrome around Voyage/Tank. */
  function wantsFullscreenEmbed() {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
    try {
      if (window.ChengLicense && typeof ChengLicense.detectSeat === 'function') {
        const seat = ChengLicense.detectSeat();
        if (seat === 'android' || seat === 'windows' || seat === 'desktop') return true;
      }
    } catch { /* ignore */ }
    try {
      const cap = window.Capacitor;
      const plat = cap && cap.getPlatform ? String(cap.getPlatform()) : '';
      if (plat === 'android' || plat === 'ios' || plat === 'electron') return true;
    } catch { /* ignore */ }
    try {
      if (window.ChengSaveFile && typeof ChengSaveFile.isElectron === 'function' && ChengSaveFile.isElectron()) {
        return true;
      }
    } catch { /* ignore */ }
    if (/Electron/i.test(ua)) return true;
    /* Windows desktop browser / Electron shell: treat as full webapp for embeds. */
    if (/Windows/i.test(ua) && !/Mobile/i.test(ua)) return true;
    return false;
  }

  function syncThemeChrome() {
    const onHome = current === 'home';
    document.documentElement.classList.toggle('aio-on-home', onHome);
    document.body.classList.toggle('aio-on-home', onHome);
    /* Voyage, Tank, and the other program embeds carry their own look.
       Pages that exist only in the suite get the whole-ship plate. */
    const suite = !isSoftEmbedModule(current);
    document.documentElement.classList.toggle('aio-suite', suite);
    document.body.classList.toggle('aio-suite', suite);
  }

  /**
   * What the embed strip says while a module is open.
   *
   * The module name comes off the nav item that opened it, so the strip and
   * the sidebar can never disagree about what this screen is called. The
   * vessel is there because a module cannot tell you: open Tank Chief and
   * nothing on screen says which ship the suite has active, which is a poor
   * position to be in before you print a sounding sheet.
   */
  function fillEmbedBar() {
    const nameEl = document.getElementById('aioEmbedModule');
    const vesselEl = document.getElementById('aioEmbedVessel');
    if (nameEl) {
      const nav = document.querySelector(`.nav-item[data-module="${current}"]`);
      nameEl.textContent = (nav && nav.textContent.trim()) || '';
    }
    if (vesselEl) {
      let label = '';
      try {
        const v = ChengPro.vessel.getActive();
        if (v) label = v.name + (v.imo ? ' · ' + v.imo : '');
      } catch { /* a vessel list that will not load is the list's problem */ }
      vesselEl.textContent = label || 'No vessel selected';
    }
  }

  function setFullscreenEmbed(on) {
    const active = !!on && wantsFullscreenEmbed();
    document.documentElement.classList.toggle('aio-fullscreen-embed', active);
    document.body.classList.toggle('aio-fullscreen-embed', active);
    /* Consumption Plan, Bunkering Plan and e-ORB keep the AIO main menu on screen; the others bring their own. */
    const withMenu = active && (current === 'bunkerplan' || current === 'bunkeringplan' || current === 'eorb' || current === 'eca' || current === 'spares');
    document.documentElement.classList.toggle('aio-embed-menu', withMenu);
    /* Where the theme button lives in a More menu, the strip's own copy is not needed. */
    const themeInMore = active && ['voyage', 'tanks', 'bunkerplan', 'bunkeringplan', 'eorb', 'eca', 'spares'].includes(current);
    document.documentElement.classList.toggle('aio-theme-in-more', themeInMore);
    if (active) {
      closeSidebar();
      closeMoreSheet();
    }
    const cluster = document.getElementById('aioReturnFabs');
    if (cluster) cluster.hidden = !active;
    const fab = document.getElementById('aioHomeFab');
    if (fab) fab.hidden = !active;
    if (active) fillEmbedBar();
    syncThemeChrome();
  }

  function applyLicenseNav() {
    if (!window.ChengLicense) return;
    const ent = ChengLicense.loadEntitlement();
    document.querySelectorAll('.nav-item, .bottom-item, .bn-more-item').forEach((el) => {
      const mod = el.dataset.module;
      if (mod === 'more') return;
      if (!ChengLicense.isValid(ent)) {
        el.hidden = false;
        el.classList.remove('nav-warn');
        el.removeAttribute('title');
        return;
      }
      const allowed = ChengLicense.modulesAllowed(ent);
      const soft = mod === 'voyage' || mod === 'tanks' || mod === 'eorb' || mod === 'bunkerplan' || mod === 'bunkeringplan';
      if (mod === 'about' || mod === 'home' || mod === 'license' || mod === 'notes') {
        el.hidden = false;
        el.classList.remove('nav-warn');
        el.removeAttribute('title');
        return;
      }
      if (soft) {
        /* Always show; warn when the program is not on the AIO key. */
        el.hidden = false;
        const ok = allowed.includes(mod);
        el.classList.toggle('nav-warn', !ok);
        el.title = ok ? '' : 'Not included on this license';
        return;
      }
      el.hidden = !(allowed.includes(mod) || mod === 'home' || mod === 'license');
      el.classList.remove('nav-warn');
      el.removeAttribute('title');
    });
    updateSidebarMeta();
  }

  function resolveAppVersion() {
    const stamped = String(window.CHENG_PRO_VERSION || '').replace(/^v/i, '').trim();
    return stamped || '';
  }

  function updateSidebarMeta() {
    const verEls = [
      document.getElementById('headerVersion'),
      document.getElementById('sidebarVersion'),
    ];
    const regEls = [
      document.getElementById('headerRegistered'),
      document.getElementById('sidebarRegistered'),
    ];
    const authorEl = document.getElementById('sidebarAuthor');
    const ver = resolveAppVersion();
    const verText = ver ? ('v' + ver) : '';
    verEls.forEach((el) => { if (el) el.textContent = verText; });
    let email = '';
    try {
      if (window.ChengLicense && typeof ChengLicense.licenseEmail === 'function') {
        email = String(ChengLicense.licenseEmail() || '').trim();
      }
    } catch (_e) { /* ignore */ }
    /* The address alone: "registered:" is added by CSS where there is room (a phone showed "registered: ch…"). */
    regEls.forEach((el) => {
      if (!el) return;
      el.textContent = email;
      el.title = email ? 'Registered license: ' + email : '';
    });
    if (authorEl) {
      authorEl.textContent = window.CHENG_PRO_AUTHOR || 'ts0gs · Marvin C. Endozo';
    }
  }

  function showToast(msg, ms) {
    toastEl.hidden = false;
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 3200);
  }
  toastEl.addEventListener('click', () => { toastEl.hidden = true; clearTimeout(toastTimer); });

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error((label || 'Operation') + ' timed out')), ms);
      Promise.resolve(promise).then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  document.querySelectorAll('.nav-item, .bottom-item').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.module === 'more') {
        toggleMoreSheet();
        return;
      }
      navigate(el.dataset.module);
    });
  });
  document.querySelectorAll('#bnMoreSheet .bn-more-item').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.module));
  });
  moreSheet?.addEventListener('click', (e) => {
    if (e.target === moreSheet) closeMoreSheet();
  });

  function toggleNavMenu() {
    /* Bottom-nav tablets have More instead of a hamburger. */
    if (wantsBottomNav()) return;
    /* Windows / desktop: left sidebar is always visible — no toggle. */
    if (!isAndroidNav() && window.matchMedia('(min-width: 901px)').matches) return;
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  }

  applyAndroidNavShell();
  window.addEventListener('resize', () => {
    clearTimeout(window.__aioNavResizeTimer);
    window.__aioNavResizeTimer = setTimeout(applyAndroidNavShell, 140);
  });
  window.addEventListener('orientationchange', () => setTimeout(applyAndroidNavShell, 120));
  menuBtn?.addEventListener('click', toggleNavMenu);
  navFab?.addEventListener('click', toggleNavMenu);
  backdrop.addEventListener('click', closeSidebar);

  document.getElementById('brandHome')?.addEventListener('click', () => navigate('home'));
  document.getElementById('brandHome')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate('home');
    }
  });
  document.getElementById('aioHomeFab')?.addEventListener('click', () => navigate('home'));

  function conditionWord(cond) {
    return String(cond || '').toUpperCase() === 'L' ? 'laden' : 'ballast';
  }

  function frameBySrc(pattern) {
    return [...document.querySelectorAll('iframe')].find((frame) => pattern.test(frame.getAttribute('src') || ''));
  }

  function vesselPayload(vessel) {
    if (!vessel) return null;
    return {
      id: vessel.id,
      imo: vessel.imo || '',
      name: vessel.name || '',
      slug: vessel.voyageSlug || vessel.slug || vessel.id || '',
    };
  }

  function waitForProgramLoad(program, ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        resolve(null);
      }, ms);
      function onMsg(ev) {
        const data = ev && ev.data;
        if (!data || data.type !== 'chengaio-vessel-data-loaded' || data.program !== program) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(data);
      }
      window.addEventListener('message', onMsg);
    });
  }

  function postVesselLoad(frame, vessel) {
    try {
      frame.contentWindow.postMessage({
        type: 'chengaio-load-vessel-data',
        loadLatest: true,
        vessel: vesselPayload(vessel),
      }, '*');
    } catch { /* ignore */ }
  }

  async function activateTankVessel(vessel) {
    let status;
    try {
      status = await ChengProApi.api('/tanks/api/status');
    } catch {
      return { ok: false, note: 'Tank Chief data is not available on this device yet' };
    }
    const list = (status && status.vessels) || [];
    const match = window.ChengProVoyageBridge && typeof ChengProVoyageBridge.resolveFromList === 'function'
      ? ChengProVoyageBridge.resolveFromList(list, vessel)
      : list.find((row) => row.id === vessel.id);
    if (!match || !match.id) return { ok: false, note: 'Tank Chief has no record for this ship yet' };
    await ChengProApi.api('/tanks/api/vessels/active', {
      method: 'POST',
      body: JSON.stringify({ id: match.id }),
    });
    return { ok: true, name: match.name || vessel.name || 'this ship' };
  }

  async function loadVoyageForVessel(vessel) {
    const open = frameBySrc(/voyage_manager\.html|\/voyage\//i);
    if (open) {
      const pending = waitForProgramLoad('voyage', 90000);
      postVesselLoad(open, vessel);
      return pending;
    }
    try { sessionStorage.setItem('chengAioLoadLatest', '1'); } catch { /* ignore */ }
    const frame = document.createElement('iframe');
    frame.className = 'vessel-load-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    const pending = waitForProgramLoad('voyage', 90000);
    const url = ChengPro.voyageEmbedUrl();
    frame.src = url + (url.includes('?') ? '&' : '?') + 'aioLoadLatest=1';
    document.body.appendChild(frame);
    try {
      return await pending;
    } finally {
      try { sessionStorage.removeItem('chengAioLoadLatest'); } catch { /* ignore */ }
      frame.remove();
    }
  }

  async function loadTankForVessel(vessel) {
    const open = frameBySrc(/\/tanks\//i);
    if (open) {
      const pending = waitForProgramLoad('tanks', 20000);
      postVesselLoad(open, vessel);
      const fromFrame = await pending;
      if (fromFrame) {
        return fromFrame.ok === false
          ? { ok: false, note: fromFrame.error || 'Tank Chief has no record for this ship yet' }
          : { ok: true, name: vessel.name || 'this ship' };
      }
    }
    return activateTankVessel(vessel);
  }

  function programFrames() {
    return [...document.querySelectorAll('iframe')].filter((frame) => {
      const src = frame.getAttribute('src') || '';
      return /voyage_manager\.html|\/voyage\/|\/tanks\//i.test(src);
    });
  }

  function flushFrames(frames) {
    const list = frames || [];
    if (!list.length) return Promise.resolve([]);
    return Promise.all(list.map((frame) => new Promise((resolve) => {
      const nonce = Math.random().toString(36).slice(2);
      const timer = setTimeout(finish, 90000);
      function onMsg(e) {
        const data = e && e.data;
        if (!data || data.type !== 'chengaio-unsaved-flushed') return;
        if (e.source !== frame.contentWindow) return;
        if (data.nonce && data.nonce !== nonce) return;
        finish(data);
      }
      function finish(data) {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(data || {});
      }
      window.addEventListener('message', onMsg);
      try {
        if (!frame.contentWindow) { finish(); return; }
        frame.contentWindow.postMessage({ type: 'chengaio-flush-unsaved', nonce: nonce }, '*');
      } catch {
        finish();
      }
    })));
  }

  function flushOpenProgramFrames() {
    return flushFrames(programFrames());
  }

  async function saveOpenShellDrafts() {
    const noteForm = document.getElementById('noteForm');
    const noteTitle = document.getElementById('noteTitle');
    const noteBody = document.getElementById('noteBody');
    if (noteForm && ((noteTitle && noteTitle.value.trim()) || (noteBody && noteBody.value.trim()))) {
      noteForm.requestSubmit();
    }
    if (typeof window.ChengProFlushVesselForm === 'function') {
      await window.ChengProFlushVesselForm();
    }
  }

  window.ChengProFlushBeforeVesselChange = async function () {
    await saveOpenShellDrafts();
    const flushed = await flushOpenProgramFrames();
    if (flushed.some((row) => row && row.keptLog)) unfinishedLogKept = true;
  };

  async function loadSelectedVesselData() {
    const id = activeSelect.value;
    if (!id) {
      showToast('Select a vessel first', 4000);
      return;
    }
    if (vesselLoadDepth > 0) return;
    const known = ChengPro.vessel.getListSync().find((row) => row.id === id);
    const name = (known && known.name) || 'this ship';
    const btn = document.getElementById('btnLoadVesselData');
    if (btn) btn.disabled = true;
    const here = current;
    vesselLoadDepth += 1;
    holdParkedFrames();
    setVesselLoadHold(true, name, 'Saving the open ship on this device.');
    try { sessionStorage.setItem('chengAioLoadInProgress', '1'); } catch { /* ignore */ }
    try {
      await ChengPro.vessel.setActive(id);
      const keptLog = unfinishedLogKept;
      unfinishedLogKept = false;
      const vessel = ChengPro.vessel.getActive() || known || { id, name };
      setVesselLoadHold(true, vessel.name || name, 'Opening voyage logs and tank records.');
      const [voyage, tank] = await Promise.all([
        loadVoyageForVessel(vessel),
        loadTankForVessel(vessel),
      ]);
      /* Stay on this page. Refreshing it shows the new ship; sending the
         operator to Home is what the load used to do when a click landed
         while the save was still running. */
      if (current !== here) current = here;
      if (!isSoftEmbedModule(current)) await navigate(current, { force: true, allowDuringLoad: true });
      fillEmbedBar();
      if (window.ChengWatchStrip && ChengWatchStrip.refresh) ChengWatchStrip.refresh();
      const lines = ['Loaded ' + (vessel.name || name) + '.'];
      if (voyage && voyage.loaded === 'error') {
        lines.push('Voyage Chief could not open (' + (voyage.error || 'failed') + ').');
      } else if (voyage && voyage.voyageNumber && (voyage.loaded === 'working' || voyage.loaded === 'latest')) {
        lines.push(
          'Voyage ' + voyage.voyageNumber + ' ' + conditionWord(voyage.condition)
          + ' is the current log (' + (Number(voyage.entryCount) || 0) + ' entries).'
        );
      } else if (!voyage) {
        lines.push('Voyage Chief did not finish opening. Open Voyage Chief once if this ship is new on this device.');
      } else {
        lines.push('Voyage Chief has no saved log for this ship yet.');
      }
      lines.push(tank && tank.ok ? 'Tank Chief is on this ship.' : ((tank && tank.note) || 'Tank Chief was not updated.'));
      lines.push('Notes and the other records for this ship are the ones now in use.');
      if (keptLog) {
        lines.push('The unfinished log line stays with the ship you left. Open that ship and it is back on the form.');
      }
      showToast(lines.join(' '), 7000);
      try { sessionStorage.removeItem('chengAioLoadInProgress'); } catch { /* ignore */ }
      notifyProgramFramesOfVessel(vessel);
    } catch (err) {
      showToast(err.message || 'Could not load vessel data', 5000);
      try { await fillVesselSelect(); } catch { /* ignore */ }
      try { sessionStorage.removeItem('chengAioLoadInProgress'); } catch { /* ignore */ }
    } finally {
      releaseParkedFrames();
      vesselLoadDepth = Math.max(0, vesselLoadDepth - 1);
      setVesselLoadHold(false);
      if (btn) btn.disabled = false;
    }
  }

  /* The list only chooses a ship. Load vessel data is what opens its records. */
  document.getElementById('btnLoadVesselData')?.addEventListener('click', () => {
    loadSelectedVesselData().catch((e) => showToast(e.message || 'Could not load vessel data', 5000));
  });

  /* The vessel on screen must be the active one, whichever route changed it.
     Only the switcher's own change handler used to re-render, so activating a
     ship from Vessel Setup's fleet register -- or creating one, which activates
     it -- left every other page still showing the ship before it. The engineer
     then read one vessel's name on a page while the suite worked on another.

     Re-rendering here covers every caller of setActive at once, including the
     ones added later. An embedded module is not re-rendered: it holds its own
     state and hears about the change over chengaio-vessel-changed, and
     reloading its frame would throw away whatever is half-entered in it. */
  let vesselRepaintTimer = null;
  ChengPro.vessel.subscribe(() => {
    fillVesselSelect();
    /* The strip carries the active vessel, and the switcher it mirrors is
       hidden while a module is open — so it has to hear about the change
       from here rather than from the select. */
    fillEmbedBar();
    if (window.ChengWatchStrip) ChengWatchStrip.refresh();
    if (!booted) return;
    /* Coalesced: setActive then refresh can both land, and rendering the page
       twice in a row flickers and doubles the work. */
    clearTimeout(vesselRepaintTimer);
    vesselRepaintTimer = setTimeout(() => {
      if (vesselLoadDepth > 0) return;
      try { if (sessionStorage.getItem('chengAioLoadInProgress') === '1') return; } catch { /* ignore */ }
      if (isSoftEmbedModule(current)) return;
      navigate(current, { force: true });
    }, 0);
  });

  window.addEventListener('chengpro:navigate', (e) => {
    const d = e && e.detail;
    if (d && typeof d === 'object' && d.module) {
      navigate(String(d.module), { force: !!d.force });
    } else {
      navigate(d);
    }
  });
  /* Tank / Voyage embeds postMessage when MAIN MENU (etc.) needs the AIO shell. */
  window.addEventListener('message', (e) => {
    const d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'chengpro-navigate' && d.module) {
      navigate(String(d.module));
    }
    if (d.type === 'chengaio-navigate' && d.module) {
      const page = d.page ? String(d.page) : '';
      if (page && d.module === 'tanks') {
        try { sessionStorage.setItem('chengAioPendingTankPage', page); } catch { /* ignore */ }
      }
      if (page && (d.module === 'voyage' || d.module === 'spares' || d.module === 'eca')) {
        try { sessionStorage.setItem('chengAioPendingVoyagePage', page); } catch { /* ignore */ }
      }
      const mod = String(d.module);
      navigate(mod, { force: true });
    }
    if (d.type === 'chengaio-bunker-alert') {
      onBunkerAlertBeat(e.source, d);
    }
    if (d.type === 'chengaio-request-tank-rob') {
      answerTankRob(e.source);
    }
    if (d.type === 'chengaio-request-tank-list') {
      answerTankList(e.source);
    }
  });

  /* The Tank embed's bunkering alarm, mirrored on the whole window edge so it is
     seen from any module. The embed sends a beat while a tank is inside its
     five-minute window; if the beats stop (embed closed, plan paused) the glow
     goes out on its own. Only our own embed frames are believed. */
  let bunkerAlertTimer = null;
  let bunkerAlertFrame = null;
  function setBunkerEdge(on) {
    document.documentElement.classList.toggle('aio-bunker-alert', !!on);
  }
  function endBunkerAlert() {
    if (bunkerAlertTimer) { clearTimeout(bunkerAlertTimer); bunkerAlertTimer = null; }
    const frame = bunkerAlertFrame;
    bunkerAlertFrame = null;
    setBunkerEdge(false);
    /* If it was only being kept for the warning, let it go now. */
    if (frame) dropParkedFrame(frame);
  }
  function onBunkerAlertBeat(source, d) {
    const frame = [...document.querySelectorAll('iframe.aio-embed-frame')]
      .find((f) => f.contentWindow && f.contentWindow === source);
    if (!frame) return;
    if (!d.active) { if (frame === bunkerAlertFrame) endBunkerAlert(); return; }
    if (bunkerAlertTimer) clearTimeout(bunkerAlertTimer);
    bunkerAlertFrame = frame;
    setBunkerEdge(true);
    bunkerAlertTimer = setTimeout(endBunkerAlert, 12000);
  }

  let _tankRobFrame = null;
  /* The e-ORB's "get tanks from Tank Chief": ask the (hidden) Tank frame for its fuel
     and lube oil tanks and hand the list back to whoever asked. */
  function answerTankList(source) {
    let done = false;
    const deliver = (tanks) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      try {
        if (source && source.postMessage) source.postMessage({ type: 'tank-list-response', tanks: tanks }, '*');
      } catch { /* ignore */ }
    };
    const onMsg = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'tank-list-response' && msg.tanks) deliver(msg.tanks);
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => deliver(null), 40000);
    const ask = () => {
      try { _tankRobFrame.contentWindow.postMessage({ type: 'request-tank-list' }, '*'); } catch { /* ignore */ }
    };
    if (_tankRobFrame && _tankRobFrame.contentWindow) { ask(); return; }
    _tankRobFrame = document.createElement('iframe');
    _tankRobFrame.style.cssText = 'position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;';
    _tankRobFrame.title = 'Tank ROB bridge';
    _tankRobFrame.src = ChengPro.tankEmbedUrl({ robOnly: '1' });
    document.body.appendChild(_tankRobFrame);
    _tankRobFrame.onload = () => { setTimeout(ask, 600); };
  }
  function answerTankRob(source) {
    const deliver = (rob) => {
      try {
        if (source && source.postMessage) source.postMessage({ type: 'tank-rob-response', rob: rob }, '*');
      } catch { /* ignore */ }
    };
    if (_tankRobFrame && _tankRobFrame.contentWindow) {
      const onMsg = (ev) => {
        const msg = ev.data || {};
        if (msg.type !== 'tank-rob-response' || !msg.rob) return;
        window.removeEventListener('message', onMsg);
        deliver(msg.rob);
      };
      window.addEventListener('message', onMsg);
      try { _tankRobFrame.contentWindow.postMessage({ type: 'request-tank-rob' }, '*'); } catch { /* ignore */ }
      return;
    }
    _tankRobFrame = document.createElement('iframe');
    _tankRobFrame.style.cssText = 'position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;';
    _tankRobFrame.title = 'Tank ROB bridge';
    _tankRobFrame.src = ChengPro.tankEmbedUrl({ robOnly: '1' });
    document.body.appendChild(_tankRobFrame);
    const onMsg = (ev) => {
      const msg = ev.data || {};
      if (msg.type !== 'tank-rob-response' || !msg.rob) return;
      window.removeEventListener('message', onMsg);
      deliver(msg.rob);
    };
    window.addEventListener('message', onMsg);
    _tankRobFrame.onload = () => {
      setTimeout(() => {
        try { _tankRobFrame.contentWindow.postMessage({ type: 'request-tank-rob' }, '*'); } catch { /* ignore */ }
      }, 800);
    };
  }
  window.addEventListener('chengpro:toast', (e) => showToast(e.detail));
  window.addEventListener('chengpro:license-changed', async () => {
    applyLicenseNav();
    updateSidebarMeta();
    try {
      await ChengPro.vessel.refresh();
    } catch { /* ignore */ }
    if (window.ChengProVoyageBridge) {
      try {
        const result = await ChengProVoyageBridge.autoImportIfNeeded();
        if (result && result.ok && (result.imported || result.updated)) {
          await ChengPro.vessel.refresh();
          showToast(result.message);
        }
      } catch (e) {
        console.warn('Voyage vessel import after license:', e.message);
      }
    }
    await fillVesselSelect();
  });

  /**
   * Offline-first boot: paint UI immediately, then warm LocalApi.
   * Never wait on network (Google Fonts already removed; health/vessels are local).
   */
  async function boot() {
    /* The bottom of the Back stack: Back from the first page lands here. */
    try { history.replaceState({ aioRoot: true }, ''); } catch { /* ignore */ }
    if (booted) return;
    booted = true;

    /* First paint — splash covers the shell while LocalApi starts. */
    main.innerHTML = '';
    updateSidebarMeta();
    if (window.LoadingSplash) {
      LoadingSplash.update(LoadingSplash.BOOT_ID, 'Starting on this device…');
    }

    try {
      if (typeof LocalApi !== 'undefined' && LocalApi.start) {
        if (window.LoadingSplash) LoadingSplash.update(LoadingSplash.BOOT_ID, 'Opening the on-device database…');
        await withTimeout(LocalApi.start(), 20000, 'On-device database');
      }
    } catch (e) {
      console.warn('LocalApi start:', e);
      showToast(e.message || 'Could not start on-device database');
    }

    try {
      const health = await withTimeout(ChengPro.api.fetch('/api/health'), 8000, 'Health check');
      healthDot.classList.toggle('ok', !!health.ok);
      healthDot.classList.toggle('bad', !health.ok);
      updateSidebarMeta();
    } catch {
      healthDot.classList.add('bad');
    }

    try {
      if (window.LoadingSplash) LoadingSplash.update(LoadingSplash.BOOT_ID, 'Loading vessels…');
      await withTimeout(ChengPro.vessel.refresh(), 10000, 'Vessel load');
    } catch (e) {
      showToast(e.message || 'Could not load vessels yet — you can still create one offline');
    }

    if (window.ChengProVoyageBridge) {
      try {
        const result = await withTimeout(
          ChengProVoyageBridge.autoImportIfNeeded(),
          5000,
          'Voyage import'
        );
        if (result && result.ok && (result.imported || result.updated)) {
          await ChengPro.vessel.refresh();
          showToast(result.message);
        }
      } catch (e) {
        console.warn('Voyage vessel auto-import:', e.message);
      }
    }

    await fillVesselSelect();
    if (window.ChengWatchStrip) ChengWatchStrip.start();

    /* License gate — hard lock when server reports enforce (default on). */
    if (window.ChengLicense) {
      try {
        const gate = await ChengLicense.ensureLicensed();
        applyLicenseNav();
        if (!gate.ok && gate.enforced) {
          showToast('Activation required — enter your license key');
          await navigate('license');
          if (window.ChengNotes) ChengNotes.promptOnOpen();
          return;
        } else if (!gate.ok) {
          showToast('License not active — open License to activate (60-day offline grace after check)');
        } else if (ChengLicense.daysLeft(gate.entitlement) <= 7) {
          showToast('License check due in ' + ChengLicense.daysLeft(gate.entitlement) + ' days');
        }
      } catch { /* ignore */ }
    }

    const vessels = ChengPro.vessel.getListSync();
    const firstRun = !vessels.length;
    const ent = window.ChengLicense && ChengLicense.loadEntitlement();
    const canVessel = !window.ChengLicense || !ChengLicense.isValid(ent) || ChengLicense.moduleAllowed('vessel', ent);
    if (window.LoadingSplash) LoadingSplash.endBoot();
    if (firstRun && canVessel) {
      showToast('Offline ready — create your vessel to begin');
      await navigate('vessel');
    } else {
      const back = pageToResume();
      await navigate(back || 'home');
    }
    if (window.ChengNotes) ChengNotes.promptOnOpen();
  }

  boot().catch((e) => {
    console.error(e);
    if (window.LoadingSplash) LoadingSplash.endBoot();
    main.innerHTML = `<section class="panel hero">
      <h1>ChEng AIO</h1>
      <p>Could not finish startup: ${escapeHtml(e.message || 'unknown error')}.</p>
      <div class="form-actions" style="margin-top:16px">
        <button type="button" class="btn primary" id="retryBoot">Try again</button>
        <button type="button" class="btn" id="gotoVessel">Open Vessel Setup</button>
      </div>
    </section>`;
    document.getElementById('retryBoot')?.addEventListener('click', () => {
      booted = false;
      boot();
    });
    document.getElementById('gotoVessel')?.addEventListener('click', () => navigate('vessel'));
  });
})();


/* Tablet held sideways: the bar moves from the bottom edge to the left edge (class tablet-rail), so
   the short side of the screen is not spent on it. Phones and tablets held upright keep the bottom bar. */
(function(){
  function apply(){
    try{
      var w = window.innerWidth || 0, h = window.innerHeight || 0;
      var mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        || window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      document.documentElement.classList.toggle('tablet-rail', !!((mobile || (navigator.maxTouchPoints || 0) > 0) && w > h && w >= 900 && Math.min(w, h) >= 560));
    }catch(_e){}
  }
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', function(){ setTimeout(apply, 150); });
})();

/* Input boxes that sit side by side start at the same height. A long label or note over one box
   pushes it down and leaves its neighbour looking out of line, so the boxes with less above them are
   given the missing space instead. Re-run when the page changes or is resized. */
(function(){
  var CTRL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), select, textarea';
  function visible(e){
    var r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(e);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function clear(){
    document.querySelectorAll('[data-fa]').forEach(function(e){
      e.style.marginTop = e.getAttribute('data-fa-prev') || '';
      e.removeAttribute('data-fa'); e.removeAttribute('data-fa-prev');
    });
  }
  function run(){
    clear();
    var ctrls = [].slice.call(document.querySelectorAll(CTRL)).filter(visible);
    var displays = new Map();
    var flexOrGrid = function(p){
      if (!displays.has(p)) displays.set(p, /grid|flex/.test(getComputedStyle(p).display));
      return displays.get(p);
    };
    var containers = new Map();
    ctrls.forEach(function(c){
      var cell = c;
      while (cell.parentElement && cell.parentElement !== document.body){
        var p = cell.parentElement;
        if (cell !== c && flexOrGrid(p)){
          var m = containers.get(p); if (!m){ m = new Map(); containers.set(p, m); }
          if (!m.has(cell)) m.set(cell, c);
          break;
        }
        cell = p;
      }
    });
    var moves = [];
    containers.forEach(function(cells){
      if (cells.size < 2) return;
      var rows = {};
      cells.forEach(function(c, cell){ var k = Math.round(cell.getBoundingClientRect().top / 4); (rows[k] = rows[k] || []).push({ cell: cell, c: c }); });
      Object.keys(rows).forEach(function(k){
        if (rows[k].length < 2) return;
        var groups = {};
        rows[k].forEach(function(x){ var g = Math.round(x.c.getBoundingClientRect().height / 8); (groups[g] = groups[g] || []).push(x); });
        Object.keys(groups).forEach(function(g){
          var list = groups[g]; if (list.length < 2) return;
          var tops = list.map(function(x){ return x.c.getBoundingClientRect().top; });
          var max = Math.max.apply(null, tops), min = Math.min.apply(null, tops);
          if (max - min < 1 || max - min >= 90) return;
          list.forEach(function(x, i){
            var diff = max - tops[i];
            if (diff < 1 || x.cell === x.c) return;
            /* The whole field moves down, so its label stays right above its box. */
            var el = null, kids = x.cell.children;
            for (var q = 0; q < kids.length; q++){ if (visible(kids[q])){ el = kids[q]; break; } }
            if (!el){ el = x.c; while (el.parentElement && el.parentElement !== x.cell) el = el.parentElement; }
            moves.push({ el: el, c: x.c, target: max });
          });
        });
      });
    });
    moves.forEach(function(m){
      m.el.setAttribute('data-fa', '1');
      m.el.setAttribute('data-fa-prev', m.el.style.marginTop || '');
    });
    /* Margins can merge with the label's own margin, so what a margin really moves the box is
       measured, and the rest is added on (twice at most). */
    for (var pass = 0; pass < 3; pass++){
      moves.forEach(function(m){
        var err = m.target - m.c.getBoundingClientRect().top;
        if (Math.abs(err) < 0.5) return;
        var cur = parseFloat(m.el.style.marginTop);
        if (isNaN(cur)) cur = parseFloat(getComputedStyle(m.el).marginTop) || 0;
        m.el.style.marginTop = Math.max(0, cur + err) + 'px';
      });
    }
  }
  var timer = null;
  function later(){ clearTimeout(timer); timer = setTimeout(function(){ try{ run(); }catch(_e){} }, 160); }
  var ignore = function(m){ return m.type === 'attributes' && m.target.hasAttribute && m.target.hasAttribute('data-fa'); };
  new MutationObserver(function(muts){ if (muts.some(function(m){ return !ignore(m); })) later(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', function(){ setTimeout(later, 200); });
  document.addEventListener('click', later, true);
  document.addEventListener('change', later, true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  window.addEventListener('load', later);
  later();
  window.alignFields = run;
})();
