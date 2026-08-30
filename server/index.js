/**
 * ChEng AIO unified gateway
 * - Shell UI at /
 * - Full Tank Chief at /tanks (API /tanks/api/*)
 * - Full Voyage Chief SPA at /voyage
 * - Voyage auth + sync proxied to Python on 127.0.0.1:8787
 */
'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { startVoyageSync, proxyToVoyage } = require('./voyage-sync');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.CHENG_PRO_DATA_DIR || path.join(ROOT, 'data');
process.env.CHENG_PRO_DATA_DIR = DATA_DIR;
process.env.TMS_DATA_DIR = DATA_DIR;

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const SYNC_PORT = Number(process.env.SYNC_PORT || 8787);

// Load Tank Chief after env is set so store picks up DATA_DIR
const tank = require('../modules/tanks/server');

const app = express();
app.use(cors({ origin: true, credentials: true }));
// JSON parsing for shell routes only; tank app has its own. Avoid double-parse on proxied bodies.
app.use((req, res, next) => {
  if (req.path.startsWith('/tanks')) return next();
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin') ||
      req.path.startsWith('/api/voyage') || req.path.startsWith('/api/vessels') ||
      req.path.startsWith('/api/assignments') || req.path.startsWith('/api/health')) {
    return next(); // proxy raw body
  }
  express.json({ limit: '50mb' })(req, res, next);
});

let voyageProxy = null;
let voyageMeta = null;

function requireVoyage(req, res, next) {
  if (!voyageProxy) return res.status(503).json({ error: 'Voyage sync starting' });
  return voyageProxy(req, res);
}

/* Per-user vessel data (license email). Tank module app has its own middleware;
 * shell vessel routes use the same store — scope them here too. */
const { parseScopedEntitlement } = require('./license-scope');
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/shell') && !req.path.startsWith('/api/status')
      && req.path !== '/api/admin/users') {
    return next();
  }
  try {
    const store = require('../modules/tanks/server/store');
    const scope = parseScopedEntitlement(req, res);
    if (scope === null) return;
    if (typeof store.runWithUserScope === 'function') {
      return store.runWithUserScope({
        email: scope.email,
        master: scope.master,
        actAs: scope.actAs,
      }, () => next());
    }
  } catch { /* store not ready */ }
  return next();
});

app.get('/api/admin/users', (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    if (!store.isMasterScope || !store.isMasterScope()) {
      return res.status(403).json({ error: 'Forbidden — master license required' });
    }
    res.json({ users: store.listUserDatabases() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- Combined health ---------- */
app.get('/api/health', async (req, res) => {
  let voyage = null;
  try {
    voyage = await fetch(`http://127.0.0.1:${SYNC_PORT}/api/health`).then((r) => r.json());
  } catch (e) {
    voyage = { ok: false, error: e.message };
  }
  let tanks = null;
  try {
    const store = require('../modules/tanks/server/store');
    tanks = {
      ok: true,
      activeVesselId: store.getActiveVesselId(),
      vesselCount: store.listVessels().length,
      dataDir: store.DATA_DIR,
    };
  } catch (e) {
    tanks = { ok: false, error: e.message };
  }
  res.json({
    ok: true,
    product: 'cheng-aio',
    version: require('../package.json').version,
    modules: { voyage, tanks },
    time: new Date().toISOString(),
  });
});

/* Shell-friendly vessel list from tank store (shared ship folders) */
app.get('/api/status', (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    res.json({
      settings: store.getSettings(),
      vessels: store.listVessels(),
      activeVesselId: store.getActiveVesselId(),
      voyageSync: !!voyageMeta,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/shell/vessels', (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    res.json({
      vessels: store.listVessels(),
      activeVesselId: store.getActiveVesselId(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/shell/vessels/active', express.json(), (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    res.json(store.setActiveVessel(req.body?.id || null));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post('/api/shell/vessels', express.json(), (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    const vessel = store.createVessel(req.body || {});
    res.status(201).json(vessel);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/shell/vessels/:id', (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    const bundle = store.getVesselBundle(req.params.id);
    res.json({ vessel: bundle.vessel, assets: bundle.assets, meta: bundle.meta });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.put('/api/shell/vessels/:id', express.json(), (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    res.json(store.updateVesselDetails(req.params.id, req.body || {}));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.delete('/api/shell/vessels/:id', (req, res) => {
  try {
    const store = require('../modules/tanks/server/store');
    res.json(store.deleteVessel(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

/* Tank peer sync at gateway root — Android/clients often use http://host:8080 without /tanks */
const { requireSyncAuth: requireGatewaySyncAuth } = require('./license-scope');
function forwardTankApi(req, res, next) {
  tank.app(req, res, next);
}

app.get('/api/sync/export', requireGatewaySyncAuth, forwardTankApi);
app.get('/api/sync/ping', forwardTankApi);
app.post('/api/sync/import', express.json({ limit: '50mb' }), requireGatewaySyncAuth, forwardTankApi);
app.post('/api/sync/probe', express.json({ limit: '1mb' }), requireGatewaySyncAuth, forwardTankApi);
app.post('/api/sync/pull', express.json({ limit: '1mb' }), requireGatewaySyncAuth, forwardTankApi);
app.post('/api/sync/push', express.json({ limit: '50mb' }), requireGatewaySyncAuth, forwardTankApi);

/* Per-user license seats (yearly / lifetime, 60-day grace) */
const { mountLicenseRoutes } = require('./license/routes');
mountLicenseRoutes(app);

/* Voyage Chief auth + sync + admin (full Python stack) */
app.use('/api/auth', requireVoyage);
app.use('/api/admin', requireVoyage);
app.use('/api/voyage', requireVoyage);
app.use('/api/assignments', requireVoyage);
app.use('/api/vessels', requireVoyage);

/* Full Tank Chief */
app.use('/tanks', tank.app);

/* Full Voyage Chief SPA */
const voyageWww = path.join(ROOT, 'modules', 'voyage', 'www');
app.use('/voyage', express.static(voyageWww, {
  etag: false,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
    }
  },
}));
app.get('/voyage', (req, res) => res.redirect('/voyage/'));
app.get('/voyage/*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(voyageWww, 'index.html'));
});

/* ChEng AIO shell */
const webRoot = path.join(ROOT, 'apps', 'web');
app.use(express.static(webRoot, {
  etag: false,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
    }
  },
}));

app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/tanks') ||
    req.path.startsWith('/voyage') ||
    req.path === '/license-admin' ||
    req.path === '/license-admin.html'
  ) {
    return next();
  }
  res.sendFile(path.join(webRoot, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

async function boot() {
  console.log(`ChEng AIO data directory: ${DATA_DIR}`);
  try {
    voyageMeta = await startVoyageSync({ port: SYNC_PORT, chengDataDir: DATA_DIR });
    voyageProxy = proxyToVoyage(voyageMeta.port);
    console.log(`Voyage sync+auth ready on 127.0.0.1:${voyageMeta.port}`);
  } catch (e) {
    console.error('Failed to start voyage sync:', e.message);
    console.error('Voyage module will be unavailable until Python sync starts.');
  }

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(PORT, HOST, () => {
      const base = `http://${HOST}:${s.address().port}`;
      console.log(`ChEng AIO listening on ${base}`);
      console.log(`  Shell:         ${base}/`);
      console.log(`  Tanks:         ${base}/tanks/`);
      console.log(`  Voyage:        ${base}/voyage/`);
      console.log(`  License admin: ${base}/license-admin`);
      resolve(s);
    });
    s.on('error', reject);
  });

  const shutdown = () => {
    if (voyageMeta?.child) {
      try { voyageMeta.child.kill('SIGTERM'); } catch { /* ignore */ }
    }
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) {
  boot().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { app, boot };
