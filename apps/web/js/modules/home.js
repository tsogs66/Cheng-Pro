window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.home = {
  title: 'Home',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    const vessels = ChengPro.vessel.getListSync();
    const firstRun = !vessels.length;
    /* Soft gate: when license is inactive, still show Home panels (nav soft-allows programs).
       Only hide when a valid seat explicitly excludes Voyage/Tanks. */
    const hasVoyage = moduleSoftAllowed('voyage');
    const hasTanks = moduleSoftAllowed('tanks');
    const Dash = window.ChengProHomeDashboard;

    root.innerHTML = `
      ${firstRun ? `
      <section class="panel">
        <div class="form-actions">
          <button type="button" class="btn primary" data-go="vessel">Set up this vessel</button>
        </div>
        <p class="hint" style="margin-top:10px">Start with the ship name and IMO. Home becomes an operational dashboard once a vessel is active.</p>
      </section>` : `
      <div class="vessel-chip">
        <span>Working vessel</span>
        <strong>${active ? esc(active.name) : 'None selected'}</strong>
        ${active?.imo ? `<em>${esc(active.imo)}</em>` : ''}
      </div>`}

      <section class="panel" id="homeVoyagePanel">
        <div class="section-head">
          <h2>Voyage progress</h2>
          <div class="sub" id="homeVoyageSub">${hasVoyage ? 'Loading…' : 'Voyage not on this license'}</div>
        </div>
        ${hasVoyage ? `
        <div class="toggle-row" id="homeWxToggle">
          <button type="button" class="on" data-wx="full" title="Wind + rain across full voyage line">Full-track wind + rain</button>
          <button type="button" data-wx="local" title="Weather only near the ship">Ship-local weather</button>
        </div>
        <div id="voyageProgressViz"></div>
        <div class="home-voyage-strip" id="homeVoyageProgressStrip" hidden></div>
        <p class="hint" id="homeVoyageEtaHint" style="margin-top:8px" hidden>
          Distance To Go, Days To Go and ETA use Total Voyage Distance minus distance run, divided by the last entry’s speed (voyage average if needed).
        </p>
        <div class="form-actions" style="margin-top:10px">
          <button type="button" class="btn" id="goVoyageFromHome">Open Voyage Chief</button>
        </div>` : `
        <p class="home-warn">Voyage Chief is not on this license — ask the office to include it on your ChEng AIO key.</p>`}
      </section>

      <section class="panel" id="homeGaugesPanel">
        <div class="section-head">
          <h2>Consumption vs ROB</h2>
          <div class="sub">Voyage opening ROB · dials match Voyage Chief</div>
        </div>
        <div class="gauge-grid" id="fuelDualGauges"></div>
        <p class="hint" id="homeGaugeHint" style="margin-top:8px"></p>
      </section>

      <section class="panel" id="homeTanksPanel">
        <div class="section-head">
          <h2>Vessel tank overview</h2>
          <div class="sub">Fuel tanks only</div>
        </div>
        ${hasTanks ? `
        <div class="cards-row" id="homeFuelSummary"></div>
        <div class="tg-grid" id="homeFuelGrid"></div>
        <div class="form-actions" style="margin-top:10px">
          <button type="button" class="btn" id="goTanksFromHome">Open Tank Chief</button>
        </div>` : `
        <p class="home-warn">Tank Chief is not on this license — ask the office to include it on your ChEng AIO key.</p>`}
      </section>
    `;

    root.querySelectorAll('[data-go]').forEach((btn) => {
      btn.onclick = () =>
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
    });
    root.querySelector('#goVoyageFromHome')?.addEventListener('click', () => ChengPro.openVoyage());
    root.querySelector('#goTanksFromHome')?.addEventListener('click', () => ChengPro.openTanks());

    let wxMode = 'full';
    let voyageSnap = null;

    function paintVoyage() {
      const viz = root.querySelector('#voyageProgressViz');
      const sub = root.querySelector('#homeVoyageSub');
      const strip = root.querySelector('#homeVoyageProgressStrip');
      const etaHint = root.querySelector('#homeVoyageEtaHint');
      if (!hasVoyage || !Dash) return;
      if (!voyageSnap || !voyageSnap.ok) {
        if (sub) sub.textContent = 'No Voyage Chief data on this device yet';
        if (viz) {
          viz.innerHTML = `<div class="hint">Open Voyage Chief once for this vessel to populate progress and weather.</div>`;
        }
        if (Dash.renderVoyageProgressStrip) Dash.renderVoyageProgressStrip(strip, null);
        if (etaHint) etaHint.hidden = true;
        const gauges = root.querySelector('#fuelDualGauges');
        if (gauges) gauges.innerHTML = `<div class="hint">Open Voyage Chief to load fuel ROB gauges.</div>`;
        return;
      }
      const total = voyageSnap.totalDistance;
      if (sub) {
        if (total > 0) {
          sub.textContent = `${voyageSnap.departPort || 'Departure'} → ${voyageSnap.arrivePort || 'Arrival'} · ${Number(total).toLocaleString()} nm`;
        } else {
          sub.textContent = 'Set voyage distance in Voyage Setup';
        }
      }
      Dash.renderVoyageProgressViz(viz, voyageSnap, wxMode);
      if (Dash.renderVoyageProgressStrip) Dash.renderVoyageProgressStrip(strip, voyageSnap);
      if (etaHint) etaHint.hidden = false;
      Dash.renderFuelGauges(root.querySelector('#fuelDualGauges'), voyageSnap);
      const hint = root.querySelector('#homeGaugeHint');
      if (hint) {
        hint.textContent = voyageSnap.entryCount
          ? 'Current needle uses opening ROB, or the latest bunker-survey measured figures when present. Open Voyage Chief for live consumption-chain ROB.'
          : 'Showing voyage opening ROB (no log entries yet).';
      }
    }

    root.querySelectorAll('#homeWxToggle [data-wx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        wxMode = btn.dataset.wx;
        root.querySelectorAll('#homeWxToggle [data-wx]').forEach((b) => b.classList.toggle('on', b === btn));
        paintVoyage();
      });
    });

    if (hasVoyage && window.ChengProVoyageBridge && typeof ChengProVoyageBridge.readHomeSnapshot === 'function') {
      try {
        voyageSnap = await ChengProVoyageBridge.readHomeSnapshot(active);
      } catch (err) {
        console.warn('Home voyage snapshot:', err);
        voyageSnap = null;
      }
    }
    paintVoyage();

    if (hasTanks && active) {
      try {
        const tankId = await resolveTankVesselId(active);
        const bundle = tankId ? await loadTankBundle(tankId) : null;
        if (Dash && bundle) {
          Dash.renderFuelTankOverview(
            root.querySelector('#homeFuelSummary'),
            root.querySelector('#homeFuelGrid'),
            bundle
          );
        } else if (Dash) {
          const grid = root.querySelector('#homeFuelGrid');
          const summary = root.querySelector('#homeFuelSummary');
          if (summary) summary.innerHTML = '';
          if (grid) {
            grid.innerHTML = `<div class="hint">No Tank Chief vessel matches ${esc(active.name || active.id)} yet. Open Tank Chief once for this ship.</div>`;
          }
        }
      } catch (err) {
        const grid = root.querySelector('#homeFuelGrid');
        const summary = root.querySelector('#homeFuelSummary');
        if (summary) summary.innerHTML = '';
        if (grid) {
          grid.innerHTML = `<div class="hint">Could not load Tank Chief data (${esc(err.message || 'offline')}).</div>`;
        }
      }
    } else if (hasTanks && !active) {
      const grid = root.querySelector('#homeFuelGrid');
      if (grid) grid.innerHTML = `<div class="hint">Select an active vessel to see fuel tanks.</div>`;
    }
  },
};

async function listTankVessels() {
  if (typeof LocalApi !== 'undefined' && LocalApi.start && LocalApi.handle) {
    try {
      await LocalApi.start();
      const st = await LocalApi.handle('GET', '/api/status');
      if (st.status < 400 && st.body && Array.isArray(st.body.vessels)) return st.body.vessels;
      const list = await LocalApi.handle('GET', '/api/vessels');
      if (list.status < 400 && list.body) {
        return Array.isArray(list.body) ? list.body : (list.body.vessels || []);
      }
    } catch { /* fall through to HTTP */ }
  }
  if (window.ChengProApi && ChengProApi.api) {
    try {
      const st = await ChengProApi.api('/tanks/api/status');
      if (st && Array.isArray(st.vessels)) return st.vessels;
    } catch { /* ignore */ }
    try {
      const data = await ChengProApi.api('/tanks/api/vessels');
      return Array.isArray(data) ? data : ((data && data.vessels) || []);
    } catch {
      return [];
    }
  }
  return [];
}

/** Map AIO shell vessel → Tank folder id via IMO, then slug/name. */
async function resolveTankVesselId(active) {
  if (!active) return null;
  const vessels = await listTankVessels();
  if (!vessels.length) return active.id || null;
  if (window.ChengProVoyageBridge && typeof ChengProVoyageBridge.resolveFromList === 'function') {
    const match = ChengProVoyageBridge.resolveFromList(vessels, active);
    if (match && match.id) return match.id;
  }
  if (vessels.some((v) => v.id === active.id)) return active.id;
  return null;
}

async function loadTankBundle(vesselId) {
  if (!vesselId) return null;
  if (typeof LocalApi !== 'undefined' && LocalApi.start && LocalApi.handle) {
    try {
      await LocalApi.start();
      const res = await LocalApi.handle('GET', '/api/vessels/' + encodeURIComponent(vesselId));
      if (res.status < 400 && res.body) return res.body;
    } catch { /* fall through to HTTP */ }
  }
  if (window.ChengProApi && ChengProApi.api) {
    return ChengProApi.api('/tanks/api/vessels/' + encodeURIComponent(vesselId));
  }
  return null;
}

function moduleSoftAllowed(moduleId) {
  if (!window.ChengLicense) return true;
  try {
    const ent = ChengLicense.loadEntitlement();
    if (!ChengLicense.isValid(ent)) return true;
    return ChengLicense.moduleAllowed(moduleId, ent);
  } catch {
    return true;
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
