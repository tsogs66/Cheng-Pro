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
const a = lic.activate({ licenseKey: issued.key, email: 'a@b.com', seat: 'android', deviceId: 'd1' });
assert.ok(lic.verifyEntitlement(a));
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
