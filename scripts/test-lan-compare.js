/* The device-to-device list: what differs is listed per item, and only the ticked items move (no server). */
'use strict';
const assert = require('assert');
const C = require('../apps/web/js/lan-compare.js');
let pass = 0, failed = 0;
async function check(name, fn) { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 4).join('\n       ')); } }

const H1 = { imo: '9000001', name: 'MV ONE' };
const leg = (voyage, cond, stamp, entries, id) => ({ id: id || 'v::' + voyage + '::' + cond, hull: H1, voyage, condition: cond, stamp, entries });
const misc = (req, plans, orb, hull) => ({ hull: hull || H1, categories: { requisitions: { count: req[0], stamp: req[1] }, plans: { count: plans[0], stamp: plans[1] }, orb: { count: orb[0], stamp: orb[1] } } });

(async () => {
  console.log('Voyage legs');
  await check('legs that match are not listed; others say what each side has and suggest the newer one', async () => {
    const mine = { vessels: [H1], legs: [leg('12', 'L', '2026-11-10T10:00:00Z', 30), leg('13', 'B', '2026-11-12T10:00:00Z', 5), leg('14', 'L', '2026-11-01T00:00:00Z', 9)] };
    const theirs = { vessels: [H1], legs: [leg('12', 'L', '2026-11-10T10:00:00Z', 30), leg('13', 'B', '2026-11-13T10:00:00Z', 8), leg('15', 'L', '2026-11-02T00:00:00Z', 4)] };
    const r = C.compareVoyage(mine, theirs);
    assert.strictEqual(r.same, 1);
    const by = Object.fromEntries(r.rows.map((x) => [x.item, x]));
    assert.strictEqual(by['Voyage 13 · Ballast'].suggest, 'pull', 'theirs is newer');
    assert.strictEqual(by['Voyage 14 · Laden'].suggest, 'push', 'only here');
    assert.strictEqual(by['Voyage 15 · Laden'].suggest, 'pull', 'only there');
    assert.deepStrictEqual(by['Voyage 13 · Ballast'].options, ['pull', 'push']);
  });
  await check('a leg of a vessel the other device does not have cannot be moved, and says why', async () => {
    const mine = { vessels: [H1, { imo: '9000009', name: 'MV TWO' }], legs: [{ ...leg('1', 'L', '2026-11-01T00:00:00Z', 3), hull: { imo: '9000009', name: 'MV TWO' } }] };
    const theirs = { vessels: [H1], legs: [] };
    const r = C.compareVoyage(mine, theirs);
    assert.strictEqual(r.rows[0].suggest, 'skip');
    assert.match(r.rows[0].note, /not on the other device/);
  });
  await check('the same ship is recognised by IMO, or by name when there is no IMO', async () => {
    assert.ok(C.sameHull({ imo: '1', name: 'A' }, { imo: '1', name: 'B' }));
    assert.ok(!C.sameHull({ imo: '1', name: 'A' }, { imo: '2', name: 'A' }));
    assert.ok(C.sameHull({ imo: '', name: ' mv one ' }, { imo: '', name: 'MV ONE' }));
  });

  console.log('Other reports');
  await check('requisitions, plan snapshots and e-ORB are listed per category when they differ', async () => {
    const r = C.compareMisc({ misc: misc([5, 'a'], [2, 'b'], [10, '2026-11-01']) }, { misc: misc([7, 'a'], [2, 'b'], [10, '2026-11-02']) });
    assert.strictEqual(r.same, 1);
    const by = Object.fromEntries(r.rows.map((x) => [x.item, x]));
    assert.strictEqual(by['Requisitions'].suggest, 'pull');
    assert.strictEqual(by['e-ORB entries'].suggest, 'pull');
  });
  await check('a different vessel open on each device is explained, not compared', async () => {
    const r = C.compareMisc({ misc: misc([1, ''], [1, ''], [1, '']) }, { misc: misc([1, ''], [1, ''], [1, ''], { imo: '9', name: 'OTHER' }) });
    assert.strictEqual(r.rows.length, 0);
    assert.match(r.note, /Open the same vessel on both/);
  });

  console.log('Nothing moves until it is ticked');
  const world = () => {
    const calls = [];
    const peerState = { manifest: { vessels: [H1], legs: [leg('13', 'B', '2026-11-13T10:00:00Z', 8), leg('15', 'L', '2026-11-02T00:00:00Z', 4)], misc: misc([7, 'a'], [2, 'b'], [10, 'c']) } };
    const mineManifest = { vessels: [H1], legs: [leg('13', 'B', '2026-11-12T10:00:00Z', 5), leg('14', 'L', '2026-11-01T00:00:00Z', 9)], misc: misc([5, 'a'], [2, 'b'], [10, 'c']) };
    const deps = {
      tank: async (p, init) => {
        const body = init && init.body; calls.push(['tank', p, body && (body.op || body.items && body.items.length)]);
        if (p === '/api/lan/compare') return { peer: 'PC', same: 2, rows: [{ key: 'tank:1', vesselId: 'a', peerId: 'b', name: 'MV ONE', mine: { revision: 3 }, theirs: { revision: 5 }, suggest: 'pull' }] };
        if (p === '/api/lan/peer-ask') {
          if (body.op === 'p2p-manifest') return { ok: true, result: peerState.manifest };
          if (body.op === 'p2p-legs') return { ok: true, result: body.args.ids.map((id) => ({ hull: H1, leg: { id } })) };
          if (body.op === 'p2p-misc') return { ok: true, result: { hull: H1, requisitions: [1, 2] } };
          if (body.op === 'p2p-apply') return { ok: true, result: { legs: { done: (body.args.legs || []).length, problems: [] } } };
        }
        if (p === '/api/lan/apply-selected') return { ok: true, done: body.items.map((i) => i.key), failed: [] };
        throw new Error('unexpected ' + p);
      },
      voyage: async (action, extra) => {
        calls.push(['voyage', action]);
        if (action === 'p2p-manifest') return { payload: mineManifest };
        if (action === 'p2p-legs') return { payload: extra.ids.map((id) => ({ hull: H1, leg: { id } })) };
        if (action === 'p2p-misc') return { payload: { hull: H1, requisitions: [1] } };
        if (action === 'p2p-apply') return { payload: { legs: { done: ((extra.payload || {}).legs || []).length, problems: [] }, misc: null } };
        throw new Error('unexpected ' + action);
      },
    };
    return { deps, calls };
  };

  await check('a check lists all three programs and applies nothing', async () => {
    const { deps, calls } = world();
    const c = C.create(deps);
    const s = await c.compare('dev1');
    const progs = [...new Set(s.rows.map((r) => r.program))].sort();
    assert.deepStrictEqual(progs, ['Other reports', 'Tank Chief', 'Voyage Chief']);
    assert.ok(!calls.some((x) => x[1] === '/api/lan/apply-selected' || x[1] === 'p2p-apply' || x[2] === 'p2p-apply'), 'no write during a check');
  });

  await check('only ticked rows move, each in the direction chosen', async () => {
    const { deps, calls } = world();
    const c = C.create(deps);
    const s = await c.compare('dev1');
    const key = (item, prog) => s.rows.find((r) => r.item === item && (!prog || r.program === prog)).key;
    calls.length = 0;
    const res = await c.apply([
      { key: key('Voyage 13 · Ballast'), action: 'pull' },
      { key: key('Voyage 14 · Laden'), action: 'push' },
      { key: key('Vessel records, soundings, reports'), action: 'pull' },
    ]);
    assert.strictEqual(res.failed.length, 0, JSON.stringify(res.failed));
    const wrote = calls.filter((x) => x[1] === '/api/lan/apply-selected' || x[1] === 'p2p-apply' || x[2] === 'p2p-apply').length;
    assert.strictEqual(wrote, 3, 'one write each for the vessel, the pulled leg and the pushed leg: ' + JSON.stringify(calls));
    assert.ok(!calls.some((x) => x[2] === 'p2p-misc' || x[1] === 'p2p-misc'), 'the unticked reports were not touched');
  });

  await check('a row that cannot move (skip) is ignored even if ticked', async () => {
    const { deps, calls } = world();
    const c = C.create(deps);
    await c.compare('dev1');
    calls.length = 0;
    const res = await c.apply([{ key: 'nonexistent', action: 'pull' }]);
    assert.strictEqual(res.done, 0);
    assert.ok(!calls.some((x) => /apply/.test(String(x[1]) + String(x[2]))));
  });

  await check('a program that does not answer is reported and does not hide the others', async () => {
    const { deps } = world();
    const real = deps.tank;
    deps.tank = async (p, init) => { if (p === '/api/lan/peer-ask') throw new Error('The other device did not answer.'); return real(p, init); };
    const s = await C.create(deps).compare('dev1');
    assert.ok(s.rows.some((r) => r.program === 'Tank Chief'));
    assert.ok(s.notes.some((n) => /Voyage Chief on the other device: The other device did not answer/.test(n)));
  });

  console.log('Answering the other device');
  await check("this device's app answers what the other asked, and says so when it cannot", async () => {
    const answers = [];
    const deps = {
      tank: async (p, init) => {
        if (p === '/api/lan/pending') return { asks: [{ id: 'a1', op: 'p2p-manifest', args: null }, { id: 'a2', op: 'format-disk', args: null }] };
        if (p === '/api/lan/answer') { answers.push(init.body); return { ok: true }; }
      },
      voyage: async (action) => ({ payload: { ran: action } }),
    };
    assert.strictEqual(await C.answerPending(deps), 2);
    assert.deepStrictEqual(answers[0], { id: 'a1', result: { ran: 'p2p-manifest' } });
    assert.match(answers[1].error, /cannot do that/);
  });

  console.log(`\n${pass} passed${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
})();
