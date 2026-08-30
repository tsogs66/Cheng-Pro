window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.eorb = {
  title: 'e-ORB',
  async render(root) {
    const allowed = !window.ChengLicense || ChengLicense.eorbLicensed();
    if (!allowed) {
      root.innerHTML = `
        <section class="panel">
          <h2>e-ORB</h2>
          <p class="empty">Electronic Oil Record Book is not on this license. Ask your office to add the <strong>e-ORB</strong> program when they issue a ChEng AIO key, or add it to a Voyage Chief key.</p>
          <div class="form-actions">
            <button type="button" class="btn primary" data-go="license">Open License</button>
          </div>
        </section>`;
      root.querySelector('[data-go]').onclick = () =>
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'license' }));
      return;
    }

    const src = ChengPro.voyageEmbedUrl({ page: 'orb', eorbEmbed: '1' });
    root.innerHTML = `
      <div class="eorb-embed-wrap" id="eorbEmbedWrap">
        <iframe
          id="eorbFrame"
          class="eorb-embed-frame"
          title="Electronic Oil Record Book"
          src="${src}"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </div>`;
  },
};
