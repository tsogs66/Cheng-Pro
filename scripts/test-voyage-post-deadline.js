/**
 * A long job is not a hung one.
 *
 * "Update to the newest of both" looked stuck at "uploading voyage leg to the
 * server" after exactly ten minutes. It was not stuck: voyagePost took a flat
 * timeout and that caller passed 600000, so at ten minutes a job that was
 * still working was abandoned with "Voyage Chief did not respond".
 *
 * Ten minutes is not long for a few legs carrying scanned requisitions over a
 * ship's connection — each leg is a full download, a full merge and a full
 * upload. So the deadline now measures SILENCE: while the module keeps
 * reporting progress the job is left alone, and only a module that has gone
 * quiet for the whole window is declared dead.
 *
 * Run: node scripts/test-voyage-post-deadline.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'apps/web/js/modules/backup.js'), 'utf8');
const VOY = fs.readFileSync(path.join(ROOT, 'modules/voyage/www/voyage_manager.html'), 'utf8');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

/* ---- the deadline is a heartbeat, not a stopwatch ----------------------- */

check('the flat setTimeout rejection is gone',
  /setTimeout\(\(\) => \{\s*if \(!pendingVoyage\[requestId\]\) return;\s*delete pendingVoyage\[requestId\];\s*reject/.test(SRC), false);
check('a progress message records proof of life',
  /voyageLastProgressAt = Date\.now\(\);/.test(SRC), true);
check('the deadline is measured from the last sign of life',
  /const quietFor = Date\.now\(\) - Math\.max\(voyageLastProgressAt, startedAt\);/.test(SRC), true);
check('and only silence fails',
  /if \(quietFor < quietMs\) return;/.test(SRC), true);
check('the message says it stopped reporting, not that it did not respond',
  /stopped reporting progress for/.test(SRC), true);
check('and tells the engineer the uploaded work is not lost',
  /running this again picks up where it left off/.test(SRC), true);
check('the watchdog is cleared when the job finishes',
  (SRC.match(/if \(job\.done\) job\.done\(\);/g) || []).length >= 1
  && /const \{ resolve, reject, done \} = pendingVoyage/.test(SRC), true);

/* Run the deadline logic for real, with a clock we control. */
function runDeadline({ quietMs, progressAt, elapsed }) {
  /* Mirrors the check in voyagePost's interval. */
  const startedAt = 0;
  const now = elapsed;
  const last = progressAt == null ? 0 : progressAt;
  const quietFor = now - Math.max(last, startedAt);
  return quietFor >= quietMs ? 'rejected' : 'waiting';
}

const TEN_MIN = 600000;
check('a job reporting progress is left alone well past ten minutes',
  runDeadline({ quietMs: TEN_MIN, progressAt: 3000000, elapsed: 3000001 }), 'waiting');
check('a job silent for under the window is left alone',
  runDeadline({ quietMs: TEN_MIN, progressAt: 1000000, elapsed: 1500000 }), 'waiting');
check('a job silent for the whole window is rejected',
  runDeadline({ quietMs: TEN_MIN, progressAt: 1000000, elapsed: 1600000 }), 'rejected');
check('a job that never reported anything is rejected after the window',
  runDeadline({ quietMs: TEN_MIN, progressAt: 0, elapsed: TEN_MIN + 1 }), 'rejected');
check('and not before it',
  runDeadline({ quietMs: TEN_MIN, progressAt: 0, elapsed: TEN_MIN - 1 }), 'waiting');
/* The case that was failing: an hour of steady work. */
check('an hour of steady progress never trips the deadline',
  (() => {
    let state = 'waiting';
    for (let t = 0; t <= 3600000; t += 30000) {
      state = runDeadline({ quietMs: TEN_MIN, progressAt: t, elapsed: t + 1 });
      if (state !== 'waiting') return 'rejected at ' + t;
    }
    return state;
  })(), 'waiting');

/* ---- and the work itself got smaller ----------------------------------- */

/**
 * A function body, found by skipping the parameter list first.
 *
 * Starting the brace count at the first '{' after the name lands inside a
 * default parameter -- `syncNow(options = {})` -- and the count then closes
 * on the parameter's own brace, returning a stub. Find the ')' that ends the
 * parameters, then the '{' after it.
 */
function bodyOf(src, decl) {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(decl + ' not found');
  let i = src.indexOf('(', start);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  i = src.indexOf('{', i);
  const bodyStart = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + '/*bodyStart:' + bodyStart + '*/';
}

const reconcile = bodyOf(VOY, 'async function reconcileVoyageLegs');
const reconcileCode = reconcile.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/* The per-leg loop ends at the outer finally. What follows files the voyage
   that was open, once, after every leg has been synced. */
const reconcileLoop = reconcileCode.split('} finally {')[0];

check('reconcile still syncs each leg', /await syncNow\(\{ policy: 'merge' \}\)/.test(reconcileCode), true);
/* syncNow archives the active leg before returning, so the archive that used
   to follow it rewrote the whole leg to IndexedDB a second time — megabytes
   per leg, for nothing. The one archive after the loop files the restored
   open voyage, which syncNow has already left. */
check('but no longer archives each leg a second time',
  /await archiveActiveVoyageLeg\(\);/.test(reconcileLoop), false);
check('the restored open voyage is filed once when the sync ends',
  /await activateVoyageLeg\(state\.activeVesselId, prevVn, prevCond\);[\s\S]*?await archiveActiveVoyageLeg\(\);/.test(reconcileCode), true);
check('syncNow is still the one doing the archiving',
  /await archiveActiveVoyageLeg\(\);/.test(bodyOf(VOY, 'async function syncNow')), true);
check('and progress is still reported per leg, which is what feeds the heartbeat',
  /updateActivity\('reconcile-legs', \{/.test(reconcileCode), true);

/* The heartbeat only works if the module really posts upward. */
check('every activity update is posted to the shell',
  /postBackupActivity\(top\);/.test(VOY), true);
check('and reconcile-legs is one of the ids that gets posted',
  /'reconcile-legs': true/.test(VOY), true);
check('as is the sync inside it',
  /'sync': true/.test(VOY), true);

console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
