/**
 * On-device shell: talk to the embedded Tank Chief LocalApi when this device
 * is in local/offline mode. Peer sync URL must NOT force vessel APIs online —
 * that made Vessel Setup show "Request failed" with no vessels on airplane mode.
 *
 * Home tank overview and other modules also call /tanks/api/* — those must be
 * forwarded to LocalApi (/api/*) or offline Home shows an empty fuel overview.
 */
(function () {
  if (!window.ChengProBundled || !ChengProBundled.isBundledClient()) return;
  if (typeof LocalApi === 'undefined') return;

  const SERVER_BASE_KEY = 'apiServerBase';
  const TRANSPORT_KEY = 'apiTransport';

  function getServerBase() {
    try {
      const saved = localStorage.getItem(SERVER_BASE_KEY);
      if (saved && saved.trim()) return saved.trim().replace(/\/$/, '');
    } catch { /* ignore */ }
    return '';
  }

  function getTransport() {
    try {
      const saved = localStorage.getItem(TRANSPORT_KEY);
      if (saved === 'local' || saved === 'server') return saved;
    } catch { /* ignore */ }
    return 'local';
  }

  /** Prefer on-device DB unless the user explicitly chose server transport. */
  function useLocalShell() {
    if (getTransport() !== 'server') return true;
    return !getServerBase();
  }

  /** Match Tank Chief: license email isolates data under data/users/<slug>/. */
  function applyOfflineTankScope() {
    try {
      if (typeof StoreCore === 'undefined' || typeof StoreCore.setUserScope !== 'function') return;
      if (!window.ChengLicense) return;
      StoreCore.setUserScope({
        email: ChengLicense.licenseEmail() || null,
        master: !!ChengLicense.isMaster(),
      });
    } catch { /* ignore */ }
  }

  function localApiPath(path) {
    const p = String(path || '');
    if (p.startsWith('/tanks/api')) return p.slice('/tanks'.length) || '/';
    return p;
  }

  async function localApi(method, apiPath, body) {
    applyOfflineTankScope();
    const res = await LocalApi.handle(method, apiPath, body);
    if (res.status >= 400) {
      const err = new Error((res.body && res.body.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      err.data = res.body;
      throw err;
    }
    return res.body;
  }

  async function localFetch(method, path, body) {
    await LocalApi.start();
    applyOfflineTankScope();

    if (method === 'GET' && path === '/api/shell/vessels') {
      const st = await localApi('GET', '/api/status');
      return { vessels: (st && st.vessels) || [], activeVesselId: (st && st.activeVesselId) || null };
    }
    const vesselGet = path.match(/^\/api\/shell\/vessels\/([^/]+)$/);
    if (method === 'GET' && vesselGet) {
      const bundle = await localApi('GET', '/api/vessels/' + decodeURIComponent(vesselGet[1]));
      return {
        vessel: bundle.vessel,
        assets: bundle.assets,
        meta: bundle.meta,
      };
    }
    if (method === 'POST' && path === '/api/shell/vessels/active') {
      return localApi('POST', '/api/vessels/active', body);
    }
    if (method === 'POST' && path === '/api/shell/vessels') {
      return localApi('POST', '/api/vessels', body);
    }
    const vesselMut = path.match(/^\/api\/shell\/vessels\/([^/]+)$/);
    if (method === 'PUT' && vesselMut) {
      return localApi('PUT', '/api/vessels/' + decodeURIComponent(vesselMut[1]), body);
    }
    const assetsPut = path.match(/^\/api\/shell\/vessels\/([^/]+)\/assets$/);
    if (method === 'PUT' && assetsPut) {
      return localApi('PUT', '/api/vessels/' + decodeURIComponent(assetsPut[1]) + '/assets', body);
    }
    if (method === 'DELETE' && vesselMut) {
      return localApi('DELETE', '/api/vessels/' + decodeURIComponent(vesselMut[1]));
    }
    if (method === 'GET' && path === '/api/health') {
      const health = await localApi('GET', '/api/health');
      return {
        ok: true,
        product: 'cheng-aio',
        version: (typeof window !== 'undefined' && window.CHENG_PRO_VERSION)
          ? String(window.CHENG_PRO_VERSION).replace(/^v/i, '')
          : 'bundled',
        modules: {
          tanks: { ok: true, ...(health || {}) },
          voyage: { ok: false, note: 'Configure sync URL in Voyage Chief when online' },
        },
      };
    }

    /* Home tank overview + Backup call /tanks/api/* — map onto LocalApi /api/*. */
    const apiPath = localApiPath(path);
    if (apiPath.startsWith('/api/') && !apiPath.startsWith('/api/shell')) {
      return localApi(method, apiPath, body);
    }

    throw new Error('Unsupported offline shell request: ' + method + ' ' + path);
  }

  const origApi = ChengProApi.api.bind(ChengProApi);

  ChengProApi.api = async function shellApi(path, options = {}) {
    if (!useLocalShell()) {
      const base = getServerBase();
      const url = path.startsWith('/api/shell')
        ? `${base}${path}`
        : `${base}${path.startsWith('/') ? path : '/' + path}`;
      try {
        return await origApi(url, options);
      } catch (err) {
        /* Offline with server transport — fall back to on-device so Vessel holds. */
        if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(err.message || '')) {
          console.warn('ChEng AIO shell: server unreachable, using on-device vessel store');
          const method = (options.method || 'GET').toUpperCase();
          let body = options.body;
          if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { /* leave */ }
          }
          return localFetch(method, path, body);
        }
        throw err;
      }
    }
    const method = (options.method || 'GET').toUpperCase();
    let body = options.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* leave as string */ }
    }
    return localFetch(method, path, body);
  };
})();
