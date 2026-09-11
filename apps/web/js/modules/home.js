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
    const hasConsPlan = moduleSoftAllowed('bunkerplan');
    const hasBunkerPlan = moduleSoftAllowed('bunkeringplan');
    const Dash = window.ChengProHomeDashboard;

    root.innerHTML = `
      ${firstRun ? `
      <section class="panel">
        <div class="form-actions">
          <button type="button" class="btn primary" data-go="vessel">Set up this vessel</button>
        </div>
        <p class="hint" style="margin-top:10px">Start with the ship name and IMO. Home becomes an operational dashboard once a vessel is active.</p>
      </section>` : ''}

      <section class="panel" id="homeVoyagePanel">
        <div class="section-head">
          <h2>Voyage progress</h2>
          <div class="sub" id="homeVoyageSub">${hasVoyage ? 'Loading…' : 'Voyage not on this license'}</div>
        </div>
        ${hasVoyage ? `
        <div class="toggle-row" id="homeWxToggle">
          <button type="button" class="on" data-wx="full" title="Wind + rain across full voyage line">Full-track wind + rain</button>
          <button type="button" data-wx="local" title="Weather only near the ship">Ship-local weather</button>
          <button type="button" class="home-action" id="goVoyageFromHome" title="Open Voyage Chief">Voyage Chief</button>
          ${hasConsPlan ? '<button type="button" class="home-action" id="goConsPlanFromHome" title="Open Consumption Plan">Consumption Plan</button>' : ''}
        </div>
        <div id="voyageProgressViz"></div>
        <div class="home-voyage-strip" id="homeVoyageProgressStrip" hidden></div>` : `
        <p class="home-warn">Voyage Chief is not on this license — ask the office to include it on your ChEng AIO key.</p>`}
      </section>

      <section class="panel" id="homeGaugesPanel">
        <div class="section-head">
          <h2>Calculated ROB</h2>
          <div class="sub">Opening vs Present from Voyage log</div>
        </div>
        <div class="gauge-grid" id="fuelDualGauges"></div>
      </section>

      <section class="panel" id="homeTanksPanel">
        <div class="section-head">
          <h2>Vessel tank overview</h2>
          <div class="sub">Fuel tanks only</div>
        </div>
        ${hasTanks ? `
        <div class="toggle-row home-tank-actions">
          <button type="button" class="home-action" id="goTanksFromHome" title="Open Tank Chief">Tank Chief</button>
          ${hasBunkerPlan ? '<button type="button" class="home-action" id="goBunkerPlanFromHome" title="Open Bunkering Plan">Bunkering Plan</button>' : ''}
        </div>
        <div class="cards-row" id="homeFuelSummary"></div>
        <div class="tg-grid" id="homeFuelGrid"></div>` : `
        <p class="home-warn">Tank Chief is not on this license — ask the office to include it on your ChEng AIO key.</p>`}
      </section>
    `;

    root.querySelectorAll('[data-go]').forEach((btn) => {
      btn.onclick = () =>
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
    });
    root.querySelector('#goVoyageFromHome')?.addEventListener('click', () => ChengPro.openVoyage());
    root.querySelector('#goTanksFromHome')?.addEventListener('click', () => ChengPro.openTanks());
    root.querySelector('#goConsPlanFromHome')?.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'bunkerplan' })));
    root.querySelector('#goBunkerPlanFromHome')?.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'bunkeringplan' })));

    let wxMode = 'full';
    let voyageSnap = null;

    function paintVoyage() {
      const viz = root.querySelector('#voyageProgressViz');
      const sub = root.querySelector('#homeVoyageSub');
      const strip = root.querySelector('#homeVoyageProgressStrip');
      if (!hasVoyage || !Dash) return;
      if (!voyageSnap || !voyageSnap.ok) {
        if (sub) sub.textContent = 'No Voyage Chief data on this device yet';
        if (viz) {
          viz.innerHTML = `<div class="hint">Open Voyage Chief once for this vessel to populate progress and weather.</div>`;
        }
        if (Dash.renderVoyageProgressStrip) Dash.renderVoyageProgressStrip(strip, null);
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
      Dash.renderFuelGauges(root.querySelector('#fuelDualGauges'), voyageSnap);
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
        const bundle = await loadTankBundleForActive(active);
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
            grid.innerHTML = `<div class="hint">No Tank Chief vessel matches ${esc(active.name || active.id)} yet (tried IMO / name ignoring MV). Open Tank Chief once for this ship.</div>`;
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

/** Match Tank Chief / shell-local: license email isolates offline data under users/<slug>/. */
function applyTankOfflineScope() {
  try {
    if (typeof StoreCore === 'undefined' || typeof StoreCore.setUserScope !== 'function') return;
    if (!window.ChengLicense) return;
    StoreCore.setUserScope({
      email: ChengLicense.licenseEmail() || null,
      master: !!ChengLicense.isMaster(),
    });
  } catch { /* ignore */ }
}

async function listTankVessels() {
  applyTankOfflineScope();
  /* Bundled offline: ChengProApi is patched by shell-local to LocalApi WITH scope. */
  if (window.ChengProApi && ChengProApi.api) {
    try {
      const st = await ChengProApi.api('/tanks/api/status');
      if (st && Array.isArray(st.vessels) && st.vessels.length) return st.vessels;
    } catch { /* ignore */ }
    try {
      const data = await ChengProApi.api('/tanks/api/vessels');
      const list = Array.isArray(data) ? data : ((data && data.vessels) || []);
      if (list.length) return list;
    } catch { /* fall through */ }
  }
  if (typeof LocalApi !== 'undefined' && LocalApi.start && LocalApi.handle) {
    try {
      await LocalApi.start();
      applyTankOfflineScope();
      const st = await LocalApi.handle('GET', '/api/status');
      if (st.status < 400 && st.body && Array.isArray(st.body.vessels)) return st.body.vessels;
      const list = await LocalApi.handle('GET', '/api/vessels');
      if (list.status < 400 && list.body) {
        return Array.isArray(list.body) ? list.body : (list.body.vessels || []);
      }
    } catch { /* ignore */ }
  }
  return [];
}

/** Candidate Tank folder ids for a shell vessel (legacy mv- prefix + slugify). */
function tankIdCandidates(active) {
  if (!active) return [];
  const out = [];
  const push = (id) => {
    const s = String(id || '').trim();
    if (!s || out.includes(s)) return;
    out.push(s);
  };
  push(active.id);
  push(active.voyageSlug);
  push(active.slug);
  if (active.id && /^mv-/i.test(active.id)) push(active.id.replace(/^mv-/i, ''));
  else if (active.id) push('mv-' + active.id);
  const slugFn = window.ChengProVoyageBridge && ChengProVoyageBridge.slugify;
  if (typeof slugFn === 'function' && active.name) {
    const core = slugFn(active.name);
    push(core);
    push('mv-' + core);
  }
  return out;
}

/**
 * Map AIO shell vessel → Tank folder id via IMO, then slug/name (ignore MV),
 * then legacy mv- folder aliases.
 */
async function resolveTankVesselId(active) {
  if (!active) return null;
  const vessels = await listTankVessels();
  if (vessels.length && window.ChengProVoyageBridge
      && typeof ChengProVoyageBridge.resolveFromList === 'function') {
    const match = ChengProVoyageBridge.resolveFromList(vessels, active);
    if (match && match.id) return match.id;
  }
  for (const id of tankIdCandidates(active)) {
    if (vessels.some((v) => v.id === id)) return id;
  }
  /* List empty / unresolved — still try active id and aliases on load. */
  return active.id || null;
}

async function loadTankBundle(vesselId) {
  if (!vesselId) return null;
  applyTankOfflineScope();
  if (window.ChengProApi && ChengProApi.api) {
    try {
      const viaApi = await ChengProApi.api('/tanks/api/vessels/' + encodeURIComponent(vesselId));
      if (viaApi && (viaApi.vessel || viaApi.tanks)) return viaApi;
    } catch { /* fall through */ }
  }
  if (typeof LocalApi !== 'undefined' && LocalApi.start && LocalApi.handle) {
    try {
      await LocalApi.start();
      applyTankOfflineScope();
      const res = await LocalApi.handle('GET', '/api/vessels/' + encodeURIComponent(vesselId));
      if (res.status < 400 && res.body) return res.body;
    } catch { /* ignore */ }
  }
  return null;
}

/** Resolve then try alias folder ids until a Tank bundle loads. */
async function loadTankBundleForActive(active) {
  if (!active) return null;
  const tried = new Set();
  const ordered = [];
  const primary = await resolveTankVesselId(active);
  if (primary) ordered.push(primary);
  for (const id of tankIdCandidates(active)) ordered.push(id);

  let lastErr = null;
  for (const id of ordered) {
    if (!id || tried.has(id)) continue;
    tried.add(id);
    try {
      const bundle = await loadTankBundle(id);
      if (bundle && (bundle.vessel || bundle.tanks)) return bundle;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
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
