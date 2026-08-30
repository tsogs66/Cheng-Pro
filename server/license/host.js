/**
 * Standalone production license host.
 *
 *   LICENSE_PORT=8787 LICENSE_ADMIN_TOKEN=… LICENSE_SIGNING_SECRET=… \
 *   SMTP_HOST=… npm run license-host
 *
 * Same /api/license API as ChEng AIO; use LICENSE_SERVER_URL on clients.
 */
'use strict';

const express = require('express');
const { mountLicenseRoutes } = require('./routes');

const port = Number(process.env.LICENSE_PORT || process.env.PORT || 8787);
const app = express();
app.disable('x-powered-by');
try {
  app.use(require('cors')({ origin: true }));
} catch {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-license-admin-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'cheng-license-host',
    enforce: process.env.LICENSE_ENFORCE !== '0',
    mail: !!(process.env.LICENSE_MAIL_WEBHOOK_URL || process.env.SMTP_HOST || process.env.LICENSE_SMTP_HOST),
    adminTokenRequired: !!process.env.LICENSE_ADMIN_TOKEN,
  });
});

mountLicenseRoutes(app);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.message || 'Server error' });
});

if (!process.env.LICENSE_SIGNING_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[license-host] WARNING: LICENSE_SIGNING_SECRET is not set — using insecure default');
}
if (!process.env.LICENSE_ADMIN_TOKEN) {
  console.warn('[license-host] WARNING: LICENSE_ADMIN_TOKEN is not set — /issue and /admin are open');
}

app.listen(port, '0.0.0.0', () => {
  console.log(`[license-host] listening on :${port}  (/api/license)`);
});
