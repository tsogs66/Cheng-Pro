'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cheng-pro-'));
process.env.CHENG_PRO_DATA_DIR = tmp;
process.env.TMS_DATA_DIR = tmp;
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.SYNC_PORT = String(18787 + Math.floor(Math.random() * 1000));
process.env.SYNC_ADMIN_PASSWORD = 'test-admin-pass';

function request(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const { boot } = require('../server/index');
  const server = await boot();
  const port = server.address().port;

  try {
    const health = await request(port, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.product, 'cheng-aio');
    assert.ok(health.json.modules.voyage.ok, 'voyage sync should be ok');
    assert.ok(health.json.modules.tanks.ok, 'tanks should be ok');

    const created = await request(port, 'POST', '/api/shell/vessels', {
      name: 'MV SMOKE TEST',
      imo: '9988776',
      flag: 'LR',
    });
    assert.equal(created.status, 201);
    const id = created.json.id;

    assert.ok(fs.existsSync(path.join(tmp, 'vessels', id, 'vessel.json')));
    assert.ok(fs.existsSync(path.join(tmp, 'vessels', id, 'tanks.json')));

    await request(port, 'POST', '/api/shell/vessels/active', { id });

    const tankHealth = await request(port, 'GET', '/tanks/api/health');
    assert.equal(tankHealth.status, 200);

    const tankVessel = await request(port, 'GET', `/tanks/api/vessels/${id}`);
    assert.equal(tankVessel.status, 200);
    assert.equal(tankVessel.json.vessel.name, 'MV SMOKE TEST');

    const tankPage = await request(port, 'GET', '/tanks/');
    assert.equal(tankPage.status, 200);
    assert.ok(String(tankPage.raw).includes('ChEng AIO') || String(tankPage.raw).includes('Tank'));

    const voyagePage = await request(port, 'GET', '/voyage/');
    assert.equal(voyagePage.status, 200);

    const voyageHealth = await request(port, 'GET', '/api/auth/login'.replace('auth/login', 'health'));
    // /api/health already checked voyage; also hit voyage list auth-open
    const vHealth = await request(port, 'GET', '/api/health');
    assert.ok(vHealth.json.modules.voyage);

    // Admin login against proxied Python auth
    const login = await request(port, 'POST', '/api/auth/login', {
      username: 'admin',
      password: process.env.SYNC_ADMIN_PASSWORD,
    });
    assert.equal(login.status, 200, 'admin login: ' + JSON.stringify(login.json));
    assert.ok(login.json.sessionToken, 'expected sessionToken');

    const shell = await request(port, 'GET', '/');
    assert.equal(shell.status, 200);
    assert.ok(String(shell.raw).includes('ChEng AIO'));
    assert.ok(String(shell.raw).includes('Performance'), 'Performance menu item');
    assert.ok(String(shell.raw).includes('perf-calc.js'), 'perf-calc script');
    assert.ok(String(shell.raw).includes('voyage-bridge.js'), 'voyage bridge script');

    const engineVessel = await request(port, 'PUT', `/api/shell/vessels/${id}`, {
      name: 'MV SMOKE TEST',
      imo: '9988776',
      flag: 'LR',
      mcrRpm: 91,
      mcrKw: 18630,
      sfoc100: 178.5,
      sfoc85: 175.2,
      lcvRef: 42700,
      lcvActual: 41200,
      slocRef: 0.85,
      pitch: 5.85,
    });
    assert.equal(engineVessel.status, 200);
    assert.equal(engineVessel.json.mcrKw, 18630);
    assert.equal(engineVessel.json.lcvActual, 41200);

    const syncRoot = await request(port, 'GET', '/api/sync/export');
    assert.equal(syncRoot.status, 200, 'tank sync export at gateway root');
    assert.equal(syncRoot.json.format, 'vessel-fuel-tms-sync');

    const syncTanks = await request(port, 'GET', '/tanks/api/sync/export');
    assert.equal(syncTanks.status, 200, 'tank sync export under /tanks');
    assert.equal(syncTanks.json.format, 'vessel-fuel-tms-sync');

    const probeOk = await request(port, 'POST', '/api/sync/probe', {
      syncUrl: `http://127.0.0.1:${port}`,
    });
    assert.equal(probeOk.status, 200, 'sync probe self');
    assert.equal(probeOk.json.ok, true);

    const ping = await request(port, 'GET', '/api/sync/ping');
    assert.equal(ping.status, 200);
    assert.equal(ping.json.format, 'vessel-fuel-tms-sync');
    const pingTanks = await request(port, 'GET', '/tanks/api/sync/ping');
    assert.equal(pingTanks.status, 200);
    assert.equal(pingTanks.json.product, 'tank-chief');

    const probeBad = await request(port, 'POST', '/api/sync/probe', {
      syncUrl: 'https://voyagemanager.tsogs.cloud',
    });
    assert.equal(probeBad.status, 502);
    assert.ok(/Could not reach peer/i.test(probeBad.json.error || ''), probeBad.json.error);

    require('./perf-calc-test');

    console.log('smoke-test: ok');
  } finally {
    try {
      server.close();
    } catch { /* ignore */ }
    // voyage child killed on SIGTERM of process — force exit
    setTimeout(() => process.exit(0), 500);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
