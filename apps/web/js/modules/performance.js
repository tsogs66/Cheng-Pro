window.ChengProModules = window.ChengProModules || {};

window.ChengProModules.performance = {
  title: 'Performance Calculation',
  async render(root) {
    const active = ChengPro.vessel.getActive();
    if (!active) {
      root.innerHTML = `
        <section class="panel">
          <h2>Performance Calculation</h2>
          <p class="empty">Select or create an active vessel first. Engine basis comes from Vessel Setup.</p>
          <div class="form-actions">
            <button type="button" class="btn primary" data-go="vessel">Open Vessel Setup</button>
          </div>
        </section>`;
      root.querySelector('[data-go]').onclick = () =>
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));
      return;
    }

    let vessel = active;
    try {
      const shared = await ChengPro.api.fetch('/api/shell/vessels/' + encodeURIComponent(active.id));
      vessel = shared?.vessel || active;
    } catch (e) {
      toast(e.message);
    }

    const basis = engineBasis(vessel);
    const missingBasis = !basis.mcrRpm || !basis.mcrKw;

    root.innerHTML = `
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Performance Calculation</h2>
            <p>Scramble solver for M/E RPM, power, SFOC/SLOC, and consumptions — basis from <strong>${esc(vessel.name)}</strong>.</p>
          </div>
          <button type="button" class="btn" data-go="vessel">Edit vessel engine data</button>
        </div>
        ${missingBasis ? '<p class="hint warn">MCR RPM / MCR kW not set — add them in Vessel Setup for propeller-law estimates.</p>' : ''}
        <div class="grid-3 basis-strip">
          ${stat('MCR RPM', fmt(basis.mcrRpm, 1))}
          ${stat('MCR kW', fmt(basis.mcrKw, 0))}
          ${stat('SFOC 100%', fmt(basis.sfoc100, 1) + (basis.sfoc100 != null ? ' g/kWh' : ''))}
          ${stat('SFOC 85%', fmt(basis.sfoc85, 1) + (basis.sfoc85 != null ? ' g/kWh' : ''))}
          ${stat('SLOC ref', fmt(basis.slocRef, 2) + (basis.slocRef != null ? ' g/kWh' : ''))}
          ${stat('Pitch', fmt(basis.pitch, 2) + (basis.pitch != null ? ' m' : ''))}
          ${stat('LCV ref', fmt(basis.lcvRef, 0) + ' kJ/kg')}
          ${stat('LCV actual', fmt(basis.lcvActual, 0) + (basis.lcvActual != null ? ' kJ/kg' : ''))}
          ${stat('η mech', fmt((basis.mechEff || 0.9) * 100, 1) + '%')}
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Operating inputs</h2>
            <p>Enter any known values. Leave blanks for unknowns — the solver fills the rest.</p>
          </div>
        </div>
        <form id="perfForm" class="grid-2">
          <div class="field"><label>RPM</label><input name="rpm" type="number" step="0.1" inputmode="decimal" placeholder="e.g. 78"></div>
          <div class="field"><label>% MCR</label><input name="mcrPct" type="number" step="0.1" inputmode="decimal" placeholder="e.g. 65"></div>
          <div class="field"><label>Shaft power SHP (kW)</label><input name="kw" type="number" step="1" inputmode="decimal" placeholder="or leave blank"></div>
          <div class="field"><label>Run hours</label><input name="hours" type="number" step="0.1" inputmode="decimal" placeholder="for period projections"></div>
          <div class="field"><label>SFOC measured (g/kWh)</label><input name="sfoc" type="number" step="0.1" inputmode="decimal" placeholder="blank → shop-trial curve"></div>
          <div class="field"><label>SLOC measured (g/kWh)</label><input name="sloc" type="number" step="0.01" inputmode="decimal" placeholder="blank → vessel ref"></div>
          <div class="field"><label>Fuel consumption (kg/h)</label><input name="fuelKgHr" type="number" step="0.1" inputmode="decimal"></div>
          <div class="field"><label>Fuel consumption (L/h)</label><input name="fuelLhr" type="number" step="0.1" inputmode="decimal"></div>
          <div class="field"><label>Lube oil (kg/h)</label><input name="lubeKgHr" type="number" step="0.01" inputmode="decimal"></div>
          <div class="field"><label>Lube oil (L/h)</label><input name="lubeLhr" type="number" step="0.01" inputmode="decimal"></div>
          <div class="field"><label>Fuel over period (kg)</label><input name="fuelKgPeriod" type="number" step="0.1" inputmode="decimal"></div>
          <div class="field"><label>Fuel over period (L)</label><input name="fuelLPeriod" type="number" step="0.1" inputmode="decimal"></div>
          <div class="field"><label>LO over period (kg)</label><input name="lubeKgPeriod" type="number" step="0.1" inputmode="decimal"></div>
          <div class="field"><label>LO over period (L)</label><input name="lubeLPeriod" type="number" step="0.1" inputmode="decimal"></div>
        </form>
        <div class="form-actions">
          <button type="button" class="btn primary" id="calcPerf">Calculate</button>
          <button type="button" class="btn" id="clearPerf">Clear inputs</button>
          <button type="button" class="btn" id="demoPerf">Demo from MCR 85%</button>
        </div>
      </section>

      <section class="panel" id="perfResults" hidden>
        <div class="section-head">
          <div>
            <h2>Results</h2>
            <p>Derived values update when you calculate. ISO SFOC uses LCV_ref ÷ LCV_actual.</p>
          </div>
        </div>
        <div class="grid-3" id="perfStats"></div>
        <div class="hint" id="perfNotes" style="margin-top:14px"></div>
        <details class="perf-derived" style="margin-top:12px">
          <summary>How each value was derived</summary>
          <ul id="perfDerived"></ul>
        </details>
      </section>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>Suggested extras</h2>
            <p>Useful iterations beyond the core scramble set.</p>
          </div>
        </div>
        <ul class="suggest-list" id="perfSuggestions"></ul>
      </section>
    `;

    const form = root.querySelector('#perfForm');
    const results = root.querySelector('#perfResults');
    const stats = root.querySelector('#perfStats');
    const notesEl = root.querySelector('#perfNotes');
    const derivedEl = root.querySelector('#perfDerived');
    const suggestEl = root.querySelector('#perfSuggestions');

    const dry = ChengProPerfCalc.solve(basis, {});
    suggestEl.innerHTML = dry.suggestions.map((s) => `<li>${esc(s)}</li>`).join('');

    root.querySelector('[data-go]').onclick = () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: 'vessel' }));

    root.querySelector('#clearPerf').onclick = () => {
      form.reset();
      results.hidden = true;
    };

    root.querySelector('#demoPerf').onclick = () => {
      form.reset();
      const csr = basis.csrRpm || (basis.mcrRpm ? basis.mcrRpm * Math.pow(0.85, 1 / 3) : null);
      if (csr) form.rpm.value = String(Math.round(csr * 10) / 10);
      form.hours.value = '24';
      run();
    };

    root.querySelector('#calcPerf').onclick = run;
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    });

    function run() {
      const data = Object.fromEntries(new FormData(form).entries());
      const solved = ChengProPerfCalc.solve(basis, data);
      const v = solved.values;
      results.hidden = false;
      stats.innerHTML = [
        stat('RPM', fmt(v.rpm, 2)),
        stat('% MCR', fmt(v.mcrPct, 2) + (v.mcrPct != null ? ' %' : '')),
        stat('SHP (kW)', fmt(v.shpKw, 1)),
        stat('IHP (kW)', fmt(v.ihpKw, 1)),
        stat('SFOC', fmt(v.sfoc, 2) + (v.sfoc != null ? ' g/kWh' : '')),
        stat('ISO SFOC', fmt(v.sfocIso, 2) + (v.sfocIso != null ? ' g/kWh' : ''), 'iso'),
        stat('SLOC', fmt(v.sloc, 3) + (v.sloc != null ? ' g/kWh' : '')),
        stat('Fuel', fmt(v.fuelKgHr, 2) + (v.fuelKgHr != null ? ' kg/h' : '')),
        stat('Fuel ISO', fmt(v.fuelKgHrIso, 2) + (v.fuelKgHrIso != null ? ' kg/h' : ''), 'iso'),
        stat('Fuel', fmt(v.fuelLhr, 2) + (v.fuelLhr != null ? ' L/h' : '')),
        stat('LO', fmt(v.lubeLhr, 3) + (v.lubeLhr != null ? ' L/h' : '')),
        stat('LO / 24 h', fmt(v.lubeL24h, 2) + (v.lubeL24h != null ? ' L' : '')),
        stat('Fuel / 24 h', fmt(v.fuelL24h, 1) + (v.fuelL24h != null ? ' L' : '')),
        stat('Fuel period', fmt(v.fuelMtPeriod, 3) + (v.fuelMtPeriod != null ? ' MT' : '')),
        stat('Fuel period ISO', fmt(v.fuelMtIsoPeriod, 3) + (v.fuelMtIsoPeriod != null ? ' MT' : ''), 'iso'),
        stat('LO period', fmt(v.lubeLPeriod, 2) + (v.lubeLPeriod != null ? ' L' : '')),
        stat('Engine speed', fmt(v.engineSpeedKn, 2) + (v.engineSpeedKn != null ? ' kn' : '')),
        stat('Thermal load', fmt(v.thermalLoadPct, 1) + (v.thermalLoadPct != null ? ' %' : '')),
        stat('BTE', fmt(v.btePct, 1) + (v.btePct != null ? ' %' : '')),
        stat('BTE (ISO SFOC)', fmt(v.bteIsoPct, 1) + (v.bteIsoPct != null ? ' %' : ''), 'iso'),
        stat('LCV factor', fmt(v.lcvFactor, 4)),
      ].join('');

      notesEl.innerHTML = solved.notes.length
        ? solved.notes.map((n) => esc(n)).join(' · ')
        : (v.sfocIso != null && v.lcvFactor !== 1
          ? `ISO correction applied (factor ${fmt(v.lcvFactor, 4)}).`
          : 'Enter more inputs or complete Vessel Setup engine data for fuller results.');

      const keys = Object.keys(solved.derivedFrom);
      derivedEl.innerHTML = keys.length
        ? keys.map((k) => `<li><code>${esc(k)}</code> — ${esc(solved.derivedFrom[k])}</li>`).join('')
        : '<li>No derived fields (all values were entered or insufficient data).</li>';

      results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },
};

function engineBasis(v) {
  return {
    mcrRpm: numOrNull(v.mcrRpm),
    mcrKw: numOrNull(v.mcrKw),
    csrRpm: numOrNull(v.csrRpm),
    csrKw: numOrNull(v.csrKw),
    pitch: numOrNull(v.pitch),
    sfoc100: numOrNull(v.sfoc100),
    sfoc85: numOrNull(v.sfoc85),
    slocRef: numOrNull(v.slocRef),
    mechEff: numOrNull(v.mechEff) ?? 0.9,
    fuelDensity: numOrNull(v.fuelDensity) ?? 0.96,
    lubeDensity: numOrNull(v.lubeDensity) ?? 0.89,
    lcvRef: numOrNull(v.lcvRef) ?? 42700,
    lcvActual: numOrNull(v.lcvActual),
    propLawExp: numOrNull(v.propLawExp) ?? 3,
  };
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function fmt(v, d) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: d == null ? 2 : d,
  });
}

function stat(label, value, cls) {
  return `<div class="stat${cls ? ' ' + cls : ''}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg) {
  window.dispatchEvent(new CustomEvent('chengpro:toast', { detail: msg }));
}
