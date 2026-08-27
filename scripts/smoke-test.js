'use strict';

/**
 * Smoke test: shared vessel + separate planes + active vessel.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cheng-pro-'));
process.env.CHENG_PRO_DATA_DIR = tmp;
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';

const store = require('../server/store');
const app = require('../server/index');

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;

  try {
    const health = await request(port, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.product, 'cheng-pro');

    const created = await request(port, 'POST', '/api/vessels', {
      name: 'MV SMOKE TEST',
      imo: '9988776',
      flag: 'LR',
      company: 'Test Co',
    });
    assert.equal(created.status, 201);
    const id = created.json.id;
    assert.ok(id);

    // Shared layout
    assert.ok(fs.existsSync(path.join(tmp, 'vessels', id, 'vessel.json')));
    assert.ok(fs.existsSync(path.join(tmp, 'vessels', id, 'tanks', 'tanks.json')));
    assert.ok(fs.existsSync(path.join(tmp, 'vessels', id, 'voyage', 'setup.json')));

    const active = await request(port, 'POST', '/api/vessels/active', { id });
    assert.equal(active.status, 200);
    assert.equal(active.json.activeVesselId, id);

    const tank = await request(port, 'POST', `/api/tanks/${id}/tanks`, {
      name: 'TEST HFO',
      category: 'fuel',
      capacity: 100,
    });
    assert.equal(tank.status, 201);

    const tanksBundle = await request(port, 'GET', `/api/tanks/${id}`);
    assert.equal(tanksBundle.status, 200);
    assert.equal(tanksBundle.json.vessel.name, 'MV SMOKE TEST');
    assert.ok(tanksBundle.json.tanks.fuel.length >= 1);

    await request(port, 'PUT', `/api/voyage/${id}/setup`, {
      voyageNumber: '99',
      shipCondition: 'L',
      chEng: 'Smoke CE',
    });

    const voyage = await request(port, 'GET', `/api/voyage/${id}`);
    assert.equal(voyage.status, 200);
    assert.equal(voyage.json.setup.voyageNumber, '99');
    // Shared identity mirrored, not overwritten by client attempt
    assert.equal(voyage.json.setup.vesselName, 'MV SMOKE TEST');
    assert.equal(voyage.json.setup.imoNo, '9988776');

    // Tank write must not create voyage entries file pollution at root
    const rootFiles = fs.readdirSync(path.join(tmp, 'vessels', id));
    assert.ok(rootFiles.includes('vessel.json'));
    assert.ok(rootFiles.includes('tanks'));
    assert.ok(rootFiles.includes('voyage'));
    assert.ok(!rootFiles.includes('tanks.json'), 'legacy flat tanks.json must not exist at vessel root');

    const leg = await request(port, 'PUT', `/api/voyage/${id}/99/L`, {
      data: {
        setup: { voyageNumber: '99', shipCondition: 'L' },
        entries: [{ id: 'e1', datetime: '2026-08-01 12:00', operation: 'NOON', updatedAt: '2026-08-01T12:00:00.000Z' }],
        receipts: [],
        documents: [],
        abstracts: [],
        printHistory: [],
        orbEntries: [],
        deletedIds: {},
      },
    });
    assert.equal(leg.status, 200);
    assert.equal(leg.json.data.entries.length, 1);

    // Identity update propagates to voyage setup
    await request(port, 'PUT', `/api/vessels/${id}`, { name: 'MV SMOKE RENAMED', imo: '9988776' });
    const voyage2 = await request(port, 'GET', `/api/voyage/${id}`);
    assert.equal(voyage2.json.setup.vesselName, 'MV SMOKE RENAMED');

    console.log('smoke-test: ok');
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
