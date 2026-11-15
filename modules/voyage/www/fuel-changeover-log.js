/*
 * Fuel Changeover Regulation Log (MARPOL Annex VI Reg. 14.6).
 *
 * The record the engineer keeps of a changeover to compliant fuel, laid out the
 * way the company's own Appendix VI log book is: one page per ECA passage or EU
 * port call, one row per stage, with date, local and UTC time, position and the
 * quantity of compliant fuel in each tank, and the officer in charge's signature.
 *
 * Reg. 14.6 asks for the volume of low-sulphur fuel in each tank and the date,
 * time and position when the changeover is completed before entering an ECA or
 * commenced after leaving it. EU Directive 2012/33/EU asks for the same at berth,
 * with the changeover made as soon as possible after arrival and as late as
 * possible before departure.
 *
 * The tank columns are not fixed. They follow the distillate tanks of the ship
 * that is active, and a tank that has since been removed or renamed keeps its
 * column on the records that used it.
 *
 * Pure functions are exported for the tests; mount() builds the page.
 * One file serves Voyage Chief and the AIO's Voyage module.
 */
(function (root) {
  'use strict';

  var ECA_STAGES = [
    { no: 1, label: 'Commencement of operation — entry into ECA', note: 'When the HFO valve is closed' },
    { no: 2, label: 'Completion of operation — before entry into ECA', note: 'Compliant fuel in service before the boundary' },
    { no: 3, label: 'Entry into ECA', note: '' },
    { no: 4, label: 'Departure from ECA', note: '' },
    { no: 5, label: 'Commencement after departure from ECA', note: 'Not before the ship is clear of the area' }
  ];
  var EU_STAGES = [
    { no: 1, label: 'Arrival at EU berth — commencement of changeover', note: 'As soon as possible after arrival' },
    { no: 2, label: 'Completion — compliant fuel (0.10 % S) in use at berth', note: '' },
    { no: 3, label: 'Commencement of change back before departure', note: 'As late as possible before departure' },
    { no: 4, label: 'Completion of change back / departure from berth', note: '' }
  ];
  /* The stages whose figures Reg. 14.6 names: low-sulphur volume per tank with date, time and position. */
  var REQUIRED_STAGES = { eca: [2, 5], eu: [2, 4] };
  var KIND_LABELS = { eca: 'ECA passage', eu: 'EU port call' };

  var NOTE = {
    eca: 'An entry must be made before the vessel enters an ECA and after it has departed an ECA.',
    eu: 'An entry must be made when the vessel operates at an EU port under Directive 2005/33/EC (as amended by 2012/33/EU).'
  };

  function stagesFor(kind) { return kind === 'eu' ? EU_STAGES : ECA_STAGES; }

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid() { return 'co-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function fmt(n) {
    if (n == null || n === '') return '';
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Number(v.toFixed(2)));
  }

  /* ---------------------------------------------------------------- time */

  /** Local date + time + (local − UTC) in minutes → a UTC "YYYY-MM-DDTHH:MM" string, or ''. */
  function utcFromLocal(dateStr, timeStr, offsetMin) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    var t = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || ''));
    var off = num(offsetMin);
    if (!m || !t || off == null) return '';
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) - off * 60000;
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
      'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function utcMs(stage) {
    var u = utcFromLocal(stage && stage.dateLT, stage && stage.timeLT, stage && stage.offsetMin);
    return u ? Date.parse(u + ':00Z') : null;
  }

  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function formatDateUpper(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    return m ? (m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1]) : '';
  }
  function hhmm(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? (pad(m[1]) + pad(m[2])) : ''; }

  /* ------------------------------------------------------------ position */

  /** "LAT.30°-11.5 N" style, as the company form writes it. '' when nothing is filled. */
  function formatPosition(stage) {
    var s = stage || {};
    function part(deg, min, hem, label) {
      if (deg == null || deg === '') return '';
      return label + String(deg).trim() + '°-' + (min == null || min === '' ? '00.0' : String(min).trim()) + ' ' + (hem || '');
    }
    var lat = part(s.latDeg, s.latMin, s.latHem || 'N', 'LAT.');
    var lon = part(s.lonDeg, s.lonMin, s.lonHem || 'E', 'LONG.');
    return { lat: lat, lon: lon, text: [lat, lon].filter(Boolean).join('  ') };
  }

  function positionComplete(stage) {
    var s = stage || {};
    return num(s.latDeg) != null && num(s.lonDeg) != null;
  }

  /* --------------------------------------------------------------- tanks */

  /**
   * Columns of the log: the active vessel's distillate tanks first, then — when
   * a record used one that is no longer on the ship — that tank under the name it
   * had, then (when asked for) the residual tanks, which are not compliant fuel
   * and are kept apart from the compliant columns.
   */
  function tankColumns(tanks, record, opts) {
    var o = opts || {};
    var cols = [];
    var seen = {};
    function add(t, group, name) {
      if (!t || seen[group + ':' + t.id]) return;
      seen[group + ':' + t.id] = true;
      cols.push({ id: t.id, name: name || t.name || t.id, group: group,
        note: t.frameNo ? ('fr. ' + t.frameNo) : '', capacityM3: num(t.capacityM3) });
    }
    ((tanks && tanks.distillate) || []).forEach(function (t) { add(t, 'compliant'); });
    var names = {};
    ((record && record.stages) || []).forEach(function (st) {
      Object.keys((st && st.tankNames) || {}).forEach(function (id) { names[id] = st.tankNames[id]; });
    });
    ((record && record.stages) || []).forEach(function (st) {
      Object.keys((st && st.rob) || {}).forEach(function (id) {
        if (!seen['compliant:' + id]) add({ id: id }, 'compliant', (names[id] || id) + ' (not on this ship now)');
      });
    });
    if (o.includeResidual) {
      ((tanks && tanks.residual) || []).forEach(function (t) { add(t, 'other'); });
      ((record && record.stages) || []).forEach(function (st) {
        Object.keys((st && st.resid) || {}).forEach(function (id) {
          if (!seen['other:' + id]) add({ id: id }, 'other', (names[id] || id) + ' (not on this ship now)');
        });
      });
    }
    return cols;
  }

  /** The tank figures a stage carries, whichever group the column is in. */
  function robOf(stage, col) {
    var bag = col.group === 'other' ? (stage && stage.resid) : (stage && stage.rob);
    return bag ? num(bag[col.id]) : null;
  }

  /* -------------------------------------------------------------- records */

  function blankStage(no, ctx) {
    var c = ctx || {};
    return {
      no: no, dateLT: '', timeLT: '', offsetMin: c.offsetMin != null ? c.offsetMin : 0,
      latDeg: '', latMin: '', latHem: 'N', lonDeg: '', lonMin: '', lonHem: 'E',
      rob: {}, resid: {}, tankNames: {},
      signName: c.officerName || '', signRank: c.officerRank || '', remarks: ''
    };
  }

  function newRecord(kind, ctx) {
    var k = kind === 'eu' ? 'eu' : 'eca';
    var c = ctx || {};
    var now = new Date().toISOString();
    return {
      id: uid(), kind: k, title: '', createdAt: now, updatedAt: now,
      stages: stagesFor(k).map(function (s) { return blankStage(s.no, c); }),
      form: Object.assign({ revision: '', effective: '', preparedBy: '', approvedBy: '', formNo: '' }, c.form || {})
    };
  }

  /* ----------------------------------------------------------- validation */

  /**
   * What the record gets wrong. level 'error' is a non-compliance the officer
   * must look at (completion after the boundary); 'warn' is something Reg. 14.6
   * asks for that is missing or out of order.
   */
  function validate(record, tanks) {
    var out = [];
    if (!record) return out;
    var kind = record.kind === 'eu' ? 'eu' : 'eca';
    var defs = stagesFor(kind);
    var cols = tankColumns(tanks, record, {});
    var stages = record.stages || [];
    var times = {};
    stages.forEach(function (st) { times[st.no] = utcMs(st); });

    stages.forEach(function (st) {
      var def = defs.filter(function (d) { return d.no === st.no; })[0];
      if (!def) return;
      var filled = !!(st.dateLT || st.timeLT);
      if (filled && times[st.no] == null) {
        out.push({ level: 'warn', stage: st.no, msg: 'Stage ' + st.no + ': give the date, the local time and the zone so the UTC time can be worked out.' });
      }
      var required = REQUIRED_STAGES[kind].indexOf(st.no) !== -1;
      if (filled && required) {
        if (!positionComplete(st)) out.push({ level: 'warn', stage: st.no, msg: 'Stage ' + st.no + ': Reg. 14.6 asks for the ship\'s position at this point.' });
        var any = cols.some(function (c) { return robOf(st, c) != null; });
        if (!any) out.push({ level: 'warn', stage: st.no, msg: 'Stage ' + st.no + ': enter the quantity of low-sulphur fuel in each tank — Reg. 14.6 asks for it here.' });
      }
      Object.keys(st.rob || {}).concat(Object.keys(st.resid || {})).forEach(function (id) {
        var v = num((st.rob || {})[id] != null ? st.rob[id] : (st.resid || {})[id]);
        if (v != null && v < 0) out.push({ level: 'error', stage: st.no, msg: 'Stage ' + st.no + ': a tank quantity cannot be negative.' });
      });
      cols.forEach(function (c) {
        var v = robOf(st, c);
        if (v != null && c.capacityM3 != null && c.capacityM3 > 0 && v > c.capacityM3 * 1.2) {
          out.push({ level: 'warn', stage: st.no, msg: 'Stage ' + st.no + ': ' + c.name + ' shows ' + fmt(v) + ' MT against a capacity of ' + fmt(c.capacityM3) + ' m³ — check the figure.' });
        }
      });
    });

    var prev = null;
    stages.slice().sort(function (a, b) { return a.no - b.no; }).forEach(function (st) {
      var t = times[st.no];
      if (t == null) return;
      if (prev != null && t < prev.t) {
        out.push({ level: 'warn', stage: st.no, msg: 'Stage ' + st.no + ' is earlier than stage ' + prev.no + ' — the stages must be in order.' });
      }
      prev = { no: st.no, t: t };
    });

    if (kind === 'eca') {
      if (times[2] != null && times[3] != null && times[2] > times[3]) {
        out.push({ level: 'error', stage: 2, msg: 'Changeover completed after the ship entered the ECA. The fuel at the engines must be at or under 0.10 % S before the boundary.' });
      }
      if (times[4] != null && times[5] != null && times[5] < times[4]) {
        out.push({ level: 'error', stage: 5, msg: 'The change back to residual fuel began before the ship had left the ECA.' });
      }
    } else if (times[1] != null && times[2] != null && times[2] < times[1]) {
      out.push({ level: 'warn', stage: 2, msg: 'Completion is earlier than commencement.' });
    }
    return out;
  }

  /**
   * Plan against what was done, for an ECA record that carries the calculator's plan:
   * how far the commencement and the completion were from the plan.
   */
  function compareToPlan(record) {
    var plan = record && record.plan;
    if (!plan || !plan.latestStartIso) return null;
    var st = (record.stages || []).reduce(function (m, s) { m[s.no] = s; return m; }, {});
    var plannedStart = Date.parse(plan.latestStartIso);
    var actualStart = st[1] ? utcMs(st[1]) : null;
    var actualDone = st[2] ? utcMs(st[2]) : null;
    var rows = {};
    if (isFinite(plannedStart) && actualStart != null) rows.startDiffMin = Math.round((actualStart - plannedStart) / 60000);
    if (actualStart != null && actualDone != null) rows.durationMin = Math.round((actualDone - actualStart) / 60000);
    if (plan.hours != null) rows.plannedMin = Math.round(Number(plan.hours) * 60);
    return rows;
  }


  /**
   * What a changeover stage hands to the e-ORB Part III C item 4 (Panama): the
   * stage that completed the changeover before the ECA, or commenced the change
   * back after it, with its UTC date and time, position, the tanks holding
   * low-sulphur fuel and their volume in m³ (the record keeps MT, so it is taken
   * through the density). Other stages and EU stages have no such item: null.
   */
  function partThreeValues(record, stage, densityKgM3) {
    if (!record || record.kind === 'eu' || !stage) return null;
    var event = stage.no === 2 ? 'Completed before entering the ECA' : (stage.no === 5 ? 'Commenced after leaving the ECA' : '');
    if (!event) return null;
    var utc = utcFromLocal(stage.dateLT, stage.timeLT, stage.offsetMin);
    if (!utc) return null;
    var dens = num(densityKgM3);
    if (dens == null || dens <= 0) dens = 890;
    var ids = Object.keys(stage.rob || {}).filter(function (id) { return num(stage.rob[id]) != null; });
    var mt = ids.reduce(function (a, id) { return a + Number(stage.rob[id]); }, 0);
    return {
      event: event, date: utc.slice(0, 10), time: utc.slice(11, 16),
      stageNo: stage.no, tankIds: ids, volumeM3: ids.length ? Math.round(mt / (dens / 1000) * 100) / 100 : null,
      scenarioId: stage.no === 2 ? 'p3-changeover-complete' : 'p3-changeover-start',
      position: positionComplete(stage) ? {
        latDeg: stage.latDeg, latMin: stage.latMin, latHem: stage.latHem || 'N',
        lonDeg: stage.lonDeg, lonMin: stage.lonMin, lonHem: stage.lonHem || 'E' } : null
    };
  }

  /* ------------------------------------------------------------ plan checks */

  /**
   * Low-sulphur fuel needed for an ECA passage against what is on board.
   * Used up from the start of the changeover to the end of the time in the ECA:
   * the low-sulphur share the changeover itself displaces, plus the full
   * consumption while inside the area. The change back to residual fuel runs on
   * a blend again and is not counted, so a small reserve is kept on top.
   */
  function ecaFuelCheck(p) {
    var used = num(p && p.changeoverUsedMt);
    var hours = num(p && p.transitHours);
    var cons = num(p && p.consMtDay);
    var onBoard = num(p && p.onBoardMt);
    var reservePct = num(p && p.reservePct);
    if (reservePct == null) reservePct = 10;
    if (used == null || hours == null || cons == null || onBoard == null || hours < 0 || cons <= 0) {
      return { ok: false, reason: 'Give the low-sulphur fuel on board, the time in the ECA and the consumption.' };
    }
    var transit = cons * hours / 24;
    var need = used + transit;
    var needWithReserve = need * (1 + reservePct / 100);
    var spare = onBoard - needWithReserve;
    return {
      ok: true, changeoverMt: used, transitMt: transit, needMt: need, reservePct: reservePct,
      needWithReserveMt: needWithReserve, onBoardMt: onBoard, spareMt: spare,
      enough: onBoard >= need, comfortable: spare >= 0
    };
  }

  /**
   * An EU port call at 0.10 % S (Directive 2012/33/EU): change over as soon as
   * possible after arrival, change back as late as possible before departure.
   * Times are ms since epoch. A published stay of under two hours is exempt; the
   * figure is reported, and the exemption is the operator's to confirm.
   */
  function euBerthPlan(p) {
    var arr = num(p && p.arrivalMs), dep = num(p && p.departureMs);
    var hours = num(p && p.changeoverHours), used = num(p && p.changeoverUsedMt);
    var cons = num(p && p.consMtDay), onBoard = num(p && p.onBoardMt);
    var back = num(p && p.changeBackMarginHours);
    if (back == null) back = 0;
    if (arr == null || dep == null || hours == null || cons == null || dep <= arr) {
      return { ok: false, reason: 'Give the arrival and the departure (departure after arrival), and work the changeover time first.' };
    }
    var stayH = (dep - arr) / 3600000;
    var compliantBy = arr + hours * 3600000;
    var changeBackStart = dep - back * 3600000;
    var compliantHours = Math.max(0, stayH - hours - back);
    var transit = cons * Math.max(0, stayH - hours - back) / 24;
    var need = (used == null ? 0 : used) + transit;
    return {
      ok: true, stayHours: stayH, startMs: arr, departureMs: dep, compliantByMs: compliantBy, changeBackStartMs: changeBackStart,
      completesInTime: compliantBy <= changeBackStart, compliantHours: compliantHours,
      exemptShortStay: stayH < 2, needMt: need, onBoardMt: onBoard,
      enough: onBoard == null ? null : onBoard >= need
    };
  }

  /* ----------------------------------------------------------------- print */

  var PRINT_CSS =
    '.fcl{font-family:Calibri,Arial,Helvetica,sans-serif;color:#111;font-size:11pt;}' +
    '.fcl-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6mm;}' +
    '.fcl-co{font-weight:700;font-style:italic;font-size:13pt;}' +
    '.fcl-ref{font-style:italic;font-size:10pt;text-align:right;}' +
    '.fcl-title{text-align:center;font-weight:700;font-size:15pt;line-height:1.25;margin:2mm 0 3mm;}' +
    '.fcl-ship{display:flex;justify-content:space-between;font-weight:700;font-size:13pt;margin-bottom:1mm;}' +
    '.fcl-note{font-style:italic;font-size:9pt;margin-bottom:2mm;}' +
    '.fcl table{width:100%;border-collapse:collapse;table-layout:fixed;}' +
    '.fcl th,.fcl td{border:1px solid #333;padding:2mm 1.4mm;vertical-align:middle;text-align:center;font-size:9.5pt;word-wrap:break-word;}' +
    '.fcl th{background:#d9d9d9;font-weight:700;}' +
    '.fcl td.st{text-align:left;font-weight:700;background:#ececec;}' +
    '.fcl td.st small{display:block;font-weight:400;font-size:8pt;margin-top:1mm;}' +
    '.fcl td.dt{text-align:left;font-size:9pt;line-height:1.35;}' +
    '.fcl td.sg{font-size:9pt;line-height:1.3;}' +
    '.fcl th small{display:block;font-weight:400;font-size:7.5pt;margin-top:.6mm;}' +
    '.fcl-sub{font-weight:700;margin:3mm 0 1mm;font-size:9.5pt;}' +
    '.fcl-rule{font-weight:700;font-size:10pt;margin:3mm 0 0;}' +
    '.fcl-foot{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr 1fr;gap:3mm;margin-top:4mm;font-size:8.5pt;border-top:1px solid #333;padding-top:1.6mm;}' +
    '.fcl-foot b{display:block;font-weight:400;font-size:7.5pt;color:#444;}' +
    '.fcl-sig{width:20mm;max-height:9mm;display:block;margin:0 auto 1mm;}';

  /** The log page for one record, in the company's layout. ctx: vessel, tanks, form, signature(name)->dataUrl, signatoryHtml. */
  function buildLogHtml(record, ctx) {
    var c = ctx || {};
    var rec = record || newRecord('eca', {});
    var kind = rec.kind === 'eu' ? 'eu' : 'eca';
    var vessel = c.vessel || {};
    var form = Object.assign({}, rec.form || {});
    var cols = tankColumns(c.tanks, rec, { includeResidual: !!c.includeResidual });
    var compliant = cols.filter(function (x) { return x.group === 'compliant'; });
    var other = cols.filter(function (x) { return x.group === 'other'; });
    var defs = stagesFor(kind);
    var nCols = Math.max(1, cols.length);
    var stageW = 17, dateW = 17, sigW = 15;
    var tankW = Math.max(6, Math.floor((100 - stageW - dateW - sigW) / nCols * 10) / 10);

    function head() {
      var top = '<tr><th rowspan="2" style="width:' + stageW + '%">Stage</th>' +
        '<th rowspan="2" style="width:' + dateW + '%">Date, Time and Position</th>';
      if (compliant.length) top += '<th colspan="' + compliant.length + '">ROB of compliant Fuel Oil (SO 0.1%) per Tank</th>';
      if (other.length) top += '<th colspan="' + other.length + '">ROB of non-compliant fuel per Tank</th>';
      top += '<th rowspan="2" style="width:' + sigW + '%">Signature of officer in charge of fuel Changeover Operation</th></tr>';
      var tanksRow = '<tr>' + cols.map(function (col) {
        return '<th style="width:' + tankW + '%">' + esc(col.name) + (col.note ? '<small>' + esc(col.note) + '</small>' : '') + '<small>MT</small></th>';
      }).join('') + '</tr>';
      return '<thead>' + top + tanksRow + '</thead>';
    }

    function rowFor(def) {
      var st = (rec.stages || []).filter(function (s) { return s.no === def.no; })[0] || blankStage(def.no, {});
      var pos = formatPosition(st);
      var utc = utcFromLocal(st.dateLT, st.timeLT, st.offsetMin);
      var utcHm = utc ? (utc.slice(11, 13) + utc.slice(14, 16)) : '';
      var utcDate = utc ? formatDateUpper(utc.slice(0, 10)) : '';
      var dt = '';
      if (st.timeLT) dt += hhmm(st.timeLT) + ' H LT<br>';
      if (utcHm) dt += utcHm + ' H UTC<br>';
      if (utcDate || st.dateLT) dt += (utcDate && utcDate !== formatDateUpper(st.dateLT) ? formatDateUpper(st.dateLT) : (utcDate || formatDateUpper(st.dateLT))) + '<br>';
      if (pos.text) dt += 'POS<br>' + esc(pos.lat) + '<br>' + esc(pos.lon);
      var cells = cols.map(function (col) {
        var v = robOf(st, col);
        return '<td>' + (v == null ? '' : esc(fmt(v)) + ' MT') + '</td>';
      }).join('');
      var sig = '';
      if (st.signName || st.signRank) {
        var img = c.signature ? c.signature(st.signName) : '';
        sig = (img ? '<img class="fcl-sig" src="' + esc(img) + '" alt="">' : '') +
          esc(st.signRank || '') + '<br>' + esc(st.signName || '');
      }
      return '<tr><td class="st">' + def.no + '. ' + esc(def.label) + (def.note ? '<small>*(' + esc(def.note) + ')</small>' : '') + '</td>' +
        '<td class="dt">' + dt + '</td>' + (cells || '<td></td>') + '<td class="sg">' + sig + '</td></tr>';
    }

    var title = (kind === 'eu' ? 'Fuel Changeover Regulation Log Book — EU Port' : 'Fuel Changeover Regulation Log Book');
    var sub = rec.title ? '<div class="fcl-note" style="text-align:center;font-style:normal;font-weight:700;">' + esc(rec.title) + '</div>' : '';
    return '<style>' + PRINT_CSS + '</style><div class="fcl">' +
      '<div class="fcl-head"><div class="fcl-co">' + esc(form.company || vessel.company || '') + '</div>' +
      '<div class="fcl-ref">Requirements &amp; Implementation<br>of Annex VI of Marpol 73/78</div></div>' +
      '<div class="fcl-title">APPENDIX VI<br>' + esc(title) + '</div>' + sub +
      '<div class="fcl-ship"><span>Ship\'s Name: ' + esc(vessel.name || '') + '</span><span>IMO Number: ' + esc(vessel.imo || '') + '</span></div>' +
      '<div class="fcl-note"><b>Note:</b> ' + esc(NOTE[kind]) + '</div>' +
      '<table>' + head() + '<tbody>' + defs.map(rowFor).join('') + '</tbody></table>' +
      '<div class="fcl-rule">NOTE: AT EACH STAGE FILL IN THE RESPECTIVE CELLS WITH THE QUANTITY OF LS MGO IN EACH TANK ACCORDING TO YOUR SHIP\'S TANK ARRANGEMENT</div>' +
      (c.signatoryHtml ? c.signatoryHtml : '') +
      '<div class="fcl-foot"><div>Sulphur Oxide: Marpol 73/78 Annex VI Reg. 14 – change over procedures.</div>' +
      '<div><b>Prepared by</b>' + esc(form.preparedBy || '') + '</div>' +
      '<div><b>Approved by</b>' + esc(form.approvedBy || '') + '</div>' +
      '<div><b>Revision No.</b>' + esc(form.revision || '') + '</div>' +
      '<div><b>Date effective</b>' + esc(form.effective || '') + '</div></div></div>';
  }

  /** Planned against actual, as a short block under the log. */
  function planNotesHtml(record) {
    var cmp = compareToPlan(record);
    if (!cmp) return '';
    function h(min) { if (min == null) return '—'; var s = min < 0 ? '−' : '+'; var a = Math.abs(min); return s + Math.floor(a / 60) + ' h ' + pad(a % 60) + ' min'; }
    function d(min) { if (min == null) return '—'; return Math.floor(min / 60) + ' h ' + pad(min % 60) + ' min'; }
    return '<div class="fcl-note" style="margin-top:3mm;">Plan: changeover to start by the planned time, planned duration ' + d(cmp.plannedMin) +
      '. Actual start against plan ' + h(cmp.startDiffMin) + '; actual duration ' + d(cmp.durationMin) + '.</div>';
  }

  /* -------------------------------------------------------------------- UI */

  var CSS =
    '.fcl-ui .fcl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:6px 0;}' +
    '.fcl-ui .fcl-stage{border:1px solid var(--line,#3a4a5a);border-radius:6px;padding:10px;margin:10px 0;}' +
    '.fcl-ui .fcl-stage h4{margin:0 0 6px;font-size:14px;}' +
    '.fcl-ui .fcl-stage small{display:block;opacity:.75;margin-bottom:6px;}' +
    '.fcl-ui .fcl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:10px;}' +
    '.fcl-ui .fcl-grid .field,.fcl-ui .fcl-row .field{min-width:0;}' +
    '.fcl-ui .fcl-grid input,.fcl-ui .fcl-grid select{width:100%;min-width:0;box-sizing:border-box;}' +
    '.fcl-ui .fcl-pos{display:flex;gap:4px;align-items:center;flex-wrap:wrap;}' +
    '.fcl-ui .fcl-pos{gap:6px;margin:4px 0;}' +
    '.fcl-ui .fcl-pos input,.fcl-ui .fcl-pos select{background:var(--ink);border:1px solid var(--line-strong);border-radius:3px;color:var(--paper);font-family:"IBM Plex Mono",monospace;font-size:13px;padding:7px 8px;min-height:40px;box-sizing:border-box;}' +
    '.fcl-ui .fcl-pos input{width:68px;}' +
    '.fcl-ui .fcl-warn{margin:8px 0;padding:8px 12px;border-left:3px solid #d9822b;background:rgba(217,130,43,.12);font-size:13px;}' +
    '.fcl-ui .fcl-warn.error{border-left-color:#c0392b;background:rgba(192,57,43,.14);}' +
    '.fcl-ui .fcl-warn.ok{border-left-color:#2e9d6a;background:rgba(46,157,106,.10);}' +
    '.fcl-ui button{min-height:40px;}' +
    '.fcl-ui .fcl-tanks{font-size:12px;opacity:.85;margin:4px 0 8px;}';

  function mount(host, api) {
    if (!host || !api) return null;
    if (!document.getElementById('fcl-css')) {
      var st = document.createElement('style'); st.id = 'fcl-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    var selectedId = null;
    var includeResidual = false;
    var timer = null;

    function records() { return (api.records() || []).filter(function (r) { return r && r.id; }); }
    function current() { return records().filter(function (r) { return r.id === selectedId; })[0] || null; }
    function ctxNew() {
      var o = api.officer ? api.officer() : {};
      return { offsetMin: api.defaultOffsetMin ? api.defaultOffsetMin() : 0, officerName: o.name || '', officerRank: o.rank || '',
        form: api.lastForm ? api.lastForm() : {} };
    }
    function persist(rec) {
      rec.updatedAt = new Date().toISOString();
      clearTimeout(timer);
      timer = setTimeout(function () { try { api.save(records()); } catch (e) { /* the page reports save failures */ } }, 500);
    }
    function printCtx() {
      return { vessel: api.vessel(), tanks: api.tanks(), includeResidual: includeResidual,
        signature: api.signature, signatoryHtml: api.signatoryHtml ? api.signatoryHtml() : '' };
    }

    function tankInputs(stage, cols) {
      if (!cols.length) return '<div class="fcl-warn">No distillate fuel tank is set up for this ship. Add them under ORB Vessel Setup → Fuel oil tanks (Bunker service: Distillate).</div>';
      return '<div class="fcl-grid">' + cols.map(function (col) {
        var v = robOf(stage, col);
        return '<div class="field"><label>' + esc(col.name) + (col.group === 'other' ? ' (non-compliant)' : '') + ' — MT</label>' +
          '<input type="number" step="0.01" min="0" data-fcl-rob="' + esc(col.id) + '" data-fcl-grp="' + col.group + '" value="' + (v == null ? '' : esc(v)) + '"></div>';
      }).join('') + '</div>';
    }

    function stageHtml(rec, def) {
      var st = (rec.stages || []).filter(function (s) { return s.no === def.no; })[0];
      if (!st) { st = blankStage(def.no, ctxNew()); rec.stages.push(st); }
      var cols = tankColumns(api.tanks(), rec, { includeResidual: includeResidual });
      var utc = utcFromLocal(st.dateLT, st.timeLT, st.offsetMin);
      return '<div class="fcl-stage" data-fcl-stage="' + def.no + '"><h4>' + def.no + '. ' + esc(def.label) + '</h4>' +
        (def.note ? '<small>' + esc(def.note) + '</small>' : '') +
        '<div class="fcl-grid">' +
        '<div class="field"><label>Date (local)</label><input type="date" data-fcl="dateLT" value="' + esc(st.dateLT) + '"></div>' +
        '<div class="field"><label>Time (local)</label><input type="time" data-fcl="timeLT" value="' + esc(st.timeLT) + '"></div>' +
        '<div class="field"><label>Local − UTC (hours)</label><input type="number" step="0.5" data-fcl="offsetH" value="' + esc(num(st.offsetMin) == null ? '' : st.offsetMin / 60) + '"></div>' +
        '<div class="field"><label>UTC</label><input type="text" readonly value="' + esc(utc ? utc.replace('T', ' ') : '') + '"></div></div>' +
        '<div class="fcl-row"><div class="fcl-pos">Latitude <input data-fcl="latDeg" inputmode="decimal" placeholder="deg" value="' + esc(st.latDeg) + '">° ' +
        '<input data-fcl="latMin" inputmode="decimal" placeholder="min" value="' + esc(st.latMin) + '">\' ' +
        '<select data-fcl="latHem"><option' + (st.latHem === 'N' ? ' selected' : '') + '>N</option><option' + (st.latHem === 'S' ? ' selected' : '') + '>S</option></select></div>' +
        '<div class="fcl-pos">Longitude <input data-fcl="lonDeg" inputmode="decimal" placeholder="deg" value="' + esc(st.lonDeg) + '">° ' +
        '<input data-fcl="lonMin" inputmode="decimal" placeholder="min" value="' + esc(st.lonMin) + '">\' ' +
        '<select data-fcl="lonHem"><option' + (st.lonHem === 'E' ? ' selected' : '') + '>E</option><option' + (st.lonHem === 'W' ? ' selected' : '') + '>W</option></select></div></div>' +
        tankInputs(st, cols) +
        '<div class="fcl-grid" style="margin-top:8px;">' +
        '<div class="field"><label>Officer in charge — name</label><input data-fcl="signName" value="' + esc(st.signName) + '"></div>' +
        '<div class="field"><label>Rank</label><input data-fcl="signRank" value="' + esc(st.signRank) + '"></div>' +
        '<div class="field"><label>Remarks</label><input data-fcl="remarks" value="' + esc(st.remarks) + '"></div></div>' +
        '<div class="fcl-row"><button type="button" class="ghost small" data-fcl-act="now">Set time to now</button>' +
        '<button type="button" class="ghost small" data-fcl-act="fillrob">Fill tanks from tank ROB</button>' +
        (api.partThreeAvailable && api.partThreeAvailable() && partThreeValues(rec, st, api.density ? api.density() : 890)
          ? '<button type="button" class="ghost small" data-fcl-act="to-orb">Add to ORB Part III C (item 4)</button>' : '') +
        '</div></div>';
    }

    function render() {
      var list = records().slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
      if (!selectedId && list.length) selectedId = list[0].id;
      var rec = current();
      var tanks = api.tanks();
      var names = ((tanks.distillate) || []).map(function (t) { return t.name; });
      var h = '<div class="fcl-row">' +
        '<button type="button" class="primary small" data-fcl-act="new-eca">New ECA record</button>' +
        '<button type="button" class="ghost small" data-fcl-act="new-eu">New EU port record</button>' +
        (list.length ? '<div class="field" style="min-width:220px;flex:1;"><label>Record</label><select data-fcl-act="pick">' + list.map(function (r) {
          return '<option value="' + esc(r.id) + '"' + (r.id === selectedId ? ' selected' : '') + '>' + esc((KIND_LABELS[r.kind] || 'Record') + (r.title ? ' — ' + r.title : '') + ' (' + (r.createdAt || '').slice(0, 10) + ')') + '</option>';
        }).join('') + '</select></div>' : '') + '</div>' +
        '<div class="fcl-tanks">Columns follow this ship\'s distillate tanks: <b>' + (names.length ? esc(names.join(', ')) : 'none set up') + '</b>.</div>';
      if (!rec) {
        host.innerHTML = '<div class="fcl-ui">' + h + '<div class="hint">No changeover record yet. Start one for the next ECA passage or EU port call.</div></div>';
        return;
      }
      var kind = rec.kind === 'eu' ? 'eu' : 'eca';
      var warnings = validate(rec, tanks);
      h += '<div class="fcl-grid"><div class="field"><label>Title / area or port</label><input data-fcl-top="title" value="' + esc(rec.title || '') + '" placeholder="e.g. North American ECA, Rotterdam"></div>' +
        '<div class="field"><label>Company</label><input data-fcl-form="company" value="' + esc((rec.form && rec.form.company) || '') + '" placeholder="Company name on the form"></div>' +
        '<div class="field"><label>Prepared by</label><input data-fcl-form="preparedBy" value="' + esc((rec.form && rec.form.preparedBy) || '') + '"></div>' +
        '<div class="field"><label>Approved by</label><input data-fcl-form="approvedBy" value="' + esc((rec.form && rec.form.approvedBy) || '') + '"></div>' +
        '<div class="field"><label>Revision No.</label><input data-fcl-form="revision" value="' + esc((rec.form && rec.form.revision) || '') + '"></div>' +
        '<div class="field"><label>Date effective</label><input data-fcl-form="effective" value="' + esc((rec.form && rec.form.effective) || '') + '"></div></div>' +
        '<label style="display:flex;gap:6px;align-items:center;margin:8px 0;"><input type="checkbox" data-fcl-act="resid"' + (includeResidual ? ' checked' : '') + '> Show residual (non-compliant) tanks as well</label>';
      h += stagesFor(kind).map(function (d) { return stageHtml(rec, d); }).join('');
      h += warnings.length
        ? warnings.map(function (w) { return '<div class="fcl-warn ' + w.level + '" role="alert">⚠ ' + esc(w.msg) + '</div>'; }).join('')
        : '<div class="fcl-warn ok">No problems found in this record.</div>';
      h += '<div class="fcl-row"><button type="button" class="primary small" data-fcl-act="print">Print log</button>' +
        '<button type="button" class="ghost small" data-fcl-act="print-blank">Print blank form</button>' +
        '<button type="button" class="ghost small" data-fcl-act="delete">Delete record</button></div>';
      host.innerHTML = '<div class="fcl-ui">' + h + '</div>';
    }

    function stageOf(rec, el) {
      var box = el.closest('[data-fcl-stage]');
      var no = box ? Number(box.getAttribute('data-fcl-stage')) : 0;
      return (rec.stages || []).filter(function (s) { return s.no === no; })[0] || null;
    }

    host.addEventListener('change', function (e) {
      var el = e.target;
      var rec = current();
      if (el.getAttribute && el.getAttribute('data-fcl-act') === 'pick') { selectedId = el.value; render(); return; }
      if (el.getAttribute && el.getAttribute('data-fcl-act') === 'resid') { includeResidual = !!el.checked; render(); return; }
      if (!rec) return;
      if (el.hasAttribute('data-fcl-top')) { rec[el.getAttribute('data-fcl-top')] = el.value; persist(rec); return; }
      if (el.hasAttribute('data-fcl-form')) {
        rec.form = rec.form || {};
        rec.form[el.getAttribute('data-fcl-form')] = el.value;
        if (api.rememberForm) api.rememberForm(rec.form);
        persist(rec); return;
      }
      var st = stageOf(rec, el);
      if (!st) return;
      if (el.hasAttribute('data-fcl-rob')) {
        var id = el.getAttribute('data-fcl-rob');
        var other = el.getAttribute('data-fcl-grp') === 'other';
        var bag = other ? (st.resid = st.resid || {}) : (st.rob = st.rob || {});
        if (el.value === '') delete bag[id]; else bag[id] = Number(el.value);
        st.tankNames = st.tankNames || {};
        var col = tankColumns(api.tanks(), rec, { includeResidual: true }).filter(function (c) { return c.id === id; })[0];
        if (col) st.tankNames[id] = col.name.replace(/ \(not on this ship now\)$/, '');
      } else if (el.hasAttribute('data-fcl')) {
        var f = el.getAttribute('data-fcl');
        if (f === 'offsetH') st.offsetMin = el.value === '' ? 0 : Math.round(Number(el.value) * 60);
        else st[f] = el.value;
      }
      persist(rec);
      render();
    });

    host.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-fcl-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-fcl-act');
      var rec = current();
      if (act === 'new-eca' || act === 'new-eu') {
        var r = newRecord(act === 'new-eu' ? 'eu' : 'eca', ctxNew());
        var list = records(); list.push(r); selectedId = r.id;
        api.save(list); render(); return;
      }
      if (!rec) return;
      if (act === 'print') { api.print(buildLogHtml(rec, printCtx()) + planNotesHtml(rec)); return; }
      if (act === 'print-blank') {
        var blank = newRecord(rec.kind, {}); blank.title = rec.title; blank.form = rec.form;
        api.print(buildLogHtml(blank, printCtx())); return;
      }
      if (act === 'delete') {
        if (api.confirm && !api.confirm('Delete this changeover record?')) return;
        var keep = records().filter(function (x) { return x.id !== rec.id; });
        if (api.deleted) api.deleted(rec.id);
        selectedId = keep.length ? keep[0].id : null;
        api.save(keep); render(); return;
      }
      var st = stageOf(rec, btn);
      if (!st) return;
      if (act === 'now') {
        var d = new Date();
        var off = st.offsetMin != null ? st.offsetMin : 0;
        var l = new Date(d.getTime() + off * 60000);
        st.dateLT = l.getUTCFullYear() + '-' + pad(l.getUTCMonth() + 1) + '-' + pad(l.getUTCDate());
        st.timeLT = pad(l.getUTCHours()) + ':' + pad(l.getUTCMinutes());
        persist(rec); render(); return;
      }
      if (act === 'to-orb') {
        var pv = partThreeValues(rec, st, api.density ? api.density() : 890);
        if (pv && api.toOrbPartIII) api.toOrbPartIII(pv);
        return;
      }
      if (act === 'fillrob') {
        var dens = (api.density ? api.density() : 890) / 1000;
        st.rob = st.rob || {}; st.tankNames = st.tankNames || {};
        tankColumns(api.tanks(), rec, { includeResidual: false }).forEach(function (col) {
          var t = ((api.tanks().distillate) || []).filter(function (x) { return x.id === col.id; })[0];
          if (t && num(t.robM3) != null) { st.rob[col.id] = Math.round(Number(t.robM3) * dens * 100) / 100; st.tankNames[col.id] = col.name; }
        });
        persist(rec); render();
      }
    });

    render();
    return { render: render, select: function (id) { selectedId = id; render(); } };
  }

  root.FuelChangeoverLog = {
    ECA_STAGES: ECA_STAGES, EU_STAGES: EU_STAGES, REQUIRED_STAGES: REQUIRED_STAGES, KIND_LABELS: KIND_LABELS,
    stagesFor: stagesFor, utcFromLocal: utcFromLocal, formatPosition: formatPosition, positionComplete: positionComplete,
    tankColumns: tankColumns, robOf: robOf, newRecord: newRecord, blankStage: blankStage,
    validate: validate, compareToPlan: compareToPlan, partThreeValues: partThreeValues, ecaFuelCheck: ecaFuelCheck, euBerthPlan: euBerthPlan, buildLogHtml: buildLogHtml, planNotesHtml: planNotesHtml,
    mount: mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FuelChangeoverLog;
})(typeof window !== 'undefined' ? window : globalThis);
