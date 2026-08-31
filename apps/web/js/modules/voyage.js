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

function bindWarnNav(root) {
  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.onclick = () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
  });
}

function renderEmbed(root, { src, title }) {
  root.innerHTML = `
    <div class="aio-embed-wrap">
      <iframe
        class="aio-embed-frame"
        title="${title}"
        src="${src}"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    </div>`;
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
      bindWarnNav(root);
      return;
    }
    renderEmbed(root, {
      src: ChengPro.voyageEmbedUrl(),
      title: 'Voyage Chief',
    });
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
      bindWarnNav(root);
      return;
    }
    renderEmbed(root, {
      src: ChengPro.tankEmbedUrl(),
      title: 'Tank Chief',
    });
  },
};
