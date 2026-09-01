(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function toast(msg) {
    window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: msg }));
  }

  function downloadJson(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
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
          <p class="hint">Export or import vessel databases offline. Tank Chief data is on the server (or device when using Tank locally). Voyage Chief data lives in the browser IndexedDB on this device.</p>
          <p class="hint">${isMaster ? 'Master license: full-database Tank backups include all user accounts on this server.' : 'Your license email scopes Tank backups and sync to your account only.'}</p>

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
      const setTank = (t) => { if (tankStatus) tankStatus.textContent = t; };
      const setVoyage = (t) => { if (voyageStatus) voyageStatus.textContent = t; };

      root.querySelector('#bk-tank-full').onclick = async () => {
        setTank('Preparing Tank backup…');
        try {
          const res = await fetch('/tanks/api/backup', {
            headers: typeof ChengLicense !== 'undefined' ? ChengLicense.authHeaders() : {},
          });
          if (!res.ok) throw new Error('Backup failed');
          const backup = await res.json();
          downloadJson(`fuel-tms-backup-${Date.now()}.json`, backup);
          const n = backup.index && backup.index.vessels ? backup.index.vessels.length : 0;
          setTank(`Downloaded full backup (${n} vessel${n === 1 ? '' : 's'}).`);
          toast('Tank backup downloaded');
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
          downloadJson(`fuel-tms-vessel-${active.id}.json`, backup);
          setTank(`Exported vessel ${active.name}.`);
          toast('Vessel backup saved');
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
            downloadJson(msg.filename || `voyage-chief-db-${Date.now()}.json`, msg.payload);
            setVoyage('Voyage database downloaded.');
            toast('Voyage database downloaded');
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
            downloadJson(msg.filename || `voyage-vessel-${Date.now()}.json`, msg.payload);
            setVoyage('Voyage vessel exported.');
            toast('Voyage vessel exported');
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
