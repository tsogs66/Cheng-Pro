/**
 * Sync Tank Chief active vessel with Cheng-Pro shell.
 */
(function () {
  const KEY = 'chengProActiveVesselId';

  function readShellVessel() {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function writeShellVessel(id) {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
  }

  async function applyFromShell() {
    if (typeof Api === 'undefined') return;
    const id = readShellVessel();
    if (!id) return;
    try {
      const st = await Api.getStatus();
      if (st.activeVesselId === id) return;
      const vessels = (st.vessels || []).map((v) => v.id);
      if (!vessels.includes(id)) return;
      await Api.setActive(id);
      if (window.STATE) {
        window.STATE.activeVesselId = id;
        if (typeof window.reloadBundle === 'function') await window.reloadBundle();
      }
    } catch (e) {
      console.warn('Cheng-Pro vessel sync:', e.message);
    }
  }

  // After tank app sets active, mirror to shell
  const origSetActive = null;
  document.addEventListener('DOMContentLoaded', () => {
    applyFromShell();
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) applyFromShell();
    });
  });

  // Hook Api.setActive after Api loads — wrap once app boots
  const timer = setInterval(() => {
    if (typeof Api === 'undefined' || !Api.setActive || Api._chengWrapped) return;
    clearInterval(timer);
    const inner = Api.setActive.bind(Api);
    Api.setActive = async (id) => {
      const out = await inner(id);
      writeShellVessel(id);
      return out;
    };
    Api._chengWrapped = true;
    applyFromShell();
  }, 50);
})();
