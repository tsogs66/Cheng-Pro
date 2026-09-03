(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function toast(msg) {
    window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: msg }));
  }

  function downloadWhereLabel(saved) {
    if (!saved) return 'saved';
    if (saved.method === 'picker') return 'saved to the folder you chose';
    if (saved.method === 'share') return 'shared — use Save to Files / Drive / USB';
    return `check Downloads for ${saved.filename}`;
  }

  /**
   * Save JSON where the user can find it.
   * Picker (desktop) → Share (Android) → <a download> with delayed revoke.
   */
  async function downloadJson(name, data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const safeName = name || `cheng-aio-backup-${Date.now()}.json`;

    try {
      if (typeof window.showSaveFilePicker === 'function') {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: safeName,
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return { method: 'picker', filename: safeName };
        } catch (e) {
          if (e && e.name === 'AbortError') throw new Error('Save cancelled — nothing was written');
        }
      }
    } catch (e) {
      if (e && e.message && /cancelled/i.test(e.message)) throw e;
    }

    try {
      const file = new File([blob], safeName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: safeName,
          text: 'ChEng AIO backup — use Save to Files / Drive / USB so you can find it later.',
        });
        return { method: 'share', filename: safeName };
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Share cancelled — backup was not saved');
    }

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

  async function tankApi(path, options) {
    return ChengProApi.api('/tanks' + path, options);
  }

  async function uploadTankBackup(file, merge) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('merge', String(!!merge));
    const headers = {};
    try {
      if (typeof ChengLicense !== 'undefined' && ChengLicense.authHeaders) {
        Object.assign(headers, ChengLicense.authHeaders());
      }
    } catch { /* ignore */ }
    const res = await fetch('/tanks/api/backup/import', { method: 'POST', body: fd, headers });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) throw new Error((data && data.error) || res.statusText || 'Import failed');
    return data;
  }

  let voyageFrame = null;
  let voyageReady = false;

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

  const pendingVoyage = {};

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
          <p class="hint">Export or import vessel databases offline. On desktop you will be asked where to save the JSON. On Android, use the share sheet → <strong>Save to Files / Drive / USB</strong> — do not dismiss it or nothing is written.</p>
          <p class="hint">${isMaster ? 'Master license: full-database Tank backups include all user accounts on this server.' : 'Your license email scopes Tank backups and sync to your account only.'}</p>

          <div class="form-panel" style="margin-bottom:16px">
            <h2>Entire suite (Tank + Voyage)</h2>
            <p class="hint">One JSON file with both Tank Chief and Voyage Chief databases from this device/server. Active vessel: <strong>${esc(activeLabel)}</strong></p>
            <div class="btn-row">
              <button type="button" class="btn primary" id="bk-suite-all">Export entire program</button>
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
            const res = await fetch('/tanks/api/backup', {
              headers: typeof ChengLicense !== 'undefined' ? ChengLicense.authHeaders() : {},
            });
            if (!res.ok) throw new Error('Tank backup failed (' + res.status + ')');
            tankBackup = await res.json();
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

          if (!tankBackup && !voyageMsg?.payload) {
            throw new Error([tankError, voyageError].filter(Boolean).join(' · ') || 'Nothing to export');
          }

          const suite = {
            format: 'cheng-aio-suite-v1',
            exportedAt: new Date().toISOString(),
            tank: tankBackup,
            tankError: tankError || null,
            voyage: voyageMsg?.payload || null,
            voyageFilename: voyageMsg?.filename || null,
            voyageError: voyageError || null,
          };
          const saved = await downloadJson(`cheng-aio-suite-${Date.now()}.json`, suite);
          setSuite(`Entire program ${downloadWhereLabel(saved)}.`);
          toast(`Entire program ${downloadWhereLabel(saved)}`);
        } catch (e) {
          setSuite(e.message || 'Export failed');
          toast(e.message || 'Export failed');
        }
      };

      root.querySelector('#bk-tank-full').onclick = async () => {
        setTank('Preparing Tank backup…');
        try {
          const res = await fetch('/tanks/api/backup', {
            headers: typeof ChengLicense !== 'undefined' ? ChengLicense.authHeaders() : {},
          });
          if (!res.ok) throw new Error('Backup failed');
          const backup = await res.json();
          const saved = await downloadJson(`tank-chief-backup-${Date.now()}.json`, backup);
          const n = backup.index && backup.index.vessels ? backup.index.vessels.length : 0;
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
        if (!confirm('Import Tank backup into this server account? Existing vessels merge when merge is enabled.')) return;
        setTank('Importing Tank backup…');
        try {
          await uploadTankBackup(file, true);
          await ChengPro.vessel.refresh();
          setTank(`Tank backup imported — open Tank Chief (Settings → use “On the server” if you imported to the ship PC).`);
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
          const res = await fetch('/tanks/api/vessels/' + encodeURIComponent(active.id) + '/backup', {
            headers: typeof ChengLicense !== 'undefined' ? ChengLicense.authHeaders() : {},
          });
          if (!res.ok) throw new Error('Vessel export failed');
          const backup = await res.json();
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
          await uploadTankBackup(file, true);
          await ChengPro.vessel.refresh();
          setTank('Vessel JSON imported — switch Tank Chief to “On the server” to view on this device.');
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
