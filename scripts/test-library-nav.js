#!/usr/bin/env node
'use strict';
/* Vessel library is the same control on every screen, and the sidebar
   order matches the dashboard the chief asked for. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
const backup = fs.readFileSync(path.join(root, 'apps/web/js/modules/backup.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'apps/web/css/shell.css'), 'utf8');

const nav = html.slice(html.indexOf('id="mainNav"'), html.indexOf('id="sidebarFooter"'));
const mods = [...nav.matchAll(/data-module="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(mods, [
  'home', 'voyage', 'tanks', 'bunkerplan', 'bunkeringplan', 'eorb',
  'performance', 'spares', 'notes', 'vessel', 'backup', 'license', 'about',
]);
assert.ok(mods.indexOf('notes') === mods.indexOf('vessel') - 1, 'Notes sits above Vessel Setup');
assert.ok(mods.indexOf('spares') === mods.indexOf('performance') + 1, 'Spares sits below Performance');
assert.ok(nav.includes('Backup &amp; Restore'), 'sidebar names the page Backup & Restore');
assert.ok(!/>\s*Backup\s*</.test(nav), 'sidebar does not keep the short Backup label');

const more = html.slice(html.indexOf('id="bnMoreSheet"'), html.indexOf('id="aioReturnFabs"'));
assert.ok(more.includes('Backup &amp; Restore'), 'phone More sheet uses the same name');
const moreMods = [...more.matchAll(/data-module="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(moreMods, ['notes', 'home', 'spares', 'vessel', 'backup', 'license', 'about']);
assert.strictEqual(moreMods.indexOf('notes') % 3, moreMods.indexOf('vessel') % 3, 'Notes sits above Setup in the More grid');

assert.ok(backup.includes("title: 'Backup & Restore'"));
assert.ok(backup.includes('class="backup-lib-row"'));
assert.ok(backup.includes('const pullId = (voySrc && voySrc.vesselId) || (tankSrc && tankSrc.vesselId)'));
assert.ok(backup.includes('data-voy-pull="${esc(pullId)}"'));
assert.ok(backup.includes('data-voy-mode="${esc(pullId)}"'));
assert.ok(!backup.includes('data-voy-pull="${esc(voySrc.vesselId)}"'), 'Pull voyage is not limited to a Voyage-register row');

assert.ok(css.includes('.backup-lib-row'));
assert.ok(/\.backup-lib-row\s*\{[^}]*align-items:\s*start/.test(css));
assert.ok(css.includes('@media (max-width: 1180px)') && css.includes('.backup-lib-row { grid-template-columns: minmax(0, 1fr); }'));

console.log('library nav ok');
