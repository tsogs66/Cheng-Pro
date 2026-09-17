/**
 * ChEng AIO desktop (Electron).
 *
 * Portable builds (USB): all databases live beside the .exe under ChEngAIO-data/
 * so the stick is fully standalone across PCs.
 */
const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isPackaged = app.isPackaged;

function portableBaseDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  if (process.env.CHENG_PRO_PORTABLE === '1' || process.env.CHENG_AIO_PORTABLE === '1') {
    return path.dirname(process.execPath);
  }
  /* electron-builder portable .exe name often contains "Portable". */
  try {
    if (/portable/i.test(path.basename(process.execPath))) {
      return path.dirname(process.execPath);
    }
  } catch { /* ignore */ }
  return '';
}

function resolvePaths() {
  const portableBase = portableBaseDir();
  if (portableBase) {
    const root = path.join(portableBase, 'ChEngAIO-data');
    return {
      portable: true,
      root,
      serverData: path.join(root, 'server'),
      userData: path.join(root, 'electron-profile'),
    };
  }
  return {
    portable: false,
    root: app.getPath('userData'),
    serverData: path.join(app.getPath('userData'), 'data'),
    userData: app.getPath('userData'),
  };
}

const paths = resolvePaths();
if (paths.portable) {
  fs.mkdirSync(paths.serverData, { recursive: true });
  fs.mkdirSync(paths.userData, { recursive: true });
  /* Must run before ready — puts IndexedDB / localStorage on the USB too. */
  app.setPath('userData', paths.userData);
}

let mainWindow = null;
let gateway = null;

function filtersForName(filename, mime) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.json') || /json/i.test(mime || '')) {
    return [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All files', extensions: ['*'] },
    ];
  }
  if (lower.endsWith('.csv')) {
    return [
      { name: 'CSV', extensions: ['csv'] },
      { name: 'All files', extensions: ['*'] },
    ];
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return [
      { name: 'Excel', extensions: ['xlsx', 'xls'] },
      { name: 'All files', extensions: ['*'] },
    ];
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return [
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'All files', extensions: ['*'] },
    ];
  }
  const ext = path.extname(lower).replace(/^\./, '');
  if (ext) {
    return [
      { name: ext.toUpperCase(), extensions: [ext] },
      { name: 'All files', extensions: ['*'] },
    ];
  }
  return [{ name: 'All files', extensions: ['*'] }];
}

ipcMain.handle('cheng-save-text', async (event, payload = {}) => {
  const filename = String(payload.filename || `cheng-backup-${Date.now()}.json`).replace(/[\\/:*?"<>|]+/g, '-');
  const text = String(payload.text ?? '');
  const mime = String(payload.mime || 'application/json');
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showSaveDialog(win || undefined, {
    title: 'Save file',
    defaultPath: filename,
    filters: filtersForName(filename, mime),
  });
  if (result.canceled || !result.filePath) return '';
  await fs.promises.writeFile(result.filePath, text, 'utf8');
  return result.filePath;
});

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'ChEng AIO',
    backgroundColor: '#07141a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    /* blob:/data: popups must stay in-app; shell.openExternal crashes/odd on Windows. */
    if (/^(blob:|data:)/i.test(url)) {
      return { action: 'allow' };
    }
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[desktop] render-process-gone', details);
    try {
      if (!mainWindow.isDestroyed()) mainWindow.reload();
    } catch (err) {
      console.error('[desktop] reload after renderer crash failed', err);
    }
  });
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    /* Keep the OS save dialog for Content-Disposition attachments (CSV/XLSX). */
    item.setSaveDialogOptions({
      title: 'Save download',
      defaultPath: item.getFilename(),
    });
  });
}

app.whenReady().then(async () => {
  const DATA_DIR = paths.serverData;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  process.env.CHENG_PRO_DATA_DIR = DATA_DIR;
  process.env.TMS_DATA_DIR = DATA_DIR;
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '0';
  process.env.SYNC_PORT = String(17800 + Math.floor(Math.random() * 2000));

  if (isPackaged) {
    const runtime = path.join(process.resourcesPath, 'runtime');
    if (fs.existsSync(runtime)) {
      process.env.PATH = [
        path.join(runtime, 'python'),
        path.join(runtime, 'tesseract'),
        process.env.PATH || '',
      ].join(path.delimiter);
      process.env.TMS_PYTHON_HOME = path.join(runtime, 'python');
    }
  }

  console.log(
    paths.portable
      ? `ChEng AIO portable data (USB): ${paths.root}`
      : `ChEng AIO data directory: ${DATA_DIR}`
  );

  /* Spawn ENOENT (missing python3 on Windows) must not take down the UI. */
  process.on('uncaughtException', (err) => {
    console.error('[desktop] uncaughtException:', err && err.stack ? err.stack : err);
  });
  process.on('unhandledRejection', (err) => {
    console.error('[desktop] unhandledRejection:', err && err.stack ? err.stack : err);
  });

  const { boot } = require('../server/index.js');
  const server = await boot();
  gateway = server;
  const addr = server.address();
  await createWindow(addr.port);
});

app.on('window-all-closed', () => {
  if (gateway) {
    try { gateway.close(); } catch { /* ignore */ }
  }
  app.quit();
});
