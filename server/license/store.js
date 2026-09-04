/**
 * License store — JSON file under the data directory.
 * Production should point LICENSE_SERVER_URL at a dedicated host; this module
 * is the local/dev implementation of the same API shape.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GRACE_DAYS = 60;
const PAIR_TTL_MS = 15 * 60 * 1000;
const TRANSFER_COOLDOWN_DAYS = 14;
const TRANSFER_YEARLY_CAP = 2;

function dataRoot() {
  return process.env.CHENG_PRO_DATA_DIR
    || process.env.TMS_DATA_DIR
    || path.join(__dirname, '..', '..', 'data');
}

function storePath() {
  return path.join(dataRoot(), 'licenses.json');
}

function signingSecret() {
  return process.env.LICENSE_SIGNING_SECRET
    || process.env.CHENG_PRO_LICENSE_SECRET
    || 'dev-only-change-me-cheng-aio-license';
}

function load() {
  const p = storePath();
  let db;
  try {
    if (!fs.existsSync(p)) {
      return { licenses: {}, pairing: {}, audit: [] };
    }
    db = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { licenses: {}, pairing: {}, audit: [] };
  }
  /* Pre-addon AIO keys had empty addons but meant the full suite. */
  let changed = false;
  for (const lic of Object.values(db.licenses || {})) {
    if (lic.sku === 'cheng-aio' && !lic.addonsSelected
        && (!Array.isArray(lic.addons) || lic.addons.length === 0)) {
      lic.addons = ['voyage-chief', 'tank-chief', 'eorb'];
      lic.addonsSelected = true;
      changed = true;
    }
  }
  if (changed) save(db);
  return db;
}

function save(db) {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(db, null, 2));
}

function audit(db, event, detail) {
  db.audit.push({ at: new Date().toISOString(), event, ...detail });
  if (db.audit.length > 2000) db.audit = db.audit.slice(-1500);
}

function newId(prefix) {
  return prefix + '-' + crypto.randomBytes(8).toString('hex');
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function signEntitlement(payload) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', signingSecret()).update(body).digest('hex');
  return { ...payload, sig };
}

function verifyEntitlement(ent) {
  if (!ent || !ent.sig) return false;
  const { sig, ...rest } = ent;
  const expect = crypto.createHmac('sha256', signingSecret()).update(JSON.stringify(rest)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  } catch {
    return false;
  }
}

function isMasterLicense(license) {
  if (!license) return false;
  if (license.sku === 'cheng-admin') return true;
  const addons = Array.isArray(license.addons) ? license.addons : [];
  return addons.includes('master');
}

function makeEntitlement(license, seat, deviceId) {
  const now = new Date().toISOString();
  return signEntitlement({
    licenseId: license.id,
    sku: license.sku,
    plan: license.plan,
    email: license.email,
    addons: Array.isArray(license.addons) ? license.addons.slice() : [],
    master: isMasterLicense(license),
    deviceSeat: seat,
    deviceId,
    issuedAt: license.createdAt,
    checkedAt: now,
    expiresAt: license.expiresAt || null,
    graceUntil: addDays(now, GRACE_DAYS),
  });
}

function findByKey(db, licenseKey) {
  const key = String(licenseKey || '').trim().toUpperCase();
  return Object.values(db.licenses).find((l) => l.key === key) || null;
}

function seatSlot(license, seat) {
  if (!license.seats) license.seats = { android: null, windows: null };
  if (seat !== 'android' && seat !== 'windows') {
    const err = new Error('Seat must be android or windows');
    err.status = 400;
    throw err;
  }
  return license.seats;
}

const KEY_PREFIX_BY_SKU = {
  'cheng-aio': 'CA',
  'voyage-chief': 'VC',
  'tank-chief': 'TC',
  'cheng-admin': 'MA',
};

function keyPrefixForSku(sku) {
  return KEY_PREFIX_BY_SKU[sku] || 'CK';
}

/**
 * Create a sellable license (admin / purchase webhook).
 * addons: optional string[] — 'eorb', 'voyage-chief', 'tank-chief',
 * 'consumption-plan', 'bunker-plan', 'master'.
 * On cheng-aio, voyage-chief / tank-chief / eorb / consumption-plan /
 * bunker-plan are selected programs (like add-ons).
 * SKU `cheng-admin` is the master license (unlocks everything; entitlement.master = true).
 */
function normalizeAddons(addons) {
  const allow = new Set([
    'eorb', 'master', 'voyage-chief', 'tank-chief',
    /* Planning screens sold on their own: the voyage fuel consumption
       calculation, and the bunkering fill sequence / monitoring sheet. */
    'consumption-plan', 'bunker-plan',
  ]);
  const list = Array.isArray(addons) ? addons : (typeof addons === 'string' ? addons.split(',') : []);
  return [...new Set(list.map((a) => String(a || '').trim().toLowerCase()).filter((a) => allow.has(a)))];
}

function issueLicense({ email, sku, plan, years, addons }) {
  const db = load();
  const id = newId('lic');
  const now = new Date().toISOString();
  let expiresAt = null;
  if (plan === 'yearly') {
    expiresAt = addDays(now, 365 * (Number(years) || 1));
  } else if (plan !== 'lifetime') {
    const err = new Error('plan must be yearly or lifetime');
    err.status = 400;
    throw err;
  }
  const resolvedSku = sku || 'cheng-aio';
  const prefix = keyPrefixForSku(resolvedSku);
  const key = (prefix + '-' + crypto.randomBytes(4).toString('hex') + '-' + crypto.randomBytes(4).toString('hex')).toUpperCase();
  const license = {
    id,
    key,
    email: String(email || '').trim().toLowerCase(),
    sku: resolvedSku,
    plan: plan || 'yearly',
    addons: normalizeAddons(addons),
    addonsSelected: true,
    createdAt: now,
    expiresAt,
    seats: { android: null, windows: null },
    transfers: [],
  };
  db.licenses[id] = license;
  audit(db, 'issue', { licenseId: id, email: license.email, sku: license.sku, plan: license.plan, addons: license.addons });
  save(db);
  return {
    id,
    key,
    email: license.email,
    sku: license.sku,
    plan: license.plan,
    addons: license.addons,
    expiresAt,
  };
}

function activate({ licenseKey, email, seat, deviceId, deviceLabel }) {
  const db = load();
  const license = findByKey(db, licenseKey);
  if (!license) {
    const err = new Error('Invalid license key');
    err.status = 404;
    throw err;
  }
  if (email && license.email && license.email !== String(email).trim().toLowerCase()) {
    const err = new Error('Email does not match this license');
    err.status = 403;
    throw err;
  }
  if (license.expiresAt && license.expiresAt < new Date().toISOString()) {
    const err = new Error('License expired — renew yearly plan');
    err.status = 402;
    throw err;
  }
  if (license.revokedAt) {
    const err = new Error('License revoked');
    err.status = 403;
    err.code = 'REVOKED';
    throw err;
  }
  if (!deviceId) {
    const err = new Error('deviceId required');
    err.status = 400;
    throw err;
  }
  const seats = seatSlot(license, seat);
  const current = seats[seat];
  if (current && current.deviceId !== deviceId) {
    const err = new Error(
      `${seat} seat already bound to another device. Request a seat transfer (cooldown ${TRANSFER_COOLDOWN_DAYS} days) or contact support.`
    );
    err.status = 409;
    err.code = 'SEAT_TAKEN';
    throw err;
  }
  seats[seat] = {
    deviceId,
    deviceLabel: deviceLabel || '',
    boundAt: current?.boundAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  audit(db, 'activate', { licenseId: license.id, seat, deviceId });
  save(db);
  return makeEntitlement(license, seat, deviceId);
}

function heartbeat({ licenseId, seat, deviceId, entitlement }) {
  if (entitlement && !verifyEntitlement(entitlement)) {
    const err = new Error('Invalid entitlement signature');
    err.status = 401;
    throw err;
  }
  const db = load();
  const license = db.licenses[licenseId] || (entitlement && findByKey(db, entitlement.licenseKey));
  const lic = license || (entitlement ? db.licenses[entitlement.licenseId] : null);
  if (!lic) {
    const err = new Error('License not found');
    err.status = 404;
    throw err;
  }
  if (lic.expiresAt && lic.expiresAt < new Date().toISOString()) {
    const err = new Error('License expired');
    err.status = 402;
    throw err;
  }
  if (lic.revokedAt) {
    const err = new Error('License revoked');
    err.status = 403;
    err.code = 'REVOKED';
    throw err;
  }
  const seats = seatSlot(lic, seat);
  const current = seats[seat];
  if (!current || current.deviceId !== deviceId) {
    const err = new Error('This device is not bound to that seat');
    err.status = 403;
    throw err;
  }
  current.lastSeenAt = new Date().toISOString();
  audit(db, 'heartbeat', { licenseId: lic.id, seat, deviceId });
  save(db);
  return makeEntitlement(lic, seat, deviceId);
}

function pairStart({ licenseKey, email, deviceId }) {
  const db = load();
  const license = findByKey(db, licenseKey);
  if (!license) {
    const err = new Error('Invalid license key');
    err.status = 404;
    throw err;
  }
  if (email && license.email !== String(email).trim().toLowerCase()) {
    const err = new Error('Email does not match');
    err.status = 403;
    throw err;
  }
  const android = license.seats?.android;
  if (!android || android.deviceId !== deviceId) {
    const err = new Error('Pairing must start from the activated Android seat');
    err.status = 403;
    throw err;
  }
  const code = String(crypto.randomInt(100000, 999999));
  db.pairing[code] = {
    licenseId: license.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + PAIR_TTL_MS,
  };
  audit(db, 'pair_start', { licenseId: license.id });
  save(db);
  return { code, expiresInSec: PAIR_TTL_MS / 1000 };
}

function pairComplete({ code, deviceId, deviceLabel }) {
  const db = load();
  const entry = db.pairing[String(code || '').trim()];
  if (!entry || entry.expiresAt < Date.now()) {
    const err = new Error('Pairing code invalid or expired');
    err.status = 400;
    throw err;
  }
  const license = db.licenses[entry.licenseId];
  if (!license) {
    const err = new Error('License missing');
    err.status = 404;
    throw err;
  }
  delete db.pairing[String(code).trim()];
  save(db);
  return activate({
    licenseKey: license.key,
    email: license.email,
    seat: 'windows',
    deviceId,
    deviceLabel,
  });
}

function requestTransfer({ licenseKey, email, seat, reason }) {
  const db = load();
  const license = findByKey(db, licenseKey);
  if (!license) {
    const err = new Error('Invalid license key');
    err.status = 404;
    throw err;
  }
  if (email && license.email !== String(email).trim().toLowerCase()) {
    const err = new Error('Email does not match');
    err.status = 403;
    throw err;
  }
  const yearAgo = addDays(new Date().toISOString(), -365);
  const recent = (license.transfers || []).filter((t) => t.at >= yearAgo && t.seat === seat);
  if (recent.length >= TRANSFER_YEARLY_CAP) {
    const err = new Error('Transfer limit reached for this year — contact support');
    err.status = 429;
    err.code = 'TRANSFER_CAP';
    throw err;
  }
  const seats = seatSlot(license, seat);
  const current = seats[seat];
  if (current && current.boundAt) {
    const earliest = addDays(current.boundAt, TRANSFER_COOLDOWN_DAYS);
    if (earliest > new Date().toISOString()) {
      const err = new Error(`Seat transfer cooldown until ${earliest.slice(0, 10)}`);
      err.status = 429;
      err.code = 'TRANSFER_COOLDOWN';
      err.until = earliest;
      throw err;
    }
  }
  seats[seat] = null;
  license.transfers = license.transfers || [];
  license.transfers.push({ at: new Date().toISOString(), seat, reason: reason || 'user_request' });
  audit(db, 'transfer_clear', { licenseId: license.id, seat, reason });
  save(db);
  return { ok: true, message: `${seat} seat cleared — activate on the new device` };
}

function publicLicenseView(license) {
  return {
    id: license.id,
    key: license.key,
    email: license.email,
    sku: license.sku,
    plan: license.plan,
    addons: Array.isArray(license.addons) ? license.addons : [],
    createdAt: license.createdAt,
    expiresAt: license.expiresAt || null,
    revokedAt: license.revokedAt || null,
    seats: {
      android: license.seats?.android
        ? {
            deviceId: license.seats.android.deviceId,
            deviceLabel: license.seats.android.deviceLabel || '',
            boundAt: license.seats.android.boundAt,
            lastSeenAt: license.seats.android.lastSeenAt,
          }
        : null,
      windows: license.seats?.windows
        ? {
            deviceId: license.seats.windows.deviceId,
            deviceLabel: license.seats.windows.deviceLabel || '',
            boundAt: license.seats.windows.boundAt,
            lastSeenAt: license.seats.windows.lastSeenAt,
          }
        : null,
    },
    transfers: license.transfers || [],
  };
}

function listLicenses({ q } = {}) {
  const db = load();
  const needle = String(q || '').trim().toLowerCase();
  let rows = Object.values(db.licenses).map(publicLicenseView);
  if (needle) {
    rows = rows.filter((r) =>
      r.email.includes(needle)
      || r.key.toLowerCase().includes(needle)
      || r.id.toLowerCase().includes(needle)
      || (r.sku || '').includes(needle));
  }
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows;
}

function getAudit({ limit } = {}) {
  const db = load();
  const n = Math.min(500, Math.max(1, Number(limit) || 100));
  return (db.audit || []).slice(-n).reverse();
}

/** Admin: clear a seat ignoring cooldown / yearly cap. */
function adminForceTransfer({ licenseId, licenseKey, seat, reason }) {
  const db = load();
  const license = (licenseId && db.licenses[licenseId]) || findByKey(db, licenseKey);
  if (!license) {
    const err = new Error('License not found');
    err.status = 404;
    throw err;
  }
  const seats = seatSlot(license, seat);
  seats[seat] = null;
  license.transfers = license.transfers || [];
  license.transfers.push({
    at: new Date().toISOString(),
    seat,
    reason: reason || 'admin_override',
    admin: true,
  });
  audit(db, 'admin_transfer', { licenseId: license.id, seat, reason });
  save(db);
  return { ok: true, license: publicLicenseView(license) };
}

function adminRevoke({ licenseId, licenseKey, reason }) {
  const db = load();
  const license = (licenseId && db.licenses[licenseId]) || findByKey(db, licenseKey);
  if (!license) {
    const err = new Error('License not found');
    err.status = 404;
    throw err;
  }
  license.revokedAt = new Date().toISOString();
  license.seats = { android: null, windows: null };
  audit(db, 'admin_revoke', { licenseId: license.id, reason: reason || '' });
  save(db);
  return { ok: true, license: publicLicenseView(license) };
}

function findLicense({ licenseId, licenseKey, email }) {
  const db = load();
  if (licenseId && db.licenses[licenseId]) return publicLicenseView(db.licenses[licenseId]);
  if (licenseKey) {
    const l = findByKey(db, licenseKey);
    if (l) return publicLicenseView(l);
  }
  if (email) {
    const needle = String(email).trim().toLowerCase();
    const l = Object.values(db.licenses).find((x) => x.email === needle);
    if (l) return publicLicenseView(l);
  }
  return null;
}

module.exports = {
  GRACE_DAYS,
  TRANSFER_COOLDOWN_DAYS,
  TRANSFER_YEARLY_CAP,
  KEY_PREFIX_BY_SKU,
  keyPrefixForSku,
  isMasterLicense,
  issueLicense,
  activate,
  heartbeat,
  pairStart,
  pairComplete,
  requestTransfer,
  verifyEntitlement,
  load,
  listLicenses,
  getAudit,
  adminForceTransfer,
  adminRevoke,
  findLicense,
  publicLicenseView,
};
