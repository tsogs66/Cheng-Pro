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

  /* The last Save & connect or Test connection line. The tank pull inside
     Save can make the page draw itself again, which used to wipe the result
     he was waiting for; the redrawn page shows it again from here. */
  let suiteReport = null;
  const SUITE_REPORT_MS = 5 * 60 * 1000;

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
  function bundledClient() {
    return !!(window.ChengProBundled && ChengProBundled.isBundledClient());
  }

  /* The packaged phone keeps the working copy on the device. A page served by
     the AIO server uses that server. A saved "Database on this device" choice
     is ignored: Update to the newest of both already takes the active vessel,
     and a pull brings the files uploaded for that same vessel. */
  function tankTransport() {
    try { if (window.CHENG_PRO_BUNDLED) return 'local'; } catch { /* ignore */ }
    if (bundledClient() && canUseLocalTank()) return 'local';
    try {
      const cap = window.Capacitor;
      if (cap && ((cap.isNativePlatform && cap.isNativePlatform())
        || (cap.getPlatform && cap.getPlatform() !== 'web'))) return 'local';
    } catch { /* ignore */ }
    if (typeof location !== 'undefined' && !/^https?:$/.test(location.protocol || '')) return 'local';
    return 'server';
  }

  /* Where "the server" is. In a browser on the ChEng AIO server it is the
     page's own host. The Android app is served from https://localhost inside
     the APK and the Windows app from its own 127.0.0.1, so a bare
     '/tanks/...' never left the device: in the APK every call came back as
     the app's index.html with a 200, and the backup reported saved reports
     as sent that never reached the server. Those apps use the Cheng Suite
     server saved here, or else the Server URL saved under License. */
  function tankServerBase() {
    if (!bundledClient()) return '';
    let base = '';
    try {
      base = localStorage.getItem(SUITE_URL_KEY) || localStorage.getItem('apiServerBase')
        || localStorage.getItem('chengAioLicenseServerUrl') || '';
    } catch { /* private mode */ }
    base = normalizeSuiteUrl(base);
    if (base) return base;
    if (window.Capacitor || !/^https?:$/.test(location.protocol)) {
      throw new Error('Set the Cheng Suite server URL in Backup & Restore first. This device has no server to send tank reports to without it.');
    }
    return '';
  }

  /* One address serves Tank Chief and Voyage Chief. Older installs saved it
     once per program, sometimes with /tanks or /api/license on the end; the
     ChEng AIO server answers both at its root. */
  const SUITE_URL_KEY = 'chengSuiteServerUrl';

  function normalizeSuiteUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '')
      .replace(/\/api\/license$/i, '').replace(/\/tanks$/i, '').replace(/\/+$/, '');
  }

  /* The two saved copies may disagree. An address that answers tank sync is
     a ChEng AIO server, which serves voyage sync as well; a standalone
     Voyage server does not serve tanks. So the Tank address wins, and its
     token goes with it. The Voyage token fills in where Tank has none. */
  function pickSuiteServer(tank, voyage) {
    const tankUrl = normalizeSuiteUrl(tank && tank.syncUrl);
    const voyUrl = normalizeSuiteUrl(voyage && voyage.serverUrl);
    const tankToken = String((tank && tank.syncApiToken) || '').trim();
    const voyToken = String((voyage && voyage.apiToken) || '').trim();
    return {
      url: tankUrl || voyUrl,
      token: tankUrl ? (tankToken || voyToken) : (voyToken || tankToken),
      otherUrl: tankUrl && voyUrl && tankUrl !== voyUrl ? voyUrl : '',
    };
  }

  /* A reply that is a web page is not tank data, whatever its status. */
  function tankJsonOrThrow(raw, contentType) {
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = undefined; }
    if (data === undefined || (raw && !/json/i.test(contentType || '') && /^\s*</.test(raw))) {
      throw new Error('The server answered with a web page, not tank data. Check the Cheng Suite server URL in Backup & Restore.');
    }
    return data;
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
      let base;
      try { base = tankServerBase(); } catch (e) { reject(e); return; }
      xhr.open('GET', base + '/tanks' + path);
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
        try { data = tankJsonOrThrow(xhr.responseText, xhr.getResponseHeader('Content-Type')); }
        catch (e) { reject(e); return; }
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
    const url = tankServerBase() + '/tanks' + path;
    const res = await fetch(url, { ...options, headers });
    const raw = await res.text();
    if (!res.ok) {
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
      throw new Error((data && (data.error || data.message)) || res.statusText || 'Request failed');
    }
    return tankJsonOrThrow(raw, res.headers.get('Content-Type'));
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

  /* Voyage Chief's half of the Cheng Suite server form. Every sync now goes
     through Database consistency, which merges by record. */
  function readVoyageSyncForm(root) {
    return {
      serverUrl: normalizeSuiteUrl(root.querySelector('#bk-suite-url')?.value),
      apiToken: (root.querySelector('#bk-suite-token')?.value || '').trim(),
      vesselId: (root.querySelector('#bk-voy-sync-vessel')?.value || '').trim(),
      deviceName: (root.querySelector('#bk-voy-sync-device')?.value || '').trim(),
      conflictPolicy: 'merge',
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
    const vessel = root.querySelector('#bk-voy-sync-vessel');
    const device = root.querySelector('#bk-voy-sync-device');
    /* Carry the active vessel's slug when the module has none stored, rather
       than leaving it blank for the engineer to guess at. A slug the module
       has already recorded wins -- that is the folder its data is in. */
    if (vessel) vessel.value = settings.vesselId || activeVesselSlug() || '';
    if (device) device.value = settings.deviceName || '';
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
    title: 'Backup & Restore',
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

          <h2 class="backup-step"><span class="backup-step-no">1</span> Connect to your server</h2>
          <p class="hint backup-step-hint">Set the address once. It serves Tank Chief and Voyage Chief together, and the vessel list in step 2 fills itself once it answers. Step 3 needs no network at all.</p>

          <details class="form-panel backup-section" id="bk-suite-server" open>
            <summary><span class="backup-section-title">Cheng Suite server</span><span class="hint backup-summary-note" id="bk-suite-summary">not set</span></summary>
            <p class="hint">One address and one token for Tank Chief and Voyage Chief. Save &amp; connect stores them for both, checks that each half answers, and brings down the tank files uploaded for the ship that is open. Everything else moves through Database consistency below.</p>
            <div class="grid-2">
              <div class="field span2"><label for="bk-suite-url">Server URL</label>
                <input id="bk-suite-url" type="url" autocomplete="url" inputmode="url" placeholder="http://192.168.1.50:8080 or https://sync.yourdomain.com"></div>
              <div class="field"><label for="bk-suite-token">API token</label>
                <input id="bk-suite-token" type="password" autocomplete="off" placeholder="SYNC_API_TOKEN of the server"></div>
              <div class="field"><label for="bk-voy-sync-vessel">Vessel ID (slug)</label>
                <input id="bk-voy-sync-vessel" autocomplete="off" placeholder="e.g. captain-veniamis"></div>
              <div class="field"><label for="bk-voy-sync-device">Device name</label>
                <input id="bk-voy-sync-device" autocomplete="off" placeholder="e.g. ER tablet / Chief PC"></div>
            </div>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-suite-save">Save &amp; connect</button>
              <button type="button" class="btn" id="bk-suite-test">Test connection</button>
            </div>
            <p class="hint" id="bk-suite-status">Loading server settings…</p>
          </details>

          <details class="form-panel backup-section" id="bk-consistency" open>
            <summary><span class="backup-section-title">Database consistency</span><span class="hint backup-summary-note" id="bk-consistency-summary">not checked</span></summary>
            <p class="hint">Compares every voyage leg, every saved tank report, and the miscellaneous data (requisitions, the consumption plan and its snapshots, the oil record book) on this device with the server. Open work in Tank Chief and Voyage Chief is saved first. Every copy between this device and the server goes through here. Nothing here deletes a leg, a report or a requisition. Where both sides have the same one, the newer copy is kept and records that exist on only one side stay.</p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-check-voyage">Check voyage legs</button>
              <button type="button" class="btn" id="bk-check-tanks">Check saved tank reports</button>
              <button type="button" class="btn" id="bk-check-misc">Check miscellaneous data</button>
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
        ['bk-suite-summary', 'bk-suite-url'],
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
            await flushTankFrames();
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
          progressSet(1, 'Saving open work in Tank Chief and Voyage Chief…');
          await flushTankFrames();
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
          await withProgress('Exporting miscellaneous data…', 'Saving open work…', async () => {
            await flushTankFrames();
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
          progressSet(1, 'Saving open work in Tank Chief and Voyage Chief…');
          await flushTankFrames();
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
            await flushTankFrames();
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
            await flushTankFrames();
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
          await withProgress('Backing up Voyage Chief…', 'Saving open work…', async () => {
            await flushTankFrames();
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
          progressSet(1, 'Saving open work in Tank Chief and Voyage Chief…');
          await flushTankFrames();
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
          await withProgress('Exporting the voyage vessel…', 'Saving open work…', async () => {
            await flushTankFrames();
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
            await flushTankFrames();
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

      /* Write the open sounding, the monitoring sheet, bunker drafts and the
         open voyage leg before a backup or a sync reads the database. Tank
         Chief and Voyage Chief answer chengaio-flush-unsaved. If that page
         is not open there is nothing in memory to write, and the wait ends. */
      function flushTankFrames() {
        const frames = [];
        document.querySelectorAll('iframe').forEach((frame) => {
          try {
            const src = frame.getAttribute('src') || '';
            if (src.indexOf('/tanks') < 0 && src.indexOf('tank') < 0 && src.indexOf('/voyage') < 0 && src.indexOf('voyage_manager') < 0) return;
            if (frame.contentWindow) frames.push(frame);
          } catch (_) { /* ignore */ }
        });
        if (!frames.length) return Promise.resolve();
        const nonce = 'flush-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        return new Promise((resolve) => {
          const pending = new Set(frames);
          const timer = setTimeout(finish, 90000);
          function finish() {
            clearTimeout(timer);
            window.removeEventListener('message', onMsg);
            resolve();
          }
          function onMsg(ev) {
            const msg = ev && ev.data;
            if (!msg || msg.type !== 'chengaio-unsaved-flushed' || msg.nonce !== nonce) return;
            pending.forEach((frame) => {
              try { if (ev.source === frame.contentWindow) pending.delete(frame); } catch (_) { /* ignore */ }
            });
            if (!pending.size) finish();
          }
          window.addEventListener('message', onMsg);
          frames.forEach((frame) => {
            try { frame.contentWindow.postMessage({ type: 'chengaio-flush-unsaved', nonce }, '*'); }
            catch (_) { pending.delete(frame); }
          });
          if (!pending.size) finish();
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
        if (!settings.serverUrl) throw new Error('Set the Cheng Suite server URL above, then check again.');
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
              reason: 'Sent with the open leg; compare it with Check miscellaneous data',
              checked: false,
              title: 'Miscellaneous vessel data',
              localText: held.join(' · '),
              serverText: 'uploaded with the open leg',
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
          await withProgress('Comparing voyage legs…', 'Writing the open voyage leg…', async () => {
            await flushTankFrames();
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

      /* Miscellaneous data has no leg of its own, so the voyage check can only
         count it. This compares it with the server's union of every leg. */
      async function refreshMiscConsistency() {
        const settings = readVoyageSyncForm(root);
        if (!settings.serverUrl) throw new Error('Set the Cheng Suite server URL above, then check again.');
        await voyagePost('save-sync-settings', { settings }, root);
        progressSet(30, 'Comparing miscellaneous data on this device and the server…');
        const compared = await voyagePost('compare-misc', {}, root, 120000);
        const rows = (compared.rows || []).map((row) => ({
          kind: 'misc',
          key: row.key,
          action: row.action,
          reason: row.reason,
          checked: row.action !== 'same',
          title: row.label,
          localText: String(row.localCount),
          serverText: String(row.remoteCount),
        }));
        const differ = rows.filter((row) => row.action !== 'same').length;
        const legs = compared.legs || 0;
        const plan = {
          kind: 'misc',
          settings,
          rows,
          summary: differ ? `${differ} miscellaneous item${differ === 1 ? '' : 's'} differ` : 'miscellaneous data matches',
          status: `Miscellaneous data compared with ${legs} leg${legs === 1 ? '' : 's'} on the server for ${compared.vesselName || compared.vessel || 'this ship'}. ${differ ? 'Update brings both sides to the newest of both.' : 'Nothing is ahead on either side.'}`,
        };
        renderConsistency(plan);
        return plan;
      }

      root.querySelector('#bk-check-misc').onclick = async () => {
        try {
          await withProgress('Comparing miscellaneous data…', 'Saving open work…', async () => {
            await flushTankFrames();
            const plan = await refreshMiscConsistency();
            const differ = (plan.rows || []).filter((row) => row.action !== 'same').length;
            return differ
              ? `${differ} miscellaneous item${differ === 1 ? '' : 's'} differ`
              : 'Miscellaneous data matches';
          });
        } catch (e) {
          setConsistency(e.message || 'Miscellaneous data check failed');
          toast(e.message || 'Miscellaneous data check failed');
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
          ['readings', 'Tank gaugings', brief.readings, null],
          ['fuelReport', 'Sounding sheet', brief.fuelReport, null],
          ['tankSummaryDraft', 'Tank summary draft', brief.tankSummaryDraft, null],
          ['bunkerPlan', 'Bunker plan draft', brief.bunkerPlan, null],
          ['bunkerAfterDraft', 'Bunker delivery draft', brief.bunkerAfterDraft, null],
          ['bunkerSummary', 'Bunker summary draft', brief.bunkerSummary, null],
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

      function tankHullSame(a, b) {
        const VK = window.ChengVesselKey;
        if (VK && typeof VK.sameVessel === 'function') return VK.sameVessel(a, b);
        const name = (v) => String((v && v.name) || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
        return !!name(a) && name(a) === name(b);
      }

      async function ensureServerTankVessel(localVessel) {
        const serverVessels = await listTankVesselIds('server');
        const hit = serverVessels.find((v) => v.id === localVessel.id || tankHullSame(v, localVessel));
        if (hit) return hit;
        const created = await gatewayTankApi('/api/vessels', {
          method: 'POST',
          body: JSON.stringify({
            id: localVessel.id,
            name: localVessel.name || localVessel.id,
            imo: localVessel.imo || '',
            flag: localVessel.flag || '',
          }),
        });
        const made = created && created.id ? created : { id: localVessel.id, name: localVessel.name || '', imo: localVessel.imo || '' };
        /* A new server record is a name and nothing else. Give it this ship's
           setup, so the server copy is the ship rather than a bare record that
           a later pull would hand back to another device as an empty ship. */
        try {
          await pushTankSetupToServer(localVessel.id, made.id);
        } catch (err) {
          console.warn('Ship setup not copied to the new server record:', err && err.message ? err.message : err);
        }
        return made;
      }

      const TANK_SETUP_PARTS = ['tanks', 'assets', 'bunkering', 'transfers', 'bunkerOps', 'voyage'];

      async function readTankVesselBundle(via, vesselId) {
        const path = '/api/vessels/' + encodeURIComponent(vesselId);
        try {
          return via === 'local' ? await tankRequest(path) : await gatewayTankApi(path);
        } catch (_) {
          return null;
        }
      }

      async function readTankBundleForSetup(localId) {
        if (!usingLocalTank()) return null;
        return readTankVesselBundle('local', localId);
      }

      function tankSetupSignature(bundle) {
        const tanks = (bundle && bundle.tanks) || {};
        return Object.keys(tanks).sort().map((cat) => {
          const list = tanks[cat] || [];
          return cat + ':' + list.map((t) => [
            t && t.id,
            t && t.sortIndex,
            t && t.capacity,
            t && t.soundingMethod,
            t && t.pipeHeight,
            t && t.fuelGrade,
            t && t.name,
          ].join('/')).join(',');
        }).join('|');
      }

      function tankBookCount(bundle) {
        const tanks = (bundle && bundle.tanks) || {};
        let n = 0;
        Object.keys(tanks).forEach((k) => { n += ((tanks[k] || []).length); });
        return n;
      }

      function tankSetupBrief(bundle) {
        const n = tankBookCount(bundle);
        const fuel = ((bundle && bundle.tanks) || {}).fuel || [];
        const ordered = fuel.some((t) => t && Number.isFinite(Number(t.sortIndex)));
        return n ? (n + ' tanks' + (ordered ? ' · custom order' : '')) : 'no tanks';
      }

      async function writeTankSetup(via, vesselId, bundle) {
        if (!vesselId || !bundle) return;
        for (const part of TANK_SETUP_PARTS) {
          if (bundle[part] == null) continue;
          const path = '/api/vessels/' + encodeURIComponent(vesselId) + '/' + part;
          const opts = { method: 'PUT', body: JSON.stringify(bundle[part]) };
          if (via === 'local') await tankRequest(path, opts);
          else await gatewayTankApi(path, opts);
        }
      }

      async function pushTankSetupToServer(localId, serverId) {
        if (!serverId) return false;
        const localBundle = await readTankVesselBundle('local', localId);
        const serverBundle = await readTankVesselBundle('server', serverId);
        const localTanks = tankBookCount(localBundle);
        const serverTanks = tankBookCount(serverBundle);
        /* The empty side is the one that failed to load. Copy the filled book
           onto it. Never send an empty book over a ship that still has tanks. */
        if (!localTanks && serverTanks) {
          await writeTankSetup('local', localId, serverBundle);
          return 'loaded';
        }
        if (localTanks && !serverTanks) {
          await writeTankSetup('server', serverId, localBundle);
          return 'sent';
        }
        if (!localTanks) return false;
        await writeTankSetup('server', serverId, localBundle);
        return 'sent';
      }

      async function mergeTankReportPair(localId, serverId) {
        const [localBundle, serverBundle] = await Promise.all([
          readTankReportBundle('local', localId),
          readTankReportBundle('server', serverId),
        ]);
        const localPath = '/api/vessels/' + encodeURIComponent(localId) + '/saved-reports/merge';
        const serverPath = '/api/vessels/' + encodeURIComponent(serverId) + '/saved-reports/merge';
        await tankRequest(localPath, { method: 'POST', body: JSON.stringify(serverBundle) });
        await gatewayTankApi(serverPath, { method: 'POST', body: JSON.stringify(localBundle) });
      }

      function reportBundleHasRows(bundle) {
        if (!bundle) return false;
        const bunker = bundle.bunkerHistory || {};
        const bunkerCount = (bunker.plans || []).length + (bunker.after || []).length + (bunker.summaries || []).length;
        return !!((bundle.reportHistory || []).length
          || (bundle.voyageHistory || []).length
          || (bundle.tankSummaryHistory || []).length
          || bunkerCount
          || bundle.fuelReport);
      }

      function readOpenTankReports() {
        const frames = [];
        document.querySelectorAll('iframe').forEach((frame) => {
          try {
            const src = frame.getAttribute('src') || '';
            if (src.indexOf('/tanks') < 0 && src.indexOf('tank') < 0) return;
            if (frame.contentWindow) frames.push(frame);
          } catch (_) { /* ignore */ }
        });
        if (!frames.length) return Promise.resolve([]);
        const nonce = 'reports-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        return new Promise((resolve) => {
          const bundles = [];
          const pending = new Set(frames);
          const timer = setTimeout(finish, 8000);
          function finish() {
            clearTimeout(timer);
            window.removeEventListener('message', onMsg);
            resolve(bundles);
          }
          function onMsg(ev) {
            const msg = ev && ev.data;
            if (!msg || msg.type !== 'chengaio-tank-saved-reports' || msg.nonce !== nonce) return;
            if (msg.bundle) bundles.push(msg.bundle);
            pending.forEach((frame) => {
              try { if (ev.source === frame.contentWindow) pending.delete(frame); } catch (_) { /* ignore */ }
            });
            if (!pending.size) finish();
          }
          window.addEventListener('message', onMsg);
          frames.forEach((frame) => {
            try { frame.contentWindow.postMessage({ type: 'chengaio-tank-saved-reports', nonce }, '*'); }
            catch (_) { pending.delete(frame); }
          });
          if (!pending.size) finish();
        });
      }

      async function pushReportBundleToServer(bundle, profile) {
        const vessel = profile || bundle.vessel || {
          id: bundle.vesselId,
          name: bundle.name || '',
          imo: bundle.imo || '',
        };
        if (!vessel.id && bundle.vesselId) vessel.id = bundle.vesselId;
        if (!vessel.id) return false;
        const serverHit = await ensureServerTankVessel(vessel);
        await gatewayTankApi(
          '/api/vessels/' + encodeURIComponent(serverHit.id) + '/saved-reports/merge',
          { method: 'POST', body: JSON.stringify(bundle) },
        );
        return true;
      }

      async function pushOpenShipTankReports() {
        let sent = 0;
        const screenBundles = await readOpenTankReports();
        for (const bundle of screenBundles) {
          if (!reportBundleHasRows(bundle)) continue;
          if (await pushReportBundleToServer(bundle)) sent += 1;
        }
        if (usingLocalTank() || canUseLocalTank()) {
          let localVessels = [];
          try { localVessels = await listTankVesselIds('local'); } catch (_) { localVessels = []; }
          for (const local of localVessels) {
            let localBundle = null;
            try { localBundle = await readTankReportBundle('local', local.id); } catch (_) { localBundle = null; }
            if (!reportBundleHasRows(localBundle)) continue;
            if (await pushReportBundleToServer(localBundle, local)) sent += 1;
          }
        }
        if (!sent) return '';
        return ' Saved tank reports, including monitoring, are on the server.';
      }

      root.querySelector('#bk-check-tanks').onclick = async () => {
        try {
          await withProgress('Comparing saved tank reports…', 'Writing open gaugings and drafts…', async () => {
            await flushTankFrames();
            const peerUrl = normalizeSuiteUrl(root.querySelector('#bk-suite-url')?.value);
            const peerToken = (root.querySelector('#bk-suite-token')?.value || '').trim();
            if (!usingLocalTank()) {
              if (!peerUrl) {
                throw new Error('This screen is using the server that served this page, so there is no second copy to compare until the Cheng Suite server URL is set above.');
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
            /* Pair by id, then by hull. The device and the server often keep
               the same ship under different ids, and an id-only match left the
               monitoring reports on the device. */
            const pairs = [];
            const usedServer = new Set();
            for (const local of localVessels) {
              let server = serverVessels.find((v) => v.id === local.id && !usedServer.has(v.id));
              if (!server) server = serverVessels.find((v) => !usedServer.has(v.id) && tankHullSame(v, local));
              if (server) usedServer.add(server.id);
              pairs.push({ local, server: server || null });
            }
            for (const server of serverVessels) {
              if (!usedServer.has(server.id)) pairs.push({ local: null, server });
            }

            const activeVessel = (window.ChengPro && ChengPro.vessel && ChengPro.vessel.getActive()) || null;
            let scoped = pairs;
            let scopedTo = null;
            if (activeVessel) {
              const hit = pairs.filter((pair) => (
                (pair.local && tankHullSame(pair.local, activeVessel))
                || (pair.server && tankHullSame(pair.server, activeVessel))
              ));
              if (hit.length) {
                scoped = hit;
                scopedTo = activeVessel.name || (hit[0].local && hit[0].local.name) || (hit[0].server && hit[0].server.name);
              }
            }
            const rows = [];
            for (let i = 0; i < scoped.length; i++) {
              const pair = scoped[i];
              const name = (pair.local && pair.local.name) || (pair.server && pair.server.name) || 'vessel';
              progressSet(20 + Math.round(70 * (i / Math.max(scoped.length, 1))), `Reading reports for ${name}…`);
              if (!pair.local || !pair.server) {
                rows.push({
                  kind: 'tank-reports',
                  vesselId: (pair.local && pair.local.id) || (pair.server && pair.server.id),
                  localVesselId: pair.local ? pair.local.id : null,
                  serverVesselId: pair.server ? pair.server.id : null,
                  action: pair.local ? 'push' : 'same',
                  reason: pair.local
                    ? 'Only on this device — updating saves its reports on the server'
                    : 'Only on the server — this check does not create the ship on this device',
                  checked: !!pair.local,
                  title: name,
                  localText: pair.local ? 'vessel' : '—',
                  serverText: pair.server ? 'vessel' : '—',
                });
                continue;
              }
              const [localBundle, serverBundle] = await Promise.all([
                readTankReportBundle('local', pair.local.id),
                readTankReportBundle('server', pair.server.id),
              ]);
              const sideRows = compareReportSides(localBundle, serverBundle, name);
              sideRows.forEach((row) => {
                row.localVesselId = pair.local.id;
                row.serverVesselId = pair.server.id;
                row.vesselId = pair.server.id;
              });
              rows.push(...sideRows);
              const [localFull, serverFull] = await Promise.all([
                readTankVesselBundle('local', pair.local.id),
                readTankVesselBundle('server', pair.server.id),
              ]);
              const setupDiffer = tankSetupSignature(localFull) !== tankSetupSignature(serverFull);
              const localTanks = tankBookCount(localFull);
              const serverTanks = tankBookCount(serverFull);
              const setupReason = !localTanks && serverTanks
                ? 'This device has no tank book — updating loads the server\'s tanks onto this ship'
                : (!serverTanks && localTanks
                  ? 'The server has no tank book — updating copies this device\'s tanks up'
                  : (setupDiffer
                    ? 'Tank parameters or order differ — updating keeps whichever side still has the tank book'
                    : 'Tank parameters and order match'));
              rows.push({
                kind: 'tank-setup',
                localVesselId: pair.local.id,
                serverVesselId: pair.server.id,
                vesselId: pair.server.id,
                action: setupDiffer ? 'merge' : 'same',
                reason: setupReason,
                checked: setupDiffer,
                title: `${name} · Tank parameters & order`,
                localText: tankSetupBrief(localFull),
                serverText: tankSetupBrief(serverFull),
              });
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
                : 'Saved tank reports, gaugings and open drafts on this device match the server.')
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
          : consistencyPlan.kind === 'misc'
            ? 'the miscellaneous data (requisitions, consumption plan, oil record book)'
            : `${picked.length} saved-report group${picked.length === 1 ? '' : 's'}`;
        if (!confirm(`Update ${noun} to the newest of both sides?\n\nRecords that exist on only one side are copied across. Where both sides have the same record, the newer copy is kept. Nothing is deleted.`)) return;
        try {
          await withProgress('Updating to the newest copy…', 'Writing open gaugings and drafts…', async () => {
            await flushTankFrames();
            if (consistencyPlan.kind === 'misc') {
              progressSet(30, 'Updating miscellaneous data with the server…');
              const msg = await voyagePost('reconcile-misc', {}, root, 600000);
              reloadOpenVoyageFrame();
              const line = msg.message || 'Miscellaneous data updated.';
              setConsistency(line);
              setConsistencySummary('updated');
              toast(line);
              return line;
            }
            if (consistencyPlan.kind === 'voyage') {
              const settings = consistencyPlan.settings || readVoyageSyncForm(root);
              watchVoyage(8, 96);
              const msg = await voyagePost('reconcile-legs', {
                vessel: consistencyPlan.vessel,
                settings,
                openLatest: false,
                legs: picked.map((row) => ({ voyage: row.voyage, condition: row.condition })),
              }, root, 600000);
              reloadOpenVoyageFrame();
              const sounded = await loadLatestSounding([consistencyPlan.vessel], false);
              const soundNote = sounded[0] && sounded[0].loaded
                ? ` Latest sounding report loaded${sounded[0].voyageNo ? ' (voyage ' + sounded[0].voyageNo + ')' : ''}.`
                : '';
              let tankNote = '';
              try { tankNote = await pushOpenShipTankReports(); }
              catch (err) { tankNote = ' Tank reports were not copied: ' + (err && err.message ? err.message : err); }
              const line = (msg.message || 'Voyage legs updated.') + soundNote + tankNote;
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
            const seenShips = new Set();
            const shipRows = picked.filter((row) => {
              const key = String(row.localVesselId || row.vesselId || '');
              if (!key || seenShips.has(key)) return false;
              seenShips.add(key);
              return true;
            });
            const mergedIds = [];
            for (let i = 0; i < shipRows.length; i++) {
              const row = shipRows[i];
              const localId = row.localVesselId || row.vesselId;
              progressSet(Math.round(90 * (i / Math.max(shipRows.length, 1))), `Merging reports for ${localId}…`);
              let serverId = row.serverVesselId;
              if (!serverId) {
                const locals = await listTankVesselIds('local');
                const local = locals.find((v) => v.id === localId);
                if (!local) continue;
                const server = await ensureServerTankVessel(local);
                serverId = server.id;
              }
              await mergeTankReportPair(localId, serverId);
              try { await pushTankSetupToServer(localId, serverId); }
              catch (err) { console.warn('Tank setup not copied:', err && err.message ? err.message : err); }
              mergedIds.push(serverId);
            }
            let screenNote = '';
            try { screenNote = await pushOpenShipTankReports(); }
            catch (err) { screenNote = ' Tank reports were not copied: ' + (err && err.message ? err.message : err); }
            const sounded = await loadLatestSounding(mergedIds, true);
            reloadOpenTankFrames();
            const line = `Saved reports merged for ${mergedIds.length} vessel${mergedIds.length === 1 ? '' : 's'}.${sounded.length ? ' Latest sounding report and tank readings loaded.' : ''}${screenNote}`;
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
      const setLib = (t) => { if (libStatus) libStatus.textContent = t; };

      /* Pulling a ship's legs or adopting a vessel means several round trips to
         two servers. A status line that says "Asking the server…" and then sits
         there is indistinguishable from a hang, so the panel wears a sweep
         while it works — see .is-working in css/hud-effects.css. */
      const libPanel = libList && libList.closest ? libList.closest('.form-panel') : null;
      const working = (on) => { if (libPanel) libPanel.classList.toggle('is-working', !!on); };
      /* Looked up each time: after a redraw the line is a new element. */
      const setSync = (t) => {
        const el = document.getElementById('bk-suite-status');
        if (el) el.textContent = t;
      };
      const reportSuite = (t) => {
        suiteReport = { text: t, at: Date.now() };
        setSync(t);
      };

      async function serverTankApi(path, options = {}) {
        /* Prefer the live gateway so Electron "local" transport does not hide server vessels. */
        try {
          return await gatewayTankApi(path, options);
        } catch (gatewayErr) {
          /* Fall back to ChengProApi (LocalApi) when the gateway is unreachable.
             Not when a server URL is set: this device's own copy shown as the
             server's is how missing reports went unnoticed. */
          let configured = true;
          try { configured = !!tankServerBase(); } catch (_) { configured = true; }
          if (configured) throw gatewayErr;
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
          const res = await fetch(tankServerBase() + '/tanks/api/vessel-library', {
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
          /* One card per ship, the same on a phone, a tablet, and a Windows PC.
             The old table put the leg list and Pull voyage only on rows the
             Voyage fleet register had answered. A PC whose Voyage sign-in had
             not come back yet drew Tank rows with no leg control at all, and
             on a tablet the buttons sat on a different baseline from the ship
             name. The leg control uses the Voyage id when that register has
             the ship, and the Tank id otherwise — they are the same slug. */
          libList.innerHTML = `${notes.length ? `<p class="hint">${notes.join('<br>')}</p>` : ''}
          <div class="backup-lib">${rows.map((row, rowIndex) => {
            const tankSrc = row.sources.find((x) => x.source === 'tank');
            const voySrc = row.sources.find((x) => x.source === 'voyage');
            const pullId = (voySrc && voySrc.vesselId) || (tankSrc && tankSrc.vesselId) || '';
            const isMine = row.sources.some((x) => ownedByLicensee(x, mine));
            const programs = [tankSrc ? 'Tank' : null, voySrc ? 'Voyage' : null].filter(Boolean).join(' + ');
            const owners = [...new Set(row.sources.map(ownerLabel))].join(', ');
            /* The number as written, not as validated. ChengVesselKey.isValidImo
               can tell a typo from a real IMO, but matching uses the digits
               either way, so a badge here would fire on every row of a demo
               seed and buy the engineer nothing he can act on. */
            const imoTxt = row.imo ? esc(row.imo) : '—';
            return `<article class="backup-lib-row">
              <div class="backup-lib-meta">
                <div class="backup-lib-name">${esc(row.name || '—')}${isMine ? ' <span class="backup-lib-yours">· yours</span>' : ''}</div>
                <div class="backup-lib-facts">
                  <span>IMO ${imoTxt}</span>
                  <span>${esc(programs || '—')}</span>
                  <span>${esc(owners)}</span>
                </div>
              </div>
              <div class="backup-lib-actions">
                <button type="button" class="btn" data-lib-adopt="${rowIndex}">Add to my list</button>${tankSrc
                ? `<button type="button" class="btn" data-lib-import="${esc(tankSrc.vesselId)}" data-lib-owner="${esc(tankSrc.ownerSlug || '')}">Import particulars + latest leg</button>`
                : ''}${pullId
                ? `<div class="backup-lib-pull">
                     <select data-voy-mode="${esc(pullId)}" aria-label="Which legs to pull for ${esc(row.name || pullId)}">
                       <option value="latest">Latest leg</option>
                       <option value="all">All legs</option>
                     </select>
                     <button type="button" class="btn" data-voy-pull="${esc(pullId)}">Pull voyage</button>
                   </div>`
                : ''}
              </div>
            </article>`;
          }).join('')}</div>`;
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
                 Cheng Suite server form down first, and say plainly when it is
                 blank. */
              const voySettings = readVoyageSyncForm(root);
              if (!voySettings.serverUrl) {
                setLib('Set the Cheng Suite server URL in step 1 above, then pull.');
                toast('Cheng Suite server not set');
                return;
              }

              setLib(`Asking the server which voyages ${vesselId} has…`);
              working(true);
              try {
                /* Point the frame at this row's ship, not at whatever slug the
                   server form happens to hold — with that form folded
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
                + 'legs are not — use Pull voyage on this row for those.')) return;

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

      /* ---------- Cheng Suite server: one address and one token ----------
       *
       * Tank Chief and Voyage Chief used to keep a server each. The ChEng AIO
       * server answers both at one address with one SYNC_API_TOKEN, so the
       * form holds one of each and Save & connect writes them into both
       * programs. Each half still loads on its own clock (Voyage answers
       * through its hidden frame), so the form is painted from whichever has
       * arrived, and never over what he has started typing. */
      const suiteUrlEl = root.querySelector('#bk-suite-url');
      const suiteTokenEl = root.querySelector('#bk-suite-token');
      const suiteSaved = { tank: null, voyage: null };
      const suiteNotes = { tank: '', voyage: '' };
      let suiteTyped = false;
      [suiteUrlEl, suiteTokenEl].forEach((el) => {
        if (el) el.addEventListener('input', () => { suiteTyped = true; });
      });

      const sentence = (t) => {
        const s = String(t || '').trim();
        return !s ? '' : /[.!?]$/.test(s) ? s : s + '.';
      };

      function readSuiteForm() {
        return {
          url: normalizeSuiteUrl(suiteUrlEl && suiteUrlEl.value),
          token: ((suiteTokenEl && suiteTokenEl.value) || '').trim(),
        };
      }

      function paintSuiteForm() {
        const picked = pickSuiteServer(suiteSaved.tank, suiteSaved.voyage);
        if (!suiteTyped) {
          if (suiteUrlEl) suiteUrlEl.value = picked.url;
          if (suiteTokenEl) suiteTokenEl.value = picked.token;
        }
        markServerBlock('bk-suite-server', 'bk-suite-summary', suiteUrlEl && suiteUrlEl.value);
        const parts = [suiteNotes.voyage, suiteNotes.tank];
        if (picked.otherUrl) {
          parts.push(`Voyage Chief was saved with ${picked.otherUrl}. Save & connect points both programs at the address above.`);
        }
        /* A Save or Test that is running or just reported wins over a
           settings load that answers late. */
        if (suiteReport && Date.now() - suiteReport.at < SUITE_REPORT_MS) setSync(suiteReport.text);
        else setSync(parts.filter(Boolean).map(sentence).join(' ') || 'Ready.');
      }

      /* The frame shows a saved token as dots. The copy mirrored here is the real one. */
      function voyageTokenOf(settings, mirrored) {
        const tok = String((settings && settings.apiToken) || '');
        return tok && tok.indexOf('•') < 0 ? tok : ((mirrored && mirrored.apiToken) || '');
      }

      function rememberSuiteUrl(url) {
        try {
          if (url) localStorage.setItem(SUITE_URL_KEY, url);
          else localStorage.removeItem(SUITE_URL_KEY);
        } catch (_) { /* private mode */ }
      }

      async function loadTankServerSettings() {
        try {
          const s = await tankRequest('/api/settings');
          suiteSaved.tank = { syncUrl: s.syncUrl || '', syncApiToken: s.syncApiToken || '' };
          suiteNotes.tank = '';
        } catch (e) {
          suiteNotes.tank = 'Tank Chief settings could not be read: ' + (e.message || 'unknown error');
        }
        paintSuiteForm();
      }
      loadTankServerSettings();

      /* Paint the mirrored Voyage copy at once so a reopened AIO shows the
       * last saved server before the bridge frame answers. */
      {
        const mirrored = readMirroredVoyageSync();
        if (mirrored && (mirrored.serverUrl || mirrored.apiToken || mirrored.vesselId)) {
          fillVoyageSyncForm(root, mirrored);
          suiteSaved.voyage = { serverUrl: mirrored.serverUrl || '', apiToken: mirrored.apiToken || '' };
          paintSuiteForm();
        }
      }

      (async () => {
        try {
          const msg = await voyagePost('get-sync-settings', {}, root);
          const settings = msg.settings || {};
          const mirrored = readMirroredVoyageSync() || {};
          const apiToken = voyageTokenOf(settings, mirrored);
          fillVoyageSyncForm(root, {
            vesselId: settings.vesselId || mirrored.vesselId || '',
            deviceName: settings.deviceName || mirrored.deviceName || '',
          });
          suiteSaved.voyage = { serverUrl: settings.serverUrl || mirrored.serverUrl || '', apiToken };
          if (settings.serverUrl || settings.apiToken) {
            mirrorVoyageSyncToLocalStorage({
              serverUrl: settings.serverUrl || '',
              apiToken,
              vesselId: settings.vesselId || '',
              deviceName: settings.deviceName || '',
              conflictPolicy: 'merge',
            });
          }
          suiteNotes.voyage = (settings.lastSyncedAt
            ? 'Last voyage sync: ' + new Date(settings.lastSyncedAt).toLocaleString()
            : 'Last voyage sync: never')
            + (settings.lastSyncError ? '. Error: ' + settings.lastSyncError : '');
        } catch (e) {
          suiteNotes.voyage = suiteSaved.voyage
            ? 'Using the last saved server (Voyage Chief is still loading)'
            : (e.message || 'Could not load Voyage Chief settings');
        }
        paintSuiteForm();
      })();

      function activeVesselForSync() {
        const active = (window.ChengPro && ChengPro.vessel && ChengPro.vessel.getActive && ChengPro.vessel.getActive()) || null;
        if (!active || (!active.id && !active.name && !active.imo)) return null;
        return { id: active.id || '', name: active.name || '', imo: active.imo || '' };
      }

      /* Both halves answer at the same address, but each is asked on its own:
         one that is down should not hide that the other is fine. The servers'
         own hints point at the standalone apps' Push / Pull and Setup pages,
         so the result is said in this page's words. */
      function suiteFailure(err) {
        const text = String((err && err.message) || err || 'unreachable');
        if (/\b401\b|unauthori[sz]ed|token/i.test(text)) {
          return 'the API token was missing or refused. Enter the server\'s SYNC_API_TOKEN above and save.';
        }
        return sentence(text);
      }

      async function testSuiteServer(url, token, voySettings, skipVoyage) {
        const out = { tank: false, voyage: false, line: '' };
        const lines = [];
        try {
          await tankRequest('/api/sync/probe', {
            method: 'POST',
            body: JSON.stringify({ syncUrl: url, syncApiToken: token }),
          });
          out.tank = true;
          lines.push('Tank Chief answers.');
        } catch (e) {
          lines.push('Tank Chief did not answer: ' + suiteFailure(e));
        }
        /* When Voyage Chief could not even take the settings, asking it again
           only waits out the same two minutes. */
        if (!skipVoyage) {
          try {
            await voyagePost('test-sync', { settings: voySettings }, root);
            out.voyage = true;
            lines.push('Voyage Chief answers.');
          } catch (e) {
            lines.push('Voyage Chief did not answer: ' + suiteFailure(e));
          }
        }
        out.line = lines.join(' ');
        return out;
      }

      /* Saving the address is the moment the engineer means "connect me".
       *
       * What the two Save & connect buttons did, in one: store the address and
       * token in Tank Chief and in Voyage Chief, prove each half answers,
       * bring down the tank files uploaded for the ship that is open, then
       * repaint the vessel library and the header's vessel list so his ships
       * are simply there.
       *
       * The tank pull is safe without asking because applySyncPayload merges
       * by revision and an empty part never replaces a filled one. Voyage legs,
       * saved reports and miscellaneous data are left to Database consistency,
       * which shows what differs before anything is written. Each step reports
       * separately: a server that does not answer stops the sequence with the
       * settings still saved, rather than looking like the save failed. */
      root.querySelector('#bk-suite-save')?.addEventListener('click', async () => {
        const { url, token } = readSuiteForm();
        if (suiteUrlEl) suiteUrlEl.value = url;
        const voySettings = readVoyageSyncForm(root);
        reportSuite('Saving the server for Tank Chief and Voyage Chief…');

        try {
          await tankRequest('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ syncUrl: url, syncApiToken: token, syncEnabled: true }),
          });
        } catch (e) {
          reportSuite('Not saved: ' + sentence(e.message || 'Tank Chief settings could not be written'));
          toast(e.message || 'Save failed');
          return;
        }
        suiteSaved.tank = { syncUrl: url, syncApiToken: token };
        rememberSuiteUrl(url);
        mirrorVoyageSyncToLocalStorage(voySettings);
        let voyageNote = '';
        try {
          await voyagePost('save-sync-settings', { settings: voySettings }, root);
          suiteSaved.voyage = { serverUrl: url, apiToken: token };
        } catch (e) {
          voyageNote = (/still loading/i.test(String(e && e.message))
            ? 'Voyage Chief has not finished loading, so it does not have the server yet.'
            : 'Voyage Chief did not take the server: ' + suiteFailure(e))
            + ' Press Save & connect again in a moment.';
        }
        suiteTyped = false;
        markServerBlock('bk-suite-server', 'bk-suite-summary', url);

        if (!url) {
          reportSuite(['Saved. Enter the server URL to connect.', voyageNote].filter(Boolean).join(' '));
          toast('Server settings saved');
          await refreshVesselLibrary();
          return;
        }

        reportSuite('Saved. Checking the server…');
        const tested = await testSuiteServer(url, token, voySettings, !!voyageNote);
        if (!tested.tank) {
          reportSuite(['Saved, but the server did not answer for tank files.', tested.line, voyageNote,
            'Vessels will appear once it does.'].filter(Boolean).join(' '));
          toast('Saved — server unreachable');
          await refreshVesselLibrary();
          return;
        }

        let pulled = '';
        const vessel = activeVesselForSync();
        if (!vessel) {
          pulled = 'Open the vessel to bring down the tank files uploaded for it.';
        } else {
          reportSuite('Server reachable. Saving open tank work…');
          try {
            await flushTankFrames();
            /* What Flush offline queue did: put the device store on disk. Only
               where that store is the working copy; in a browser on the server
               it was never started and would not answer. */
            if (usingLocalTank() && LocalApi.flush) await LocalApi.flush();
            reportSuite('Downloading this vessel\'s tank files…');
            const res = await tankRequest('/api/sync/pull', {
              method: 'POST',
              body: JSON.stringify({ syncUrl: url, syncApiToken: token, vessel }),
            });
            pulled = sentence((res && (res.warning || res.message)) || 'This vessel\'s tank files are up to date');
            /* The open Tank Chief screen still holds what it read before the pull;
               a later save from it would write that back. Make it read again. */
            reloadOpenTankFrames();
          } catch (e) {
            pulled = 'The tank pull failed: ' + sentence(e.message || 'unknown error');
          }
        }

        try { await ChengPro.vessel.refresh(); } catch (_) { /* ignore */ }
        await refreshVesselLibrary();
        reportSuite(['Connected.', tested.line, pulled, voyageNote,
          'Use Database consistency below for voyage legs, saved reports and miscellaneous data.'].filter(Boolean).join(' '));
        toast('Connected — vessel list updated');
      });

      root.querySelector('#bk-suite-test')?.addEventListener('click', async () => {
        const { url, token } = readSuiteForm();
        if (!url) { reportSuite('Enter the server URL first.'); return; }
        reportSuite('Testing the server…');
        const tested = await testSuiteServer(url, token, readVoyageSyncForm(root));
        reportSuite(tested.line);
        toast(tested.tank && tested.voyage ? 'Server OK for Tank Chief and Voyage Chief' : 'Server check failed — see the status line');
      });

      ensureVoyageFrame(root);
    },
  };
})();
