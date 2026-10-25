/**
 * One record per hull.
 *
 * matchVesselForImport decides whether an incoming vessel is one this database
 * already holds. It used to look at the id and the slug and nothing else — the
 * IMO was never consulted, even though every payload carries one. So "Save &
 * connect" on a ship already in the list wrote a SECOND record of the same hull
 * whenever the slug differed: a name typed differently, a row that came from
 * the other program, a local record older than slugs. The engineer then picked
 * between two copies of his own ship on every page that names a vessel.
 *
 * The rule here is the suite's own, the one ChengVesselKey.sameVessel applies
 * on the Tank side, so the two programs agree about what "the same ship" means:
 *
 *   - an explicit id wins outright
 *   - otherwise the IMO decides whenever both sides have one, and a mismatch
 *     is a NO even when the names are identical — two ships do share names
 *   - only a record with no IMO of its own may be matched on slug or name
 *
 * Run: node scripts/test-vessel-import-match.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'modules/voyage/www/voyage_manager.html'), 'utf8');

let fails = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? `  ok   ${label}` : `  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) fails += 1;
}

function extract(name) {
  let start = HTML.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const asyncAt = HTML.lastIndexOf('async ', start);
  if (asyncAt >= 0 && asyncAt + 'async '.length === start) start = asyncAt;
  let depth = 0, i = HTML.indexOf('{', start);
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(start, i + 1);
}

/* A fake database: vessels plus their setup rows, which is where the IMO is. */
function makeSandbox(vessels, imoByVesselId) {
  const meta = Object.entries(imoByVesselId || {}).map(([id, imo]) => ({
    key: 'setup:' + id, value: { imoNo: imo },
  }));
  const sb = {
    console, Map, String, Number, Object, Array, Promise,
    state: { vessels: vessels.slice() },
    dbGetAll: async (store) => (store === 'meta' ? meta : []),
  };
  vm.createContext(sb);
  vm.runInContext([
    extract('normalizeImoForAio'),
    extract('normalizeVesselNameForAio'),
    extract('vesselImoById'),
    extract('matchVesselForImport'),
  ].join('\n'), sb);
  return sb;
}

const FLEET = [
  { id: 'v1', name: 'MV Harbour Key', slug: 'harbour-key' },
  { id: 'v2', name: 'MV Relief Test', slug: 'relief-test' },
  { id: 'v3', name: 'MV No Imo', slug: 'no-imo' },
];
const IMOS = { v1: '9876543', v2: '9123456' };   /* v3 deliberately has none */

const payload = (vessel, setup) => ({ vessel: vessel || {}, setup: setup || {} });

(async () => {
  let sb = makeSandbox(FLEET, IMOS);
  const match = async (p) => {
    const hit = await sb.matchVesselForImport(p);
    return hit ? hit.id : null;
  };

  /* ---- the reported bug ------------------------------------------------- */
  /* Same hull, different slug. This is the case that duplicated the ship. */
  check('same IMO but a different slug matches the existing ship',
    await match(payload({ name: 'HARBOUR KEY', slug: 'harbour_key_2', imo: '9876543' })), 'v1');
  check('same IMO written with the IMO prefix still matches',
    await match(payload({ name: 'Harbour Key', slug: 'whatever', imo: 'IMO 9876543' })), 'v1');
  check('the IMO may arrive on the setup row instead',
    await match(payload({ name: 'Harbour Key', slug: 'whatever' }, { imoNo: '9876543' })), 'v1');
  check('and a name typed differently does not matter once the IMO agrees',
    await match(payload({ name: 'M/V  harbour   key', imo: '9876543' })), 'v1');

  /* ---- an explicit id still wins --------------------------------------- */
  check('an explicit id wins outright',
    await match(payload({ id: 'v2', name: 'Anything', imo: '9876543' })), 'v2');

  /* ---- two ships that share a name must NOT be merged ------------------ */
  /* The dangerous direction: merging two hulls would mix one ship's records
     into another's, which is worse than a duplicate. */
  check('a different IMO is a different ship even with the same name',
    await match(payload({ name: 'MV Harbour Key', slug: 'harbour-key', imo: '5555555' })), null);
  check('and the same goes when only the slug agrees',
    await match(payload({ name: 'Something Else', slug: 'harbour-key', imo: '5555555' })), null);

  /* ---- a local record with no IMO can still be claimed by name/slug ---- */
  check('an incoming hull matches a local record that has no IMO, by slug',
    await match(payload({ name: 'Whatever', slug: 'no-imo', imo: '7777777' })), 'v3');
  check('and by name',
    await match(payload({ name: 'MV No Imo', imo: '7777777' })), 'v3');

  /* ---- no IMO on the incoming record ---------------------------------- */
  check('with no IMO at all, the slug matches', await match(payload({ slug: 'relief-test' })), 'v2');
  check('with no IMO at all, the name matches', await match(payload({ name: 'relief test' })), 'v2');
  check('a genuinely new ship is new', await match(payload({ name: 'MV Brand New', slug: 'brand-new' })), null);
  check('an empty payload matches nothing', await match(payload()), null);

  /* ---- name normalisation --------------------------------------------- */
  check('the M/V prefix is ignored', sb.normalizeVesselNameForAio('M/V Harbour Key'), 'harbour key');
  check('so is MV with no punctuation', sb.normalizeVesselNameForAio('MV  Harbour  Key'), 'harbour key');
  check('letters and the IMO prefix are stripped', sb.normalizeImoForAio('IMO 9876543'), '9876543');
  /* Worth stating plainly: this normaliser keeps whatever digits it finds,
     where the shell's ChengVesselKey.normalizeImo returns '' unless there are
     exactly seven. The voyage side is therefore the more willing to call two
     records the same hull, which errs towards matching rather than towards a
     duplicate -- the right way round for this bug. A short IMO is a typo in
     one of the two books, and matching a typo to itself is what keeps the
     ship from going missing from the library. */
  check('a short number is kept rather than discarded', sb.normalizeImoForAio('123456'), '123456');
  check('and nothing at all gives nothing', sb.normalizeImoForAio(''), '');

  /* ---- the IMO index reads setup rows --------------------------------- */
  const imos = await sb.vesselImoById();
  check('every vessel with a setup IMO is indexed', [imos.get('v1'), imos.get('v2')], ['9876543', '9123456']);
  check('and one without is absent', imos.has('v3'), false);

  /* An empty fleet must not throw. */
  sb = makeSandbox([], {});
  check('an empty database matches nothing', await sb.matchVesselForImport(payload({ imo: '9876543' })), null);

  /* ---- callers must await it now --------------------------------------- */
  check('importVesselExport awaits the match',
    /let target = await matchVesselForImport\(payload\);/.test(HTML), true);
  check('the import prompt awaits it',
    /const existing = await matchVesselForImport\(payload\);/.test(HTML), true);
  check('and its own caller awaits the prompt',
    /const mode = await promptVesselImportMode\(payload, fileName\);/.test(HTML), true);
  check('the bridge reports whether it matched rather than always "imported"',
    /matched: !!res\.replacing/.test(HTML), true);

  const backup = fs.readFileSync(path.join(ROOT, 'apps/web/js/modules/backup.js'), 'utf8');
  check('and the backup page says which it was',
    /voyRes && voyRes\.matched/.test(backup), true);

  console.log(fails ? `\nFAILED — ${fails} of ${checks} checks` : `\nPASSED — ${checks} checks`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
