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
    return id === 'voyage' || id === 'tanks' || id === 'eorb' || id === 'bunkerplan' || id === 'bunkeringplan' || id === 'spares';
  }

  /** Voyage-family and Tank-family embeds each keep one database. */
  function embedFamily(moduleId) {
    if (moduleId === 'tanks' || moduleId === 'bunkeringplan') return 'tanks';
    if (moduleId === 'voyage' || moduleId === 'eorb' || moduleId === 'bunkerplan' || moduleId === 'spares') return 'voyage';
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

  function showReclaimedFrame(wrap) {
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
    wraps.forEach((wrap) => wrap.classList.add('aio-background-save'));
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
    const leavingEmbed = isSoftEmbedModule(current) && current !== next;
    const saveJob = leavingEmbed ? startBackgroundSave(current) : null;
    const parked = !force ? reclaimParkedFrame(next) : null;
    if (parked) {
      current = next;
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
        await Promise.all(familyWait);
        backgroundWraps().forEach((wrap) => {
          if (wrap.querySelector('iframe') && wrap.querySelector('iframe').dataset.aioFamily === nextFamily) {
            wrap.querySelectorAll('iframe').forEach((frame) => { delete frame.dataset.aioHold; });
            wrap.remove();
          }
        });
      }
      const draw = pageHost();
      await mod.render(draw);
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
    const regText = email ? ('registered: ' + email) : '';
    regEls.forEach((el) => { if (el) el.textContent = regText; });
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
      if (page && (d.module === 'voyage' || d.module === 'spares')) {
        try { sessionStorage.setItem('chengAioPendingVoyagePage', page); } catch { /* ignore */ }
      }
      const mod = d.module === 'spares' ? 'spares' : String(d.module);
      navigate(mod, { force: true });
    }
    if (d.type === 'chengaio-request-tank-rob') {
      answerTankRob(e.source);
    }
  });

  let _tankRobFrame = null;
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
      await navigate('home');
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
