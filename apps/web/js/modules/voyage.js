window.ChengProModules = window.ChengProModules || {};

function licenseNeededPanel(title, message) {
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

function bindLicenseNav(root) {
  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.onclick = () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
  });
}

function programAllowed(moduleId) {
  if (!window.ChengLicense) return true;
  if (moduleId === 'eorb') return ChengLicense.eorbLicensed();
  return ChengLicense.moduleAllowed(moduleId);
}

function licenseGateMessage(kind) {
  const ent = window.ChengLicense && ChengLicense.loadEntitlement();
  const active = window.ChengLicense && ChengLicense.isValid(ent);
  if (!active) {
    return 'Activate a license to use this program. Open <strong>License</strong> and enter the email and key from your office.';
  }
  if (kind === 'eorb') {
    return 'Electronic Oil Record Book is not on this license. Ask your office to add the <strong>e-ORB</strong> program when they issue a ChEng AIO key, or add it to a Voyage Chief key.';
  }
  if (kind === 'voyage') {
    return 'Voyage Chief is not included on this ChEng AIO license. Ask your office to add the <strong>Voyage Chief</strong> program when they issue or renew the key.';
  }
  if (kind === 'tanks') {
    return 'Tank Chief is not included on this ChEng AIO license. Ask your office to add the <strong>Tank Chief</strong> program when they issue or renew the key.';
  }
  return 'This program is not on your license. Open License for details.';
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
    if (!programAllowed('voyage')) {
      root.innerHTML = licenseNeededPanel('Voyage Chief', licenseGateMessage('voyage'));
      bindLicenseNav(root);
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
    if (!programAllowed('tanks')) {
      root.innerHTML = licenseNeededPanel('Tank Chief', licenseGateMessage('tanks'));
      bindLicenseNav(root);
      return;
    }
    renderEmbed(root, {
      src: ChengPro.tankEmbedUrl(),
      title: 'Tank Chief',
    });
  },
};
