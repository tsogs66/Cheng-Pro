/**
 * License HTTP routes — activate / heartbeat / pair / transfer / issue / admin.
 */
'use strict';

const express = require('express');
const path = require('path');
const license = require('./store');
const mail = require('./mail');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireAdmin(req, res) {
  const token = process.env.LICENSE_ADMIN_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === 'production' || process.env.LICENSE_REQUIRE_ADMIN === '1') {
      res.status(503).json({ error: 'LICENSE_ADMIN_TOKEN not configured' });
      return false;
    }
    return true;
  }
  if (req.get('x-license-admin-token') !== token) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
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
      addons: ['eorb'],
      plans: ['yearly', 'lifetime'],
      enforce: process.env.LICENSE_ENFORCE !== '0',
      mailConfigured: mail.mailConfigured(),
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

  /* Issue + email — protect with LICENSE_ADMIN_TOKEN in production. */
  r.post('/issue', asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const issued = license.issueLicense(body);
    let delivery = null;
    const wantMail = body.emailDelivery !== false;
    if (wantMail) {
      delivery = await mail.deliverLicenseEmail(issued);
    }
    res.json({ ok: true, license: issued, delivery });
  }));

  /* Purchase webhook (same auth). Always emails the key. */
  r.post('/purchase-webhook', asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const issued = license.issueLicense({
      email: body.email || body.customer_email,
      sku: body.sku || body.product || 'cheng-aio',
      plan: body.plan || 'yearly',
      years: body.years,
    });
    const delivery = await mail.deliverLicenseEmail(issued);
    res.json({ ok: true, license: issued, delivery });
  }));

  /* ---------- Admin console API ---------- */
  r.get('/admin/licenses', asyncHandler((req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ ok: true, licenses: license.listLicenses({ q: req.query.q }) });
  }));

  r.get('/admin/license', asyncHandler((req, res) => {
    if (!requireAdmin(req, res)) return;
    const row = license.findLicense({
      licenseId: req.query.id,
      licenseKey: req.query.key,
      email: req.query.email,
    });
    if (!row) {
      res.status(404).json({ ok: false, error: 'Not found' });
      return;
    }
    res.json({ ok: true, license: row });
  }));

  r.get('/admin/audit', asyncHandler((req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ ok: true, audit: license.getAudit({ limit: req.query.limit }) });
  }));

  r.post('/admin/transfer', asyncHandler((req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(license.adminForceTransfer(req.body || {}));
  }));

  r.post('/admin/revoke', asyncHandler((req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(license.adminRevoke(req.body || {}));
  }));

  r.post('/admin/resend', asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const row = license.findLicense({
      licenseId: req.body?.licenseId,
      licenseKey: req.body?.licenseKey,
      email: req.body?.email,
    });
    if (!row) {
      res.status(404).json({ ok: false, error: 'Not found' });
      return;
    }
    const delivery = await mail.deliverLicenseEmail(row);
    res.json({ ok: true, delivery, license: { id: row.id, email: row.email, key: row.key } });
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

  /* Static admin console (token entered in the page; never baked into HTML). */
  const adminHtml = path.join(__dirname, '..', '..', 'apps', 'web', 'license-admin.html');
  app.get('/license-admin', (req, res) => {
    res.sendFile(adminHtml);
  });
  app.get('/license-admin.html', (req, res) => {
    res.sendFile(adminHtml);
  });
}

module.exports = { mountLicenseRoutes, requireAdmin };
