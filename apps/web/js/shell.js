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
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  async function boot() {
    try {
      const health = await ChengPro.api.fetch('/api/health');
      healthDot.classList.toggle('ok', !!health.ok);
      healthDot.classList.toggle('bad', !health.ok);
    } catch {
      healthDot.classList.add('bad');
    }
    try {
      await ChengPro.vessel.refresh();
    } catch (e) {
      showToast(e.message);
    }
    await fillVesselSelect();
    await navigate('home');
  }

  boot();
})();
