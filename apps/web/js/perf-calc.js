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

    const out = {
      rpm: num(i.rpm),
      mcrPct: num(i.mcrPct),
      kw: num(i.kw),
      sfoc: num(i.sfoc),
      sloc: num(i.sloc),
      fuelKgHr: num(i.fuelKgHr),
      fuelLhr: num(i.fuelLhr),
      lubeKgHr: num(i.lubeKgHr),
      lubeLhr: num(i.lubeLhr),
      hours: num(i.hours),
      fuelKgPeriod: num(i.fuelKgPeriod),
      fuelLPeriod: num(i.fuelLPeriod),
      lubeKgPeriod: num(i.lubeKgPeriod),
      lubeLPeriod: num(i.lubeLPeriod),
    };

    const derivedFrom = {};
    const notes = [];

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

    // Projections
    const hours = has(out.hours) && out.hours > 0 ? out.hours : null;
    const lubeL24h = has(out.lubeLhr) ? out.lubeLhr * 24 : null;
    const fuelL24h = has(out.fuelLhr) ? out.fuelLhr * 24 : null;
    const fuelMtPeriod = has(out.fuelKgHr) && hours ? (out.fuelKgHr * hours) / 1000 : null;
    const fuelMtIsoPeriod = has(fuelKgHrIso) && hours ? (fuelKgHrIso * hours) / 1000 : null;
    const lubeLPeriodProj = has(out.lubeLhr) && hours ? out.lubeLhr * hours : null;

    // Engine speed & thermal load
    const engineSpeedKn = has(out.rpm) && has(pitch) && pitch > 0
      ? (out.rpm * pitch * 60) / NM_METERS
      : null;
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
        thermalLoadPct: pack(thermalLoadPct, 2),
        btePct: pack(btePct, 2),
        bteIsoPct: pack(bteIsoPct, 2),
        lcvFactor: pack(lcvFactor, 4),
        hours: pack(hours, 2),
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

  const api = {
    solve,
    sfocCurveCoefficients,
    referenceSfocAtLoad,
    isoCorrectedSfoc,
    lcvCorrectionFactor,
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
