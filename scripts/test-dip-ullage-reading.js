#!/usr/bin/env node
/*
 * A dip of 0 is an empty tank; an ullage of 0 is a full one. The sounding
 * page used the tank's default method for every reading, so a DIP 0 taken on
 * Monitoring and recalculated there came out full on the overview and the
 * home dashboard. The page now keeps the method the reading was taken with.
 * Run: node scripts/test-dip-ullage-reading.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TANKS = path.join(ROOT, 'modules', 'tanks');
const APP = fs.readFileSync(path.join(TANKS, 'public/js/app.js'), 'utf8').replace(/\r\n/g, '\n');
const HOME = fs.readFileSync(path.join(ROOT, 'apps/web/js/modules/home.js'), 'utf8').replace(/\r\n/g, '\n');
const calc = require(path.join(TANKS, 'server/calc.js'));

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log('\nDip and ullage on an ullage-default tank');
const tanks = require(path.join(TANKS, 'seed/tanks.json'));
const fuel1 = [].concat(...Object.values(tanks)).find((t) => t.id === 'fuel1');
check('seed tank fuel1 defaults to ullage', /ullage/i.test(fuel1.soundingMethod || ''), fuel1.soundingMethod);
const pct = (r) => (r.volumeObserved / fuel1.capacity) * 100;
const dip0 = calc.computeTank(fuel1, { reading: 0, trim: 0, list: 0, tempC: 15, gaugeType: 'meter', entryMethod: 'dip' });
const ull0 = calc.computeTank(fuel1, { reading: 0, trim: 0, list: 0, tempC: 15, gaugeType: 'meter', entryMethod: 'ullage' });
check('dip 0 is empty', pct(dip0) < 1, pct(dip0).toFixed(1) + '%');
check('ullage 0 is full', pct(ull0) > 90, pct(ull0).toFixed(1) + '%');

console.log('\nSounding page keeps the reading\'s method');
const detail = APP.slice(APP.indexOf('function renderTankDetail('), APP.indexOf('function renderTankDetail(') + 20000);
check('starts from the stored reading\'s method, tank default only for a new reading',
  /initialMethod = methodOf\(existing\.entryMethod \|\| tank\.soundingMethod \|\| 'sounding'\)/.test(detail));
check('offers Dip or Ullage', /id="in-method"[\s\S]{0,300}value="dip"[\s\S]{0,200}value="ullage"/.test(detail));
check('label follows the choice', /methodWord\(methodSelect \? methodSelect\.value : initialMethod\) \+ ' \(cm\)'/.test(detail));
check('calculates with the chosen method, not the tank default',
  /entryMethod: gaugeType === 'volume'[\s\S]{0,160}getElementById\('in-method'\)\.value : initialMethod/.test(detail)
  && !/entryMethod: tank\.soundingMethod \|\| 'sounding',\n\s*\};/.test(detail));

console.log('\nHome dashboard reads the database Tank Chief writes to');
check('device-first when Tank data is on this device',
  /tankDataOnDevice\(\) \? \[fromDevice, fromServer\] : \[fromServer, fromDevice\]/.test(HOME)
  && (HOME.match(/tankDataOnDevice\(\) \? \[fromDevice, fromServer\]/g) || []).length === 2);
check('no saved database selection — the packaged app reads the device, the server page reads the server',
  /CHENG_PRO_BUNDLED/.test(HOME) && !/localStorage\.getItem\('apiTransport'\)/.test(HOME));
check('an empty answer from one side falls through to the other',
  /for \(const source of order\) \{\n\s*const report = await source\(\);\n\s*if \(report\) return report;/.test(HOME));

const CORE = fs.readFileSync(path.join(ROOT, 'modules/tanks/public/js/fuel-report-core.js'), 'utf8').replace(/\r\n/g, '\n');
check('monitoring default row uses the stored sounding method',
  /method:\s*normalizeMethod\(r\.entryMethod \|\| r\.method \|\| tank\.soundingMethod\)/.test(CORE));
check('computeRow uses the form method, then the stored entry method',
  /normalizeMethod\(row\.method \|\| row\.entryMethod\)/.test(CORE));

const DASH = fs.readFileSync(path.join(ROOT, 'apps/web/js/home-dashboard.js'), 'utf8').replace(/\r\n/g, '\n');
check('home fill treats dip 0 as empty, not the stored ullage 100%',
  /function fillPercentFromSounding/.test(DASH) && /if \(dip\) return 0;/.test(DASH));
check('home recomputes the monitoring sheet like Tank Chief',
  /function homeComputedReport/.test(DASH));

const SHIM = fs.readFileSync(path.join(ROOT, 'modules/tanks/public/js/node-shim.js'), 'utf8');
const LOCAL = fs.readFileSync(path.join(ROOT, 'modules/tanks/public/js/local-api.js'), 'utf8');
check('the AIO shell re-reads the tank database before answering Home',
  /async function reload\(/.test(SHIM) && /NodeShim\.reload/.test(LOCAL));

const PREP = fs.readFileSync(path.join(ROOT, 'scripts/prepare-android-www.js'), 'utf8');
check('Android Home loads calc.js before fuel-report-core so dip/ullage can compute',
  /tanks\/js\/calc\.js/.test(PREP) && /tanks\/js\/fuel-report-core\.js/.test(PREP));

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
