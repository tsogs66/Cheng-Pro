/**
 * A laptop with a VPN, Hyper-V and a real Wi-Fi adapter must show the Wi-Fi address first (it is the one a phone can
 * reach), and list every address so the person can try the next when the first says "nothing answered".
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-addr-'));
process.env.TMS_DATA_DIR = tmp;
const nic = (address) => [{ family: 'IPv4', internal: false, address, netmask: '255.255.255.0' }];
os.networkInterfaces = () => ({
  'vEthernet (WSL)': nic('172.28.64.1'),
  'Bluetooth Network Connection': nic('169.254.12.9'),
  'OpenVPN TAP-Windows': nic('10.8.0.6'),
  'Wi-Fi': nic('192.168.43.20'),
  Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' }],
});

(async () => {
  const tank = require('../modules/tanks/server/index');
  const r = await tank.start({ port: 0, host: '0.0.0.0' });
  try {
    const res = await fetch(`http://127.0.0.1:${r.port}/api/lan/state`);
    const st = await res.json();
    assert.ok(Array.isArray(st.addresses), 'state lists the addresses');
    assert.strictEqual(st.addresses[0].name, 'Wi-Fi', 'the real Wi-Fi adapter is first: ' + JSON.stringify(st.addresses));
    assert.match(st.address, /192\.168\.43\.20/, 'the single address shown is the Wi-Fi one');
    assert.strictEqual(st.addresses[st.addresses.length - 1].name, 'Bluetooth Network Connection', 'link-local last');
    assert.ok(st.addresses.length === 4, 'all four are listed, loopback is not');
    console.log('  ok   the Wi-Fi address comes first and every address is listed');
    console.log('\n1 passed');
    process.exit(0);
  } catch (e) { console.log('  FAIL ' + e.message); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
