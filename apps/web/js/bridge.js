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
        if (!list.length) await refreshList();
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
    openTanks: () => { window.location.href = '/tanks/'; },
    openVoyage: () => { window.location.href = '/voyage/'; },
  };
})(window);
