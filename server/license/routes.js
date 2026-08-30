/**
 * License HTTP routes — activate / heartbeat / pair / transfer / issue (dev).
 */
'use strict';

const express = require('express');
const license = require('./store');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function mountLicenseRoutes(app) {
  const r = express.Router();

  r.get('/status', (req, res) => {
    res.json({
      ok: true,
      graceDays: license.GRACE_DAYS,
      transferCooldownDays: license.TRANSFER_COOLDOWN_DAYS,
      transferYearlyCap: license.TRANSFER_YEARLY_CAP,
      skus: ['cheng-aio', 'voyage-chief', 'tank-chief'],
      plans: ['yearly', 'lifetime'],
    });
  });

  r.post('/activate', asyncHandler((req, res) => {
    const ent = license.activate(req.body || {});
    res.json({ ok: true, entitlement: ent });
  }));

  r.post('/heartbeat', asyncHandler((req, res) => {
    const ent = license.heartbeat(req.body || {});
    res.json({ ok: true, entitlement: ent });
  }));

  r.post('/pair/start', asyncHandler((req, res) => {
    res.json({ ok: true, ...license.pairStart(req.body || {}) });
  }));

  r.post('/pair/complete', asyncHandler((req, res) => {
    const ent = license.pairComplete(req.body || {});
    res.json({ ok: true, entitlement: ent });
  }));

  r.post('/transfer', asyncHandler((req, res) => {
    res.json(license.requestTransfer(req.body || {}));
  }));

  /* Dev / purchase webhook — protect with LICENSE_ADMIN_TOKEN in production. */
  r.post('/issue', asyncHandler((req, res) => {
    const token = process.env.LICENSE_ADMIN_TOKEN;
    if (token && req.get('x-license-admin-token') !== token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const issued = license.issueLicense(req.body || {});
    res.json({ ok: true, license: issued });
  }));

  r.use((err, req, res, next) => {
    const status = err.status || 500;
    res.status(status).json({
      ok: false,
      error: err.message || 'License error',
      code: err.code || undefined,
      until: err.until || undefined,
    });
  });

  app.use('/api/license', r);
}

module.exports = { mountLicenseRoutes };
