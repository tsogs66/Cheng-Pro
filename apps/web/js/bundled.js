/**
 * Capacitor / offline APK: relative paths and bundled-client detection.
 */
(function (root) {
  function isBundledClient() {
    if (root.CHENG_PRO_BUNDLED) return true;
    if (!/^https?:$/.test(location.protocol)) return true;
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  function asset(path) {
    const p = String(path || '').replace(/^\//, '');
    return isBundledClient() ? p : '/' + p;
  }

  function moduleUrl(name) {
    if (name === 'tanks') return asset('tanks/index.html');
    if (name === 'voyage') return asset('voyage/index.html');
    return asset(name);
  }

  root.ChengProBundled = { isBundledClient, asset, moduleUrl };
})(window);
