/**
 * Parity: Cheng AIO dashboard "Calculated ROB" (apps/web/js/voyage-bridge.js) must equal
 * Voyage Chief's current ROB (currentROB) for the same log. Drift between the two copies of the
 * ROB engine caused mismatches (survey "previous" basis, receipt times, derived opening meters).
 * Needs Playwright; skips when it is not installed.
 */
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('SKIP: playwright not installed'); process.exit(0); }
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const L = { LIC: () => localStorage.setItem('chengAioLicenseEntitlement', JSON.stringify({licenseId:'x',email:'c@e.com',sku:'cheng-aio',graceUntil:'2099-01-01T00:00:00.000Z',addons:['voyage-chief','tank-chief','eorb','consumption-plan','bunker-plan','performance','spares','eca']})) };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1300, height: 1800 } }); await ctx.addInitScript(L.LIC);
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 200))); pg.on('dialog', d => d.accept().catch(() => {}));
  await pg.goto('file://' + path.join(ROOT, 'modules/voyage/www/voyage_manager.html') + ''); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => { document.getElementById('loginGate')?.setAttribute('hidden', ''); await installTestFleet({ switchToFirst: true }); });
  await pg.addScriptTag({ path: path.join(ROOT, 'apps/web/js/voyage-bridge.js') });
  await pg.waitForTimeout(500);
  const res = await pg.evaluate(() => {
    const out = { scenarios: [] };
    const Bridge = window.ChengProVoyageBridge; out.bridge = !!(Bridge && Bridge.buildHomeCalculatedRob);
    const s = state.setup;
    const base0 = carryoverFromSetup();
    const ents = sortedEntries();
    const baseMe = Number(base0.me.meter) || 0, baseRc = Number(base0.revCounter) || 0;
    ents.forEach((e, i) => { e.me = { ...e.me, meter: baseMe + 24000 * (i + 1), sg: 0.98 }; e.revCounter = baseRc + 144000 * (i + 1); });
    const withCarry = (on) => { state.setup.carryover = on ? JSON.parse(JSON.stringify(carryoverFromSetup())) : null; };
    out.tanks = fuelTankList().map(t => t.id + ':' + t.grade).join(',');
    out.entries = ents.map(e => e.datetime);
    const hfo = fuelTankList().find(t => t.grade === 'HFO');
    const e1 = ents[0], e2 = ents[ents.length - 1];
    const snapshot = () => ({ receipts: JSON.parse(JSON.stringify(state.receipts)), surveys: ents.map(e => JSON.parse(JSON.stringify(e.robSurvey || null))) });
    const reset = () => { state.receipts = []; ents.forEach(e => { delete e.robSurvey; delete e.robReceived; }); };
    const cmp = (label) => {
      const V = currentROB({}, {}).rob;
      const B = Bridge.buildHomeCalculatedRob(JSON.parse(JSON.stringify(state.setup)), JSON.parse(JSON.stringify(state.entries)), JSON.parse(JSON.stringify(state.receipts))).robCurrent;
      const diffs = {};
      fuelTankList().forEach(t => { const v = Number(V[t.id]) || 0, bb = Number(B[t.id]) || 0; if (Math.abs(v - bb) > 0.005) diffs[t.id] = { voyage: Math.round(v * 1000) / 1000, dashboard: Math.round(bb * 1000) / 1000, gap: Math.round((bb - v) * 1000) / 1000 }; });
      out.scenarios.push({ label, hfoVoyage: Math.round((Number(V[hfo.id]) || 0) * 1000) / 1000, equal: Object.keys(diffs).length === 0, diffs });
    };
    const d1 = e1.datetime.slice(0, 10), d2 = e2.datetime.slice(0, 10);
    const mid = (() => { const a = new Date(e1.datetime).getTime(), z = new Date(e2.datetime).getTime(); const m = new Date((a + z) / 2); const p = (n) => String(n).padStart(2, '0'); return { date: `${m.getFullYear()}-${p(m.getMonth() + 1)}-${p(m.getDate())}`, time: `${p(m.getHours())}:${p(m.getMinutes())}` }; })();
    const rcpt = (o) => ({ id: uid(), category: 'fuel', tankId: hfo.id, type: hfo.name, qty: 100, vesselId: state.activeVesselId, ...o });
    for (const on of [false, true]) {
      withCarry(on); const tag = on ? '[carry-over saved] ' : '[no carry-over]    ';
      const cmpL = (l) => cmp(tag + l);
          reset(); cmpL('1 plain: no receipts, no survey');
          reset(); state.receipts.push(rcpt({ date: mid.date, time: mid.time })); cmpL('2 timed receipt between the two entries');
          reset(); state.receipts.push(rcpt({ date: d2 })); cmpL('3 date-only receipt on the last entry day');
          reset(); state.receipts.push(rcpt({ date: '2999-01-01', time: '10:00' })); cmpL('4 receipt later than the last entry (must not count)');
          reset(); state.receipts.push(rcpt({ date: d1, time: '23:59' })); cmpL('5 timed receipt late on the first entry day, after its time');
          const measured = { [hfo.id]: 500 };
          reset(); e2.robSurvey = { basis: 'previous', measured, calculated: { [hfo.id]: 480 }, difference: { [hfo.id]: 20 } }; cmpL('6 survey on last entry, NEW basis (measured = its Previous ROB)');
          reset(); e2.robSurvey = { measured, calculated: { [hfo.id]: 480 }, difference: { [hfo.id]: 20 } }; cmpL('7 survey on last entry, OLD basis (measured = closing ROB)');
          reset(); e2.robSurvey = { basis: 'previous', measured, calculated: { [hfo.id]: 480 }, difference: { [hfo.id]: 20 } }; state.receipts.push(rcpt({ date: mid.date, time: mid.time })); cmpL('8 NEW-basis survey plus a receipt logged in its period');
          reset(); e1.robSurvey = { basis: 'previous', measured, calculated: { [hfo.id]: 480 }, difference: { [hfo.id]: 20 } }; cmpL('9 NEW-basis survey on the FIRST entry, then a second entry after it');
          reset(); e1.robSurvey = { measured, calculated: { [hfo.id]: 480 }, difference: { [hfo.id]: 20 } }; cmpL('10 OLD-basis survey on the first entry, then a second entry after it');

    }
    return out;
  });
  console.log('bridge loaded', res.bridge, '| tanks', res.tanks, '| entries', res.entries.join(' , '));
  res.scenarios.forEach(s => console.log((s.equal ? 'MATCH   ' : 'DIFFERS ') + s.label + (s.equal ? '' : '  ' + JSON.stringify(s.diffs))));
  console.log('errors', errs); await b.close();
  const bad = res.scenarios.filter((x) => !x.equal).length;
  if (!res.bridge || bad || errs.length || res.scenarios.length < 20) { console.log('FAIL: ' + bad + ' mismatching scenario(s)'); process.exit(1); }
  console.log('OK: dashboard Calculated ROB matches Voyage current ROB in all ' + res.scenarios.length + ' scenarios');
})().catch((e) => { console.error(e); process.exit(1); });
