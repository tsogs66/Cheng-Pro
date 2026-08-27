(function (root) {
  const listeners = new Set();
  let active = null;
  let list = [];
  let session = null;

  function emit() {
    for (const fn of listeners) {
      try { fn(active); } catch (e) { console.error(fn, e); }
    }
  }

  async function refreshList() {
    const data = await ChengProApi.api('/api/vessels');
    list = data.vessels || [];
    const id = data.activeVesselId;
    if (id) {
      try {
        const shared = await ChengProApi.api('/api/vessels/' + encodeURIComponent(id));
        active = shared.vessel;
      } catch {
        active = list.find((v) => v.id === id) || null;
      }
    } else {
      active = null;
    }
    emit();
    return { list, active };
  }

  async function setActive(id) {
    await ChengProApi.api('/api/vessels/active', {
      method: 'POST',
      body: JSON.stringify({ id: id || null }),
    });
    return refreshList();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
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
      subscribe,
    },
    auth: {
      session: () => session,
      setSession: (s) => { session = s; },
    },
    api: {
      fetch: (path, init) => ChengProApi.api(path, init),
    },
  };
})(window);
