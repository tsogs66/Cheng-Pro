/* Live sync, Voyage Chief's side: who is on the same ship, and what the agent does about it. */
'use strict';
const assert = require('assert');
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('  ok   ' + name); }, (e) => { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; });

const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });

let mineVessel = { vesselName: 'MV TEST ONE', imoNo: '9000001' };
let devices = [];
let presenceStatus = 200;
let syncCalls = [];
let reconcileCalls = [];
let legs = [];
global.state = { get setup() { return mineVessel; }, vessels: [{ name: 'MV TEST ONE', imoNo: '9000001' }] };
global.ensureSyncConfig = () => ({ deviceId: 'me', deviceName: 'My tablet' });
global.syncApiBase = () => 'http://192.168.0.5:8787';
global.syncRequestHeaders = (h) => Object.assign({}, h);
global.syncNow = async (o) => { syncCalls.push(o); };
global.compareLocalAndServerLegs = async () => ({ rows: legs });
global.reconcileVoyageLegs = async (l) => { reconcileCalls.push(l); };
global.fetchVesselLibrary = async () => [];
global.printHoldActive = () => false;
global.fetch = async (url, init) => {
  if (/presence/.test(url)) {
    return { ok: presenceStatus === 200, status: presenceStatus, json: async () => (presenceStatus === 200 ? { ok: true, devices } : { error: 'no' }) };
  }
  throw new Error('unexpected ' + url);
};

let ent = { email: 'Chief@Example.com', licenseId: 'lic-1' };
global.ChengLicense = { loadEntitlement: () => ent, isValid: (e) => !!(e && !e.expired) };
const L = require('../www/lan-sync.js');
const TAG = L.licenseTagOf('chief@example.com', 'lic-1');

(async () => {
  console.log('Same ship');
  await ok('the IMO number decides when both have one, whatever the name says', () => {
    assert.ok(L.sameHull({ name: 'MV A', imo: '9000001' }, { name: 'M/V AAA', imo: '9000001' }));
    assert.ok(!L.sameHull({ name: 'MV A', imo: '9000001' }, { name: 'MV A', imo: '9000002' }));
  });
  await ok('with no IMO the name is compared, ignoring spaces and punctuation', () => {
    assert.ok(L.sameHull({ name: 'M/V Test One' }, { name: 'MV TEST-ONE' }));
    assert.ok(!L.sameHull({ name: '' }, { name: '' }));
    assert.ok(!L.sameHull(null, { name: 'x' }));
  });
  await ok('the agent syncs only with devices on the same ship, and says why it does not', () => {
    const me = { name: 'MV TEST ONE', imo: '9000001' };
    assert.strictEqual(L.decide(me, 'me', [], TAG).action, 'wait');
    assert.strictEqual(L.decide(me, 'me', [{ deviceId: 'me', name: 'Me', vessel: me, license: TAG }], TAG).action, 'wait');
    const other = L.decide(me, 'me', [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV OTHER', imo: '9000009' }, license: TAG }], TAG);
    assert.strictEqual(other.action, 'wait');
    assert.ok(other.different && /Laptop is on MV OTHER/.test(other.message), other.message);
    assert.strictEqual(L.decide(me, 'me', [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' }, license: TAG }], TAG).action, 'sync');
  });

  console.log('What it does each round');
  store.voyageLanSync = JSON.stringify({ enabled: true, scopeAll: false });
  await ok('another device on the same ship: the open leg is synced, in the background, merging', async () => {
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' }, license: TAG }];
    syncCalls = [];
    await L.tick(false);
    assert.strictEqual(syncCalls.length, 1);
    assert.deepStrictEqual([syncCalls[0].background, syncCalls[0].policy], [true, 'merge']);
    assert.strictEqual(L._state.status, 'connected');
  });
  await ok('another device on a different ship: nothing is synced, and the status says so', async () => {
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV OTHER', imo: '9000009' }, license: TAG }];
    syncCalls = [];
    await L.tick(false);
    assert.strictEqual(syncCalls.length, 0);
    assert.strictEqual(L._state.status, 'different-vessel');
  });
  await ok('legs one side lacks are listed, and not copied unless the whole database was chosen', async () => {
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' }, license: TAG }];
    legs = [{ voyage: '12', condition: 'L', action: 'pull' }, { voyage: '11', condition: 'B', action: 'same' }];
    reconcileCalls = [];
    L._touch(0);                              // idle for ages
    await L.tick(true);
    assert.strictEqual(L._state.missingLegs.length, 1);
    assert.strictEqual(reconcileCalls.length, 0);
  });
  await ok('with the whole database chosen and the device idle, the missing legs are copied', async () => {
    store.voyageLanSync = JSON.stringify({ enabled: true, scopeAll: true });
    reconcileCalls = [];
    L._touch(0);
    await L.tick(true);
    assert.deepStrictEqual(reconcileCalls, [[{ voyage: '12', condition: 'L' }]]);
    assert.strictEqual(L._state.missingLegs.length, 0);
  });
  await ok('but not while someone is typing: the legs are only listed', async () => {
    reconcileCalls = [];
    L._touch(Date.now());
    await L.tick(true);
    assert.strictEqual(reconcileCalls.length, 0);
    assert.strictEqual(L._state.missingLegs.length, 1);
  });
  await ok('a server that stops accepting this device is reported as needing a new pairing', async () => {
    presenceStatus = 401;
    await L.tick(false);
    assert.strictEqual(L._state.status, 'unpaired');
    presenceStatus = 200;
  });
  await ok('nothing happens while the feature is off', async () => {
    store.voyageLanSync = JSON.stringify({ enabled: false });
    syncCalls = [];
    await L.tick(true);
    assert.strictEqual(syncCalls.length, 0);
  });
  console.log('Only the same license');
  await ok('the hash matches the real SHA-256 (it is computed in plain JS: http pages have no crypto.subtle)', () => {
    const c = require('crypto');
    for (const t of ['abc', '', 'lan-license|chief@example.com|lic-1', 'é ñ 日本']) {
      assert.strictEqual(L.sha256(t), c.createHash('sha256').update(t, 'utf8').digest('hex'), t);
    }
  });
  await ok('the same email in another case or with spaces is the same license; another license id or email is not', () => {
    assert.strictEqual(L.licenseTagOf('  CHIEF@example.COM ', 'lic-1'), TAG);
    assert.notStrictEqual(L.licenseTagOf('chief@example.com', 'lic-2'), TAG);
    assert.notStrictEqual(L.licenseTagOf('other@example.com', 'lic-1'), TAG);
    assert.strictEqual(L.licenseTagOf('chief@example.com', ''), '');
    assert.ok(!TAG.includes('lic-1') && !/chief/i.test(TAG));
  });
  await ok('a device on another license is never synced with, even on the same ship, and the status says so', async () => {
    store.voyageLanSync = JSON.stringify({ enabled: true, scopeAll: false });
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' }, license: L.licenseTagOf('someone@else.com', 'lic-9') }];
    syncCalls = [];
    await L.tick(false);
    assert.strictEqual(syncCalls.length, 0);
    assert.strictEqual(L._state.status, 'different-license');
    assert.ok(/different licenses/i.test(L._state.message), L._state.message);
  });
  await ok('a device that sends no license (an older build) counts as a different one', () => {
    const me = { name: 'MV TEST ONE', imo: '9000001' };
    const d = L.decide(me, 'me', [{ deviceId: 'old', name: 'Old', vessel: me }], TAG);
    assert.strictEqual(d.action, 'wait');
    assert.strictEqual(d.license, 'different');
  });
  await ok('with a matching and a non-matching device, only the matching one is synced with', () => {
    const me = { name: 'MV TEST ONE', imo: '9000001' };
    const d = L.decide(me, 'me', [
      { deviceId: 'a', name: 'Stranger', vessel: me, license: L.licenseTagOf('x@y.com', 'z') },
      { deviceId: 'b', name: 'Mine', vessel: me, license: TAG }], TAG);
    assert.strictEqual(d.action, 'sync');
    assert.deepStrictEqual(d.peers.map((p) => p.name), ['Mine']);
  });
  await ok('with no valid license on this device nothing is synced and nothing is sent', async () => {
    ent = { email: 'chief@example.com', licenseId: 'lic-1', expired: true };
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' }, license: TAG }];
    syncCalls = [];
    let posted = 0;
    const was = global.fetch;
    global.fetch = async (u, i) => { posted++; return was(u, i); };
    await L.tick(true);
    global.fetch = was;
    assert.strictEqual(syncCalls.length, 0);
    assert.strictEqual(posted, 0, 'not even presence is sent');
    assert.strictEqual(L._state.status, 'no-license');
    ent = { email: 'Chief@Example.com', licenseId: 'lic-1' };
  });
  await ok('showing a pairing code or pairing needs a license on this device', async () => {
    ent = null;
    await assert.rejects(() => L.pairWith('http://192.168.0.5:8787', '123456'), /Activate your license/);
    ent = { email: 'Chief@Example.com', licenseId: 'lic-1' };
  });
  await ok('a scan tries the page\'s own server first, then the usual router and hotspot ranges', () => {
    const c = L.candidates('http://192.168.0.5:8080', ['192.168.43.1']);
    assert.strictEqual(c[0], 'http://192.168.0.5:8080');
    assert.ok(c.includes('http://192.168.43.1:8787') && c.includes('http://192.168.137.2:8787') && c.includes('http://172.20.10.2:8787'));
    assert.ok(!L.candidates('http://localhost:8080', []).includes('http://localhost:8080'));
  });
  console.log(`\n${n} passed`);
})();
