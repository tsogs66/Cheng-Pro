/**
 * Guard: Electron must never call showSaveFilePicker (renderer crash on write).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const files = [
  path.join(__dirname, '..', 'apps', 'web', 'js', 'save-file.js'),
  path.join(__dirname, '..', 'modules', 'voyage', 'www', 'save-file.js'),
  path.join(__dirname, '..', 'modules', 'tanks', 'public', 'js', 'save-file.js'),
  path.join(__dirname, '..', 'desktop', 'preload.js'),
  path.join(__dirname, '..', 'desktop', 'main.js'),
];

for (const f of files) {
  assert(fs.existsSync(f), 'missing ' + f);
  const src = fs.readFileSync(f, 'utf8');
  if (f.endsWith('save-file.js')) {
    assert(/isElectron/.test(src), f + ' must detect Electron');
    assert(/ChengDesktopFiles/.test(src), f + ' must use ChengDesktopFiles');
    assert(/if \(isElectron\(\)\) return null/.test(src), f + ' must skip picker on Electron');
  }
  if (f.endsWith('preload.js')) {
    assert(/cheng-save-text/.test(src), 'preload must invoke cheng-save-text');
  }
  if (f.endsWith('main.js')) {
    assert(/preload\.js/.test(src), 'desktop main must load preload');
    assert(/ipcMain\.handle\(\s*['"]cheng-save-text['"]/.test(src), 'main must handle cheng-save-text');
    assert(/showSaveDialog/.test(src), 'main must use showSaveDialog');
  }
}

console.log('ok — Electron export path avoids File System Access picker');
