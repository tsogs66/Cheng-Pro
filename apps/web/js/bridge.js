(function (root) {
  const listeners = new Set();
  let active = null;
  let list = [];
  let session = null;

  function emit() {
    for (const fn of listeners) {
      try { fn(active); } catch (e) { console.error(e); }
    }
  }

  async function refreshList() {
    try {
      const data = await ChengProApi.api('/api/shell/vessels');
      list = data.vessels || [];
      const id = data.activeVesselId || ChengProApi.getActiveId();
      if (id) {
        ChengProApi.setActiveId(id);
        try {
          const shared = await ChengProApi.api('/api/shell/vessels/' + encodeURIComponent(id));
          active = shared.vessel;
        } catch {
          active = list.find((v) => v.id === id) || null;
        }
      } else {
        active = null;
        ChengProApi.setActiveId('');
      }
      emit();
      return { list, active };
    } catch (err) {
      /* Keep any known list so Vessel Setup still opens for create/edit. */
      emit();
      throw err;
    }
  }

  async function setActive(id) {
    await ChengProApi.api('/api/shell/vessels/active', {
      method: 'POST',
      body: JSON.stringify({ id: id || null }),
    });
    ChengProApi.setActiveId(id || '');
    return refreshList();
  }

  root.ChengPro = {
    vessel: {
      getActive: () => active,
      list: async () => {
        if (!list.length) {
          try {
            await refreshList();
          } catch (err) {
            console.warn('ChEng AIO vessel list:', err.message);
          }
        }
        return list.slice();
      },
      getListSync: () => list.slice(),
      setActive,
      refresh: refreshList,
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    auth: {
      session: () => session,
      setSession: (s) => { session = s; },
    },
    api: {
      fetch: (path, init) => ChengProApi.api(path, init),
    },
    tankEmbedUrl: () => {
      const base = (window.ChengProBundled && ChengProBundled.isBundledClient())
        ? ChengProBundled.moduleUrl('tanks')
        : '/tanks/';
      const url = base.includes('index.html')
        ? base
        : (base.replace(/\/?$/, '/') + 'index.html');
      const q = new URLSearchParams({ chengaio: '1' });
      return url + (url.includes('?') ? '&' : '?') + q.toString();
    },
    openTanks: () => {
      if (window.ChengLicense && !ChengLicense.moduleAllowed('tanks')) {
        window.dispatchEvent(new CustomEvent('chengpro:toast', {
          detail: 'Tank Chief is not on this license — ask the office to include it on your ChEng AIO key.',
        }));
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'tanks' }));
        return;
      }
      try { localStorage.setItem('chengAioEmbedded', '1'); } catch { /* ignore */ }
      /* Stay in the AIO shell so bottom nav (Home) remains available. */
      if (root.ChengProModules && root.ChengProModules.tanks) {
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'tanks' }));
        return;
      }
      window.location.href = root.ChengPro.tankEmbedUrl();
    },
    voyageEmbedUrl: (opts) => {
      const base = (window.ChengProBundled && ChengProBundled.isBundledClient())
        ? ChengProBundled.moduleUrl('voyage')
        : '/voyage/';
      const url = base.includes('voyage_manager') || base.includes('index.html')
        ? base
        : (base.replace(/\/?$/, '/') + 'voyage_manager.html');
      const q = new URLSearchParams({ chengaio: '1' });
      if (opts && opts.page) q.set('page', String(opts.page));
      if (opts && opts.eorbEmbed) q.set('eorbEmbed', String(opts.eorbEmbed));
      return url + (url.includes('?') ? '&' : '?') + q.toString();
    },
    openVoyage: (opts) => {
      if (window.ChengLicense && !ChengLicense.moduleAllowed('voyage')
          && !(opts && opts.page === 'orb' && ChengLicense.moduleAllowed('eorb'))) {
        window.dispatchEvent(new CustomEvent('chengpro:toast', {
          detail: 'Voyage Chief is not on this license — ask the office to include it on your ChEng AIO key.',
        }));
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'voyage' }));
        return;
      }
      try { localStorage.setItem('chengAioEmbedded', '1'); } catch { /* ignore */ }
      if (root.ChengProModules) {
        if (opts && opts.page === 'orb') {
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'eorb' }));
          return;
        }
        if (root.ChengProModules.voyage) {
          window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'voyage' }));
          return;
        }
      }
      window.location.href = root.ChengPro.voyageEmbedUrl(opts || {});
    },
    openEorb: () => {
      if (window.ChengLicense && !ChengLicense.eorbLicensed()) {
        window.dispatchEvent(new CustomEvent('chengpro:toast', {
          detail: 'e-ORB is not on this license',
        }));
        return;
      }
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'eorb' }));
    },
  };
})(window);
