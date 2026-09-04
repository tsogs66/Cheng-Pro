(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function toast(msg) {
    window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: msg }));
  }

  const SUITE_FORMAT = 'cheng-aio-suite-v1';

  function downloadWhereLabel(saved) {
    if (window.ChengSaveFile) return ChengSaveFile.whereLabel(saved);
    if (!saved) return 'saved';
    return `started — check Downloads for ${saved.filename}`;
  }

  /** Save JSON where the user can find it — see js/save-file.js for the order. */
  async function downloadJson(name, data) {
    const safeName = name || `cheng-aio-backup-${Date.now()}.json`;
    if (window.ChengSaveFile) return ChengSaveFile.saveJson(safeName, data);
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { a.remove(); } catch (_) { /* ignore */ }
      try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
    }, 4000);
    return { method: 'anchor', filename: safeName };
  }

  function readFileJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(String(reader.result || ''))); }
        catch (e) { reject(new Error('Invalid JSON file')); }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  /* ------------------------------------------------------------ Tank Chief --
   *
   * Tank Chief keeps two separate databases and which one is in use is a
   * setting, not a guess: `server` is the Express API over HTTP, `local` runs
   * the same routes on this device over IndexedDB. The phone application and
   * the portable build have no server at all.
   *
   * This screen used to fetch('/tanks/api/backup') unconditionally, so on the
   * APK — the one place a chief engineer most needs a backup he can hand over
   * — every button here failed, or worse, saved the shell's index.html. It now
   * asks whichever database the rest of Tank Chief is actually writing to.
   */
  const TRANSPORT_KEY = 'apiTransport';

  function bundledClient() {
    return !!(window.ChengProBundled && ChengProBundled.isBundledClient());
  }

  function tankTransport() {
    try {
      const saved = localStorage.getItem(TRANSPORT_KEY);
      if (saved === 'local' || saved === 'server') return saved;
    } catch { /* private mode */ }
    return bundledClient() ? 'local' : 'server';
  }

  function canUseLocalTank() {
    return typeof LocalApi !== 'undefined' && typeof LocalApi.handle === 'function';
  }

  function usingLocalTank() {
    return tankTransport() === 'local' && canUseLocalTank();
  }

  /** Where this screen's Tank data is coming from, for the status line. */
  function tankSourceLabel() {
    return usingLocalTank() ? 'this device' : 'the server';
  }

  async function tankRequest(path, options = {}) {
    if (usingLocalTank()) {
      await LocalApi.start();
      let body = options.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* leave as text */ }
      }
      const res = await LocalApi.handle(options.method || 'GET', path, body);
      if (res.status >= 400) {
        throw new Error((res.body && res.body.error) || 'Request failed');
      }
      return res.body;
    }
    return ChengProApi.api('/tanks' + path, options);
  }

  function importTankBackup(backup, merge) {
    return tankRequest('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify({ backup, merge: String(!!merge) }),
    });
  }

  /* ---------------------------------------------------------- Voyage Chief --
   * Voyage Chief owns its IndexedDB inside its own frame, so the shell asks it
   * over postMessage rather than reaching into the database itself. */

  let voyageFrame = null;
  let voyageReady = false;
  const pendingVoyage = {};

  function ensureVoyageFrame(host) {
    if (voyageFrame) return voyageFrame;
    voyageFrame = document.createElement('iframe');
    voyageFrame.className = 'aio-backup-voyage-frame';
    voyageFrame.title = 'Voyage Chief backup bridge';
    voyageFrame.src = ChengPro.voyageEmbedUrl({ page: 'data' });
    voyageFrame.hidden = true;
    host.appendChild(voyageFrame);
    window.addEventListener('message', (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'chengaio-voyage-ready') voyageReady = true;
      if (msg.type === 'chengaio-voyage-backup-result' && msg.requestId && pendingVoyage[msg.requestId]) {
        const { resolve, reject } = pendingVoyage[msg.requestId];
        delete pendingVoyage[msg.requestId];
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg);
      }
    });
    return voyageFrame;
  }

  async function voyagePost(action, extra, host) {
    ensureVoyageFrame(host);
    const requestId = 'bk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < 600 && !voyageReady; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!voyageReady || !voyageFrame.contentWindow) {
      throw new Error('Voyage Chief is still loading — wait a moment and try again');
    }
    return new Promise((resolve, reject) => {
      pendingVoyage[requestId] = { resolve, reject };
      voyageFrame.contentWindow.postMessage({
        type: 'chengaio-voyage-backup',
        action,
        requestId,
        ...extra,
      }, '*');
      setTimeout(() => {
        if (!pendingVoyage[requestId]) return;
        delete pendingVoyage[requestId];
        reject(new Error('Voyage Chief did not respond — open Voyage once, then retry'));
      }, 120000);
    });
  }

  /* ---------------------------------------------------------- suite bundle -- */

  function isSuiteBundle(payload) {
    return !!(payload && payload.format === SUITE_FORMAT);
  }

  function suiteSummary(payload) {
    const tankVessels = payload.tank && payload.tank.vessels
      ? Object.keys(payload.tank.vessels).length : 0;
    const voyageVessels = payload.voyage && Array.isArray(payload.voyage.vessels)
      ? payload.voyage.vessels.length : 0;
    const parts = [];
    parts.push(`Tank Chief: ${payload.tank ? `${tankVessels} vessel(s)` : 'not in this file'}`);
    parts.push(`Voyage Chief: ${payload.voyage ? `${voyageVessels} vessel(s)` : 'not in this file'}`);
    if (payload.exportedAt) parts.push(`exported ${payload.exportedAt}`);
    return parts.join(' · ');
  }

  window.ChengProModules = window.ChengProModules || {};
  window.ChengProModules.backup = {
    title: 'Backup / Restore',
    async render(root) {
      const ent = typeof ChengLicense !== 'undefined' ? ChengLicense.loadEntitlement() : null;
      const isMaster = ent && ChengLicense.isMaster && ChengLicense.isMaster(ent);
      const active = ChengPro.vessel.getActive();
      const activeLabel = active
        ? `${active.name}${active.imo ? ' · ' + active.imo : ''}`
        : 'none selected';

      root.innerHTML = `
        <section class="panel backup-page">
          <h1>Backup &amp; Restore</h1>
          <p class="hint">Export or import vessel databases offline. On the phone the file is written to <strong>Downloads/ChEngAIO</strong>; on desktop you are asked where to save it. If a share sheet opens instead, choose <strong>Save to Files / Drive / USB</strong> — dismissing it writes nothing.</p>
          <p class="hint">Tank Chief data on this screen comes from <strong>${esc(tankSourceLabel())}</strong> — the same database Tank Chief itself is set to (Tank Chief → Backup / Sync).</p>
          <p class="hint">${isMaster ? 'Master license: full-database Tank backups include all user accounts on this server.' : 'Your license email scopes Tank backups and sync to your account only.'}</p>

          <div class="form-panel" style="margin-bottom:16px">
            <h2>Entire suite (Tank + Voyage)</h2>
            <p class="hint">One JSON file with both Tank Chief and Voyage Chief databases from this device/server, and one restore that puts both back. Active vessel: <strong>${esc(activeLabel)}</strong></p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-suite-all">Export entire program</button>
              <button type="button" class="btn" id="bk-suite-restore">Restore entire program…</button>
              <button type="button" class="btn" id="bk-suite-merge">Merge entire program…</button>
              <input type="file" id="bk-suite-file" accept="application/json,.json" hidden>
            </div>
            <p class="hint" id="bk-suite-status">Ready.</p>
          </div>

          <div class="backup-grid">
            <div class="form-panel">
              <h2>Tank Chief — vessel database</h2>
              <p class="hint">JSON backup of tanks, calibrations, readings, bunkering and settings. Active vessel: <strong>${esc(activeLabel)}</strong></p>
              <div class="btn-row">
                <button type="button" class="btn primary" id="bk-tank-full">Download full backup</button>
                <button type="button" class="btn" id="bk-tank-import">Import backup…</button>
                <input type="file" id="bk-tank-file" accept="application/json,.json" hidden>
              </div>
              <div class="btn-row" style="margin-top:10px">
                <button type="button" class="btn" id="bk-tank-vessel" ${active ? '' : 'disabled'}>Export active vessel</button>
                <button type="button" class="btn" id="bk-tank-vessel-import">Import vessel JSON…</button>
                <input type="file" id="bk-tank-vessel-file" accept="application/json,.json" hidden>
              </div>
              <p class="hint" id="bk-tank-status">Ready.</p>
            </div>

            <div class="form-panel">
              <h2>Voyage Chief — noon reports &amp; voyage legs</h2>
              <p class="hint">Full database or single-vessel export includes the voyage library (all B/L legs). Works offline on this device.</p>
              <div class="btn-row">
                <button type="button" class="btn primary" id="bk-voyage-db">Download voyage database</button>
                <button type="button" class="btn" id="bk-voyage-restore">Restore database…</button>
                <button type="button" class="btn" id="bk-voyage-merge">Merge database…</button>
                <input type="file" id="bk-voyage-db-file" accept="application/json,.json" hidden>
              </div>
              <div class="btn-row" style="margin-top:10px">
                <button type="button" class="btn" id="bk-voyage-vessel">Export selected vessel</button>
                <button type="button" class="btn" id="bk-voyage-vessel-import">Import vessel JSON…</button>
                <input type="file" id="bk-voyage-vessel-file" accept="application/json,.json" hidden>
              </div>
              <p class="hint" id="bk-voyage-status">Ready. Voyage legs can also be opened from Voyage → Vessel Data → Voyage Library.</p>
            </div>
          </div>
        </section>`;

      const tankStatus = root.querySelector('#bk-tank-status');
      const voyageStatus = root.querySelector('#bk-voyage-status');
      const suiteStatus = root.querySelector('#bk-suite-status');
      const setTank = (t) => { if (tankStatus) tankStatus.textContent = t; };
      const setVoyage = (t) => { if (voyageStatus) voyageStatus.textContent = t; };
      const setSuite = (t) => { if (suiteStatus) suiteStatus.textContent = t; };

      root.querySelector('#bk-suite-all').onclick = async () => {
        setSuite('Collecting Tank + Voyage databases…');
        try {
          let tankBackup = null;
          let tankError = null;
          try {
            tankBackup = await tankRequest('/api/backup');
          } catch (e) {
            tankError = e.message || 'Tank backup failed';
          }

          let voyageMsg = null;
          let voyageError = null;
          try {
            voyageMsg = await voyagePost('export-db', {}, root);
          } catch (e) {
            voyageError = e.message || 'Voyage backup failed';
          }

          if (!tankBackup && !(voyageMsg && voyageMsg.payload)) {
            throw new Error([tankError, voyageError].filter(Boolean).join(' · ') || 'Nothing to export');
          }

          const suite = {
            format: SUITE_FORMAT,
            exportedAt: new Date().toISOString(),
            tankSource: tankSourceLabel(),
            tank: tankBackup,
            tankError: tankError || null,
            voyage: (voyageMsg && voyageMsg.payload) || null,
            voyageFilename: (voyageMsg && voyageMsg.filename) || null,
            voyageError: voyageError || null,
          };
          const saved = await downloadJson(`cheng-aio-suite-${Date.now()}.json`, suite);
          const partial = [tankError && 'Tank', voyageError && 'Voyage'].filter(Boolean).join(' + ');
          setSuite(partial
            ? `Entire program ${downloadWhereLabel(saved)} — ${partial} could not be read (${[tankError, voyageError].filter(Boolean).join(' · ')}).`
            : `Entire program ${downloadWhereLabel(saved)}.`);
          toast(`Entire program ${downloadWhereLabel(saved)}`);
        } catch (e) {
          setSuite(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      /* Restoring the suite is the export read backwards: the Tank half goes
         through the same import the Tank card uses, the Voyage half through
         the same bridge call. Either half may be absent from the file, and a
         half that fails is reported rather than silently skipped. */
      const suiteImport = async (file, merge) => {
        const payload = await readFileJson(file);
        if (!isSuiteBundle(payload)) {
          throw new Error(`This is not an entire-program file (expected format ${SUITE_FORMAT}). Use the Tank or Voyage card for a single-program backup.`);
        }
        if (!payload.tank && !payload.voyage) {
          throw new Error('This entire-program file holds neither a Tank nor a Voyage database.');
        }
        const verb = merge ? 'Merge into' : 'REPLACE';
        if (!confirm(`${verb} this device from the entire-program file?\n\n${suiteSummary(payload)}\n\n${
          merge
            ? 'Records with the same id are overwritten by the file; nothing else is removed.'
            : 'Voyage Chief data in this browser is erased first. Export a backup before you continue.'
        }`)) {
          setSuite('Restore cancelled — nothing was changed.');
          return;
        }

        const done = [];
        const failed = [];

        if (payload.tank) {
          setSuite('Restoring Tank Chief…');
          try {
            const res = await importTankBackup(payload.tank, merge);
            const n = res && res.imported != null ? res.imported : (res && res.vesselCount) || 0;
            done.push(`Tank Chief (${n} vessel${n === 1 ? '' : 's'})`);
          } catch (e) {
            failed.push('Tank Chief: ' + (e.message || 'import failed'));
          }
        }

        if (payload.voyage) {
          setSuite('Restoring Voyage Chief…');
          try {
            const msg = await voyagePost(merge ? 'merge-db' : 'restore-db', { payload: payload.voyage }, root);
            done.push(msg.message || 'Voyage Chief');
          } catch (e) {
            failed.push('Voyage Chief: ' + (e.message || 'import failed'));
          }
        }

        try { await ChengPro.vessel.refresh(); } catch { /* ignore */ }

        if (!done.length) throw new Error(failed.join(' · ') || 'Nothing was restored');
        const summary = `Restored ${done.join(' · ')}${failed.length ? ` — but ${failed.join(' · ')}` : ''}`;
        setSuite(summary);
        toast(failed.length ? 'Restored with errors — see status' : 'Entire program restored');
      };

      root.querySelector('#bk-suite-restore').onclick = () => {
        const input = root.querySelector('#bk-suite-file');
        input.dataset.mode = 'restore';
        input.click();
      };
      root.querySelector('#bk-suite-merge').onclick = () => {
        const input = root.querySelector('#bk-suite-file');
        input.dataset.mode = 'merge';
        input.click();
      };
      root.querySelector('#bk-suite-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        const mode = ev.target.dataset.mode || 'restore';
        ev.target.value = '';
        if (!file) return;
        try {
          await suiteImport(file, mode === 'merge');
        } catch (e) {
          setSuite(e.message || 'Restore failed');
          toast(e.message || 'Restore failed');
        }
      };

      root.querySelector('#bk-tank-full').onclick = async () => {
        setTank(`Preparing Tank backup from ${tankSourceLabel()}…`);
        try {
          const backup = await tankRequest('/api/backup');
          const saved = await downloadJson(`tank-chief-backup-${Date.now()}.json`, backup);
          const n = backup && backup.vessels ? Object.keys(backup.vessels).length : 0;
          setTank(`Full backup ${downloadWhereLabel(saved)} (${n} vessel${n === 1 ? '' : 's'}).`);
          toast(`Tank backup ${downloadWhereLabel(saved)}`);
        } catch (e) {
          setTank(e.message || 'Backup failed');
          toast(e.message || 'Backup failed');
        }
      };

      root.querySelector('#bk-tank-import').onclick = () => root.querySelector('#bk-tank-file').click();
      root.querySelector('#bk-tank-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        if (!confirm(`Import this Tank backup into ${tankSourceLabel()}? Vessels already there are merged, not removed.`)) return;
        setTank('Importing Tank backup…');
        try {
          const backup = await readFileJson(file);
          const res = await importTankBackup(backup, true);
          await ChengPro.vessel.refresh();
          const n = res && res.imported != null ? res.imported : (res && res.vesselCount) || 0;
          setTank(`Tank backup imported into ${tankSourceLabel()} — ${n} vessel${n === 1 ? '' : 's'}.`);
          toast('Tank backup imported');
        } catch (e) {
          setTank(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-tank-vessel').onclick = async () => {
        if (!active) { toast('Select a vessel in the header first'); return; }
        setTank('Exporting active vessel…');
        try {
          const backup = await tankRequest('/api/vessels/' + encodeURIComponent(active.id) + '/backup');
          const saved = await downloadJson(`tank-chief-vessel-${active.id}-${Date.now()}.json`, backup);
          setTank(`Vessel ${active.name} ${downloadWhereLabel(saved)}.`);
          toast(`Vessel backup ${downloadWhereLabel(saved)}`);
        } catch (e) {
          setTank(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      root.querySelector('#bk-tank-vessel-import').onclick = () => root.querySelector('#bk-tank-vessel-file').click();
      root.querySelector('#bk-tank-vessel-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        setTank('Importing vessel JSON…');
        try {
          const backup = await readFileJson(file);
          await importTankBackup(backup, true);
          await ChengPro.vessel.refresh();
          setTank(`Vessel JSON imported into ${tankSourceLabel()}.`);
          toast('Vessel imported');
        } catch (e) {
          setTank(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-voyage-db').onclick = async () => {
        setVoyage('Building voyage database backup…');
        try {
          const msg = await voyagePost('export-db', {}, root);
          if (msg.payload) {
            const saved = await downloadJson(msg.filename || `voyage-chief-db-${Date.now()}.json`, msg.payload);
            setVoyage(`Voyage database ${downloadWhereLabel(saved)}.`);
            toast(`Voyage database ${downloadWhereLabel(saved)}`);
          }
        } catch (e) {
          setVoyage(e.message || 'Backup failed');
          toast(e.message || 'Backup failed');
        }
      };

      const voyageDbImport = async (file, merge) => {
        const payload = await readFileJson(file);
        setVoyage(merge ? 'Merging voyage database…' : 'Restoring voyage database…');
        const msg = await voyagePost(merge ? 'merge-db' : 'restore-db', { payload }, root);
        setVoyage(msg.message || 'Voyage database updated.');
        toast(msg.message || 'Voyage database updated');
      };

      root.querySelector('#bk-voyage-restore').onclick = () => {
        if (!confirm('Replace ALL Voyage Chief data in this browser? Export a backup first.')) return;
        root.querySelector('#bk-voyage-db-file').dataset.mode = 'restore';
        root.querySelector('#bk-voyage-db-file').click();
      };
      root.querySelector('#bk-voyage-merge').onclick = () => {
        root.querySelector('#bk-voyage-db-file').dataset.mode = 'merge';
        root.querySelector('#bk-voyage-db-file').click();
      };
      root.querySelector('#bk-voyage-db-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        const mode = ev.target.dataset.mode || 'restore';
        ev.target.value = '';
        if (!file) return;
        try {
          await voyageDbImport(file, mode === 'merge');
        } catch (e) {
          setVoyage(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      root.querySelector('#bk-voyage-vessel').onclick = async () => {
        setVoyage('Exporting voyage vessel…');
        try {
          const msg = await voyagePost('export-vessel', { vesselId: active && active.voyageSlug }, root);
          if (msg.payload) {
            const saved = await downloadJson(msg.filename || `voyage-vessel-${Date.now()}.json`, msg.payload);
            setVoyage(`Voyage vessel ${downloadWhereLabel(saved)}.`);
            toast(`Voyage vessel ${downloadWhereLabel(saved)}`);
          }
        } catch (e) {
          setVoyage(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      root.querySelector('#bk-voyage-vessel-import').onclick = () => root.querySelector('#bk-voyage-vessel-file').click();
      root.querySelector('#bk-voyage-vessel-file').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        try {
          const payload = await readFileJson(file);
          if (!confirm('Import this voyage vessel JSON? Existing vessel data with the same id will be replaced.')) return;
          setVoyage('Importing voyage vessel…');
          const msg = await voyagePost('import-vessel', { payload }, root);
          setVoyage(msg.message || 'Voyage vessel imported.');
          toast(msg.message || 'Voyage vessel imported');
        } catch (e) {
          setVoyage(e.message || 'Import failed');
          toast(e.message || 'Import failed');
        }
      };

      ensureVoyageFrame(root);
    },
  };
})();
