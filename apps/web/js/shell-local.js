/**
 * On-device shell: talk to the embedded Tank Chief LocalApi when this device
 * is in local/offline mode. Peer sync URL must NOT force vessel APIs online —
 * that made Vessel Setup show "Request failed" with no vessels on airplane mode.
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

  async function localFetch(method, path, body) {
    await LocalApi.start();
    if (method === 'GET' && path === '/api/shell/vessels') {
      const res = await LocalApi.handle('GET', '/api/status');
      if (res.status >= 400) throw new Error((res.body && res.body.error) || 'Request failed');
      return { vessels: res.body.vessels || [], activeVesselId: res.body.activeVesselId || null };
    }
    const vesselGet = path.match(/^\/api\/shell\/vessels\/([^/]+)$/);
    if (method === 'GET' && vesselGet) {
      const res = await LocalApi.handle('GET', '/api/vessels/' + vesselGet[1]);
      if (res.status >= 404) throw new Error((res.body && res.body.error) || 'Vessel not found');
      return {
        vessel: res.body.vessel,
        assets: res.body.assets,
        meta: res.body.meta,
      };
    }
    if (method === 'POST' && path === '/api/shell/vessels/active') {
      const res = await LocalApi.handle('POST', '/api/vessels/active', body);
      if (res.status >= 400) throw new Error((res.body && res.body.error) || 'Request failed');
      return res.body;
    }
    if (method === 'POST' && path === '/api/shell/vessels') {
      const res = await LocalApi.handle('POST', '/api/vessels', body);
      if (res.status >= 400) throw new Error((res.body && res.body.error) || 'Request failed');
      return res.body;
    }
    const vesselMut = path.match(/^\/api\/shell\/vessels\/([^/]+)$/);
    if (method === 'PUT' && vesselMut) {
      const res = await LocalApi.handle('PUT', '/api/vessels/' + vesselMut[1], body);
      if (res.status >= 400) throw new Error((res.body && res.body.error) || 'Request failed');
      return res.body;
    }
    const assetsPut = path.match(/^\/api\/shell\/vessels\/([^/]+)\/assets$/);
    if (method === 'PUT' && assetsPut) {
      const res = await LocalApi.handle('PUT', '/api/vessels/' + assetsPut[1] + '/assets', body);
      if (res.status >= 400) throw new Error((res.body && res.body.error) || 'Request failed');
      return res.body;
    }
    if (method === 'DELETE' && vesselMut) {
      const res = await LocalApi.handle('DELETE', '/api/vessels/' + vesselMut[1]);
      if (res.status >= 400) throw new Error((res.body && res.body.error) || 'Request failed');
      return res.body;
    }
    if (method === 'GET' && path === '/api/health') {
      const res = await LocalApi.handle('GET', '/api/health');
      return {
        ok: true,
        product: 'cheng-aio',
        version: 'bundled',
        modules: {
          tanks: { ok: res.status < 400, ...(res.body || {}) },
          voyage: { ok: false, note: 'Configure sync URL in Voyage Chief when online' },
        },
      };
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
