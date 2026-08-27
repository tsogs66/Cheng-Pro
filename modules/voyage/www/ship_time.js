/* Voyage Chief — ship time / clock change
 * ts0gs · Marvin C. Endozo
 */
/**
 * Ship's clock / zone time for noon-report log entries.
 *
 * Date/time on the log is ship's clock (datetime-local, no zone suffix).
 * When the ship changes zone the clocks are advanced or retarded — usually
 * 30 minutes or 1 hour. Period hours must use actual elapsed time:
 *   hours = (ship-clock delta) − (minutes clocks were advanced) / 60
 * so a noon-to-noon after clocks +1 h is 23 h, not 24 h.
 */
(function (global) {
  'use strict';

  const TZ_MIN = -12 * 60;
  const TZ_MAX = 14 * 60;
  const TZ_STEP = 30;
  /* A watch never advances/retards more than 3 h. Larger figures are a timezone
     (e.g. UTC+8 = 480 min) mistakenly stored as the period clock change, which
     turns a noon-to-noon into 16 h. */
  const MAX_CLOCK_CHANGE_MIN = 3 * 60;

  function clampTzOffsetMin(min) {
    const n = Number(min);
    if (!isFinite(n)) return 0;
    const stepped = Math.round(n / TZ_STEP) * TZ_STEP;
    return Math.max(TZ_MIN, Math.min(TZ_MAX, stepped));
  }

  function tzOffsetOptions() {
    const out = [];
    for (let m = TZ_MIN; m <= TZ_MAX; m += TZ_STEP) out.push(m);
    return out;
  }

  function formatTzOffset(min) {
    const n = clampTzOffsetMin(min);
    const sign = n >= 0 ? '+' : '-';
    const abs = Math.abs(n);
    const h = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return 'UTC' + sign + h + ':' + mm;
  }

  function formatClockChange(min) {
    const n = sanitizeClockChangeMin(min);
    if (!n) return 'No clock change this period.';
    const abs = Math.abs(n);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const parts = [];
    if (h) parts.push(h === 1 ? '1 hour' : h + ' hours');
    if (m) parts.push(m + ' min');
    return (n > 0 ? 'Clocks advanced ' : 'Clocks retarded ') + parts.join(' ') +
      '. Period hours are adjusted so consumption and RPM stay on actual time.';
  }

  function formatClockChangeShort(min) {
    const n = sanitizeClockChangeMin(min);
    if (!n) return '';
    const abs = Math.abs(n);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    let body = '';
    if (h && m) body = h + 'h ' + m + 'm';
    else if (h) body = h + 'h';
    else body = m + 'm';
    return (n > 0 ? 'clocks +' : 'clocks −') + body;
  }

  function toDatetimeLocalValue(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /**
   * Ship's-clock stamp as a stable millisecond value.
   * Reads the civil YYYY-MM-DDTHH:mm from the log and ignores any Z / offset,
   * so 15 Aug 12:00 → 16 Aug 12:00 is always 24 h whether one side was saved
   * as datetime-local or as an ISO UTC string.
   */
  function parseShipDateTimeMs(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/);
    if (m) {
      return Date.UTC(
        Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4]), Number(m[5]), Number(m[6] || 0)
      );
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function sanitizeClockChangeMin(min) {
    const n = Number(min) || 0;
    if (!n) return 0;
    if (Math.abs(n) > MAX_CLOCK_CHANGE_MIN) return 0;
    return n;
  }

  /** Record a clock change only for a real mid-voyage zone step (≤ 3 h),
   *  not when the engineer first picks the ship's register timezone. */
  function shouldRecordClockChange(fromOffsetMin, toOffsetMin, prevHadZone, entryHadZone) {
    const from = clampTzOffsetMin(fromOffsetMin);
    const to = clampTzOffsetMin(toOffsetMin);
    const delta = to - from;
    if (!delta) return false;
    if (!prevHadZone && !entryHadZone) return false;
    if (Math.abs(delta) > MAX_CLOCK_CHANGE_MIN) return false;
    return true;
  }

  function addMinutesToDatetimeLocal(value, minutes) {
    if (!value) return value || '';
    const delta = Number(minutes) || 0;
    if (!delta) return value;
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    d.setMinutes(d.getMinutes() + delta);
    return toDatetimeLocalValue(d);
  }

  /**
   * Actual hours between two ship's-clock stamps after applying a clock change
   * recorded on the later entry (positive = clocks advanced).
   */
  function elapsedShipHours(prevDt, curDt, clockChangeMin) {
    if (!prevDt || !curDt) return null;
    const a = parseShipDateTimeMs(prevDt);
    const b = parseShipDateTimeMs(curDt);
    if (a == null || b == null) return null;
    const naive = (b - a) / 3600000;
    if (!isFinite(naive)) return null;
    const adj = naive - sanitizeClockChangeMin(clockChangeMin) / 60;
    return adj > 0 ? adj : null;
  }

  /**
   * Changing ship's zone adjusts the displayed ship's clock by the same
   * minutes and accumulates that on the period's clock-change log.
   */
  function applyTimezoneChange(datetime, fromOffsetMin, toOffsetMin, prevClockChangeMin) {
    const from = clampTzOffsetMin(fromOffsetMin);
    const to = clampTzOffsetMin(toOffsetMin);
    const deltaMin = to - from;
    return {
      datetime: addMinutesToDatetimeLocal(datetime, deltaMin),
      tzOffsetMin: to,
      clockChangeMin: sanitizeClockChangeMin(prevClockChangeMin) + deltaMin,
      deltaMin: deltaMin
    };
  }

  const api = {
    TZ_MIN: TZ_MIN,
    TZ_MAX: TZ_MAX,
    TZ_STEP: TZ_STEP,
    clampTzOffsetMin: clampTzOffsetMin,
    tzOffsetOptions: tzOffsetOptions,
    formatTzOffset: formatTzOffset,
    formatClockChange: formatClockChange,
    formatClockChangeShort: formatClockChangeShort,
    toDatetimeLocalValue: toDatetimeLocalValue,
    parseShipDateTimeMs: parseShipDateTimeMs,
    sanitizeClockChangeMin: sanitizeClockChangeMin,
    shouldRecordClockChange: shouldRecordClockChange,
    addMinutesToDatetimeLocal: addMinutesToDatetimeLocal,
    elapsedShipHours: elapsedShipHours,
    applyTimezoneChange: applyTimezoneChange,
    MAX_CLOCK_CHANGE_MIN: MAX_CLOCK_CHANGE_MIN
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  global.ShipTime = api;
})(typeof window !== 'undefined' ? window : global);
