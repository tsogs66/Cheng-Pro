const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..', 'www-android');
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') u = '/index.html';
    const f = path.join(root, u.replace(/^\//, ''));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404);
      return res.end('404 ' + u);
    }
    const ext = path.extname(f);
    const ct = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.webmanifest': 'application/manifest+json',
    }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': ct });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Simulate offline after first paint resources: block google fonts
  await page.route('**/fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**/fonts.gstatic.com/**', (route) => route.abort());

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const result = await page.evaluate(async () => {
    const main = document.getElementById('main');
    let health = null;
    let vessels = null;
    let localErr = null;
    try {
      if (window.LocalApi) await LocalApi.start();
    } catch (e) {
      localErr = e.message;
    }
    try {
      health = await ChengPro.api.fetch('/api/health');
    } catch (e) {
      health = { error: e.message };
    }
    try {
      vessels = await ChengPro.api.fetch('/api/shell/vessels');
    } catch (e) {
      vessels = { error: e.message };
    }
    return {
      mainText: (main && main.innerText || '').slice(0, 300),
      mainHTML: (main && main.innerHTML || '').slice(0, 200),
      hasCheng: !!window.ChengPro,
      hasLocal: typeof LocalApi !== 'undefined',
      modules: Object.keys(window.ChengProModules || {}),
      health,
      vessels,
      localErr,
      transport: localStorage.getItem('apiTransport'),
      serverBase: localStorage.getItem('apiServerBase'),
    };
  });

  console.log(JSON.stringify({ result, errors }, null, 2));
  await browser.close();
  srv.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
