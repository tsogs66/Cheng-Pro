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
      chiefEngineer: '',
    };
    const assets = normalizeAssets(shared?.assets);

    root.innerHTML = `
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Vessel Setup</h2>
            <p>Shared ship identity for Voyage Chief and Tank Chief (name, IMO, call sign, flag, company, type, DWT).
               Opening ROB and voyage ops stay in Voyage; tanks stay in Tank Chief.
               When those modules run inside ChEng AIO they read this record — they do not edit it separately.</p>
          </div>
        </div>
        <form id="vesselForm">
          ${!active ? '<p class="hint" style="margin-top:0">First vessel is stored on this device — works offline. You can sync later from Tank Chief.</p>' : ''}
          <div class="grid-2">
            <div class="field"><label>Name</label><input name="name" required value="${esc(v.name)}"></div>
            <div class="field"><label>IMO</label><input name="imo" value="${esc(v.imo)}"></div>
            <div class="field"><label>Call sign</label><input name="callSign" value="${esc(v.callSign || '')}"></div>
            <div class="field"><label>Flag registry</label>
              <select name="flag" id="vesselFlag">${flagSelectOptions(v.flag || '')}</select>
              <span class="hint" id="vesselFlagHint">${esc(flagHint(v.flag || ''))}</span></div>
            <div class="field"><label>Company</label><input name="company" value="${esc(v.company || v.owner || '')}"></div>
            <div class="field"><label>Type</label><input name="type" value="${esc(v.type || '')}"></div>
            <div class="field"><label>DWT</label><input name="dwt" value="${esc(v.dwt || '')}"></div>
            <div class="field"><label>Chief Engineer</label><input name="chiefEngineer" id="vesselChEng" value="${esc(v.chiefEngineer || '')}">
              <span class="hint">Printed on Tank Chief / bunkering sheets. Signatures are stored under this name.</span></div>
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

        <div id="printIdentityHost"></div>

        <div class="form-actions">
          <button type="button" class="btn primary" id="saveVessel">${active ? 'Save vessel' : 'Create vessel'}</button>
          ${active ? '<button type="button" class="btn danger" id="deleteVessel">Delete vessel</button>' : ''}
          <button type="button" class="btn" id="newVessel">New vessel</button>
          <button type="button" class="btn" id="importVoyage">Import from Voyage Chief</button>
          <button type="button" class="btn" id="openPerf">Performance Calc</button>
          <button type="button" class="btn" id="openTanks">Open in Tank Chief</button>
          <button type="button" class="btn" id="openVoyage">Open in Voyage Chief</button>
        </div>
        <p class="hint" id="voyageImportStatus" style="margin-top:10px"></p>
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
            <thead><tr><th>Name</th><th>IMO</th><th>Flag</th><th>Updated</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    `;

    await renderFleet(root.querySelector('#fleetTable tbody'));

    const flagSel = root.querySelector('#vesselFlag');
    const flagHintEl = root.querySelector('#vesselFlagHint');
    if (flagSel && flagHintEl) {
      const refreshFlagHint = () => {
        flagHintEl.textContent = flagHint(flagSel.value);
      };
      flagSel.addEventListener('change', refreshFlagHint);
      refreshFlagHint();
    }

    const identityHost = root.querySelector('#printIdentityHost');
    if (active && identityHost) {
      identityHost.appendChild(buildPrintIdentityPanel({
        vesselId: active.id,
        assets,
        getChEngName: () => {
          const field = root.querySelector('#vesselChEng');
          return (field && field.value.trim()) || String(v.chiefEngineer || '').trim();
        },
      }));
    } else if (identityHost) {
      identityHost.innerHTML = `<h3 class="subhead">Printed document identity</h3>
        <p class="hint">Create and save the vessel first, then upload the Chief Engineer signature and vessel stamp here — the same assets Tank Chief printouts use.</p>`;
    }

    root.querySelector('#openTanks').addEventListener('click', () => ChengPro.openTanks());
    root.querySelector('#openVoyage').addEventListener('click', () => ChengPro.openVoyage());
    root.querySelector('#openPerf').addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'performance' })));

    root.querySelector('#importVoyage')?.addEventListener('click', async () => {
      const status = root.querySelector('#voyageImportStatus');
      if (!window.ChengProVoyageBridge) {
        toast('Voyage bridge not loaded');
        return;
      }
      status.textContent = 'Reading Voyage Chief data on this device…';
      try {
        const result = await ChengProVoyageBridge.importIntoChengPro({ setActive: true });
        status.textContent = result.message;
        toast(result.message);
        await ChengPro.vessel.refresh();
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
      } catch (e) {
        const msg = e.message || 'Import failed';
        status.textContent = /nothing registered/i.test(msg)
          ? 'On-device database failed to start (update ChEng AIO). ' + msg
          : msg;
        toast(status.textContent);
      }
    });

    root.querySelector('#saveVessel').addEventListener('click', async () => {
      const form = root.querySelector('#vesselForm');
      const raw = Object.fromEntries(new FormData(form).entries());
      const data = {
        name: raw.name,
        imo: raw.imo,
        callSign: raw.callSign,
        flag: window.ChengFlagRegistry ? ChengFlagRegistry.normalizeCode(raw.flag) : raw.flag,
        company: raw.company,
        type: raw.type,
        dwt: raw.dwt,
        notes: raw.notes,
        chiefEngineer: String(raw.chiefEngineer || '').trim(),
      };
      for (const key of ENGINE_FIELDS) {
        data[key] = parseOptionalNumber(raw[key]);
      }
      if (active?.voyageRegistryId) data.voyageRegistryId = active.voyageRegistryId;
      if (active?.voyageSlug) data.voyageSlug = active.voyageSlug;
      try {
        let saved = null;
        if (active && !root._forceNew) {
          saved = await ChengPro.api.fetch('/api/shell/vessels/' + encodeURIComponent(active.id), {
            method: 'PUT', body: JSON.stringify(data),
          });
          toast('Vessel saved');
        } else {
          saved = await ChengPro.api.fetch('/api/shell/vessels', {
            method: 'POST', body: JSON.stringify(data),
          });
          await ChengPro.vessel.setActive(saved.id);
          toast('Vessel created');
          root._forceNew = false;
        }
        if (window.ChengProVoyageBridge && saved) {
          try {
            const pushed = await ChengProVoyageBridge.exportVesselToVoyage({ ...data, id: saved.id || active?.id });
            if (pushed?.ok) toast(pushed.message);
          } catch (err) {
            console.warn('Voyage push skipped:', err.message);
          }
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

function normalizeAssets(raw) {
  const assets = (raw && typeof raw === 'object') ? { ...raw } : {};
  if (!assets.chEngSignatures || typeof assets.chEngSignatures !== 'object') {
    assets.chEngSignatures = {};
  }
  if (assets.vesselLogo === undefined) assets.vesselLogo = null;
  return assets;
}

function signatureKeyFor(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Same stamp + signature upload panel Tank Chief / Voyage Chief use: photograph
 * on white paper (background lifted) or sign on the device screen.
 */
function buildPrintIdentityPanel({ vesselId, assets: initialAssets, getChEngName }) {
  const panel = document.createElement('div');
  panel.style.marginTop = '8px';
  let assets = normalizeAssets(initialAssets);

  panel.innerHTML = `
    <h3 class="subhead">Printed document identity</h3>
    <p class="hint">Used on Tank Chief printouts inside ChEng AIO: the signature sits on the signature line,
      the vessel stamp just after it (same layout as Voyage Chief). Photograph a signature on white paper —
      the paper is made transparent and the image trimmed to the ink. Stored with this vessel and shared with
      the embedded Tank module.</p>
    <div id="identity-progress-host"></div>

    <h3 class="subhead">Chief Engineer signature</h3>
    <div class="stamp-row">
      <div class="stamp-preview" id="sig-preview"></div>
      <div class="stamp-controls">
        <div class="field"><label>Signature image (PNG or JPG)</label>
          <input type="file" accept="image/*" id="sig-file"></div>
        <label class="stamp-check"><input type="checkbox" id="sig-cutout" checked>
          Remove background and trim to the signature</label>
        <div class="hint" id="sig-for"></div>
        <div class="btn-row">
          <button type="button" class="btn small" id="sig-draw">Sign on screen</button>
          <button type="button" class="btn small" id="sig-recut" style="display:none">Remove background now</button>
          <button type="button" class="btn small danger" id="sig-remove" style="display:none">Remove signature</button>
        </div>
        <p class="hint" style="margin:0">Signing on screen needs no photograph: the strokes are already ink on a
          transparent background.</p>
      </div>
    </div>

    <h3 class="subhead">Vessel stamp</h3>
    <div class="stamp-row">
      <div class="stamp-preview" id="logo-preview"></div>
      <div class="stamp-controls">
        <div class="field"><label>Stamp image (PNG or JPG)</label>
          <input type="file" accept="image/*" id="logo-file"></div>
        <label class="stamp-check"><input type="checkbox" id="logo-cutout">
          Remove background and trim to the mark</label>
        <p class="hint" style="margin:0">Leave the box unticked for a stamp that already has a transparent background.</p>
        <div class="btn-row">
          <button type="button" class="btn small" id="logo-recut" style="display:none">Remove background now</button>
          <button type="button" class="btn small danger" id="logo-remove" style="display:none">Remove stamp</button>
        </div>
      </div>
    </div>`;

  async function saveAssets() {
    const saved = await ChengPro.api.fetch(
      '/api/shell/vessels/' + encodeURIComponent(vesselId) + '/assets',
      { method: 'PUT', body: JSON.stringify(assets) },
    );
    assets = normalizeAssets(saved);
    return assets;
  }

  const progressHost = () => panel.querySelector('#identity-progress-host');

  const renderPreviews = () => {
    const name = getChEngName();
    const sig = assets.chEngSignatures[signatureKeyFor(name)] || null;
    const sigBox = panel.querySelector('#sig-preview');
    sigBox.innerHTML = sig
      ? `<img src="${sig}" alt="Chief Engineer signature">`
      : `<span class="stamp-empty">${name
        ? 'No signature stored for ' + esc(name) + '.'
        : 'Enter the Chief Engineer name above, save the vessel, then upload their signature.'}</span>`;
    panel.querySelector('#sig-for').textContent = name ? `Signature on file for: ${name}` : '';
    panel.querySelector('#sig-recut').style.display = sig ? '' : 'none';
    panel.querySelector('#sig-remove').style.display = sig ? '' : 'none';

    const logoBox = panel.querySelector('#logo-preview');
    logoBox.innerHTML = assets.vesselLogo
      ? `<img src="${assets.vesselLogo}" alt="Vessel stamp">`
      : '<span class="stamp-empty">No stamp uploaded — printouts show the signature block only.</span>';
    panel.querySelector('#logo-recut').style.display = assets.vesselLogo ? '' : 'none';
    panel.querySelector('#logo-remove').style.display = assets.vesselLogo ? '' : 'none';
  };

  panel.querySelector('#sig-file').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const name = getChEngName();
    if (!name) {
      toast('Enter the Chief Engineer name first — signatures are filed under it');
      return;
    }
    if (!window.ImageCutout) {
      toast('Image tools not loaded — refresh the page');
      return;
    }
    const track = window.Progress ? Progress.start(progressHost(), 'Reading signature…') : null;
    try {
      let url = await ImageCutout.toPngDataUrl(file, 900, (pct, msg) => Progress && Progress.set(pct, msg));
      if (panel.querySelector('#sig-cutout').checked) {
        url = await ImageCutout.removeBackground(url, {
          onProgress: (pct, msg) => Progress && Progress.set(pct, msg),
        });
      }
      if (Progress) Progress.set(null, 'Saving…');
      assets.chEngSignatures[signatureKeyFor(name)] = url;
      await saveAssets();
      renderPreviews();
      if (Progress) Progress.done('Signature saved');
      toast('Signature saved for ' + name);
    } catch (err) {
      console.warn(err);
      if (Progress) Progress.done();
      toast('Could not read that image — use a PNG or JPG');
    }
    if (track) track.scrollIntoView({ block: 'nearest' });
  };

  panel.querySelector('#sig-draw').onclick = async () => {
    const name = getChEngName();
    if (!name) {
      toast('Enter the Chief Engineer name first — signatures are filed under it');
      return;
    }
    if (!window.SignaturePad || !SignaturePad.isSupported()) {
      toast('This device cannot capture a drawn signature — upload a photo instead');
      return;
    }
    const url = await SignaturePad.open({ signerName: name });
    if (!url) return;
    if (Progress) Progress.start(progressHost(), 'Saving signature…');
    try {
      assets.chEngSignatures[signatureKeyFor(name)] = url;
      await saveAssets();
      renderPreviews();
      if (Progress) Progress.done('Signature saved');
      toast('Signature saved for ' + name);
    } catch (err) {
      console.warn(err);
      if (Progress) Progress.done();
      toast('Could not save that signature');
    }
  };

  panel.querySelector('#sig-recut').onclick = async () => {
    const key = signatureKeyFor(getChEngName());
    const cur = assets.chEngSignatures[key];
    if (!cur || !window.ImageCutout) return;
    if (Progress) Progress.start(progressHost(), 'Removing background…');
    try {
      assets.chEngSignatures[key] = await ImageCutout.removeBackground(cur, {
        onProgress: (pct, msg) => Progress && Progress.set(pct, msg),
      });
      if (Progress) Progress.set(null, 'Saving…');
      await saveAssets();
      renderPreviews();
      if (Progress) Progress.done('Background removed');
    } catch (err) {
      console.warn(err);
      if (Progress) Progress.done();
      toast('Could not process that image');
    }
  };

  panel.querySelector('#sig-remove').onclick = async () => {
    delete assets.chEngSignatures[signatureKeyFor(getChEngName())];
    await saveAssets();
    renderPreviews();
  };

  panel.querySelector('#logo-file').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.ImageCutout) {
      toast('Image tools not loaded — refresh the page');
      return;
    }
    const track = Progress ? Progress.start(progressHost(), 'Reading stamp…') : null;
    try {
      let url = await ImageCutout.toPngDataUrl(file, 900, (pct, msg) => Progress && Progress.set(pct, msg));
      if (panel.querySelector('#logo-cutout').checked) {
        url = await ImageCutout.removeBackground(url, {
          onProgress: (pct, msg) => Progress && Progress.set(pct, msg),
        });
      }
      if (Progress) Progress.set(null, 'Saving…');
      assets.vesselLogo = url;
      await saveAssets();
      renderPreviews();
      if (Progress) Progress.done('Stamp saved');
      toast('Vessel stamp saved');
    } catch (err) {
      console.warn(err);
      if (Progress) Progress.done();
      toast('Could not read that image — use a PNG or JPG');
    }
    if (track) track.scrollIntoView({ block: 'nearest' });
  };

  panel.querySelector('#logo-recut').onclick = async () => {
    const cur = assets.vesselLogo;
    if (!cur || !window.ImageCutout) return;
    if (Progress) Progress.start(progressHost(), 'Removing background…');
    try {
      assets.vesselLogo = await ImageCutout.removeBackground(cur, {
        onProgress: (pct, msg) => Progress && Progress.set(pct, msg),
      });
      if (Progress) Progress.set(null, 'Saving…');
      await saveAssets();
      renderPreviews();
      if (Progress) Progress.done('Background removed');
    } catch (err) {
      console.warn(err);
      if (Progress) Progress.done();
      toast('Could not process that image');
    }
  };

  panel.querySelector('#logo-remove').onclick = async () => {
    assets.vesselLogo = null;
    await saveAssets();
    renderPreviews();
  };

  const chEngField = document.getElementById('vesselChEng');
  if (chEngField) chEngField.addEventListener('input', renderPreviews);
  renderPreviews();
  return panel;
}

async function renderFleet(tbody) {
  let vessels = [];
  try {
    vessels = await ChengPro.vessel.list();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${esc(e.message || 'Could not load fleet')}</td></tr>`;
    return;
  }
  const activeId = ChengPro.vessel.getActive()?.id;
  if (!vessels.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No vessels yet — create one above. Data is stored on this device.</td></tr>';
    return;
  }
  tbody.innerHTML = vessels.map((v) => `
    <tr>
      <td>${esc(v.name)}${v.id === activeId ? ' <span class="chip on">active</span>' : ''}</td>
      <td>${esc(v.imo || '—')}</td>
      <td>${esc(flagLabel(v.flag))}</td>
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

function flagSelectOptions(code) {
  if (window.ChengFlagRegistry && ChengFlagRegistry.selectOptions) {
    return ChengFlagRegistry.selectOptions(code);
  }
  const c = String(code || '').trim();
  return `<option value="">—</option><option value="${esc(c)}"${c ? ' selected' : ''}>${esc(c || '—')}</option>`;
}

function flagLabel(code) {
  if (window.ChengFlagRegistry && ChengFlagRegistry.displayLabel) {
    return ChengFlagRegistry.displayLabel(code) || '—';
  }
  return String(code || '').trim() || '—';
}

function flagHint(code) {
  const c = String(code || '').trim();
  if (!c) return 'Same flag list as Voyage Chief — stored as registry code for e-ORB.';
  if (window.ChengFlagRegistry && ChengFlagRegistry.displayName) {
    const name = ChengFlagRegistry.displayName(c);
    return name && name !== c ? `Stored as ${c} · ${name}` : `Stored as ${c}`;
  }
  return `Stored as ${c}`;
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
