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
    openTanks: () => {
      if (window.ChengLicense && !ChengLicense.moduleAllowed('tanks')) {
        window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: 'Tank Chief not on this license' }));
        return;
      }
      try { localStorage.setItem('chengAioEmbedded', '1'); } catch { /* ignore */ }
      const base = (window.ChengProBundled && ChengProBundled.isBundledClient())
        ? ChengProBundled.moduleUrl('tanks')
        : '/tanks/';
      window.location.href = base + (base.includes('?') ? '&' : '?') + 'chengaio=1';
    },
    openVoyage: (opts) => {
      if (window.ChengLicense && !ChengLicense.moduleAllowed('voyage') && !(opts && opts.page === 'orb' && ChengLicense.moduleAllowed('eorb'))) {
        window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: 'Voyage Chief not on this license' }));
        return;
      }
      try { localStorage.setItem('chengAioEmbedded', '1'); } catch { /* ignore */ }
      const base = (window.ChengProBundled && ChengProBundled.isBundledClient())
        ? ChengProBundled.moduleUrl('voyage')
        : '/voyage/';
      const url = base.includes('voyage_manager') ? base : (base.replace(/\/?$/, '/') + 'voyage_manager.html');
      const q = new URLSearchParams({ chengaio: '1' });
      if (opts && opts.page) q.set('page', String(opts.page));
      window.location.href = url + (url.includes('?') ? '&' : '?') + q.toString();
    },
    openEorb: () => {
      if (window.ChengLicense && !ChengLicense.eorbLicensed()) {
        window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: 'e-ORB requires ChEng AIO or an e-ORB add-on' }));
        return;
      }
      root.ChengPro.openVoyage({ page: 'orb' });
    },
  };
})(window);
