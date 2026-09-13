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
    const serverUrl = L.getLicenseServerUrl ? L.getLicenseServerUrl() : '';
    const licenseApi = L.apiBase ? L.apiBase() : '/api/license';
    const needsServer = L.isBundledClient && L.isBundledClient();
    root.innerHTML = `
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>License &amp; activation</h2>
            <p>Per-user license: 1 Android + 1 Windows. Online check every 60 days (yearly or lifetime).</p>
          </div>
        </div>

        <h3 class="subhead">License server</h3>
        <p class="hint">${needsServer
          ? 'Android APK / offline install: enter your ship ChEng AIO server address (the LXC IP and port, usually :8080). Activation calls this host — not the phone itself.'
          : 'When you open ChEng AIO in Chrome at http://&lt;ship-server&gt;:8080, this can stay blank (same host). Set it if activation fails or you use the Android APK.'}
        </p>
        <div class="grid-2" style="margin-bottom:12px">
          <div class="field"><label>ChEng AIO server URL</label>
            <input id="licServerUrl" type="url" placeholder="http://192.168.x.x:8080" value="${escapeHtml(serverUrl)}" autocomplete="off">
          </div>
          <div class="field"><label>License API (resolved)</label>
            <input readonly value="${escapeHtml(licenseApi || '— not set —')}">
          </div>
        </div>
        <div class="form-actions" style="margin-bottom:16px">
          <button type="button" class="btn" id="btnLicSaveServer">Save server URL</button>
          <button type="button" class="btn" id="btnLicTestServer">Test connection</button>
        </div>
        <p class="hint" id="licServerStatus" style="margin-top:0;margin-bottom:16px"></p>

        <div class="grid-2" style="margin-bottom:16px">
          <div class="field"><label>Status</label>
            <input readonly value="${valid ? 'Active — ' + L.daysLeft(ent) + ' days until next check' : (ent ? 'Grace expired — activate / renew' : 'Not activated')}">
          </div>
          <div class="field"><label>This device seat</label>
            <input readonly value="${seat} · ${escapeHtml(String(L.deviceId()).slice(0, 18))}…">
          </div>
          <div class="field"><label>Email</label>
            <input readonly value="${escapeHtml(ent?.email || '—')}">
          </div>
          <div class="field"><label>SKU</label>
            <input readonly value="${escapeHtml(ent?.sku || '—')}${Array.isArray(ent?.addons) && ent.addons.length ? ' · ' + escapeHtml(ent.addons.join(', ')) : ''}">
          </div>
          <div class="field"><label>Plan</label>
            <input readonly value="${escapeHtml(ent?.plan || '—')}${ent?.expiresAt ? ' · expires ' + escapeHtml(String(ent.expiresAt).slice(0, 10)) : ''}">
          </div>
          <div class="field"><label>Programs on this key</label>
            <input readonly value="${valid ? escapeHtml(L.modulesAllowed(ent).filter((m) => m !== 'license' && m !== 'about').join(', ') || '—') : '—'}">
          </div>
        </div>


        <div id="licServerInventory" hidden>
          <h3 class="subhead">Server inventory</h3>
          <p class="hint">Activated licenses, vessels in each user database, and voyage legs saved on this server. Visible with a master license.</p>
          <div class="btn-row" style="margin-bottom:8px">
            <button type="button" class="btn" id="btnLicInventoryRefresh">Refresh inventory</button>
          </div>
          <div id="licInventoryBody" class="hint">Loading…</div>
        </div>

        <h3 class="subhead">Activate with license key</h3>
        <form id="licActivate" class="grid-2">
          <div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com" value="${escapeHtml(ent?.email || '')}"></div>
          <div class="field"><label>License key</label><input name="key" required placeholder="CA-XXXXXXXX-XXXXXXXX" style="text-transform:uppercase" autocomplete="off"></div>
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
    const serverStatus = root.querySelector('#licServerStatus');
    const form = root.querySelector('#licActivate');

    root.querySelector('#btnLicSaveServer').onclick = () => {
      try {
        const url = root.querySelector('#licServerUrl').value.trim();
        if (L.setLicenseServerUrl) {
          L.setLicenseServerUrl(url);
          serverStatus.textContent = url
            ? 'Server URL saved — license API: ' + (L.apiBase() || '—')
            : 'Server URL cleared — using same host when in browser.';
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'license' }));
        }
      } catch (e) {
        serverStatus.textContent = e.message || 'Could not save server URL';
      }
    };

    root.querySelector('#btnLicTestServer').onclick = async () => {
      try {
        serverStatus.textContent = 'Testing…';
        const url = root.querySelector('#licServerUrl').value.trim();
        if (url && L.setLicenseServerUrl) L.setLicenseServerUrl(url);
        const st = await L.fetchStatus();
        if (!st) throw new Error('No response — check URL and that ChEng AIO is running on the server.');
        serverStatus.textContent = st.ok
          ? `Connected — enforce=${st.enforce ? 'on' : 'off'}, mail=${st.mailConfigured ? 'yes' : 'no'}`
          : 'Unexpected response from license server';
      } catch (e) {
        serverStatus.textContent = e.message || 'Connection failed';
      }
    };

    root.querySelector('#btnLicActivate').onclick = async () => {
      try {
        status.textContent = 'Activating…';
        const fd = new FormData(form);
        const ent = await L.activate({
          email: fd.get('email'),
          licenseKey: String(fd.get('key') || '').trim(),
          seat,
        });
        status.textContent = 'Activated — ' + (ent?.sku || 'license') + ', ' + L.daysLeft(ent) + ' days until next check.';
        window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: 'License activated' }));
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'license' }));
      } catch (e) {
        status.textContent = e.message || 'Activation failed';
      }
    };

    root.querySelector('#btnLicHeartbeat').onclick = async () => {
      try {
        await L.heartbeat();
        status.textContent = 'Check OK — grace refreshed.';
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'license' }));
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
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'license' }));
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

    const invWrap = root.querySelector('#licServerInventory');
    const invBody = root.querySelector('#licInventoryBody');
    async function refreshServerInventory() {
      if (!invWrap || !invBody) return;
      if (!(L.isMaster && L.isMaster(ent))) {
        invWrap.hidden = true;
        return;
      }
      invWrap.hidden = false;
      invBody.textContent = 'Loading server inventory…';
      try {
        const data = await ChengProApi.api('/api/admin/inventory');
        const licenses = data.licenses || [];
        const users = data.users || [];
        const rootVessels = data.rootVessels || [];
        const legs = data.voyageLegs || [];
        const esc = escapeHtml;
        let html = '';
        html += `<h4 style="margin:12px 0 6px">Activated licenses (${licenses.length})</h4>`;
        if (!licenses.length) html += `<p class="hint">No licenses issued on this server yet.</p>`;
        else {
          html += `<div style="overflow:auto"><table class="data-table" style="width:100%;font-size:13px"><thead><tr>
            <th>Email</th><th>SKU</th><th>Plan</th><th>Seats</th><th>Expires</th></tr></thead><tbody>`;
          for (const lic of licenses) {
            const seats = [];
            if (lic.seats && lic.seats.android) seats.push('Android');
            if (lic.seats && lic.seats.windows) seats.push('Windows');
            html += `<tr>
              <td>${esc(lic.email || '—')}</td>
              <td>${esc(lic.sku || '—')}</td>
              <td>${esc(lic.plan || '—')}</td>
              <td>${esc(seats.join(', ') || 'none bound')}</td>
              <td>${esc(lic.expiresAt ? String(lic.expiresAt).slice(0, 10) : (lic.plan === 'lifetime' ? 'lifetime' : '—'))}</td>
            </tr>`;
          }
          html += `</tbody></table></div>`;
        }
        html += `<h4 style="margin:16px 0 6px">User databases &amp; vessels</h4>`;
        if (!users.length && !rootVessels.length) html += `<p class="hint">No scoped user databases yet.</p>`;
        for (const u of users) {
          html += `<p style="margin:8px 0 4px"><strong>${esc(u.emailSlug)}</strong> — ${u.vessels ? u.vessels.length : (u.vesselCount || 0)} vessel(s)</p>`;
          if (u.vessels && u.vessels.length) {
            html += `<ul style="margin:0 0 8px 18px">${u.vessels.map((v) =>
              `<li>${esc(v.name || v.id)}${v.imo ? ' · IMO ' + esc(v.imo) : ''}</li>`).join('')}</ul>`;
          }
        }
        if (rootVessels.length) {
          html += `<p style="margin:8px 0 4px"><strong>(server root)</strong> — ${rootVessels.length} vessel(s)</p>`;
          html += `<ul style="margin:0 0 8px 18px">${rootVessels.map((v) =>
            `<li>${esc(v.name || v.id)}${v.imo ? ' · IMO ' + esc(v.imo) : ''}</li>`).join('')}</ul>`;
        }
        html += `<h4 style="margin:16px 0 6px">Voyage legs on server (${legs.length})</h4>`;
        if (!legs.length) html += `<p class="hint">No voyage legs uploaded yet.</p>`;
        else {
          html += `<div style="overflow:auto;max-height:240px"><table class="data-table" style="width:100%;font-size:13px"><thead><tr>
            <th>Owner</th><th>Vessel</th><th>Voyage</th><th>Cond</th><th>Updated</th></tr></thead><tbody>`;
          const sorted = legs.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
          for (const leg of sorted.slice(0, 200)) {
            html += `<tr>
              <td>${esc(leg.ownerSlug || 'root')}</td>
              <td>${esc(leg.vesselSlug || '—')}</td>
              <td>${esc(leg.voyageNo || '—')}</td>
              <td>${esc(leg.condition || '—')}</td>
              <td>${esc(leg.updatedAt ? String(leg.updatedAt).slice(0, 19).replace('T', ' ') : '—')}</td>
            </tr>`;
          }
          html += `</tbody></table></div>`;
        }
        invBody.innerHTML = html;
      } catch (e) {
        invBody.textContent = e.message || 'Could not load inventory';
      }
    }
    root.querySelector('#btnLicInventoryRefresh')?.addEventListener('click', () => refreshServerInventory());
    refreshServerInventory();

  },
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
