/**
 * API client with offline fallback + mutation queue flush when online.
 */
const Api = (() => {
  let online = navigator.onLine;
  let flushing = false;
  const listeners = new Set();
  /* Cheng-Pro mounts Tank Chief under /tanks with API at /tanks/api/*. */
  const API_PREFIX = String(window.CHENG_PRO_TANKS_PREFIX || '/tanks').replace(/\/$/, '');
  function withPrefix(path) {
    if (!path) return path;
    if (API_PREFIX && path.startsWith('/api')) return API_PREFIX + path;
    return path;
  }

  /** APK / Capacitor loads from localhost — not the ship's Cheng-Pro server. */
  function isBundledClient() {
    if (!/^https?:$/.test(location.protocol)) return true;
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  const SERVER_BASE_KEY = 'apiServerBase';

  function getServerBase() {
    try {
      const saved = localStorage.getItem(SERVER_BASE_KEY);
      if (saved && saved.trim()) return saved.trim().replace(/\/$/, '');
    } catch { /* private mode */ }
    return '';
  }

  function setServerBase(url) {
    const base = normalizeSyncUrl(url);
    try {
      if (base) localStorage.setItem(SERVER_BASE_KEY, base);
      else localStorage.removeItem(SERVER_BASE_KEY);
    } catch { /* not fatal */ }
    return base;
  }

  /** Trim, add http:// if scheme missing, strip trailing slash. */
  function normalizeSyncUrl(url) {
    let s = String(url || '').trim();
    if (!s) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = 'http://' + s;
    return s.replace(/\/$/, '');
  }

  function describeFetchError(err, url) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Request failed');
    if (!/Failed to fetch|fetch failed|NetworkError|Load failed/i.test(msg)) return msg;
    const target = url || getServerBase() || 'the server';
    return (
      'Could not reach ' + target + '. ' +
      'On ship Wi‑Fi use http://<LXC-IP>:8080 (example http://192.168.0.132:8080). ' +
      'The hostname must resolve on this phone, and HTTPS needs a valid certificate.'
    );
  }

  /** Full or relative URL for a server-mode HTTP request. */
  function resolveUrl(path) {
    const prefixed = withPrefix(path);
    if (transport !== 'server' || !isBundledClient()) return prefixed;
    const base = getServerBase();
    if (!base) {
      const err = new Error('Set the Cheng-Pro server URL under Backup / Sync before using server mode');
      err.status = 400;
      err.rejected = true;
      throw err;
    }
    const tankPath = prefixed.startsWith('/tanks/')
      ? prefixed
      : `/tanks${prefixed.startsWith('/') ? prefixed : `/${prefixed}`}`;
    return `${base}${tankPath}`;
  }

  function setOnline(v) {
    online = v;
    listeners.forEach((fn) => fn(online));
  }
  window.addEventListener('online', () => { setOnline(true); flushQueue(); });
  window.addEventListener('offline', () => setOnline(false));

  function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function isOnline() { return online; }

  /* ------------------------------------------------------------ transport --
   *
   * Two ways to reach the API, and which one is in use is a setting rather
   * than a per-request guess.
   *
   *   server   the usual thing: HTTP to whatever served the page.
   *   local    the routes run on this device, over its own database.
   *
   * Falling back from one to the other on a failed request would be worse than
   * useless: the two have separate databases, and a request silently answered
   * by the other one puts today's soundings in a place the user is not looking
   * at. So the choice is explicit, it sticks, and moving records between the
   * two is what Backup / Sync is for.
   *
   * The default is local where there is no server to talk to at all — the
   * phone application, loaded from its own bundle rather than over http.
   */
  const TRANSPORT_KEY = 'apiTransport';
  let transport = (() => {
    try {
      const saved = localStorage.getItem(TRANSPORT_KEY);
      if (saved === 'local' || saved === 'server') return saved;
    } catch { /* private mode: fall through to the default */ }
    return isBundledClient() ? 'local' : 'server';
  })();

  function getTransport() { return transport; }
  function canUseLocal() { return typeof LocalApi !== 'undefined'; }
  function setTransport(mode) {
    if (mode !== 'local' && mode !== 'server') throw new Error(`Unknown transport: ${mode}`);
    if (mode === 'local' && !canUseLocal()) throw new Error('This build has no on-device database');
    transport = mode;
    try { localStorage.setItem(TRANSPORT_KEY, mode); } catch { /* not fatal */ }
    setOnline(mode === 'local' ? true : navigator.onLine);
    return transport;
  }

  /** Answer from the device, in the shape request() hands back. */
  async function localRequest(path, opts = {}) {
    const method = opts.method || 'GET';
    let body = opts.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* leave as text */ } }
    if (body instanceof FormData) {
      const err = new Error('Uploading a file needs the desktop application');
      err.status = 501;
      err.rejected = true;
      throw err;
    }
    const res = await LocalApi.handle(method, path, body);
    if (res.status >= 400) {
      const err = new Error((res.body && res.body.error) || 'Request failed');
      err.status = res.status;
      err.rejected = res.status >= 400 && res.status < 500;
      throw err;
    }
    return res.body;
  }

  async function request(path, opts = {}) {
    if (transport === 'local' && canUseLocal()) return localRequest(path, opts);
    const init = {
      method: opts.method || 'GET',
      headers: { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
      body: opts.body instanceof FormData || typeof opts.body === 'string'
        ? opts.body
        : opts.body != null ? JSON.stringify(opts.body) : undefined,
    };
    try {
      const res = await fetch(resolveUrl(path), init);
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) {
        const err = new Error((data && data.error) || res.statusText || 'Request failed');
        err.status = res.status;
        // 4xx is the server saying no; retrying cannot change its mind. 503 is
        // the worker's own offline stand-in, which is not a rejection.
        err.rejected = res.status >= 400 && res.status < 500;
        throw err;
      }
      setOnline(true);
      return data;
    } catch (err) {
      if (!navigator.onLine) setOnline(false);
      if (err && err.rejected) throw err;
      if (err && err.status >= 400) throw err;
      let target = getServerBase() || '';
      try { target = resolveUrl(path); } catch { /* keep base */ }
      const wrapped = new Error(describeFetchError(err, target));
      wrapped.status = err && err.status;
      wrapped.rejected = err && err.rejected;
      throw wrapped;
    }
  }

  async function getStatus() {
    try {
      const st = await request('/api/status');
      try { await OfflineDB.idbSet('status', st); } catch { /* private mode */ }
      return st;
    } catch (err) {
      const cached = await OfflineDB.idbGet('status');
      if (cached) { setOnline(false); return cached; }
      if (transport === 'local' && canUseLocal()) {
        throw new Error(err.message || 'Could not read the on-device database');
      }
      throw new Error('Offline and no cached status');
    }
  }

  async function getVessel(id) {
    try {
      const bundle = await request('/api/vessels/' + id);
      await OfflineDB.idbSet('vessel:' + id, bundle);
      const status = await request('/api/status');
      await OfflineDB.idbSet('status', status);
      return bundle;
    } catch (err) {
      const cached = await OfflineDB.idbGet('vessel:' + id);
      if (cached) { setOnline(false); return cached; }
      throw err;
    }
  }

  /**
   * Upload a FormData with real progress. fetch() cannot report how much of a
   * body has gone out, so this one call uses XMLHttpRequest: a capacity book is
   * tens of megabytes over a ship's link and the bar has to mean something.
   *
   * onProgress(pct|null, phase) — pct is null once the body is sent and we are
   * waiting on the server, which is not measurable from here.
   */
  /**
   * Import a backup JSON file on the device (LocalApi has no multipart upload).
   */
  async function importBackupLocal(file, merge, onProgress) {
    if (onProgress) onProgress(null, 'reading');
    const text = await file.text();
    let backup;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error('Backup file is not valid JSON');
    }
    if (onProgress) {
      onProgress(100, 'uploading');
      onProgress(null, 'processing');
    }
    const result = await localRequest('/api/backup/import', {
      method: 'POST',
      body: { backup, merge: String(merge) },
    });
    try {
      const st = await localRequest('/api/status', { method: 'GET' });
      await OfflineDB.idbSet('status', st);
    } catch { /* import succeeded; UI will retry status */ }
    return result;
  }

  function upload(path, formData, onProgress) {
    if (transport === 'local' && canUseLocal() && path === '/api/backup/import') {
      const file = formData.get('file');
      const merge = formData.get('merge') !== 'false';
      if (!file) return Promise.reject(new Error('Choose a backup file'));
      return importBackupLocal(file, merge, onProgress);
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', resolveUrl(path));
      xhr.upload.onprogress = (e) => {
        if (!onProgress) return;
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), 'uploading');
        else onProgress(null, 'uploading');
      };
      xhr.upload.onload = () => { if (onProgress) onProgress(null, 'processing'); };
      xhr.onload = () => {
        let data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = xhr.responseText; }
        if (xhr.status >= 200 && xhr.status < 300) {
          setOnline(true);
          resolve(data);
        } else {
          reject(new Error((data && data.error) || xhr.statusText || 'Upload failed'));
        }
      };
      xhr.onerror = () => {
        if (!navigator.onLine) setOnline(false);
        reject(new Error('Network error during upload'));
      };
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(formData);
    });
  }

  /**
   * Download a JSON API response with byte progress when the server sends a
   * Content-Length (backups can be large once every vessel is included).
   * onProgress(pct|null, phase).
   */
  function download(path, onProgress) {
    if (transport === 'local' && canUseLocal()) {
      if (onProgress) onProgress(null, 'reading');
      return localRequest(path, { method: 'GET' });
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', resolveUrl(path));
      xhr.responseType = 'text';
      xhr.onprogress = (e) => {
        if (!onProgress) return;
        if (e.lengthComputable && e.total > 0) {
          onProgress(Math.round((e.loaded / e.total) * 100), 'downloading');
        } else {
          onProgress(null, 'downloading');
        }
      };
      xhr.onload = () => {
        let data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = xhr.responseText; }
        if (xhr.status >= 200 && xhr.status < 300) {
          setOnline(true);
          resolve(data);
        } else {
          reject(new Error((data && data.error) || xhr.statusText || 'Download failed'));
        }
      };
      xhr.onerror = () => {
        if (!navigator.onLine) setOnline(false);
        reject(new Error('Network error during download'));
      };
      xhr.onabort = () => reject(new Error('Download cancelled'));
      if (onProgress) onProgress(null, 'starting');
      xhr.send();
    });
  }

  async function mutate(path, opts, offlineApply) {
    // On the device there is nothing to be offline from: the write has already
    // landed in the only database there is, so it must not also be queued for
    // some server to replay later.
    if (transport === 'local' && canUseLocal()) return request(path, opts);
    if (!navigator.onLine) {
      if (typeof offlineApply === 'function') await offlineApply();
      await OfflineDB.queuePush({ path, opts });
      setOnline(false);
      return { queued: true, offline: true };
    }
    try {
      const result = await request(path, opts);
      return result;
    } catch (err) {
      if (typeof offlineApply === 'function') await offlineApply();
      await OfflineDB.queuePush({ path, opts });
      setOnline(false);
      return { queued: true, offline: true, error: err.message };
    }
  }

  /**
   * Send everything that was written while the server was out of reach.
   *
   * Order is kept, because a later edit of the same part has to land after the
   * earlier one. But a single item is not allowed to wedge the queue forever:
   * a request the server actively rejects (a 4xx — malformed, or about a vessel
   * that no longer exists) will never succeed no matter how often it is tried,
   * so it is dropped and reported rather than retried until the end of time.
   * Anything that merely could not be delivered — no server, a 5xx — stops the
   * run and is tried again on the next one, still in order.
   */
  async function flushQueue(onProgress) {
    if (transport === 'local') return { flushed: 0, pending: 0, dropped: 0 };
    if (flushing) return { flushed: 0, busy: true };
    flushing = true;
    try {
      const items = await OfflineDB.queueAll();
      if (!items.length) return { flushed: 0, dropped: 0, pending: 0 };
      const total = items.length;
      let flushed = 0;
      let dropped = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof onProgress === 'function') {
          onProgress({
            index: i + 1,
            total,
            path: item.path,
            pct: Math.round((i / total) * 100),
            message: `Sending change ${i + 1} of ${total}…`,
          });
        }
        try {
          await request(item.path, item.opts || {});
          await OfflineDB.queueDelete(item.id);
          flushed += 1;
        } catch (err) {
          if (err && err.rejected) {
            console.warn('Dropping a queued change the server rejected', item.path, err.message);
            await OfflineDB.queueDelete(item.id);
            dropped += 1;
            continue;
          }
          break; // undeliverable — keep it, and everything after it, in order
        }
      }
      const pending = (await OfflineDB.queueAll()).length;
      if (flushed) setOnline(true);
      if (flushed && typeof onFlushed === 'function') await onFlushed({ flushed, dropped, pending });
      return { flushed, dropped, pending };
    } finally {
      flushing = false;
    }
  }

  /** Is the server itself reachable? Being on a network says nothing about it. */
  async function reachable() {
    if (transport === 'local' && canUseLocal()) { setOnline(true); return true; }
    try {
      const res = await fetch(resolveUrl('/api/health'), { cache: 'no-store' });
      const ok = res.ok;
      setOnline(ok);
      return ok;
    } catch {
      setOnline(false);
      return false;
    }
  }

  /** Called after a flush actually delivered something, so the app can re-pull. */
  let onFlushed = null;
  function afterFlush(fn) { onFlushed = fn; }

  return {
    request, upload, download, getStatus, getVessel, mutate, flushQueue, onStatus, isOnline,
    reachable, afterFlush, getTransport, setTransport, canUseLocal, isBundledClient,
    getServerBase, setServerBase,
    listVessels: () => request('/api/vessels'),
    createVessel: (body) => request('/api/vessels', { method: 'POST', body }),
    setActive: (id) => request('/api/vessels/active', { method: 'POST', body: { id } }),
    updateVessel: (id, body) => request('/api/vessels/' + id, { method: 'PUT', body }),
    deleteVessel: (id) => request('/api/vessels/' + id, { method: 'DELETE' }),
    savePart: (id, part, body) => request(`/api/vessels/${id}/${part}`, { method: 'PUT', body }),
    upsertTank: (id, body) => request(`/api/vessels/${id}/tanks`, { method: 'POST', body }),
    deleteTank: (id, tankId) => request(`/api/vessels/${id}/tanks/${tankId}`, { method: 'DELETE' }),
    saveCalibration: (id, tankId, body) => request(`/api/vessels/${id}/tanks/${tankId}/calibration`, { method: 'PUT', body }),
    calculate: (id, body) => request(`/api/vessels/${id}/calculate`, { method: 'POST', body }),
    getFuelReport: (id) => request(`/api/vessels/${id}/fuel-report`),
    bunkeringChain: (id) => request(`/api/vessels/${id}/bunkering-chain`),
    saveBunkerPlan: (id, body) => request(`/api/vessels/${id}/bunker-plan`, { method: 'PUT', body }),
    saveBunkerAfter: (id, body) => request(`/api/vessels/${id}/bunker-after`, { method: 'PUT', body }),
    bunkerAfterGetData: (id, body) =>
      request(`/api/vessels/${id}/bunker-after/get-data`, { method: 'POST', body }),
    saveBunkerSummary: (id, body) => request(`/api/vessels/${id}/bunker-summary`, { method: 'PUT', body }),
    saveFuelReport: (id, body) => request(`/api/vessels/${id}/fuel-report`, { method: 'PUT', body }),
    deleteFuelReportSnapshot: (id, snapshotId) =>
      request(`/api/vessels/${id}/fuel-report/history/${snapshotId}`, { method: 'DELETE' }),
    bunkerDistribute: (id, body) => request(`/api/vessels/${id}/bunker-distribute`, { method: 'POST', body }),
    bunkerStart: (id, body) => request(`/api/vessels/${id}/bunker-ops/start`, { method: 'POST', body }),
    bunkerActive: (id) => request(`/api/vessels/${id}/bunker-ops/active`),
    bunkerUpdate: (id, opId, body) => request(`/api/vessels/${id}/bunker-ops/${opId}`, { method: 'PATCH', body }),
    bunkerComplete: (id, opId, body) => request(`/api/vessels/${id}/bunker-ops/${opId}/complete`, { method: 'POST', body }),
    bunkerCancel: (id, opId) => request(`/api/vessels/${id}/bunker-ops/${opId}/cancel`, { method: 'POST', body: {} }),
    bunkerBlend: (id, body) => request(`/api/vessels/${id}/bunker-blend`, { method: 'POST', body }),
    convertDensity: (body) => request('/api/reference/convert-density', { method: 'POST', body }),
    vcfWcfCalc: (body) => request('/api/reference/vcf-wcf', { method: 'POST', body }),
    vcfWcfTables: (q = '') => request('/api/reference/vcf-wcf-tables' + (q ? '?' + q : '')),
    iso8217: () => request('/api/reference/iso8217'),
    getSettings: () => request('/api/settings'),
    saveSettings: (body) => request('/api/settings', { method: 'PUT', body }),
    backup: (onProgress) => download('/api/backup', onProgress),
    /**
     * Offline-first peer sync: fetch the Cloudflare/LAN peer from the browser
     * (same as Voyage Chief), then apply into the on-device database.
     */
    syncPull: (syncUrl, token) => syncPullDirect(syncUrl, token),
    syncPush: (syncUrl, token) => syncPushDirect(syncUrl, token),
    syncProbe: (syncUrl, token) => syncProbeDirect(syncUrl, token),
    normalizeSyncUrl,
    voyageSyncCredentials,
    peerSyncBases,
    importCsv: async (vesselId, file) => {
      const fd = new FormData();
      fd.append('file', file);
      return request(`/api/vessels/${vesselId}/tanks/import-csv`, { method: 'POST', body: fd });
    },
    importBackup: async (file, merge = true, onProgress) => {
      if (transport === 'local' && canUseLocal()) {
        return importBackupLocal(file, merge, onProgress);
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('merge', String(merge));
      if (typeof onProgress === 'function') {
        return upload('/api/backup/import', fd, onProgress);
      }
      return request('/api/backup/import', { method: 'POST', body: fd });
    },
  };

  function peerSyncBases(url) {
    const base = normalizeSyncUrl(url);
    if (!base) return [];
    const root = base.replace(/\/tanks$/i, '');
    const withTanks = /\/tanks$/i.test(base) ? base : `${root}/tanks`;
    const https = /^https:/i.test(root);
    return https ? [...new Set([withTanks, root])] : [...new Set([root, withTanks])];
  }

  function voyageSyncCredentials() {
    try {
      const raw = localStorage.getItem('noonReportSyncCredentials');
      if (!raw) return {};
      const c = JSON.parse(raw);
      return {
        serverUrl: c.serverUrl || '',
        apiToken: c.apiToken || '',
        deviceId: c.deviceId || '',
        deviceName: c.deviceName || '',
      };
    } catch {
      return {};
    }
  }

  function peerAuthHeaders(extraToken) {
    const headers = {};
    const voyage = voyageSyncCredentials();
    const token = String(extraToken || voyage.apiToken || '').trim();
    if (token) headers.Authorization = 'Bearer ' + token;
    if (voyage.deviceId) headers['X-Device-Id'] = voyage.deviceId;
    if (voyage.deviceName) headers['X-Device-Name'] = voyage.deviceName;
    return headers;
  }

  async function fetchPeerJson(syncUrl, apiPath, init = {}, token) {
    const bases = peerSyncBases(syncUrl);
    if (!bases.length) throw new Error('No sync URL configured');
    const auth = peerAuthHeaders(token);
    let lastErr = null;
    for (const base of bases) {
      const full = `${base}${apiPath}`;
      try {
        const resp = await fetch(full, {
          cache: 'no-store',
          credentials: 'omit',
          ...init,
          headers: {
            ...(init.headers || {}),
            ...auth,
          },
        });
        const text = await resp.text();
        const trimmed = (text || '').trim();
        if (resp.status === 404) {
          lastErr = new Error('HTTP 404 at ' + full);
          continue;
        }
        if (/^<!doctype|<html/i.test(trimmed) || /cf-error|cloudflare/i.test(trimmed)) {
          throw new Error(
            'Cloudflare/proxy returned a web page (HTTP ' + resp.status + ') at ' + full +
            ' instead of Tank sync JSON. Use the same Cloudflare URL that works in Voyage Chief, ' +
            'keep Tank on “On this device”, and confirm /tanks/api/sync/ping opens as JSON in a browser.'
          );
        }
        let data = null;
        try {
          data = trimmed ? JSON.parse(trimmed) : null;
        } catch {
          throw new Error('Peer returned non-JSON (HTTP ' + resp.status + ') from ' + full);
        }
        if (!resp.ok) {
          throw new Error((data && data.error) || ('HTTP ' + resp.status + ' from ' + full));
        }
        return { data, base, full };
      } catch (err) {
        if (/web page|non-JSON|HTTP [453]/i.test(err.message || '') && !/404/.test(err.message || '')) {
          throw err;
        }
        lastErr = err;
      }
    }
    throw new Error(describeFetchError(lastErr, syncUrl));
  }

  async function syncPullDirect(syncUrl, token) {
    const url = normalizeSyncUrl(syncUrl);
    const { data, base } = await fetchPeerJson(url, '/api/sync/export', { method: 'GET' }, token);
    if (!data || data.format !== 'vessel-fuel-tms-sync') {
      throw new Error('Peer did not return a Tank sync bundle (expected format vessel-fuel-tms-sync)');
    }
    const applied = (transport === 'local' && canUseLocal())
      ? await localRequest('/api/sync/import', { method: 'POST', body: data })
      : await request('/api/sync/import', { method: 'POST', body: data });
    return { ok: true, results: applied.results || applied, from: base };
  }

  async function syncPushDirect(syncUrl, token) {
    const url = normalizeSyncUrl(syncUrl);
    const bundle = (transport === 'local' && canUseLocal())
      ? await localRequest('/api/sync/export')
      : await request('/api/sync/export');
    const { data, base } = await fetchPeerJson(url, '/api/sync/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    }, token);
    return { ok: true, remote: data, to: base };
  }

  async function syncProbeDirect(syncUrl, token) {
    const url = normalizeSyncUrl(syncUrl);
    try {
      const { data, base, full } = await fetchPeerJson(url, '/api/sync/ping', { method: 'GET' }, token);
      return {
        ok: true,
        base,
        path: '/api/sync/ping',
        product: data.product || 'tank-chief',
        format: data.format,
        tried: [{ url: full, ok: true }],
        hint: 'Tank peer reachable. Stay on “On this device” for offline work; use Pull/Push to sync.',
      };
    } catch (pingErr) {
      const { data, base, full } = await fetchPeerJson(url, '/api/sync/export', { method: 'GET' }, token);
      if (data.format !== 'vessel-fuel-tms-sync') {
        throw pingErr;
      }
      return {
        ok: true,
        base,
        path: '/api/sync/export',
        product: data.format,
        format: data.format,
        tried: [{ url: full, ok: true }],
        hint: 'Tank peer reachable via sync export.',
      };
    }
  }
})();

window.Api = Api;
