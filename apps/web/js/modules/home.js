window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.home = {
  title: 'Home',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    let health = { ok: false };
    try { health = await ChengPro.api.fetch('/api/health'); } catch { /* ignore */ }
    const vessels = ChengPro.vessel.getListSync();

    root.innerHTML = `
      <section class="panel hero">
        <h1>Cheng-Pro</h1>
        <p>All-in-one suite for marine chief engineers. One active vessel feeds Voyage and Tanks side by side. Ship details are shared; voyage and tank records stay in their own stores.</p>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Working context</h2>
            <p>Only the active vessel is served to both modules.</p>
          </div>
        </div>
        <div class="grid-3">
          <div class="stat">
            <div class="label">Active vessel</div>
            <div class="value">${active ? escapeHtml(active.name) : 'None'}</div>
          </div>
          <div class="stat">
            <div class="label">IMO</div>
            <div class="value">${active?.imo ? escapeHtml(active.imo) : '—'}</div>
          </div>
          <div class="stat">
            <div class="label">Fleet size</div>
            <div class="value">${vessels.length}</div>
          </div>
        </div>
        <div class="chips" style="margin-top:14px">
          <span class="chip ${health.ok ? 'on' : ''}">Server ${health.ok ? 'online' : 'offline'}</span>
          <span class="chip">Auth ${health.authRequired ? 'required' : 'open'}</span>
          <span class="chip">v${escapeHtml(health.version || '0.1.0')}</span>
        </div>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Modules</h2>
            <p>Open Voyage or Tanks — both already bound to the vessel above.</p>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn primary" data-go="voyage">Open Voyage</button>
          <button type="button" class="btn primary" data-go="tanks">Open Tanks</button>
          <button type="button" class="btn" data-go="vessel">Vessel Setup</button>
        </div>
      </section>
    `;

    root.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
      });
    });
  },
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
