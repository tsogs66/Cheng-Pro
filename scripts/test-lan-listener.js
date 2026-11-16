/* Live sync: the panel must talk to this device's own engine, and the Windows app (server on 127.0.0.1)
   must open a small network listener that answers only what a paired device calls. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const backup = fs.readFileSync(path.join(__dirname, '../apps/web/js/modules/backup.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const panel = backup.slice(backup.indexOf('ChengLanSyncAll.create'), backup.indexOf('ChengLanSyncAll.mount'));
assert(/tank:\s*\(path, init\) => lanTankApi\(/.test(panel), 'panel uses the device engine');
assert(!/gatewayTankApi/.test(panel), 'panel must not use the Suite server');
assert(/function startLanListener/.test(server) && /'0\.0\.0\.0'/.test(server), 'LAN listener exists');
assert(/hello\|pair\|status\|vessel\\\/\|apply/.test(server), 'LAN listener is limited to peer routes');
console.log('lan listener ok');
