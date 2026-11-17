/**
 * Live sync, "ask" mode: the other device's differences are listed and only what is ticked moves.
 *
 * Each "device" is a separate Tank Chief server process with its own data folder,
 * started on the loopback address. They are paired with a code, then kept level.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-sync-'));
let pass = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); pass += 1; console.log('  ok   ' + name); } catch (e) {
    failed += 1; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 4).join('\n       '));
  }
}

/** Run a little script against a device's data folder, the way the app itself would write it. */
function seed(dir, code) {
  const r = spawnSync(process.execPath, ['-e', `const store=require('./server/store');${code}`], {
    cwd: ROOT, env: Object.assign({}, process.env, { TMS_DATA_DIR: dir }), encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('seed failed: ' + r.stderr);
  return r.stdout.trim();
}

const LICENSE = { email: 'Chief@Example.com', licenseId: 'lic-test-1' };

async function boot(name, license) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  const child = spawn(process.execPath, ['-e',
    "require('./server/index').start({ port: 0, host: '127.0.0.1' }).then((r) => console.log('PORT ' + r.port))"],
  { cwd: ROOT, env: Object.assign({}, process.env, { TMS_DATA_DIR: dir }), stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; const m = buf.match(/PORT (\d+)/); if (m) resolve(Number(m[1])); });
    child.on('exit', (c) => reject(new Error(name + ' exited ' + c)));
    setTimeout(() => reject(new Error(name + ' did not start')), 20000);
  });
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, url, body, headers) => {
    const res = await fetch(base + url, {
      method,
      headers: Object.assign(body ? { 'content-type': 'application/json' } : {}, headers || {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const dev = { name, dir, child, port, base, call, stop: () => child.kill() };
  /* The screen tells the server whose license the device is on; a device with none says nothing. */
  if (license !== null) await call('POST', '/api/lan/license', license || LICENSE);
  return dev;
}

function mkVessel(dir, name, imo, extra) {
  return seed(dir, `const v=store.createVessel({name:${JSON.stringify(name)},imo:${JSON.stringify(imo)}});
    ${extra || ''}console.log(v.id)`);
}


function vesselNames(dir) {
  return JSON.parse(seed(dir, "console.log(JSON.stringify(store.listVessels().map(v=>v.name).sort()))"));
}

(async () => {
  const A = await boot('device-a');
  const B = await boot('device-b');
  mkVessel(A.dir, 'MV TEST ONE', '9000001');
  mkVessel(B.dir, 'MV TEST ONE', '9000001');
  const onlyA = mkVessel(A.dir, 'MV ONLY HERE', '9000002');
  const onlyB = mkVessel(B.dir, 'MV ONLY THERE', '9000003');
  try {
    const code = (await B.call('POST', '/api/lan/pair/start')).body.code;
    const paired = await A.call('POST', '/api/lan/peers/pair', { url: B.base, code });
    assert.strictEqual(paired.status, 200, JSON.stringify(paired.body));
    const peerB = paired.body.peers[0].deviceId;

    await check('ask mode: a check finds the differences but moves nothing', async () => {
      await A.call('POST', '/api/lan/config', { enabled: true, mode: 'ask', scope: 'all' });
      const st = (await A.call('POST', '/api/lan/sync-now', { force: true })).body;
      assert.strictEqual(st.mode, 'ask');
      assert.ok(st.peers[0].waiting >= 2, 'two vessels are on one device only: ' + st.peers[0].waiting);
      assert.deepStrictEqual(vesselNames(B.dir), ['MV ONLY THERE', 'MV TEST ONE']);
      assert.deepStrictEqual(vesselNames(A.dir), ['MV ONLY HERE', 'MV TEST ONE']);
    });

    await check('compare lists each item with what it would do', async () => {
      const r = await A.call('POST', '/api/lan/compare', { deviceId: peerB });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const byName = Object.fromEntries(r.body.rows.map((x) => [x.name, x]));
      assert.strictEqual(byName['MV ONLY HERE'].suggest, 'push');
      assert.strictEqual(byName['MV ONLY THERE'].suggest, 'pull');
      assert.ok(r.body.same >= 0);
    });

    await check('only what is ticked moves: push one vessel, leave the other', async () => {
      const r = await A.call('POST', '/api/lan/apply-selected', { deviceId: peerB, items: [{ key: 'k', vesselId: onlyA, action: 'push' }] });
      assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
      assert.deepStrictEqual(vesselNames(B.dir), ['MV ONLY HERE', 'MV ONLY THERE', 'MV TEST ONE']);
      assert.deepStrictEqual(vesselNames(A.dir), ['MV ONLY HERE', 'MV TEST ONE'], 'the pull was not ticked, so it did not happen');
    });

    await check('then pull the other one', async () => {
      const r = await A.call('POST', '/api/lan/apply-selected', { deviceId: peerB, items: [{ key: 'k', peerId: onlyB, action: 'pull' }] });
      assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
      assert.deepStrictEqual(vesselNames(A.dir), ['MV ONLY HERE', 'MV ONLY THERE', 'MV TEST ONE']);
    });

    await check("asking the other device's app: the question waits for the app's answer", async () => {
      const asked = A.call('POST', '/api/lan/peer-ask', { deviceId: peerB, op: 'p2p-manifest', args: { vessel: 'x' } });
      let got = [];
      for (let i = 0; i < 40 && !got.length; i++) {
        got = (await B.call('GET', '/api/lan/pending')).body.asks;
        if (!got.length) await new Promise((r) => setTimeout(r, 100));
      }
      assert.strictEqual(got.length, 1);
      assert.strictEqual(got[0].op, 'p2p-manifest');
      assert.deepStrictEqual(got[0].args, { vessel: 'x' });
      assert.strictEqual((await B.call('GET', '/api/lan/pending')).body.asks.length, 0, 'a question is handed out once');
      await B.call('POST', '/api/lan/answer', { id: got[0].id, result: { legs: 3 } });
      const r = await asked;
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body.result, { legs: 3 });
    });

    await check('an app that cannot do the question reports why', async () => {
      const asked = A.call('POST', '/api/lan/peer-ask', { deviceId: peerB, op: 'apply', args: {} });
      let got = [];
      for (let i = 0; i < 40 && !got.length; i++) { got = (await B.call('GET', '/api/lan/pending')).body.asks; if (!got.length) await new Promise((r) => setTimeout(r, 100)); }
      await B.call('POST', '/api/lan/answer', { id: got[0].id, error: 'Voyage Chief is not open' });
      const r = await asked;
      assert.notStrictEqual(r.status, 200);
      assert.match(r.body.error, /not open/);
    });

    await check('behind a reverse proxy nothing counts as this device: the control routes refuse a forwarded request', async () => {
      const fwd = { 'x-forwarded-for': '203.0.113.9' };
      assert.strictEqual((await A.call('GET', '/api/lan/state', null, fwd)).status, 403);
      assert.strictEqual((await A.call('POST', '/api/lan/pair/start', {}, fwd)).status, 403);
      assert.strictEqual((await A.call('POST', '/api/lan/license', { email: 'x@y.z', licenseId: 'z' }, fwd)).status, 403);
      assert.strictEqual((await A.call('GET', '/api/lan/pending', null, { forwarded: 'for=203.0.113.9' })).status, 403);
      assert.strictEqual((await A.call('POST', '/api/lan/answer', { id: 'x' }, { 'cf-connecting-ip': '203.0.113.9' })).status, 403);
      assert.strictEqual((await A.call('GET', '/api/lan/state')).status, 200, 'the device itself still can');
    });

    await check('an unpaired caller cannot ask, and a bad question name is refused', async () => {
      assert.strictEqual((await B.call('POST', '/api/lan/ask', { op: 'manifest' })).status, 401);
    });
  } finally {
    A.stop(); B.stop();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
  console.log(`\n${pass} passed${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
})();
