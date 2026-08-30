'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.CHENG_PRO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));
process.env.LICENSE_SIGNING_SECRET = 'test-secret';
const lic = require('../server/license/store');
const mail = require('../server/license/mail');

const issued = lic.issueLicense({ email: 'a@b.com', sku: 'cheng-aio', plan: 'yearly' });
assert.ok(issued.key);
assert.ok(issued.key.startsWith('CA-'), 'cheng-aio key prefix');
const withOrb = lic.issueLicense({ email: 'b@c.com', sku: 'voyage-chief', plan: 'lifetime', addons: ['eorb'] });
assert.deepEqual(withOrb.addons, ['eorb']);
assert.ok(withOrb.key.startsWith('VC-'), 'voyage-chief key prefix');
const tankKey = lic.issueLicense({ email: 't@c.com', sku: 'tank-chief', plan: 'yearly' });
assert.ok(tankKey.key.startsWith('TC-'), 'tank-chief key prefix');
const master = lic.issueLicense({ email: 'admin@c.com', sku: 'cheng-admin', plan: 'lifetime' });
assert.equal(master.sku, 'cheng-admin');
assert.ok(master.key.startsWith('MA-'), 'cheng-admin key prefix');
const masterEnt = lic.activate({ licenseKey: master.key, email: 'admin@c.com', seat: 'android', deviceId: 'admin-phone' });
assert.equal(masterEnt.master, true);
assert.ok(lic.isMasterLicense({ sku: 'cheng-admin', addons: [] }));
assert.ok(lic.isMasterLicense({ sku: 'voyage-chief', addons: ['master'] }));
assert.ok(!lic.isMasterLicense({ sku: 'voyage-chief', addons: ['eorb'] }));
const withMasterAddon = lic.issueLicense({ email: 'm@c.com', sku: 'voyage-chief', plan: 'yearly', addons: ['master', 'eorb', 'nope'] });
assert.deepEqual(withMasterAddon.addons, ['master', 'eorb']);
const aOrb = lic.activate({ licenseKey: withOrb.key, email: 'b@c.com', seat: 'android', deviceId: 'phone1' });
assert.deepEqual(aOrb.addons, ['eorb']);
assert.equal(aOrb.master, false);
const a = lic.activate({ licenseKey: issued.key, email: 'a@b.com', seat: 'android', deviceId: 'd1' });
assert.ok(lic.verifyEntitlement(a));
assert.equal(a.master, false);
assert.throws(() => lic.activate({ licenseKey: issued.key, email: 'a@b.com', seat: 'android', deviceId: 'd2' }), /seat already bound|SEAT_TAKEN/i);
const p = lic.pairStart({ licenseKey: issued.key, email: 'a@b.com', deviceId: 'd1' });
const w = lic.pairComplete({ code: p.code, deviceId: 'pc' });
assert.equal(w.deviceSeat, 'windows');

const forced = lic.adminForceTransfer({ licenseId: issued.id, seat: 'windows', reason: 'test' });
assert.ok(forced.ok);
assert.equal(forced.license.seats.windows, null);

const again = lic.activate({ licenseKey: issued.key, email: 'a@b.com', seat: 'windows', deviceId: 'pc2' });
assert.equal(again.deviceSeat, 'windows');

lic.adminRevoke({ licenseId: issued.id, reason: 'test' });
assert.throws(
  () => lic.activate({ licenseKey: issued.key, email: 'a@b.com', seat: 'android', deviceId: 'd9' }),
  /revoked/i
);

const msg = mail.buildMessage(issued);
assert.ok(msg.subject.includes('ChEng'));
assert.ok(msg.text.includes(issued.key));

const listed = lic.listLicenses({ q: 'a@b.com' });
assert.ok(listed.length >= 1);

console.log('license tests ok');
