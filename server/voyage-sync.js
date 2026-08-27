/**
 * Spawn / supervise the Voyage Chief Python sync + auth server.
 */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SYNC_DIR = path.join(ROOT, 'modules', 'voyage', 'sync-server');

function waitForHealth(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/health', timeout: 1500 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve();
          if (Date.now() - started > timeoutMs) return reject(new Error('Voyage sync health timeout'));
          setTimeout(tryOnce, 300);
        }
      );
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) return reject(new Error('Voyage sync not reachable'));
        setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

function startVoyageSync(opts = {}) {
  const port = opts.port || Number(process.env.SYNC_PORT || 8787);
  const dataDir = opts.dataDir || path.join(opts.chengDataDir || path.join(ROOT, 'data'), 'voyage-sync');
  const env = {
    ...process.env,
    SYNC_HOST: '127.0.0.1',
    SYNC_PORT: String(port),
    SYNC_DATA_DIR: dataDir,
    SYNC_ACCOUNTS_DB: path.join(dataDir, 'accounts.db'),
    SYNC_ALLOWED_ORIGINS: '*',
  };
  if (process.env.SYNC_API_TOKEN) env.SYNC_API_TOKEN = process.env.SYNC_API_TOKEN;
  if (process.env.SYNC_ADMIN_PASSWORD) env.SYNC_ADMIN_PASSWORD = process.env.SYNC_ADMIN_PASSWORD;
  if (process.env.SYNC_ADMIN_USER) env.SYNC_ADMIN_USER = process.env.SYNC_ADMIN_USER;

  const child = spawn('python3', ['server.py'], {
    cwd: SYNC_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (buf) => process.stdout.write(`[voyage-sync] ${buf}`));
  child.stderr.on('data', (buf) => process.stderr.write(`[voyage-sync] ${buf}`));
  child.on('exit', (code, signal) => {
    console.error(`[voyage-sync] exited code=${code} signal=${signal}`);
  });

  return waitForHealth(port).then(() => ({ child, port, dataDir }));
}

function proxyToVoyage(port) {
  return function voyageProxy(req, res) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = { ...req.headers, host: `127.0.0.1:${port}` };
      delete headers['content-length'];
      if (body.length) headers['content-length'] = String(body.length);
      const preq = http.request(
        {
          host: '127.0.0.1',
          port,
          path: req.originalUrl || req.url,
          method: req.method,
          headers,
        },
        (pres) => {
          res.writeHead(pres.statusCode || 502, pres.headers);
          pres.pipe(res);
        }
      );
      preq.on('error', (err) => {
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Voyage sync unavailable', detail: err.message }));
        }
      });
      if (body.length) preq.write(body);
      preq.end();
    });
  };
}

module.exports = { startVoyageSync, proxyToVoyage, waitForHealth };
