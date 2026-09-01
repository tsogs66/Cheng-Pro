/**
 * Flag registry codes + display names (same list as Voyage Chief / e-ORB).
 * Stored on vessel.json as the two-letter code; UI shows the administration name.
 */
(function (root) {
  'use strict';

  const FLAGS = [
    { code: 'LR', name: 'Liberia' },
    { code: 'MH', name: 'Marshall Islands' },
    { code: 'PA', name: 'Panama' },
    { code: 'BS', name: 'Bahamas' },
    { code: 'SG', name: 'Singapore' },
    { code: 'CY', name: 'Cyprus' },
    { code: 'MT', name: 'Malta' },
    { code: 'HK', name: 'Hong Kong, China' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'NO', name: 'Norway (NIS)' },
  ];

  const byCode = new Map(FLAGS.map((f) => [f.code.toUpperCase(), f]));
  const byName = new Map(FLAGS.map((f) => [f.name.toLowerCase(), f]));

  function normalizeCode(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const upper = s.toUpperCase();
    if (byCode.has(upper)) return upper;
    const hit = byName.get(s.toLowerCase());
    if (hit) return hit.code;
    const paren = s.match(/\(([A-Z]{2})\)\s*$/i);
    if (paren && byCode.has(paren[1].toUpperCase())) return paren[1].toUpperCase();
    return upper.length <= 3 ? upper : s;
  }

  function displayName(code) {
    const c = normalizeCode(code);
    const hit = byCode.get(c);
    return hit ? hit.name : (c || '');
  }

  function displayLabel(code) {
    const c = normalizeCode(code);
    if (!c) return '—';
    const hit = byCode.get(c);
    return hit ? `${hit.name} (${hit.code})` : c;
  }

  function selectOptions(selectedCode) {
    const cur = normalizeCode(selectedCode);
    let html = '<option value="">— Select flag —</option>';
    for (const f of FLAGS) {
      html += `<option value="${f.code}"${f.code === cur ? ' selected' : ''}>${f.name} (${f.code})</option>`;
    }
    if (cur && !byCode.has(cur)) {
      html += `<option value="${cur.replace(/"/g, '&quot;')}" selected>${cur}</option>`;
    }
    return html;
  }

  root.ChengFlagRegistry = {
    FLAGS,
    normalizeCode,
    displayName,
    displayLabel,
    selectOptions,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
