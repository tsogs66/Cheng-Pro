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
  let toastTimer = null;
  let booted = false;
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
    return id === 'voyage' || id === 'tanks' || id === 'eorb' || id === 'bunkerplan' || id === 'bunkeringplan';
  }

  async function navigate(module, opts) {
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
      main.querySelector('.aio-embed-wrap iframe.aio-embed-frame')
    ) {
      setNavActive(current);
      closeSidebar();
      const embedded = !!main.querySelector('.aio-embed-wrap');
      setFullscreenEmbed(embedded);
      syncThemeChrome();
      return;
    }
    current = next;
    setNavActive(current);
    closeSidebar();
    closeMoreSheet();
    syncThemeChrome();
    const mod = window.ChengProModules[current];
    if (!mod) {
      setFullscreenEmbed(false);
      main.innerHTML = '<section class="panel"><p class="empty">Unknown module.</p></section>';
      return;
    }
    main.innerHTML = '<section class="panel"><p class="empty">Loading…</p></section>';
    try {
      await mod.render(main);
      const embedded = !!main.querySelector('.aio-embed-wrap');
      setFullscreenEmbed(embedded && isSoftEmbedModule(current));
      /* Re-apply after rotate: Android stays fullscreen; Windows stays with chrome. */
      if (!window.__aioFsOrientBound) {
        window.__aioFsOrientBound = true;
        const reapply = () => {
          if (!document.querySelector('.aio-embed-wrap')) return;
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
      main.innerHTML = `<section class="panel"><p class="empty">${escapeHtml(e.message)}</p></section>`;
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
      const vh = window.innerHeight || 0;
      const screenMin = Math.min(screen.width || 0, screen.height || 0);
      if (touch || screenMin <= 900 || (Math.min(vw, vh) > 0 && Math.min(vw, vh) <= 900) || (vw > 0 && vw <= 1180)) {
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
      if (mod === 'about' || mod === 'home' || mod === 'license') {
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

  function showToast(msg) {
    toastEl.hidden = false;
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
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

  activeSelect.addEventListener('change', async () => {
    try {
      await ChengPro.vessel.setActive(activeSelect.value || null);
      showToast(activeSelect.value ? 'Active vessel updated' : 'No active vessel');
      await navigate(current, { force: true });
    } catch (e) {
      showToast(e.message);
      await fillVesselSelect();
    }
  });

  ChengPro.vessel.subscribe(() => {
    fillVesselSelect();
    /* The strip carries the active vessel, and the switcher it mirrors is
       hidden while a module is open — so it has to hear about the change
       from here rather than from the select. */
    fillEmbedBar();
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
  });
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

    /* License gate — hard lock when server reports enforce (default on). */
    if (window.ChengLicense) {
      try {
        const gate = await ChengLicense.ensureLicensed();
        applyLicenseNav();
        if (!gate.ok && gate.enforced) {
          showToast('Activation required — enter your license key');
          await navigate('license');
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
