(function () {
  const TOKEN_KEY = 'chengProSessionToken';
  const VESSEL_KEY = 'chengProActiveVesselId';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
  }
  function getActiveId() {
    try { return localStorage.getItem(VESSEL_KEY) || ''; } catch { return ''; }
  }
  function setActiveId(id) {
    try {
      if (id) localStorage.setItem(VESSEL_KEY, id);
      else localStorage.removeItem(VESSEL_KEY);
    } catch { /* ignore */ }
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) {
      headers['X-Session-Token'] = token;
      headers.Authorization = 'Bearer ' + token;
    }
    try {
      if (typeof ChengLicense !== 'undefined' && ChengLicense.authHeaders) {
        Object.assign(headers, ChengLicense.authHeaders());
      }
    } catch { /* ignore */ }
    const res = await fetch(path, { ...options, headers });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.ChengProApi = { api, getToken, setToken, getActiveId, setActiveId, VESSEL_KEY };
})(window);
