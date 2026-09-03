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

function bunkeringProgramAllowed() {
  if (!window.ChengLicense) return true;
  return ChengLicense.moduleAllowed('tanks') || ChengLicense.moduleAllowed('bunkeringplan');
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
        'Bunkering Plan requires <strong>Tank Chief</strong> on your license. Open <strong>License</strong> to activate, or ask the office to include Tank Chief on your ChEng AIO key.'
      );
      bunkeringBindNav(root);
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
