/**
 * Guards for Windows desktop persistence: stable ports + no data under TEMP.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isTempDir,
  portableBaseDir,
  resolveStablePorts,
  readPreferredPorts,
  writePreferredPorts,
  DEFAULT_HTTP_PORT,
  DEFAULT_SYNC_PORT,
} = require('../desktop/paths');

async function main() {
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  assert(
    !/process\.env\.PORT\s*=\s*['"]0['"]/.test(mainSrc),
    'desktop must not force ephemeral PORT=0 (wipes origin-scoped license + IndexedDB)'
  );
  assert(
    /resolveStablePorts/.test(mainSrc),
    'desktop must bind sticky loopback ports via resolveStablePorts'
  );

  assert.strictEqual(isTempDir(os.tmpdir()), true);
  assert.strictEqual(isTempDir(path.join(os.tmpdir(), 'cheng-extract')), true);
  assert.strictEqual(isTempDir('/opt/cheng-aio'), false);

  const prevPortable = process.env.PORTABLE_EXECUTABLE_DIR;
  const prevFlag = process.env.CHENG_AIO_PORTABLE;
  try {
    process.env.PORTABLE_EXECUTABLE_DIR = path.join(os.tmpdir(), 'fake-portable');
    delete process.env.CHENG_AIO_PORTABLE;
    delete process.env.CHENG_PRO_PORTABLE;
    assert.strictEqual(
      portableBaseDir(),
      '',
      'temp PORTABLE_EXECUTABLE_DIR must not become the data root'
    );

    const stable = path.join(process.cwd(), '.tmp-cheng-paths-stable-root');
    fs.mkdirSync(stable, { recursive: true });
    process.env.PORTABLE_EXECUTABLE_DIR = stable;
    assert.strictEqual(portableBaseDir(), path.resolve(stable));
    try { fs.rmSync(stable, { recursive: true, force: true }); } catch { /* ignore */ }
  } finally {
    if (prevPortable == null) delete process.env.PORTABLE_EXECUTABLE_DIR;
    else process.env.PORTABLE_EXECUTABLE_DIR = prevPortable;
    if (prevFlag == null) delete process.env.CHENG_AIO_PORTABLE;
    else process.env.CHENG_AIO_PORTABLE = prevFlag;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheng-ports-'));
  try {
    const first = readPreferredPorts(root);
    assert.strictEqual(first.port, DEFAULT_HTTP_PORT);
    assert.strictEqual(first.syncPort, DEFAULT_SYNC_PORT);

    writePreferredPorts(root, { port: 18111, syncPort: 18888 });
    const saved = readPreferredPorts(root);
    assert.strictEqual(saved.port, 18111);
    assert.strictEqual(saved.syncPort, 18888);

    const resolved = await resolveStablePorts(root, '127.0.0.1');
    assert.ok(resolved.port > 0, 'http port should bind');
    assert.ok(resolved.syncPort > 0, 'sync port should bind');
    assert.notStrictEqual(resolved.port, resolved.syncPort);
    const again = await resolveStablePorts(root, '127.0.0.1');
    assert.strictEqual(again.port, resolved.port, 'http port must stick across launches');
    assert.strictEqual(again.syncPort, resolved.syncPort, 'sync port must stick across launches');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  assert(/\/api\/shell\/local-license/.test(indexSrc), 'gateway must expose local-license mirror');

  const licSrc = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'js', 'license.js'), 'utf8');
  assert(/hydrateEntitlementFromDisk/.test(licSrc), 'license client must restore from disk mirror');
  assert(/mirrorEntitlementToDisk/.test(licSrc), 'license client must write disk mirror');

  console.log('ok — desktop paths keep ports sticky and reject TEMP data roots');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
