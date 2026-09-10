/**
 * Sync Tank Chief active vessel with Cheng-Pro shell.
 * Shell folder ids often differ from Tank folder ids — resolve by IMO / name.
 */
(function () {
  const KEY = 'chengProActiveVesselId';
  const HINT_KEY = 'chengProActiveVesselHint';

  function readShellVessel() {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function writeShellVessel(id) {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
  }

  function readShellHint() {
    try {
      const raw = localStorage.getItem(HINT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function readParentVessel() {
    try {
      if (window.parent && window.parent !== window && window.parent.ChengPro
          && window.parent.ChengPro.vessel
          && typeof window.parent.ChengPro.vessel.getActive === 'function') {
        return window.parent.ChengPro.vessel.getActive();
      }
    } catch { /* cross-origin or not embedded */ }
    return null;
  }

  function normalizeImo(imo) {
    return String(imo || '').replace(/^IMO\s*/i, '').replace(/\D/g, '').trim();
  }

  function stripShipNamePrefix(name) {
    let s = String(name || '').trim();
    let prev = '';
    while (s !== prev) {
      prev = s;
      s = s.replace(/^(m\s*[./]?\s*v\.?)\s+/i, '').trim();
    }
    return s;
  }

  function normalizeName(name) {
    return stripShipNamePrefix(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(name) {
    const core = stripShipNamePrefix(name) || String(name || 'vessel');
    return String(core)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'vessel';
  }

  function resolveTankVesselId(vessels, shellId, hint) {
    const list = Array.isArray(vessels) ? vessels : [];
    if (shellId && list.some((v) => v.id === shellId)) return shellId;
    const h = hint || {};
    const imo = normalizeImo(h.imo);
    if (imo) {
      const byImo = list.find((v) => normalizeImo(v.imo) === imo);
      if (byImo) return byImo.id;
    }
    const name = h.name || h.vesselName || '';
    const slug = slugify(name);
    const slugCore = slugify(name);
    const bySlug = list.find((v) =>
      v.id === shellId || v.id === h.id
      || v.id === slug || v.id === slugCore
      || (h.slug && v.id === h.slug)
    );
    if (bySlug) return bySlug.id;
    const nameKey = normalizeName(name);
    if (nameKey) {
      const byName = list.find((v) => normalizeName(v.name) === nameKey);
      if (byName) return byName.id;
    }
    return null;
  }

  async function applyFromShell() {
    if (typeof Api === 'undefined') return;
    const shellId = readShellVessel();
    const hint = readShellHint() || readParentVessel() || (shellId ? { id: shellId } : null);
    if (!shellId && !hint) return;
    try {
      const st = await Api.getStatus();
      const resolved = resolveTankVesselId(st.vessels || [], shellId, hint);
      if (!resolved) return;
      if (st.activeVesselId === resolved) return;
      Api._chengApplying = true;
      try {
        await Api.setActive(resolved);
      } finally {
        Api._chengApplying = false;
      }
      /* Keep the shell's preferred id in localStorage — Tank folder id may differ. */
      if (shellId) writeShellVessel(shellId);
      if (window.STATE) {
        window.STATE.activeVesselId = resolved;
        if (typeof window.reloadBundle === 'function') await window.reloadBundle();
      }
    } catch (e) {
      console.warn('Cheng-Pro vessel sync:', e.message);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyFromShell();
    window.addEventListener('storage', (e) => {
      if (e.key === KEY || e.key === HINT_KEY) applyFromShell();
    });
    window.addEventListener('message', (ev) => {
      const msg = ev && ev.data;
      if (!msg || msg.type !== 'chengaio-vessel-changed') return;
      applyFromShell();
    });
  });

  const timer = setInterval(() => {
    if (typeof Api === 'undefined' || !Api.setActive || Api._chengWrapped) return;
    clearInterval(timer);
    const inner = Api.setActive.bind(Api);
    Api.setActive = async (id) => {
      const out = await inner(id);
      /* Do not overwrite AIO shell id while applying a resolved Tank folder id. */
      if (!Api._chengApplying) writeShellVessel(id);
      return out;
    };
    Api._chengWrapped = true;
    applyFromShell();
  }, 50);
})();
