window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.vessel = {
  title: 'Vessel Setup',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    let shared = null;
    if (active) {
      try { shared = await ChengPro.api.fetch('/api/shell/vessels/' + encodeURIComponent(active.id)); }
      catch (e) { toast(e.message); }
    }
    const v = shared?.vessel || {
      name: '', imo: '', callSign: '', flag: '', company: '', type: '', dwt: '', notes: '', owner: '',
    };

    root.innerHTML = `
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Vessel Setup</h2>
            <p>Shared ship identity for Voyage Chief and Tank Chief. One form serves both.</p>
          </div>
        </div>
        <form id="vesselForm" class="grid-2">
          <div class="field"><label>Name</label><input name="name" required value="${esc(v.name)}"></div>
          <div class="field"><label>IMO</label><input name="imo" value="${esc(v.imo)}"></div>
          <div class="field"><label>Call sign</label><input name="callSign" value="${esc(v.callSign || '')}"></div>
          <div class="field"><label>Flag</label><input name="flag" value="${esc(v.flag || '')}"></div>
          <div class="field"><label>Company</label><input name="company" value="${esc(v.company || v.owner || '')}"></div>
          <div class="field"><label>Type</label><input name="type" value="${esc(v.type || '')}"></div>
          <div class="field"><label>DWT</label><input name="dwt" value="${esc(v.dwt || '')}"></div>
          <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea name="notes" rows="3">${esc(v.notes || '')}</textarea></div>
        </form>
        <div class="form-actions">
          <button type="button" class="btn primary" id="saveVessel">${active ? 'Save vessel' : 'Create vessel'}</button>
          ${active ? '<button type="button" class="btn danger" id="deleteVessel">Delete vessel</button>' : ''}
          <button type="button" class="btn" id="newVessel">New vessel</button>
          <button type="button" class="btn" id="openTanks">Open in Tank Chief</button>
          <button type="button" class="btn" id="openVoyage">Open in Voyage Chief</button>
        </div>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Fleet register</h2>
            <p>Activating a vessel updates Tank Chief and is stored for Voyage.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data" id="fleetTable">
            <thead><tr><th>Name</th><th>IMO</th><th>Updated</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    `;

    await renderFleet(root.querySelector('#fleetTable tbody'));

    root.querySelector('#openTanks').addEventListener('click', () => ChengPro.openTanks());
    root.querySelector('#openVoyage').addEventListener('click', () => ChengPro.openVoyage());

    root.querySelector('#saveVessel').addEventListener('click', async () => {
      const form = root.querySelector('#vesselForm');
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        if (active && !root._forceNew) {
          await ChengPro.api.fetch('/api/shell/vessels/' + encodeURIComponent(active.id), {
            method: 'PUT', body: JSON.stringify(data),
          });
          toast('Vessel saved');
        } else {
          const created = await ChengPro.api.fetch('/api/shell/vessels', {
            method: 'POST', body: JSON.stringify(data),
          });
          await ChengPro.vessel.setActive(created.id);
          toast('Vessel created');
          root._forceNew = false;
        }
        await ChengPro.vessel.refresh();
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
      } catch (e) { toast(e.message); }
    });

    root.querySelector('#newVessel')?.addEventListener('click', () => {
      root._forceNew = true;
      root.querySelector('#vesselForm').reset();
      toast('Enter details, then Create vessel');
    });

    root.querySelector('#deleteVessel')?.addEventListener('click', async () => {
      if (!active || !confirm('Delete vessel and tank data for this ship?')) return;
      try {
        await ChengPro.api.fetch('/api/shell/vessels/' + encodeURIComponent(active.id), { method: 'DELETE' });
        await ChengPro.vessel.refresh();
        toast('Vessel deleted');
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
      } catch (e) { toast(e.message); }
    });
  },
};

async function renderFleet(tbody) {
  const vessels = await ChengPro.vessel.list();
  const activeId = ChengPro.vessel.getActive()?.id;
  if (!vessels.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No vessels yet.</td></tr>';
    return;
  }
  tbody.innerHTML = vessels.map((v) => `
    <tr>
      <td>${esc(v.name)}${v.id === activeId ? ' <span class="chip on">active</span>' : ''}</td>
      <td>${esc(v.imo || '—')}</td>
      <td>${esc((v.updatedAt || '').slice(0, 19).replace('T', ' '))}</td>
      <td><button type="button" class="btn" data-activate="${esc(v.id)}">Activate</button></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-activate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await ChengPro.vessel.setActive(btn.dataset.activate);
      toast('Active vessel updated');
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
    });
  });
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg) {
  window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: msg }));
}
