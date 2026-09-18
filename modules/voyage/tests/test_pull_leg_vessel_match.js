/*
 * Pull-voyage-leg must map a sync slug to the matching registry ship —
 * never whichever hull is still active in the hidden AIO Backup frame.
 *
 * Regression: Backup typed vesselId=mv-flag-evi while the Voyage iframe still
 * had M/V HARBOUR KEY active. vesselOwnSyncSlug(active) returned the form
 * slug, so ensureLocalVesselForSyncSlug "matched" Harbour Key and archived
 * Flag Evi's leg under the wrong ship.
 *
 * Run: node tests/test_pull_leg_vessel_match.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'www', 'voyage_manager.html'), 'utf8');

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `: expected ${expected}, got ${actual}`}`);
  if (!ok) failures += 1;
}

function extractFunction(name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const start = HTML.search(re);
  if (start < 0) throw new Error('missing function ' + name);
  let i = HTML.indexOf('{', start);
  let depth = 0;
  for (; i < HTML.length; i += 1) {
    const ch = HTML[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return HTML.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

const ensureSrc = extractFunction('ensureLocalVesselForSyncSlug');
check('ensure does not call vesselOwnSyncSlug', /vesselOwnSyncSlug\s*\(/.test(ensureSrc), false);
check('ensure uses registry-only slug helper', ensureSrc.includes('vesselRegistrySyncSlug'), true);
check('ensure strips IMO from name cores', ensureSrc.includes('syncSlugCoreWithoutImo'), true);

const helpers = [
  extractFunction('sanitizeSyncSlug'),
  extractFunction('syncSlugCore'),
  extractFunction('syncSlugsMatch'),
  extractFunction('vesselSlugFromName'),
  extractFunction('vesselRegistrySyncSlug'),
  extractFunction('syncSlugCoreWithoutImo'),
].join('\n');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(helpers, sandbox);

/* Pure matcher mirroring ensureLocalVesselForSyncSlug's find predicate. */
vm.runInContext(`
function matchLocalVesselForSyncSlug(asked, vessels) {
  const raw = String(asked || '').trim();
  if (!raw) return null;
  const slug = sanitizeSyncSlug(raw);
  const core = syncSlugCore(raw);
  const coreLoose = syncSlugCoreWithoutImo(raw);
  return (vessels || []).find((v) => {
    if (!v) return false;
    if (v.id === raw || v.id === slug) return true;
    const reg = vesselRegistrySyncSlug(v);
    if (reg && (reg === slug || syncSlugsMatch(reg, raw))) return true;
    if (syncSlugsMatch(v.slug, raw)) return true;
    const nameCore = syncSlugCore(vesselSlugFromName(v.name || ''));
    if (nameCore === core) return true;
    if (syncSlugCoreWithoutImo(nameCore) === coreLoose) return true;
    return false;
  }) || null;
}
`, sandbox);

const harbour = { id: 'v-harbourkey', name: 'M/V HARBOUR KEY', slug: 'mv-harbour-key' };
const flagEvi = { id: 'v-flagevi', name: 'M/V Flag Evi - 9619799', slug: 'mv-flag-evi' };
const flagEviNameOnly = { id: 'v-flagevi2', name: 'M/V Flag Evi - 9619799', slug: '' };

check(
  'harbour key is not a false match for mv-flag-evi',
  sandbox.matchLocalVesselForSyncSlug('mv-flag-evi', [harbour]),
  null
);
check(
  'flag evi registry slug wins',
  sandbox.matchLocalVesselForSyncSlug('mv-flag-evi', [harbour, flagEvi])?.id,
  'v-flagevi'
);
check(
  'flag evi name+IMO matches bare core',
  sandbox.matchLocalVesselForSyncSlug('flag-evi', [harbour, flagEviNameOnly])?.id,
  'v-flagevi2'
);
check(
  'm-v- alias matches flag evi slug',
  sandbox.matchLocalVesselForSyncSlug('m-v-flag-evi', [flagEvi])?.id,
  'v-flagevi'
);

if (failures) {
  console.error(`\nFAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`\nok — ${checks} checks`);
