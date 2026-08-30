window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.eorb = {
  title: 'e-ORB',
  async render(root) {
    const allowed = !window.ChengLicense || ChengLicense.eorbLicensed();
    if (!allowed) {
      root.innerHTML = `
        <section class="panel">
          <h2>e-ORB</h2>
          <p class="empty">Electronic Oil Record Book requires a <strong>ChEng AIO</strong> license or a Voyage Chief key with the <strong>e-ORB add-on</strong>.</p>
          <div class="form-actions">
            <button type="button" class="btn primary" data-go="license">Open License</button>
          </div>
        </section>`;
      root.querySelector('[data-go]').onclick = () =>
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'license' }));
      return;
    }
    root.innerHTML = `
      <section class="panel hero">
        <h1>e-ORB</h1>
        <p>Electronic Oil Record Book (Part I) — opens inside Voyage Chief with the active vessel. Entries stay in the voyage database on this device.</p>
        <div class="form-actions" style="margin-top:16px">
          <button type="button" class="btn primary" id="openEorb">Open e-ORB</button>
          <button type="button" class="btn" id="openVoyageFull">Open full Voyage Chief</button>
        </div>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>What you get</h2>
            <p>Setup, new entries, browse/export, and code reference — MEPC-aligned electronic ORB workflow.</p>
          </div>
        </div>
        <ul style="margin:0;padding-left:1.2rem;color:var(--muted);line-height:1.7">
          <li>Ship particulars and ORB configuration</li>
          <li>Coded entries with officer / chief signatures</li>
          <li>Browse, filter, and print / export the book</li>
        </ul>
      </section>`;
    root.querySelector('#openEorb').onclick = () => ChengPro.openEorb();
    root.querySelector('#openVoyageFull').onclick = () => {
      if (ChengLicense.moduleAllowed('voyage')) ChengPro.openVoyage();
      else window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: 'Voyage Chief not on this license' }));
    };
  },
};
