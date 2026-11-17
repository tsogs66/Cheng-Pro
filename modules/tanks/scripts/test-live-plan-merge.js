/* A running bunker plan watched and edited from two devices: pieces merge on their own stamps. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-plan-'));
process.env.TMS_DATA_DIR = dir;
const store = require('../public/js/store-core.js');
let pass = 0, failed = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 4).join('\n       ')); } };

const slot = (over) => Object.assign({ tankId: '', targetVolumeM3: '', currentSoundingMM: '', status: 'pending', startedAt: null, pausedAt: null, elapsedPausedMs: 0, completedAt: null }, over || {});
const plan = (slots, over) => Object.assign({ header: { port: 'X', bunkerQuantityMT: '1000' }, sequence: slots, distributionMode: 'equal-storage', status: 'planning', startedAt: null, pausedAt: null, elapsedPausedMs: 0, completedAt: null, updatedAt: '2026-11-17T10:00:00.000Z' }, over || {});
const T = (m) => `2026-11-17T10:${String(m).padStart(2, '0')}:00.000Z`;

console.log('Pieces of a running plan');
check('two devices type in different tanks: both soundings survive, in either merge order', () => {
  const base = store.stampPlanChanges(null, plan([slot({ tankId: 't1' }), slot({ tankId: 't2' }), slot({ tankId: 't3' })]), T(0));
  const a = store.stampPlanChanges(base, { ...base, sequence: base.sequence.map((s, i) => i === 0 ? { ...s, currentSoundingMM: '1200' } : s), updatedAt: T(5) }, T(5));
  const b = store.stampPlanChanges(base, { ...base, sequence: base.sequence.map((s, i) => i === 2 ? { ...s, currentSoundingMM: '3400' } : s), updatedAt: T(6) }, T(6));
  const ab = store.mergeBunkerPlanDocs(a, b);
  const ba = store.mergeBunkerPlanDocs(b, a);
  assert.deepStrictEqual(ab.sequence.map((s) => s.currentSoundingMM), ['1200', '', '3400']);
  assert.deepStrictEqual(ab, ba, 'the same plan whichever device merges first');
});
check('the same tank on both: the later edit wins, and both devices agree', () => {
  const base = store.stampPlanChanges(null, plan([slot({ tankId: 't1' })]), T(0));
  const a = store.stampPlanChanges(base, { ...base, sequence: [{ ...base.sequence[0], currentSoundingMM: '1000' }] }, T(5));
  const b = store.stampPlanChanges(base, { ...base, sequence: [{ ...base.sequence[0], currentSoundingMM: '1100' }] }, T(7));
  assert.strictEqual(store.mergeBunkerPlanDocs(a, b).sequence[0].currentSoundingMM, '1100');
  assert.deepStrictEqual(store.mergeBunkerPlanDocs(a, b), store.mergeBunkerPlanDocs(b, a));
});
check('an exact tie still ends on one plan on both devices', () => {
  const base = store.stampPlanChanges(null, plan([slot({ tankId: 't1' })]), T(0));
  const a = { ...base, sequence: [{ ...base.sequence[0], currentSoundingMM: '1', at: T(5) }] };
  const b = { ...base, sequence: [{ ...base.sequence[0], currentSoundingMM: '2', at: T(5) }] };
  assert.deepStrictEqual(store.mergeBunkerPlanDocs(a, b), store.mergeBunkerPlanDocs(b, a));
});
check('a stale full save from a page that has not seen the other device\'s change does not undo it', () => {
  const base = store.stampPlanChanges(null, plan([slot({ tankId: 't1' }), slot({ tankId: 't2' })]), T(0));
  /* the other device's sounding on tank 2 arrived and was stored */
  const stored = store.stampPlanChanges(base, { ...base, sequence: [base.sequence[0], { ...base.sequence[1], currentSoundingMM: '2222' }] }, T(5));
  /* this page still shows the old plan and the person types on tank 1 */
  const page = { ...base, sequence: [{ ...base.sequence[0], currentSoundingMM: '1111' }, base.sequence[1]], updatedAt: T(6) };
  const saved = store.mergeBunkerPlanDocs(stored, store.stampPlanChanges(stored, page, T(6)));
  assert.deepStrictEqual(saved.sequence.map((s) => s.currentSoundingMM), ['1111', '2222']);
});
check('pump start on one device reaches the other, and a stale page does not stop it', () => {
  const base = store.stampPlanChanges(null, plan([slot({ tankId: 't1' })]), T(0));
  const started = store.stampPlanChanges(base, { ...base, status: 'running', startedAt: T(10), updatedAt: T(10) }, T(10));
  const merged = store.mergeBunkerPlanDocs(base, started);
  assert.strictEqual(merged.startedAt, T(10));
  assert.strictEqual(merged.status, 'running');
  const stalePage = { ...base, updatedAt: T(11), header: { ...base.header, port: 'Y' } };
  const after = store.mergeBunkerPlanDocs(merged, store.stampPlanChanges(merged, stalePage, T(11)));
  assert.strictEqual(after.startedAt, T(10), 'editing the port did not stop the pump');
  assert.strictEqual(after.header.port, 'Y');
});
check('plans from before stamps existed still merge, by when the whole plan was saved', () => {
  const old = plan([slot({ tankId: 't1', currentSoundingMM: '1' })], { updatedAt: T(1) });
  const newer = plan([slot({ tankId: 't1', currentSoundingMM: '2' })], { updatedAt: T(9) });
  assert.strictEqual(store.mergeBunkerPlanDocs(old, newer).sequence[0].currentSoundingMM, '2');
  assert.strictEqual(store.mergeBunkerPlanDocs(newer, old).sequence[0].currentSoundingMM, '2');
});
check('a plan is live from the pump start until two minutes after it is completed', () => {
  assert.strictEqual(store.planIsLive(plan([], { startedAt: T(1) })), true);
  assert.strictEqual(store.planIsLive(plan([])), false);
  assert.strictEqual(store.planIsLive(plan([], { startedAt: T(1), completedAt: new Date(Date.now() - 600000).toISOString() })), false);
  assert.strictEqual(store.planIsLive(plan([], { startedAt: T(1), completedAt: new Date(Date.now() - 30000).toISOString() })), true);
});

console.log('In the database');
const v = store.createVessel({ name: 'MV LIVE', imo: '9100001' });
check('saving through the store stamps only what changed, and a paired device\'s plan merges in', () => {
  store.saveVesselPart(v.id, 'bunkerPlan', plan([slot({ tankId: 't1' }), slot({ tankId: 't2' })]));
  const first = store.getVesselBundle(v.id).bunkerPlan;
  assert.ok(first.sequence[0].at && first.topAt && first.headerAt, 'a first save stamps every piece');
  const stamp0 = first.sequence[1].at;
  store.saveVesselPart(v.id, 'bunkerPlan', { ...first, sequence: [{ ...first.sequence[0], currentSoundingMM: '900' }, first.sequence[1]], updatedAt: new Date().toISOString() });
  const second = store.getVesselBundle(v.id).bunkerPlan;
  assert.strictEqual(second.sequence[1].at, stamp0, 'the untouched tank kept its stamp');
  assert.ok(second.sequence[0].at > first.sequence[0].at || second.sequence[0].at === first.sequence[0].at);
  const peer = JSON.parse(JSON.stringify(second));
  peer.sequence[1] = { ...peer.sequence[1], currentSoundingMM: '777', at: '2099-01-01T00:00:00.000Z' };
  peer.updatedAt = '2099-01-01T00:00:00.000Z';
  const r = store.mergePlanFromPeer(v.id, peer);
  assert.strictEqual(r.changed, true);
  const third = store.getVesselBundle(v.id).bunkerPlan;
  assert.deepStrictEqual(third.sequence.map((s) => s.currentSoundingMM), ['900', '777']);
  assert.strictEqual(store.mergePlanFromPeer(v.id, peer).changed, false, 'the same plan again changes nothing');
});

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
console.log(`\n${pass} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
