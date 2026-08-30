'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.CHENG_PRO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));
process.env.LICENSE_SIGNING_SECRET = 'test-secret';
const lic = require('../server/license/store');

const issued = lic.issueLicense({ email: 'a@b.com', sku: 'cheng-aio', plan: 'yearly' });
assert.ok(issued.key);
const a = lic.activate({ licenseKey: issued.key, email: 'a@b.com', seat: 'android', deviceId: 'd1' });
assert.ok(lic.verifyEntitlement(a));
assert.throws(() => lic.activate({ licenseKey: issued.key, email: 'a@b.com', seat: 'android', deviceId: 'd2' }), /seat already bound|SEAT_TAKEN/i);
const p = lic.pairStart({ licenseKey: issued.key, email: 'a@b.com', deviceId: 'd1' });
const w = lic.pairComplete({ code: p.code, deviceId: 'pc' });
assert.equal(w.deviceSeat, 'windows');
console.log('license tests ok');
