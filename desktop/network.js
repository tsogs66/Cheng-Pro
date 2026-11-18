/**
 * Windows Firewall for live sync.
 *
 * Another device can only reach this PC when Windows lets the connection in. The first-run prompt is easy to dismiss
 * or answer for the wrong network type (a hotspot or a ship Wi-Fi is often "Public"), after which every phone gets
 * "nothing answered". One button adds an inbound rule for the two live-sync ports on every network profile; Windows
 * asks once for permission (UAC) because changing the firewall needs it.
 */
'use strict';

const { execFile } = require('child_process');

const RULE = 'ChEng AIO live sync';

function run(file, args, opts) {
  return new Promise((resolve) => {
    execFile(file, args, Object.assign({ windowsHide: true, timeout: 60000 }, opts || {}), (err, stdout, stderr) => {
      resolve({ err, out: String(stdout || ''), errText: String(stderr || '') });
    });
  });
}

const portOk = (p) => Number.isInteger(p) && p > 0 && p < 65536;

/** @returns {Promise<{ok:boolean, message:string}>} */
async function status() {
  if (process.platform !== 'win32') return { ok: true, message: 'Not needed on this system.' };
  const r = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${RULE}`]);
  const has = !r.err && /Enabled:\s+Yes/i.test(r.out);
  return { ok: has, message: has ? 'Windows Firewall already allows live sync.' : 'Windows Firewall does not allow live sync yet.' };
}

/** @param {number[]} ports TCP and UDP ports live sync listens on */
async function allowLiveSync(ports) {
  if (process.platform !== 'win32') return { ok: true, message: 'Not needed on this system.' };
  const list = (Array.isArray(ports) ? ports : []).map(Number).filter(portOk);
  if (!list.length) return { ok: false, message: 'No port to allow.' };
  const joined = Array.from(new Set(list)).join(',');
  /* One elevated PowerShell removes any old rule and adds the new ones (TCP for sync, UDP for finding devices). */
  const inner = [
    `netsh advfirewall firewall delete rule name='${RULE}' | Out-Null`,
    `netsh advfirewall firewall add rule name='${RULE}' dir=in action=allow protocol=TCP localport=${joined} profile=any | Out-Null`,
    `netsh advfirewall firewall add rule name='${RULE}' dir=in action=allow protocol=UDP localport=${joined} profile=any | Out-Null`,
  ].join('; ');
  const cmd = `Start-Process -FilePath powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-Command',"${inner.replace(/"/g, '\\"')}"`;
  const r = await run('powershell', ['-NoProfile', '-Command', cmd]);
  if (r.err && /cancel|denied|1223/i.test(r.errText + (r.err.message || ''))) {
    return { ok: false, message: 'You answered No to the Windows prompt, so nothing was changed. Press the button again and answer Yes.' };
  }
  const s = await status();
  return s.ok
    ? { ok: true, message: 'Done: Windows Firewall now allows other devices to reach this PC for live sync.' }
    : { ok: false, message: 'Windows did not accept the change. Run ChEng AIO as administrator once, or allow it in Windows Security > Firewall > Allow an app.' };
}

module.exports = { status, allowLiveSync, RULE };
