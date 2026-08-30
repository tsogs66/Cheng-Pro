window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.license = {
  title: 'License',
  async render(root) {
    const L = window.ChengLicense;
    if (!L) {
      root.innerHTML = '<section class="panel"><p class="empty">License module not loaded.</p></section>';
      return;
    }
    const ent = L.loadEntitlement();
    const valid = L.isValid(ent);
    const seat = L.detectSeat();
    root.innerHTML = `
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>License &amp; activation</h2>
            <p>Per-user license: 1 Android + 1 Windows. Online check every 60 days (yearly or lifetime).</p>
          </div>
        </div>
        <div class="grid-2" style="margin-bottom:16px">
          <div class="field"><label>Status</label>
            <input readonly value="${valid ? 'Active — ' + L.daysLeft(ent) + ' days until next check' : (ent ? 'Grace expired — activate / renew' : 'Not activated')}">
          </div>
          <div class="field"><label>This device seat</label>
            <input readonly value="${seat} · ${escapeHtml(L.deviceId().slice(0, 18))}…">
          </div>
          <div class="field"><label>SKU</label>
            <input readonly value="${escapeHtml(ent?.sku || '—')}">
          </div>
          <div class="field"><label>Plan</label>
            <input readonly value="${escapeHtml(ent?.plan || '—')}${ent?.expiresAt ? ' · expires ' + escapeHtml(String(ent.expiresAt).slice(0, 10)) : ''}">
          </div>
        </div>

        <h3 class="subhead">Activate with license key</h3>
        <form id="licActivate" class="grid-2">
          <div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com" value="${escapeHtml(ent?.email || '')}"></div>
          <div class="field"><label>License key</label><input name="key" required placeholder="CK-XXXXXXXX-XXXXXXXX" style="text-transform:uppercase"></div>
        </form>
        <div class="form-actions">
          <button type="button" class="btn primary" id="btnLicActivate">Activate this device</button>
          <button type="button" class="btn" id="btnLicHeartbeat">Refresh check now</button>
        </div>
        <p class="hint" id="licStatus" style="margin-top:10px"></p>

        <h3 class="subhead">Pair Windows from Android</h3>
        <p class="hint">On the phone that holds the Android seat, create a 6-digit code, then enter it here on the PC.</p>
        <div class="form-actions">
          <button type="button" class="btn" id="btnPairStart">Create pairing code (Android)</button>
        </div>
        <div class="grid-2" style="margin-top:8px">
          <div class="field"><label>Pairing code</label><input id="pairCode" inputmode="numeric" maxlength="6" placeholder="123456"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn primary" id="btnPairComplete">Redeem code on this PC</button>
        </div>

        <h3 class="subhead">Lost phone / PC</h3>
        <p class="hint">Clears the seat after cooldown (14 days, max 2 transfers / year) so you can activate a replacement device.</p>
        <div class="form-actions">
          <button type="button" class="btn danger" id="btnTransfer">Request seat transfer</button>
        </div>
      </section>
    `;

    const status = root.querySelector('#licStatus');
    const form = root.querySelector('#licActivate');

    root.querySelector('#btnLicActivate').onclick = async () => {
      try {
        status.textContent = 'Activating…';
        const fd = new FormData(form);
        await L.activate({
          email: fd.get('email'),
          licenseKey: String(fd.get('key') || '').trim(),
          seat,
        });
        status.textContent = 'Activated. Grace refreshed for 60 days.';
        window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: 'License activated' }));
        await window.ChengProModules.license.render(root);
      } catch (e) {
        status.textContent = e.message;
      }
    };

    root.querySelector('#btnLicHeartbeat').onclick = async () => {
      try {
        await L.heartbeat();
        status.textContent = 'Check OK — grace refreshed.';
        await window.ChengProModules.license.render(root);
      } catch (e) {
        status.textContent = e.message;
      }
    };

    root.querySelector('#btnPairStart').onclick = async () => {
      try {
        const fd = new FormData(form);
        const out = await L.pairStart({
          email: fd.get('email'),
          licenseKey: String(fd.get('key') || '').trim() || undefined,
        });
        status.textContent = `Pairing code ${out.code} — valid ${out.expiresInSec}s. Enter it on Windows.`;
      } catch (e) {
        status.textContent = e.message;
      }
    };

    root.querySelector('#btnPairComplete').onclick = async () => {
      try {
        await L.pairComplete({ code: root.querySelector('#pairCode').value.trim() });
        status.textContent = 'Windows seat paired.';
        await window.ChengProModules.license.render(root);
      } catch (e) {
        status.textContent = e.message;
      }
    };

    root.querySelector('#btnTransfer').onclick = async () => {
      if (!confirm('Clear this seat so another device can activate? Cool-down may apply.')) return;
      try {
        const fd = new FormData(form);
        const out = await L.requestTransfer({
          email: fd.get('email'),
          licenseKey: String(fd.get('key') || '').trim(),
          seat,
          reason: 'lost_device',
        });
        L.saveEntitlement(null);
        status.textContent = out.message || 'Seat cleared.';
      } catch (e) {
        status.textContent = e.message;
      }
    };
  },
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
