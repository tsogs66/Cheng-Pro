/**
 * Main-engine performance scramble solver.
 * Given vessel reference data + any sufficient subset of operating inputs,
 * derives RPM, %MCR, kW, SFOC/SLOC, consumptions, IHP/SHP, projections.
 *
 * Formulas follow Voyage Chief / Nautical Solver / propeller-law practice:
 *   P/P_mcr = (N/N_mcr)^n
 *   SFOC(L) = SFOC100 × (a + b × L²)   (L = load fraction)
 *   fuel kg/h = SFOC(g/kWh) × kW / 1000
 *   ISO SFOC = measured × (LCV_ref / LCV_actual)
 */
(function (root) {
  'use strict';

  const NM_METERS = 1852;
  const DEFAULT_LCV_REF = 42700;
  const DEFAULT_MECH_EFF = 0.90;
  const DEFAULT_FUEL_DENSITY = 0.96; // kg/L typical HFO
  const DEFAULT_LUBE_DENSITY = 0.89; // kg/L
  const DEFAULT_PROP_EXP = 3;

  function num(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function has(v) {
    return v != null && !Number.isNaN(v);
  }

  function round(v, d) {
    if (!has(v)) return null;
    const f = 10 ** (d == null ? 3 : d);
    return Math.round(v * f) / f;
  }

  function sfocCurveCoefficients(sfoc100, sfoc85) {
    if (!has(sfoc100) || !(sfoc100 > 0)) return null;
    if (has(sfoc85) && sfoc85 > 0) {
      const ratio = sfoc85 / sfoc100;
      const b = (1 - ratio) / 0.2775;
      const a = 1 - b;
      return { a, b, calibrated: true };
    }
    return { a: 0.25, b: 0.75, calibrated: false };
  }

  function referenceSfocAtLoad(sfoc100, coeffs, mcrPct) {
    if (!has(sfoc100) || !coeffs || !has(mcrPct)) return null;
    const load = Math.max(10, Math.min(110, mcrPct)) / 100;
    return sfoc100 * (coeffs.a + coeffs.b * load * load);
  }

  function lcvCorrectionFactor(lcvRef, lcvActual) {
    const ref = has(lcvRef) && lcvRef > 0 ? lcvRef : DEFAULT_LCV_REF;
    if (!has(lcvActual) || !(lcvActual > 0)) return 1;
    return ref / lcvActual;
  }

  function isoCorrectedSfoc(measuredSfoc, lcvRef, lcvActual) {
    if (!has(measuredSfoc)) return null;
    return measuredSfoc * lcvCorrectionFactor(lcvRef, lcvActual);
  }

  /**
   * @param {object} basis  vessel reference (mcrRpm, mcrKw, sfoc100, …)
   * @param {object} input  user operating values (any subset)
   * @returns {{ values, derivedFrom, notes, suggestions }}
   */
  function solve(basis, input) {
    const b = basis || {};
    const i = input || {};

    const mcrRpm = num(b.mcrRpm);
    const mcrKw = num(b.mcrKw);
    const sfoc100 = num(b.sfoc100);
    const sfoc85 = num(b.sfoc85);
    const slocRef = num(b.slocRef);
    const pitch = num(b.pitch);
    const mechEff = num(b.mechEff) || DEFAULT_MECH_EFF;
    const fuelDensity = num(b.fuelDensity) || DEFAULT_FUEL_DENSITY;
    const lubeDensity = num(b.lubeDensity) || DEFAULT_LUBE_DENSITY;
    const lcvRef = num(b.lcvRef) || DEFAULT_LCV_REF;
    const lcvActual = num(b.lcvActual);
    const propExp = num(b.propLawExp) || DEFAULT_PROP_EXP;

    const coeffs = sfocCurveCoefficients(sfoc100, sfoc85);

    /* ---- Time / period integration ---- */
    let watchHours = num(i.hours);
    const periodStart = i.periodStart ? Date.parse(i.periodStart) : NaN;
    const periodEnd = i.periodEnd ? Date.parse(i.periodEnd) : NaN;
    const clockChangeHrs = num(i.clockChangeHrs);
    if ((!has(watchHours) || !(watchHours > 0))
      && Number.isFinite(periodStart) && Number.isFinite(periodEnd) && periodEnd > periodStart) {
      watchHours = (periodEnd - periodStart) / 3600000;
      if (has(clockChangeHrs)) watchHours += clockChangeHrs;
    }
    let meRunHours = num(i.meRunHours);
    if (!has(meRunHours) || !(meRunHours > 0)) meRunHours = watchHours;
    /* Period consumption / SFOC weighting uses M/E run hours when available. */
    const hours = has(meRunHours) && meRunHours > 0 ? meRunHours : null;

    const revStart = num(i.revStart);
    const revEnd = num(i.revEnd);
    let revDelta = null;
    let rpmFromRevs = null;
    if (has(revStart) && has(revEnd) && revEnd >= revStart && has(hours) && hours > 0) {
      revDelta = revEnd - revStart;
      rpmFromRevs = revDelta / (hours * 60);
    }

    const distanceNm = num(i.distanceNm);

    const out = {
      rpm: num(i.rpm) != null ? num(i.rpm) : rpmFromRevs,
      mcrPct: num(i.mcrPct),
      kw: num(i.kw),
      sfoc: num(i.sfoc),
      sloc: num(i.sloc),
      fuelKgHr: num(i.fuelKgHr),
      fuelLhr: num(i.fuelLhr),
      lubeKgHr: num(i.lubeKgHr),
      lubeLhr: num(i.lubeLhr),
      hours,
      fuelKgPeriod: num(i.fuelKgPeriod),
      fuelLPeriod: num(i.fuelLPeriod),
      lubeKgPeriod: num(i.lubeKgPeriod),
      lubeLPeriod: num(i.lubeLPeriod),
    };

    const derivedFrom = {};
    const notes = [];

    if (has(rpmFromRevs) && !has(num(i.rpm))) {
      derivedFrom.rpm = 'Δ revs ÷ (M/E run hours × 60)';
    }
    if (i.periodStart && i.periodEnd && !has(num(i.hours)) && has(watchHours)) {
      notes.push('Watch hours derived from period start/end' + (has(clockChangeHrs) ? ' (incl. clock change)' : '') + '.');
    }
    if (has(meRunHours) && has(watchHours) && meRunHours !== watchHours) {
      notes.push('Period fuel/SFOC uses M/E run hours (' + round(meRunHours, 2) + ' h), not watch hours.');
    }

    function set(key, value, from) {
      if (!has(value)) return false;
      if (has(out[key])) return false;
      out[key] = value;
      derivedFrom[key] = from;
      return true;
    }

    // Period → hourly rates when hours known
    if (has(out.hours) && out.hours > 0) {
      if (has(out.fuelKgPeriod)) set('fuelKgHr', out.fuelKgPeriod / out.hours, 'fuel period ÷ hours');
      if (has(out.fuelLPeriod)) set('fuelLhr', out.fuelLPeriod / out.hours, 'fuel L period ÷ hours');
      if (has(out.lubeKgPeriod)) set('lubeKgHr', out.lubeKgPeriod / out.hours, 'lube period ÷ hours');
      if (has(out.lubeLPeriod)) set('lubeLhr', out.lubeLPeriod / out.hours, 'lube L period ÷ hours');
    }

    // Density bridges kg ↔ L
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;

      if (has(out.fuelKgHr) && fuelDensity > 0) {
        changed = set('fuelLhr', out.fuelKgHr / fuelDensity, 'fuel kg/h ÷ density') || changed;
      }
      if (has(out.fuelLhr) && fuelDensity > 0) {
        changed = set('fuelKgHr', out.fuelLhr * fuelDensity, 'fuel L/h × density') || changed;
      }
      if (has(out.lubeKgHr) && lubeDensity > 0) {
        changed = set('lubeLhr', out.lubeKgHr / lubeDensity, 'lube kg/h ÷ density') || changed;
      }
      if (has(out.lubeLhr) && lubeDensity > 0) {
        changed = set('lubeKgHr', out.lubeLhr * lubeDensity, 'lube L/h × density') || changed;
      }

      // Propeller law / MCR triangle: rpm ↔ mcrPct ↔ kw
      if (has(mcrRpm) && mcrRpm > 0 && has(mcrKw) && mcrKw > 0) {
        if (has(out.rpm) && out.rpm > 0) {
          const ratio = out.rpm / mcrRpm;
          const pct = Math.pow(ratio, propExp) * 100;
          const kw = Math.pow(ratio, propExp) * mcrKw;
          changed = set('mcrPct', pct, '(RPM/MCR RPM)^n × 100') || changed;
          changed = set('kw', kw, '(RPM/MCR RPM)^n × MCR kW') || changed;
        }
        if (has(out.mcrPct) && out.mcrPct > 0) {
          const load = out.mcrPct / 100;
          changed = set('kw', load * mcrKw, '%MCR × MCR kW') || changed;
          changed = set('rpm', mcrRpm * Math.pow(load, 1 / propExp), 'MCR RPM × (%MCR/100)^(1/n)') || changed;
        }
        if (has(out.kw) && out.kw > 0) {
          const load = out.kw / mcrKw;
          changed = set('mcrPct', load * 100, 'kW / MCR kW × 100') || changed;
          changed = set('rpm', mcrRpm * Math.pow(load, 1 / propExp), 'MCR RPM × (kW/MCR)^(1/n)') || changed;
        }
      } else if (has(mcrKw) && mcrKw > 0) {
        if (has(out.kw)) changed = set('mcrPct', (out.kw / mcrKw) * 100, 'kW / MCR kW') || changed;
        if (has(out.mcrPct)) changed = set('kw', (out.mcrPct / 100) * mcrKw, '%MCR × MCR kW') || changed;
      } else if (has(mcrRpm) && mcrRpm > 0 && has(out.rpm)) {
        changed = set('mcrPct', Math.pow(out.rpm / mcrRpm, propExp) * 100, '(RPM/MCR RPM)^n') || changed;
      }

      // Measured fuel + power → SFOC before applying shop-trial curve
      if (has(out.fuelKgHr) && out.fuelKgHr > 0 && has(out.kw) && out.kw > 0) {
        changed = set('sfoc', (out.fuelKgHr * 1000) / out.kw, 'fuel kg/h × 1000 / kW') || changed;
      }
      if (has(out.lubeKgHr) && out.lubeKgHr > 0 && has(out.kw) && out.kw > 0) {
        changed = set('sloc', (out.lubeKgHr * 1000) / out.kw, 'lube kg/h × 1000 / kW') || changed;
      }

      // Shop-trial curve only when SFOC still unknown
      if (!has(out.sfoc) && coeffs && has(out.mcrPct)) {
        const est = referenceSfocAtLoad(sfoc100, coeffs, out.mcrPct);
        if (has(est)) {
          out.sfoc = est;
          derivedFrom.sfoc = 'shop-trial SFOC curve at %MCR';
          changed = true;
        }
      }

      if (!has(out.sloc) && has(slocRef) && slocRef > 0) {
        changed = set('sloc', slocRef, 'vessel SLOC reference') || changed;
      }

      // SFOC / SLOC → consumption or power
      if (has(out.sfoc) && out.sfoc > 0 && has(out.kw) && out.kw > 0) {
        changed = set('fuelKgHr', (out.sfoc * out.kw) / 1000, 'SFOC × kW / 1000') || changed;
      }
      if (has(out.fuelKgHr) && out.fuelKgHr > 0 && has(out.sfoc) && out.sfoc > 0) {
        changed = set('kw', (out.fuelKgHr * 1000) / out.sfoc, 'fuel kg/h × 1000 / SFOC') || changed;
      }
      if (has(out.sloc) && out.sloc > 0 && has(out.kw) && out.kw > 0) {
        changed = set('lubeKgHr', (out.sloc * out.kw) / 1000, 'SLOC × kW / 1000') || changed;
      }
      if (has(out.lubeKgHr) && out.lubeKgHr > 0 && has(out.sloc) && out.sloc > 0) {
        changed = set('kw', (out.lubeKgHr * 1000) / out.sloc, 'lube kg/h × 1000 / SLOC') || changed;
      }

      if (!changed) break;
    }

    // IHP / SHP (kW): SHP = shaft brake power; IHP = SHP / η_mech
    const shpKw = has(out.kw) ? out.kw : null;
    const ihpKw = has(shpKw) && mechEff > 0 ? shpKw / mechEff : null;

    // ISO-corrected SFOC (and ISO fuel rate)
    const sfocIso = isoCorrectedSfoc(out.sfoc, lcvRef, lcvActual);
    const fuelKgHrIso = has(sfocIso) && has(out.kw) && out.kw > 0
      ? (sfocIso * out.kw) / 1000
      : null;
    const lcvFactor = lcvCorrectionFactor(lcvRef, lcvActual);

    // Projections — integrate by M/E run hours (falls back to watch hours)
    const lubeL24h = has(out.lubeLhr) ? out.lubeLhr * 24 : null;
    const fuelL24h = has(out.fuelLhr) ? out.fuelLhr * 24 : null;
    const fuelMtPeriod = has(out.fuelKgHr) && hours ? (out.fuelKgHr * hours) / 1000 : null;
    const fuelMtIsoPeriod = has(fuelKgHrIso) && hours ? (fuelKgHrIso * hours) / 1000 : null;
    const lubeLPeriodProj = has(out.lubeLhr) && hours ? out.lubeLhr * hours : null;

    // Engine speed & thermal load
    const engineSpeedKn = has(out.rpm) && has(pitch) && pitch > 0
      ? (out.rpm * pitch * 60) / NM_METERS
      : null;
    let obsSpeedKn = null;
    let slipPct = null;
    if (has(distanceNm) && has(watchHours) && watchHours > 0) {
      obsSpeedKn = distanceNm / watchHours;
      if (has(engineSpeedKn) && engineSpeedKn > 0) {
        slipPct = ((engineSpeedKn - obsSpeedKn) / engineSpeedKn) * 100;
      }
    }
    let thermalLoadPct = null;
    if (has(out.kw) && has(out.rpm) && out.rpm > 0 && has(mcrKw) && has(mcrRpm) && mcrRpm > 0) {
      thermalLoadPct = ((out.kw / out.rpm) / (mcrKw / mcrRpm)) * 100;
    }

    // Brake thermal efficiency from SFOC + LCV
    let btePct = null;
    if (has(out.sfoc) && out.sfoc > 0 && lcvRef > 0) {
      // BTE% = 3600 / (SFOC_kg/kWh × LCV_kJ/kg) × 100
      btePct = (3600 / ((out.sfoc / 1000) * lcvRef)) * 100;
    }
    let bteIsoPct = null;
    if (has(sfocIso) && sfocIso > 0 && lcvRef > 0) {
      bteIsoPct = (3600 / ((sfocIso / 1000) * lcvRef)) * 100;
    }

    if (!has(mcrRpm) || !has(mcrKw)) {
      notes.push('Enter MCR RPM and MCR kW in Vessel Setup for propeller-law power from RPM.');
    }
    if (!has(sfoc100)) {
      notes.push('Enter shop-trial SFOC @ 100% in Vessel Setup to estimate SFOC from load.');
    }
    if (!has(lcvActual)) {
      notes.push('Enter actual fuel LCV to compute ISO-corrected SFOC (LCV_ref / LCV_actual).');
    }

    const suggestions = [
      'RPM from consumption: enter fuel kg/h + SFOC (or curve) → kW → RPM via propeller law.',
      'kW from consumption: fuel kg/h × 1000 / SFOC.',
      'Consumption from RPM: RPM → %MCR → kW → SFOC curve → kg/h.',
      'ISO SFOC: measured SFOC × (shop-trial LCV ÷ bunker LCV).',
      'IHP (kW) = SHP (kW) ÷ mechanical efficiency.',
      'Projected LO L/24h = LO L/h × 24 (scale by run hours for voyage period).',
      'Period start/end → watch hours; M/E run hours weight SFOC/fuel for the period.',
      'Rev counter Δ ÷ (run hours × 60) → average RPM.',
      'Obs. speed = distance NM ÷ watch hours; slip % = (engine − obs) / engine × 100.',
      'Thermal load % = (P/N) ÷ (P_mcr/N_mcr) × 100 — torque-related load.',
      'Brake thermal efficiency from SFOC and LCV.',
      'Engine speed (kn) = RPM × pitch(m) × 60 ÷ 1852.',
      'CO₂ estimate ≈ fuel kg/h × carbon factor (e.g. 3.114 for HFO) when needed.',
    ];

    function pack(v, digits) {
      return round(v, digits);
    }

    return {
      values: {
        rpm: pack(out.rpm, 2),
        mcrPct: pack(out.mcrPct, 2),
        kw: pack(out.kw, 1),
        shpKw: pack(shpKw, 1),
        ihpKw: pack(ihpKw, 1),
        sfoc: pack(out.sfoc, 2),
        sfocIso: pack(sfocIso, 2),
        sloc: pack(out.sloc, 3),
        fuelKgHr: pack(out.fuelKgHr, 2),
        fuelLhr: pack(out.fuelLhr, 2),
        fuelKgHrIso: pack(fuelKgHrIso, 2),
        lubeKgHr: pack(out.lubeKgHr, 3),
        lubeLhr: pack(out.lubeLhr, 3),
        lubeL24h: pack(lubeL24h, 2),
        fuelL24h: pack(fuelL24h, 2),
        fuelMtPeriod: pack(fuelMtPeriod, 3),
        fuelMtIsoPeriod: pack(fuelMtIsoPeriod, 3),
        lubeLPeriod: pack(lubeLPeriodProj, 2),
        engineSpeedKn: pack(engineSpeedKn, 2),
        obsSpeedKn: pack(obsSpeedKn, 2),
        slipPct: pack(slipPct, 2),
        thermalLoadPct: pack(thermalLoadPct, 2),
        btePct: pack(btePct, 2),
        bteIsoPct: pack(bteIsoPct, 2),
        lcvFactor: pack(lcvFactor, 4),
        hours: pack(hours, 2),
        watchHours: pack(watchHours, 2),
        meRunHours: pack(meRunHours, 2),
        revDelta: pack(revDelta, 0),
        mechEff: pack(mechEff, 3),
        fuelDensity: pack(fuelDensity, 3),
        lubeDensity: pack(lubeDensity, 3),
        lcvRef: pack(lcvRef, 0),
        lcvActual: pack(lcvActual, 0),
        sfocCurve: coeffs
          ? { a: pack(coeffs.a, 4), b: pack(coeffs.b, 4), calibrated: coeffs.calibrated }
          : null,
      },
      derivedFrom,
      notes,
      suggestions,
    };
  }

  /* ---- ASTM 54B / 56 helpers (Fuel by TCF) ---- */
  function alpha54B(density15) {
    const dens = density15;
    const J = Math.round(1000 * dens * 100) / 100; /* kg/m³ */
    const round7 = (v) => Math.round(v * 1e7) / 1e7;
    const K = round7((186.9696 / (J * J)) + (0.4862 / J));
    const L = round7((594.5418 / (J * J)) + (0 / J));
    const M = round7(-0.00336312 + 2680.3206 / (J * J));
    const N = round7((346.4228 / (J * J)) + (0.4388 / J));
    const O = round7((330.301 / (J * J)) + (0 / J));
    if (dens < 0.7705) return N;
    if (dens < 0.7875) return M;
    if (dens < 0.839) return L;
    if (dens < 1.075) return K;
    return O;
  }
  function normalizeDensity15(raw) {
    const d = num(raw);
    if (!has(d) || !(d > 0)) return null;
    /* Accept kg/m³ (e.g. 991) or SG / g·cm⁻³ (e.g. 0.991). */
    return d > 2 ? d / 1000 : d;
  }
  function vcf54B(density15, tempC) {
    const dens = normalizeDensity15(density15);
    const t = num(tempC);
    if (!has(dens) || !has(t)) return null;
    const alpha = alpha54B(dens);
    const dT = Math.round((t - 15) * 100) / 100;
    const round8 = (v) => Math.round(v * 1e8) / 1e8;
    const round9 = (v) => Math.round(v * 1e9) / 1e9;
    const R = round8(alpha * dT);
    const T = round9(alpha * alpha * dT * dT * 0.8);
    const U = round8(-R - T);
    return Math.round(Math.exp(U) * 10000) / 10000;
  }
  function wcf56(density15) {
    const dens = normalizeDensity15(density15);
    if (!has(dens)) return null;
    return dens - 0.0011;
  }
  function mtFromObservedKL(kl, density15, tempC) {
    const vol = num(kl); /* 1 kL = 1 m³ */
    const dens = normalizeDensity15(density15);
    const t = num(tempC);
    if (!has(vol) || vol < 0 || !has(dens) || !has(t)) return null;
    const vcf = vcf54B(dens, t);
    const wcf = wcf56(dens);
    if (!has(vcf) || !has(wcf)) return null;
    return {
      volumeM3: vol,
      density15: dens,
      tempC: t,
      vcf,
      wcf,
      mt: round(vol * vcf * wcf, 4),
    };
  }

  function packResult(solved, extras) {
    return Object.assign({ values: solved.values, derivedFrom: solved.derivedFrom, notes: solved.notes }, extras || {});
  }

  /** Photo calculators — thin named paths over solve() / TCF. */
  function fuelByRpm(basis, { rpm, hours }) {
    return packResult(solve(basis, { rpm, hours: hours, meRunHours: hours }));
  }
  function fuelByLoad(basis, { kw, hours }) {
    return packResult(solve(basis, { kw, hours: hours, meRunHours: hours }));
  }
  function fuelByTcf(_basis, { kl, density15, tempC, fuelType }) {
    const r = mtFromObservedKL(kl, density15, tempC);
    if (!r) return { error: 'Need fuel volume (kL), specific gravity / density, and temperature (°C).' };
    return {
      values: {
        fuelMt: r.mt,
        volumeM3: r.volumeM3,
        vcf: r.vcf,
        wcf: r.wcf,
        density15: r.density15,
        tempC: r.tempC,
        fuelType: fuelType || null,
      },
      notes: ['ASTM Table 54B VCF × Table 56 WCF: MT = kL × VCF × WCF'],
    };
  }
  function cylOilByRpm(basis, { rpm, hours, cylOilSg, sloc }) {
    const dens = normalizeDensity15(cylOilSg) || num(basis && basis.lubeDensity) || DEFAULT_LUBE_DENSITY;
    return packResult(solve(Object.assign({}, basis, { lubeDensity: dens }), {
      rpm, hours, meRunHours: hours, sloc,
    }));
  }
  function cylOilByLoad(basis, { kw, hours, cylOilSg, sloc }) {
    const dens = normalizeDensity15(cylOilSg) || num(basis && basis.lubeDensity) || DEFAULT_LUBE_DENSITY;
    return packResult(solve(Object.assign({}, basis, { lubeDensity: dens }), {
      kw, hours, meRunHours: hours, sloc,
    }));
  }
  function performanceByFuel(basis, { fuelMt, hours }) {
    const mt = num(fuelMt);
    const h = num(hours);
    if (!has(mt) || !has(h) || !(h > 0)) return { error: 'Need fuel consumption (MT) and runtime (h).' };
    const fuelKgPeriod = mt * 1000;
    return packResult(solve(basis, { fuelKgPeriod, hours: h, meRunHours: h }));
  }
  function performanceByRpm(basis, { rpm, hours, distanceNm }) {
    return packResult(solve(basis, { rpm, hours, meRunHours: hours, distanceNm }));
  }
  function specificFuelOil(basis, { fuelMt, hours, kw }) {
    const mt = num(fuelMt);
    const h = num(hours);
    const power = num(kw);
    if (!has(mt) || !has(h) || !(h > 0) || !has(power) || !(power > 0)) {
      return { error: 'Need fuel (MT), runtime (h), and M/E load (kW).' };
    }
    const fuelKgHr = (mt * 1000) / h;
    const sfoc = (fuelKgHr * 1000) / power;
    return {
      values: { sfoc: round(sfoc, 2), fuelKgHr: round(fuelKgHr, 2), kw: power, hours: h, fuelMt: mt },
      notes: ['SFOC (g/kWh) = (MT × 1 000 000) ÷ (hours × kW)'],
    };
  }
  function specificCylOil(basis, { cylOilL, hours, kw, cylOilSg }) {
    const litres = num(cylOilL);
    const h = num(hours);
    const power = num(kw);
    const dens = normalizeDensity15(cylOilSg) || num(basis && basis.lubeDensity) || DEFAULT_LUBE_DENSITY;
    if (!has(litres) || !has(h) || !(h > 0) || !has(power) || !(power > 0) || !has(dens)) {
      return { error: 'Need cylinder oil (L), runtime (h), M/E load (kW), and specific gravity.' };
    }
    const lubeKgHr = (litres * dens) / h;
    const sloc = (lubeKgHr * 1000) / power;
    return {
      values: {
        sloc: round(sloc, 3),
        lubeKgHr: round(lubeKgHr, 3),
        lubeLhr: round(litres / h, 3),
        kw: power,
        hours: h,
        density: dens,
      },
      notes: ['SLOC (g/kWh) = (L × SG × 1000) ÷ (hours × kW)'],
    };
  }

  const api = {
    solve,
    sfocCurveCoefficients,
    referenceSfocAtLoad,
    isoCorrectedSfoc,
    lcvCorrectionFactor,
    normalizeDensity15,
    vcf54B,
    wcf56,
    mtFromObservedKL,
    fuelByRpm,
    fuelByLoad,
    fuelByTcf,
    cylOilByRpm,
    cylOilByLoad,
    performanceByFuel,
    performanceByRpm,
    specificFuelOil,
    specificCylOil,
    DEFAULT_LCV_REF,
    DEFAULT_MECH_EFF,
    DEFAULT_FUEL_DENSITY,
    DEFAULT_LUBE_DENSITY,
    DEFAULT_PROP_EXP,
    NM_METERS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.ChengProPerfCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
