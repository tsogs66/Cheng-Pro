/* Optional override for portable / EXE builds.
   Set localStorage.chengLicenseApi or meta[name=license-api] to the production host
   (e.g. https://licenses.example.com/api/license). */
(function () {
  try {
    var u = localStorage.getItem('chengLicenseApi');
    if (u && !window.CHENG_LICENSE_API) window.CHENG_LICENSE_API = u;
  } catch (_e) {}
})();
