window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.voyage = {
  title: 'Voyage',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    if (!active) {
      root.innerHTML = emptyState('Select or create a vessel first.', 'vessel');
      return;
    }

    let bundle;
    try {
      bundle = await ChengPro.api.fetch('/api/voyage/' + encodeURIComponent(active.id));
    } catch (e) {
      root.innerHTML = `<section class="panel"><p class="empty">${esc(e.message)}</p></section>`;
      return;
    }

    const setup = bundle.setup || {};
    const entries = bundle.entries || [];
    const receipts = bundle.receipts || [];
    const legs = bundle.legs || [];

    root.innerHTML = `
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Voyage — ${esc(active.name)}</h2>
            <p>Voyage-only plane. Ship identity comes from Vessel Setup.</p>
          </div>
          <div class="chips">
            <span class="chip on">IMO ${esc(active.imo || '—')}</span>
            <span class="chip">${entries.length} entries</span>
            <span class="chip">${receipts.length} receipts</span>
          </div>
        </div>
        <form id="voyageSetup" class="grid-2">
          <div class="field"><label>Voyage number</label><input name="voyageNumber" value="${esc(setup.voyageNumber || '')}"></div>
          <div class="field"><label>Condition</label>
            <select name="shipCondition">
              <option value="B" ${setup.shipCondition === 'B' ? 'selected' : ''}>Ballast</option>
              <option value="L" ${setup.shipCondition === 'L' ? 'selected' : ''}>Laden</option>
            </select>
          </div>
          <div class="field"><label>Chief Engineer</label><input name="chEng" value="${esc(setup.chEng || '')}"></div>
          <div class="field"><label>TZ offset (min)</label><input name="tzOffsetMin" type="number" value="${esc(setup.tzOffsetMin ?? 0)}"></div>
          <div class="field"><label>Departure port</label><input name="departPort" value="${esc(setup.departPort || '')}"></div>
          <div class="field"><label>Arrival port</label><input name="arrivePort" value="${esc(setup.arrivePort || '')}"></div>
          <div class="field"><label>Vessel name (shared)</label><input value="${esc(active.name)}" disabled></div>
          <div class="field"><label>IMO (shared)</label><input value="${esc(active.imo || '')}" disabled></div>
        </form>
        <div class="form-actions">
          <button type="button" class="btn primary" id="saveSetup">Save voyage setup</button>
          <button type="button" class="btn" id="pushLeg">Push leg to server</button>
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Log entries</h2>
            <p>Working set for this vessel (voyage plane).</p>
          </div>
          <button type="button" class="btn" id="addEntry">Add entry</button>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Date/time</th><th>Operation</th><th>Distance</th><th>RPM</th><th></th></tr></thead>
            <tbody id="entriesBody">
              ${entries.length ? entries.map(entryRow).join('') : '<tr><td colspan="5" class="empty">No entries yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Synced legs</h2>
            <p>Server voyage number × condition packs.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Voyage</th><th>Cond</th><th>Entries</th><th>Updated</th></tr></thead>
            <tbody>
              ${legs.length ? legs.map((l) => `
                <tr>
                  <td>${esc(l.voyageNumber)}</td>
                  <td>${esc(l.condition)}</td>
                  <td>${esc(l.entryCount)}</td>
                  <td>${esc((l.updatedAt || '').slice(0, 19).replace('T', ' '))}</td>
                </tr>`).join('') : '<tr><td colspan="4" class="empty">No legs pushed yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;

    root.querySelector('#saveSetup').addEventListener('click', async () => {
      const data = Object.fromEntries(new FormData(root.querySelector('#voyageSetup')).entries());
      data.tzOffsetMin = Number(data.tzOffsetMin || 0);
      try {
        await ChengPro.api.fetch('/api/voyage/' + encodeURIComponent(active.id) + '/setup', {
          method: 'PUT',
          body: JSON.stringify({ ...setup, ...data }),
        });
        toast('Voyage setup saved');
      } catch (e) { toast(e.message); }
    });

    root.querySelector('#addEntry').addEventListener('click', async () => {
      const datetime = prompt('Entry date/time (ISO or YYYY-MM-DD HH:mm)', new Date().toISOString().slice(0, 16).replace('T', ' '));
      if (!datetime) return;
      const operation = prompt('Operation', 'NOON') || 'NOON';
      const entry = {
        id: 'e-' + Date.now().toString(36),
        vesselId: active.id,
        datetime,
        operation,
        condition: setup.shipCondition || 'B',
        distanceShip: 0,
        rpm: 0,
        updatedAt: new Date().toISOString(),
      };
      const next = [...entries, entry];
      try {
        await ChengPro.api.fetch('/api/voyage/' + encodeURIComponent(active.id) + '/entries', {
          method: 'PUT',
          body: JSON.stringify(next),
        });
        toast('Entry added');
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'voyage' }));
      } catch (e) { toast(e.message); }
    });

    root.querySelector('#pushLeg').addEventListener('click', async () => {
      const form = Object.fromEntries(new FormData(root.querySelector('#voyageSetup')).entries());
      const voyageNumber = form.voyageNumber || setup.voyageNumber || '001';
      const condition = form.shipCondition || setup.shipCondition || 'B';
      try {
        const fresh = await ChengPro.api.fetch('/api/voyage/' + encodeURIComponent(active.id));
        await ChengPro.api.fetch(
          `/api/voyage/${encodeURIComponent(active.id)}/${encodeURIComponent(voyageNumber)}/${encodeURIComponent(condition)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              vesselId: active.id,
              voyageNumber,
              condition,
              updatedAt: new Date().toISOString(),
              data: {
                setup: { ...fresh.setup, ...form, voyageNumber, shipCondition: condition },
                entries: fresh.entries,
                receipts: fresh.receipts,
                documents: fresh.documents,
                abstracts: fresh.abstracts,
                printHistory: fresh.printHistory,
                orbEntries: fresh.orbEntries,
                deletedIds: fresh.deletedIds,
              },
            }),
          }
        );
        toast('Leg pushed');
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'voyage' }));
      } catch (e) { toast(e.message); }
    });

    root.querySelectorAll('[data-del-entry]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = entries.filter((e) => e.id !== btn.dataset.delEntry);
        try {
          await ChengPro.api.fetch('/api/voyage/' + encodeURIComponent(active.id) + '/entries', {
            method: 'PUT',
            body: JSON.stringify(next),
          });
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'voyage' }));
        } catch (e) { toast(e.message); }
      });
    });
  },
};

function entryRow(e) {
  return `<tr>
    <td>${esc(e.datetime || '')}</td>
    <td>${esc(e.operation || '')}</td>
    <td>${esc(e.distanceShip ?? '')}</td>
    <td>${esc(e.rpm ?? '')}</td>
    <td><button type="button" class="btn danger" data-del-entry="${esc(e.id)}">Delete</button></td>
  </tr>`;
}

function emptyState(msg, go) {
  return `<section class="panel">
    <p class="empty">${esc(msg)}</p>
    <button type="button" class="btn primary" onclick="window.dispatchEvent(new CustomEvent('chengpro:navigate',{detail:'${go}'}))">Vessel Setup</button>
  </section>`;
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
