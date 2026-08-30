window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.home = {
  title: 'Home',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    let health = { ok: false };
    try { health = await ChengPro.api.fetch('/api/health'); } catch { /* ignore */ }
    const vessels = ChengPro.vessel.getListSync();
    const firstRun = !vessels.length;
    const ver = health.version || '';

    const hasVoyage = !window.ChengLicense || ChengLicense.moduleAllowed('voyage');
    const hasTanks = !window.ChengLicense || ChengLicense.moduleAllowed('tanks');
    const hasEorb = !window.ChengLicense || ChengLicense.moduleAllowed('eorb');
    const hasPerf = !window.ChengLicense || ChengLicense.moduleAllowed('performance');

    root.innerHTML = `
      <section class="home-hero panel">
        <p class="home-kicker">Chief engineer suite</p>
        <h1>ChEng AIO</h1>
        <p class="home-lead">
          Built for the people who keep the plant running — one vessel identity,
          then the tools you already know: Voyage Chief for the noon book and ROB chain,
          Tank Chief for soundings and bunkers, and e-ORB when your company carries the book electronically.
        </p>
        ${firstRun ? `
        <div class="form-actions" style="margin-top:18px">
          <button type="button" class="btn primary" data-go="vessel">Set up this vessel</button>
        </div>
        <p class="home-aside">Start with the ship name and IMO. You can fill engine particulars later when you need Performance.</p>
        ` : `
        <div class="home-vessel-line">
          <span>Working vessel</span>
          <strong>${active ? esc(active.name) : 'None selected'}</strong>
          ${active?.imo ? `<em>${esc(active.imo)}</em>` : ''}
        </div>
        `}
      </section>

      <section class="panel home-section">
        <h2>What this suite covers</h2>
        <div class="home-feature-list">
          <article>
            <h3>Voyage Chief</h3>
            <p>Daily noon and intermediate reports, ROB continuity, bunker receipts, abstracts, and voyage library — the paperwork you need at sea, offline on the tablet or PC.</p>
            ${hasVoyage
              ? '<button type="button" class="btn primary" id="goVoyage">Open Voyage Chief</button>'
              : '<p class="home-warn">Not on this license — ask the office to include Voyage Chief on your ChEng AIO key.</p>'}
          </article>
          <article>
            <h3>Tank Chief</h3>
            <p>Soundings with trim and list, calibration tables, fuel condition reports, and bunkering records. Same active vessel as Voyage, separate tank database.</p>
            ${hasTanks
              ? '<button type="button" class="btn primary" id="goTanks">Open Tank Chief</button>'
              : '<p class="home-warn">Not on this license — ask the office to include Tank Chief on your ChEng AIO key.</p>'}
          </article>
          <article>
            <h3>e-ORB</h3>
            <p>Electronic Oil Record Book Part I — coded entries, signatures, and a printable book. Lives with the voyage data for this vessel.</p>
            ${hasEorb
              ? '<button type="button" class="btn" id="goEorb">Open e-ORB</button>'
              : '<p class="home-warn">Not on this license — e-ORB is an optional program on the key.</p>'}
          </article>
          <article>
            <h3>Performance</h3>
            <p>Watch and voyage performance from the figures you already keep — slip, consumption, and engine run hours between two times.</p>
            ${hasPerf
              ? '<button type="button" class="btn" data-go="performance">Open Performance</button>'
              : ''}
          </article>
        </div>
      </section>

      <section class="panel home-section">
        <h2>How licensing works here</h2>
        <p class="home-copy">
          You activate once in ChEng AIO with the email and key from your office.
          Voyage Chief and Tank Chief opened from this menu use that same seat —
          you do not sign in again. Standalone Voyage or Tank installs keep their own keys.
        </p>
        <div class="form-actions">
          <button type="button" class="btn" data-go="license">License</button>
          <button type="button" class="btn" data-go="vessel">Vessel Setup</button>
        </div>
        ${ver ? `<p class="home-meta">Build ${esc(ver)}</p>` : ''}
      </section>
    `;

    root.querySelector('#goVoyage')?.addEventListener('click', () => ChengPro.openVoyage());
    root.querySelector('#goTanks')?.addEventListener('click', () => ChengPro.openTanks());
    root.querySelector('#goEorb')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'eorb' }));
    });
    root.querySelectorAll('[data-go]').forEach((btn) => {
      btn.onclick = () =>
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
    });
  },
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
