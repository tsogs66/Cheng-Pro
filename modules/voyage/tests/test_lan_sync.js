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

const L = require('../www/lan-sync.js');

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
    assert.strictEqual(L.decide(me, 'me', []).action, 'wait');
    assert.strictEqual(L.decide(me, 'me', [{ deviceId: 'me', name: 'Me', vessel: me }]).action, 'wait');
    const other = L.decide(me, 'me', [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV OTHER', imo: '9000009' } }]);
    assert.strictEqual(other.action, 'wait');
    assert.ok(other.different && /Laptop is on MV OTHER/.test(other.message), other.message);
    assert.strictEqual(L.decide(me, 'me', [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' } }]).action, 'sync');
  });

  console.log('What it does each round');
  store.voyageLanSync = JSON.stringify({ enabled: true, scopeAll: false });
  await ok('another device on the same ship: the open leg is synced, in the background, merging', async () => {
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' } }];
    syncCalls = [];
    await L.tick(false);
    assert.strictEqual(syncCalls.length, 1);
    assert.deepStrictEqual([syncCalls[0].background, syncCalls[0].policy], [true, 'merge']);
    assert.strictEqual(L._state.status, 'connected');
  });
  await ok('another device on a different ship: nothing is synced, and the status says so', async () => {
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV OTHER', imo: '9000009' } }];
    syncCalls = [];
    await L.tick(false);
    assert.strictEqual(syncCalls.length, 0);
    assert.strictEqual(L._state.status, 'different-vessel');
  });
  await ok('legs one side lacks are listed, and not copied unless the whole database was chosen', async () => {
    devices = [{ deviceId: 'pc', name: 'Laptop', vessel: { name: 'MV TEST ONE', imo: '9000001' } }];
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
  await ok('a scan tries the page\'s own server first, then the usual router and hotspot ranges', () => {
    const c = L.candidates('http://192.168.0.5:8080', ['192.168.43.1']);
    assert.strictEqual(c[0], 'http://192.168.0.5:8080');
    assert.ok(c.includes('http://192.168.43.1:8787') && c.includes('http://192.168.137.2:8787') && c.includes('http://172.20.10.2:8787'));
    assert.ok(!L.candidates('http://localhost:8080', []).includes('http://localhost:8080'));
  });
  console.log(`\n${n} passed`);
})();
