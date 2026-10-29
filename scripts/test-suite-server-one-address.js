#!/usr/bin/env node
/*
 * Backup & Restore has one Cheng Suite server: one address and one token that
 * Save & connect writes into Tank Chief and Voyage Chief alike. Push, Pull and
 * Keep data persistent are gone; Database consistency moves the data.
 * Run: node scripts/test-suite-server-one-address.js
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
  let i = BACKUP.indexOf('{', start), depth = 0;
  for (; i < BACKUP.length; i++) {
    if (BACKUP[i] === '{') depth++;
    else if (BACKUP[i] === '}' && --depth === 0) return BACKUP.slice(start, i + 1);
  }
  throw new Error('unclosed ' + name);
}
function after(anchor, span) {
  const i = BACKUP.indexOf(anchor);
  return i < 0 ? '' : BACKUP.slice(i, i + span);
}

const box = {};
vm.createContext(box);
vm.runInContext(['normalizeSuiteUrl', 'pickSuiteServer'].map(extract).join('\n'), box);

console.log('\nOne panel, one address, one token');
const panel = after('id="bk-suite-server"', 3000).split('</details>')[0];
check('the panel is called Cheng Suite server', panel.includes('>Cheng Suite server<'));
check('one URL field and one token field', (panel.match(/type="url"/g) || []).length === 1 && (panel.match(/type="password"/g) || []).length === 1);
check('one Save & connect and one Test connection', (panel.match(/<button/g) || []).length === 2
  && panel.includes('id="bk-suite-save"') && panel.includes('id="bk-suite-test"'), (panel.match(/<button[^>]*>[^<]*/g) || []).join(' | '));
check('the Tank and Voyage server panels are gone', !BACKUP.includes('id="bk-tank-server"') && !BACKUP.includes('id="bk-voyage-server"'));
for (const id of ['bk-sync-pull', 'bk-sync-push', 'bk-sync-flush', 'bk-voy-sync-push', 'bk-voy-sync-pull', 'bk-voy-sync-persist', 'bk-voy-sync-pull-leg', 'bk-voy-sync-list']) {
  check(`no ${id} button`, !BACKUP.includes(`id="${id}"`) && !BACKUP.includes(`'#${id}'`));
}
check('no Keep data persistent anywhere on the page', !/Keep data persistent/.test(BACKUP));

console.log('\nSave & connect writes the same server into both programs');
const save = after("root.querySelector('#bk-suite-save')", 4000);
check('Tank Chief gets the address and token', /tankRequest\('\/api\/settings'[\s\S]{0,120}syncUrl: url, syncApiToken: token/.test(save));
check('Voyage Chief gets them too', /voyagePost\('save-sync-settings', \{ settings: voySettings \}/.test(save));
const form = extract('readVoyageSyncForm');
check('Voyage reads the suite URL and token', form.includes("'#bk-suite-url'") && form.includes("'#bk-suite-token'"));
check('Voyage always merges by record', /conflictPolicy: 'merge'/.test(form));
check('the tank check reads the suite fields', /#bk-check-tanks[\s\S]{0,600}#bk-suite-url[\s\S]{0,200}#bk-suite-token/.test(BACKUP));
check('the packaged app sends tanks to the suite server first', /tankServerBase\(\) \{[\s\S]{0,200}SUITE_URL_KEY/.test(BACKUP));

console.log('\nThe two saved copies map onto one');
check('trailing /tanks and slashes are trimmed', box.normalizeSuiteUrl(' http://10.0.0.5:8080/tanks/ ') === 'http://10.0.0.5:8080');
check('a License URL loses /api/license', box.normalizeSuiteUrl('https://aio.example.com/api/license') === 'https://aio.example.com');
let p = box.pickSuiteServer({ syncUrl: 'http://aio:8080/', syncApiToken: 't1' }, { serverUrl: 'http://aio:8080', apiToken: 't1' });
check('same server in both: one address, one token, nothing to warn', p.url === 'http://aio:8080' && p.token === 't1' && !p.otherUrl, JSON.stringify(p));
p = box.pickSuiteServer({ syncUrl: '', syncApiToken: '' }, { serverUrl: 'http://aio:8080', apiToken: 'v' });
check('only Voyage set: its address and token carry over', p.url === 'http://aio:8080' && p.token === 'v', JSON.stringify(p));
p = box.pickSuiteServer({ syncUrl: 'http://aio:8080', syncApiToken: '' }, { serverUrl: 'http://aio:8080', apiToken: 'v' });
check('Tank had no token: the Voyage one fills in', p.token === 'v', JSON.stringify(p));
p = box.pickSuiteServer({ syncUrl: 'http://aio:8080', syncApiToken: 't' }, { serverUrl: 'https://voyage.example.com', apiToken: 'v' });
check('different servers: the Tank one wins with its token', p.url === 'http://aio:8080' && p.token === 't', JSON.stringify(p));
check('and the Voyage address is named so he can see the change', p.otherUrl === 'https://voyage.example.com');
p = box.pickSuiteServer(null, null);
check('nothing saved yet: empty form', p.url === '' && p.token === '', JSON.stringify(p));

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
