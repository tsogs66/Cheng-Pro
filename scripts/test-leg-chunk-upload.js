/*
 * The client half of the resumable leg upload.
 *
 * The behaviour over the wire is tested against a real server in
 * tests/test_resumable_upload.py. This file guards the decisions made on this
 * side, which no server test can see:
 *
 *   - the payload is split by BYTES, not characters. A leg is full of vessel
 *     names, degree signs and base64 scans; slicing by character would make the
 *     declared byte total disagree with what arrives, and would cut a multi-byte
 *     character into two invalid halves.
 *   - the server is ASKED which chunks it holds. Our own record of what we sent
 *     is not trusted: a chunk whose response was lost is on disk there and
 *     unconfirmed here, and believing ourselves would skip it for good.
 *   - the half-finished upload is remembered in IndexedDB, not in memory, so it
 *     survives the app being closed.
 *   - a small leg still goes in one request, and an older server still gets one.
 *
 * Run: node scripts/test-leg-chunk-upload.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/www/voyage_manager.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'modules/voyage/sync-server', 'server.py'), 'utf8');

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

const sb = { console, Math, Number, String, Array, Uint8Array, TextEncoder, TextDecoder };
vm.createContext(sb);
/* legUploadSessionKey reads the prefix constant, so it has to come across too. */
const PREFIX = (HTML.match(/const LEG_UPLOAD_SESSION_PREFIX = '[^']*';/) || [])[0];
if (!PREFIX) throw new Error('LEG_UPLOAD_SESSION_PREFIX not found');
vm.runInContext([PREFIX, extract('sliceUtf8'), extract('legUploadSessionKey')].join('\n'), sb);
const { sliceUtf8, legUploadSessionKey } = sb;

/* ---- splitting by bytes, across multi-byte characters ------------------- */

function roundTrip(text, chunkBytes) {
  const bytes = new TextEncoder().encode(text);
  const parts = sliceUtf8(bytes, chunkBytes);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { joined.set(p, at); at += p.length; }
  return {
    parts: parts.length,
    bytes: bytes.length,
    summed: total,
    same: new TextDecoder().decode(joined) === text,
    withinLimit: parts.every((p) => p.length <= chunkBytes),
  };
}

const ascii = roundTrip('abcdefghij'.repeat(10), 7);
check('plain text splits into the expected number of parts', ascii.parts, Math.ceil(100 / 7));
check('the parts sum to the byte length', ascii.summed, ascii.bytes);
check('and rebuild the original', ascii.same, true);

/* The case that matters: a cut landing inside a character. */
const mixed = roundTrip('aé€𝄞b'.repeat(40), 7);
check('a split inside a multi-byte character still rebuilds exactly', mixed.same, true);
check('the byte total is what the parts sum to, not the character count', mixed.summed, mixed.bytes);
check('no part exceeds the chunk size', mixed.withinLimit, true);
/* 'aé€𝄞b' is 1+2+3+4+1 = 11 bytes but 6 UTF-16 code units: a character-based
   split would have declared the wrong total to the server. */
check('bytes and characters really do differ here', mixed.bytes, 11 * 40);

check('a leg smaller than one chunk is a single part', roundTrip('short', 1024).parts, 1);
check('an exact multiple does not produce a trailing empty part',
  roundTrip('x'.repeat(64), 16).parts, 4);
check('an empty payload yields no parts', roundTrip('', 16).parts, 0);

/* ---- the session key is per leg, not per ship -------------------------- */
check('the session key names ship, voyage and condition',
  legUploadSessionKey('harbour-key', '41', 'L'), 'legUpload:harbour-key/41/L');
check('so two legs of one ship do not share a session',
  legUploadSessionKey('harbour-key', '41', 'L') === legUploadSessionKey('harbour-key', '41', 'B'), false);

/* ---- the decisions, asserted on the code ------------------------------- */

const upload = extract('uploadLegInChunks');

check('the server decides what has been received, not the client',
  /const have = new Set\(Array\.isArray\(session\.received\) \? session\.received : \[\]\);/.test(upload), true);
check('and the reason is written down',
  /the SERVER is asked which chunks it holds/.test(HTML), true);
check('a stored session is only reused when it describes this same leg',
  /stored\.digest === digest && stored\.digestAlgo === digestAlgo/.test(upload), true);
check('the session is written before any chunk goes up, so a crash is resumable',
  upload.indexOf('writeLegUploadSession') < upload.indexOf('for (let i = 0; i < chunks.length'), true);
check('and cleared only once the server has the whole leg',
  /if \(sessionKey\) await clearLegUploadSession\(sessionKey\);/.test(upload), true);
check('the session lives in IndexedDB, so it survives the app closing',
  /await dbPut\('meta', \{ key, value \}\)/.test(HTML), true);

check('a chunk is retried before the leg is given up', /LEG_UPLOAD_CHUNK_TRIES/.test(upload), true);
check('with a backoff rather than a hot loop', /1000 \* Math\.pow\(2, attempt - 1\)/.test(upload), true);
check('a retry sends a fresh view of the chunk',
  /body: chunks\[i\]\.slice\(\)/.test(upload), true);
check('and a failure tells the engineer the work is not lost',
  /already sent are kept on the server/.test(upload)
  && /continues from here rather than starting over/.test(upload), true);
check('progress is reported per chunk, which is what feeds the watchdog',
  /Uploading voyage leg: chunk \$\{sent\} of \$\{chunks\.length\}/.test(upload), true);

/* Only sha256 is declared; the server cannot check the FNV fallback. */
check('the digest algorithm is narrowed to what the server can verify',
  /const digestAlgo = algo === 'sha256' \? 'sha256' : 'none';/.test(upload), true);
check('and the reason that FNV is not offered is recorded on the server side',
  /exceeds 2\^53 in JavaScript/.test(SERVER), true);

/* ---- when chunking is used at all ------------------------------------- */

const syncNow = extract('syncNow');
check('a small leg still goes in one request',
  /if \(payloadBytes >= LEG_UPLOAD_MIN_BYTES\)\{/.test(syncNow), true);
check('an older server still gets the single PUT',
  /chunked = await serverSupportsResumableUpload\(base, headers\);/.test(syncNow), true);
check('the capability is read from health, not probed',
  /const cap = body && body\.resumableUpload;/.test(HTML), true);
check('and an unreadable health endpoint falls back rather than failing the sync',
  /return false;/.test(extract('serverSupportsResumableUpload')), true);
check('both paths end up merging the same way',
  /applyRemoteSnapshot\(merged, 'merge'\)/.test(syncNow), true);
check('the chunk size is a named constant, not a literal in the loop',
  /const LEG_UPLOAD_CHUNK_BYTES = 256 \* 1024;/.test(HTML), true);

/* ---- the server agrees about the shape of all this -------------------- */
check('the server advertises the capability on health',
  /"resumableUpload": \{/.test(SERVER), true);
check('it assembles only after verifying the digest',
  SERVER.indexOf('does not match the digest the ship declared') < SERVER.indexOf('def prune_stale_uploads'), true);
check('a chunked leg is merged by the same code as a whole one',
  /merged = self\._merge_leg\(vessel_part, voyage, condition, path, incoming\)/.test(SERVER), true);
check('and the staging folder cannot be read as a voyage',
  /if voyage_number\.startswith\("\."\):/.test(SERVER), true);

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
