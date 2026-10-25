/*
 * An https page cannot call an http server, and saying so beats guessing.
 *
 * A ship reported "error in uploading voyage leg -- http mixed content error".
 * Nothing was wrong with the leg or with the server: the app was open over
 * https and the Sync Server URL was a plain http LAN address, so the browser
 * refused the request before it left the machine. The message put mixed content
 * third in a list of three guesses -- "check the URL, HTTPS mixed-content, and
 * that voyage-sync/nginx are running" -- which reads as a fault at the far end,
 * and sent the engineer to a server that was running perfectly.
 *
 * It is decidable without asking the network anything, so it is decided before
 * the pull, the merge and the upload rather than part-way through them.
 *
 * The cases that must NOT be blocked matter as much as the ones that must: an
 * over-eager check would stop syncs that work today, on the AIO shell, on a LAN
 * install, and in the Android app, whose capacitor.config.json sets
 * allowMixedContent precisely so the WebView may call an http server.
 *
 * Run: node scripts/test-sync-mixed-content.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/voyage_manager.html'), 'utf8');
/* Voyage Chief runs inside the ChEng AIO shell here, so it is the AIO app's own
   Capacitor config that decides whether its WebView may call an http server. */
const CAP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'capacitor.config.json'), 'utf8'));

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

function extract(name) {
  const start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let i = HTML.indexOf('(', start), paren = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '(') paren++;
    else if (HTML[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  i = HTML.indexOf('{', i);
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(start, i + 1);
}

/* The real URL parser, the real predicate, a page location we control. */
function probe({ page, target, capacitor }) {
  const sb = {
    console, URL, String, Error,
    APP_NAME: 'Voyage Chief',
    location: { href: page, origin: new URL(page).origin, protocol: new URL(page).protocol },
    window: { Capacitor: capacitor || undefined },
  };
  vm.createContext(sb);
  vm.runInContext(extract('syncMixedContentProblem') + '\n'
    + extract('assertSyncUrlUsable'), sb);
  return { msg: sb.syncMixedContentProblem(target), assert: sb.assertSyncUrlUsable };
}

const blocked = (o) => probe(o).msg !== '';

/* ---- the reported case ------------------------------------------------- */

check('https app, http LAN sync server is blocked',
  blocked({ page: 'https://voyage.example.com/voyage_manager.html', target: 'http://192.168.1.50:8080' }), true);
check('a hostname rather than an IP is no different',
  blocked({ page: 'https://voyage.example.com/', target: 'http://ship-nas:8080' }), true);

/* And the message has to be usable, not just correct. */
const msg = probe({ page: 'https://voyage.example.com/', target: 'http://192.168.1.50:8080' }).msg;
check('it names both sides, so there is nothing to guess',
  /https:\/\/voyage\.example\.com/.test(msg) && /http:\/\/192\.168\.1\.50:8080/.test(msg), true);
check('it says the request never leaves the machine',
  /leaves this machine/.test(msg), true);
check('and that retrying cannot help',
  /no amount of retrying/.test(msg), true);
check('it offers the three ways out',
  /open this app over http/.test(msg) && /certificate/.test(msg) && /Android app/.test(msg), true);
check('and covers the case where the downgrade is a redirect',
  /redirecting to http/.test(msg), true);

/* ---- what must NOT be blocked ----------------------------------------- */

check('an http page calling an http server is fine',
  blocked({ page: 'http://192.168.1.10:3080/voyage_manager.html', target: 'http://192.168.1.50:8080' }), false);
check('https to https is fine',
  blocked({ page: 'https://voyage.example.com/', target: 'https://sync.example.com' }), false);
check('http page to an https server is fine (an upgrade, not a downgrade)',
  blocked({ page: 'http://192.168.1.10:3080/', target: 'https://sync.example.com' }), false);

/* Browsers treat loopback as potentially trustworthy, so these work today. */
check('https page to http://localhost is allowed',
  blocked({ page: 'https://localhost/', target: 'http://localhost:8080' }), false);
check('and to 127.0.0.1',
  blocked({ page: 'https://localhost/', target: 'http://127.0.0.1:8080' }), false);
check('and to the IPv6 loopback',
  blocked({ page: 'https://localhost/', target: 'http://[::1]:8080' }), false);

/* The Android app is served from https://localhost but is allowed cleartext.
   Blocking it would break a sync that works. */
check('the ChEng AIO app still sets allowMixedContent',
  CAP.android && CAP.android.allowMixedContent, true);
check('and its WebView is served over https, which is why this matters',
  CAP.server && CAP.server.androidScheme, 'https');
check('so a native Capacitor platform is not blocked',
  blocked({
    page: 'https://localhost/voyage_manager.html',
    target: 'http://192.168.1.50:8080',
    capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  }), false);
check('Capacitor running as plain web still is blocked',
  blocked({
    page: 'https://voyage.example.com/',
    target: 'http://192.168.1.50:8080',
    capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  }), true);

/* ---- rubbish in must not throw ---------------------------------------- */

check('an unparseable URL is not reported as mixed content',
  blocked({ page: 'https://voyage.example.com/', target: 'not a url' }), false);
check('an empty URL likewise',
  blocked({ page: 'https://voyage.example.com/', target: '' }), false);

/* ---- it refuses, rather than returning a string nobody reads ---------- */

const { assert } = probe({ page: 'https://voyage.example.com/', target: 'x' });
let threw = null;
try { assert('http://192.168.1.50:8080'); } catch (e) { threw = e.message; }
check('assertSyncUrlUsable throws on the blocked combination', /leaves this machine/.test(threw || ''), true);
check('and passes a usable one through', assert('https://sync.example.com'), 'https://sync.example.com');

/* ---- wiring ------------------------------------------------------------ */

check('syncNow decides before the pull, the merge and the upload',
  /if \(!base\) throw new Error\('Enter a Sync Server URL on the Setup tab first\.'\);[\s\S]{0,400}?assertSyncUrlUsable\(base\);/.test(HTML), true);
check('and every sync request is checked, whoever makes it',
  /const blocked = syncMixedContentProblem\(url\);\s*\n\s*if \(blocked\) throw new Error\(blocked\);/.test(HTML), true);
check('the check comes before the fetch, not after it fails',
  HTML.indexOf('const blocked = syncMixedContentProblem(url);')
    < HTML.indexOf('res = await fetch(url, opts);'), true);
check('a Failed-to-fetch on https now mentions the redirect case',
  /answered with a redirect to plain http/.test(HTML), true);
check('and the old three-guess sentence is gone',
  /Check the URL, HTTPS mixed-content, and that voyage-sync\/nginx are running/.test(HTML), false);
check('the Setup field warns as the URL is typed',
  /id="syncUrlSchemeWarn"/.test(HTML)
  && /el\.addEventListener\('input', renderSyncUrlSchemeWarning\)/.test(HTML), true);

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
