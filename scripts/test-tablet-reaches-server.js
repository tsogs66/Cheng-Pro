#!/usr/bin/env node
/*
 * Backup & Restore on the Android and Windows apps sends tank reports to the
 * ChEng AIO server, not to the app itself. Both apps serve the page from
 * localhost, so '/tanks/...' never left the device: in the APK every call came
 * back as index.html with a 200 and the saved reports were reported as sent.
 * Run: node scripts/test-tablet-reaches-server.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BACKUP = fs.readFileSync(path.join(__dirname, '..', 'apps/web/js/modules/backup.js'), 'utf8').replace(/\r\n/g, '\n');

let checks = 0, failures = 0;
function check(label, cond, detail) {
  checks++;
  const ok = !!cond;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail != null ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function extract(name) {
  const start = BACKUP.indexOf(`function ${name}(`);
  if (start < 0) throw new Error('missing ' + name);
  let i = BACKUP.indexOf(') {', start) + 2, depth = 0;
  for (; i < BACKUP.length; i++) {
    if (BACKUP[i] === '{') depth++;
    else if (BACKUP[i] === '}' && --depth === 0) return BACKUP.slice(start, i + 1);
  }
  throw new Error('unclosed ' + name);
}
function body(name) {
  try { return extract(name); } catch (_) { return ''; }
}

function run(page) {
  const store = Object.assign({}, page.storage);
  const box = {
    window: page.capacitor ? { Capacitor: {} } : {},
    location: { protocol: page.protocol || 'https:' },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    bundledClient: () => !!page.bundled,
  };
  vm.createContext(box);
  vm.runInContext(extract('tankServerBase') + '\n' + extract('tankJsonOrThrow'), box);
  return box;
}

console.log('\nWhere "the server" is');
check('a browser on the server uses its own host', run({ bundled: false }).tankServerBase() === '');
check('the Android app uses the Server URL saved under License',
  run({ bundled: true, capacitor: true, storage: { apiServerBase: 'http://10.0.0.5:8080/' } }).tankServerBase() === 'http://10.0.0.5:8080');
check('the alias key and a /api/license suffix are accepted',
  run({ bundled: true, capacitor: true, storage: { chengAioLicenseServerUrl: 'https://aio.example/api/license' } }).tankServerBase() === 'https://aio.example');
check('the Windows app uses the Server URL when it is set',
  run({ bundled: true, storage: { apiServerBase: 'http://10.0.0.5:8080' } }).tankServerBase() === 'http://10.0.0.5:8080');
check('the Windows app with no Server URL keeps its own server', run({ bundled: true, protocol: 'http:' }).tankServerBase() === '');
let threw = '';
try { run({ bundled: true, capacitor: true }).tankServerBase(); } catch (e) { threw = e.message; }
check('the Android app with no Server URL says so instead of sending nowhere', /License → Server URL/.test(threw), threw);

console.log('\nA web page is not tank data');
const box = run({ bundled: false });
let pageErr = '';
try { box.tankJsonOrThrow('<!doctype html><html><body>ChEng AIO</body></html>', 'text/html'); } catch (e) { pageErr = e.message; }
check('index.html with a 200 is an error, not a sent report', /web page, not tank data/.test(pageErr), pageErr);
check('JSON is read', box.tankJsonOrThrow('{"vessels":[{"id":"a"}]}', 'application/json').vessels[0].id === 'a');
check('an empty reply is nothing, not an error', box.tankJsonOrThrow('', 'application/json') === null);

console.log('\nEvery server call goes through it');
check('gateway calls', /const url = tankServerBase\(\) \+ '\/tanks' \+ path;/.test(body('gatewayTankApi'))
  && /return tankJsonOrThrow\(raw, res\.headers\.get\('Content-Type'\)\);/.test(body('gatewayTankApi')));
check('backup downloads', /xhr\.open\('GET', base \+ '\/tanks' \+ path\)/.test(body('tankBackupGet'))
  && /tankJsonOrThrow\(xhr\.responseText/.test(body('tankBackupGet')));
check('vessel library', /fetch\(tankServerBase\(\) \+ '\/tanks\/api\/vessel-library'/.test(BACKUP));
check('no bare /tanks fetch left', !/^(?!\s*\*).*(fetch\('\/tanks|xhr\.open\('GET', '\/tanks)/m.test(BACKUP));
check('server library does not show this device\'s copy as the server\'s when a URL is set',
  /configured = !!tankServerBase\(\)[\s\S]{0,80}if \(configured\) throw gatewayErr;/.test(body('serverTankApi')));

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
