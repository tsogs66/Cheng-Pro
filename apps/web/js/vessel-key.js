/**
 * One ship, one identity — across Tank Chief, Voyage Chief and the server.
 *
 * The same vessel is written down differently in every place it appears:
 * "MV CAPTAIN VENIAMIS" in a Tank database, "M/V Captain Veniamis" in a
 * Voyage setup, "Captain  Veniamis" where somebody double-tapped the space
 * bar. Matching those by string equality gives one ship three entries in the
 * library and three separate pulls, which is the thing this exists to stop.
 *
 * Two ships are the same when their IMO numbers agree. IMO is the only
 * identifier a ship carries for life — it survives renaming and reflagging,
 * which a name does not — so it wins whenever both sides have one. Names are
 * the fallback, because plenty of tank books are filled in without an IMO.
 *
 * Deliberately not clever: no fuzzy distance, no phonetics. A near-miss that
 * silently merges two different ships would put one vessel's soundings under
 * another's name on a signed sheet. Everything here is exact comparison after
 * normalisation, so a disagreement leaves two rows rather than one wrong one.
 */
(function (root) {
  'use strict';

  /* Vessel-type prefixes that are a description, not part of the name. Written
     with and without the separators crews actually use. */
  const PREFIXES = [
    'MV', 'M V', 'M/V', 'M.V', 'M.V.',
    'MT', 'M T', 'M/T', 'M.T', 'M.T.',
    'MS', 'M S', 'M/S', 'M.S', 'M.S.',
    'SS', 'S S', 'S/S', 'S.S', 'S.S.',
    'MSV', 'MOTOR VESSEL', 'MOTOR TANKER',
  ];

  /**
   * A vessel name reduced to what identifies it.
   *
   * Upper-cased, punctuation that only ever decorates a name removed, runs of
   * whitespace collapsed, and any leading vessel-type prefix dropped. Returns
   * '' for anything that is not a usable name, which callers must treat as
   * "cannot match on name" rather than as a key.
   */
  function normalizeName(raw) {
    let s = String(raw == null ? '' : raw);
    if (!s.trim()) return '';
    s = s.toUpperCase();
    /* Separators and decoration → space. Keeps letters, digits and spaces. */
    s = s.replace(/[._\-/\\,'"“”‘’()\[\]]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return '';

    /* Drop a leading type prefix, but never the whole name: a vessel actually
       called "MV" (or a row holding only the prefix) keeps what it has. */
    for (const p of PREFIXES) {
      const norm = p.replace(/[._/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (s === norm) break;
      if (s.startsWith(norm + ' ')) {
        const rest = s.slice(norm.length + 1).trim();
        if (rest) { s = rest; break; }
      }
    }
    return s;
  }

  /** Digits of an IMO number, or '' when there is no 7-digit number in there. */
  function normalizeImo(raw) {
    const digits = String(raw == null ? '' : raw).replace(/\D+/g, '');
    return digits.length === 7 ? digits : '';
  }

  /**
   * Whether a 7-digit IMO satisfies its check digit.
   *
   * Reported, never enforced: a mistyped IMO in an existing tank book should
   * still match the same mistyped IMO on the other program, or the ship the
   * engineer is looking at goes missing from the library. Callers use this to
   * flag the row, not to reject it.
   */
  function isValidImo(raw) {
    const imo = normalizeImo(raw);
    if (!imo) return false;
    let sum = 0;
    for (let i = 0; i < 6; i += 1) sum += Number(imo[i]) * (7 - i);
    return sum % 10 === Number(imo[6]);
  }

  /**
   * The key two records must share to be the same ship.
   *
   * IMO when there is one, otherwise the normalised name. Returns '' when the
   * record carries neither, and an empty key never matches anything —
   * including another empty key.
   */
  function vesselKey(v) {
    if (!v || typeof v !== 'object') return '';
    const imo = normalizeImo(v.imo != null ? v.imo : v.imoNo);
    if (imo) return 'imo:' + imo;
    const name = normalizeName(v.name != null ? v.name : v.vesselName);
    return name ? 'name:' + name : '';
  }

  /**
   * Are these the same ship?
   *
   * Both IMOs present → they decide, and a mismatch is a no even when the
   * names are identical (two ships genuinely do share names). Only one side
   * has an IMO → fall back to the name, since the other record simply has not
   * been filled in.
   */
  function sameVessel(a, b) {
    if (!a || !b) return false;
    const ia = normalizeImo(a.imo != null ? a.imo : a.imoNo);
    const ib = normalizeImo(b.imo != null ? b.imo : b.imoNo);
    if (ia && ib) return ia === ib;
    const na = normalizeName(a.name != null ? a.name : a.vesselName);
    const nb = normalizeName(b.name != null ? b.name : b.vesselName);
    return !!na && na === nb;
  }

  /**
   * Fold records from several sources into one row per ship.
   *
   * Each input is { source, record }. A row keeps every source that referred
   * to the ship, so the library can say which programs hold data for it and
   * who uploaded each. Records that carry neither an IMO nor a name cannot be
   * identified and are returned as their own rows rather than silently
   * collapsed together.
   *
   * A row picks up an IMO from whichever source has one, so a Tank entry
   * filled in without an IMO still merges with the Voyage entry that has it —
   * matched on name first, then carrying the better identifier forward.
   */
  function mergeVessels(entries) {
    const rows = [];
    const byKey = new Map();

    for (const entry of entries || []) {
      if (!entry || !entry.record) continue;
      const rec = entry.record;
      const key = vesselKey(rec);

      if (!key) {
        rows.push({ key: '', name: rec.name || '', imo: '', sources: [entry] });
        continue;
      }

      /* Same key, or same ship by the looser name/IMO rule against a row we
         already have — the second case is what pairs an IMO-less Tank entry
         with the Voyage entry that names the same ship. */
      let row = byKey.get(key);
      if (!row) {
        row = rows.find((r) => r.key && sameVessel(r, rec));
      }

      if (!row) {
        row = {
          key,
          name: rec.name || rec.vesselName || '',
          imo: normalizeImo(rec.imo != null ? rec.imo : rec.imoNo),
          sources: [],
        };
        rows.push(row);
      }

      row.sources.push(entry);
      /* Prefer a real IMO and a name that is actually filled in. */
      if (!row.imo) {
        const imo = normalizeImo(rec.imo != null ? rec.imo : rec.imoNo);
        if (imo) {
          row.imo = imo;
          byKey.delete(row.key);
          row.key = 'imo:' + imo;
        }
      }
      if (!row.name) row.name = rec.name || rec.vesselName || '';
      if (row.key) byKey.set(row.key, row);
    }

    return rows;
  }

  /**
   * The engineer's own ships first, then everything else, each alphabetical.
   *
   * "Own" is by the licensed email the suite is signed in with: the vessels he
   * uploaded are the ones he is here to pull, and on a fleet server they would
   * otherwise sit somewhere in a list of forty.
   */
  function sortForOwner(rows, ownerEmail) {
    const mine = normalizeOwner(ownerEmail);
    return (rows || []).slice().sort((a, b) => {
      const am = rowBelongsTo(a, mine) ? 0 : 1;
      const bm = rowBelongsTo(b, mine) ? 0 : 1;
      if (am !== bm) return am - bm;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }

  /** Emails and the server's folder slugs compare the same way. */
  function normalizeOwner(raw) {
    return String(raw == null ? '' : raw).trim().toLowerCase();
  }

  function rowBelongsTo(row, ownerEmail) {
    const mine = normalizeOwner(ownerEmail);
    if (!mine) return false;
    return (row && row.sources || []).some((s) => {
      const owner = normalizeOwner(s.ownerEmail || s.ownerSlug || (s.record && s.record.ownerSlug));
      if (!owner) return false;
      /* The server stores a slug of the email; compare both spellings. */
      return owner === mine || owner === emailSlug(mine) || emailSlug(owner) === emailSlug(mine);
    });
  }

  /** Same slug rule the Tank store uses for data/users/<slug>/. */
  function emailSlug(raw) {
    return normalizeOwner(raw).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  const api = {
    normalizeName,
    normalizeImo,
    isValidImo,
    vesselKey,
    sameVessel,
    mergeVessels,
    sortForOwner,
    emailSlug,
    PREFIXES,
  };

  root.ChengVesselKey = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
