#!/usr/bin/env node
/*
 * Editing an existing entry: changing M/E run hours or time zone must refresh RPM
 * from the revolution counter (Δrevs / (hrs×60)), not keep the old RPM.
 *
 *   APP_BASE=http://127.0.0.1:8860 node tests/browser_rpm_runhours_tz_e2e.js
 */
'use strict';

const { chromium } = require('playwright-core');
const BASE = (process.env.APP_BASE || 'http://127.0.0.1:8860').replace(/\/$/, '');
const CHROME = process.env.PW_CHROMIUM || process.env.CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let f = 0, c = 0;
const check = (l, a, e) => {
  c++;
  const ok = typeof e === 'number' && typeof a === 'number'
    ? Math.abs(a - e) < 0.05
    : String(a) === String(e);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${l}${ok ? '' : `: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`}`);
  if (!ok) f++;
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('dialog', async d => { await d.accept(); });

  await pg.goto(`${BASE}/voyage_manager.html?chengaio=1`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.getElementById('loginGate')?.remove());
  await pg.evaluate(async () => { await installTestFleet({ switchToFirst: true }); });
  await pg.waitForTimeout(800);

  const baseline = await pg.evaluate(() => {
    const last = sortedEntries().slice(-1)[0];
    loadEntryIntoForm(last.id);
    /* Force a known sea watch with fixed Δrevs so RPM math is checkable. */
    document.getElementById('in_operation').value = 'NOON - AT SEA';
    const prev = previousEntryFor(last.id) || effectiveCarryover();
    const prevRc = prev?.revCounter ?? 100000;
    document.getElementById('in_revCounter').value = String(prevRc + 115200); // 80 RPM × 24h × 60
    document.getElementById('vs_revCounter').value = String(prevRc + 115200);
    document.getElementById('me_runtime_period').value = '24';
    delete document.getElementById('me_runtime_period').dataset.userEdited;
    syncRpmFromPeriodChange();
    updateVsRunCalcDisplays();
    updateLivePreview();
    return {
      id: last.id,
      rpm: parseFloat(document.getElementById('in_rpm').value),
      rc: parseFloat(document.getElementById('in_revCounter').value),
      prevRc,
    };
  });
  check('baseline RPM ~ 80', baseline.rpm, 80);

  console.log('\nadjusting run hours');
  const afterHrs = await pg.evaluate(() => {
    const el = document.getElementById('me_runtime_period');
    el.value = '12';
    el.dataset.userEdited = '1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      rpm: parseFloat(document.getElementById('in_rpm').value),
      disp: document.getElementById('in_rpm_display')?.value,
      rc: parseFloat(document.getElementById('in_revCounter').value),
    };
  });
  check('halving run hours doubles RPM ~ 160', afterHrs.rpm, 160);
  check('rev counter unchanged', afterHrs.rc, baseline.rc);

  console.log('\nchanging time zone / clock change');
  const afterTz = await pg.evaluate((prevRc) => {
    /* Clocks advanced (+60) shorten the watch: 24h wall → 23h. Hold Δrevs and
       recompute RPM = Δrevs / (hrs×60). */
    const el = document.getElementById('me_runtime_period');
    el.value = '24';
    delete el.dataset.userEdited;
    const hid = document.getElementById('in_clockChangeMin');
    if (hid) hid.value = '60';
    refreshMeRunHoursIfTrackingWall(24);
    syncMeRuntimeFromPeriod();
    document.getElementById('in_revCounter').value = String(prevRc + 120000);
    document.getElementById('vs_revCounter').value = String(prevRc + 120000);
    syncRpmFromPeriodChange();
    updateVsRunCalcDisplays();
    updateLivePreview();
    const ctx = getActivePeriodContext();
    const prev = previousEntryFor(editingId) || effectiveCarryover();
    const wall = periodRunHours(prev, ctx.datetime, ctx.meRuntime, ctx.clockChangeMin);
    return {
      clock: formClockChangeMin(),
      wall,
      rpm: parseFloat(document.getElementById('in_rpm').value),
      expectedRpm: wall > 0 ? 120000 / (wall * 60) : null,
      ctxClock: ctx.clockChangeMin,
      editingId,
      vsId: currentVsEntryId,
    };
  }, baseline.prevRc);
  check('editing same entry as summary', afterTz.editingId, afterTz.vsId);
  check('context sees form clock change', afterTz.ctxClock, 60);
  check('wall hours shortened by +60 min clock', afterTz.wall, 23);
  check('RPM follows new period length', afterTz.rpm, afterTz.expectedRpm);

  check('no page errors', errs.length, 0);
  if (errs.length) console.log('   ', errs.slice(0, 3));

  await b.close();
  console.log('');
  if (f) { console.log(`FAILED — ${f} of ${c} checks`); process.exit(1); }
  console.log(`PASSED — ${c} checks`);
})().catch(e => { console.error(e); process.exit(2); });
