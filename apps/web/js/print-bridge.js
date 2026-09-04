/**
 * Top-level print delivery for ChEng AIO.
 *
 * Embedded Voyage/Tank iframes post a full HTML document here. On Android the
 * Capacitor WebView has no window.print(), so we call ChengAndroidPrint
 * (PrintManager). On desktop/Electron we open a hidden iframe in this top
 * window and call the system printer dialog — never window.open preview.
 */
(function installChengAioPrintBridge() {
  if (window.__chengAioPrintBridgeInstalled) return;
  window.__chengAioPrintBridgeInstalled = true;

  function notifyDone(source) {
    try {
      if (source && source !== window) {
        source.postMessage({ type: 'chengaio-print-done' }, '*');
      }
    } catch (_) { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent('chengaio-print-done'));
    } catch (_) { /* ignore */ }
  }

  function printViaHiddenIframe(html, title, source) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    if (title) {
      try { doc.title = title; } catch (_) { /* ignore */ }
    }
    const win = iframe.contentWindow;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { win.removeEventListener('afterprint', finish); } catch (_) { /* ignore */ }
      try { window.removeEventListener('afterprint', finish); } catch (_) { /* ignore */ }
      try { iframe.remove(); } catch (_) { /* ignore */ }
      notifyDone(source);
    };
    try { win.addEventListener('afterprint', finish); } catch (_) { /* ignore */ }
    try { window.addEventListener('afterprint', finish); } catch (_) { /* ignore */ }
    const kick = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.warn('AIO print iframe failed', err);
        finish();
        return;
      }
      setTimeout(finish, 120000);
    };
    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(() => setTimeout(kick, 40)).catch(() => setTimeout(kick, 120));
    } else {
      setTimeout(kick, 120);
    }
  }

  function printHtmlDocument(html, title, source) {
    const job = title || 'ChEng AIO';
    const text = String(html || '');
    try {
      if (window.ChengAndroidPrint) {
        const bridge = window.ChengAndroidPrint;
        if (typeof bridge.beginPrintJob === 'function'
          && typeof bridge.appendPrintChunk === 'function'
          && typeof bridge.finishPrintJob === 'function') {
          const CHUNK = 200000;
          bridge.beginPrintJob(String(job), text.length);
          for (let i = 0; i < text.length; i += CHUNK) {
            bridge.appendPrintChunk(text.slice(i, i + CHUNK));
          }
          bridge.finishPrintJob();
          setTimeout(() => notifyDone(source), 1500);
          return;
        }
        if (typeof bridge.printHtml === 'function') {
          bridge.printHtml(text, String(job));
          setTimeout(() => notifyDone(source), 1500);
          return;
        }
      }
    } catch (err) {
      console.warn('Android PrintManager bridge failed', err);
    }
    printViaHiddenIframe(text, job, source);
  }

  window.ChengAioPrint = {
    printHtmlDocument: (html, title) => printHtmlDocument(html, title, null),
  };

  window.addEventListener('message', (ev) => {
    const msg = ev.data || {};
    if (msg.type !== 'chengaio-print' || typeof msg.html !== 'string') return;
    printHtmlDocument(msg.html, msg.title, ev.source);
  });
})();
