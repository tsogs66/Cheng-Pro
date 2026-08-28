'use strict';

/**
 * Build a static www tree for Capacitor / Android.
 * Offline-capable shell + Tank Chief (LocalApi) + Voyage SPA assets.
 * Server sync URL is configured in-app when online.
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

// Shell as home
cpDir(path.join(ROOT, 'apps', 'web'), OUT);

// Tank Chief under /tanks/ — for file/capacitor use relative + local transport
cpDir(path.join(ROOT, 'modules', 'tanks', 'public'), path.join(OUT, 'tanks'));

// Voyage SPA under /voyage/
cpDir(path.join(ROOT, 'modules', 'voyage', 'www'), path.join(OUT, 'voyage'));

// Android hub index pointing at modules (overwrite shell index with launcher that works offline)
const hub = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b1c24">
  <title>Cheng-Pro</title>
  <link rel="stylesheet" href="css/shell.css">
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"></span>
        <div class="brand-text"><strong>Cheng-Pro</strong><span>Chief Engineer suite</span></div>
      </div>
    </header>
    <main class="main">
      <section class="panel hero">
        <h1>Cheng-Pro</h1>
        <p>Voyage Chief and Tank Chief on one device. Use Vessel Setup in Tank Chief for ship identity; set sync URL in Voyage Chief to your Cheng-Pro server when online.</p>
        <div class="form-actions" style="margin-top:18px">
          <a class="btn primary" href="voyage/index.html">Voyage Chief</a>
          <a class="btn primary" href="tanks/index.html">Tank Chief</a>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), hub);

// Force tank local transport default on Android file URLs; clear API prefix for bundled relative paths
const tankIndex = path.join(OUT, 'tanks', 'index.html');
let html = fs.readFileSync(tankIndex, 'utf8');
html = html.replace('<base href="/tanks/">', '<base href="./">');
html = html.replace(
  "window.CHENG_PRO_TANKS_PREFIX = '/tanks';",
  "window.CHENG_PRO_TANKS_PREFIX = '';"
);
html = html.replace('href="/"', 'href="../index.html"');
fs.writeFileSync(tankIndex, html);

console.log('Prepared', OUT);
