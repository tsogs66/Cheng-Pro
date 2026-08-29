window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.home = {
  title: 'Home',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    let health = { ok: false };
    try { health = await ChengPro.api.fetch('/api/health'); } catch { /* ignore */ }
    const vessels = ChengPro.vessel.getListSync();
    const voyageOk = !!(health.modules && health.modules.voyage && health.modules.voyage.ok);
    const tanksOk = !!(health.modules && health.modules.tanks && health.modules.tanks.ok);
    const bundled = window.ChengProBundled && ChengProBundled.isBundledClient();

    root.innerHTML = `
      <section class="panel hero">
        <h1>Cheng-Pro</h1>
        <p>All-in-one suite for marine chief engineers. One active vessel feeds full Voyage Chief and Tank Chief side by side. Ship details are shared; voyage and tank records stay in their own stores.${bundled ? ' On this device, tank data is stored locally until you sync or switch to server mode in Tank Chief.' : ''}</p>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Working context</h2>
            <p>Only the active vessel is served to both full modules.</p>
          </div>
        </div>
        <div class="grid-3">
          <div class="stat">
            <div class="label">Active vessel</div>
            <div class="value">${active ? esc(active.name) : 'None'}</div>
          </div>
          <div class="stat">
            <div class="label">IMO</div>
            <div class="value">${active?.imo ? esc(active.imo) : '—'}</div>
          </div>
          <div class="stat">
            <div class="label">Fleet size</div>
            <div class="value">${vessels.length}</div>
          </div>
        </div>
        <div class="chips" style="margin-top:14px">
          <span class="chip ${health.ok ? 'on' : ''}">${bundled && health.version === 'bundled' ? 'On-device' : 'Gateway'} ${health.ok ? 'ready' : 'offline'}</span>
          <span class="chip ${voyageOk ? 'on' : ''}">Voyage auth/sync ${voyageOk ? 'ready' : 'down'}</span>
          <span class="chip ${tanksOk ? 'on' : ''}">Tanks ${tanksOk ? 'ready' : 'down'}</span>
          <span class="chip">v${esc(health.version || '0.2.0')}</span>
        </div>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Open modules</h2>
            <p>Full Voyage Chief and Tank Chief — same active vessel.</p>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn primary" id="goVoyage">Open Voyage Chief</button>
          <button type="button" class="btn primary" id="goTanks">Open Tank Chief</button>
          <button type="button" class="btn" data-go="performance">Performance Calc</button>
          <button type="button" class="btn" data-go="vessel">Vessel Setup</button>
        </div>
      </section>
    `;

    root.querySelector('#goVoyage').onclick = () => ChengPro.openVoyage();
    root.querySelector('#goTanks').onclick = () => ChengPro.openTanks();
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
