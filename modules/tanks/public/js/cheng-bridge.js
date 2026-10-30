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

  function readParentAssets() {
    try {
      if (window.parent && window.parent !== window && window.parent.ChengPro
          && window.parent.ChengPro.vessel
          && typeof window.parent.ChengPro.vessel.getAssets === 'function') {
        return window.parent.ChengPro.vessel.getAssets();
      }
    } catch { /* cross-origin or not embedded */ }
    return null;
  }

  /**
   * Copy AIO Vessel Setup Chief Engineer + signatures onto the Tank folder
   * this iframe is actually printing from. Folder ids often differ, so a
   * GET of the resolved tank vessel.json can still be empty after the hub save.
   */
  async function overlayAioIdentityFromParent(incoming) {
    const parent = (incoming && incoming.vessel) || readParentVessel();
    const assets = (incoming && incoming.assets) || readParentAssets();
    if (!parent && !assets) return;
    const state = typeof STATE !== 'undefined' ? STATE : null;
    if (window.FuelReport && typeof FuelReport.applyAioIdentity === 'function') {
      FuelReport.applyAioIdentity();
    } else if (state && state.bundle && window.FuelReport
        && typeof FuelReport.overlayAioIdentity === 'function') {
      state.bundle = FuelReport.overlayAioIdentity(state.bundle);
    }
    if (typeof Api === 'undefined' || !state || !state.activeVesselId) return;
    const name = String((parent && parent.chiefEngineer) || '').trim();
    try {
      if (name) {
        await Api.updateVessel(state.activeVesselId, { chiefEngineer: name });
        if (state.bundle && state.bundle.vessel) state.bundle.vessel.chiefEngineer = name;
      }
      if (assets) {
        const local = (state.bundle && state.bundle.assets) || { vesselLogo: null, chEngSignatures: {} };
        const merged = {
          vesselLogo: assets.vesselLogo || local.vesselLogo || null,
          chEngSignatures: Object.assign({}, local.chEngSignatures || {}, assets.chEngSignatures || {}),
        };
        if (typeof Api.savePart === 'function') {
          await Api.savePart(state.activeVesselId, 'assets', merged);
        }
        if (state.bundle) state.bundle.assets = merged;
      }
    } catch (err) {
      console.warn('AIO identity persist:', err && err.message);
    }
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

  let pendingForceReload = false;

  async function applyFromShell(forceReload) {
    if (typeof Api === 'undefined' || !Api.setActive) {
      if (forceReload) pendingForceReload = true;
      return;
    }
    const force = !!forceReload || pendingForceReload;
    pendingForceReload = false;
    const shellId = readShellVessel();
    const hint = readShellHint() || readParentVessel() || (shellId ? { id: shellId } : null);
    if (!shellId && !hint) return;
    try {
      const st = await Api.getStatus();
      const resolved = resolveTankVesselId(st.vessels || [], shellId, hint);
      if (!resolved) {
        if (force) {
          try {
            window.parent.postMessage({
              type: 'chengaio-vessel-data-loaded',
              program: 'tanks',
              ok: false,
            }, '*');
          } catch { /* ignore */ }
        }
        return;
      }
      const already = st.activeVesselId === resolved;
      if (already && !force) {
        await overlayAioIdentityFromParent();
        return;
      }
      if (!already && typeof window.flushUnsavedTankWork === 'function') {
        try { await window.flushUnsavedTankWork(); } catch (err) { console.warn(err); }
      }
      Api._chengApplying = true;
      try {
        if (!already) await Api.setActive(resolved);
      } finally {
        Api._chengApplying = false;
      }
      /* Keep the shell's preferred id in localStorage — Tank folder id may differ. */
      if (shellId) writeShellVessel(shellId);
      if (window.STATE) {
        window.STATE.activeVesselId = resolved;
        if (typeof window.reloadBundle === 'function') await window.reloadBundle();
        if (force && typeof window.render === 'function') window.render();
      }
      await overlayAioIdentityFromParent();
      if (force) {
        try {
          window.parent.postMessage({
            type: 'chengaio-vessel-data-loaded',
            program: 'tanks',
            ok: true,
            vesselId: resolved,
          }, '*');
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn('Cheng-Pro vessel sync:', e.message);
      if (force) {
        try {
          window.parent.postMessage({
            type: 'chengaio-vessel-data-loaded',
            program: 'tanks',
            ok: false,
            error: e.message,
          }, '*');
        } catch { /* ignore */ }
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyFromShell();
    window.addEventListener('storage', (e) => {
      if (e.key === KEY || e.key === HINT_KEY) applyFromShell();
    });
    window.addEventListener('message', (ev) => {
      const msg = ev && ev.data;
      if (!msg) return;
      if (msg.type === 'chengaio-tank-saved-reports') {
        const run = (async () => {
          const state = typeof STATE !== 'undefined' ? STATE : null;
          const b = (state && state.bundle) || {};
          const vessel = b.vessel || {};
          const bunker = b.bunkerHistory && typeof b.bunkerHistory === 'object' ? b.bunkerHistory : {};
          return {
            vesselId: (state && state.activeVesselId) || vessel.id || '',
            name: vessel.name || '',
            imo: vessel.imo || vessel.imoNo || '',
            vessel: {
              id: (state && state.activeVesselId) || vessel.id || '',
              name: vessel.name || '',
              imo: vessel.imo || vessel.imoNo || '',
            },
            reportHistory: Array.isArray(b.reportHistory) ? b.reportHistory : [],
            voyageHistory: Array.isArray(b.voyageHistory) ? b.voyageHistory : [],
            tankSummaryHistory: Array.isArray(b.tankSummaryHistory) ? b.tankSummaryHistory : [],
            bunkerHistory: {
              plans: Array.isArray(bunker.plans) ? bunker.plans : [],
              after: Array.isArray(bunker.after) ? bunker.after : [],
              summaries: Array.isArray(bunker.summaries) ? bunker.summaries : [],
            },
            readings: b.readings && typeof b.readings === 'object' ? b.readings : {},
            fuelReport: b.fuelReport || null,
            tankSummaryDraft: b.tankSummaryDraft || null,
            bunkerPlan: b.bunkerPlan || null,
            bunkerAfter: b.bunkerAfter || null,
            bunkerSummary: b.bunkerSummary || null,
          };
        })();
        Promise.resolve(run).then((bundle) => {
          try {
            window.parent.postMessage({
              type: 'chengaio-tank-saved-reports',
              nonce: msg.nonce || '',
              bundle,
            }, '*');
          } catch { /* ignore */ }
        }).catch((err) => {
          try {
            window.parent.postMessage({
              type: 'chengaio-tank-saved-reports',
              nonce: msg.nonce || '',
              error: err && err.message,
            }, '*');
          } catch { /* ignore */ }
        });
        return;
      }
      if (msg.type === 'chengaio-flush-unsaved') {
        const run = typeof window.flushUnsavedTankWork === 'function'
          ? window.flushUnsavedTankWork()
          : Promise.resolve();
        Promise.resolve(run).then(() => {
          try {
            window.parent.postMessage({
              type: 'chengaio-unsaved-flushed',
              program: 'tanks',
              nonce: msg.nonce || '',
            }, '*');
          } catch { /* ignore */ }
        }).catch((err) => {
          try {
            window.parent.postMessage({
              type: 'chengaio-unsaved-flushed',
              program: 'tanks',
              nonce: msg.nonce || '',
              error: err && err.message,
            }, '*');
          } catch { /* ignore */ }
        });
        return;
      }
      if (msg.type === 'chengaio-load-vessel-data') {
        applyFromShell(true);
        return;
      }
      if (msg.type === 'chengaio-identity-changed') {
        overlayAioIdentityFromParent(msg).catch((err) => {
          console.warn('AIO identity overlay:', err && err.message);
        });
        return;
      }
      if (msg.type !== 'chengaio-vessel-changed') return;
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
    applyFromShell(pendingForceReload);
  }, 50);
})();
