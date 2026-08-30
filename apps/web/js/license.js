/**
 * Client license gate — 60-day grace, activate / pair / heartbeat.
 */
(function (global) {
  const STORAGE_KEY = 'chengAioLicenseEntitlement';
  const DEVICE_KEY = 'chengAioLicenseDeviceId';

  function apiBase() {
    if (global.CHENG_LICENSE_API) return String(global.CHENG_LICENSE_API).replace(/\/$/, '');
    return '/api/license';
  }

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (id) return id;
      id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch {
      return 'dev-ephemeral';
    }
  }

  function detectSeat() {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad/i.test(ua)) return 'android';
    return 'windows';
  }

  function loadEntitlement() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveEntitlement(ent) {
    try {
      if (ent) localStorage.setItem(STORAGE_KEY, JSON.stringify(ent));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }

  function isValid(ent) {
    if (!ent || !ent.graceUntil) return false;
    if (ent.expiresAt && ent.expiresAt < new Date().toISOString()) return false;
    return ent.graceUntil >= new Date().toISOString();
  }

  function daysLeft(ent) {
    if (!ent || !ent.graceUntil) return 0;
    const ms = new Date(ent.graceUntil).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  async function post(path, body) {
    const res = await fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.status = res.status;
      err.code = data.code;
      throw err;
    }
    return data;
  }

  async function activate({ licenseKey, email, seat }) {
    const data = await post('/activate', {
      licenseKey,
      email,
      seat: seat || detectSeat(),
      deviceId: deviceId(),
      deviceLabel: navigator.userAgent.slice(0, 120),
    });
    saveEntitlement(data.entitlement);
    return data.entitlement;
  }

  async function heartbeat() {
    const ent = loadEntitlement();
    if (!ent) throw new Error('No license on this device');
    const data = await post('/heartbeat', {
      licenseId: ent.licenseId,
      seat: ent.deviceSeat || detectSeat(),
      deviceId: deviceId(),
      entitlement: ent,
    });
    saveEntitlement(data.entitlement);
    return data.entitlement;
  }

  async function pairStart({ licenseKey, email }) {
    return post('/pair/start', {
      licenseKey,
      email,
      deviceId: deviceId(),
    });
  }

  async function pairComplete({ code }) {
    const data = await post('/pair/complete', {
      code,
      deviceId: deviceId(),
      deviceLabel: navigator.userAgent.slice(0, 120),
    });
    saveEntitlement(data.entitlement);
    return data.entitlement;
  }

  async function requestTransfer({ licenseKey, email, seat, reason }) {
    return post('/transfer', {
      licenseKey,
      email,
      seat: seat || detectSeat(),
      reason,
    });
  }

  /** Soft gate: try heartbeat when online if grace ≤ 7 days. */
  async function ensureLicensed() {
    const ent = loadEntitlement();
    if (isValid(ent)) {
      if (daysLeft(ent) <= 7 && navigator.onLine) {
        try { await heartbeat(); } catch { /* keep cached grace */ }
      }
      return { ok: true, entitlement: loadEntitlement() };
    }
    return { ok: false, entitlement: ent, reason: ent ? 'grace_expired' : 'missing' };
  }

  global.ChengLicense = {
    deviceId,
    detectSeat,
    loadEntitlement,
    saveEntitlement,
    isValid,
    daysLeft,
    activate,
    heartbeat,
    pairStart,
    pairComplete,
    requestTransfer,
    ensureLicensed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
