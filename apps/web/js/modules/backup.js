(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function toast(msg) {
    window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: msg }));
  }

  const SUITE_FORMAT = 'cheng-aio-suite-v1';

  function downloadWhereLabel(saved) {
    if (window.ChengSaveFile) return ChengSaveFile.whereLabel(saved);
    if (!saved) return 'saved';
    return `started — check Downloads for ${saved.filename}`;
  }

  /** Save JSON where the user can find it — see js/save-file.js for the order. */
  async function downloadJson(name, data) {
    const safeName = name || `cheng-aio-backup-${Date.now()}.json`;
    if (window.ChengSaveFile) return ChengSaveFile.saveJson(safeName, data);
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { a.remove(); } catch (_) { /* ignore */ }
      try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
    }, 4000);
    return { method: 'anchor', filename: safeName };
  }

  function readFileJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(String(reader.result || ''))); }
        catch (e) { reject(new Error('Invalid JSON file')); }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  /* ------------------------------------------------------------ Tank Chief --
   *
   * Tank Chief keeps two separate databases and which one is in use is a
   * setting, not a guess: `server` is the Express API over HTTP, `local` runs
   * the same routes on this device over IndexedDB. The phone application and
   * the portable build have no server at all.
   *
   * This screen used to fetch('/tanks/api/backup') unconditionally, so on the
   * APK — the one place a chief engineer most needs a backup he can hand over
   * — every button here failed, or worse, saved the shell's index.html. It now
   * asks whichever database the rest of Tank Chief is actually writing to.
   */
  const TRANSPORT_KEY = 'apiTransport';

  function bundledClient() {
    return !!(window.ChengProBundled && ChengProBundled.isBundledClient());
  }

  function tankTransport() {
    try {
      const saved = localStorage.getItem(TRANSPORT_KEY);
      if (saved === 'local' || saved === 'server') return saved;
    } catch { /* private mode */ }
    return bundledClient() ? 'local' : 'server';
  }

  function canUseLocalTank() {
    return typeof LocalApi !== 'undefined' && typeof LocalApi.handle === 'function';
  }

  function usingLocalTank() {
    return tankTransport() === 'local' && canUseLocalTank();
  }

  /** Where this screen's Tank data is coming from, for the status line. */
  function tankSourceLabel() {
    return usingLocalTank() ? 'this device' : 'the server';
  }

  async function tankRequest(path, options = {}) {
    if (usingLocalTank()) {
      await LocalApi.start();
      let body = options.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* leave as text */ }
      }
      const res = await LocalApi.handle(options.method || 'GET', path, body);
      if (res.status >= 400) {
        throw new Error((res.body && res.body.error) || 'Request failed');
      }
      return res.body;
    }
    return ChengProApi.api('/tanks' + path, options);
  }

  function importTankBackup(backup, merge) {
    return tankRequest('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify({ backup, merge: String(!!merge) }),
    });
  }

  /**
   * Hit the live ChEng AIO gateway (Express), never LocalApi/IndexedDB.
   * Server vessel library and peer probes must see the on-disk server database —
   * offline LocalApi only has this device's empty/partial copy after a profile reset.
   */
  async function gatewayTankApi(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    try {
      if (typeof ChengLicense !== 'undefined' && ChengLicense.authHeaders) {
        Object.assign(headers, ChengLicense.authHeaders());
      }
    } catch (_) { /* ignore */ }
    try {
      if (window.ChengProApi && ChengProApi.getToken) {
        const token = ChengProApi.getToken();
        if (token) {
          headers['X-Session-Token'] = token;
          headers.Authorization = 'Bearer ' + token;
        }
      }
    } catch (_) { /* ignore */ }
    const url = '/tanks' + path;
    const res = await fetch(url, { ...options, headers });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
    if (!res.ok) {
      throw new Error((data && (data.error || data.message)) || res.statusText || 'Request failed');
    }
    return data;
  }

  /* ---------------------------------------------------------- Voyage Chief --
   * Voyage Chief owns its IndexedDB inside its own frame, so the shell asks it
   * over postMessage rather than reaching into the database itself. */

  let voyageFrame = null;
  let voyageReady = false;
  let voyageMsgBound = false;
  const pendingVoyage = {};

  function voyageFrameAlive() {
    try {
      return !!(voyageFrame && voyageFrame.isConnected && voyageFrame.contentWindow);
    } catch (_) {
      return false;
    }
  }

  function bindVoyageMessages() {
    if (voyageMsgBound) return;
    voyageMsgBound = true;
    window.addEventListener('message', (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'chengaio-voyage-ready') {
        if (!voyageFrame || ev.source === voyageFrame.contentWindow) voyageReady = true;
      }
      if (msg.type === 'chengaio-voyage-backup-result' && msg.requestId && pendingVoyage[msg.requestId]) {
        const { resolve, reject } = pendingVoyage[msg.requestId];
        delete pendingVoyage[msg.requestId];
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg);
      }
    });
  }

  function voyageMount(host) {
    if (!host || !host.querySelector) return host;
    return host.querySelector('#bk-voyage-bridge-host') || host;
  }

  function ensureVoyageFrame(host) {
    bindVoyageMessages();
    const mount = voyageMount(host);
    if (voyageFrameAlive()) {
      if (mount && voyageFrame.parentElement !== mount) {
        try { mount.appendChild(voyageFrame); } catch (_) { /* ignore */ }
      }
      return voyageFrame;
    }
    voyageReady = false;
    voyageFrame = document.createElement('iframe');
    voyageFrame.className = 'aio-backup-voyage-bridge-frame';
    voyageFrame.title = 'Voyage Chief backup bridge';
    voyageFrame.setAttribute('aria-hidden', 'true');
    voyageFrame.tabIndex = -1;
    /* Hidden bridge only — Backup paints its own Server Sync form. */
    voyageFrame.src = ChengPro.voyageEmbedUrl({ page: 'data' });
    if (mount) mount.appendChild(voyageFrame);
    else if (host) host.appendChild(voyageFrame);
    return voyageFrame;
  }

  function readVoyageSyncForm(root) {
    return {
      serverUrl: (root.querySelector('#bk-voy-sync-url')?.value || '').trim(),
      apiToken: (root.querySelector('#bk-voy-sync-token')?.value || '').trim(),
      vesselId: (root.querySelector('#bk-voy-sync-vessel')?.value || '').trim(),
      deviceName: (root.querySelector('#bk-voy-sync-device')?.value || '').trim(),
      conflictPolicy: root.querySelector('#bk-voy-sync-conflict')?.value || 'merge',
    };
  }

  function fillVoyageSyncForm(root, settings) {
    if (!settings) return;
    const url = root.querySelector('#bk-voy-sync-url');
    const tok = root.querySelector('#bk-voy-sync-token');
    const vessel = root.querySelector('#bk-voy-sync-vessel');
    const device = root.querySelector('#bk-voy-sync-device');
    const conflict = root.querySelector('#bk-voy-sync-conflict');
    if (url) url.value = settings.serverUrl || '';
    if (tok && settings.apiToken) tok.value = settings.apiToken;
    if (vessel) vessel.value = settings.vesselId || '';
    if (device) device.value = settings.deviceName || '';
    if (conflict) conflict.value = settings.conflictPolicy || 'merge';
  }

  async function voyagePost(action, extra, host) {
    ensureVoyageFrame(host);
    const requestId = 'bk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < 600 && !(voyageReady && voyageFrameAlive()); i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      if (!voyageFrameAlive()) {
        voyageReady = false;
        ensureVoyageFrame(host);
      }
    }
    if (!voyageReady || !voyageFrameAlive()) {
      throw new Error('Voyage Chief is still loading — wait a moment and try again');
    }
    return new Promise((resolve, reject) => {
      pendingVoyage[requestId] = { resolve, reject };
      voyageFrame.contentWindow.postMessage({
        type: 'chengaio-voyage-backup',
        action,
        requestId,
        ...extra,
      }, '*');
      setTimeout(() => {
        if (!pendingVoyage[requestId]) return;
        delete pendingVoyage[requestId];
        reject(new Error('Voyage Chief did not respond — open Voyage once, then retry'));
      }, 120000);
    });
  }

  /* ---------------------------------------------------------- suite bundle -- */

  function isSuiteBundle(payload) {
    return !!(payload && payload.format === SUITE_FORMAT);
  }

  function suiteSummary(payload) {
    const tankVessels = payload.tank && payload.tank.vessels
      ? Object.keys(payload.tank.vessels).length : 0;
    const voyageVessels = payload.voyage && Array.isArray(payload.voyage.vessels)
      ? payload.voyage.vessels.length : 0;
    const parts = [];
    parts.push(`Tank Chief: ${payload.tank ? `${tankVessels} vessel(s)` : 'not in this file'}`);
    parts.push(`Voyage Chief: ${payload.voyage ? `${voyageVessels} vessel(s)` : 'not in this file'}`);
    if (payload.exportedAt) parts.push(`exported ${payload.exportedAt}`);
    return parts.join(' · ');
  }

  window.ChengProModules = window.ChengProModules || {};
  window.ChengProModules.backup = {
    title: 'Backup / Restore',
    async render(root) {
      const ent = typeof ChengLicense !== 'undefined' ? ChengLicense.loadEntitlement() : null;
      const isMaster = ent && ChengLicense.isMaster && ChengLicense.isMaster(ent);
      const active = ChengPro.vessel.getActive();
      const activeLabel = active
        ? `${active.name}${active.imo ? ' · ' + active.imo : ''}`
        : 'none selected';

      root.innerHTML = `
        <section class="panel backup-page">
          <h1>Backup &amp; Restore</h1>
          <p class="hint">Export or import vessel databases offline. On the phone the file goes to <strong>Downloads/ChEngAIO</strong>; on desktop you pick the folder. Suite files restore in standalone Tank or Voyage too — each app takes its own half.</p>
          <p class="hint">${isMaster ? 'Master license: full-database Tank backups include all user accounts on this server.' : 'Your license email scopes Tank backups and sync to your account only.'} Active vessel: <strong>${esc(activeLabel)}</strong></p>

          <div class="form-panel backup-section">
            <h2>Entire suite</h2>
            <p class="hint">One JSON with Tank Chief + Voyage Chief from this device/server.</p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-suite-all">Export entire program</button>
              <button type="button" class="btn" id="bk-suite-restore">Restore entire program…</button>
              <button type="button" class="btn" id="bk-suite-merge">Merge entire program…</button>
              <input type="file" id="bk-suite-file" accept="application/json,.json" hidden>
            </div>
            <p class="hint" id="bk-suite-status">Ready.</p>
          </div>

          <div class="form-panel backup-section">
            <h2>Server vessel library</h2>
            <p class="hint">Every vessel on this server, from Tank Chief and Voyage Chief together — one row per ship, matched by IMO or by name with the MV / M/V prefix ignored. Your own vessels come first. Import ship particulars, plus the latest voyage leg when available.</p>
            <div class="btn-row">
              <button type="button" class="btn" id="bk-lib-refresh">Refresh list</button>
            </div>
            <div id="bk-lib-list" class="backup-lib-list hint">Loading…</div>
            <p class="hint" id="bk-lib-status">Ready.</p>
          </div>

          <h2 class="backup-program-title">Tank Chief</h2>

          <div class="form-panel backup-section">
            <h2>Vessel database</h2>
            <p class="hint">Source: <strong>${esc(tankSourceLabel())}</strong>. Tanks, calibrations, readings, bunkering, settings.</p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-tank-full">Download full backup</button>
              <button type="button" class="btn" id="bk-tank-import">Import backup…</button>
              <input type="file" id="bk-tank-file" accept="application/json,.json" hidden>
            </div>
            <div class="btn-row">
              <button type="button" class="btn" id="bk-tank-vessel" ${active ? '' : 'disabled'}>Export active vessel</button>
              <button type="button" class="btn" id="bk-tank-vessel-import">Import vessel JSON…</button>
              <input type="file" id="bk-tank-vessel-file" accept="application/json,.json" hidden>
            </div>
            <p class="hint" id="bk-tank-status">Ready.</p>
          </div>

          <div class="form-panel backup-section">
            <h2>Peer sync</h2>
            <p class="hint">Tank Chief peer URL, token, and where this device keeps its tank database.</p>
            <div class="grid-2">
              <div class="field"><label for="bk-sync-url">Peer sync URL</label>
                <input id="bk-sync-url" type="url" autocomplete="url" inputmode="url" placeholder="http://192.168.1.50:8080 or :3080"></div>
              <div class="field"><label for="bk-sync-token">Sync API token</label>
                <input id="bk-sync-token" type="password" autocomplete="off" placeholder="Optional when peer uses SYNC_API_TOKEN"></div>
            </div>
            <div class="field" style="margin-top:10px"><label for="bk-api-transport">Database on this device</label>
              <select id="bk-api-transport">
                <option value="local">On this device — works with no network</option>
                <option value="server">On the server that served this page</option>
              </select>
            </div>
            <div class="btn-row">
              <button type="button" class="btn" id="bk-sync-save">Save settings</button>
              <button type="button" class="btn" id="bk-sync-probe">Test connection</button>
              <button type="button" class="btn" id="bk-sync-pull">Pull from peer</button>
              <button type="button" class="btn primary" id="bk-sync-push">Push to peer</button>
              <button type="button" class="btn" id="bk-sync-flush">Flush offline queue</button>
            </div>
            <p class="hint" id="bk-sync-status">Ready.</p>
          </div>

          <h2 class="backup-program-title">Voyage Chief</h2>

          <div class="form-panel backup-section">
            <h2>Database backup</h2>
            <p class="hint">Noon reports and voyage legs on this device (IndexedDB).</p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-voyage-db">Download voyage database</button>
              <button type="button" class="btn" id="bk-voyage-restore">Restore database…</button>
              <button type="button" class="btn" id="bk-voyage-merge">Merge database…</button>
              <input type="file" id="bk-voyage-db-file" accept="application/json,.json" hidden>
            </div>
            <div class="btn-row">
              <button type="button" class="btn" id="bk-voyage-vessel">Export selected vessel</button>
              <button type="button" class="btn" id="bk-voyage-vessel-import">Import vessel JSON…</button>
              <input type="file" id="bk-voyage-vessel-file" accept="application/json,.json" hidden>
            </div>
            <p class="hint" id="bk-voyage-status">Ready.</p>
          </div>

          <div class="form-panel backup-section">
            <h2>Server Sync</h2>
            <p class="hint">Self-hosted Voyage sync server. Same settings that used to live under Voyage → Setup.</p>
            <div class="grid-2">
              <div class="field span2"><label for="bk-voy-sync-url">Sync server URL</label>
                <input id="bk-voy-sync-url" type="url" autocomplete="url" inputmode="url" placeholder="http://192.168.x.x:8080 or https://sync.yourdomain.com"></div>
              <div class="field"><label for="bk-voy-sync-token">API token</label>
                <input id="bk-voy-sync-token" type="password" autocomplete="off" placeholder="Bearer token"></div>
              <div class="field"><label for="bk-voy-sync-vessel">Vessel ID (slug)</label>
                <input id="bk-voy-sync-vessel" autocomplete="off" placeholder="e.g. captain-veniamis"></div>
              <div class="field"><label for="bk-voy-sync-device">Device name</label>
                <input id="bk-voy-sync-device" autocomplete="off" placeholder="e.g. ER tablet / Chief PC"></div>
              <div class="field"><label for="bk-voy-sync-conflict">Conflict policy</label>
                <select id="bk-voy-sync-conflict">
                  <option value="merge">Merge by record (recommended)</option>
                  <option value="local">Prefer this device</option>
                  <option value="remote">Prefer server</option>
                </select>
              </div>
            </div>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-voy-sync-save">Save sync settings</button>
              <button type="button" class="btn" id="bk-voy-sync-test">Test connection</button>
              <button type="button" class="btn" id="bk-voy-sync-push">Push active leg</button>
              <button type="button" class="btn" id="bk-voy-sync-pull">Pull active leg</button>
              <button type="button" class="btn" id="bk-voy-sync-persist">Keep data persistent</button>
              <button type="button" class="btn" id="bk-voy-sync-list">List remote voyages</button>
            </div>
            <div class="grid-2" style="margin-top:10px;">
              <div class="field"><label for="bk-voy-sync-pull-voyage">Pull voyage no.</label>
                <select id="bk-voy-sync-pull-voyage"><option value="">— List remote voyages first —</option></select></div>
              <div class="field"><label for="bk-voy-sync-pull-condition">Pull condition</label>
                <select id="bk-voy-sync-pull-condition">
                  <option value="B">B — Ballasted</option>
                  <option value="L">L — Laden</option>
                </select></div>
            </div>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-voy-sync-pull-leg">Pull selected voyage leg</button>
            </div>
            <p class="hint">List remote voyages fills the voyage number list. Pull selected voyage leg merges that B/L leg onto this device (same as Voyage → Setup).</p>
            <p class="hint" id="bk-voy-sync-status">Loading sync settings…</p>
            <div id="bk-voy-sync-remote" class="hint backup-remote-list" hidden></div>
          </div>

          <div id="bk-voyage-bridge-host" class="aio-backup-voyage-bridge" hidden aria-hidden="true"></div>
        </section>`;

      const tankStatus = root.querySelector('#bk-tank-status');
      const voyageStatus = root.querySelector('#bk-voyage-status');
      const suiteStatus = root.querySelector('#bk-suite-status');
      const setTank = (t) => { if (tankStatus) tankStatus.textContent = t; };
      const setVoyage = (t) => { if (voyageStatus) voyageStatus.textContent = t; };
      const setSuite = (t) => { if (suiteStatus) suiteStatus.textContent = t; };

      root.querySelector('#bk-suite-all').onclick = async () => {
        setSuite('Collecting Tank + Voyage databases…');
        try {
          let tankBackup = null;
          let tankError = null;
          try {
            tankBackup = await tankRequest('/api/backup');
          } catch (e) {
            tankError = e.message || 'Tank backup failed';
          }

          let voyageMsg = null;
          let voyageError = null;
          try {
            voyageMsg = await voyagePost('export-db', {}, root);
          } catch (e) {
            voyageError = e.message || 'Voyage backup failed';
          }

          if (!tankBackup && !(voyageMsg && voyageMsg.payload)) {
            throw new Error([tankError, voyageError].filter(Boolean).join(' · ') || 'Nothing to export');
          }

          const suite = {
            format: SUITE_FORMAT,
            exportedAt: new Date().toISOString(),
            tankSource: tankSourceLabel(),
            tank: tankBackup,
            tankError: tankError || null,
            voyage: (voyageMsg && voyageMsg.payload) || null,
            voyageFilename: (voyageMsg && voyageMsg.filename) || null,
            voyageError: voyageError || null,
          };
          const saved = await downloadJson(`cheng-aio-suite-${Date.now()}.json`, suite);
          const partial = [tankError && 'Tank', voyageError && 'Voyage'].filter(Boolean).join(' + ');
          setSuite(partial
            ? `Entire program ${downloadWhereLabel(saved)} — ${partial} could not be read (${[tankError, voyageError].filter(Boolean).join(' · ')}).`
            : `Entire program ${downloadWhereLabel(saved)}.`);
          toast(`Entire program ${downloadWhereLabel(saved)}`);
        } catch (e) {
          setSuite(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      /* Restoring the suite is the export read backwards: the Tank half goes
         through the same import the Tank card uses, the Voyage half through
         the same bridge call. Either half may be absent from the file, and a
         half that fails is reported rather than silently skipped. */
      const suiteImport = async (file, merge) => {
        const payload = await readFileJson(file);
        if (!isSuiteBundle(payload)) {
          throw new Error(`This is not an entire-program file (expected format ${SUITE_FORMAT}). Use the Tank or Voyage card for a single-program backup.`);
        }
        if (!payload.tank && !payload.voyage) {
          throw new Error('This entire-program file holds neither a Tank nor a Voyage database.');
        }
        const verb = merge ? 'Merge into' : 'REPLACE';
        if (!confirm(`${verb} this device from the entire-program file?\n\n${suiteSummary(payload)}\n\n${
          merge
            ? 'Records with the same id are overwritten by the file; nothing else is removed.'
            : 'Voyage Chief data in this browser is erased first. Export a backup before you continue.'
        }`)) {
          setSuite('Restore cancelled — nothing was changed.');
          return;
        }

        const done = [];
        const failed = [];

        if (payload.tank) {
          setSuite('Restoring Tank Chief…');
          try {
            const res = await importTankBackup(payload.tank, merge);
            const n = res && res.imported != null ? res.imported : (res && res.vesselCount) || 0;
            done.push(`Tank Chief (${n} vessel${n === 1 ? '' : 's'})`);
          } catch (e) {
            failed.push('Tank Chief: ' + (e.message || 'import failed'));
          }
        }

        if (payload.voyage) {
          setSuite('Restoring Voyage Chief…');
          try {
            const msg = await voyagePost(merge ? 'merge-db' : 'restore-db', { payload: payload.voyage }, root);
            done.push(msg.message || 'Voyage Chief');
          } catch (e) {
            failed.push('Voyage Chief: ' + (e.message || 'import failed'));
          }
        }

        try { await ChengPro.vessel.refresh(); } catch { /* ignore */ }

        if (!done.length) throw new Error(failed.join(' · ') || 'Nothing was restored');
        const summary = `Restored ${done.join(' · ')}${failed.length ? ` — but ${failed.join(' · ')}` : ''}`;
        setSuite(summary);
        toast(failed.length ? 'Restored with errors — see status' : 'Entire program restored');
      };

      root.querySelector('#bk-suite-restore').onclick = () => {
        const input = root.querySelector('#bk-suite-file');
        input.dataset.mode = 'restore';
        input.click();
      };
      root.querySelector('#bk-suite-merge').onclick = () => {
        const input = root.querySelector('#bk-suite-file');
        input.dataset.mode = 'merge';
        input.click();
      };
      root.querySelector('#bk-suite-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        const mode = ev.target.dataset.mode || 'restore';
        ev.target.value = '';
        if (!file) return;
        try {
          await suiteImport(file, mode === 'merge');
        } catch (e) {
          setSuite(e.message || 'Restore failed');
          toast(e.message || 'Restore failed');
        }
      };

      root.querySelector('#bk-tank-full').onclick = async () => {
        setTank(`Preparing Tank backup from ${tankSourceLabel()}…`);
        try {
          const backup = await tankRequest('/api/backup');
          const saved = await downloadJson(`tank-chief-backup-${Date.now()}.json`, backup);
          const n = backup && backup.vessels ? Object.keys(backup.vessels).length : 0;
          setTank(`Full backup ${downloadWhereLabel(saved)} (${n} vessel${n === 1 ? '' : 's'}).`);
          toast(`Tank backup ${downloadWhereLabel(saved)}`);
        } catch (e) {
          setTank(e.message || 'Backup failed');
          toast(e.message || 'Backup failed');
        }
      };

      root.querySelector('#bk-tank-import').onclick = () => root.querySelector('#bk-tank-file').click();
      root.querySelector('#bk-tank-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        if (!confirm(`Import this Tank backup into ${tankSourceLabel()}? Vessels already there are merged, not removed.`)) return;
        setTank('Importing Tank backup…');
        try {
          const backup = await readFileJson(file);
          const res = await importTankBackup(backup, true);
          await ChengPro.vessel.refresh();
          const n = res && res.imported != null ? res.imported : (res && res.vesselCount) || 0;
          setTank(`Tank backup imported into ${tankSourceLabel()} — ${n} vessel${n === 1 ? '' : 's'}.`);
          toast('Tank backup imported');
        } catch (e) {
          setTank(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-tank-vessel').onclick = async () => {
        if (!active) { toast('Select a vessel in the header first'); return; }
        setTank('Exporting active vessel…');
        try {
          const backup = await tankRequest('/api/vessels/' + encodeURIComponent(active.id) + '/backup');
          const saved = await downloadJson(`tank-chief-vessel-${active.id}-${Date.now()}.json`, backup);
          setTank(`Vessel ${active.name} ${downloadWhereLabel(saved)}.`);
          toast(`Vessel backup ${downloadWhereLabel(saved)}`);
        } catch (e) {
          setTank(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      root.querySelector('#bk-tank-vessel-import').onclick = () => root.querySelector('#bk-tank-vessel-file').click();
      root.querySelector('#bk-tank-vessel-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        setTank('Importing vessel JSON…');
        try {
          const backup = await readFileJson(file);
          await importTankBackup(backup, true);
          await ChengPro.vessel.refresh();
          setTank(`Vessel JSON imported into ${tankSourceLabel()}.`);
          toast('Vessel imported');
        } catch (e) {
          setTank(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-voyage-db').onclick = async () => {
        setVoyage('Building voyage database backup…');
        try {
          const msg = await voyagePost('export-db', {}, root);
          if (msg.payload) {
            const saved = await downloadJson(msg.filename || `voyage-chief-db-${Date.now()}.json`, msg.payload);
            setVoyage(`Voyage database ${downloadWhereLabel(saved)}.`);
            toast(`Voyage database ${downloadWhereLabel(saved)}`);
          }
        } catch (e) {
          setVoyage(e.message || 'Backup failed');
          toast(e.message || 'Backup failed');
        }
      };

      const voyageDbImport = async (file, merge) => {
        const payload = await readFileJson(file);
        setVoyage(merge ? 'Merging voyage database…' : 'Restoring voyage database…');
        const msg = await voyagePost(merge ? 'merge-db' : 'restore-db', { payload }, root);
        setVoyage(msg.message || 'Voyage database updated.');
        toast(msg.message || 'Voyage database updated');
      };

      root.querySelector('#bk-voyage-restore').onclick = () => {
        if (!confirm('Replace ALL Voyage Chief data in this browser? Export a backup first.')) return;
        root.querySelector('#bk-voyage-db-file').dataset.mode = 'restore';
        root.querySelector('#bk-voyage-db-file').click();
      };
      root.querySelector('#bk-voyage-merge').onclick = () => {
        root.querySelector('#bk-voyage-db-file').dataset.mode = 'merge';
        root.querySelector('#bk-voyage-db-file').click();
      };
      root.querySelector('#bk-voyage-db-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        const mode = ev.target.dataset.mode || 'restore';
        ev.target.value = '';
        if (!file) return;
        try {
          await voyageDbImport(file, mode === 'merge');
        } catch (e) {
          setVoyage(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-voyage-vessel').onclick = async () => {
        setVoyage('Exporting voyage vessel…');
        try {
          const msg = await voyagePost('export-vessel', { vesselId: active && active.voyageSlug }, root);
          if (msg.payload) {
            const saved = await downloadJson(msg.filename || `voyage-vessel-${Date.now()}.json`, msg.payload);
            setVoyage(`Voyage vessel ${downloadWhereLabel(saved)}.`);
            toast(`Voyage vessel ${downloadWhereLabel(saved)}`);
          }
        } catch (e) {
          setVoyage(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      root.querySelector('#bk-voyage-vessel-import').onclick = () => root.querySelector('#bk-voyage-vessel-file').click();
      root.querySelector('#bk-voyage-vessel-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        try {
          const payload = await readFileJson(file);
          if (!confirm('Import this voyage vessel JSON? Existing vessel data with the same id will be replaced.')) return;
          setVoyage('Importing voyage vessel…');
          const msg = await voyagePost('import-vessel', { payload }, root);
          setVoyage(msg.message || 'Voyage vessel imported.');
          toast(msg.message || 'Voyage vessel imported');
        } catch (e) {
          setVoyage(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };


      /* ---------- Server vessel library + sync settings ---------- */
      const libStatus = root.querySelector('#bk-lib-status');
      const libList = root.querySelector('#bk-lib-list');
      const syncStatus = root.querySelector('#bk-sync-status');
      const setLib = (t) => { if (libStatus) libStatus.textContent = t; };
      const setSync = (t) => { if (syncStatus) syncStatus.textContent = t; };

      async function serverTankApi(path, options = {}) {
        /* Prefer the live gateway so Electron "local" transport does not hide server vessels. */
        try {
          return await gatewayTankApi(path, options);
        } catch (gatewayErr) {
          /* Fall back to ChengProApi (LocalApi) when the gateway is unreachable. */
          try {
            return await ChengProApi.api('/tanks' + path, options);
          } catch (_) {
            throw gatewayErr;
          }
        }
      }

      /* The licence this suite is signed in with. The engineer's own ships are
         pinned above everyone else's, so the list opens on what he came for. */
      function licensedEmail() {
        try {
          const e = typeof ChengLicense !== 'undefined' ? ChengLicense.loadEntitlement() : null;
          return (e && e.email) ? String(e.email).trim().toLowerCase() : '';
        } catch (_) { return ''; }
      }

      /* Voyage Chief's fleet register, over the gateway's proxy to the Python
         sync server. It needs a signed-in session: when there is none the
         server answers 401 and the library simply shows the Tank side, rather
         than failing the whole panel over a half-configured install. */
      async function voyageFleetRegister() {
        try {
          const data = await ChengProApi.api('/api/vessels');
          return { vessels: (data && data.vessels) || [], error: null };
        } catch (e) {
          return { vessels: [], error: e && e.message ? e.message : 'unavailable' };
        }
      }

      async function tankVesselLibrary() {
        try {
          const data = await gatewayTankApi('/api/vessel-library');
          return { vessels: (data && data.vessels) || [], error: null };
        } catch (e) {
          return { vessels: [], error: e && e.message ? e.message : 'unavailable' };
        }
      }

      /* One row per ship, not one row per record. Tank Chief writes
         "MV CAPTAIN VENIAMIS" where Voyage Chief writes "M/V Captain
         Veniamis"; vessel-key.js decides they are the same hull, by IMO where
         both sides carry one and by the normalised name where they do not. */
      function buildLibraryRows(tankVessels, voyageVessels) {
        const VK = window.ChengVesselKey;
        const entries = [];
        for (const v of tankVessels) {
          entries.push({
            source: 'tank',
            ownerSlug: v.ownerSlug || '',
            vesselId: v.vesselId,
            record: { name: v.name || v.vesselId || '', imo: v.imo || '' },
          });
        }
        for (const v of voyageVessels) {
          entries.push({
            source: 'voyage',
            ownerEmail: v.createdBy || '',
            vesselId: v.vesselId,
            record: { name: v.vesselName || v.vesselId || '', imo: v.imo || '' },
          });
        }
        if (!VK) {
          /* Without the matcher every record is its own row — worse, never wrong. */
          return entries.map((e) => ({
            key: '', name: e.record.name, imo: e.record.imo, sources: [e],
          }));
        }
        return VK.sortForOwner(VK.mergeVessels(entries), licensedEmail());
      }

      function ownerLabel(entry) {
        const who = entry.ownerEmail || entry.ownerSlug || '';
        return who || 'server';
      }

      async function refreshVesselLibrary() {
        if (!libList) return;
        libList.textContent = 'Loading vessel list from both servers…';
        try {
          const [tank, voyage] = await Promise.all([tankVesselLibrary(), voyageFleetRegister()]);
          const rows = buildLibraryRows(tank.vessels, voyage.vessels);

          /* Say which half is missing rather than showing a short list as if
             it were the whole fleet. */
          const notes = [];
          if (tank.error) notes.push(`Tank Chief list unavailable (${esc(tank.error)})`);
          if (voyage.error) notes.push(`Voyage Chief list unavailable — sign in under Server Sync (${esc(voyage.error)})`);

          if (!rows.length) {
            libList.innerHTML = `<p class="hint">No vessels on the server yet.</p>${
              notes.length ? `<p class="hint">${notes.join('<br>')}</p>` : ''}`;
            setLib(notes.length ? notes.join(' · ').replace(/<[^>]+>/g, '') : 'No vessels found.');
            return;
          }

          const mine = licensedEmail();
          const VK = window.ChengVesselKey;
          libList.innerHTML = `${notes.length ? `<p class="hint">${notes.join('<br>')}</p>` : ''}
          <div style="overflow:auto"><table class="data-table" style="width:100%;font-size:13px">
            <thead><tr><th>Vessel</th><th>IMO</th><th>Data in</th><th>Uploaded by</th><th></th></tr></thead>
            <tbody>${rows.map((row) => {
              const tankSrc = row.sources.find((x) => x.source === 'tank');
              const voySrc = row.sources.find((x) => x.source === 'voyage');
              const isMine = !!mine && row.sources.some((x) => {
                const who = String(x.ownerEmail || x.ownerSlug || '').trim().toLowerCase();
                if (!who) return false;
                return who === mine || (VK && (who === VK.emailSlug(mine) || VK.emailSlug(who) === VK.emailSlug(mine)));
              });
              const programs = [tankSrc ? 'Tank' : null, voySrc ? 'Voyage' : null].filter(Boolean).join(' + ');
              const owners = [...new Set(row.sources.map(ownerLabel))].join(', ');
              /* The number as written, not as validated. ChengVesselKey.isValidImo
                 can tell a typo from a real IMO, but matching uses the digits
                 either way, so a badge here would fire on every row of a demo
                 seed and buy the engineer nothing he can act on. */
              const imoTxt = row.imo ? esc(row.imo) : '—';
              return `<tr${isMine ? ' style="font-weight:600"' : ''}>
                <td>${esc(row.name || '—')}${isMine ? ' <span class="hint" style="font-weight:400">· yours</span>' : ''}</td>
                <td>${imoTxt}</td>
                <td>${esc(programs || '—')}</td>
                <td>${esc(owners)}</td>
                <td>${tankSrc
                  ? `<button type="button" class="btn" data-lib-import="${esc(tankSrc.vesselId)}" data-lib-owner="${esc(tankSrc.ownerSlug || '')}">Import particulars + latest leg</button>`
                  : '<span class="hint">Voyage only — pull from Server Sync</span>'}</td>
              </tr>`;
            }).join('')}</tbody></table></div>`;
          libList.querySelectorAll('[data-lib-import]').forEach((btn) => {
            btn.onclick = async () => {
              const vesselId = btn.getAttribute('data-lib-import');
              const ownerSlug = btn.getAttribute('data-lib-owner') || null;
              if (!confirm(`Import ship particulars for ${vesselId} into your account (server + this device)? Latest voyage leg will be copied when available.`)) return;
              setLib('Importing…');
              try {
                const res = await serverTankApi('/api/vessel-library/import', {
                  method: 'POST',
                  body: JSON.stringify({ ownerSlug: ownerSlug || null, vesselId }),
                });
                /* Mirror into local Tank DB when this device is on local transport. */
                if (usingLocalTank() && res && res.vessel) {
                  try {
                    await tankRequest('/api/vessels', {
                      method: 'POST',
                      body: JSON.stringify(res.vessel),
                    });
                  } catch (localErr) {
                    console.warn('Local vessel mirror:', localErr);
                  }
                }
                try { await ChengPro.vessel.refresh(); } catch (_) { /* ignore */ }
                /* Push voyage leg into Voyage Chief IndexedDB when present. */
                if (res.voyageLeg && res.voyageLeg.data) {
                  try {
                    await voyagePost('import-vessel', {
                      payload: {
                        format: 'noon-report-vessel-v1',
                        vessel: {
                          id: res.vessel && res.vessel.id,
                          name: (res.vessel && res.vessel.name) || vesselId,
                          slug: res.voyageLeg.vesselSlug,
                          imo: res.vessel && res.vessel.imo,
                        },
                        setup: { vesselName: (res.vessel && res.vessel.name) || vesselId },
                        stores: {
                          voyageLegs: [{
                            id: `${res.voyageLeg.voyageNo}-${res.voyageLeg.condition}`,
                            voyageNumber: res.voyageLeg.voyageNo,
                            condition: res.voyageLeg.condition,
                            updatedAt: res.voyageLeg.updatedAt,
                            snapshot: res.voyageLeg.data,
                          }],
                        },
                      },
                      mode: 'merge',
                    }, root);
                  } catch (voyErr) {
                    console.warn('Voyage leg local import:', voyErr);
                  }
                }
                setLib(res.message || 'Imported.');
                toast(res.message || 'Vessel imported');
                refreshVesselLibrary();
              } catch (e) {
                setLib(e.message || 'Import failed');
                toast(e.message || 'Import failed');
              }
            };
          });
          const paired = rows.filter((r) => r.sources.length > 1).length;
          setLib(`${rows.length} vessel(s)${paired ? `, ${paired} with data in both programs` : ''}.`);
        } catch (e) {
          libList.textContent = e.message || 'Could not load vessel library (is the server reachable?)';
          setLib(e.message || 'Failed');
        }
      }

      root.querySelector('#bk-lib-refresh')?.addEventListener('click', () => refreshVesselLibrary());
      refreshVesselLibrary();

      async function loadSyncSettings() {
        try {
          const s = await tankRequest('/api/settings');
          const urlEl = root.querySelector('#bk-sync-url');
          const tokEl = root.querySelector('#bk-sync-token');
          const trEl = root.querySelector('#bk-api-transport');
          if (urlEl) urlEl.value = s.syncUrl || '';
          if (tokEl) tokEl.value = s.syncApiToken || '';
          if (trEl) trEl.value = tankTransport();
          setSync('Loaded from ' + tankSourceLabel() + '.');
        } catch (e) {
          setSync(e.message || 'Could not load sync settings');
        }
      }
      loadSyncSettings();

      root.querySelector('#bk-sync-save')?.addEventListener('click', async () => {
        try {
          const syncUrl = root.querySelector('#bk-sync-url').value.trim();
          const syncApiToken = root.querySelector('#bk-sync-token').value.trim();
          await tankRequest('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ syncUrl, syncApiToken, syncEnabled: true }),
          });
          const tr = root.querySelector('#bk-api-transport').value;
          if (tr === 'local' || tr === 'server') {
            try { localStorage.setItem(TRANSPORT_KEY, tr); } catch (_) { /* ignore */ }
          }
          setSync('Sync settings saved.');
          toast('Sync settings saved');
        } catch (e) {
          setSync(e.message || 'Save failed');
          toast(e.message || 'Save failed');
        }
      });

      root.querySelector('#bk-sync-probe')?.addEventListener('click', async () => {
        try {
          const syncUrl = root.querySelector('#bk-sync-url').value.trim();
          const syncApiToken = root.querySelector('#bk-sync-token').value.trim();
          if (!syncUrl) { setSync('Enter a peer sync URL'); return; }
          setSync('Testing peer…');
          const res = await tankRequest('/api/sync/probe', {
            method: 'POST',
            body: JSON.stringify({ syncUrl, syncApiToken }),
          });
          setSync(res.hint || res.message || 'Peer reachable');
          toast(res.hint || 'Peer OK');
        } catch (e) {
          setSync(e.message || 'Probe failed');
          toast(e.message || 'Probe failed');
        }
      });

      root.querySelector('#bk-sync-pull')?.addEventListener('click', async () => {
        try {
          const syncUrl = root.querySelector('#bk-sync-url').value.trim();
          const syncApiToken = root.querySelector('#bk-sync-token').value.trim();
          if (!syncUrl) { setSync('Enter a peer sync URL'); return; }
          setSync('Pulling from peer…');
          const res = await tankRequest('/api/sync/pull', {
            method: 'POST',
            body: JSON.stringify({ syncUrl, syncApiToken }),
          });
          try { await ChengPro.vessel.refresh(); } catch (_) { /* ignore */ }
          setSync(res.message || 'Pull complete');
          toast(res.message || 'Pull complete');
        } catch (e) {
          setSync(e.message || 'Pull failed');
          toast(e.message || 'Pull failed');
        }
      });

      root.querySelector('#bk-sync-push')?.addEventListener('click', async () => {
        try {
          const syncUrl = root.querySelector('#bk-sync-url').value.trim();
          const syncApiToken = root.querySelector('#bk-sync-token').value.trim();
          if (!syncUrl) { setSync('Enter a peer sync URL'); return; }
          setSync('Pushing to peer…');
          const res = await tankRequest('/api/sync/push', {
            method: 'POST',
            body: JSON.stringify({ syncUrl, syncApiToken }),
          });
          setSync(res.message || 'Push complete');
          toast(res.message || 'Push complete');
        } catch (e) {
          setSync(e.message || 'Push failed');
          toast(e.message || 'Push failed');
        }
      });

      root.querySelector('#bk-sync-flush')?.addEventListener('click', async () => {
        try {
          setSync('Flushing offline queue…');
          if (typeof LocalApi !== 'undefined' && LocalApi.flush) {
            await LocalApi.flush();
          } else {
            await tankRequest('/api/sync/push', {
              method: 'POST',
              body: JSON.stringify({}),
            });
          }
          setSync('Offline queue flushed.');
          toast('Offline queue flushed');
        } catch (e) {
          setSync(e.message || 'Flush failed');
          toast(e.message || 'Flush failed');
        }
      });


      const setVoySync = (t) => {
        const el = root.querySelector('#bk-voy-sync-status');
        if (el) el.textContent = t;
      };
      const remoteBox = root.querySelector('#bk-voy-sync-remote');

      (async () => {
        try {
          const msg = await voyagePost('get-sync-settings', {}, root);
          fillVoyageSyncForm(root, msg.settings || {});
          const s = msg.settings || {};
          const parts = [];
          if (s.lastSyncedAt) parts.push('Last sync: ' + new Date(s.lastSyncedAt).toLocaleString());
          else parts.push('Last sync: never');
          if (s.lastSyncError) parts.push('Error: ' + s.lastSyncError);
          setVoySync(parts.join(' · '));
        } catch (e) {
          setVoySync(e.message || 'Could not load Voyage sync settings');
        }
      })();

      root.querySelector('#bk-voy-sync-save')?.addEventListener('click', async () => {
        setVoySync('Saving Voyage sync settings…');
        try {
          const msg = await voyagePost('save-sync-settings', { settings: readVoyageSyncForm(root) }, root);
          setVoySync(msg.message || 'Saved.');
          toast(msg.message || 'Voyage sync settings saved');
        } catch (e) {
          setVoySync(e.message || 'Save failed');
          toast(e.message || 'Save failed');
        }
      });

      root.querySelector('#bk-voy-sync-test')?.addEventListener('click', async () => {
        setVoySync('Testing Voyage sync connection…');
        try {
          const msg = await voyagePost('test-sync', { settings: readVoyageSyncForm(root) }, root);
          setVoySync(msg.message || 'Connection OK');
          toast(msg.message || 'Connection OK');
        } catch (e) {
          setVoySync(e.message || 'Connection failed');
          toast(e.message || 'Connection failed');
        }
      });

      root.querySelector('#bk-voy-sync-push')?.addEventListener('click', async () => {
        if (!confirm('PUSH ACTIVE LEG — uploads this device’s active voyage leg and OVERWRITES the same leg on the server. Continue?')) return;
        setVoySync('Pushing active leg…');
        try {
          await voyagePost('save-sync-settings', { settings: readVoyageSyncForm(root) }, root);
          const msg = await voyagePost('push-active', {}, root);
          setVoySync(msg.message || 'Push completed');
          toast(msg.message || 'Push completed');
        } catch (e) {
          setVoySync(e.message || 'Push failed');
          toast(e.message || 'Push failed');
        }
      });

      root.querySelector('#bk-voy-sync-pull')?.addEventListener('click', async () => {
        if (!confirm('PULL ACTIVE LEG — downloads the active leg from the server and OVERWRITES the local active leg. Continue?')) return;
        setVoySync('Pulling active leg…');
        try {
          await voyagePost('save-sync-settings', { settings: readVoyageSyncForm(root) }, root);
          const msg = await voyagePost('pull-active', {}, root);
          setVoySync(msg.message || 'Pull completed');
          toast(msg.message || 'Pull completed');
        } catch (e) {
          setVoySync(e.message || 'Pull failed');
          toast(e.message || 'Pull failed');
        }
      });

      root.querySelector('#bk-voy-sync-persist')?.addEventListener('click', async () => {
        if (!confirm('KEEP DATA PERSISTENT — merge local and server chronologically both ways, then save on both sides. Continue?')) return;
        setVoySync('Merging local ↔ server…');
        try {
          await voyagePost('save-sync-settings', { settings: readVoyageSyncForm(root) }, root);
          const msg = await voyagePost('persist-merge', {}, root);
          setVoySync(msg.message || 'Merge completed');
          toast(msg.message || 'Merge completed');
        } catch (e) {
          setVoySync(e.message || 'Merge failed');
          toast(e.message || 'Merge failed');
        }
      });

      root.querySelector('#bk-voy-sync-list')?.addEventListener('click', async () => {
        setVoySync('Listing remote voyages…');
        try {
          const msg = await voyagePost('list-remote', { settings: readVoyageSyncForm(root) }, root);
          setVoySync(msg.message || 'Listed.');
          const voyages = msg.voyages || [];
          const pullSel = root.querySelector('#bk-voy-sync-pull-voyage');
          if (pullSel) {
            const keep = pullSel.value;
            if (!voyages.length) {
              pullSel.innerHTML = '<option value="">— No remote voyages —</option>';
            } else {
              pullSel.innerHTML = voyages.map((v) => {
                const vn = esc(v.voyageNumber || v.voyageKey || '');
                return `<option value="${vn}">${vn}</option>`;
              }).join('');
              if (keep && [...pullSel.options].some((o) => o.value === keep)) pullSel.value = keep;
            }
          }
          if (remoteBox) {
            remoteBox.hidden = false;
            if (!voyages.length) {
              remoteBox.textContent = msg.message || 'No remote voyages.';
            } else {
              remoteBox.innerHTML = `<strong>Remote voyages for ${esc(msg.vessel || '')}</strong>` +
                voyages.map((v) => {
                  const conds = (v.conditions || []).map((c) =>
                    `${esc(c.condition)} (${c.entryCount || 0} entries)`
                  ).join(' · ') || 'no legs';
                  return `<div class="backup-remote-item"><code>${esc(v.voyageNumber || v.voyageKey || '')}</code> — ${conds}</div>`;
                }).join('');
            }
          }
        } catch (e) {
          setVoySync(e.message || 'List failed');
          if (remoteBox) {
            remoteBox.hidden = false;
            remoteBox.textContent = e.message || 'List failed';
          }
        }
      });

      root.querySelector('#bk-voy-sync-pull-leg')?.addEventListener('click', async () => {
        const voyage = (root.querySelector('#bk-voy-sync-pull-voyage')?.value || '').trim();
        const condition = (root.querySelector('#bk-voy-sync-pull-condition')?.value || 'B').trim();
        if (!voyage) {
          setVoySync('Select a voyage number first (List remote voyages refreshes the list).');
          toast('Select a voyage number first');
          return;
        }
        if (!confirm(`Pull ${voyage} / ${condition} from the server and merge it as the active leg?\n\nNewer of local vs server kept for each record.`)) return;
        setVoySync(`Pulling ${voyage} / ${condition}…`);
        try {
          await voyagePost('save-sync-settings', { settings: readVoyageSyncForm(root) }, root);
          const msg = await voyagePost('pull-voyage-leg', { voyage, condition }, root);
          setVoySync(msg.message || 'Pull completed');
          toast(msg.message || 'Pull completed');
        } catch (e) {
          setVoySync(e.message || 'Pull failed');
          toast(e.message || 'Pull failed');
        }
      });

      ensureVoyageFrame(root);
    },
  };
})();
