window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.tanks = {
  title: 'Tanks',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    if (!active) {
      root.innerHTML = `<section class="panel">
        <p class="empty">Select or create a vessel first.</p>
        <button type="button" class="btn primary" data-go="vessel">Vessel Setup</button>
      </section>`;
      root.querySelector('[data-go]')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
      });
      return;
    }

    let bundle;
    try {
      bundle = await ChengPro.api.fetch('/api/tanks/' + encodeURIComponent(active.id));
    } catch (e) {
      root.innerHTML = `<section class="panel"><p class="empty">${esc(e.message)}</p></section>`;
      return;
    }

    const tanks = flattenTanks(bundle.tanks || {});
    const readings = bundle.readings || {};

    root.innerHTML = `
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Tanks — ${esc(active.name)}</h2>
            <p>Tank-only plane. Calibration and readings do not touch voyage noon data.</p>
          </div>
          <div class="chips">
            <span class="chip on">IMO ${esc(active.imo || '—')}</span>
            <span class="chip">${tanks.length} tanks</span>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn primary" id="addTank">Add tank</button>
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Tank list</h2>
            <p>Shared vessel identity above; tank records below.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr><th>Name</th><th>Category</th><th>Grade</th><th>Role</th><th>Capacity</th><th>Reading</th><th></th></tr>
            </thead>
            <tbody>
              ${tanks.length ? tanks.map((t) => tankRow(t, readings[t.id])).join('') : '<tr><td colspan="7" class="empty">No tanks yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Save reading</h2>
            <p>Stores on the tank plane for the active vessel.</p>
          </div>
        </div>
        <form id="readingForm" class="grid-2">
          <div class="field"><label>Tank</label>
            <select name="tankId">
              ${tanks.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('') || '<option value="">No tanks</option>'}
            </select>
          </div>
          <div class="field"><label>Reading (mm)</label><input name="reading" type="number" step="any"></div>
          <div class="field"><label>Trim</label><input name="trim" type="number" step="any" value="0"></div>
          <div class="field"><label>List</label><input name="list" type="number" step="any" value="0"></div>
          <div class="field"><label>Temp °C</label><input name="tempC" type="number" step="any" value="25"></div>
          <div class="field"><label>Density @15</label><input name="density15" type="number" step="any" value="0.95"></div>
        </form>
        <div class="form-actions">
          <button type="button" class="btn primary" id="saveReading" ${tanks.length ? '' : 'disabled'}>Save reading</button>
          <button type="button" class="btn" id="calcReading" ${tanks.length ? '' : 'disabled'}>Calculate</button>
        </div>
        <pre id="calcOut" class="empty" style="white-space:pre-wrap"></pre>
      </section>
    `;

    root.querySelector('#addTank').addEventListener('click', async () => {
      const name = prompt('Tank name', 'NO.1 H.F.O. TANK (P)');
      if (!name) return;
      const category = prompt('Category: fuel | lube | misc | water', 'fuel') || 'fuel';
      try {
        await ChengPro.api.fetch('/api/tanks/' + encodeURIComponent(active.id) + '/tanks', {
          method: 'POST',
          body: JSON.stringify({
            name,
            category,
            fuelGrade: 'hfo',
            fuelRole: 'storage',
            capacity: 0,
          }),
        });
        toast('Tank added');
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'tanks' }));
      } catch (e) { toast(e.message); }
    });

    root.querySelectorAll('[data-del-tank]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete tank?')) return;
        try {
          await ChengPro.api.fetch(
            `/api/tanks/${encodeURIComponent(active.id)}/tanks/${encodeURIComponent(btn.dataset.delTank)}`,
            { method: 'DELETE' }
          );
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'tanks' }));
        } catch (e) { toast(e.message); }
      });
    });

    async function readingPayload() {
      const data = Object.fromEntries(new FormData(root.querySelector('#readingForm')).entries());
      return {
        tankId: data.tankId,
        reading: Number(data.reading || 0),
        trim: Number(data.trim || 0),
        list: Number(data.list || 0),
        tempC: Number(data.tempC || 25),
        density15: Number(data.density15 || 0.95),
        savedAt: new Date().toISOString(),
      };
    }

    root.querySelector('#saveReading').addEventListener('click', async () => {
      try {
        const payload = await readingPayload();
        const next = { ...readings, [payload.tankId]: payload };
        await ChengPro.api.fetch('/api/tanks/' + encodeURIComponent(active.id) + '/readings', {
          method: 'PUT',
          body: JSON.stringify(next),
        });
        toast('Reading saved');
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'tanks' }));
      } catch (e) { toast(e.message); }
    });

    root.querySelector('#calcReading').addEventListener('click', async () => {
      try {
        const payload = await readingPayload();
        const result = await ChengPro.api.fetch(
          '/api/tanks/' + encodeURIComponent(active.id) + '/calculate',
          { method: 'POST', body: JSON.stringify(payload) }
        );
        root.querySelector('#calcOut').textContent = JSON.stringify(result.result || result, null, 2);
      } catch (e) {
        root.querySelector('#calcOut').textContent = e.message;
      }
    });
  },
};

function flattenTanks(grouped) {
  const out = [];
  for (const cat of Object.keys(grouped)) {
    for (const t of grouped[cat] || []) out.push(t);
  }
  return out;
}

function tankRow(t, reading) {
  return `<tr>
    <td>${esc(t.name)}</td>
    <td>${esc(t.category)}</td>
    <td>${esc(t.fuelGrade || '')}</td>
    <td>${esc(t.fuelRole || '')}</td>
    <td>${esc(t.capacity ?? '')}</td>
    <td>${reading ? esc(reading.reading) : '—'}</td>
    <td><button type="button" class="btn danger" data-del-tank="${esc(t.id)}">Delete</button></td>
  </tr>`;
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
