/**
 * One way to put a file on the user's device, for every program in the suite.
 *
 * A backup that the program says it wrote and the user then cannot find is
 * worse than one that failed loudly, and each of the four ways a browser will
 * hand over a file is missing somewhere we run:
 *
 *   native      the Android application's own bridge. The Capacitor WebView
 *               has no download manager at all, so a blob anchor there is a
 *               no-op that reports success — this is the only path that
 *               actually writes a file on the phone. The whole backup is
 *               sent in pieces: one JavascriptInterface string bigger than
 *               Android's Binder limit kills the WebView, which is the app
 *               closing itself on Export.
 *   desktop     Electron preload IPC → native Save dialog + fs.writeFile.
 *               File System Access (showSaveFilePicker) crashes Electron's
 *               renderer on write, so desktop never uses the picker.
 *   parent      Voyage / Tank running inside the ChEng AIO shell: the shell
 *               owns the native/desktop bridge, so the embed asks it, the same
 *               way printing already works.
 *   picker      desktop Chromium (not Electron): the user chooses the folder.
 *   share       mobile browsers: Save to Files / Drive / USB.
 *   anchor      everything else, with a delayed revoke because a WebView
 *               needs a beat to start reading the blob.
 *
 * The returned `method` is what the caller tells the user, so "check your
 * Downloads folder" is never printed for a save that went somewhere else.
 */
(function (root) {
  'use strict';
  if (root.ChengSaveFile) return;

  const PARENT_TIMEOUT_MS = 120000;

  function appLabel() {
    try {
      if (root.Branding && Branding.APP_NAME) return Branding.APP_NAME;
      if (typeof APP_NAME === 'string' && APP_NAME) return APP_NAME;
    } catch (_) { /* ignore */ }
    return 'ChEng';
  }

  function safeFileName(name) {
    const base = String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '-');
    return base || `cheng-backup-${Date.now()}.json`;
  }

  function isElectron() {
    try {
      return /Electron/i.test((root.navigator && root.navigator.userAgent) || '');
    } catch (_) {
      return false;
    }
  }

  function nativeBridge() {
    try {
      const b = root.ChengAndroidFiles;
      if (!b) return null;
      if (typeof b.beginSave === 'function'
          && typeof b.appendSaveChunk === 'function'
          && typeof b.finishSave === 'function') return b;
      if (typeof b.saveText === 'function') return b;
    } catch (_) { /* ignore */ }
    return null;
  }

  function desktopBridge() {
    try {
      const b = root.ChengDesktopFiles;
      if (b && typeof b.saveText === 'function') return b;
    } catch (_) { /* ignore */ }
    return null;
  }

  /** True when this window is an embed whose parent may hold the native bridge. */
  function hasParentShell() {
    if (!root.parent || root.parent === root) return false;
    try {
      if (root.parent.ChengSaveFile || root.parent.ChengPro || root.parent.ChengProShell) return true;
    } catch (_) {
      /* Cross-origin parent — assume a shell and let the timeout decide. */
      return true;
    }
    return false;
  }

  /* Same size the print bridge uses. A larger piece trips the Binder limit. */
  const NATIVE_CHUNK = 200000;

  function chunkEnd(text, start, size) {
    let end = Math.min(text.length, start + size);
    if (end > start && end < text.length) {
      const tail = text.charCodeAt(end - 1);
      if (tail >= 0xD800 && tail <= 0xDBFF) end -= 1;
    }
    if (end <= start) end = Math.min(text.length, start + size);
    return end;
  }

  function saveViaNative(bridge, filename, text, mime) {
    const body = text == null ? '' : String(text);
    const type = mime || 'application/json';
    let opened = false;
    try {
      if (typeof bridge.beginSave === 'function'
          && typeof bridge.appendSaveChunk === 'function'
          && typeof bridge.finishSave === 'function') {
        opened = !!bridge.beginSave(filename, type, body.length);
        if (!opened) return null;
        for (let i = 0; i < body.length;) {
          const end = chunkEnd(body, i, NATIVE_CHUNK);
          bridge.appendSaveChunk(body.slice(i, end));
          i = end;
        }
        const where = String(bridge.finishSave() || '');
        opened = false;
        if (!where) throw new Error('Could not write the backup on this device');
        return { method: 'native', filename, where };
      }
    } catch (err) {
      if (opened) {
        try { bridge.finishSave(); } catch (_) { /* drop the half-written file */ }
      }
      if (err && err.message === 'Could not write the backup on this device') throw err;
      console.warn('Android file bridge failed', err);
      return null;
    }
    let where = '';
    try {
      if (typeof bridge.saveText !== 'function') return null;
      where = String(bridge.saveText(filename, body, type) || '');
    } catch (err) {
      console.warn('Android file bridge failed', err);
      return null;
    }
    if (!where) return null;
    return { method: 'native', filename, where };
  }

  async function saveViaDesktop(bridge, filename, text, mime) {
    let where;
    try {
      where = await Promise.resolve(bridge.saveText(filename, text, mime || 'application/json'));
    } catch (err) {
      console.warn('Desktop file bridge failed', err);
      return null;
    }
    /* IPC returns '' when the user cancels the Save dialog. */
    if (where === '' || where === false) {
      const err = new Error('Save cancelled — nothing was written');
      err.name = 'AbortError';
      throw err;
    }
    if (!where) return null;
    return { method: 'desktop', filename, where: String(where) };
  }

  function saveViaParent(filename, text, mime) {
    return new Promise((resolve) => {
      const requestId = 'sv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const body = text == null ? '' : String(text);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try { root.removeEventListener('message', onMsg); } catch (_) { /* ignore */ }
        clearTimeout(timer);
        resolve(value);
      };
      const onMsg = (ev) => {
        const msg = ev.data || {};
        if (msg.type !== 'chengaio-save-file-result' || msg.requestId !== requestId) return;
        finish(msg.saved || null);
      };
      root.addEventListener('message', onMsg);
      const timer = setTimeout(() => finish(null), PARENT_TIMEOUT_MS);
      try {
        /* One postMessage of the whole file crosses Android's Binder limit
           when Voyage is inside the ChEng AIO WebView, and the view dies. */
        root.parent.postMessage({
          type: 'chengaio-save-file-begin',
          requestId,
          filename,
          mime: mime || 'application/json',
          length: body.length,
        }, '*');
        for (let i = 0; i < body.length;) {
          const end = chunkEnd(body, i, NATIVE_CHUNK);
          root.parent.postMessage({
            type: 'chengaio-save-file-chunk',
            requestId,
            chunk: body.slice(i, end),
          }, '*');
          i = end;
        }
        root.parent.postMessage({
          type: 'chengaio-save-file-end',
          requestId,
        }, '*');
      } catch (_) {
        finish(null);
      }
    });
  }

  async function saveViaPicker(blob, filename) {
    /* Electron's File System Access write crashes the renderer — never use it. */
    if (isElectron()) return null;
    if (typeof root.showSaveFilePicker !== 'function') return null;
    const handle = await root.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { method: 'picker', filename };
  }

  async function saveViaShare(blob, filename, mime) {
    const file = new File([blob], filename, { type: mime || 'application/json' });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) return null;
    await navigator.share({
      files: [file],
      title: filename,
      text: `${appLabel()} backup — use Save to Files / Drive / USB so you can find it later.`,
    });
    return { method: 'share', filename };
  }

  function saveViaAnchor(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { a.remove(); } catch (_) { /* ignore */ }
      try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
    }, 4000);
    return { method: 'anchor', filename };
  }

  /**
   * Write JSON to the device.
   *
   * Rejects with a message when the user cancels — a cancelled save is not a
   * saved backup and must not be reported as one.
   */
  async function saveJson(name, data, opts) {
    const mime = (opts && opts.mime) || 'application/json';
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const filename = safeFileName(name);
    const blob = new Blob([text], { type: mime });

    const bridge = nativeBridge();
    if (bridge) {
      const saved = saveViaNative(bridge, filename, text, mime);
      if (saved) return saved;
    }

    const desk = desktopBridge();
    if (desk) {
      const saved = await saveViaDesktop(desk, filename, text, mime);
      if (saved) return saved;
    }

    if (hasParentShell()) {
      const saved = await saveViaParent(filename, text, mime);
      if (saved) return saved;
    }

    try {
      const saved = await saveViaPicker(blob, filename);
      if (saved) return saved;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('Save cancelled — nothing was written');
      }
      /* Picker unavailable or refused by the platform: try the next way. */
    }

    try {
      const saved = await saveViaShare(blob, filename, mime);
      if (saved) return saved;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('Share cancelled — the backup was not saved');
      }
    }

    return saveViaAnchor(blob, filename);
  }

  /** The sentence to show the user about where the file went. */
  function whereLabel(saved) {
    if (!saved) return 'saved';
    if (saved.method === 'native') {
      return saved.where ? `saved to ${saved.where}` : 'saved to your Downloads folder';
    }
    if (saved.method === 'desktop') {
      return saved.where ? `saved to ${saved.where}` : 'saved to the folder you chose';
    }
    if (saved.method === 'picker') return 'saved to the folder you chose';
    if (saved.method === 'share') return 'shared — use Save to Files / Drive / USB';
    return `started — check Downloads for ${saved.filename}`;
  }

  /* Shell side: an embedded program asks this window to do the saving.
     The file arrives in pieces so a voyage leg never crosses in one message. */
  const pendingParentSaves = new Map();

  function replyParentSave(source, origin, requestId, saved) {
    try {
      source.postMessage({
        type: 'chengaio-save-file-result',
        requestId,
        saved: saved || null,
      }, origin || '*');
    } catch (_) { /* ignore */ }
  }

  async function finishParentSave(job) {
    const desk = desktopBridge();
    const native = nativeBridge();
    if (!desk && !native) {
      replyParentSave(job.source, job.origin, job.requestId, null);
      return;
    }
    try {
      const text = job.parts.join('');
      if (desk) {
        replyParentSave(job.source, job.origin, job.requestId,
          await saveViaDesktop(desk, safeFileName(job.filename), text, job.mime));
        return;
      }
      replyParentSave(job.source, job.origin, job.requestId,
        saveViaNative(native, safeFileName(job.filename), text, job.mime));
    } catch (err) {
      replyParentSave(job.source, job.origin, job.requestId, null);
    }
  }

  root.addEventListener('message', async (ev) => {
    const msg = ev.data || {};
    if (msg.type === 'chengaio-save-file-begin' && msg.requestId) {
      pendingParentSaves.set(msg.requestId, {
        requestId: msg.requestId,
        filename: msg.filename,
        mime: msg.mime,
        parts: [],
        source: ev.source,
        origin: ev.origin,
      });
      return;
    }
    if (msg.type === 'chengaio-save-file-chunk' && msg.requestId && pendingParentSaves.has(msg.requestId)) {
      pendingParentSaves.get(msg.requestId).parts.push(String(msg.chunk || ''));
      return;
    }
    if (msg.type === 'chengaio-save-file-end' && msg.requestId && pendingParentSaves.has(msg.requestId)) {
      const job = pendingParentSaves.get(msg.requestId);
      pendingParentSaves.delete(msg.requestId);
      await finishParentSave(job);
      return;
    }
    if (msg.type !== 'chengaio-save-file' || !msg.requestId) return;
    await finishParentSave({
      requestId: msg.requestId,
      filename: msg.filename,
      mime: msg.mime,
      parts: [String(msg.text || '')],
      source: ev.source,
      origin: ev.origin,
    });
  });

  root.ChengSaveFile = { saveJson, whereLabel, safeFileName };
})(typeof window !== 'undefined' ? window : globalThis);
