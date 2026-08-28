'use strict';

/**
 * Build a static www tree for Capacitor / Android.
 * Full Cheng-Pro shell + Tank Chief (LocalApi) + Voyage SPA assets.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www-android');

function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) cpDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

// Embedded tank server routes for on-device LocalApi (must match server/ after edits)
execSync('node scripts/copy-embedded.js', { cwd: path.join(ROOT, 'modules', 'tanks'), stdio: 'inherit' });

// Full Cheng-Pro shell (same UI as browser)
cpDir(path.join(ROOT, 'apps', 'web'), OUT);

// Tank Chief under /tanks/
cpDir(path.join(ROOT, 'modules', 'tanks', 'public'), path.join(OUT, 'tanks'));

// Voyage SPA under /voyage/
cpDir(path.join(ROOT, 'modules', 'voyage', 'www'), path.join(OUT, 'voyage'));

// --- Shell: relative asset paths + offline LocalApi for vessel/active-vessel UI ---
const shellIndex = path.join(OUT, 'index.html');
let shellHtml = fs.readFileSync(shellIndex, 'utf8');
shellHtml = shellHtml.replace(/href="\/css\//g, 'href="css/');
shellHtml = shellHtml.replace(/src="\/js\//g, 'src="js/');
shellHtml = shellHtml.replace(/href="\/manifest\.webmanifest"/, 'href="manifest.webmanifest"');
shellHtml = shellHtml.replace(
  '<script src="js/api.js"></script>',
  [
    '<script>window.CHENG_PRO_BUNDLED = true; window.CHENG_PRO_EMBEDDED_BASE = "tanks/embedded/";</script>',
    '<script src="tanks/js/node-shim.js"></script>',
    '<script src="tanks/js/node-require.js"></script>',
    '<script src="tanks/js/store-core.js"></script>',
    '<script src="tanks/js/local-api.js"></script>',
    '<script src="js/api.js"></script>',
    '<script src="js/bundled.js"></script>',
    '<script src="js/shell-local.js"></script>',
  ].join('\n  ')
);
fs.writeFileSync(shellIndex, shellHtml);

// Manifest start URL for Capacitor file/https://localhost
const manifestPath = path.join(OUT, 'manifest.webmanifest');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.start_url = './';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

// Tank Chief: relative base + bundled API prefix
const tankIndex = path.join(OUT, 'tanks', 'index.html');
let html = fs.readFileSync(tankIndex, 'utf8');
html = html.replace('<base href="/tanks/">', '<base href="./">');
html = html.replace(
  "window.CHENG_PRO_TANKS_PREFIX = '/tanks';",
  "window.CHENG_PRO_TANKS_PREFIX = ''; window.CHENG_PRO_EMBEDDED_BASE = 'embedded/';"
);
html = html.replace('href="/"', 'href="../index.html"');
fs.writeFileSync(tankIndex, html);

// Service worker asset paths: relative to tanks/ (Capacitor serves from https://localhost/tanks/)
const swPath = path.join(OUT, 'tanks', 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/'\//g, "'");
  fs.writeFileSync(swPath, sw);
}

// Voyage: link back to shell home
for (const voyageIndex of ['index.html', 'voyage_manager.html']) {
  const vp = path.join(OUT, 'voyage', voyageIndex);
  if (!fs.existsSync(vp)) continue;
  let vhtml = fs.readFileSync(vp, 'utf8');
  if (!vhtml.includes('../index.html')) {
    vhtml = vhtml.replace(/href="\/"/g, 'href="../index.html"');
    fs.writeFileSync(vp, vhtml);
  }
}

console.log('Prepared', OUT);
