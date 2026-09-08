/* Optional license API override — loaded before license.js.
   Set in the activation dialog, or localStorage.chengLicenseApi / apiServerBase
   (e.g. https://your-cheng-aio-host or http://192.168.x.x:8080). */
(function () {
  try {
    var u = localStorage.getItem('chengLicenseApi');
    if (u && u.trim() && !window.CHENG_LICENSE_API) {
      window.CHENG_LICENSE_API = u.trim().replace(/\/$/, '');
      return;
    }
    var base = localStorage.getItem('apiServerBase');
    if (base && base.trim() && !window.CHENG_LICENSE_API) {
      base = base.trim().replace(/\/$/, '');
      window.CHENG_LICENSE_API = /\/api\/license$/i.test(base) ? base : (base + '/api/license');
    }
  } catch (_e) {}
})();
