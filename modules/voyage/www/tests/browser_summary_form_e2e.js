/*
 * The Voyage Summary form — the report an engineer fills in under Log Entry.
 *
 *   APP_BASE=http://127.0.0.1:8867 NODE_PATH=/path/to/node_modules \
 *     node tests/browser_summary_form_e2e.js
 *
 * Covers the round of changes that reworked it:
 *   - each unit's fuel consumption is typed beside the flowmeter figure it came
 *     from, and clearing a box falls back to that figure rather than to zero;
 *   - D/G is entered under Fuel Cons like the others, not in a separate box under
 *     the generators, and still apportions fuel across the running sets;
 *   - the Others panel hides itself when the M/E is stopped and every field in it
 *     is hidden, instead of leaving a titled blank box to scroll past;
 *   - Print & Save commits the report before printing, so the sheet handed over
 *     and the record kept on board carry the same figures;
 *   - tank soundings are gone from the form, but entries that already recorded
 *     them keep them.
 *
 * Not in CI, which has no browser.
 */
const { chromium } = require('playwright-core');
const BASE = process.env.APP_BASE || 'http://127.0.0.1:8867';
let f = 0, c = 0;
const check = (l, a, e) => { c++; const ok = JSON.stringify(a) === JSON.stringify(e);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${l}${ok ? '' : `: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`}`);
  if (!ok) f++; };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.on('dialog', async d => { await d.accept(); });
  await pg.goto(`${BASE}/voyage_manager.html`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.getElementById('loginGate')?.setAttribute('hidden', ''));
  await pg.evaluate(async () => { await installTestFleet({ switchToFirst: true }); });
  await pg.waitForTimeout(4000);

  const open = () => pg.evaluate(async () => {
    switchTab('entry');
    openVoyageSummary(sortedEntries().slice(-1)[0].id);
    await new Promise(r => setTimeout(r, 800));
  });

  console.log('fuel consumption by unit');
  await open();
  const cons = await pg.evaluate(() => {
    const e = sortedEntries().slice(-1)[0];
    const v = id => document.getElementById(id)?.value;
    const t = id => document.getElementById(id)?.textContent.trim();
    return {
      resetBtnGone: !document.getElementById('btnVsResetUnitCons'),
      geTotalBoxGone: !document.getElementById('vs_geTotalCons'),
      geEditable: document.getElementById('vs_unit_ge')?.readOnly === false,
      typed: { me: v('vs_unit_me'), ge: v('vs_unit_ge'), blr: v('vs_unit_blr') },
      basis: { me: t('vs_unit_me_meter'), ge: t('vs_unit_ge_meter'), blr: t('vs_unit_blr_meter') },
      metered: meterDerivedUnitCons(e)
    };
  });
  check('the Reset Unit Cons button is gone', cons.resetBtnGone, true);
  check('Total G/E Fuel Cons is gone from the generators panel', cons.geTotalBoxGone, true);
  check('D/G is typed here now, not mirrored read-only', cons.geEditable, true);
  // The basis shown must be the flowmeter figure itself, not the value in the box —
  // those differ the moment anything is overridden, which is when it matters.
  check('the M/E basis is the metered figure', cons.basis.me, cons.metered.meCons.toFixed(3));
  check('the D/G basis is the metered figure', cons.basis.ge, cons.metered.geCons.toFixed(3));
  check('the boiler basis is the metered figure', cons.basis.blr, cons.metered.blrCons.toFixed(3));

  console.log('\noverriding a unit, and taking it back');
  const ov = await pg.evaluate(async () => {
    const v = id => document.getElementById(id)?.value;
    const geFuel = () => [1, 2, 3].map(n => v(`vs_ge${n}_fuel`)).filter(x => x !== undefined);
    const box = document.getElementById('vs_unit_ge');
    const type = (val) => { box.value = val; box.dispatchEvent(new Event('input', { bubbles: true })); };
    const metered = meterDerivedUnitCons(sortedEntries().slice(-1)[0]);
    type('3.500'); await new Promise(r => setTimeout(r, 300));
    const typed = { total: v('vs_unit_total'), shares: geFuel(), basis: document.getElementById('vs_unit_ge_meter').textContent.trim() };
    type(''); await new Promise(r => setTimeout(r, 300));
    const cleared = { total: v('vs_unit_total'), shares: geFuel() };
    return { typed, cleared, metered };
  });
  const sum = (a) => a.reduce((x, y) => x + (parseFloat(y) || 0), 0);
  check('the override splits across the running generators', sum(ov.typed.shares).toFixed(3), '3.500');
  check('the basis still shows the flowmeter, not the override', ov.typed.basis, ov.metered.geCons.toFixed(3));
  check('the total follows the override',
    ov.typed.total, ((3.5) + (ov.metered.meCons || 0) + (ov.metered.blrCons || 0)).toFixed(3));
  // An empty box means "use the flowmeter", so clearing must restore the metered
  // figure everywhere — not drop that unit's fuel out of the total.
  check('clearing falls back to the metered split', sum(ov.cleared.shares).toFixed(3), ov.metered.geCons.toFixed(3));
  check('and the total counts the metered figure, not zero',
    ov.cleared.total, ((ov.metered.meCons || 0) + (ov.metered.geCons || 0) + (ov.metered.blrCons || 0)).toFixed(3));

  console.log('\nthe Others panel');
  const others = await pg.evaluate(async () => {
    const snap = () => {
      const box = document.getElementById('vsOthersBox');
      return { shown: box.style.display !== 'none',
               fields: [...box.querySelectorAll('.field')].filter(x => x.style.display !== 'none').length };
    };
    const e = sortedEntries().slice(-1)[0];
    const was = e.operation, wasRev = e.revCounter;
    openVoyageSummary(e.id); await new Promise(r => setTimeout(r, 600));
    const stopped = snap();
    document.getElementById('btnVsShowMePanels').click();
    await new Promise(r => setTimeout(r, 400));
    const forced = snap();
    document.getElementById('btnVsShowMePanels').click();
    await new Promise(r => setTimeout(r, 400));
    const unforced = snap();
    e.operation = 'NOON - AT SEA';
    e.revCounter = (e.revCounter || 0) + 50000;
    openVoyageSummary(e.id); await new Promise(r => setTimeout(r, 600));
    const running = snap();
    e.operation = was; e.revCounter = wasRev;
    return { stopped, forced, unforced, running };
  });
  check('hidden when the engine is stopped and it has nothing to show', others.stopped, { shown: false, fields: 0 });
  // "Show M/E panels anyway" used to reveal the panels while these fields stayed
  // hidden, which is not what the button says it does.
  check('"show anyway" brings it back with its fields', others.forced, { shown: true, fields: 8 });
  check('toggling off hides it again', others.unforced, { shown: false, fields: 0 });
  check('shown on a sea watch with the engine turning', others.running, { shown: true, fields: 8 });

  console.log('\ntank soundings');
  const snd = await pg.evaluate(async () => {
    const e = sortedEntries().slice(-1)[0];
    /* An entry recorded before the table was removed. Its soundings must survive a
       re-save, and still print. */
    e.report = e.report || {};
    e.report.soundings = { 'legacy-tank': { soundingCm: 120, tempC: 31, volume: 44.5 } };
    await dbPut('entries', e);
    openVoyageSummary(e.id); await new Promise(r => setTimeout(r, 700));
    const inForm = !!document.getElementById('vsSoundingsBody');
    document.getElementById('btnSaveVoyageSummary').click();
    await new Promise(r => setTimeout(r, 1500));
    const after = state.entries.find(x => x.id === e.id);
    return { inForm, kept: after.report?.soundings?.['legacy-tank']?.volume,
             printed: printSoundingsSection(after.report).includes('44.50') };
  });
  check('the soundings table is gone from the form', snd.inForm, false);
  check('an older entry keeps the soundings it recorded', snd.kept, 44.5);
  check('and they still print', snd.printed, true);

  console.log('\nthe report summary buttons');
  await open();
  const btns = await pg.evaluate(async () => {
    const labels = [...document.querySelectorAll('#voyageSummaryPanel .btn-row button')]
      .map(x => x.textContent.trim()).filter(x => /save|print|close/i.test(x));
    const e = sortedEntries().slice(-1)[0];
    const box = document.getElementById('vs_unit_blr');
    box.value = '4.250';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    const historyBefore = (state.printHistory || []).length;
    let printed = null;
    const real = window.printPortraitSinglePage;
    window.printPortraitSinglePage = (h) => { printed = h; return h; };
    document.getElementById('btnPrintVoyageSummary').click();
    await new Promise(r => setTimeout(r, 1600));
    window.printPortraitSinglePage = real;
    const saved = state.entries.find(x => x.id === e.id);
    return {
      labels,
      committed: saved.unitOverride?.BLR,
      stillOpen: document.getElementById('voyageSummaryPanel').style.display !== 'none',
      historyGrew: (state.printHistory || []).length > historyBefore,
      sheetHasFigure: !!printed && printed.includes('4.25')
    };
  });
  check('the three buttons, named as asked', btns.labels, ['Save Report', 'Print & Save (A4 Portrait)', 'Close']);
  // Print used to leave the report unsaved: a sheet could be signed and filed while
  // its figures existed nowhere but the open form.
  check('Print & Save commits the typed figure', btns.committed, 4.25);
  check('the printed sheet carries it', btns.sheetHasFigure, true);
  check('and it is filed in print history', btns.historyGrew, true);
  check('the panel stays open so the engineer can keep working', btns.stillOpen, true);

  check('no page errors', errs.length, 0);
  if (errs.length) console.log('   ', errs.slice(0, 3));
  await b.close();
  console.log('');
  if (f) { console.log(`FAILED — ${f} of ${c} checks`); process.exit(1); }
  console.log(`PASSED — ${c} checks`);
})();
