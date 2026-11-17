/**
 * Capture from photo: read a filled Tank Sounding Card and fill Bunker Monitoring or Tank Monitoring After Bunkering.
 * The reading itself is js/card-reader.js (offline). Here: which card, and where each value goes.
 * Only where ChEng AIO ships the reader; elsewhere the button simply does not appear.
 */
const TankCardCapture = (() => {
  const available = () => !!(window.ChengCardReader && window.TankSoundingCard && typeof TankSoundingCard.layoutDocument === 'function');

  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const num = (t) => { const v = String(t == null ? '' : t).trim(); return v !== '' && Number.isFinite(Number(v)) ? v : ''; };

  /** The card's tick for one tank: 'ullage', 'dip', or '' when neither or both are ticked. */
  function methodFor(boxes, id) {
    const u = !!boxes['ullage:' + id];
    const d = !!boxes['depth:' + id];
    return u && !d ? 'ullage' : d && !u ? 'dip' : '';
  }

  /**
   * Bunker Monitoring: each tank's sounding goes into that tank's row in the plan, the way typing it would.
   * A tank that is not in the plan is left out. A card that says Ullage for a tank the plan reads by Dip (or the
   * other way round) is not used for that tank: the plan reads every tank one way, and a reading in the other
   * sense would be wrong by metres.
   */
  function applyMonitoring(result, bundle) {
    const tanks = TankSoundingCard.fuelTanks(bundle);
    const filled = [];
    const notInPlan = [];
    const wrongSense = [];
    tanks.forEach((t) => {
      const v = num(result.fields['cm:' + t.id]);
      if (v === '') return;
      const sel = document.querySelector(`select[data-field="tankId"]`) && Array.from(document.querySelectorAll('select[data-field="tankId"]'))
        .find((s) => s.value === t.id);
      if (!sel) { notInPlan.push(t.name); return; }
      const slot = sel.dataset.slot;
      const tag = document.querySelector(`[data-bp-method="${slot}"]`);
      const plansBy = tag ? String(tag.textContent || '').trim().toLowerCase() : '';
      const cardBy = methodFor(result.boxes, t.id);
      if (cardBy && (plansBy === 'ullage' || plansBy === 'dip') && cardBy !== plansBy) { wrongSense.push(`${t.name} (card: ${cardBy}, plan: ${plansBy})`); return; }
      const box = document.querySelector(`input[data-slot="${slot}"][data-field="currentSoundingMM"]`);
      if (!box) { notInPlan.push(t.name); return; }
      box.value = v;
      fire(box, 'input');
      filled.push(t.name);
    });
    return { filled, notInPlan, wrongSense };
  }

  /** Tank Monitoring After Bunkering: reading, method and temperature per tank, and the drafts. */
  function applyAfter(result, bundle) {
    const tanks = TankSoundingCard.fuelTanks(bundle);
    const filled = [];
    const missing = [];
    tanks.forEach((t) => {
      const v = num(result.fields['cm:' + t.id]);
      const tmp = num(result.fields['temp:' + t.id]);
      const reading = document.querySelector(`input[data-row="${t.id}"][data-field="reading"]`);
      if (!reading) { if (v !== '' || tmp !== '') missing.push(t.name); return; }
      const m = methodFor(result.boxes, t.id);
      const msel = document.querySelector(`select[data-row="${t.id}"][data-field="method"]`);
      if (m && msel && msel.value !== m) { msel.value = m; fire(msel, 'change'); }
      if (v !== '') { reading.value = v; fire(reading, 'input'); }
      const temp = document.querySelector(`input[data-row="${t.id}"][data-field="tempC"]`);
      if (tmp !== '' && temp) { temp.value = tmp; fire(temp, 'input'); }
      if (v !== '' || tmp !== '') filled.push(t.name);
    });
    for (const [key, head] of [['fwd', 'draftFwd'], ['aft', 'draftAft']]) {
      const v = num(result.fields[key]);
      const box = document.querySelector(`input[data-head="${head}"]`);
      if (v !== '' && box) { box.value = v; fire(box, 'input'); }
    }
    return { filled, notInPlan: missing, wrongSense: [] };
  }

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const p2 = (n) => String(n).padStart(2, '0');
  /** A card date as the page wants it (yyyy-mm-dd): 13/11/2026, 13-11-26, 13 11 2026 or 13 NOV 2026. '' when it cannot be made sense of. */
  function parseCardDate(text) {
    const t = String(text || '').toUpperCase().trim();
    let m = /^(\d{1,2})\s*[\/\-. ]\s*(\d{1,2})\s*[\/\-. ]\s*(\d{2}|\d{4})$/.exec(t);
    let d; let mo; let y;
    if (m) { d = +m[1]; mo = +m[2]; y = m[3]; } else {
      m = /^(\d{1,2})\s*[\/\-. ]?\s*([A-Z]{3})[A-Z]*\s*[\/\-. ]?\s*(\d{2}|\d{4})$/.exec(t);
      if (!m) return '';
      d = +m[1]; mo = MONTHS.indexOf(m[2]) + 1; y = m[3];
    }
    if (y.length === 2) y = '20' + y;
    if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return '';
    return `${y}-${p2(mo)}-${p2(d)}`;
  }
  /** 0800H, 08:00, 8.00 or 0800 -> 08:00. */
  function parseCardTime(text) {
    const t = String(text || '').toUpperCase().replace(/[HRS]/g, '').trim();
    const m = /^(\d{1,2})\s*[:.]?\s*(\d{2})$/.exec(t);
    if (!m || +m[1] > 23 || +m[2] > 59) return '';
    return `${p2(m[1])}:${m[2]}`;
  }

  /** Tank Monitoring (the Fuel Oil Report page): everything After Bunkering takes, plus date, time and temperatures. */
  function applyReport(result, bundle) {
    const out = applyAfter(result, bundle);
    const put = (head, v) => {
      const box = document.querySelector(`[data-head="${head}"]`);
      if (v !== '' && box) { box.value = v; fire(box, 'input'); fire(box, 'change'); }
    };
    put('date', parseCardDate(result.fields.date));
    put('time', parseCardTime(result.fields.time));
    put('seaTemp', num(result.fields.sea));
    put('engineRoomTemp', num(result.fields.er));
    return out;
  }

  function say(out, what) {
    const parts = [`${out.filled.length} tank${out.filled.length === 1 ? '' : 's'} filled in`];
    if (out.notInPlan.length) parts.push(`not ${what}: ${out.notInPlan.join(', ')}`);
    if (out.wrongSense.length) parts.push(`left out, read the other way: ${out.wrongSense.join('; ')}`);
    return parts.join(' · ') + '. Check the page, then save.';
  }

  async function open(kind, bundle) {
    if (!available()) return null;
    const doc = TankSoundingCard.layoutDocument(bundle);
    const ranges = { fwd: [0, 25], aft: [0, 25], trim: [-10, 10], sea: [-2, 40], er: [5, 70] };
    TankSoundingCard.fuelTanks(bundle).forEach((t) => { ranges['cm:' + t.id] = [0, 3000]; ranges['temp:' + t.id] = [0, 95]; });
    return ChengCardReader.capture({
      ranges,
      title: kind === 'after' ? 'Capture the Tank Sounding Card (after bunkering)' : kind === 'report' ? 'Capture the Tank Sounding Card (tank monitoring)' : 'Capture the Tank Sounding Card (monitoring)',
      hint: 'Photograph the Tank Sounding Card with all four black corner marks in the picture. One card half at a time: lay it flat, in good light.',
      layout: () => ChengCardReader.measureLayout(doc.html, doc.cardSelector, doc.widthMm, doc.heightMm),
      apply: async (result) => {
        const out = kind === 'after' ? applyAfter(result, bundle) : kind === 'report' ? applyReport(result, bundle) : applyMonitoring(result, bundle);
        return say(out, kind === 'after' || kind === 'report' ? 'on this page' : 'in the plan');
      },
    });
  }

  /** Put a Capture from photo button in a page's button row. */
  function addButton(rowSelector, id, kind, getBundle) {
    if (!available()) return;
    const row = document.querySelector(rowSelector);
    if (!row || document.getElementById(id)) return;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.id = id;
    btn.textContent = 'CAPTURE FROM PHOTO';
    btn.title = 'Read a filled Tank Sounding Card from a photo, on this device';
    btn.addEventListener('click', () => { open(kind, getBundle()).catch((e) => { console.warn('capture', e); }); });
    row.insertBefore(btn, row.firstChild);
  }

  return { available, open, addButton, applyMonitoring, applyAfter, applyReport, parseCardDate, parseCardTime, methodFor };
})();
window.TankCardCapture = TankCardCapture;
