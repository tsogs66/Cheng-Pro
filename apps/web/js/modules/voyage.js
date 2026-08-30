window.ChengProModules = window.ChengProModules || {};

function warnPanel(title, message) {
  return `
    <section class="panel">
      <h2>${title}</h2>
      <p class="home-warn">${message}</p>
      <div class="form-actions">
        <button type="button" class="btn primary" data-go="license">Open License</button>
        <button type="button" class="btn" data-go="home">Back to Home</button>
      </div>
    </section>`;
}

window.ChengProModules.voyage = {
  title: 'Voyage',
  async render(root) {
    if (window.ChengLicense && ChengLicense.isValid(ChengLicense.loadEntitlement())
        && !ChengLicense.moduleAllowed('voyage')) {
      root.innerHTML = warnPanel(
        'Voyage Chief',
        'Voyage Chief is not included on this ChEng AIO license. Ask your office to add the Voyage Chief program when they issue or renew the key.'
      );
      root.querySelectorAll('[data-go]').forEach((btn) => {
        btn.onclick = () =>
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
      });
      return;
    }
    /* Licensed — open the program directly (AIO already holds the seat). */
    ChengPro.openVoyage();
  },
};

window.ChengProModules.tanks = {
  title: 'Tanks',
  async render(root) {
    if (window.ChengLicense && ChengLicense.isValid(ChengLicense.loadEntitlement())
        && !ChengLicense.moduleAllowed('tanks')) {
      root.innerHTML = warnPanel(
        'Tank Chief',
        'Tank Chief is not included on this ChEng AIO license. Ask your office to add the Tank Chief program when they issue or renew the key.'
      );
      root.querySelectorAll('[data-go]').forEach((btn) => {
        btn.onclick = () =>
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
      });
      return;
    }
    ChengPro.openTanks();
  },
};
