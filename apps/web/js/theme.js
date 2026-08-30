/**
 * Shared day/night theme (Voyage Chief style).
 * Storage key marine_bright; also reads legacy vm_bright.
 */
(function (global) {
  const KEY = 'marine_bright';
  const LEGACY = 'vm_bright';

  function readBright() {
    try {
      if (localStorage.getItem(KEY) === '1') return true;
      if (localStorage.getItem(KEY) === '0') return false;
      return localStorage.getItem(LEGACY) === '1';
    } catch {
      return false;
    }
  }

  function apply(bright, opts) {
    const on = !!bright;
    document.documentElement.classList.toggle('bright', on);
    if (!opts || opts.persist !== false) {
      try {
        const next = on ? '1' : '0';
        if (localStorage.getItem(KEY) !== next) localStorage.setItem(KEY, next);
        if (localStorage.getItem(LEGACY) !== next) localStorage.setItem(LEGACY, next);
      } catch { /* ignore */ }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', on ? '#efebe3' : '#0a1420');
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.textContent = on ? 'Night' : 'Bright';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Switch to night / dark mode' : 'Day / bright mode for sunlight';
    });
  }

  function toggle() {
    apply(!document.documentElement.classList.contains('bright'));
  }

  function bind(root) {
    (root || document).querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      if (btn._themeBound) return;
      btn._themeBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggle();
      });
    });
  }

  /* Early paint */
  try {
    if (readBright()) document.documentElement.classList.add('bright');
  } catch { /* ignore */ }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      apply(readBright());
      bind();
    });
  } else {
    apply(readBright());
    bind();
  }

  /* Keep Bright/Night aligned across AIO shell + embedded module iframes.
     Do not re-persist — that would bounce storage events between frames. */
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === LEGACY) apply(readBright(), { persist: false });
  });

  global.MarineTheme = { apply, toggle, bind, readBright, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
