/**
 * A running bunkering seen and edited from two devices, tested with two real servers.
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



const readPlan = (dir, id) => JSON.parse(seed(dir, `console.log(JSON.stringify(store.getBunkerPlan(${JSON.stringify(id)})))`));
const revision = (dir, id) => Number(seed(dir, `console.log(store.getVesselBundle(${JSON.stringify(id)}).meta.revision||0)`));
const editSlot = (dir, id, i, field, value) => seed(dir, `const p=store.getBunkerPlan(${JSON.stringify(id)});
  p.sequence[${i}]=Object.assign({}, p.sequence[${i}], {${field}: ${JSON.stringify(value)}}); p.updatedAt=new Date().toISOString();
  store.saveVesselPart(${JSON.stringify(id)}, 'bunkerPlan', p); console.log('ok')`);
async function until(fn, ms, what) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (await fn()) return; } catch (_) { /* try again */ } await new Promise((r) => setTimeout(r, 400)); }
  throw new Error('timed out waiting for ' + what);
}

(async () => {
  const A = await boot('device-a');
  const B = await boot('device-b');
  const idA = mkVessel(A.dir, 'MV LIVE ONE', '9100001');
  const idB = mkVessel(B.dir, 'MV LIVE ONE', '9100001');
  const otherB = mkVessel(B.dir, 'MV SOMEONE ELSE', '9100002');
  seed(A.dir, `store.setActiveVessel(${JSON.stringify(idA)})`);
  seed(B.dir, `store.setActiveVessel(${JSON.stringify(idB)})`);
  try {
    const code = (await B.call('POST', '/api/lan/pair/start')).body.code;
    const paired = await A.call('POST', '/api/lan/peers/pair', { url: B.base, code });
    assert.strictEqual(paired.status, 200, JSON.stringify(paired.body));
    await A.call('POST', '/api/lan/config', { enabled: true, mode: 'ask' });
    await B.call('POST', '/api/lan/config', { enabled: true, mode: 'ask' });

    const slot = (tankId) => ({ tankId, targetVolumeM3: '', currentSoundingMM: '', status: 'pending', startedAt: null, pausedAt: null, elapsedPausedMs: 0, completedAt: null });
    const plan = { header: { port: 'SINGAPORE', bunkerQuantityMT: '1000' }, sequence: [slot('t1'), slot('t2'), slot('t3')], distributionMode: 'equal-storage',
      status: 'planning', startedAt: null, pausedAt: null, elapsedPausedMs: 0, completedAt: null, updatedAt: new Date().toISOString() };
    seed(A.dir, `store.saveVesselPart(${JSON.stringify(idA)}, 'bunkerPlan', ${JSON.stringify(plan)}); console.log('ok')`);

    await check('a plan made on one device appears on the other within seconds, with no tick', async () => {
      await until(() => { const p = readPlan(B.dir, idB); return p && p.header && p.header.port === 'SINGAPORE'; }, 25000, 'the plan on B');
    });

    await check('the pump start on one device is on the other, and the plan is then live', async () => {
      const p = readPlan(A.dir, idA);
      seed(A.dir, `const p=store.getBunkerPlan(${JSON.stringify(idA)}); p.status='running'; p.startedAt=new Date().toISOString(); p.updatedAt=p.startedAt; store.saveVesselPart(${JSON.stringify(idA)}, 'bunkerPlan', p); console.log('ok')`);
      await until(() => { const q = readPlan(B.dir, idB); return q && q.startedAt && q.status === 'running'; }, 25000, 'the pump start on B');
      assert.ok(p);
    });

    await check('two people typing in different tanks at the same moment: both soundings are on both devices', async () => {
      editSlot(A.dir, idA, 0, 'currentSoundingMM', '1200');
      editSlot(B.dir, idB, 2, 'currentSoundingMM', '3400');
      await until(() => {
        const a = readPlan(A.dir, idA), b = readPlan(B.dir, idB);
        const want = ['1200', '', '3400'];
        return JSON.stringify(a.sequence.map((s) => s.currentSoundingMM)) === JSON.stringify(want)
          && JSON.stringify(b.sequence.map((s) => s.currentSoundingMM)) === JSON.stringify(want);
      }, 25000, 'both soundings on both devices');
      const a = readPlan(A.dir, idA), b = readPlan(B.dir, idB);
      assert.strictEqual(JSON.stringify(a.sequence), JSON.stringify(b.sequence), 'the two plans are identical');
      assert.strictEqual(a.startedAt, b.startedAt);
    });

    await check('an idle, equal plan is not rewritten again and again (the revision stays put)', async () => {
      await new Promise((r) => setTimeout(r, 4000));
      const r1 = revision(A.dir, idA) + ':' + revision(B.dir, idB);
      await new Promise((r) => setTimeout(r, 7000));
      const r2 = revision(A.dir, idA) + ':' + revision(B.dir, idB);
      assert.strictEqual(r1, r2, 'revision moved while nothing changed: ' + r1 + ' -> ' + r2);
    });

    await check('a different vessel open on the other device is left alone', async () => {
      seed(B.dir, `store.setActiveVessel(${JSON.stringify(otherB)})`);
      editSlot(A.dir, idA, 1, 'currentSoundingMM', '555');
      await new Promise((r) => setTimeout(r, 9000));
      assert.strictEqual(readPlan(B.dir, otherB), null, 'the other ship has no plan');
      assert.strictEqual(readPlan(B.dir, idB).sequence[1].currentSoundingMM, '', 'and the ship that is not open was not touched');
    });

    await check('the state says a bunkering is live while one runs', async () => {
      seed(B.dir, `store.setActiveVessel(${JSON.stringify(idB)})`);
      await until(async () => (await A.call('GET', '/api/lan/state')).body.liveBunkering.live === true, 20000, 'the live flag');
    });
  } finally {
    A.stop(); B.stop();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
  console.log(`\n${pass} passed${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
})();
