/**
 * One live sync for the whole AIO (apps/web/js/lan-sync-all.js).
 *
 * The controller drives two engines — Tank Chief's and Voyage Chief's — through `deps`, so here both
 * are fakes. What is tested is what the person relies on: one code serves both programs, the license
 * rule is shown and obeyed, a program that fails does not hide the one that works, and the other
 * reports (requisitions, consumption plan, e-ORB) are compared when they should be and not otherwise.
 *
 * Run: node scripts/test-lan-sync-all.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const All = require('../apps/web/js/lan-sync-all.js');

let n = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); n += 1; console.log('  ok   ' + name); } catch (e) {
    failed += 1; console.log('  FAIL ' + name + '\n       ' + String(e && e.message).split('\n').slice(0, 4).join('\n       '));
  }
}

/** Two fake engines that remember what they were asked. */
function world(over) {
  const w = {
    calls: [],
    clock: 1000000,
    tank: { enabled: false, scope: 'active', deviceName: 'Chief PC', license: { active: true, email: 'chief@example.com' }, address: 'http://192.168.0.5:8080', peers: [], pairing: null, discovered: [], events: [] },
    voyage: { product: 'voyage-chief', license: { active: true }, enabled: false, scopeAll: false, paired: false, server: '', address: '', status: '', message: '', last: null, missingLegs: 0, missingVessels: 0, found: [], pairing: null },
    scanFound: [{ deviceId: 'pc', name: 'Chief PC', url: 'http://192.168.0.5:8080' }],
    voyageFound: [{ deviceId: 'pc', name: 'Chief PC', url: 'http://192.168.0.5:8080' }],
    tankFails: {},
    voyageFails: {},
    announced: [],
    miscResult: { message: 'Miscellaneous data updated.' },
  };
  Object.assign(w, over || {});
  const deps = {
    now: () => w.clock,
    toast: () => {},
    randomCode: () => '123456',
    license: () => ({ email: 'chief@example.com', licenseId: 'lic-1' }),
    tank: async (p, init) => {
      w.calls.push(['tank', p, init && init.body]);
      if (w.tankFails[p]) throw new Error(w.tankFails[p]);
      if (p === '/api/lan/license') { w.announced.push(init.body); return {}; }
      if (p === '/api/lan/state') return JSON.parse(JSON.stringify(w.tank));
      if (p === '/api/lan/config') { Object.assign(w.tank, init.body); return w.tank; }
      if (p === '/api/lan/pair/start') { w.tank.pairing = { code: init.body.code, expiresAt: new Date(w.clock + 300000).toISOString() }; return w.tank.pairing; }
      if (p === '/api/lan/scan') return { found: w.scanFound };
      if (p === '/api/lan/peers/pair') { w.tank.peers = [{ deviceId: 'pc', name: 'Chief PC', url: init.body.url, status: 'connected', message: 'Up to date' }]; return w.tank; }
      if (p === '/api/lan/peers/forget') { w.tank.peers = []; return w.tank; }
      if (p === '/api/lan/sync-now') return w.tank;
      throw new Error('unexpected tank call ' + p);
    },
    voyage: async (action, extra) => {
      w.calls.push(['voyage', action, extra]);
      if (w.voyageFails[action]) throw new Error(w.voyageFails[action]);
      if (action === 'lan-state') return { lan: JSON.parse(JSON.stringify(w.voyage)) };
      if (action === 'lan-config') { if ('enabled' in extra.config) w.voyage.enabled = extra.config.enabled; if ('scopeAll' in extra.config) w.voyage.scopeAll = extra.config.scopeAll; return { lan: w.voyage }; }
      if (action === 'lan-code') { w.voyage.pairing = { code: extra.code, until: w.clock + 300000 }; return { lan: w.voyage }; }
      if (action === 'lan-scan') return { found: w.voyageFound };
      if (action === 'lan-pair') { w.voyage.paired = true; w.voyage.server = 'Chief PC'; w.voyage.enabled = true; w.voyage.status = 'connected'; return { lan: w.voyage }; }
      if (action === 'lan-now') return { lan: w.voyage };
      if (action === 'reconcile-misc') return w.miscResult;
      throw new Error('unexpected voyage action ' + action);
    },
  };
  return { w, deps, ctl: All.create(deps) };
}
const asked = (w, kind, what) => w.calls.filter((c) => c[0] === kind && c[1] === what);

(async () => {
  console.log('One code, both programs');
  await check('showing a code gives the same code to Tank Chief and to Voyage Chief', async () => {
    const { w, ctl } = world();
    const p = await ctl.showCode({});
    assert.strictEqual(p.code, '123456');
    assert.strictEqual(asked(w, 'tank', '/api/lan/pair/start')[0][2].code, '123456');
    assert.strictEqual(asked(w, 'voyage', 'lan-code')[0][2].code, '123456');
    assert.strictEqual(w.tank.pairing.code, w.voyage.pairing.code);
  });
  await check('showing a code switches live sync on for that device, so it can announce itself to the one that joins', async () => {
    const { w, ctl } = world();
    assert.strictEqual(ctl.snapshot().enabled, false);
    await ctl.showCode({});
    await ctl.refresh();
    assert.deepStrictEqual([w.tank.enabled, w.voyage.enabled], [true, true]);
  });
  await check('a refused pairing stays on the page, with the reason from each program', async () => {
    const { ctl } = world({ tankFails: { '/api/lan/peers/pair': 'These two devices are on different licenses.' }, voyageFails: { 'lan-pair': 'These two devices are on different licenses.' } });
    await assert.rejects(() => ctl.pair('http://192.168.0.5:8080', '123456'));
    const n = ctl.snapshot().notice;
    assert.strictEqual(n.kind, 'bad');
    assert.ok(/Tank Chief: These two devices are on different licenses[\s\S]*Voyage Chief:/.test(n.text), n.text);
    await ctl.refresh();
    assert.ok(ctl.snapshot().notice, 'a refresh does not clear it');
  });
  await check('a half-successful pairing says what did not pair; a clean one clears the message', async () => {
    const a = world({ voyageFails: { 'lan-pair': 'no luck' } });
    await a.ctl.pair('http://192.168.0.5:8080', '123456');
    assert.strictEqual(a.ctl.snapshot().notice.kind, 'warn');
    a.w.voyageFails = {};
    await a.ctl.pair('http://192.168.0.5:8080', '123456');
    assert.strictEqual(a.ctl.snapshot().notice, null);
  });
  await check('the code is shown even if one program cannot start it, and the page says which', async () => {
    const { w, ctl } = world({ voyageFails: { 'lan-code': 'Voyage Chief is still loading' } });
    const p = await ctl.showCode({});
    assert.strictEqual(p.code, '123456');
    assert.ok(/Voyage Chief: Voyage Chief is still loading/.test(p.note), p.note);
    await ctl.refresh();
    assert.ok(/Voyage Chief/.test(ctl.snapshot().pairing.note), 'the next refresh does not wipe the warning');
  });
  await check('if neither program can show a code, that is an error', async () => {
    const { ctl } = world({ tankFails: { '/api/lan/pair/start': 'no' }, voyageFails: { 'lan-code': 'no' } });
    await assert.rejects(() => ctl.showCode({}), /no/);
  });
  await check('pairing sends the one address and the one code to both programs, and turns sync on', async () => {
    const { w, ctl } = world();
    const r = await ctl.pair('http://192.168.0.5:8080/', ' 123 456 ');
    assert.deepStrictEqual([r.tank, r.voyage, r.problems.length], [true, true, 0]);
    const t = asked(w, 'tank', '/api/lan/peers/pair')[0][2];
    const v = asked(w, 'voyage', 'lan-pair')[0][2];
    assert.deepStrictEqual([t.url, t.code, v.url, v.code], ['http://192.168.0.5:8080', '123456', 'http://192.168.0.5:8080', '123456']);
    assert.strictEqual(ctl.snapshot().enabled, true);
  });
  await check('a bad address or a short code is refused before anything is sent', async () => {
    const { w, ctl } = world();
    await assert.rejects(() => ctl.pair('192.168.0.5', '123456'), /address/);
    await assert.rejects(() => ctl.pair('http://192.168.0.5:8080', '12'), /six-digit/);
    assert.strictEqual(w.calls.filter((c) => /pair/.test(c[1])).length, 0);
  });
  await check('if one program refuses (another license), the other still pairs and the refusal is reported', async () => {
    const { ctl } = world({ voyageFails: { 'lan-pair': 'These two devices are on different licenses.' } });
    const r = await ctl.pair('http://192.168.0.5:8080', '123456');
    assert.deepStrictEqual([r.tank, r.voyage], [true, false]);
    assert.ok(/Voyage Chief: These two devices are on different licenses/.test(r.problems[0]), r.problems[0]);
  });
  await check('if both refuse, pairing fails and says why for each', async () => {
    const { ctl } = world({ tankFails: { '/api/lan/peers/pair': 'That code is not right.' }, voyageFails: { 'lan-pair': 'That code is not right.' } });
    await assert.rejects(() => ctl.pair('http://192.168.0.5:8080', '123456'), /Tank Chief: That code[\s\S]*Voyage Chief: That code/);
  });

  console.log('Finding the other device');
  await check('a device found by both programs is listed once; one found by only one is still listed', async () => {
    const { ctl } = world({ voyageFound: [{ deviceId: 'pc', name: 'Chief PC', url: 'http://192.168.0.5:8080' }, { deviceId: 'x', name: 'Other', url: 'http://192.168.0.9:8787' }] });
    const f = await ctl.find();
    assert.deepStrictEqual(f.map((d) => d.url).sort(), ['http://192.168.0.5:8080', 'http://192.168.0.9:8787']);
  });

  console.log('The license');
  await check('the shell tells Tank Chief whose license this device is on, once, and again if it changes', async () => {
    let lic = { email: 'chief@example.com', licenseId: 'lic-1' };
    const { w, deps } = world();
    deps.license = () => lic;
    const ctl = All.create(deps);
    await ctl.refresh(); await ctl.refresh();
    assert.strictEqual(w.announced.length, 1);
    assert.deepStrictEqual(w.announced[0], { email: 'chief@example.com', licenseId: 'lic-1' });
    lic = null;
    await ctl.refresh();
    assert.deepStrictEqual(w.announced[1], { email: '', licenseId: '' }, 'a removed license is announced as none');
  });
  await check('the page shows "Licensed to" only when both programs have a license', async () => {
    const a = world();
    await a.ctl.refresh();
    assert.deepStrictEqual([a.ctl.snapshot().license.active, a.ctl.snapshot().license.email], [true, 'chief@example.com']);
    const b = world(); b.w.voyage.license.active = false;
    await b.ctl.refresh();
    assert.strictEqual(b.ctl.snapshot().license.active, false);
  });
  await check('a program on another license shows as "different license", not as a vague error', async () => {
    const { w, ctl } = world();
    w.tank.peers = [{ deviceId: 'pc', name: 'Chief PC', url: 'http://x', status: 'different-license', message: 'These two devices are on different licenses.' }];
    w.voyage.paired = true; w.voyage.enabled = true; w.voyage.status = 'different-license'; w.voyage.message = 'Not syncing: different licenses';
    await ctl.refresh();
    const rows = ctl.snapshot().rows;
    /* The other reports travel with Voyage's connection, so they show the same thing. */
    assert.deepStrictEqual(rows.map((r) => r.status), ['different-license', 'different-license', 'different-license']);
  });
  await check('with no license on this device every row says so', async () => {
    const { w, ctl } = world();
    w.tank.license.active = false; w.voyage.license.active = false;
    await ctl.refresh();
    assert.deepStrictEqual(ctl.snapshot().rows.map((r) => r.status), ['no-license', 'no-license', 'no-license']);
  });

  console.log('Switch and scope');
  await check('one switch and one scope change both programs', async () => {
    const { w, ctl } = world();
    await ctl.setEnabled(true);
    await ctl.setScope(true);
    assert.deepStrictEqual([w.tank.enabled, w.voyage.enabled, w.tank.scope, w.voyage.scopeAll], [true, true, 'all', true]);
    await ctl.setScope(false);
    assert.deepStrictEqual([w.tank.scope, w.voyage.scopeAll], ['active', false]);
  });

  console.log('Other reports (requisitions, consumption plan, e-ORB)');
  await check('"Sync now" runs both engines and then compares the other reports once Voyage is connected', async () => {
    const { w, ctl } = world();
    await ctl.pair('http://192.168.0.5:8080', '123456');
    w.calls.length = 0;
    await ctl.syncNow();
    const order = w.calls.map((c) => c[1]);
    assert.ok(order.includes('/api/lan/sync-now') && order.includes('lan-now') && order.includes('reconcile-misc'), order.join(', '));
    assert.ok(order.indexOf('reconcile-misc') > order.indexOf('lan-now'), 'misc after Voyage has synced');
    const misc = ctl.snapshot().rows.find((r) => r.key === 'misc');
    assert.strictEqual(misc.status, 'connected');
    assert.ok(/updated/i.test(misc.message), misc.message);
  });
  await check('the other reports are not touched while Voyage is not connected (different vessel, other license)', async () => {
    const { w, ctl } = world();
    await ctl.pair('http://192.168.0.5:8080', '123456');
    w.voyage.status = 'different-vessel';
    w.calls.length = 0;
    await ctl.syncNow();
    assert.strictEqual(asked(w, 'voyage', 'reconcile-misc').length, 0);
  });
  await check('a failure comparing the other reports is shown on its own row and does not stop the others', async () => {
    const { w, ctl } = world({ voyageFails: { 'reconcile-misc': 'Server not reachable' } });
    await ctl.pair('http://192.168.0.5:8080', '123456');
    await ctl.syncNow();
    const rows = ctl.snapshot().rows;
    assert.strictEqual(rows.find((r) => r.key === 'misc').status, 'error');
    assert.strictEqual(rows.find((r) => r.key === 'tank').status, 'connected');
  });
  await check('on its own timer the other reports are compared every five minutes, only when on and idle', async () => {
    const { w, ctl } = world();
    await ctl.pair('http://192.168.0.5:8080', '123456');
    let idle = false;
    ctl.setIdle(() => idle);
    w.calls.length = 0;
    w.clock += 6 * 60 * 1000; await ctl.tick();
    assert.strictEqual(asked(w, 'voyage', 'reconcile-misc').length, 0, 'not while someone is typing');
    idle = true; await ctl.tick();
    assert.strictEqual(asked(w, 'voyage', 'reconcile-misc').length, 1);
    w.clock += 60 * 1000; await ctl.tick();
    assert.strictEqual(asked(w, 'voyage', 'reconcile-misc').length, 1, 'not again within five minutes');
    w.clock += 5 * 60 * 1000; await ctl.tick();
    assert.strictEqual(asked(w, 'voyage', 'reconcile-misc').length, 2);
    await ctl.setEnabled(false);
    w.clock += 10 * 60 * 1000; await ctl.tick();
    assert.strictEqual(asked(w, 'voyage', 'reconcile-misc').length, 2, 'not when sync is off');
  });

  console.log('What the page shows');
  await check('the worst peer status wins for Tank Chief, with the number of devices', () => {
    const row = All.tankRow({ license: { active: true }, enabled: true, peers: [
      { name: 'Phone', status: 'connected', message: 'Up to date' },
      { name: 'Tablet', status: 'offline', message: 'Not reachable right now' }] });
    assert.strictEqual(row.status, 'offline');
    assert.ok(/2 devices/.test(row.message));
  });
  await check('a program that does not answer is "Not available", never a blank row', () => {
    assert.strictEqual(All.tankRow(null).status, 'unavailable');
    assert.strictEqual(All.voyageRow(null).status, 'unavailable');
  });
  await check('the status of each program is a word the page can show', () => {
    for (const s of ['connected', 'waiting', 'off', 'offline', 'unpaired', 'different-vessel', 'different-license', 'no-license', 'error', 'unavailable', 'unknown']) {
      assert.ok(All.LABEL[s], s);
    }
  });
  await check('if neither program answers the page says so', async () => {
    const { ctl } = world({ tankFails: { '/api/lan/state': 'down' }, voyageFails: { 'lan-state': 'down' } });
    await assert.rejects(() => ctl.refresh(), /down/);
  });

  console.log('Where it is on the page');
  await check('the shell loads the controller before the Backup & Restore module, and mounts it there', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
    assert.ok(html.includes('/js/lan-sync-all.js'));
    assert.ok(html.indexOf('/js/lan-sync-all.js') < html.indexOf('/js/modules/backup.js'));
    const backup = fs.readFileSync(path.join(root, 'apps/web/js/modules/backup.js'), 'utf8');
    assert.ok(backup.includes('bk-live-sync-host') && backup.includes('ChengLanSyncAll.create'));
  });
  await check('inside the AIO the per-program panels only point to that page, so there is one control', () => {
    const root = path.join(__dirname, '..');
    const tank = fs.readFileSync(path.join(root, 'modules/tanks/public/js/lan-sync-ui.js'), 'utf8');
    assert.ok(/isAioEmbedded\(\)[\s\S]{0,400}Backup &amp; Restore/.test(tank), 'Tank panel points to Backup & Restore in the AIO');
    const voy = fs.readFileSync(path.join(root, 'modules/voyage/www/lan-sync.js'), 'utf8');
    assert.ok(/embedded\(\)[\s\S]{0,400}Backup &amp; Restore/.test(voy), 'Voyage panel points to Backup & Restore in the AIO');
    const html = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');
    for (const a of ['lan-state', 'lan-config', 'lan-code', 'lan-scan', 'lan-pair', 'lan-now']) assert.ok(html.includes("'" + a + "'"), a + ' is handled by the Voyage frame');
  });

  console.log(`\n${n}/${n + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
