window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.spares = {
  title: 'Spares',
  async render(root) {
    const allowed = !window.ChengLicense || ChengLicense.moduleAllowed('voyage');
    if (!allowed) {
      root.innerHTML = `
        <section class="panel">
          <h2>Spares</h2>
          <p class="empty">Spares stay with the voyage record. Voyage Chief is not on this license.</p>
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
    const src = ChengPro.voyageEmbedUrl({ page: 'spares' });
    root.innerHTML = `
      <div class="aio-embed-wrap" id="sparesEmbedWrap">
        <iframe
          class="aio-embed-frame"
          title="Spares and requisition"
          src="${src}"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </div>`;
  },
};
