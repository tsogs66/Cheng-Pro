(function () {
  const main = document.getElementById('main');
  const activeSelect = document.getElementById('activeVessel');
  const healthDot = document.getElementById('healthDot');
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toastEl = document.getElementById('toast');
  let current = 'home';
  let toastTimer = null;
  let booted = false;

  function setNavActive(module) {
    document.querySelectorAll('.nav-item, .bottom-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.module === module);
    });
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.hidden = true;
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.hidden = false;
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

  async function navigate(module) {
    let next = module || 'home';
    if (window.ChengLicense && next !== 'license') {
      try {
        const ent = ChengLicense.loadEntitlement();
        if (ChengLicense.enforceEnabled() && !ChengLicense.isValid(ent) && !ChengLicense.isEmbeddedInAio()) {
          /* Soft program tabs still open so they can show Open License (like e-ORB). */
          if (next !== 'voyage' && next !== 'tanks' && next !== 'eorb') {
            next = 'license';
            showToast('Activate a license to use the suite');
          }
        } else if (ChengLicense.isValid(ent) && !ChengLicense.moduleAllowed(next, ent)) {
          const soft = next === 'voyage' || next === 'tanks' || next === 'eorb';
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
    current = next;
    setNavActive(current);
    closeSidebar();
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
      setFullscreenEmbed(embedded && (current === 'voyage' || current === 'tanks' || current === 'eorb'));
    } catch (e) {
      setFullscreenEmbed(false);
      main.innerHTML = `<section class="panel"><p class="empty">${escapeHtml(e.message)}</p></section>`;
    }
  }

  function setFullscreenEmbed(on) {
    document.documentElement.classList.toggle('aio-fullscreen-embed', !!on);
    document.body.classList.toggle('aio-fullscreen-embed', !!on);
    if (on) closeSidebar();
    const fab = document.getElementById('aioHomeFab');
    if (fab) fab.hidden = !on;
  }

  function applyLicenseNav() {
    if (!window.ChengLicense) return;
    const ent = ChengLicense.loadEntitlement();
    document.querySelectorAll('.nav-item, .bottom-item').forEach((el) => {
      const mod = el.dataset.module;
      if (!ChengLicense.isValid(ent)) {
        el.hidden = false;
        el.classList.remove('nav-warn');
        el.removeAttribute('title');
        return;
      }
      const allowed = ChengLicense.modulesAllowed(ent);
      const soft = mod === 'voyage' || mod === 'tanks' || mod === 'eorb';
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
    el.addEventListener('click', () => navigate(el.dataset.module));
  });

  menuBtn.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
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
      await navigate(current);
    } catch (e) {
      showToast(e.message);
      await fillVesselSelect();
    }
  });

  ChengPro.vessel.subscribe(() => {
    fillVesselSelect();
  });

  window.addEventListener('chengpro:navigate', (e) => navigate(e.detail));
  window.addEventListener('chengpro:toast', (e) => showToast(e.detail));
  window.addEventListener('chengpro:license-changed', async () => {
    applyLicenseNav();
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

    /* First paint — do not leave #main empty while LocalApi starts. */
    main.innerHTML = '<section class="panel"><p class="empty">Starting on this device…</p></section>';

    try {
      if (typeof LocalApi !== 'undefined' && LocalApi.start) {
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
      const verEl = document.getElementById('appVersion');
      if (verEl) {
        const ver = health.version || health.appVersion;
        if (ver) verEl.textContent = 'v' + String(ver).replace(/^v/, '');
      }
    } catch {
      healthDot.classList.add('bad');
    }

    try {
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
    if (firstRun && canVessel) {
      showToast('Offline ready — create your vessel to begin');
      await navigate('vessel');
    } else {
      await navigate('home');
    }
  }

  boot().catch((e) => {
    console.error(e);
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
