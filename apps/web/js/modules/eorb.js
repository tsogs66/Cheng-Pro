window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.eorb = {
  title: 'e-ORB',
  async render(root) {
    const allowed = !window.ChengLicense || ChengLicense.eorbLicensed();
    if (!allowed) {
      const ent = ChengLicense.loadEntitlement();
      const active = ChengLicense.isValid(ent);
      const message = !active
        ? 'Activate a license to use e-ORB. Open <strong>License</strong> and enter the email and key from your office.'
        : 'Electronic Oil Record Book is not on this license. Ask your office to add the <strong>e-ORB</strong> program when they issue a ChEng AIO key, or add it to a Voyage Chief key.';
      root.innerHTML = `
        <section class="panel">
          <h2>e-ORB</h2>
          <p class="empty">${message}</p>
          <div class="form-actions">
            <button type="button" class="btn primary" data-go="license">Open License</button>
            <button type="button" class="btn" data-go="home">Back to Home</button>
          </div>
        </section>`;
      root.querySelectorAll('[data-go]').forEach((btn) => {
        btn.onclick = () =>
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
      });
      return;
    }

    const src = ChengPro.voyageEmbedUrl({ page: 'orb', eorbEmbed: '1' });
    root.innerHTML = `
      <div class="aio-embed-wrap" id="eorbEmbedWrap">
        <iframe
          id="eorbFrame"
          class="aio-embed-frame"
          title="Electronic Oil Record Book"
          src="${src}"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </div>`;
  },
};
