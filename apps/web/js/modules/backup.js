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

  function readFileJson(file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (typeof onProgress !== 'function') return;
        if (e.lengthComputable && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        else onProgress(null);
      };
      reader.onload = () => {
        try {
          if (typeof onProgress === 'function') onProgress(100);
          resolve(JSON.parse(String(reader.result || '')));
        } catch (e) { reject(new Error('Invalid JSON file')); }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  /* The status line under each card stays as the record of what finished.
     This bar is what moves while the work is still going, including the
     Voyage half that runs inside a hidden frame. */
  const BK_JOB_BUTTONS = [
    'bk-suite-all', 'bk-suite-restore', 'bk-suite-merge',
    'bk-tank-full', 'bk-tank-import', 'bk-tank-vessel', 'bk-tank-vessel-import',
    'bk-voyage-db', 'bk-voyage-restore', 'bk-voyage-merge',
    'bk-voyage-vessel', 'bk-voyage-vessel-import',
    'bk-check-voyage', 'bk-check-tanks', 'bk-consistency-apply',
  ];
  let progressJob = null;

  function progressHost() {
    return document.getElementById('bk-progress-host')
      || document.querySelector('.backup-page')
      || document.body;
  }

  function setBackupBusy(on) {
    BK_JOB_BUTTONS.forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (on) {
        if (btn.dataset.bkWasDisabled == null) btn.dataset.bkWasDisabled = btn.disabled ? '1' : '0';
        btn.disabled = true;
      } else if (id === 'bk-consistency-apply') {
        /* The check enables this only after it has rows. Restoring the
           disabled flag from before the check would leave a finished
           comparison with nothing to press. */
        const any = document.querySelector('#bk-consistency-list input[data-consistency-row]:checked');
        btn.disabled = !any;
        delete btn.dataset.bkWasDisabled;
      } else if (btn.dataset.bkWasDisabled != null) {
        btn.disabled = btn.dataset.bkWasDisabled === '1';
        delete btn.dataset.bkWasDisabled;
      }
    });
  }

  function progressStart(title, message) {
    progressJob = { title, voyage: null };
    setBackupBusy(true);
    if (!window.Progress) return;
    const box = Progress.start(progressHost(), title, message);
    if (box && box.scrollIntoView) {
      try { box.scrollIntoView({ block: 'nearest' }); } catch (_) { /* ignore */ }
    }
  }

  function progressSet(pct, message) {
    if (window.Progress) Progress.set(pct, message);
  }

  function progressYield() {
    if (window.Progress && Progress.yieldToPaint) return Progress.yieldToPaint();
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function progressDone(message) {
    progressJob = null;
    if (window.Progress) Progress.done(message);
    setBackupBusy(false);
  }

  function progressFail() {
    progressJob = null;
    if (window.Progress) Progress.done();
    setBackupBusy(false);
  }

  /** Map Voyage's own 0–100 into a slice of this job's bar. */
  /* When the module last said it was doing something. */
  let voyageLastProgressAt = 0;

  function watchVoyage(from, to) {
    if (progressJob) progressJob.voyage = { from, to };
  }

  function applyVoyageProgress(msg) {
    if (!progressJob || !progressJob.voyage) return;
    const slice = progressJob.voyage;
    const label = msg.label || 'Voyage Chief…';
    if (!msg.active) {
      progressSet(slice.to, label);
      return;
    }
    if (msg.pct == null || !isFinite(Number(msg.pct))) {
      progressSet(slice.from, label);
      return;
    }
    const pct = slice.from + (slice.to - slice.from) * (Number(msg.pct) / 100);
    progressSet(Math.max(slice.from, Math.min(slice.to, Math.round(pct))), label);
  }

  async function withProgress(title, startMsg, fn) {
    progressStart(title, startMsg);
    try {
      const endMsg = await fn();
      if (endMsg === false) progressFail();
      else progressDone(typeof endMsg === 'string' ? endMsg : undefined);
      return endMsg;
    } catch (e) {
      progressFail();
      throw e;
    }
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

  function tankAuthHeaders() {
    const headers = {};
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
    return headers;
  }

  /** GET a Tank backup and report bytes when the server sends a length. */
  function tankBackupGet(path, onProgress) {
    if (usingLocalTank()) {
      if (typeof onProgress === 'function') onProgress(null);
      return tankRequest(path).then((body) => {
        if (typeof onProgress === 'function') onProgress(100);
        return body;
      });
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/tanks' + path);
      const headers = tankAuthHeaders();
      Object.keys(headers).forEach((key) => {
        try { xhr.setRequestHeader(key, headers[key]); } catch (_) { /* ignore */ }
      });
      xhr.onprogress = (e) => {
        if (typeof onProgress !== 'function') return;
        if (e.lengthComputable && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        else onProgress(null);
      };
      xhr.onload = () => {
        let data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; }
        catch (e) { reject(new Error('Invalid backup from Tank Chief')); return; }
        if (xhr.status >= 400) {
          reject(new Error((data && (data.error || data.message)) || xhr.statusText || 'Request failed'));
          return;
        }
        if (typeof onProgress === 'function') onProgress(100);
        resolve(data);
      };
      xhr.onerror = () => reject(new Error('Could not read Tank Chief'));
      xhr.send();
    });
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
      if (msg.type === 'chengaio-voyage-backup-progress') {
        applyVoyageProgress(msg);
        /* Proof of life. A long job is not a hung one, and the deadline below
           is measured from the last sign of work rather than from the start. */
        voyageLastProgressAt = Date.now();
      }
      if (msg.type === 'chengaio-voyage-backup-result-begin' && msg.requestId && pendingVoyage[msg.requestId]) {
        pendingVoyage[msg.requestId].parts = [];
        pendingVoyage[msg.requestId].meta = msg.meta || {};
        return;
      }
      if (msg.type === 'chengaio-voyage-backup-result-chunk' && msg.requestId && pendingVoyage[msg.requestId]) {
        pendingVoyage[msg.requestId].parts.push(String(msg.chunk || ''));
        return;
      }
      if (msg.type === 'chengaio-voyage-backup-result-end' && msg.requestId && pendingVoyage[msg.requestId]) {
        const job = pendingVoyage[msg.requestId];
        delete pendingVoyage[msg.requestId];
        if (job.done) job.done();
        try {
          const payload = JSON.parse((job.parts || []).join('') || 'null');
          job.resolve({ ...(job.meta || {}), payload });
        } catch (err) {
          job.reject(err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }
      if (msg.type === 'chengaio-voyage-backup-result' && msg.requestId && pendingVoyage[msg.requestId]) {
        const { resolve, reject, done } = pendingVoyage[msg.requestId];
        delete pendingVoyage[msg.requestId];
        if (done) done();
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
    /* Hidden bridge only — Backup paints its own Voyage server form. */
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

  /**
   * The slug the active vessel syncs under.
   *
   * The ship is already chosen in the switcher at the top of the window, so
   * the field below should not be empty and waiting to be typed -- getting it
   * wrong points the push at another ship's folder on the server. The vessel
   * record carries its own voyage slug where it has one; otherwise it is
   * derived the same way the voyage bridge derives it, so both land on the
   * same folder.
   */
  function activeVesselSlug() {
    try {
      const active = window.ChengPro && ChengPro.vessel && ChengPro.vessel.getActive();
      if (!active) return '';
      if (active.voyageSlug) return String(active.voyageSlug);
      if (active.slug) return String(active.slug);
      const VB = window.ChengProVoyageBridge;
      if (VB && typeof VB.slugify === 'function' && active.name) return VB.slugify(active.name);
      return String(active.id || '');
    } catch (_) {
      return '';
    }
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
    /* Carry the active vessel's slug when the module has none stored, rather
       than leaving it blank for the engineer to guess at. A slug the module
       has already recorded wins -- that is the folder its data is in. */
    if (vessel) vessel.value = settings.vesselId || activeVesselSlug() || '';
    if (device) device.value = settings.deviceName || '';
    if (conflict) conflict.value = settings.conflictPolicy || 'merge';
  }

  async function voyagePost(action, extra, host, timeoutMs) {
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
      pendingVoyage[requestId] = { resolve, reject, parts: [], meta: {} };
      const frame = voyageFrame.contentWindow;
      const extraObj = extra || {};
      const hasPayload = Object.prototype.hasOwnProperty.call(extraObj, 'payload');
      if (hasPayload) {
        const rest = { ...extraObj };
        delete rest.payload;
        const text = JSON.stringify(extraObj.payload);
        frame.postMessage({
          type: 'chengaio-voyage-backup',
          action,
          requestId,
          ...rest,
          payloadChunked: true,
          length: text.length,
        }, '*');
        const size = 160000;
        for (let i = 0; i < text.length;) {
          let end = Math.min(text.length, i + size);
          if (end > i && end < text.length) {
            const tail = text.charCodeAt(end - 1);
            if (tail >= 0xD800 && tail <= 0xDBFF) end -= 1;
          }
          if (end <= i) end = Math.min(text.length, i + size);
          frame.postMessage({
            type: 'chengaio-voyage-backup-chunk',
            requestId,
            chunk: text.slice(i, end),
          }, '*');
          i = end;
        }
        frame.postMessage({ type: 'chengaio-voyage-backup-end', requestId }, '*');
      } else {
        frame.postMessage({
          type: 'chengaio-voyage-backup',
          action,
          requestId,
          ...extraObj,
        }, '*');
      }
      /* A deadline measured from the last sign of life, not from the start.
      
         This was a flat setTimeout, and "Update to the newest of both" passed
         it 600000 -- so at exactly ten minutes a job that was still working
         was abandoned with "did not respond", which is what looked like being
         stuck at "uploading voyage leg to the server". Ten minutes is not long
         for a handful of legs carrying scanned requisitions over a ship's
         connection: each one is a full download, a full merge and a full
         upload.
      
         So silence is what fails now, not duration. While the module keeps
         reporting progress the job is left alone; if it stops reporting for
         the whole window, it really has died and the message says so. */
      const quietMs = timeoutMs || 120000;
      voyageLastProgressAt = Date.now();
      const startedAt = Date.now();
      const tick = setInterval(() => {
        if (!pendingVoyage[requestId]) { clearInterval(tick); return; }
        const quietFor = Date.now() - Math.max(voyageLastProgressAt, startedAt);
        if (quietFor < quietMs) return;
        clearInterval(tick);
        delete pendingVoyage[requestId];
        const mins = Math.round(quietFor / 60000);
        reject(new Error(
          `Voyage Chief stopped reporting progress for ${mins} minute${mins === 1 ? '' : 's'}`
          + ' — open Voyage once, then retry. Work already uploaded is on the server;'
          + ' running this again picks up where it left off.'));
      }, 1000);
      pendingVoyage[requestId].done = () => clearInterval(tick);
    });
  }

  /* ---------------------------------------------------------- suite bundle -- */

  function isSuiteBundle(payload) {
    return !!(payload && payload.format === SUITE_FORMAT);
  }

  function extraApi() {
    return window.ChengBackupExtra || null;
  }

  function suiteSummary(payload) {
    const tankVessels = payload.tank && payload.tank.vessels
      ? Object.keys(payload.tank.vessels).length : 0;
    const voyageVessels = payload.voyage && Array.isArray(payload.voyage.vessels)
      ? payload.voyage.vessels.length : 0;
    const parts = [];
    parts.push(`Tank Chief: ${payload.tank ? `${tankVessels} vessel(s)` : 'not in this file'}`);
    parts.push(`Voyage Chief: ${payload.voyage ? `${voyageVessels} vessel(s)` : 'not in this file'}`);
    const extra = extraApi();
    if (extra && payload.voyage) {
      const counts = extra.miscCountsFromVoyage(payload.voyage);
      const bits = [];
      if (counts.requisitions) bits.push(`${counts.requisitions} requisition${counts.requisitions === 1 ? '' : 's'}`);
      if (counts.plans || counts.planSnapshots) {
        bits.push(`${counts.plans} consumption plan${counts.plans === 1 ? '' : 's'}, ${counts.planSnapshots} snapshot${counts.planSnapshots === 1 ? '' : 's'}`);
      }
      if (counts.orbEntries || counts.orbBooks) {
        bits.push(`${counts.orbEntries} e-ORB entr${counts.orbEntries === 1 ? 'y' : 'ies'}`);
      }
      if (bits.length) parts.push(bits.join(', '));
    }
    if (extra && payload.companion) {
      const line = extra.companionSummary(payload.companion);
      if (line) parts.push(line);
    }
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
          <p class="hint">Everything that moves a vessel's data — to a file, to a server, or from another engineer's account — in the order you do it. On the phone a file goes to <strong>Downloads/ChEngAIO</strong>; on desktop you pick the folder. Suite files restore in standalone Tank or Voyage too — each app takes its own half.</p>
          <p class="hint">${isMaster ? 'Master license: full-database Tank backups include all user accounts on this server.' : 'Your license email scopes Tank backups and sync to your account only.'} Active vessel: <strong>${esc(activeLabel)}</strong></p>
          <div id="bk-progress-host"></div>

          <h2 class="backup-step"><span class="backup-step-no">1</span> Connect to your servers</h2>
          <p class="hint backup-step-hint">Set each address once. Saving one connects and pulls straight away, and the vessel list in step 2 fills itself from whichever servers answer. Step 3 needs no network at all.</p>

          <details class="form-panel backup-section" id="bk-tank-server" open>
            <summary><span class="backup-section-title">Tank Chief server</span><span class="hint backup-summary-note" id="bk-sync-summary">not set</span></summary>
            <p class="hint">Peer URL, token, and where this device keeps its tank database.</p>
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
              <button type="button" class="btn primary" id="bk-sync-save">Save &amp; connect</button>
              <button type="button" class="btn" id="bk-sync-probe">Test connection</button>
              <button type="button" class="btn" id="bk-sync-pull">Pull from peer</button>
              <button type="button" class="btn" id="bk-sync-push">Push to peer</button>
              <button type="button" class="btn" id="bk-sync-flush">Flush offline queue</button>
            </div>
            <p class="hint" id="bk-sync-status">Ready.</p>
          </details>

          <details class="form-panel backup-section" id="bk-voyage-server" open>
            <summary><span class="backup-section-title">Voyage Chief server</span><span class="hint backup-summary-note" id="bk-voy-sync-summary">not set</span></summary>
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
              <button type="button" class="btn primary" id="bk-voy-sync-save">Save &amp; connect</button>
              <button type="button" class="btn" id="bk-voy-sync-test">Test connection</button>
              <button type="button" class="btn" id="bk-voy-sync-push">Push active leg</button>
              <button type="button" class="btn" id="bk-voy-sync-pull">Pull active leg</button>
              <button type="button" class="btn" id="bk-voy-sync-persist">Keep data persistent</button>
            </div>
            <p class="hint">Keep data persistent compares every voyage leg. Tick the ones both databases should hold, then press it again. A leg on only one side is copied across. A leg on both sides keeps the newer watch. The latest leg opens afterwards, and Tank Chief loads the latest sounding report and tank readings.</p>
            <p class="hint" id="bk-voy-sync-status">Loading sync settings…</p>

            <div class="backup-subsection">
              <h3>One leg at a time</h3>
              <p class="hint">For a specific voyage and condition. Step 2 pulls a ship's latest leg — or all of them — from its own row, which is the usual way in.</p>
              <div class="btn-row">
                <button type="button" class="btn" id="bk-voy-sync-list">List remote voyages</button>
              </div>
              <div class="grid-2" style="margin-top:10px;">
                <div class="field"><label for="bk-voy-sync-pull-voyage">Voyage no.</label>
                  <select id="bk-voy-sync-pull-voyage"><option value="">— List remote voyages first —</option></select></div>
                <div class="field"><label for="bk-voy-sync-pull-condition">Condition</label>
                  <select id="bk-voy-sync-pull-condition">
                    <option value="B">B — Ballasted</option>
                    <option value="L">L — Laden</option>
                  </select></div>
              </div>
              <div class="btn-row">
                <button type="button" class="btn" id="bk-voy-sync-pull-leg">Pull selected voyage leg</button>
              </div>
              <div id="bk-voy-sync-remote" class="hint backup-remote-list" hidden></div>
            </div>
          </details>

          <details class="form-panel backup-section" id="bk-consistency" open>
            <summary><span class="backup-section-title">Database consistency</span><span class="hint backup-summary-note" id="bk-consistency-summary">not checked</span></summary>
            <p class="hint">Compares every voyage leg, and every saved tank report, on this device with the server. Push and pull of the active leg do not see the other voyages. Nothing here deletes a leg or a report. Where both sides have the same one, the newer copy is kept and records that exist on only one side stay.</p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-check-voyage">Check voyage legs</button>
              <button type="button" class="btn" id="bk-check-tanks">Check saved tank reports</button>
              <button type="button" class="btn" id="bk-consistency-apply" disabled>Update to the newest of both</button>
            </div>
            <div id="bk-consistency-list" class="bk-consistency-list hint">Not checked yet.</div>
            <p class="hint" id="bk-consistency-status">Ready.</p>
          </details>

          <h2 class="backup-step"><span class="backup-step-no">2</span> Vessels on the server</h2>
          <p class="hint backup-step-hint">Every vessel on this server, from Tank Chief and Voyage Chief together — one row per ship, matched by IMO or by name with the MV / M/V prefix ignored. Your own vessels come first.</p>

          <div class="form-panel backup-section">
            <div class="backup-section-head">
              <span class="backup-section-title">Vessel library</span>
              <button type="button" class="btn" id="bk-lib-refresh">Refresh list</button>
            </div>
            <div id="bk-lib-list" class="backup-lib-list hint">Loading…</div>
            <p class="hint" id="bk-lib-status">Ready.</p>
          </div>

          <h2 class="backup-step"><span class="backup-step-no">3</span> Backup files</h2>
          <p class="hint backup-step-hint">Plain JSON, written and read with no server involved. This is the half that still works at sea.</p>

          <div class="form-panel backup-section">
            <div class="backup-section-head"><span class="backup-section-title">Entire suite</span></div>
            <p class="hint">One file with Tank Chief, Voyage Chief, and the records the other programs need from this device: notes, the ship clock, sync and license-server addresses, spare and store requisitions, the consumption plan and its snapshots, and the oil record book. The license key and the sign-in session stay on this device.</p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-suite-all">Export entire program</button>
              <button type="button" class="btn" id="bk-suite-restore">Restore entire program…</button>
              <button type="button" class="btn" id="bk-suite-merge">Merge entire program…</button>
              <input type="file" id="bk-suite-file" accept="application/json,.json" hidden>
            </div>
            <p class="hint" id="bk-suite-status">Ready.</p>
          </div>

          <div class="form-panel backup-section">
            <div class="backup-section-head"><span class="backup-section-title">Miscellaneous data</span></div>
            <p class="hint">A separate file for the lists that are not a log line or a tank sounding: spare and store requisitions, the consumption plan and its saved snapshots, the oil record book, plus this device’s theme, dashboard layout, and Tank Chief screen choices.</p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-misc-export">Export miscellaneous data</button>
              <button type="button" class="btn" id="bk-misc-restore">Restore miscellaneous data…</button>
              <button type="button" class="btn" id="bk-misc-merge">Merge miscellaneous data…</button>
              <input type="file" id="bk-misc-file" accept="application/json,.json" hidden>
            </div>
            <p class="hint" id="bk-misc-status">Ready.</p>
          </div>

          <div class="form-panel backup-section">
            <div class="backup-section-head"><span class="backup-section-title">Tank Chief database</span></div>
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
            <div class="backup-section-head"><span class="backup-section-title">Voyage Chief database</span></div>
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

          <div id="bk-voyage-bridge-host" class="aio-backup-voyage-bridge" hidden aria-hidden="true"></div>
        </section>`;

      const tankStatus = root.querySelector('#bk-tank-status');
      const voyageStatus = root.querySelector('#bk-voyage-status');
      const suiteStatus = root.querySelector('#bk-suite-status');
      const miscStatus = root.querySelector('#bk-misc-status');
      const setTank = (t) => { if (tankStatus) tankStatus.textContent = t; };
      const setVoyage = (t) => { if (voyageStatus) voyageStatus.textContent = t; };
      const setSuite = (t) => { if (suiteStatus) suiteStatus.textContent = t; };
      const setMisc = (t) => { if (miscStatus) miscStatus.textContent = t; };

      /* Keep server blocks open after save so URL / token fields stay editable.
       * The summary line still shows which host is configured. */
      function markServerBlock(blockId, noteId, url) {
        const block = root.querySelector('#' + blockId);
        const note = root.querySelector('#' + noteId);
        const set = String(url || '').trim();
        if (note) note.textContent = set || 'not set';
        if (block) block.open = true;
      }

      function mirrorVoyageSyncToLocalStorage(settings) {
        try {
          const prev = (() => {
            try {
              return JSON.parse(localStorage.getItem('noonReportSyncCredentials') || '{}') || {};
            } catch {
              return {};
            }
          })();
          const next = {
            ...prev,
            serverUrl: (settings && settings.serverUrl) || prev.serverUrl || '',
            apiToken: (settings && settings.apiToken) || prev.apiToken || '',
            vesselId: (settings && settings.vesselId) != null ? settings.vesselId : (prev.vesselId || ''),
            deviceName: (settings && settings.deviceName) != null ? settings.deviceName : (prev.deviceName || ''),
            conflictPolicy: (settings && settings.conflictPolicy) || prev.conflictPolicy || 'merge',
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem('noonReportSyncCredentials', JSON.stringify(next));
          try { sessionStorage.setItem('noonReportSyncCredentials', JSON.stringify(next)); } catch (_) {}
        } catch (_) { /* ignore */ }
      }

      function readMirroredVoyageSync() {
        try {
          const raw = localStorage.getItem('noonReportSyncCredentials')
            || sessionStorage.getItem('noonReportSyncCredentials');
          if (!raw) return null;
          const creds = JSON.parse(raw);
          return (creds && typeof creds === 'object') ? creds : null;
        } catch {
          return null;
        }
      }

      /* Keep the folded line honest while he is typing a new address. */
      for (const [noteId, urlId] of [
        ['bk-sync-summary', 'bk-sync-url'],
        ['bk-voy-sync-summary', 'bk-voy-sync-url'],
      ]) {
        const note = root.querySelector('#' + noteId);
        const urlEl = root.querySelector('#' + urlId);
        if (note && urlEl) {
          urlEl.addEventListener('input', () => {
            note.textContent = urlEl.value.trim() || 'not set';
          });
        }
      }

      function slicePct(from, to, pct) {
        if (pct == null || !isFinite(Number(pct))) return null;
        return Math.max(from, Math.min(to, Math.round(from + (to - from) * (Number(pct) / 100))));
      }

      root.querySelector('#bk-suite-all').onclick = async () => {
        try {
          await withProgress('Exporting the entire program…', 'Reading Tank Chief…', async () => {
            setSuite('Collecting Tank + Voyage databases…');
            let tankBackup = null;
            let tankError = null;
            try {
              tankBackup = await tankBackupGet('/api/backup', (pct) => {
                progressSet(slicePct(8, 34, pct), `Reading Tank Chief from ${tankSourceLabel()}…`);
              });
            } catch (e) {
              tankError = e.message || 'Tank backup failed';
            }

            progressSet(36, 'Reading Voyage Chief…');
            watchVoyage(36, 84);
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

            const extra = extraApi();
            const suite = {
              format: SUITE_FORMAT,
              exportedAt: new Date().toISOString(),
              tankSource: tankSourceLabel(),
              tank: tankBackup,
              tankError: tankError || null,
              voyage: (voyageMsg && voyageMsg.payload) || null,
              voyageFilename: (voyageMsg && voyageMsg.filename) || null,
              voyageError: voyageError || null,
              companion: extra ? extra.collectCompanion(localStorage) : null,
            };
            progressSet(90, 'Saving the file…');
            await progressYield();
            const saved = await downloadJson(`cheng-aio-suite-${Date.now()}.json`, suite);
            const partial = [tankError && 'Tank', voyageError && 'Voyage'].filter(Boolean).join(' + ');
            const covered = extra ? extra.companionSummary(suite.companion) : '';
            const miscBits = extra && suite.voyage ? extra.miscCountsFromVoyage(suite.voyage) : null;
            const miscLine = miscBits
              ? `${miscBits.requisitions} requisition${miscBits.requisitions === 1 ? '' : 's'}, ${miscBits.planSnapshots} consumption-plan snapshot${miscBits.planSnapshots === 1 ? '' : 's'}, ${miscBits.orbEntries} e-ORB entr${miscBits.orbEntries === 1 ? 'y' : 'ies'}`
              : '';
            const line = partial
              ? `Entire program ${downloadWhereLabel(saved)} — ${partial} could not be read (${[tankError, voyageError].filter(Boolean).join(' · ')}).`
              : `Entire program ${downloadWhereLabel(saved)}${covered ? ` — ${covered}` : ''}${miscLine ? `. ${miscLine}.` : '.'}`;
            setSuite(line);
            toast(`Entire program ${downloadWhereLabel(saved)}`);
            return line;
          });
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
        const verbTitle = merge ? 'Merging the entire program…' : 'Restoring the entire program…';
        return withProgress(verbTitle, `Reading ${file.name}…`, async () => {
          const payload = await readFileJson(file, (pct) => {
            progressSet(slicePct(0, 12, pct), `Reading ${file.name}…`);
          });
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
            return false;
          }

          const done = [];
          const failed = [];

          if (payload.tank) {
            progressSet(16, 'Restoring Tank Chief…');
            setSuite('Restoring Tank Chief…');
            await progressYield();
            try {
              const res = await importTankBackup(payload.tank, merge);
              const n = res && res.imported != null ? res.imported : (res && res.vesselCount) || 0;
              done.push(`Tank Chief (${n} vessel${n === 1 ? '' : 's'})`);
            } catch (e) {
              failed.push('Tank Chief: ' + (e.message || 'import failed'));
            }
          }

          if (payload.voyage) {
            progressSet(42, 'Restoring Voyage Chief…');
            watchVoyage(42, 90);
            setSuite('Restoring Voyage Chief…');
            try {
              const msg = await voyagePost(merge ? 'merge-db' : 'restore-db', { payload: payload.voyage }, root);
              done.push(msg.message || 'Voyage Chief');
            } catch (e) {
              failed.push('Voyage Chief: ' + (e.message || 'import failed'));
            }
          }

          if (payload.companion && extraApi()) {
            progressSet(92, 'Restoring notes and program settings…');
            setSuite('Restoring notes and program settings…');
            await progressYield();
            try {
              const applied = extraApi().applyCompanion(localStorage, payload.companion, merge);
              if (payload.companion.voyageSync) {
                try {
                  sessionStorage.setItem('noonReportSyncCredentials', JSON.stringify(payload.companion.voyageSync));
                } catch (_) { /* ignore */ }
              }
              const line = extraApi().companionSummary(payload.companion);
              done.push(line || `notes and program settings (${applied.notes} note${applied.notes === 1 ? '' : 's'})`);
            } catch (e) {
              failed.push('Notes and program settings: ' + (e.message || 'import failed'));
            }
          }

          progressSet(94, 'Refreshing the vessel list…');
          try { await ChengPro.vessel.refresh(); } catch { /* ignore */ }

          if (!done.length) throw new Error(failed.join(' · ') || 'Nothing was restored');
          const summary = `Restored ${done.join(' · ')}${failed.length ? ` — but ${failed.join(' · ')}` : ''}`;
          setSuite(summary);
          toast(failed.length ? 'Restored with errors — see status' : 'Entire program restored');
          return summary;
        });
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

      root.querySelector('#bk-misc-export').onclick = async () => {
        try {
          await withProgress('Exporting miscellaneous data…', 'Reading Voyage Chief…', async () => {
            setMisc('Reading requisitions, consumption plans, and the oil record book…');
            let voyagePayload = null;
            let voyageError = null;
            try {
              watchVoyage(8, 80);
              const msg = await voyagePost('export-misc', {}, root);
              voyagePayload = msg && msg.payload;
            } catch (e) {
              voyageError = e.message || 'Voyage miscellaneous data could not be read';
            }
            const extra = extraApi();
            const file = {
              format: (extra && extra.MISC_FORMAT) || 'cheng-aio-misc-v1',
              exportedAt: new Date().toISOString(),
              ships: (voyagePayload && voyagePayload.ships) || [],
              orbEntries: (voyagePayload && voyagePayload.orbEntries) || [],
              preferences: extra ? extra.collectPreferences(localStorage) : {},
            };
            const prefCount = Object.keys(file.preferences).length;
            if (!file.ships.length && !file.orbEntries.length && !prefCount) {
              throw new Error(voyageError || 'Nothing miscellaneous to export');
            }
            progressSet(90, 'Saving the file…');
            await progressYield();
            const saved = await downloadJson(`cheng-aio-misc-${Date.now()}.json`, file);
            const summary = extra ? extra.miscFileSummary(file) : 'saved';
            const line = voyageError
              ? `Miscellaneous data ${downloadWhereLabel(saved)} — Voyage Chief could not be read (${voyageError}). Display settings were saved.`
              : `Miscellaneous data ${downloadWhereLabel(saved)} — ${summary}.`;
            setMisc(line);
            toast(`Miscellaneous data ${downloadWhereLabel(saved)}`);
            return line;
          });
        } catch (e) {
          setMisc(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      const miscImport = async (file, merge) => {
        const verbTitle = merge ? 'Merging miscellaneous data…' : 'Restoring miscellaneous data…';
        return withProgress(verbTitle, `Reading ${file.name}…`, async () => {
          const payload = await readFileJson(file, (pct) => {
            progressSet(slicePct(0, 20, pct), `Reading ${file.name}…`);
          });
          const extra = extraApi();
          const format = (extra && extra.MISC_FORMAT) || 'cheng-aio-misc-v1';
          if (!payload || payload.format !== format) {
            throw new Error(`This is not a miscellaneous data file (expected format ${format}).`);
          }
          const summary = extra ? extra.miscFileSummary(payload) : file.name;
          if (!confirm(`${merge ? 'Merge into' : 'REPLACE on'} this device from the miscellaneous file?\n\n${summary}\n\n${
            merge
              ? 'A requisition or plan snapshot with the same id keeps the newer time. Display settings in the file replace the ones on this device. Log entries and tank soundings are left as they are.'
              : 'On each ship named in the file, the requisitions, consumption plan, and oil record book are replaced by the file. Other ships, log entries, and tank soundings stay. Display settings in the file replace the ones on this device.'
          }`)) {
            setMisc('Restore cancelled — nothing was changed.');
            return false;
          }
          const done = [];
          const failed = [];
          if (extra && payload.preferences) {
            const written = extra.applyPreferences(localStorage, payload.preferences);
            if (written.length) done.push(`${written.length} display setting${written.length === 1 ? '' : 's'}`);
          }
          if ((payload.ships && payload.ships.length) || (payload.orbEntries && payload.orbEntries.length)) {
            progressSet(30, 'Restoring Voyage Chief lists…');
            watchVoyage(30, 90);
            setMisc('Restoring requisitions, consumption plans, and the oil record book…');
            try {
              const msg = await voyagePost('import-misc', { payload, merge: !!merge }, root);
              done.push(msg.message || 'Voyage Chief lists');
            } catch (e) {
              failed.push(e.message || 'Voyage Chief lists could not be restored');
            }
          }
          if (!done.length) throw new Error(failed.join(' · ') || 'Nothing was restored');
          const line = `${done.join(' · ')}${failed.length ? ` — but ${failed.join(' · ')}` : ''}`;
          setMisc(line);
          toast(failed.length ? 'Miscellaneous data restored with errors — see status' : 'Miscellaneous data restored');
          return line;
        });
      };

      root.querySelector('#bk-misc-restore').onclick = () => {
        const input = root.querySelector('#bk-misc-file');
        input.dataset.mode = 'restore';
        input.click();
      };
      root.querySelector('#bk-misc-merge').onclick = () => {
        const input = root.querySelector('#bk-misc-file');
        input.dataset.mode = 'merge';
        input.click();
      };
      root.querySelector('#bk-misc-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        const mode = ev.target.dataset.mode || 'restore';
        ev.target.value = '';
        if (!file) return;
        try {
          await miscImport(file, mode === 'merge');
        } catch (e) {
          setMisc(e.message || 'Restore failed');
          toast(e.message || 'Restore failed');
        }
      };

      root.querySelector('#bk-tank-full').onclick = async () => {
        try {
          await withProgress('Downloading Tank Chief…', `Reading tanks from ${tankSourceLabel()}…`, async () => {
            setTank(`Preparing Tank backup from ${tankSourceLabel()}…`);
            const backup = await tankBackupGet('/api/backup', (pct) => {
              progressSet(slicePct(6, 82, pct), `Reading Tank Chief from ${tankSourceLabel()}…`);
            });
            progressSet(90, 'Saving the file…');
            await progressYield();
            const saved = await downloadJson(`tank-chief-backup-${Date.now()}.json`, backup);
            const n = backup && backup.vessels ? Object.keys(backup.vessels).length : 0;
            const line = `Full backup ${downloadWhereLabel(saved)} (${n} vessel${n === 1 ? '' : 's'}).`;
            setTank(line);
            toast(`Tank backup ${downloadWhereLabel(saved)}`);
            return line;
          });
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
        try {
          await withProgress('Restoring Tank Chief…', `Reading ${file.name}…`, async () => {
            setTank('Importing Tank backup…');
            const backup = await readFileJson(file, (pct) => {
              progressSet(slicePct(0, 40, pct), `Reading ${file.name}…`);
            });
            progressSet(48, 'Applying vessels, tanks and settings…');
            await progressYield();
            const res = await importTankBackup(backup, true);
            progressSet(88, 'Refreshing the vessel list…');
            await ChengPro.vessel.refresh();
            const n = res && res.imported != null ? res.imported : (res && res.vesselCount) || 0;
            const line = `Tank backup imported into ${tankSourceLabel()} — ${n} vessel${n === 1 ? '' : 's'}.`;
            setTank(line);
            toast('Tank backup imported');
            return line;
          });
        } catch (e) {
          setTank(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-tank-vessel').onclick = async () => {
        if (!active) { toast('Select a vessel in the header first'); return; }
        try {
          await withProgress('Exporting the active tank vessel…', `Reading ${active.name}…`, async () => {
            setTank('Exporting active vessel…');
            const backup = await tankBackupGet('/api/vessels/' + encodeURIComponent(active.id) + '/backup', (pct) => {
              progressSet(slicePct(6, 82, pct), `Reading ${active.name}…`);
            });
            progressSet(90, 'Saving the file…');
            await progressYield();
            const saved = await downloadJson(`tank-chief-vessel-${active.id}-${Date.now()}.json`, backup);
            const line = `Vessel ${active.name} ${downloadWhereLabel(saved)}.`;
            setTank(line);
            toast(`Vessel backup ${downloadWhereLabel(saved)}`);
            return line;
          });
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
        try {
          await withProgress('Importing a tank vessel…', `Reading ${file.name}…`, async () => {
            setTank('Importing vessel JSON…');
            const backup = await readFileJson(file, (pct) => {
              progressSet(slicePct(0, 40, pct), `Reading ${file.name}…`);
            });
            progressSet(48, 'Applying the vessel…');
            await progressYield();
            await importTankBackup(backup, true);
            progressSet(88, 'Refreshing the vessel list…');
            await ChengPro.vessel.refresh();
            const line = `Vessel JSON imported into ${tankSourceLabel()}.`;
            setTank(line);
            toast('Vessel imported');
            return line;
          });
        } catch (e) {
          setTank(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-voyage-db').onclick = async () => {
        try {
          await withProgress('Backing up Voyage Chief…', 'Reading the voyage database…', async () => {
            setVoyage('Building voyage database backup…');
            watchVoyage(8, 84);
            const msg = await voyagePost('export-db', {}, root);
            if (!msg.payload) throw new Error('Voyage Chief returned an empty backup');
            progressSet(90, 'Saving the file…');
            await progressYield();
            const saved = await downloadJson(msg.filename || `voyage-chief-db-${Date.now()}.json`, msg.payload);
            const line = `Voyage database ${downloadWhereLabel(saved)}.`;
            setVoyage(line);
            toast(`Voyage database ${downloadWhereLabel(saved)}`);
            return line;
          });
        } catch (e) {
          setVoyage(e.message || 'Backup failed');
          toast(e.message || 'Backup failed');
        }
      };

      const voyageDbImport = async (file, merge) => {
        const title = merge ? 'Merging Voyage Chief…' : 'Restoring Voyage Chief…';
        return withProgress(title, `Reading ${file.name}…`, async () => {
          const payload = await readFileJson(file, (pct) => {
            progressSet(slicePct(0, 18, pct), `Reading ${file.name}…`);
          });
          progressSet(22, merge ? 'Merging voyage database…' : 'Restoring voyage database…');
          watchVoyage(22, 94);
          setVoyage(merge ? 'Merging voyage database…' : 'Restoring voyage database…');
          const msg = await voyagePost(merge ? 'merge-db' : 'restore-db', { payload }, root);
          const line = msg.message || 'Voyage database updated.';
          setVoyage(line);
          toast(line);
          return line;
        });
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
        try {
          await withProgress('Exporting the voyage vessel…', 'Reading the vessel…', async () => {
            setVoyage('Exporting voyage vessel…');
            watchVoyage(8, 84);
            const msg = await voyagePost('export-vessel', { vesselId: active && active.voyageSlug }, root);
            if (!msg.payload) throw new Error('Voyage Chief returned an empty vessel export');
            progressSet(90, 'Saving the file…');
            await progressYield();
            const saved = await downloadJson(msg.filename || `voyage-vessel-${Date.now()}.json`, msg.payload);
            const line = `Voyage vessel ${downloadWhereLabel(saved)}.`;
            setVoyage(line);
            toast(`Voyage vessel ${downloadWhereLabel(saved)}`);
            return line;
          });
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
          await withProgress('Importing a voyage vessel…', `Reading ${file.name}…`, async () => {
            const payload = await readFileJson(file, (pct) => {
              progressSet(slicePct(0, 20, pct), `Reading ${file.name}…`);
            });
            if (!confirm('Import this voyage vessel JSON? Existing vessel data with the same id will be replaced.')) {
              setVoyage('Vessel import cancelled — nothing was changed.');
              return false;
            }
            progressSet(28, 'Importing voyage vessel…');
            watchVoyage(28, 94);
            setVoyage('Importing voyage vessel…');
            const msg = await voyagePost('import-vessel', { payload }, root);
            const line = msg.message || 'Voyage vessel imported.';
            setVoyage(line);
            toast(line);
            return line;
          });
        } catch (e) {
          setVoyage(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };


      /* ---------- Local vs server consistency ---------- */
      const consistencyList = root.querySelector('#bk-consistency-list');
      const consistencyStatus = root.querySelector('#bk-consistency-status');
      const consistencySummary = root.querySelector('#bk-consistency-summary');
      const consistencyApply = root.querySelector('#bk-consistency-apply');
      let consistencyPlan = null;

      const setConsistency = (text) => { if (consistencyStatus) consistencyStatus.textContent = text; };
      const setConsistencySummary = (text) => { if (consistencySummary) consistencySummary.textContent = text; };

      function legCondition(raw) {
        const s = String(raw || '').trim().toUpperCase();
        if (s === 'L' || s === 'LADEN' || s === 'LOADED') return 'L';
        if (s === 'B' || s === 'BALLAST' || s === '') return 'B';
        return s.slice(0, 1) || 'B';
      }

      function legConditionLabel(cond) {
        return legCondition(cond) === 'L' ? 'Laden' : 'Ballast';
      }

      function shortWhen(iso) {
        if (!iso) return 'no date';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return d.toLocaleString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
      }

      function adviseReport(local, remote) {
        if (local && !remote) return { action: 'push', reason: 'Only on this device', checked: true };
        if (!local && remote) return { action: 'pull', reason: 'Only on the server', checked: true };
        if ((local.savedAt || '') === (remote.savedAt || '')) return { action: 'same', reason: 'Same copy', checked: false };
        if ((local.savedAt || '') > (remote.savedAt || '')) return { action: 'push', reason: 'This device is newer', checked: true };
        return { action: 'pull', reason: 'The server is newer', checked: true };
      }

      function sideText(count, when) {
        if (count == null) return '—';
        const n = Number(count) || 0;
        return `${n} ${n === 1 ? 'entry' : 'entries'} · ${shortWhen(when)}`;
      }

      function renderConsistency(plan) {
        consistencyPlan = plan;
        if (!consistencyList) return;
        const rows = plan.rows || [];
        if (!rows.length) {
          consistencyList.innerHTML = '<p class="hint">Nothing to compare.</p>';
        } else {
          consistencyList.innerHTML = `
            <div class="bk-consistency-row bk-consistency-head"><span></span><span>Item</span><span>This device</span><span>Server</span><span>Suggestion</span></div>
            ${rows.map((row, i) => `
              <div class="bk-consistency-row">
                <span>${row.checked == null ? '' : `<input type="checkbox" data-consistency-row="${i}" ${row.checked ? 'checked' : ''} ${row.action === 'same' ? 'disabled' : ''}>`}</span>
                <span>${esc(row.title)}</span>
                <span>${esc(row.localText)}</span>
                <span>${esc(row.serverText)}</span>
                <span>${esc(row.reason)}</span>
              </div>`).join('')}`;
        }
        const chosen = rows.filter((row) => row.checked && row.action !== 'same').length;
        if (consistencyApply) consistencyApply.disabled = !chosen;
        setConsistencySummary(plan.summary || 'checked');
        setConsistency(plan.status || 'Ready.');
      }

      function selectedConsistencyRows() {
        if (!consistencyPlan || !consistencyList) return [];
        const picked = [];
        consistencyList.querySelectorAll('[data-consistency-row]').forEach((box) => {
          if (!box.checked) return;
          const row = consistencyPlan.rows[Number(box.getAttribute('data-consistency-row'))];
          if (row && row.action !== 'same') picked.push(row);
        });
        return picked;
      }

      if (consistencyList) {
        consistencyList.addEventListener('change', () => {
          if (!consistencyApply || !consistencyPlan) return;
          consistencyApply.disabled = !selectedConsistencyRows().length;
        });
      }

      function voyageNumbers(rows, side) {
        const key = side === 'local' ? 'localText' : 'serverText';
        const seen = [];
        for (const row of rows || []) {
          if (!row || row[key] === '—') continue;
          const no = String(row.voyage || '').trim();
          if (no && !seen.includes(no)) seen.push(no);
        }
        return seen;
      }

      function reloadOpenVoyageFrame() {
        document.querySelectorAll('iframe.aio-embed-frame').forEach((frame) => {
          try {
            const src = frame.getAttribute('src') || '';
            if (src.indexOf('voyage') < 0) return;
            frame.contentWindow.postMessage({
              type: 'chengaio-voyage-backup',
              action: 'show-open-leg',
              requestId: 'show-' + Date.now(),
            }, '*');
          } catch (_) { /* the voyage page is not open */ }
        });
      }

      function reloadOpenTankFrames() {
        document.querySelectorAll('iframe').forEach((frame) => {
          try {
            const src = frame.getAttribute('src') || '';
            if (src.indexOf('/tanks') < 0 && src.indexOf('tank') < 0) return;
            frame.contentWindow.postMessage({ type: 'chengaio-reload-sounding' }, '*');
          } catch (_) { /* tank page is not open */ }
        });
      }

      async function loadLatestSounding(vesselIds, bothSides) {
        const ids = [...new Set((vesselIds || []).filter(Boolean))];
        const active = ChengPro.vessel.getActive();
        if (active && active.id && !ids.includes(active.id)) ids.push(active.id);
        const notes = [];
        for (const id of ids) {
          const path = '/api/vessels/' + encodeURIComponent(id) + '/sounding-report/load-latest';
          const opts = { method: 'POST', body: '{}' };
          if (usingLocalTank() || bothSides) {
            try {
              if (canUseLocalTank()) notes.push(await tankRequest(path, opts));
            } catch (e) {
              notes.push({ id, error: e.message });
            }
          }
          if (!usingLocalTank() || bothSides) {
            try { notes.push(await gatewayTankApi(path, opts)); }
            catch (e) { notes.push({ id, error: e.message }); }
          }
        }
        reloadOpenTankFrames();
        return notes.filter((note) => note && note.loaded);
      }

      async function refreshVoyageConsistency() {
        const settings = readVoyageSyncForm(root);
        if (!settings.serverUrl) throw new Error('Set the Voyage Chief sync server URL above, then check again.');
        progressSet(20, 'Comparing voyage legs on this device and the server…');
        watchVoyage(20, 90);
        const compared = await voyagePost('compare-legs', {
          vessel: settings.vesselId,
          settings,
        }, root);
        const rows = (compared.rows || []).map((row) => ({
          kind: 'voyage-leg',
          voyage: row.voyage,
          condition: legCondition(row.condition),
          action: row.action,
          reason: row.reason,
          checked: !!row.checked,
          title: `Voyage ${row.voyage} · ${legConditionLabel(row.condition)}`,
          localText: row.localEntryCount == null ? '—' : sideText(row.localEntryCount, row.localAt),
          serverText: row.remoteEntryCount == null ? '—' : sideText(row.remoteEntryCount, row.remoteAt),
        })).sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true }));
        /* Miscellaneous vessel data: the requisitions, the Consumption Plan's
           saved snapshots and the oil record book. None of it is a log entry,
           so none of it has a leg of its own -- it travels inside the vessel
           setup that each leg carries, which is why it is reported here rather
           than compared side by side: downloading a leg to count its rows
           would pull the scanned requisitions with it, hundreds of megabytes,
           for a number. Its own row says what this device holds and that the
           update below carries it. */
        let miscRow = null;
        try {
          const misc = await voyagePost('misc-summary', {}, root, 60000);
          const c = misc && misc.counts;
          if (c) {
            const held = [
              `${c.requisitions} requisition${c.requisitions === 1 ? '' : 's'}`,
              `${c.bunkerPlanHistory} plan snapshot${c.bunkerPlanHistory === 1 ? '' : 's'}`,
              `${c.orbEntries} e-ORB entr${c.orbEntries === 1 ? 'y' : 'ies'}`,
            ];
            if (c.orbConfigured) held.push('oil record book set up');
            miscRow = {
              kind: 'voyage-misc',
              action: 'same',
              reason: 'Carried by the voyage legs above — nothing to tick',
              checked: false,
              title: 'Miscellaneous vessel data',
              localText: held.join(' · '),
              serverText: 'travels with each leg',
            };
          }
        } catch (err) {
          /* A module that cannot answer must not block the leg comparison. */
          console.warn('Miscellaneous data summary skipped:', err.message);
        }
        if (miscRow) rows.push(miscRow);
        const differ = rows.filter((row) => row.action !== 'same').length;
        const ship = compared.vesselName || compared.vessel || settings.vesselId || 'this ship';
        const plan = {
          kind: 'voyage',
          settings,
          vessel: settings.vesselId || compared.vessel,
          rows,
          summary: differ ? `${differ} leg${differ === 1 ? '' : 's'} differ` : 'legs match',
          status: `${rows.length - (miscRow ? 1 : 0)} leg${rows.length - (miscRow ? 1 : 0) === 1 ? '' : 's'} compared for ${ship}. ${differ ? `${differ} need an update. Tick the ones both databases should hold.` : 'Nothing is ahead on either side.'}`,
        };
        renderConsistency(plan);
        return plan;
      }

      root.querySelector('#bk-check-voyage').onclick = async () => {
        try {
          await withProgress('Comparing voyage legs…', 'Reading this device…', async () => {
            const plan = await refreshVoyageConsistency();
            const differ = (plan.rows || []).filter((row) => row.action !== 'same').length;
            return differ
              ? `${differ} voyage leg${differ === 1 ? '' : 's'} differ`
              : 'Voyage legs match';
          });
        } catch (e) {
          setConsistency(e.message || 'Voyage check failed');
          toast(e.message || 'Voyage check failed');
        }
      };

      function reportGroups(payload) {
        const brief = (payload && payload.brief) || {};
        const full = payload || {};
        return [
          ['reportHistory', 'Fuel oil reports', brief.reportHistory, full.reportHistory],
          ['voyageHistory', 'Voyage tank prints', brief.voyageHistory, full.voyageHistory],
          ['tankSummaryHistory', 'Tank summary reports', brief.tankSummaryHistory, full.tankSummaryHistory],
          ['bunkerPlans', 'Bunker plans', brief.bunkerPlans, full.bunkerHistory && full.bunkerHistory.plans],
          ['bunkerAfter', 'Bunker delivery reports', brief.bunkerAfter, full.bunkerHistory && full.bunkerHistory.after],
          ['bunkerSummaries', 'Bunker summaries', brief.bunkerSummaries, full.bunkerHistory && full.bunkerHistory.summaries],
        ];
      }

      function compareReportSides(localPayload, serverPayload, vesselName) {
        const localGroups = reportGroups(localPayload);
        const serverGroups = reportGroups(serverPayload);
        const rows = [];
        localGroups.forEach((group, index) => {
          const serverGroup = serverGroups[index];
          const localBrief = new Map((group[2] || []).map((item) => [item.id, item]));
          const serverBrief = new Map((serverGroup[2] || []).map((item) => [item.id, item]));
          const ids = new Set([...localBrief.keys(), ...serverBrief.keys()]);
          if (!ids.size) return;
          let onlyLocal = 0;
          let onlyServer = 0;
          let newerLocal = 0;
          let newerServer = 0;
          ids.forEach((id) => {
            const advice = adviseReport(localBrief.get(id), serverBrief.get(id));
            if (advice.action === 'push' && !serverBrief.get(id)) onlyLocal += 1;
            else if (advice.action === 'pull' && !localBrief.get(id)) onlyServer += 1;
            else if (advice.action === 'push') newerLocal += 1;
            else if (advice.action === 'pull') newerServer += 1;
          });
          const differ = onlyLocal + onlyServer + newerLocal + newerServer;
          const bits = [];
          if (onlyLocal) bits.push(`${onlyLocal} only on this device`);
          if (onlyServer) bits.push(`${onlyServer} only on the server`);
          if (newerLocal) bits.push(`${newerLocal} newer on this device`);
          if (newerServer) bits.push(`${newerServer} newer on the server`);
          rows.push({
            kind: 'tank-reports',
            groupKey: group[0],
            action: differ ? 'merge' : 'same',
            reason: differ ? bits.join(' · ') : 'Already the same',
            checked: !!differ,
            title: `${vesselName} · ${group[1]}`,
            localText: `${localBrief.size} saved`,
            serverText: `${serverBrief.size} saved`,
            vesselId: (localPayload && localPayload.vesselId) || (serverPayload && serverPayload.vesselId),
          });
        });
        return rows;
      }

      async function readTankReportBundle(via, vesselId) {
        const path = '/api/vessels/' + encodeURIComponent(vesselId) + '/saved-reports';
        if (via === 'local') return tankRequest(path);
        return gatewayTankApi(path);
      }

      async function listTankVesselIds(via) {
        const data = via === 'local' ? await tankRequest('/api/vessels') : await gatewayTankApi('/api/vessels');
        return ((data && data.vessels) || []).filter((v) => v && v.id);
      }

      root.querySelector('#bk-check-tanks').onclick = async () => {
        try {
          await withProgress('Comparing saved tank reports…', 'Reading this device…', async () => {
            const peerUrl = (root.querySelector('#bk-sync-url')?.value || '').trim();
            const peerToken = (root.querySelector('#bk-sync-token')?.value || '').trim();
            if (!usingLocalTank()) {
              if (!peerUrl) {
                if (tankTransport() === 'local' && !canUseLocalTank()) {
                  throw new Error('On this device is not available in this window, so there is no separate tank copy to compare. Set a peer URL to compare with another computer. On the phone, choose On this device first.');
                }
                throw new Error('This screen is already using the server database, so there is no separate copy to compare. Switch Database on this device to “On this device”, or set a peer URL to compare with another computer.');
              }
              progressSet(20, 'Reading saved reports on the peer…');
              const compared = await gatewayTankApi('/api/sync/saved-reports/compare', {
                method: 'POST',
                body: JSON.stringify({ syncUrl: peerUrl, syncApiToken: peerToken }),
              });
              const rows = [];
              for (const vessel of compared.rows || []) {
                if (!vessel.onDevice || !vessel.onPeer) {
                  rows.push({
                    kind: 'tank-peer-vessel',
                    vesselId: vessel.vesselId,
                    action: 'same',
                    reason: vessel.onDevice
                      ? 'Only on this device — not created on the peer by this check'
                      : 'Only on the peer — not created here by this check',
                    checked: false,
                    title: vessel.name || vessel.vesselId,
                    localText: vessel.onDevice ? 'vessel' : '—',
                    serverText: vessel.onPeer ? 'vessel' : '—',
                  });
                  continue;
                }
                for (const group of vessel.groups || []) {
                  if (!group.localCount && !group.peerCount) continue;
                  const bits = [];
                  if (group.onlyHere) bits.push(`${group.onlyHere} only on this device`);
                  if (group.onlyPeer) bits.push(`${group.onlyPeer} only on the peer`);
                  if (group.newerHere) bits.push(`${group.newerHere} newer on this device`);
                  if (group.newerPeer) bits.push(`${group.newerPeer} newer on the peer`);
                  rows.push({
                    kind: 'tank-peer',
                    vesselId: vessel.vesselId,
                    action: group.differ ? 'merge' : 'same',
                    reason: group.differ ? bits.join(' · ') : 'Already the same',
                    checked: !!group.differ,
                    title: `${vessel.name || vessel.vesselId} · ${group.title}`,
                    localText: `${group.localCount} saved`,
                    serverText: `${group.peerCount} saved`,
                  });
                }
              }
              const differ = rows.filter((row) => row.checked).length;
              renderConsistency({
                kind: 'tank-peer',
                peerUrl,
                peerToken,
                rows,
                summary: differ ? `${differ} report group${differ === 1 ? '' : 's'} differ` : 'reports match',
                status: differ
                  ? `${differ} saved-report group${differ === 1 ? '' : 's'} differ from the peer. Updating keeps every report and the newer copy of a shared one.`
                  : 'Saved tank reports match the peer.',
              });
              return differ ? `${differ} report groups differ` : 'Saved tank reports match';
            }

            progressSet(15, 'Listing vessels on this device and the server…');
            const [localVessels, serverVessels] = await Promise.all([
              listTankVesselIds('local'),
              listTankVesselIds('server'),
            ]);
            const byId = new Map();
            for (const vessel of localVessels) byId.set(vessel.id, { local: vessel });
            for (const vessel of serverVessels) {
              const slot = byId.get(vessel.id) || {};
              slot.server = vessel;
              byId.set(vessel.id, slot);
            }
            let ids = [...byId.keys()];

            /* The ship in the switcher, not the whole fleet.
            
               This walked every vessel on both sides, and a vessel present on
               only one of them produced a row naming just the ship -- so with
               fleets that do not line up the screen filled with vessel names
               and showed no reports at all. The engineer asked for the saved
               reports of the ship he is working on.
            
               Matched by hull, the same way the rest of the suite matches:
               the tank id is the tank database's own key and need not be the
               shell's. Where the active ship cannot be found on either side
               the full fleet is still compared, because showing nothing at all
               would be worse than showing more than was asked for -- and the
               status line says which of the two happened. */
            const activeVessel = (window.ChengPro && ChengPro.vessel && ChengPro.vessel.getActive()) || null;
            const VK = window.ChengVesselKey;
            let scopedTo = null;
            if (activeVessel) {
              const sameHull = (v) => (VK && VK.sameVessel
                ? VK.sameVessel({ name: v.name, imo: v.imo }, { name: activeVessel.name, imo: activeVessel.imo })
                : String(v.name || '').trim().toUpperCase() === String(activeVessel.name || '').trim().toUpperCase());
              const hit = ids.find((id) => {
                const slot = byId.get(id);
                return (slot.local && sameHull(slot.local)) || (slot.server && sameHull(slot.server));
              });
              if (hit) {
                ids = [hit];
                scopedTo = activeVessel.name || hit;
              }
            }
            const rows = [];
            for (let i = 0; i < ids.length; i++) {
              const id = ids[i];
              const slot = byId.get(id);
              const name = (slot.local && slot.local.name) || (slot.server && slot.server.name) || id;
              progressSet(20 + Math.round(70 * (i / Math.max(ids.length, 1))), `Reading reports for ${name}…`);
              if (!slot.local || !slot.server) {
                rows.push({
                  kind: 'tank-reports',
                  vesselId: id,
                  action: 'same',
                  reason: slot.local
                    ? 'Only on this device — this check does not create the ship on the server'
                    : 'Only on the server — this check does not create the ship on this device',
                  checked: false,
                  title: name,
                  localText: slot.local ? 'vessel' : '—',
                  serverText: slot.server ? 'vessel' : '—',
                });
                continue;
              }
              const [localBundle, serverBundle] = await Promise.all([
                readTankReportBundle('local', id),
                readTankReportBundle('server', id),
              ]);
              rows.push(...compareReportSides(localBundle, serverBundle, name));
            }
            const differ = rows.filter((row) => row.checked).length;
            /* Say which ship this covers. Without it the engineer cannot tell
               a clean result for his own ship from a clean result for a fleet
               that happens not to include it. */
            const scope = scopedTo
              ? `${scopedTo}`
              : (activeVessel
                ? `every vessel on this device and the server — ${activeVessel.name || 'the active vessel'} was not found on either side`
                : 'every vessel on this device and the server — no active vessel is selected');
            renderConsistency({
              kind: 'tank-local',
              bundles: null,
              rows,
              summary: differ ? `${differ} report group${differ === 1 ? '' : 's'} differ` : 'reports match',
              status: (differ
                ? `${differ} saved-report group${differ === 1 ? '' : 's'} differ. Updating copies the missing reports both ways and keeps the newer copy when both have the same report.`
                : 'Saved tank reports on this device match the server.')
                + ` Checked: ${scope}.`,
            });
            return (differ ? `${differ} report groups differ` : 'Saved tank reports match')
              + (scopedTo ? ` — ${scopedTo}` : '');
          });
        } catch (e) {
          setConsistency(e.message || 'Tank report check failed');
          toast(e.message || 'Tank report check failed');
        }
      };

      root.querySelector('#bk-consistency-apply').onclick = async () => {
        const picked = selectedConsistencyRows();
        if (!picked.length || !consistencyPlan) {
          toast('Check the database first');
          return;
        }
        const noun = consistencyPlan.kind === 'voyage'
          ? `${picked.length} voyage leg${picked.length === 1 ? '' : 's'}`
          : `${picked.length} saved-report group${picked.length === 1 ? '' : 's'}`;
        if (!confirm(`Update ${noun} to the newest of both sides?\n\nRecords that exist on only one side are copied across. Where both sides have the same record, the newer copy is kept. Nothing is deleted.`)) return;
        try {
          await withProgress('Updating to the newest copy…', 'Starting…', async () => {
            if (consistencyPlan.kind === 'voyage') {
              const settings = consistencyPlan.settings || readVoyageSyncForm(root);
              watchVoyage(8, 96);
              const msg = await voyagePost('reconcile-legs', {
                vessel: consistencyPlan.vessel,
                settings,
                openLatest: true,
                legs: picked.map((row) => ({ voyage: row.voyage, condition: row.condition })),
              }, root, 600000);
              reloadOpenVoyageFrame();
              const sounded = await loadLatestSounding([consistencyPlan.vessel], false);
              const soundNote = sounded[0] && sounded[0].loaded
                ? ` Latest sounding report loaded${sounded[0].voyageNo ? ' (voyage ' + sounded[0].voyageNo + ')' : ''}.`
                : '';
              const line = (msg.message || 'Voyage legs updated.') + soundNote;
              setConsistency(line);
              setConsistencySummary('updated');
              toast(line);
              return line;
            }
            if (consistencyPlan.kind === 'tank-peer') {
              progressSet(30, 'Merging saved reports with the peer…');
              const vesselIds = [...new Set(picked.map((row) => row.vesselId).filter(Boolean))];
              const result = await gatewayTankApi('/api/sync/saved-reports/merge', {
                method: 'POST',
                body: JSON.stringify({
                  syncUrl: consistencyPlan.peerUrl,
                  syncApiToken: consistencyPlan.peerToken,
                  vesselIds,
                }),
              });
              const notes = (result.results || []).map((row) => row.peerNote).filter(Boolean);
              const sounded = await loadLatestSounding(vesselIds, false);
              const line = `Saved reports merged for ${vesselIds.length} vessel${vesselIds.length === 1 ? '' : 's'}.${notes.length ? ' ' + notes[0] : ''}${sounded.length ? ' Latest sounding report loaded.' : ''}`;
              setConsistency(line);
              setConsistencySummary('updated');
              toast('Saved reports merged');
              return line;
            }
            const vesselIds = [...new Set(picked.map((row) => row.vesselId).filter(Boolean))];
            for (let i = 0; i < vesselIds.length; i++) {
              const id = vesselIds[i];
              progressSet(Math.round(90 * (i / Math.max(vesselIds.length, 1))), `Merging reports for ${id}…`);
              const [localBundle, serverBundle] = await Promise.all([
                readTankReportBundle('local', id),
                readTankReportBundle('server', id),
              ]);
              const path = '/api/vessels/' + encodeURIComponent(id) + '/saved-reports/merge';
              await tankRequest(path, { method: 'POST', body: JSON.stringify(serverBundle) });
              await gatewayTankApi(path, { method: 'POST', body: JSON.stringify(localBundle) });
            }
            const sounded = await loadLatestSounding(vesselIds, true);
            const line = `Saved reports merged for ${vesselIds.length} vessel${vesselIds.length === 1 ? '' : 's'}.${sounded.length ? ' Latest sounding report and tank readings loaded.' : ''}`;
            setConsistency(line);
            setConsistencySummary('updated');
            toast('Saved reports merged');
            return line;
          });
          if (consistencyApply) consistencyApply.disabled = true;
        } catch (e) {
          setConsistency(e.message || 'Update failed');
          toast(e.message || 'Update failed');
        }
      };

      /* ---------- Server vessel library + sync settings ---------- */
      const libStatus = root.querySelector('#bk-lib-status');
      const libList = root.querySelector('#bk-lib-list');
      const syncStatus = root.querySelector('#bk-sync-status');
      const setLib = (t) => { if (libStatus) libStatus.textContent = t; };

      /* Pulling a ship's legs or adopting a vessel means several round trips to
         two servers. A status line that says "Asking the server…" and then sits
         there is indistinguishable from a hang, so the panel wears a sweep
         while it works — see .is-working in css/hud-effects.css. */
      const libPanel = libList && libList.closest ? libList.closest('.form-panel') : null;
      const working = (on) => { if (libPanel) libPanel.classList.toggle('is-working', !!on); };
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
          /* Do not attach license scope headers — the catalog is server-wide and
           * entitlement mismatches returned 401 / an empty list. */
          const res = await fetch('/tanks/api/vessel-library', {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
          });
          const raw = await res.text();
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
          if (!res.ok) {
            throw new Error((data && data.error) || res.statusText || 'Request failed');
          }
          let vessels = (data && data.vessels) || [];
          /* Also fold in this licensee's shell vessels (data/users/<email>/…).
             Covers scoped saves that the catalog already lists, and fills gaps
             when the server index and library scan disagree. */
          const mine = licensedEmail();
          if (mine) {
            try {
              const shell = await ChengProApi.api('/api/shell/vessels');
              const slug = (window.ChengVesselKey && ChengVesselKey.emailSlug)
                ? ChengVesselKey.emailSlug(mine)
                : mine.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
              const seen = new Set(vessels.map((v) => `${v.ownerSlug || ''}::${v.vesselId}`));
              for (const v of (shell && shell.vessels) || []) {
                const key = `${slug}::${v.id}`;
                if (seen.has(key)) continue;
                vessels.push({
                  ownerSlug: slug,
                  vesselId: v.id,
                  name: v.name || '',
                  imo: v.imo || '',
                  flag: v.flag || '',
                  updatedAt: v.updatedAt || null,
                });
                seen.add(key);
              }
            } catch (shellErr) {
              console.warn('Shell vessel merge for library:', shellErr);
            }
          }
          return { vessels, error: null };
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

      /* Did the signed-in licensee upload this record?
         The Tank server names owners by the folder slug it writes under
         (data/users/ce-example-com/), Voyage Chief by the account's email
         address. Compare both spellings so one ship does not read as two
         different people's. */
      function ownedByLicensee(entry, mine) {
        const VK = window.ChengVesselKey;
        const who = String((entry && (entry.ownerEmail || entry.ownerSlug)) || '').trim().toLowerCase();
        if (!who || !mine) return false;
        if (who === mine) return true;
        return !!VK && (who === VK.emailSlug(mine) || VK.emailSlug(who) === VK.emailSlug(mine));
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
          if (voyage.error) notes.push(`Voyage Chief list unavailable — sign in under Voyage Chief server in step 1 (${esc(voyage.error)})`);

          if (!rows.length) {
            libList.innerHTML = `<p class="hint">No vessels on the server yet.</p>${
              notes.length ? `<p class="hint">${notes.join('<br>')}</p>` : ''}`;
            setLib(notes.length ? notes.join(' · ').replace(/<[^>]+>/g, '') : 'No vessels found.');
            return;
          }

          const mine = licensedEmail();
          libList.innerHTML = `${notes.length ? `<p class="hint">${notes.join('<br>')}</p>` : ''}
          <div style="overflow:auto"><table class="data-table" style="width:100%;font-size:13px">
            <thead><tr><th>Vessel</th><th>IMO</th><th>Data in</th><th>Uploaded by</th><th></th></tr></thead>
            <tbody>${rows.map((row, rowIndex) => {
              const tankSrc = row.sources.find((x) => x.source === 'tank');
              const voySrc = row.sources.find((x) => x.source === 'voyage');
              const isMine = row.sources.some((x) => ownedByLicensee(x, mine));
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
                <td class="backup-lib-actions"><button type="button" class="btn" data-lib-adopt="${rowIndex}">Add to my list</button>${tankSrc
                  ? `<button type="button" class="btn" data-lib-import="${esc(tankSrc.vesselId)}" data-lib-owner="${esc(tankSrc.ownerSlug || '')}" style="margin-left:6px">Import particulars + latest leg</button>`
                  : ''}${voySrc
                  ? `<label class="hint" style="display:inline-flex;gap:4px;align-items:center;margin-left:6px">
                       <select data-voy-mode="${esc(voySrc.vesselId)}">
                         <option value="latest">Latest leg</option>
                         <option value="all">All legs</option>
                       </select>
                       <button type="button" class="btn" data-voy-pull="${esc(voySrc.vesselId)}">Pull voyage</button>
                     </label>`
                  : ''}</td>
              </tr>`;
            }).join('')}</tbody></table></div>`;
          /* Pull one ship's voyage data: the latest leg, or every leg.
           *
           * Orchestrated here from the two bridge actions Voyage Chief already
           * has — list-remote to see what is on the server, pull-voyage-leg to
           * bring one down — rather than adding a bulk path inside a
           * twenty-three-thousand-line file for the sake of a loop. Each leg
           * goes through the same tested merge as a manual pull.
           *
           * Pulling a leg makes it the active one in Voyage Chief, so after
           * "All legs" the ship is left on whichever leg came last. The status
           * line says so rather than leaving him to notice. */
          libList.querySelectorAll('[data-voy-pull]').forEach((btn) => {
            btn.onclick = async () => {
              const vesselId = btn.getAttribute('data-voy-pull');
              const modeEl = libList.querySelector(`[data-voy-mode="${CSS.escape(vesselId)}"]`);
              const mode = (modeEl && modeEl.value) || 'latest';
              /* Voyage Chief's own sync config is what pull-voyage-leg reads,
                 and in a fresh profile it is empty — the frame answers "Enter a
                 Sync Server URL first" however good the row is. So push the
                 Voyage server form down first, exactly as the panel's own List /
                 Pull buttons do, and say plainly when that form is blank. */
              const voySettings = readVoyageSyncForm(root);
              if (!voySettings.serverUrl) {
                setLib('Set the Voyage Chief sync server URL in step 1 above, then pull.');
                toast('Voyage sync server not set');
                return;
              }

              setLib(`Asking the server which voyages ${vesselId} has…`);
              working(true);
              try {
                /* Point the frame at this row's ship, not at whatever slug the
                   Voyage server form happens to hold — with that form folded
                   away once it is configured, it is usually the last ship
                   pulled, not the one whose row was clicked. */
                await voyagePost('save-sync-settings', {
                  settings: { ...voySettings, vesselId },
                }, root);
                const listed = await voyagePost('list-remote', {
                  vessel: vesselId,
                  settings: { ...voySettings, vesselId },
                }, root);
                const voyages = (listed && listed.voyages) || [];
                if (!voyages.length) {
                  setLib(listed.message || `No remote voyages for ${vesselId}.`);
                  return;
                }

                /* Every (voyage, condition) pair the server holds, newest last
                   so "latest" is the tail and "all" replays in order. */
                const legs = [];
                for (const v of voyages) {
                  /* The server answers with conditions as an array of leg
                     records; older builds keyed them by condition name. Read
                     both, so a suite talking to either one still lists legs
                     rather than pulling voyages called "0" and "1". */
                  const conds = Array.isArray(v.conditions)
                    ? v.conditions
                    : Object.entries(v.conditions || {}).map(([condition, meta]) => ({
                      condition,
                      ...(meta && typeof meta === 'object' ? meta : {}),
                    }));
                  for (const meta of conds) {
                    const condition = String((meta && meta.condition) || '').trim();
                    if (!condition) continue;
                    legs.push({
                      voyage: (meta && meta.voyageNumber) || v.voyageNumber,
                      condition,
                      updatedAt: (meta && (meta.updatedAt || meta.serverUpdatedAt || meta.savedAt)) || '',
                    });
                  }
                }
                legs.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt))
                  || String(a.voyage).localeCompare(String(b.voyage), undefined, { numeric: true }));

                const wanted = mode === 'all' ? legs : legs.slice(-1);
                if (!wanted.length) { setLib(`No legs to pull for ${vesselId}.`); return; }
                if (mode === 'all' && wanted.length > 1
                  && !confirm(`Pull all ${wanted.length} legs for ${vesselId}?\n\nEach is merged into this device. Voyage Chief will be left on the last one pulled.`)) {
                  setLib('Pull cancelled.');
                  return;
                }

                let done = 0;
                const failed = [];
                for (const leg of wanted) {
                  setLib(`Pulling ${vesselId} voyage ${leg.voyage} ${leg.condition} (${done + 1} of ${wanted.length})…`);
                  try {
                    await voyagePost('pull-voyage-leg', {
                      vessel: vesselId,
                      voyage: leg.voyage,
                      condition: leg.condition,
                    }, root);
                    done += 1;
                  } catch (legErr) {
                    failed.push(`${leg.voyage} ${leg.condition}: ${legErr.message || 'failed'}`);
                  }
                }

                try { await ChengPro.vessel.refresh(); } catch (_) { /* ignore */ }
                /* Prefer the shell vessel that matches the row we just pulled so
                   opening Voyage Chief does not snap back to a different hull
                   and hide the new leg. */
                try {
                  const list = await ChengPro.vessel.list();
                  const want = String(vesselId || '').trim().toLowerCase();
                  const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                  const wantFold = fold(want);
                  const match = (list || []).find((v) => {
                    const keys = [v.id, v.slug, v.voyageSlug, v.name].map((x) => String(x || '').toLowerCase());
                    if (keys.includes(want)) return true;
                    return keys.map(fold).includes(wantFold);
                  });
                  if (match && match.id) await ChengPro.vessel.setActive(match.id);
                } catch (_) { /* shell may have no matching tank/AIO vessel yet */ }
                const last = wanted[wanted.length - 1];
                const tail = done ? ` Voyage Chief is now on ${last.voyage} ${last.condition}.` : '';
                const msg = failed.length
                  ? `Pulled ${done} of ${wanted.length} leg(s) for ${vesselId} — ${failed.join('; ')}.${tail}`
                  : `Pulled ${done} leg(s) for ${vesselId}.${tail}`;
                setLib(msg);
                toast(failed.length ? 'Pulled with errors — see status' : `Pulled ${done} leg(s)`);
              } catch (e) {
                setLib(e.message || 'Voyage pull failed');
                toast(e.message || 'Voyage pull failed');
              } finally {
                working(false);
              }
            };
          });

          libList.querySelectorAll('[data-lib-import]').forEach((btn) => {
            btn.onclick = async () => {
              const vesselId = btn.getAttribute('data-lib-import');
              const ownerSlug = btn.getAttribute('data-lib-owner') || null;
              if (!confirm(`Import ship particulars for ${vesselId} into your account (server + this device)? Latest voyage leg will be copied when available.`)) return;
              setLib('Importing…');
              working(true);
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
              } finally {
                working(false);
              }
            };
          });
          /* "Add to my list" — put someone else's ship into this engineer's
           * own database folder, in both programs at once.
           *
           * A vessel on a shared server belongs to whoever uploaded it: Tank
           * Chief keeps its particulars under data/users/<his-email>/, Voyage
           * Chief under the account that registered it. A relief engineer
           * joining that ship sees it in the list but cannot work on it,
           * because none of it is his.
           *
           * This copies the ship's identity — particulars into his Tank
           * account, a fleet entry into his Voyage Chief — and stops there.
           * Soundings and voyage legs are deliberately left to the two pull
           * controls beside it, so adding a ship to the list never quietly
           * drags another crew's readings onto this device.
           *
           * Every step is reported on its own line, including the ones that
           * were already done, because "added" with half of it silently
           * skipped is how an engineer ends up printing from a vessel record
           * he does not actually have.
           */
          libList.querySelectorAll('[data-lib-adopt]').forEach((btn) => {
            btn.onclick = async () => {
              const row = rows[Number(btn.getAttribute('data-lib-adopt'))];
              if (!row) return;
              const VKa = window.ChengVesselKey;
              const tankSrc = row.sources.find((x) => x.source === 'tank');
              const voySrc = row.sources.find((x) => x.source === 'voyage');
              const label = row.name
                || (tankSrc && tankSrc.vesselId)
                || (voySrc && voySrc.vesselId)
                || 'this vessel';
              if (!confirm(`Add ${label} to your own vessel list in Tank Chief and Voyage Chief?\n\n`
                + 'Ship particulars are copied into your account. Tank readings and voyage '
                + 'legs are not — use the pull buttons beside this one for those.')) return;

              setLib(`Adding ${label} to your list…`);
              working(true);
              try {
              const notes = [];

              /* Tank Chief.
               *
               * The only question worth asking is "is this hull already in the
               * list this device writes to?", and it is asked of the list
               * itself. The library's owner column cannot answer it: an
               * install with no license scope keeps every ship in the shared
               * root database, where the engineer's own vessels carry the same
               * empty owner as everyone else's — so trusting that label
               * imports a ship into the database it came from, and the second
               * click leaves him choosing between "Relief Test" and
               * "Relief Test 2" on a sounding sheet.
               *
               * When the list cannot be read, nothing is written. A duplicate
               * hull is worse than a button that says it did nothing.
               */
              let ownVessels = null;
              try {
                const res = await serverTankApi('/api/vessels');
                ownVessels = Array.isArray(res) ? res : (res && res.vessels) || [];
              } catch (e) {
                notes.push(`Tank Chief — could not read your vessel list (${e.message || 'failed'}); nothing changed.`);
              }
              if (ownVessels) {
                const already = ownVessels.find((v) => (VKa
                  ? VKa.sameVessel({ name: v.name, imo: v.imo }, { name: row.name, imo: row.imo })
                  : String(v.name || '').trim().toUpperCase() === String(row.name || '').trim().toUpperCase()));
                try {
                  if (already) {
                    notes.push('Tank Chief — already on your list.');
                  } else if (tankSrc) {
                    const res = await serverTankApi('/api/vessel-library/import', {
                      method: 'POST',
                      body: JSON.stringify({ ownerSlug: tankSrc.ownerSlug || null, vesselId: tankSrc.vesselId }),
                    });
                    if (usingLocalTank() && res && res.vessel) {
                      try {
                        await tankRequest('/api/vessels', { method: 'POST', body: JSON.stringify(res.vessel) });
                      } catch (localErr) {
                        console.warn('Local vessel mirror:', localErr);
                      }
                    }
                    notes.push('Tank Chief — particulars copied into your account.');
                  } else {
                    /* Voyage-only ship: no Tank record anywhere to copy from,
                       so open one and let him fill in the tank tables. */
                    const created = await serverTankApi('/api/vessels', {
                      method: 'POST',
                      body: JSON.stringify({ name: row.name || label, imo: row.imo || '' }),
                    });
                    if (usingLocalTank() && created) {
                      try {
                        await tankRequest('/api/vessels', { method: 'POST', body: JSON.stringify(created) });
                      } catch (localErr) {
                        console.warn('Local vessel mirror:', localErr);
                      }
                    }
                    notes.push('Tank Chief — vessel created on your list (tank tables still to fill in).');
                  }
                } catch (e) {
                  notes.push(`Tank Chief — ${e.message || 'failed'}`);
                }
              }

              /* Voyage Chief, this device's fleet list. An empty stores block
                 is a vessel export with no records in it: importVesselExport
                 creates the ship and its setup row and writes nothing else. */
              try {
                const voyRes = await voyagePost('import-vessel', {
                  payload: {
                    format: 'noon-report-vessel-v1',
                    vessel: {
                      name: row.name || label,
                      /* Match the server's own id where there is one, so a
                         later push lands on the same folder. */
                      slug: (voySrc && voySrc.vesselId) || undefined,
                      imo: row.imo || '',
                    },
                    setup: { vesselName: row.name || label, imoNo: row.imo || '' },
                    stores: {},
                  },
                  mode: 'merge',
                }, root);
                /* The module matches on hull, so it can tell us whether this
                   was already the engineer's ship. Saying "added" either way
                   is what let a duplicate pass unnoticed. */
                notes.push(voyRes && voyRes.matched
                  ? `Voyage Chief — already on this device's list, and now the active ship.`
                  : `Voyage Chief — added to this device's vessel list, and now the active ship.`);
              } catch (e) {
                notes.push(`Voyage Chief — ${e.message || 'failed'}`);
              }

              /* A ship nobody has registered yet is one this engineer holds the
                 only records for, and the sync server has an endpoint for
                 exactly that case. It needs an IMO, because the register is
                 keyed by hull, not by name. */
              if (!voySrc) {
                if (!row.imo) {
                  notes.push('Voyage Chief server — not registered: the fleet register needs an IMO number.');
                } else {
                  try {
                    await ChengProApi.api('/api/vessels/import', {
                      method: 'POST',
                      body: JSON.stringify({ vesselName: row.name || label, imo: row.imo }),
                    });
                    notes.push('Voyage Chief server — registered under your account.');
                  } catch (e) {
                    /* The sync server explains itself in `message` and puts a
                       machine code in `error`; "already_registered" on its own
                       tells the engineer nothing. */
                    const why = (e && e.data && e.data.message) || (e && e.message) || 'failed';
                    notes.push(`Voyage Chief server — not registered (${why}).`);
                  }
                }
              }

              try { await ChengPro.vessel.refresh(); } catch (_) { /* ignore */ }
              /* Redraw first, then report: refreshVesselLibrary ends by writing
                 its own count into the status line, so saying what happened
                 before it runs is saying it to nobody. */
              await refreshVesselLibrary();
              setLib(`${label}: ${notes.join(' ')}`);
              toast(`${label} added to your list`);
              } finally {
                /* A sweep that never stops looks like a hung program. Every
                   step below has its own catch, but the one that does not is
                   the one that would leave it running. */
                working(false);
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
          markServerBlock('bk-tank-server', 'bk-sync-summary', urlEl && urlEl.value);
          setSync('Loaded from ' + tankSourceLabel() + '.');
        } catch (e) {
          setSync(e.message || 'Could not load sync settings');
        }
      }
      loadSyncSettings();

      /* Saving a peer URL is the moment the engineer means "connect me".
       *
       * Rather than leave him to press Test, then Pull, then Refresh list, the
       * save runs the whole arrival: prove the peer answers, bring the tank
       * database down, then repaint the vessel library and the header's vessel
       * list so his ships are simply there.
       *
       * The pull is safe to do without asking because applySyncPayload merges
       * by revision — a remote vessel only lands when its revision is at least
       * the local one, so work done on this device since the last sync is not
       * thrown away. Each step reports separately: a peer that does not answer
       * stops the sequence with the settings still saved, rather than looking
       * like the save failed. */
      root.querySelector('#bk-sync-save')?.addEventListener('click', async () => {
        const syncUrl = root.querySelector('#bk-sync-url').value.trim();
        const syncApiToken = root.querySelector('#bk-sync-token').value.trim();

        try {
          await tankRequest('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ syncUrl, syncApiToken, syncEnabled: true }),
          });
          const tr = root.querySelector('#bk-api-transport').value;
          if (tr === 'local' || tr === 'server') {
            try { localStorage.setItem(TRANSPORT_KEY, tr); } catch (_) { /* ignore */ }
          }
        } catch (e) {
          setSync(e.message || 'Save failed');
          toast(e.message || 'Save failed');
          return;
        }

        if (!syncUrl) {
          setSync('Sync settings saved. Enter a peer URL to pull vessels automatically.');
          toast('Sync settings saved');
          await refreshVesselLibrary();
          return;
        }

        setSync('Saved. Checking the peer…');
        try {
          await tankRequest('/api/sync/probe', {
            method: 'POST',
            body: JSON.stringify({ syncUrl, syncApiToken }),
          });
        } catch (e) {
          setSync(`Saved, but the peer did not answer: ${e.message || 'unreachable'}. Vessels will appear once it does.`);
          toast('Saved — peer unreachable');
          await refreshVesselLibrary();
          return;
        }

        setSync('Peer reachable. Downloading the tank database…');
        let pulled = '';
        try {
          const res = await tankRequest('/api/sync/pull', {
            method: 'POST',
            body: JSON.stringify({ syncUrl, syncApiToken }),
          });
          pulled = res && (res.message || (res.remoteCount != null ? `${res.remoteCount} vessel(s) from the peer` : ''));
          if (res && res.warning) pulled = res.warning;
        } catch (e) {
          setSync(`Saved and peer reachable, but the tank pull failed: ${e.message || 'unknown error'}`);
          toast('Tank pull failed');
          await refreshVesselLibrary();
          return;
        }

        try { await ChengPro.vessel.refresh(); } catch (_) { /* ignore */ }
        await refreshVesselLibrary();
        const done = `Connected. ${pulled || 'Tank database up to date'}.`;
        setSync(done);
        toast('Connected — vessel list updated');
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

      /* Paint mirrored credentials immediately so a closed/reopened AIO still
       * shows the last saved Voyage sync URL before the bridge iframe answers. */
      {
        const mirrored = readMirroredVoyageSync();
        if (mirrored && (mirrored.serverUrl || mirrored.apiToken || mirrored.vesselId)) {
          fillVoyageSyncForm(root, mirrored);
          markServerBlock('bk-voyage-server', 'bk-voy-sync-summary', mirrored.serverUrl);
        }
      }

      (async () => {
        try {
          const msg = await voyagePost('get-sync-settings', {}, root);
          const settings = msg.settings || {};
          const mirrored = readMirroredVoyageSync() || {};
          fillVoyageSyncForm(root, {
            serverUrl: settings.serverUrl || mirrored.serverUrl || '',
            apiToken: settings.apiToken || mirrored.apiToken || '',
            vesselId: settings.vesselId || mirrored.vesselId || '',
            deviceName: settings.deviceName || mirrored.deviceName || '',
            conflictPolicy: settings.conflictPolicy || mirrored.conflictPolicy || 'merge',
          });
          if (settings.serverUrl || settings.apiToken) {
            mirrorVoyageSyncToLocalStorage({
              serverUrl: settings.serverUrl || '',
              apiToken: (settings.apiToken && settings.apiToken.indexOf('•') < 0) ? settings.apiToken : (mirrored.apiToken || ''),
              vesselId: settings.vesselId || '',
              deviceName: settings.deviceName || '',
              conflictPolicy: settings.conflictPolicy || 'merge',
            });
          }
          markServerBlock('bk-voyage-server', 'bk-voy-sync-summary', (settings.serverUrl || mirrored.serverUrl));
          const s = settings;
          const parts = [];
          if (s.lastSyncedAt) parts.push('Last sync: ' + new Date(s.lastSyncedAt).toLocaleString());
          else parts.push('Last sync: never');
          if (s.lastSyncError) parts.push('Error: ' + s.lastSyncError);
          setVoySync(parts.join(' · '));
        } catch (e) {
          const mirrored = readMirroredVoyageSync();
          if (mirrored && mirrored.serverUrl) {
            fillVoyageSyncForm(root, mirrored);
            markServerBlock('bk-voyage-server', 'bk-voy-sync-summary', mirrored.serverUrl);
            setVoySync('Using last saved sync URL (Voyage bridge still loading).');
          } else {
            setVoySync(e.message || 'Could not load Voyage sync settings');
          }
        }
      })();

      root.querySelector('#bk-voy-sync-save')?.addEventListener('click', async () => {
        setVoySync('Saving Voyage sync settings…');
        try {
          const formSettings = readVoyageSyncForm(root);
          mirrorVoyageSyncToLocalStorage(formSettings);
          const msg = await voyagePost('save-sync-settings', { settings: formSettings }, root);
          markServerBlock('bk-voyage-server', 'bk-voy-sync-summary', formSettings.serverUrl);
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
        const settings = readVoyageSyncForm(root);
        if (!settings.serverUrl) {
          setVoySync('Set the Voyage Chief sync server URL, then press Keep data persistent.');
          toast('Set the sync server URL first');
          return;
        }
        const planMatches = consistencyPlan
          && consistencyPlan.kind === 'voyage'
          && (consistencyPlan.settings || {}).serverUrl === settings.serverUrl
          && String((consistencyPlan.settings || {}).vesselId || '') === String(settings.vesselId || '');
        if (!planMatches) {
          setVoySync('Comparing every voyage leg…');
          try {
            await voyagePost('save-sync-settings', { settings }, root);
            const plan = await withProgress('Comparing voyage legs…', 'Reading this device and the server…', () => refreshVoyageConsistency());
            const rows = plan.rows || [];
            const differ = rows.filter((row) => row.action !== 'same');
            const box = root.querySelector('#bk-consistency');
            if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
            if (!differ.length) {
              const opened = await voyagePost('open-latest-leg', { vessel: plan.vessel, settings }, root);
              reloadOpenVoyageFrame();
              const sounded = await loadLatestSounding([plan.vessel], false);
              const line = (opened.message || 'Voyage legs already match.')
                + (sounded[0] && sounded[0].loaded ? ' Latest sounding report loaded.' : '');
              setVoySync(line);
              setConsistency(line);
              toast(line);
              return;
            }
            const here = voyageNumbers(rows, 'local');
            const there = voyageNumbers(rows, 'server');
            const line = `This device has voyage ${here.join(', ') || 'none'}. The server has voyage ${there.join(', ') || 'none'}. Tick the legs both databases should hold, then press Keep data persistent again.`;
            setVoySync(line);
            setConsistency(line);
            toast('Select the legs, then press Keep data persistent again');
          } catch (e) {
            setVoySync(e.message || 'Compare failed');
            toast(e.message || 'Compare failed');
          }
          return;
        }
        const picked = selectedConsistencyRows();
        if (!picked.length) {
          setVoySync('No legs are ticked. Tick the ones both databases should share, then press Keep data persistent again.');
          toast('Tick at least one leg');
          return;
        }
        const lines = picked.map((row) => `• ${row.title} — ${row.reason}`).join('\n');
        if (!confirm(
          'KEEP DATA PERSISTENT\n\n'
          + 'These legs will be copied so both databases have them. Where both sides already have the leg, the newer watch is kept. Nothing is deleted.\n\n'
          + lines
          + '\n\nThe latest leg opens when this finishes. Continue?'
        )) return;
        setVoySync('Copying the selected voyage legs…');
        try {
          await withProgress('Updating voyage legs…', 'Starting…', async () => {
            watchVoyage(8, 90);
            const msg = await voyagePost('reconcile-legs', {
              vessel: consistencyPlan.vessel,
              settings,
              openLatest: true,
              legs: picked.map((row) => ({ voyage: row.voyage, condition: row.condition })),
            }, root, 600000);
            reloadOpenVoyageFrame();
            progressSet(94, 'Loading the latest sounding report…');
            const sounded = await loadLatestSounding([consistencyPlan.vessel], false);
            const line = (msg.message || 'Voyage legs updated.')
              + (sounded[0] && sounded[0].loaded ? ' Latest sounding report and tank readings loaded.' : '');
            setVoySync(line);
            setConsistency(line);
            setConsistencySummary('updated');
            toast(line);
            return line;
          });
          if (consistencyApply) consistencyApply.disabled = true;
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
          const settings = readVoyageSyncForm(root);
          await voyagePost('save-sync-settings', { settings }, root);
          const msg = await voyagePost('pull-voyage-leg', {
            voyage,
            condition,
            vessel: settings.vesselId || undefined,
          }, root);
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
