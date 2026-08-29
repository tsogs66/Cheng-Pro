window.ChengProModules = window.ChengProModules || {};

const ENGINE_FIELDS = [
  'mcrRpm', 'mcrKw', 'csrRpm', 'csrKw', 'pitch',
  'sfoc100', 'sfoc85', 'slocRef', 'mechEff',
  'fuelDensity', 'lubeDensity', 'lcvRef', 'lcvActual', 'propLawExp',
];

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
            <p>Shared ship identity for Voyage Chief and Tank Chief. Engine data feeds Performance Calculation.</p>
          </div>
        </div>
        <form id="vesselForm">
          <div class="grid-2">
            <div class="field"><label>Name</label><input name="name" required value="${esc(v.name)}"></div>
            <div class="field"><label>IMO</label><input name="imo" value="${esc(v.imo)}"></div>
            <div class="field"><label>Call sign</label><input name="callSign" value="${esc(v.callSign || '')}"></div>
            <div class="field"><label>Flag</label><input name="flag" value="${esc(v.flag || '')}"></div>
            <div class="field"><label>Company</label><input name="company" value="${esc(v.company || v.owner || '')}"></div>
            <div class="field"><label>Type</label><input name="type" value="${esc(v.type || '')}"></div>
            <div class="field"><label>DWT</label><input name="dwt" value="${esc(v.dwt || '')}"></div>
            <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea name="notes" rows="3">${esc(v.notes || '')}</textarea></div>
          </div>

          <h3 class="subhead">Main engine &amp; performance basis</h3>
          <p class="hint">Ported from Voyage Chief setup. Used by Performance Calculation (propeller law, SFOC/SLOC, ISO correction).</p>
          <div class="grid-2">
            <div class="field"><label>M/E RPM (100% MCR)</label><input name="mcrRpm" type="number" step="0.1" value="${escNum(v.mcrRpm)}"></div>
            <div class="field"><label>M/E kW (100% MCR)</label><input name="mcrKw" type="number" step="1" value="${escNum(v.mcrKw)}"></div>
            <div class="field"><label>M/E RPM (85% / CSR)</label><input name="csrRpm" type="number" step="0.1" value="${escNum(v.csrRpm)}"></div>
            <div class="field"><label>M/E kW (85% / CSR)</label><input name="csrKw" type="number" step="1" value="${escNum(v.csrKw)}"></div>
            <div class="field"><label>Propeller pitch (m)</label><input name="pitch" type="number" step="0.01" value="${escNum(v.pitch)}"></div>
            <div class="field"><label>Propeller-law exponent</label><input name="propLawExp" type="number" step="0.1" placeholder="3" value="${escNum(v.propLawExp)}"></div>
            <div class="field"><label>SFOC @ 100% (g/kWh)</label><input name="sfoc100" type="number" step="0.1" value="${escNum(v.sfoc100)}"></div>
            <div class="field"><label>SFOC @ 85% (g/kWh)</label><input name="sfoc85" type="number" step="0.1" value="${escNum(v.sfoc85)}"></div>
            <div class="field"><label>SLOC reference (g/kWh)</label><input name="slocRef" type="number" step="0.01" placeholder="e.g. 0.8" value="${escNum(v.slocRef)}"></div>
            <div class="field"><label>Mechanical efficiency</label><input name="mechEff" type="number" step="0.01" placeholder="0.90" value="${escNum(v.mechEff)}"></div>
            <div class="field"><label>Fuel density (kg/L)</label><input name="fuelDensity" type="number" step="0.001" placeholder="0.96" value="${escNum(v.fuelDensity)}"></div>
            <div class="field"><label>Lube density (kg/L)</label><input name="lubeDensity" type="number" step="0.001" placeholder="0.89" value="${escNum(v.lubeDensity)}"></div>
            <div class="field"><label>Shop-trial LCV (kJ/kg)</label><input name="lcvRef" type="number" step="1" placeholder="42700" value="${escNum(v.lcvRef)}"></div>
            <div class="field"><label>Actual bunker LCV (kJ/kg)</label><input name="lcvActual" type="number" step="1" placeholder="for ISO SFOC" value="${escNum(v.lcvActual)}"></div>
          </div>
        </form>
        <div class="form-actions">
          <button type="button" class="btn primary" id="saveVessel">${active ? 'Save vessel' : 'Create vessel'}</button>
          ${active ? '<button type="button" class="btn danger" id="deleteVessel">Delete vessel</button>' : ''}
          <button type="button" class="btn" id="newVessel">New vessel</button>
          <button type="button" class="btn" id="openPerf">Performance Calc</button>
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
    root.querySelector('#openPerf').addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'performance' })));

    root.querySelector('#saveVessel').addEventListener('click', async () => {
      const form = root.querySelector('#vesselForm');
      const raw = Object.fromEntries(new FormData(form).entries());
      const data = {
        name: raw.name,
        imo: raw.imo,
        callSign: raw.callSign,
        flag: raw.flag,
        company: raw.company,
        type: raw.type,
        dwt: raw.dwt,
        notes: raw.notes,
      };
      for (const key of ENGINE_FIELDS) {
        data[key] = parseOptionalNumber(raw[key]);
      }
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

function parseOptionalNumber(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function escNum(v) {
  if (v == null || v === '') return '';
  return esc(String(v));
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
