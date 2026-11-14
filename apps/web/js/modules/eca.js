window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.eca = {
  title: 'ECA',
  async render(root) {
    const allowed = !window.ChengLicense || ChengLicense.moduleAllowed('voyage');
    if (!allowed) {
      root.innerHTML = `
        <section class="panel">
          <h2>ECA</h2>
          <p class="empty">The ECA fuel changeover calculator and record stay with the voyage record. Voyage Chief is not on this license.</p>
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
    const src = ChengPro.voyageEmbedUrl({ page: 'eca' });
    root.innerHTML = `
      <div class="aio-embed-wrap" id="ecaEmbedWrap">
        <iframe
          class="aio-embed-frame"
          title="ECA fuel changeover"
          src="${src}"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </div>`;
  },
};
