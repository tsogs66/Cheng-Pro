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
    current = module || 'home';
    setNavActive(current);
    closeSidebar();
    const mod = window.ChengProModules[current];
    if (!mod) {
      main.innerHTML = '<section class="panel"><p class="empty">Unknown module.</p></section>';
      return;
    }
    main.innerHTML = '<section class="panel"><p class="empty">Loading…</p></section>';
    try {
      await mod.render(main);
    } catch (e) {
      main.innerHTML = `<section class="panel"><p class="empty">${escapeHtml(e.message)}</p></section>`;
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
    el.addEventListener('click', () => navigate(el.dataset.module));
  });

  menuBtn.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);

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

    const vessels = ChengPro.vessel.getListSync();
    const firstRun = !vessels.length;
    if (firstRun) {
      showToast('Offline ready — create your vessel to begin');
      await navigate('vessel');
    } else {
      await navigate('home');
    }
  }

  boot().catch((e) => {
    console.error(e);
    main.innerHTML = `<section class="panel hero">
      <h1>Cheng-Pro</h1>
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
