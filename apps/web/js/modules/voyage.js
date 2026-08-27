window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.voyage = {
  title: 'Voyage',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    root.innerHTML = `
      <section class="panel hero">
        <h1>Voyage Chief</h1>
        <p>Full noon-report, ROB, e-ORB and fleet sync module${active ? ' for <strong>' + esc(active.name) + '</strong>' : ''}. Sign in with fleet credentials; sync URL defaults to this Cheng-Pro server.</p>
        <div class="form-actions" style="margin-top:16px">
          <a class="btn primary" href="/voyage/">Launch Voyage Chief</a>
          <button type="button" class="btn" data-go="vessel">Vessel Setup</button>
        </div>
      </section>
      <section class="panel">
        <div class="section-head"><div><h2>Included</h2><p>Ported from voyage-manager.</p></div></div>
        <ul style="margin:0;padding-left:1.2rem;color:var(--muted);line-height:1.7">
          <li>Noon / log entries, ROB chain, bunker receipts &amp; surveys</li>
          <li>Voyage abstract, consumption, range totals</li>
          <li>Electronic Oil Record Book (e-ORB)</li>
          <li>Fleet Office, assignments, device enrollment / offline unlock</li>
          <li>JSON leg sync with merge + tombstones</li>
        </ul>
      </section>
    `;
    root.querySelector('[data-go]').onclick = () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
  },
};

window.ChengProModules.tanks = {
  title: 'Tanks',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    root.innerHTML = `
      <section class="panel hero">
        <h1>Tank Chief</h1>
        <p>Full sounding, calibration, fuel report and bunkering module${active ? ' for <strong>' + esc(active.name) + '</strong>' : ''}. Active vessel is shared with Cheng-Pro and Voyage.</p>
        <div class="form-actions" style="margin-top:16px">
          <a class="btn primary" href="/tanks/">Launch Tank Chief</a>
          <button type="button" class="btn" data-go="vessel">Vessel Setup</button>
        </div>
      </section>
      <section class="panel">
        <div class="section-head"><div><h2>Included</h2><p>Ported from tank-management.</p></div></div>
        <ul style="margin:0;padding-left:1.2rem;color:var(--muted);line-height:1.7">
          <li>Trim/list double interpolation + ASTM 54B VCF / WCF</li>
          <li>Editable calibration DB, CSV / Excel / PDF import</li>
          <li>Fuel oil (tank condition) report + history</li>
          <li>Bunker plan / after / summary</li>
          <li>Offline-capable client with sync</li>
        </ul>
      </section>
    `;
    root.querySelector('[data-go]').onclick = () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
  },
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
