window.ChengProModules = window.ChengProModules || {};

function bunkeringLicenseNeededPanel(title, message) {
  return `
    <section class="panel">
      <h2>${title}</h2>
      <p class="empty">${message}</p>
      <div class="form-actions">
        <button type="button" class="btn primary" data-go="license">Open License</button>
        <button type="button" class="btn" data-go="home">Back to Home</button>
      </div>
    </section>`;
}

function bunkeringBindNav(root) {
  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.onclick = () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
  });
}

/* Bunkering Plan is its own program on the key — a Tank Chief tick alone
   no longer carries it, so an office can sell the tank book without it. */
function bunkeringProgramAllowed() {
  if (!window.ChengLicense) return true;
  if (typeof ChengLicense.bunkerPlanLicensed === 'function') {
    return !!ChengLicense.bunkerPlanLicensed();
  }
  return ChengLicense.moduleAllowed('bunkeringplan');
}

/**
 * Tank Chief bunkering ops (fill sequence / monitoring) — not the consumption calc.
 */
window.ChengProModules.bunkeringplan = {
  title: 'Bunkering Plan',
  async render(root) {
    if (!bunkeringProgramAllowed()) {
      root.innerHTML = bunkeringLicenseNeededPanel(
        'Bunkering Plan',
        'Bunkering Plan is not on this license. Ask your office to include the <strong>Bunkering Plan</strong> program when they issue or renew the key, then open <strong>License</strong> to re-check.'
      );
      bunkeringBindNav(root);
      return;
    }
    /* Keep an existing bunkering iframe — remounting reset Start pumping. */
    const existing = root.querySelector('#bunkeringEmbedWrap iframe.aio-embed-frame');
    if (existing && existing.getAttribute('src')) {
      return;
    }
    const src = ChengPro.tankEmbedUrl({ page: 'bunker-plan', bunkerEmbed: '1' });
    root.innerHTML = `
      <div class="aio-embed-wrap" id="bunkeringEmbedWrap">
        <iframe
          class="aio-embed-frame"
          title="Bunkering Plan"
          src="${src}"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </div>`;
  },
};
