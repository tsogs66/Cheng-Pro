#!/usr/bin/env node
/*
 * Backup "Update to the newest of both" must not lose tank work.
 * Two Tank Chief stores (this device, the office) run the calls the backup
 * page makes: two-way saved-report merge, push of the device bundle, then
 * load the latest sounding report on both sides.
 * Run: node scripts/test-update-keeps-open-sheet.js
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TANKS = path.join(__dirname, '..', 'modules', 'tanks');
const VID = 'captain-veniamis';

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function seeded(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-' + name + '-'));
  execFileSync(process.execPath, [path.join(TANKS, 'scripts', 'seed-vessel.js')], { env: { ...process.env, TMS_DATA_DIR: dir }, stdio: 'ignore' });
  return dir;
}
function start(dir) {
  const p = spawn(process.execPath, [path.join(TANKS, 'server', 'index.js')], {
    env: { ...process.env, TMS_DATA_DIR: dir, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let out = '';
    p.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/listening on http:\/\/[^:]+:(\d+)/);
      if (m) resolve({ p, port: Number(m[1]) });
    });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (c) => reject(new Error('tank server exited ' + c + '\n' + out)));
  });
}
const client = (port) => async (p, opts = {}) => {
  const r = await fetch('http://127.0.0.1:' + port + p, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const t = await r.text();
  if (!r.ok) throw new Error(p + ' ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
};
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const put = (call, part, body) => call(`/api/vessels/${VID}/${part}`, { method: 'PUT', body: JSON.stringify(body) });

async function state(call) {
  const s = await call(`/api/vessels/${VID}/saved-reports`);
  const v = (await call(`/api/vessels/${VID}`)).voyage || {};
  return {
    header: [v.port, v.draftFwd, v.draftAft, v.trim, v.heel].join(' '),
    reports: (s.reportHistory || []).map((x) => x.id).sort().join('+'),
    monitoring: (s.voyageHistory || []).map((x) => x.id).sort().join('+'),
    sheet: s.fuelReport && s.fuelReport.header ? s.fuelReport.header.port : null,
    summaryDraft: s.tankSummaryDraft && s.tankSummaryDraft.note,
    bunkerPlan: s.bunkerPlan && s.bunkerPlan.note,
  };
}

/* What backup.js does on "Update to the newest of both" for tank rows. */
async function update(L, S) {
  const [lb, sb] = await Promise.all([L(`/api/vessels/${VID}/saved-reports`), S(`/api/vessels/${VID}/saved-reports`)]);
  await L(`/api/vessels/${VID}/saved-reports/merge`, { method: 'POST', body: JSON.stringify(sb) });
  await S(`/api/vessels/${VID}/saved-reports/merge`, { method: 'POST', body: JSON.stringify(lb) });
  const again = await L(`/api/vessels/${VID}/saved-reports`);
  await S(`/api/vessels/${VID}/saved-reports/merge`, { method: 'POST', body: JSON.stringify(again) });
  const local = await L(`/api/vessels/${VID}/sounding-report/load-latest`, { method: 'POST', body: '{}' });
  const server = await S(`/api/vessels/${VID}/sounding-report/load-latest`, { method: 'POST', body: '{}' });
  return { local, server };
}

async function scenario(title, setup, verify) {
  console.log('\n' + title);
  const a = await start(seeded('device'));
  const b = await start(seeded('office'));
  const L = client(a.port), S = client(b.port);
  try {
    const base = await L(`/api/vessels/${VID}/fuel-report`);
    const form = base.form || base;
    const report = (id, at, port) => ({ id, savedAt: at, reportType: 'Noon', form: { ...form, header: { ...(form.header || {}), port }, updatedAt: at } });
    await setup({ L, S, form, report });
    const loaded = await update(L, S);
    await verify({ local: await state(L), server: await state(S), loaded });
  } finally {
    a.p.kill(); b.p.kill();
  }
}

(async () => {
  await scenario('Open sheet edited after every saved report', async ({ L, S, form, report }) => {
    await put(L, 'reportHistory', [report('rep-device', ago(60), 'DEVICE-REPORT')]);
    await put(L, 'voyageHistory', [{ id: 'mon-device', savedAt: ago(50), form: {} }]);
    await put(L, 'fuel-report', { ...form, header: { ...(form.header || {}), port: 'OPEN-SHEET' } });
    await put(L, 'tankSummaryDraft', { note: 'SUMMARY-DRAFT', updatedAt: ago(5) });
    await put(L, 'bunkerPlan', { note: 'BUNKER-PLAN-DRAFT', updatedAt: ago(5) });
    await put(L, 'voyage', { voyageNo: 'V-OPEN', port: 'OPEN-PORT', draftFwd: 9.9, draftAft: 11.1, trim: 1.2, heel: 0.5, updatedAt: ago(2) });
    await put(S, 'reportHistory', [report('rep-office', ago(30), 'OFFICE-REPORT')]);
  }, ({ local, server, loaded }) => {
    for (const [side, s] of [['device', local], ['office', server]]) {
      check(`${side}: sheet header (drafts, trim, heel) kept`, s.header === 'OPEN-PORT 9.9 11.1 1.2 0.5', s.header);
      check(`${side}: both saved reports kept`, s.reports === 'rep-device+rep-office', s.reports);
      check(`${side}: monitoring report kept`, s.monitoring === 'mon-device', s.monitoring);
      check(`${side}: open sounding sheet kept`, s.sheet === 'OPEN-SHEET', s.sheet);
      check(`${side}: tank summary and bunker plan drafts kept`, s.summaryDraft === 'SUMMARY-DRAFT' && s.bunkerPlan === 'BUNKER-PLAN-DRAFT', `${s.summaryDraft} / ${s.bunkerPlan}`);
    }
    check('older report not loaded over the open sheet', loaded.local.loaded === false && /newer/.test(loaded.local.reason || ''), JSON.stringify(loaded.local));
  });

  await scenario('Office saved a newer report than anything on the device', async ({ L, S, report }) => {
    await put(L, 'voyage', { voyageNo: 'V-OLD', port: 'OLD-PORT', draftFwd: 5, draftAft: 6, trim: 1, heel: 0, updatedAt: ago(240) });
    await put(L, 'reportHistory', [report('rep-device', ago(200), 'DEVICE-REPORT')]);
    await put(S, 'reportHistory', [report('rep-office', ago(10), 'OFFICE-REPORT')]);
  }, ({ local, server, loaded }) => {
    check('newer office report still loads on the device', loaded.local.loaded === true, JSON.stringify(loaded.local));
    check('device sheet header follows the newer report', local.header.startsWith('OFFICE-REPORT'), local.header);
    check('office sheet header follows the newer report', server.header.startsWith('OFFICE-REPORT'), server.header);
    check('both reports on both sides', local.reports === 'rep-device+rep-office' && server.reports === 'rep-device+rep-office', `${local.reports} / ${server.reports}`);
  });

  await scenario('Office header edited later than the device header', async ({ L, S }) => {
    await put(L, 'voyage', { port: 'DEVICE-PORT', draftFwd: 7, draftAft: 8, trim: 1, heel: 0, updatedAt: ago(30) });
    await put(S, 'voyage', { port: 'OFFICE-PORT', draftFwd: 7.5, draftAft: 8.5, trim: 1, heel: 0, updatedAt: ago(5) });
  }, ({ local, server }) => {
    check('newer office header reaches the device', local.header === 'OFFICE-PORT 7.5 8.5 1 0', local.header);
    check('office keeps its newer header', server.header === 'OFFICE-PORT 7.5 8.5 1 0', server.header);
  });

  console.log(`\n${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
