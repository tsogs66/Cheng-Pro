#!/usr/bin/env node
'use strict';
/* A ship with no vessel yet has an empty register. Reading it used to refresh the list whenever it
   was empty; every refresh announces a change, the shell redrew Vessel Setup in answer, and Vessel
   Setup read the list again - hundreds of redraws a second, the name box torn out from under the
   keyboard and the More sheet shut as fast as it opened. The register is now read once. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps/web/js/bridge.js'), 'utf8');
let reads = 0;
const win = {
  ChengProApi: {
    api: async () => { reads += 1; return { vessels: [], activeVesselId: '' }; },
    getActiveId: () => '', setActiveId: () => {},
  },
  localStorage: { setItem() {}, removeItem() {}, getItem() { return null; } },
  dispatchEvent() {}, CustomEvent: function () {},
};
win.window = win;
win.document = { querySelectorAll: () => [] };
vm.createContext(win);
vm.runInContext(src, win);

(async () => {
  let emits = 0;
  win.ChengPro.vessel.subscribe(() => { emits += 1; });
  for (let i = 0; i < 6; i++) await win.ChengPro.vessel.list();
  assert.strictEqual(reads, 1, 'an empty register is read once, not on every call');
  assert.strictEqual(emits, 1, 'and announced once');
  await win.ChengPro.vessel.refresh();
  assert.strictEqual(reads, 2, 'an explicit refresh still reads it');

  /* A read that fails is not retried in a tight loop either. */
  reads = 0;
  const failing = { ...win, ChengProApi: { ...win.ChengProApi, api: async () => { reads += 1; throw new Error('offline'); } } };
  failing.window = failing;
  vm.createContext(failing);
  vm.runInContext(src, failing);
  const warn = console.warn; console.warn = () => {};
  for (let i = 0; i < 6; i++) await failing.ChengPro.vessel.list();
  console.warn = warn;
  assert.strictEqual(reads, 1, 'a failed read waits before trying again');
  console.log('vessel list loop ok');
})().catch((e) => { console.error(e); process.exit(1); });
