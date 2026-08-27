/**
 * Cheng-Pro — unified gateway for Voyage + Tank modules.
 */
'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const store = require('./store');
const auth = require('./auth');
const vesselsRouter = require('./routes/vessels');
const tanksRouter = require('./routes/tanks');
const voyageRouter = require('./routes/voyage');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

store.ensureDirs();
auth.ensureAuthFiles();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(auth.middleware);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    product: 'cheng-pro',
    version: '0.1.0',
    offlineCapable: true,
    authRequired: auth.authRequired(),
    time: new Date().toISOString(),
    activeVesselId: store.getActiveVesselId(),
    vesselCount: store.listVessels().length,
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    settings: store.getSettings(),
    vessels: store.listVessels(),
    activeVesselId: store.getActiveVesselId(),
    authRequired: auth.authRequired(),
    session: req.session
      ? { username: req.session.username, role: req.session.role, vesselId: req.session.vesselId }
      : null,
  });
});

app.get('/api/settings', (req, res) => res.json(store.getSettings()));
app.put('/api/settings', auth.requireSession, (req, res) => {
  res.json(store.saveSettings(req.body || {}));
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const session = auth.login(username, password);
    res.json({
      token: session.token,
      username: session.username,
      role: session.role,
      vesselId: session.vesselId,
      expiresAt: session.expiresAt,
    });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.authToken) auth.destroySession(req.authToken);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'Not signed in' });
  res.json({
    username: req.session.username,
    role: req.session.role,
    vesselId: req.session.vesselId,
    expiresAt: req.session.expiresAt,
  });
});

app.get('/api/backup', auth.requireSession, (req, res) => {
  res.json(store.exportBackup());
});

app.use('/api/vessels', vesselsRouter);
app.use('/api/tanks', tanksRouter);
app.use('/api/voyage', voyageRouter);

const webRoot = path.join(__dirname, '..', 'apps', 'web');
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
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webRoot, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Cheng-Pro listening on http://${HOST}:${PORT}`);
    console.log(`Data directory: ${store.DATA_DIR}`);
  });
}

module.exports = app;
