/**
 * Cheng-Pro desktop (Electron).
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isPackaged = app.isPackaged;

function resolveDataDir() {
  if (process.env.CHENG_PRO_PORTABLE === '1' || process.env.PORTABLE_EXECUTABLE_DIR) {
    const base = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
    return path.join(base, 'cheng-pro-data');
  }
  return path.join(app.getPath('userData'), 'data');
}

let mainWindow = null;
let gateway = null;

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Cheng-Pro',
    backgroundColor: '#07141a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  const DATA_DIR = resolveDataDir();
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
