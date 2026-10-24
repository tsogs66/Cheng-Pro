/**
 * A suite backup handed to Android in one JavascriptInterface call is bigger
 * than the Binder limit, and the WebView process dies. The page must split
 * the file, and the activity must accept those pieces.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const copies = [
  'apps/web/js/save-file.js',
  'modules/voyage/www/save-file.js',
  'modules/tanks/public/js/save-file.js',
].map((rel) => path.join(ROOT, rel));

const first = fs.readFileSync(copies[0], 'utf8');
for (const file of copies.slice(1)) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), first, path.basename(file) + ' drifted from the shell save-file.js');
}
assert(/beginSave/.test(first) && /appendSaveChunk/.test(first) && /finishSave/.test(first),
  'save-file.js must write Android backups in pieces');
assert(/NATIVE_CHUNK = 200000/.test(first), 'chunk size must stay under the Binder limit');

const bridgeSrc = fs.readFileSync(path.join(ROOT, 'scripts/apply-android-print-bridge.js'), 'utf8');
for (const name of ['beginSave', 'appendSaveChunk', 'finishSave', 'saveText', 'abandonPending']) {
  assert(bridgeSrc.includes(name), 'Android file bridge is missing ' + name);
}
assert(/pendingOut\.write\(chunk\.getBytes/.test(bridgeSrc),
  'chunks must be written as they arrive, not buffered into one string');

function loadSaver(bridge) {
  const window = {
    ChengAndroidFiles: bridge,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile' },
    addEventListener() {},
    removeEventListener() {},
  };
  window.window = window;
  vm.runInNewContext(first, {
    window,
    globalThis: window,
    console,
    Blob: globalThis.Blob,
  });
  return window.ChengSaveFile;
}

(async () => {
  const chunks = [];
  let saveTextCalls = 0;
  const saver = loadSaver({
    beginSave(name, mime, len) {
      assert.strictEqual(name, 'cheng-aio-suite-1.json');
      assert.strictEqual(mime, 'application/json');
      assert.ok(len > 200000);
      return 'ok';
    },
    appendSaveChunk(part) { chunks.push(part); },
    finishSave() { return 'Downloads/ChEngAIO/cheng-aio-suite-1.json'; },
    saveText() { saveTextCalls += 1; return 'should-not-run'; },
  });

  /* The emoji sits on a 200000 boundary so a naive slice would split it. */
  const text = 'A'.repeat(199999) + '\uD83D\uDE00' + 'B'.repeat(50000);
  const saved = await saver.saveJson('cheng-aio-suite-1.json', text);
  assert.strictEqual(saved.method, 'native');
  assert.strictEqual(saved.where, 'Downloads/ChEngAIO/cheng-aio-suite-1.json');
  assert.strictEqual(saveTextCalls, 0, 'a large backup must not cross the bridge in one call');
  assert.strictEqual(chunks.join(''), text);
  assert.ok(chunks.length >= 2);
  for (const part of chunks) {
    assert.ok(part.length <= 200000, 'chunk longer than 200000');
    const tail = part.charCodeAt(part.length - 1);
    assert.ok(!(tail >= 0xD800 && tail <= 0xDBFF), 'chunk ended on half a character');
  }

  const legacy = [];
  const oldSaver = loadSaver({
    saveText(name, body) {
      legacy.push(body);
      return 'Downloads/ChEngAIO/' + name;
    },
  });
  const small = await oldSaver.saveJson('note.json', '{"ok":true}');
  assert.strictEqual(small.method, 'native');
  assert.strictEqual(legacy.length, 1);
  assert.strictEqual(legacy[0], '{"ok":true}');

  let finished = 0;
  const failing = loadSaver({
    beginSave() { return 'ok'; },
    appendSaveChunk() {},
    finishSave() { finished += 1; return ''; },
    saveText() { throw new Error('must not fall through to one-shot save'); },
  });
  await assert.rejects(
    () => failing.saveJson('cheng-aio-suite-2.json', '{"tank":1}'),
    /Could not write the backup/
  );
  assert.strictEqual(finished, 1);

  console.log('ok — Android backup is written in pieces under the Binder limit');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
