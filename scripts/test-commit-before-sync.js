/**
 * A server check files the open voyage leg and turns Save into a saved report.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'modules/voyage/www/index.html'), 'utf8');
const backup = fs.readFileSync(path.join(root, 'apps/web/js/modules/backup.js'), 'utf8');
const fuel = fs.readFileSync(path.join(root, 'modules/tanks/public/js/fuel-report.js'), 'utf8');
const bunker = fs.readFileSync(path.join(root, 'modules/tanks/public/js/bunkering-report.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'modules/tanks/public/js/app.js'), 'utf8');

assert.strictEqual(html, index, 'voyage HTML copies diverged');

function between(src, start, end) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, 'missing ' + start);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, 'missing ' + end + ' after ' + start);
  return src.slice(i, j);
}

assert.match(html, /async function commitOpenWorkBeforeSync/);
assert.match(html, /readBunkerPlanFromDom\(\)/);
const openLeg = between(html, 'async function openLegForReconcile', 'async function compareLocalAndServerLegs');
assert.match(openLeg, /commitOpenWorkBeforeSync/);
assert.doesNotMatch(openLeg, /persistCurrent:\s*false/);
const compare = between(html, 'async function compareLocalAndServerLegs', 'async function openLatestVoyageLeg');
assert.match(compare, /commitOpenWorkBeforeSync/);
const latest = between(html, 'async function openLatestVoyageLeg', 'async function reconcileVoyageLegs');
assert.match(latest, /commitOpenWorkBeforeSync/);
assert.doesNotMatch(latest, /persistCurrent:\s*false/);
for (const action of ['export-db', 'export-vessel', 'push-active', 'pull-active']) {
  const chunk = between(html, "msg.action === '" + action + "'", 'reply(');
  assert.match(chunk, /commitOpenWorkBeforeSync/, action);
}
const pullLeg = between(html, "msg.action === 'pull-voyage-leg'", 'reply({');
assert.match(pullLeg, /commitOpenWorkBeforeSync[\s\S]{0,400}state\.setup\.voyageNumber = voyage/);
const summary = between(html, 'async function saveOpenVoyageSummary', "document.getElementById('btnSaveVoyageSummary')");
assert.match(summary, /archiveActiveVoyageLeg/);

const checkVoyage = between(backup, "querySelector('#bk-check-voyage')", 'querySelector(\'#bk-check-tanks\')');
assert.match(checkVoyage, /flushTankFrames/);
assert.match(backup, /src\.indexOf\('\/voyage'\)/);
assert.match(backup, /setTimeout\(finish, 90000\)/);

assert.match(fuel, /fr-save'\)\.onclick = \(\) => saveReport\(\{ snapshot: true/);
assert.match(fuel, /async function flushIfDirty[\s\S]{0,700}snapshot: true/);
assert.match(bunker, /bp-save'\)\.onclick = \(\) => saveChainPart\([\s\S]{0,220}snapshot: true/);
assert.match(bunker, /ba-save'\)\.onclick = \(\) => saveChainPart\([\s\S]{0,220}snapshot: true/);
assert.match(bunker, /bs-save'\)\.onclick = \(\) => saveChainPart\([\s\S]{0,240}snapshot: true/);
assert.match(bunker, /async function flushOpenForms[\s\S]{0,900}snapshot: true/);
assert.match(app, /fileVoyageReportSnapshot/);
assert.match(app, /fileTankSummarySnapshot/);
assert.match(app, /showToast\('Voyage report saved'\)/);
assert.match(app, /showToast\('Tank summary saved'\)/);
assert.doesNotMatch(app, /showToast\('Draft saved'\)/);
assert.doesNotMatch(app, /showToast\('Tank summary draft saved'\)/);

console.log('commit before sync: ok');
