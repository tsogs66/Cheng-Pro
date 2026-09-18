/**
 * Resolve ChEng AIO desktop data roots and stable loopback ports.
 *
 * Browser storage (license localStorage, Voyage IndexedDB) is origin-scoped
 * including the port. Ephemeral PORT=0 therefore looks like a wipe on every
 * relaunch. Keep HTTP + sync ports sticky under the data root.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');

const DEFAULT_HTTP_PORT = 18080;
const DEFAULT_SYNC_PORT = 18787;
const PORT_SPAN = 40;

function normalizeDir(dir) {
  try {
    return path.resolve(dir);
  } catch {
    return '';
  }
}

function isTempDir(dir) {
  const n = normalizeDir(dir);
  if (!n) return true;
  const lower = n.toLowerCase();
  const temps = [process.env.TEMP, process.env.TMP, process.env.TMPDIR]
    .filter(Boolean)
    .map((t) => normalizeDir(t).toLowerCase())
    .filter(Boolean);
  for (const t of temps) {
    if (lower === t || lower.startsWith(t + path.sep)) return true;
  }
  /* Bare /tmp or /temp (common when TMPDIR is unset). */
  const base = path.basename(lower);
  if (base === 'tmp' || base === 'temp') return true;
  /* electron-builder / Windows unpacks under Local\Temp even when TEMP is unset. */
  if (/[\\/](?:temp|tmp)(?:[\\/]|$)/i.test(lower)) return true;
  if (/appdata[\\/]local[\\/]temp/i.test(lower)) return true;
  return false;
}

function portableBaseDir() {
  const candidates = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.push(process.env.PORTABLE_EXECUTABLE_DIR);
  }
  if (process.env.CHENG_PRO_PORTABLE === '1' || process.env.CHENG_AIO_PORTABLE === '1') {
    candidates.push(path.dirname(process.execPath));
  }
  try {
    if (/portable/i.test(path.basename(process.execPath))) {
      candidates.push(path.dirname(process.execPath));
    }
  } catch { /* ignore */ }

  for (const raw of candidates) {
    const base = normalizeDir(raw);
    if (!base) continue;
    if (isTempDir(base)) {
      console.warn(`[desktop] ignoring temp portable base: ${base}`);
      continue;
    }
    return base;
  }
  return '';
}

function dirHasContent(dir) {
  try {
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** Copy directory tree when dest is missing/empty (one-time migration). */
function migrateDirIfNeeded(src, dest, label) {
  if (!src || !dest || src === dest) return false;
  if (!dirHasContent(src)) return false;
  if (dirHasContent(dest)) return false;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, errorOnExist: false, force: false });
    console.log(`[desktop] migrated ${label}: ${src} → ${dest}`);
    return true;
  } catch (err) {
    console.error(`[desktop] migrate ${label} failed:`, err && err.message ? err.message : err);
    return false;
  }
}

function legacyAppDataCandidates() {
  const appData = process.env.APPDATA || process.env.HOME || '';
  if (!appData) return [];
  /* Older Electron / rebranded productName folders that held license + IndexedDB. */
  return [
    path.join(appData, 'cheng-pro'),
    path.join(appData, 'Cheng-Pro'),
    path.join(appData, 'ChEng AIO'),
    path.join(appData, 'chengaio'),
  ];
}

function resolvePaths(appGetPath) {
  const portableBase = portableBaseDir();
  if (portableBase) {
    const root = path.join(portableBase, 'ChEngAIO-data');
    const legacyRoots = [
      path.join(portableBase, 'cheng-pro-data'),
      path.join(portableBase, 'Cheng-Pro-data'),
      path.join(portableBase, 'ChEng-Pro-data'),
    ];
    /* Prefer rename of the old USB folder when the new one is absent. */
    if (!fs.existsSync(root)) {
      for (const legacy of legacyRoots) {
        if (!dirHasContent(legacy)) continue;
        try {
          fs.renameSync(legacy, root);
          console.log(`[desktop] renamed portable data: ${legacy} → ${root}`);
          break;
        } catch (err) {
          console.warn('[desktop] rename failed, will copy:', err && err.message);
          migrateDirIfNeeded(legacy, root, 'portable-data');
          break;
        }
      }
    }
    const serverData = path.join(root, 'server');
    const userData = path.join(root, 'electron-profile');
    /* Pre-portable-profile builds kept Chromium data in %APPDATA% — bring license + IDB over. */
    if (!dirHasContent(userData)) {
      for (const legacy of legacyAppDataCandidates()) {
        if (migrateDirIfNeeded(legacy, userData, 'electron-profile')) break;
      }
    }
    /* Old portable layout stored JSON under cheng-pro-data/ directly (not …/server). */
    if (!dirHasContent(serverData)) {
      for (const legacy of legacyRoots) {
        if (!dirHasContent(legacy)) continue;
        const nested = path.join(legacy, 'server');
        if (dirHasContent(nested)) migrateDirIfNeeded(nested, serverData, 'server-data');
        else migrateDirIfNeeded(legacy, serverData, 'server-data-flat');
        if (dirHasContent(serverData)) break;
      }
    }
    return {
      portable: true,
      root,
      serverData,
      userData,
    };
  }

  const userData = typeof appGetPath === 'function' ? appGetPath('userData') : '';
  const serverData = path.join(userData, 'data');
  /* Installed build: if this profile is empty, copy from a previous productName folder. */
  if (!dirHasContent(userData) || !dirHasContent(path.join(userData, 'Local Storage'))) {
    for (const legacy of legacyAppDataCandidates()) {
      if (legacy === userData) continue;
      if (migrateDirIfNeeded(legacy, userData, 'installed-profile')) break;
    }
  }
  if (!dirHasContent(serverData)) {
    for (const legacy of legacyAppDataCandidates()) {
      const legacyData = path.join(legacy, 'data');
      if (migrateDirIfNeeded(legacyData, serverData, 'installed-server-data')) break;
    }
  }
  return {
    portable: false,
    root: userData,
    serverData,
    userData,
  };
}

function portsFilePath(root) {
  return path.join(root, 'desktop-ports.json');
}

function readPreferredPorts(root) {
  const defaults = { port: DEFAULT_HTTP_PORT, syncPort: DEFAULT_SYNC_PORT };
  try {
    const raw = fs.readFileSync(portsFilePath(root), 'utf8');
    const parsed = JSON.parse(raw);
    const port = Number(parsed && parsed.port);
    const syncPort = Number(parsed && parsed.syncPort);
    return {
      port: Number.isFinite(port) && port > 0 ? port : defaults.port,
      syncPort: Number.isFinite(syncPort) && syncPort > 0 ? syncPort : defaults.syncPort,
    };
  } catch {
    return defaults;
  }
}

function writePreferredPorts(root, ports) {
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      portsFilePath(root),
      JSON.stringify({ port: ports.port, syncPort: ports.syncPort }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[desktop] could not persist ports:', err && err.message ? err.message : err);
  }
}

function canBind(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function pickPort(host, preferred, used = new Set()) {
  const start = Number(preferred) > 0 ? Number(preferred) : DEFAULT_HTTP_PORT;
  for (let i = 0; i < PORT_SPAN; i += 1) {
    const candidate = start + i;
    if (used.has(candidate)) continue;
    if (await canBind(host, candidate)) return candidate;
  }
  /* Last resort — OS ephemeral (storage may not stick across launches). */
  return 0;
}

async function resolveStablePorts(root, host = '127.0.0.1') {
  const preferred = readPreferredPorts(root);
  const port = await pickPort(host, preferred.port);
  const used = new Set([port].filter((p) => p > 0));
  let syncPreferred = preferred.syncPort;
  if (syncPreferred === port) syncPreferred = port + 1;
  const syncPort = await pickPort(host, syncPreferred, used);
  const chosen = {
    port: port || 0,
    syncPort: syncPort || (port ? port + 1 : DEFAULT_SYNC_PORT),
  };
  if (chosen.port > 0 && chosen.syncPort > 0) {
    writePreferredPorts(root, chosen);
  }
  return chosen;
}

module.exports = {
  DEFAULT_HTTP_PORT,
  DEFAULT_SYNC_PORT,
  isTempDir,
  portableBaseDir,
  dirHasContent,
  migrateDirIfNeeded,
  resolvePaths,
  readPreferredPorts,
  writePreferredPorts,
  resolveStablePorts,
  portsFilePath,
};
