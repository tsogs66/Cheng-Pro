/**
 * AIO Home operational dashboard helpers — voyage progress weather + dual gauges.
 * Weather sizing matches the approved sample (smaller curved wind tails).
 */
(function (root) {
  'use strict';

  const WIND_MAP = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  const BF_LABELS = [
    'Calm', 'Light air', 'Light breeze', 'Gentle breeze', 'Moderate breeze', 'Fresh breeze',
    'Strong breeze', 'Near gale', 'Gale', 'Strong gale', 'Storm', 'Violent storm', 'Hurricane',
  ];
  const SEA_LABELS = [
    'Glassy', 'Rippled', 'Wavelets', 'Slight', 'Moderate', 'Rough', 'Very rough', 'High', 'Very high', 'Phenomenal',
  ];

  const GAUGE_GEOM = { cx: 80, cy: 78, r: 58, startDeg: -135, sweepDeg: 270 };
  let gaugeUid = 0;

  function windAngleDeg(dir) {
    const key = String(dir || '').toUpperCase().trim();
    return Object.prototype.hasOwnProperty.call(WIND_MAP, key) ? WIND_MAP[key] : null;
  }
  function bfLabel(bft) {
    if (bft == null || isNaN(bft)) return '';
    return BF_LABELS[Math.max(0, Math.min(12, Math.round(Number(bft))))] || '';
  }
  function seaLabel(sea) {
    if (sea == null || isNaN(sea)) return '';
    return SEA_LABELS[Math.max(0, Math.min(9, Math.round(Number(sea))))] || '';
  }
  function fmt(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function fmtFuel(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(1);
  }
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rnd(seed) {
    let t = (seed * 9301 + 49297) % 233280;
    return t / 233280;
  }
  function rndRange(seed, a, b) {
    return a + rnd(seed) * (b - a);
  }

  function windPath(dir, len, bend, kind) {
    const L = len * dir;
    const b = bend;
    const b2 = bend * 0.55;
    if (kind === 0) {
      return `M 0 0
        C ${L * 0.18} ${b * 0.15}  ${L * 0.32} ${b}  ${L * 0.52} ${b * 0.92}
        C ${L * 0.72} ${b * 0.78}  ${L * 0.88} ${b * 0.25}  ${L} ${b * 0.08}`;
    }
    if (kind === 1) {
      return `M 0 0
        C ${L * 0.2} ${b}  ${L * 0.38} ${b * 1.05}  ${L * 0.5} ${b * 0.2}
        C ${L * 0.62} ${-b2}  ${L * 0.82} ${-b2 * 0.4}  ${L} ${b * 0.05}`;
    }
    return `M 0 ${b * 0.35}
      C ${L * 0.15} ${b * 0.9}  ${L * 0.4} ${b * 1.15}  ${L * 0.62} ${b * 0.55}
      C ${L * 0.78} ${b * 0.15}  ${L * 0.92} ${-b * 0.2}  ${L * 1.05} ${-b * 0.35}
      Q ${L * 1.12} ${-b * 0.42}  ${L * 1.18} ${-b * 0.18}`;
  }
  function windArrow(dir, tipX, tipY, size) {
    const back = size * dir;
    return `M ${tipX - back} ${tipY - size * 0.55}
            L ${tipX} ${tipY}
            L ${tipX - back} ${tipY + size * 0.55}`;
  }

  function windLayer(ctx, xL, xR, count) {
    const { windDirX, skyTop, skyBottom, bftEff, windSpeed } = ctx;
    const parts = [];
    const speed = Math.max(0.25, windSpeed || 1);
    for (let i = 0; i < count; i++) {
      const sx = rndRange(i * 17 + 3, xL, xR);
      const sy = rndRange(i * 31 + 11, skyTop + 14, skyBottom - 48);
      const len = rndRange(i * 13 + 5, 18, 36);
      const thick = rndRange(i * 19 + 2, 0.9, 1.5);
      const opBase = rndRange(i * 23 + 7, 0.32, 0.62);
      const op = Math.min(0.85, opBase * (0.75 + 0.05 * (bftEff || 2)));
      const dur = Math.max(0.7, Math.min(7, rndRange(i * 29 + 9, 4.5, 7.0) / speed));
      const delay = (-rndRange(i * 41 + 1, 0, dur)).toFixed(2);
      const travel = rndRange(i * 37 + 4, 70, 140) * speed * windDirX;
      const bob = rndRange(i * 43 + 6, -6, 9);
      const bend = rndRange(i * 47 + 8, 5, 12) * (rnd(i * 51) > 0.5 ? 1 : -1);
      const kind = Math.floor(rnd(i * 57 + 9) * 3);
      const d = windPath(windDirX, len, bend, kind);
      const d2 = windPath(windDirX, len * 0.82, bend * 0.72, kind);
      const tipX = len * windDirX * (kind === 2 ? 1.18 : 1);
      const tipY = kind === 2 ? -bend * 0.18 : bend * 0.08;
      const arrow = windArrow(windDirX, tipX, tipY, rndRange(i * 61 + 3, 2.25, 3.75));
      const midX = len * windDirX * 0.55;
      const midY = bend * (kind === 1 ? 0.2 : 0.7);
      const midArrow = windArrow(windDirX, midX, midY, 1.75);
      parts.push(`<g transform="translate(${sx.toFixed(1)}, ${sy.toFixed(1)})" opacity="${op.toFixed(2)}">
        <g>
          <animateTransform attributeName="transform" type="translate"
            from="0 0" to="${travel.toFixed(1)} ${bob.toFixed(1)}"
            dur="${dur.toFixed(2)}s" begin="${delay}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;${op.toFixed(2)};${op.toFixed(2)};0"
            keyTimes="0;0.1;0.8;1" dur="${dur.toFixed(2)}s" begin="${delay}s" repeatCount="indefinite"/>
          <path d="${d}" fill="none" stroke="var(--paper)" stroke-width="${thick.toFixed(2)}"
            stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${d2}" fill="none" stroke="var(--paper-dim)" stroke-width="${(thick * 0.45).toFixed(2)}"
            stroke-linecap="round" opacity="0.55" transform="translate(0, ${(bend > 0 ? 2.5 : -2.5)})"/>
          <path d="${arrow}" fill="none" stroke="var(--paper)" stroke-width="${Math.max(1.2, thick * 0.85).toFixed(2)}"
            stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${midArrow}" fill="none" stroke="var(--paper)" stroke-width="1.1"
            stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
        </g>
      </g>`);
    }
    return parts.join('');
  }

  function rainLayer(ctx, xL, xR, count) {
    const { windDirX, skyTop, skyBottom, bftEff, windSpeed } = ctx;
    const parts = [];
    const lean = windDirX * (6 + bftEff * 1.2);
    const speed = Math.max(0.25, windSpeed || 1);
    for (let i = 0; i < count; i++) {
      const sx = rndRange(i * 53 + 8, xL - 10, xR + 10);
      const sy = rndRange(i * 59 + 14, skyTop - 20, skyBottom - 50);
      const dropH = rndRange(i * 61 + 3, 4.5, 9.5);
      const dropW = rndRange(i * 67 + 5, 0.9, 1.7);
      const fall = Math.max(30, skyBottom - sy - 4);
      const drift = windDirX * fall * rndRange(i * 71 + 2, 0.12, 0.32) * Math.min(1.8, 0.7 + speed * 0.15);
      const dur = Math.max(0.45, Math.min(2.2, rndRange(i * 73 + 9, 0.85, 1.85) / speed));
      const delay = (-rndRange(i * 79 + 4, 0, dur * 2.5)).toFixed(2);
      const op = rndRange(i * 83 + 6, 0.35, 0.7);
      parts.push(`<g transform="translate(${sx.toFixed(1)}, ${sy.toFixed(1)}) rotate(${lean.toFixed(1)})">
        <g opacity="${op.toFixed(2)}">
          <animateTransform attributeName="transform" type="translate"
            from="0 0" to="${drift.toFixed(1)} ${fall.toFixed(1)}"
            dur="${dur.toFixed(2)}s" begin="${delay}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;${op.toFixed(2)};${op.toFixed(2)};0"
            keyTimes="0;0.08;0.82;1" dur="${dur.toFixed(2)}s" begin="${delay}s" repeatCount="indefinite"/>
          <ellipse cx="0" cy="${(dropH / 2).toFixed(1)}" rx="${(dropW / 2).toFixed(2)}" ry="${(dropH / 2).toFixed(2)}"
            fill="var(--paper-dim)"/>
        </g>
      </g>`);
    }
    return parts.join('');
  }

  function seaChop(xL, xR, y, localAmp, chopY, seaDur) {
    let localSea = `M ${xL} ${y + 20}`;
    for (let x = xL; x <= xR; x += 14) localSea += ` q 7 ${localAmp} 14 0`;
    let localSea2 = `M ${xL + 4} ${y + 28}`;
    for (let x = xL + 4; x <= xR; x += 14) localSea2 += ` q 7 ${localAmp * 0.75} 14 0`;
    return `<g class="voyage-sea-local" style="--chop-y:${chopY}px; --sea-dur:${seaDur}s;">
      <path d="${localSea}" fill="none" stroke="var(--teal)" stroke-width="1.8" opacity="0.45"/>
      <path d="${localSea2}" fill="none" stroke="var(--teal)" stroke-width="1.2" opacity="0.28"/>
    </g>`;
  }

  function renderVoyageProgressViz(el, snap, mode) {
    if (!el) return;
    const total = snap && snap.totalDistance;
    if (total == null || !(total > 0)) {
      el.innerHTML = `<div class="hint">Set Total Voyage Distance in Voyage Chief → Voyage Setup to see progress here.</div>`;
      return;
    }
    const traveled = Math.max(0, Number(snap.traveled) || 0);
    const pct = Math.max(0, Math.min(1, traveled / total));
    const x0 = 70;
    const x1 = 830;
    const y = 160;
    const shipX = x0 + pct * (x1 - x0);
    const wx = snap.weather || {};
    const windDir = wx.windDir || '';
    const windBft = wx.windBft != null && wx.windBft !== '' ? Number(wx.windBft) : null;
    const seaState = wx.seaState != null && wx.seaState !== '' ? Number(wx.seaState) : null;
    const windAngle = windAngleDeg(windDir);
    const bftEff = windBft != null ? windBft : (windDir ? 3 : 2);
    const seaEff = seaState != null ? seaState : Math.min(9, Math.max(1, Math.round(bftEff * 0.7)));
    const skyTop = y - 188;
    const skyBottom = y - 10;
    const angleFrom = windAngle != null ? windAngle : 270;
    const blowToDeg = (angleFrom + 180) % 360;
    const windDirX = Math.sin(blowToDeg * Math.PI / 180) >= 0 ? 1 : -1;
    const BF_KN = [0.5, 2, 5, 8.5, 13.5, 19, 24.5, 30.5, 37, 44, 51.5, 59.5, 68];
    const windSpeed = ((BF_KN[Math.max(0, Math.min(12, Math.round(bftEff)))] || 5) / 5) * 0.5;
    const ctx = { windDirX, skyTop, skyBottom, bftEff, windSpeed };
    const chopY = 2 + seaEff * 0.9;
    const seaDur = Math.max(1.1, 3.6 - seaEff * 0.22 - bftEff * 0.08);
    const localAmp = 3 + seaEff * 1.1;
    const trackAmp = 5 + seaEff * 1.4;
    let wave1 = `M ${x0 - 20} ${y + 22}`;
    let wave2 = `M ${x0 - 20} ${y + 34}`;
    for (let x = x0 - 20; x <= x1 + 20; x += 24) {
      wave1 += ` q 12 ${trackAmp} 24 0`;
      wave2 += ` q 12 ${trackAmp * 0.85} 24 0`;
    }
    const full = mode !== 'local';
    const sea = full
      ? seaChop(x0, x1, y, localAmp, chopY, seaDur)
      : seaChop(shipX - 70, shipX + 70, y, localAmp, chopY, seaDur);
    const wxRange = full ? [x0, x1] : [shipX - 90, shipX + 90];
    const weather = bftEff >= 1
      ? `<g clip-path="url(#homeSkyAboveSea)" pointer-events="none">${
          windLayer(ctx, wxRange[0], wxRange[1], full ? Math.round(8 + bftEff * 3) : Math.round(6 + bftEff * 2))
        }${
          rainLayer(ctx, wxRange[0], wxRange[1], full ? 40 + Math.round(bftEff * 10) : 20 + Math.round(bftEff * 4))
        }</g>`
      : '';
    const dep = esc(snap.departPort || 'Departure');
    const arr = esc(snap.arrivePort || 'Arrival');
    const bfTxt = windBft != null
      ? `BF ${fmt(windBft, 0)}${windDir ? ' · ' + windDir : ''}`
      : (windDir || '');
    const bfName = bfLabel(windBft);
    const seaTxt = seaState != null
      ? `Sea ${fmt(seaState, 0)}${seaLabel(seaState) ? ' · ' + seaLabel(seaState) : ''}`
      : '';
    const wxLines = [];
    if (bfTxt) wxLines.push({ text: bfTxt, fill: '#e0b56a', size: 11, weight: 600 });
    if (bfName) wxLines.push({ text: bfName, fill: '#f4f0e6', size: 10, weight: 500 });
    if (seaTxt) wxLines.push({ text: seaTxt, fill: '#7ed4cb', size: 10, weight: 500 });
    const wxWidth = wxLines.length
      ? Math.max(118, Math.min(200, Math.ceil(Math.max(...wxLines.map((l) => l.text.length)) * 6.6) + 20))
      : 0;
    const wxHeight = wxLines.length ? Math.max(22, 8 + wxLines.length * 14) : 0;
    let badgeX = shipX + 60;
    if (badgeX + wxWidth > 896) badgeX = Math.max(4, shipX - 70 - wxWidth);
    const badgeY = y - Math.floor(wxHeight / 2);
    let badgeSvg = '';
    if (wxLines.length) {
      badgeSvg = `<g pointer-events="none">
        <rect x="${badgeX}" y="${badgeY}" width="${wxWidth}" height="${wxHeight}" rx="5"
          fill="rgba(8,16,28,0.92)" stroke="rgba(233,228,214,0.35)"/>
        ${wxLines.map((line, i) =>
          `<text x="${badgeX + 10}" y="${badgeY + 16 + i * 14}" fill="${line.fill}"
            font-family="'IBM Plex Mono',monospace" font-size="${line.size}" font-weight="${line.weight}">${esc(line.text)}</text>`
        ).join('')}
      </g>`;
    }
    const upperHull = `M ${shipX - 44} ${y + 9} L ${shipX - 44} ${y + 4} L ${shipX + 24} ${y + 4} L ${shipX + 46} ${y + 9} Z`;
    const lowerHull = `M ${shipX - 44} ${y + 18} L ${shipX - 44} ${y + 9} L ${shipX + 46} ${y + 9} L ${shipX + 24} ${y + 18} Z`;
    const speedTxt = snap.lastSpeed != null ? `${fmt(snap.lastSpeed, 1)} kn` : '';
    const cx = 852, cy = 40, r = 24;
    const needleSvgDeg = blowToDeg - 90;
    const fromLabel = windDir || (windAngle != null ? String(Math.round(windAngle)) + '°' : '—');
    let compassTicks = '';
    for (let d = 0; d < 360; d += 30) {
      const rad = (d - 90) * Math.PI / 180;
      const major = d % 90 === 0;
      const r0 = major ? r - 5 : r - 3;
      compassTicks += `<line x1="${cx + Math.cos(rad) * r0}" y1="${cy + Math.sin(rad) * r0}" x2="${cx + Math.cos(rad) * r}" y2="${cy + Math.sin(rad) * r}" stroke="var(--paper-dim)" stroke-width="${major ? 1.4 : 0.8}" opacity="${major ? 0.85 : 0.45}"/>`;
    }
    const compassSvg = `<g class="voyage-compass" pointer-events="none">
      <text x="${cx}" y="${cy - r - 6}" text-anchor="middle" fill="#e0b56a" font-family="monospace" font-size="9" font-weight="600">FROM ${esc(fromLabel)}</text>
      <circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="rgba(8,16,28,0.72)" stroke="rgba(233,228,214,0.28)" stroke-width="1"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--paper-dim)" stroke-width="1.1" opacity="0.7"/>
      ${compassTicks}
      <text x="${cx}" y="${cy - r + 10}" text-anchor="middle" fill="var(--brass)" font-family="Georgia,serif" font-size="9" font-weight="700">N</text>
      <text x="${cx + r - 6}" y="${cy + 3}" text-anchor="middle" fill="var(--paper-dim)" font-family="Georgia,serif" font-size="8" font-weight="600">E</text>
      <text x="${cx}" y="${cy + r - 2}" text-anchor="middle" fill="var(--paper-dim)" font-family="Georgia,serif" font-size="8" font-weight="600">S</text>
      <text x="${cx - r + 6}" y="${cy + 3}" text-anchor="middle" fill="var(--paper-dim)" font-family="Georgia,serif" font-size="8" font-weight="600">W</text>
      <g transform="rotate(${needleSvgDeg} ${cx} ${cy})">
        <line x1="${cx}" y1="${cy}" x2="${cx + r - 6}" y2="${cy}" stroke="#e0b56a" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M ${cx + r - 2} ${cy} L ${cx + r - 10} ${cy - 4.5} L ${cx + r - 10} ${cy + 4.5} Z" fill="#e0b56a"/>
        <circle cx="${cx}" cy="${cy}" r="2.4" fill="#e0b56a" stroke="#8a6b3c" stroke-width="0.8"/>
      </g>
    </g>`;
    el.innerHTML = `
      <svg viewBox="0 0 900 340" class="home-voyage-svg" style="width:100%;height:auto;max-height:360px;background:rgba(18,34,56,.03);border-radius:12px">
        <defs><clipPath id="homeSkyAboveSea"><rect x="0" y="0" width="900" height="${y - 8}"/></clipPath></defs>
        <g class="voyage-wave"><path d="${wave1}" fill="none" stroke="var(--teal)" stroke-width="1.5" opacity="0.28"/></g>
        <g class="voyage-wave" style="animation-delay:-2.5s"><path d="${wave2}" fill="none" stroke="var(--teal)" stroke-width="1.5" opacity="0.16"/></g>
        ${sea}
        ${weather}
        ${compassSvg}
        <line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="var(--line-strong)" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>
        <line x1="${x0}" y1="${y}" x2="${shipX}" y2="${y}" stroke="var(--brass)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${x0}" cy="${y}" r="7" fill="var(--teal)"/>
        <circle cx="${x1}" cy="${y}" r="7" fill="none" stroke="var(--paper-dim)" stroke-width="2"/>
        <text x="${x0}" y="${y - 46}" text-anchor="start" fill="var(--paper)" font-family="Georgia,serif" font-size="15" font-weight="600">${dep}</text>
        <text x="${x0}" y="${y - 28}" text-anchor="start" fill="var(--paper-dim)" font-family="monospace" font-size="11">0 nm</text>
        <text x="${x1}" y="${y - 46}" text-anchor="end" fill="var(--paper)" font-family="Georgia,serif" font-size="15" font-weight="600">${arr}</text>
        <text x="${x1}" y="${y - 28}" text-anchor="end" fill="var(--paper-dim)" font-family="monospace" font-size="11">${fmt(total, 0)} nm</text>
        <g class="voyage-ship">
          <path d="${upperHull}" fill="#7a1f2b" stroke="var(--ink)" stroke-width="1"/>
          <path d="${lowerHull}" fill="#0d0d0d" stroke="var(--ink)" stroke-width="1"/>
          <line x1="${shipX - 44}" y1="${y + 9}" x2="${shipX + 46}" y2="${y + 9}" stroke="var(--brass)" stroke-width="2"/>
          <rect x="${shipX - 40}" y="${y - 8}" width="20" height="12" fill="var(--paper)" stroke="var(--ink)"/>
          <rect x="${shipX - 35}" y="${y - 16}" width="12" height="8" fill="var(--paper)" stroke="var(--ink)"/>
          <rect x="${shipX - 31}" y="${y - 25}" width="6" height="9" fill="var(--ink)"/>
        </g>
        ${badgeSvg}
        ${speedTxt ? `<text x="${shipX}" y="${y - 56}" text-anchor="middle" fill="var(--teal)" font-family="monospace" font-size="11" font-weight="600">${speedTxt}</text>` : ''}
        <text x="${(shipX + x1) / 2}" y="${y - 18}" text-anchor="middle" fill="var(--paper-dim)" font-family="monospace" font-size="11">${fmt(Math.max(0, total - traveled), 0)} nm to go</text>
        <text x="${shipX}" y="${y + 48}" text-anchor="middle" fill="var(--brass)" font-family="monospace" font-size="13" font-weight="600">${fmt(traveled, 0)} nm</text>
        <text x="${shipX}" y="${y + 64}" text-anchor="middle" fill="var(--paper-dim)" font-family="monospace" font-size="10">${(pct * 100).toFixed(1)}% complete</text>
      </svg>`;
  }

  /**
   * Voyage Chief–style progress strip: Days at Sea, Days To Go, ETA.
   */
  function renderVoyageProgressStrip(el, snap) {
    if (!el) return;
    if (!snap || !snap.ok) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const daysAtSea = snap.daysAtSea != null && isFinite(snap.daysAtSea)
      ? fmt(snap.daysAtSea, 2)
      : '0.00';
    const daysToGo = snap.daysToGo != null && isFinite(snap.daysToGo)
      ? fmt(snap.daysToGo, 2)
      : '—';
    const eta = snap.etaLabel || '—';
    el.innerHTML = `
      <div class="stat"><div class="num">${daysAtSea}</div><div class="lbl">Days at Sea</div></div>
      <div class="stat"><div class="num">${daysToGo}</div><div class="lbl">Days To Go</div></div>
      <div class="stat"><div class="num">${esc(eta)}</div><div class="lbl">ETA</div></div>`;
  }

  function gaugePctToDeg(p) {
    return GAUGE_GEOM.startDeg + Math.max(0, Math.min(1, p || 0)) * GAUGE_GEOM.sweepDeg;
  }
  function gaugePolar(cx, cy, radius, deg) {
    const rad = deg * Math.PI / 180;
    return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
  }
  function gaugeNeedle(cx, cy, r, deg) {
    const tip = gaugePolar(cx, cy, r, deg);
    return `<g><line x1="${cx}" y1="${cy}" x2="${tip.x}" y2="${tip.y}" stroke="#e9e4d6" stroke-width="2" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="7" fill="#c99a53" stroke="#8a6b3c" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="2.5" fill="#1a2433"/></g>`;
  }
  function gaugeStartMarker(cx, cy, r, deg) {
    const inner = gaugePolar(cx, cy, r - 14, deg);
    const outer = gaugePolar(cx, cy, r + 2, deg);
    return `<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" stroke="#e9e4d6" stroke-width="3" stroke-linecap="round"/>`;
  }
  function gaugeTicks(cx, cy, r) {
    let ticks = '';
    for (let i = 0; i <= 10; i++) {
      const deg = gaugePctToDeg(i / 10);
      const outer = gaugePolar(cx, cy, r - 4, deg);
      const inner = gaugePolar(cx, cy, r - (i % 2 === 0 ? 12 : 7), deg);
      ticks += `<line x1="${outer.x}" y1="${outer.y}" x2="${inner.x}" y2="${inner.y}" stroke="rgba(233,228,214,${i % 2 === 0 ? 0.55 : 0.28})" stroke-width="${i % 2 === 0 ? 1.6 : 1}"/>`;
    }
    return ticks;
  }
  function gaugeArcPath(cx, cy, r, endDeg, largeArc) {
    const start = gaugePolar(cx, cy, r, GAUGE_GEOM.startDeg);
    const end = gaugePolar(cx, cy, r, endDeg);
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc ? 1 : 0} 1 ${end.x} ${end.y}`;
  }
  function dualGaugeSVG(startPct, currentPct, colorOverride) {
    startPct = Math.max(0, Math.min(1, startPct || 0));
    currentPct = Math.max(0, Math.min(1, currentPct || 0));
    const curDeg = gaugePctToDeg(currentPct);
    const startDeg = gaugePctToDeg(startPct);
    const arcColor = colorOverride || (currentPct < 0.15 ? '#c1573a' : (currentPct < 0.35 ? '#c99a53' : '#57b3ab'));
    const gid = ++gaugeUid;
    const { cx, cy, r } = GAUGE_GEOM;
    const endPt = GAUGE_GEOM.startDeg + GAUGE_GEOM.sweepDeg;
    const large = (curDeg - GAUGE_GEOM.startDeg) > 180;
    return `<svg class="analog-gauge" viewBox="0 0 160 150">
      <defs><radialGradient id="home-bezel-${gid}" cx="35%" cy="30%"><stop offset="0%" stop-color="#4a5568"/><stop offset="100%" stop-color="#0a1018"/></radialGradient></defs>
      <ellipse cx="${cx}" cy="${cy + 18}" rx="46" ry="8" fill="rgba(0,0,0,0.35)"/>
      <circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="url(#home-bezel-${gid})" stroke="#2a3545" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="#0e1c30" stroke="rgba(233,228,214,0.08)"/>
      ${gaugeTicks(cx, cy, r)}
      <path d="${gaugeArcPath(cx, cy, r, endPt, 1)}" fill="none" stroke="rgba(233,228,214,0.1)" stroke-width="9" stroke-linecap="round"/>
      <path d="${gaugeArcPath(cx, cy, r, curDeg, large)}" fill="none" stroke="${arcColor}" stroke-width="7" stroke-linecap="round"/>
      ${gaugeStartMarker(cx, cy, r, startDeg)}
      ${gaugeNeedle(cx, cy, r, curDeg)}
    </svg>`;
  }

  function tankCap(capacity, tank) {
    if (!tank) return 0;
    if (capacity && capacity[tank.id] != null) return Number(capacity[tank.id]) || 0;
    return Number(tank.capacity) || 0;
  }
  function tankRob(rob, tank) {
    if (!tank || !rob) return 0;
    return Number(rob[tank.id]) || 0;
  }
  function gaugeColor(tank) {
    const g = String(tank.grade || tank.name || '').toUpperCase();
    if (g.includes('DO') || g.includes('MGO') || g.includes('MDO') || g.includes('LSMGO')) return '#5f9e6e';
    if (g.includes('LS')) return '#57b3ab';
    return '#c99a53';
  }

  function renderFuelGauges(el, snap) {
    if (!el) return;
    const tanks = (snap && snap.fuelTanks) || [];
    if (!tanks.length) {
      el.innerHTML = `<div class="hint">No fuel tanks in Voyage setup yet — open Voyage Chief → Vessel Data.</div>`;
      return;
    }
    el.innerHTML = tanks.map((t) => {
      const cap = tankCap(snap.capacity, t) || 1;
      const startVal = tankRob(snap.robStart, t);
      const curVal = tankRob(snap.robCurrent, t);
      const used = (snap.robUsed && snap.robUsed[t.id] != null)
        ? Math.max(0, Number(snap.robUsed[t.id]) || 0)
        : Math.max(0, startVal - curVal);
      return `<div class="gauge-box">${dualGaugeSVG(startVal / cap, curVal / cap, gaugeColor(t))}
        <div class="gauge-value">${fmtFuel(curVal)}</div>
        <div class="gauge-cap">start ${fmtFuel(startVal)} · used ${fmtFuel(used)} MT</div>
        <div class="gauge-label">${esc(t.name || t.id)}</div></div>`;
    }).join('');
  }

  function fmtNum(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  }

  function renderFuelTankOverview(summaryEl, gridEl, bundle) {
    const tanks = (bundle && bundle.tanks && bundle.tanks.fuel) || [];
    const readings = (bundle && bundle.readings) || {};
    let capacity = 0;
    let volume = 0;
    let weight = 0;
    let withReading = 0;
    for (const t of tanks) {
      capacity += Number(t.capacity) || 0;
      const r = readings[t.id];
      if (r && r.result) {
        volume += Number(r.result.volumeObserved) || 0;
        weight += Number(r.result.weightMT) || 0;
        withReading += 1;
      }
    }
    const pct = capacity ? (volume / capacity) * 100 : 0;
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card"><div class="label"><span class="cat-dot cat-fuel"></span>Fuel Oil Volume</div>
          <div class="value">${fmtNum(volume, 1)}<span class="unit">m³ / ${fmtNum(capacity, 0)}</span></div>
          <div class="sub">${withReading}/${tanks.length} logged · ${fmtNum(pct, 1)}% full</div></div>
        <div class="card"><div class="label">Fuel Weight</div>
          <div class="value">${fmtNum(weight, 1)}<span class="unit">MT</span></div></div>
        <div class="card"><div class="label">Fuel Readings</div>
          <div class="value">${withReading}<span class="unit">/ ${tanks.length}</span></div></div>`;
    }
    if (!gridEl) return;
    if (!tanks.length) {
      gridEl.innerHTML = `<div class="hint">No fuel tanks on this vessel in Tank Chief yet.</div>`;
      return;
    }
    gridEl.innerHTML = tanks.map((t) => {
      const r = readings[t.id];
      const fill = r?.result?.fillPercent;
      const vol = r?.result?.volumeObserved;
      const mt = r?.result?.weightMT;
      const fillH = fill != null ? Math.max(8, Math.min(85, fill * 0.55)) : 8;
      return `<div class="tg-card">
        <div class="tg-name">${esc(t.name)}</div>
        <div class="tg-art">
          <div class="shell"></div>
          <div class="fill" style="height:${fillH}%"></div>
          <div class="tg-pct">${fill != null ? Math.round(fill) + '%' : '—'}</div>
        </div>
        <div class="tg-stats"><span>Vol</span><b>${vol != null ? fmtNum(vol, 1) + ' m³' : '—'}</b>
          <span>MT</span><b>${mt != null ? fmtNum(mt, 1) : '—'}</b></div>
      </div>`;
    }).join('');
  }

  root.ChengProHomeDashboard = {
    renderVoyageProgressViz,
    renderVoyageProgressStrip,
    renderFuelGauges,
    renderFuelTankOverview,
    windAngleDeg,
    bfLabel,
    seaLabel,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
