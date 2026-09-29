/**
 * Electronic Oil Record Book (e-ORB) — MARPOL Annex I
 *
 * ts0gs · Marvin C. Endozo
 * Codes/items from MARPOL Annex I Appendix III (as amended, e.g. MEPC.187(59)).
 * Recording examples aligned with MEPC.1/Circ.736/Rev.2.
 *
 * Flag administrations use the same IMO letter/item codes; differences are
 * language, e-ORB approval / Declaration, and local guidance notes.
 *
 * IMPORTANT: Official replacement of the hard-copy ORB requires flag-approved
 * software under IMO MEPC.312(74) plus a ship-specific Declaration. This module
 * is an operational / training guided log with printable pages — not a claim of
 * Liberian, RMI, Panama (or other) type approval unless separately certified.
 */
(function (global) {
  'use strict';

  /* This module is loaded on its own, so it carries its own copy of the credit
     rather than reaching into the app for it; check_assets.js asserts the two
     agree, the same way it does for the service-worker cache name. */
  const AUTHOR = { handle: 'ts0gs', name: 'Marvin C. Endozo' };
  const AUTHOR_LINE = AUTHOR.handle + ' \u00b7 ' + AUTHOR.name;

  /* Same reason: the record book names the program that produced it, and this module
     cannot see the app's APP_NAME. check_assets.js holds the two spellings together. */
  const APP_NAME = 'Voyage Chief';

  /** How Part I signatories are validated for this flag (MARPOL baseline + admin guidance). */
  const SIGNATORY_MODES = {
    engineer_or_ce: 'engineer_or_ce',
    chief_engineer_only: 'chief_engineer_only',
    engineer_and_chief_engineer: 'engineer_and_chief_engineer'
  };
  const DEFAULT_SIGNATORY = {
    mode: SIGNATORY_MODES.engineer_or_ce,
    label: 'Officer in charge',
    note: 'MARPOL Annex I Reg. 17: each completed operation is signed by the officer or officers in charge; the Master countersigns each completed page.'
  };

  /**
   * beORB-style Part III rows appended to the same Part I entry (PART III C, item 3, …).
   * Enabled for all supported flag states — Annex VI fuel specs, OWS/OCM, incinerator, etc.
   */
  const PART_III_SUPPLEMENT_RULES = [
    {
      id: 'bunker-fuel-bdn',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'H' && ctx.items.indexOf('26.3') !== -1;
      },
      lines(ctx) {
        const v = ctx.val;
        const place = String(v.place || '').trim();
        const grade = String(v.fuelType || '').trim();
        const head = place ? ('At: ' + place + ' received') : 'Fuel oil bunkering received';
        const typeBit = grade ? ('Type of Fuel: ' + grade) : '';
        const spec = [];
        if (v.fuelApi != null && String(v.fuelApi).trim() !== '') spec.push('API ' + fmtVal(v.fuelApi));
        if (v.fuelDensity != null && String(v.fuelDensity).trim() !== '') {
          spec.push('Density at 15 °C ' + fmtVal(v.fuelDensity) + ' kg/m³');
        }
        if (v.fuelSulphur != null && String(v.fuelSulphur).trim() !== '') {
          spec.push('Sulphur as per BDN ' + fmtVal(v.fuelSulphur) + '%');
        }
        const text = [head, typeBit, spec.join(', ')].filter(Boolean).join('. ');
        return text ? [{ itemNo: '3', text }] : [];
      }
    },
    {
      id: 'bunker-lube-received',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'H' && ctx.items.indexOf('26.4') !== -1;
      },
      lines(ctx) {
        const v = ctx.val;
        const grade = String(v.lubeType || '').trim();
        const qty = fmtVal(v.lubeQty);
        const text = [
          String(v.place || '').trim() ? ('At: ' + v.place + ' received') : 'Lubricating oil received',
          grade ? ('Type: ' + grade) : '',
          qty !== '' ? (qty + ' t bulk lubricating oil bunkered') : ''
        ].filter(Boolean).join('. ');
        return text ? [{ itemNo: '3', text }] : [];
      }
    },
    {
      id: 'incinerator-operation',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'C' && ctx.items.indexOf('12.3') !== -1;
      },
      lines(ctx) {
        const v = ctx.val;
        const qty = fmtVal(v.qtyDisposed);
        const hrs = fmtVal(v.incinHours);
        const rate = ctx.setup && ctx.setup.equipment && numOrNull(ctx.setup.equipment.incineratorM3PerH);
        const tank = v.tankEmptied ? tankIdentity(ctx.setup, v.tankEmptied) : '';
        const text = [
          'Incinerator: ' + qty + ' m³ oil residue burned' + (tank ? (' from ' + tank) : ''),
          hrs !== '' ? ('total time of operation ' + hrs + ' h') : '',
          v.retained != null && String(v.retained).trim() !== '' ? (fmtVal(v.retained) + ' m³ retained in source tank') : '',
          rate != null ? ('ship incinerator rated capacity ' + fmtVal(rate) + ' m³/h') : ''
        ].filter(Boolean).join(', ');
        return text ? [{ itemNo: '3', text }] : [];
      }
    },
    {
      id: 'ows-ocm-test',
      code: 'C',
      when(ctx) {
        if (ctx.part !== 1 || ctx.code !== 'I') return false;
        if (ctx.scenarioId === 'ows-ocm-test' || ctx.scenarioId === 'ows-weekly-test') return true;
        const r = String(ctx.val.remarks || '').toLowerCase();
        return r.indexOf('recirculation') !== -1 || r.indexOf('ocm') !== -1 ||
          r.indexOf('15 ppm') !== -1 || r.indexOf('oily-water separator') !== -1;
      },
      lines(ctx) {
        const v = ctx.val;
        const dur = numOrNull(v.testDurationMin);
        const text = [
          'OWS / 15 ppm equipment test supplement',
          dur != null ? ('duration of test ' + fmtVal(dur) + ' minutes') : '',
          v.timeStart ? ('start ' + v.timeStart + ' UTC') : '',
          v.timeStop ? ('stop ' + v.timeStop + ' UTC') : '',
          'recirculation line and OCM / 15 ppm alarm tested with satisfactory results'
        ].filter(Boolean).join(', ');
        return [{ itemNo: '3', text }];
      }
    },
    {
      id: 'ows-overboard-discharge',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'D' &&
          (ctx.items.indexOf('15.1') !== -1 || ctx.scenarioId === 'bilge-ows-sea');
      },
      lines(ctx) {
        const v = ctx.val;
        return [{
          itemNo: '3',
          text: [
            'Overboard discharge through 15 ppm equipment — supplement',
            'position start ' + (v.posStart || '—') + ', position stop ' + (v.posStop || '—'),
            'same-day OWS / OCM test and overboard valve unsealing must be recorded under Code I before this discharge'
          ].join('; ')
        }];
      }
    },
    {
      id: 'ows-equipment-failure',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'F' &&
          (ctx.scenarioId === 'ows-failure' || ctx.scenarioId === 'ows-restored' ||
            ctx.items.some(n => n === '19' || n === '20' || n === '21'));
      },
      lines(ctx) {
        const v = ctx.val;
        const fail = ctx.scenarioId === 'ows-failure' || ctx.items.indexOf('19') !== -1;
        const text = fail
          ? ['15 ppm / oily-water separator failure supplement', String(v.failureReason || v.remarks || 'Equipment failure recorded').trim(),
            v.failureTime ? ('time ' + v.failureTime) : ''].filter(Boolean).join(', ')
          : ['15 ppm / oily-water separator restored supplement',
            v.restoreTime ? ('restored ' + v.restoreTime + ' UTC') : '',
            String(v.restoreAction || v.remarks || '').trim()].filter(Boolean).join(', ');
        return text ? [{ itemNo: '3', text }] : [];
      }
    },
    {
      id: 'annex-i-seal',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'I' &&
          (ctx.scenarioId === 'seal-broken' || ctx.scenarioId === 'seal-applied' ||
            ctx.val.extraSealNo || ctx.val.extraEquipment);
      },
      lines(ctx) {
        const v = ctx.val;
        const broken = ctx.scenarioId === 'seal-broken';
        const text = [
          broken ? 'Annex I valve / equipment unsealed for operation' : 'Annex I valve / equipment sealed',
          v.extraEquipment ? String(v.extraEquipment) : '',
          v.extraSealNo ? ('seal no. ' + v.extraSealNo) : '',
          v.timeStart ? ('time ' + v.timeStart + ' UTC') : ''
        ].filter(Boolean).join(', ');
        return text ? [{ itemNo: '3', text }] : [];
      }
    },
    {
      id: 'debunker-fuel',
      code: 'C',
      when(ctx) {
        if (ctx.part !== 1 || ctx.code !== 'I') return false;
        if (ctx.scenarioId === 'debunker-fuel' || ctx.scenarioId === 'debunker-diesel') return true;
        return /de-bunker/i.test(String(ctx.val.remarks || ''));
      },
      lines(ctx) {
        const v = ctx.val;
        const qty = fmtVal(v.extraQtyT);
        const tank = v.extraFromTank ? tankIdentity(ctx.setup, v.extraFromTank) : '';
        const kind = ctx.scenarioId === 'debunker-diesel' ? 'Diesel oil' : 'Fuel oil';
        const text = [
          kind + ' de-bunkering supplement',
          String(v.extraPlace || '').trim() ? ('at ' + v.extraPlace) : '',
          qty !== '' ? (qty + ' t landed from vessel') : '',
          tank ? ('from ' + tank) : '',
          v.timeStart ? ('time ' + v.timeStart + ' UTC') : ''
        ].filter(Boolean).join(', ');
        return text ? [{ itemNo: '3', text }] : [];
      }
    },
    {
      id: 'sludge-reception-receipt',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'C' && ctx.items.indexOf('12.1') !== -1;
      },
      lines(ctx) {
        const place = String((ctx.val && ctx.val.receptionPort) || '').trim();
        return [{
          itemNo: '3',
          text: 'Sludge reception facility supplement — signed receipt to be retained with the ORB' +
            (place ? (' (' + place + ')') : '')
        }];
      }
    },
    {
      id: 'bilge-reception-receipt',
      code: 'C',
      when(ctx) {
        return ctx.part === 1 && ctx.code === 'D' && ctx.items.indexOf('15.2') !== -1;
      },
      lines() {
        return [{
          itemNo: '3',
          text: 'Bilge water reception facility supplement — signed receipt to be retained with the ORB'
        }];
      }
    }
  ];

  function partThreeSupplementsEnabled(setup) {
    const f = getFlag(setup && setup.flag);
    return f.partIIISupplements !== false;
  }

  function appendPartThreeSupplementLines(lines, part, code, selectedItems, val, setup, scenarioId) {
    if (!partThreeSupplementsEnabled(setup)) return;
    const ctx = {
      part: Number(part) || 1,
      code,
      items: selectedItemNos(selectedItems),
      val: val || {},
      setup: setup || {},
      scenarioId: scenarioId || (val && val.scenarioId) || ''
    };
    PART_III_SUPPLEMENT_RULES.forEach(rule => {
      if (!rule.when(ctx)) return;
      const built = rule.lines(ctx) || [];
      built.forEach((sl, i) => {
        if (!sl || !sl.text) return;
        lines.push({
          itemNo: sl.itemNo != null ? sl.itemNo : '3',
          recordPart: 3,
          recordCode: rule.code || 'C',
          showDate: false,
          showCode: i === 0,
          text: sl.text
        });
      });
    });
  }

  /** Flags that print officer in charge + Chief Engineer (second signature row). */
  const DUAL_SIGNATORY_NOTE =
    'Print the executing officer and the Chief Engineer on separate signature rows when they are different people (company beORB / PSC layout). Master still countersigns each completed page.';

  function dualSignatoryPolicy(flagNote) {
    return {
      mode: SIGNATORY_MODES.engineer_and_chief_engineer,
      label: 'Officer in charge + Chief Engineer',
      note: flagNote + ' ' + DUAL_SIGNATORY_NOTE
    };
  }

  const FLAGS = [
    {
      code: 'LR', name: 'Liberia', admin: 'Liberia Maritime Authority (LISCR)',
      language: 'English',
      signatory: dualSignatoryPolicy(
        'Marine Notice 07 / POL-012: officer(s) in charge sign each operation; approved e-ORB printouts (e.g. beORB) commonly show the duty engineer and Chief Engineer.'
      ),
      erbNote: 'Liberian vessels may only use Administration-approved ERBs and must carry a Declaration of MARPOL Electronic Record Book (Marine Notice POL-012).',
      tips: [
        'Weekly C.11 inventory of IOPP Form A/B item 3.1 sludge tanks is expected even on long voyages (record each tank 11.1 / 11.2 / 11.3).',
        'Recording retained quantity in IOPP 3.3 oily bilge water holding tanks is voluntary (MEPC.1/Circ.736) — use Code I if your SMS requires it.',
        'Keep reception-facility receipts with the ORB for C.12.1 / D.15.2 transfers.',
        'Part III C item 3 supplements (BDN specs, OWS tests, incinerator, de-bunkering) append automatically after the related Part I entry on print/export — all flag states.',
        'Use D (manual start) vs E (automatic mode) carefully — mode of starting, not equipment capability.'
      ]
    },
    {
      code: 'MH', name: 'Marshall Islands', admin: 'Republic of the Marshall Islands Maritime Administrator',
      language: 'English (required)',
      signatory: dualSignatoryPolicy(
        'Marine Guideline 2-13-3: the officer in charge signs the operation; the Chief Engineer (or SMS-named reviewer) checks completeness.'
      ),
      erbNote: 'RMI publishes approved ERB vendors (Marine Notice 7-041-5). Ship must hold ERB Declaration(s) from the registry portal.',
      tips: [
        'ORB Part I entries for IOPP ships shall be in English.',
        'Weekly sludge inventory: C 11.1 tank identity, 11.2 capacity m³, 11.3 retention m³ — repeat for each 3.1 tank.',
        'Follow MI-402A item list and MEPC.1/Circ.736 example wording for PSC consistency.',
        'Incineration of sludge: record under C.12.3 with total time of operation.'
      ]
    },
    {
      code: 'PA', name: 'Panama', admin: 'Panama Maritime Authority (AMP)',
      language: 'English / Spanish (IMO languages prevail as applicable)',
      signatory: {
        mode: SIGNATORY_MODES.engineer_or_ce,
        label: 'Officer in charge',
        note: 'AMP / MARPOL: each completed operation signed by the officer or officers in charge; Master countersigns each page.'
      },
      erbNote: 'Panama authorizes electronic record books under Resolution schemes aligned with MEPC.312(74); use only AMP-authorized manufacturers and keep the vessel license/declaration.',
      tips: [
        'Record operations without delay; each completed operation signed by officer(s) in charge; pages by Master.',
        'Retain ORB for 3 years after the last entry.',
        'Any OWS / 15 ppm equipment failure must be recorded under code F.'
      ]
    },
    {
      code: 'BS', name: 'Bahamas', admin: 'Bahamas Maritime Authority',
      language: 'English',
      signatory: DEFAULT_SIGNATORY,
      erbNote: 'Bahamas follows MARPOL Appendix III item list (see BMA Marine Notice on ORBs). ERB use requires Administration acceptance where applicable.',
      tips: [
        'Transfers TO IOPP 3.1 tanks FROM non-3.1 locations use C.11.4 (with 11.1–11.3).',
        'Transfers between 3.1 tanks use C.12.2.',
        'Manual start of an “automatic” bilge system still uses code D, plus E.18 when placed in manual.'
      ]
    },
    {
      code: 'SG', name: 'Singapore', admin: 'Maritime and Port Authority of Singapore',
      language: 'English',
      signatory: DEFAULT_SIGNATORY,
      erbNote: 'Singapore-flagged ships must meet MARPOL recording standards; electronic books require MPA acceptance where used as official records.',
      tips: ['Prefer clear Lat/Long or port name for ship position.', 'State quantities in m³ (sludge/bilge) or tonnes (bunkers) as required by the item.']
    },
    {
      code: 'CY', name: 'Cyprus', admin: 'Shipping Deputy Ministry — Cyprus',
      language: 'English',
      signatory: {
        mode: SIGNATORY_MODES.chief_engineer_only,
        label: 'Chief Engineer',
        note: 'Cyprus SMS / PSC practice for Part I machinery-space entries: signature by the Chief Engineer unless your company SMS names another signing officer — confirm with your DPA.'
      },
      erbNote: 'Cyprus applies MARPOL Annex I ORB requirements; ERB subject to flag acceptance under IMO guidelines.',
      tips: ['Code I is for additional procedures/remarks — do not use it to replace mandatory codes A–H.']
    },
    {
      code: 'MT', name: 'Malta', admin: 'Transport Malta — Merchant Shipping Directorate',
      language: 'English',
      signatory: {
        mode: SIGNATORY_MODES.chief_engineer_only,
        label: 'Chief Engineer',
        note: 'Transport Malta Part I entries are normally signed by the Chief Engineer as officer in charge of machinery-space operations.'
      },
      erbNote: 'Malta-flagged vessels must maintain ORB Part I (and Part II if tanker) per MARPOL; ERB requires Administration approval process.',
      tips: ['Ensure IOPP Supplement tank lists match the tanks selectable in this e-ORB setup.']
    },
    {
      code: 'HK', name: 'Hong Kong, China', admin: 'Hong Kong Marine Department',
      language: 'English / Chinese as applicable',
      signatory: DEFAULT_SIGNATORY,
      erbNote: 'HK ships follow MARPOL ORB form; electronic alternatives need MD acceptance.',
      tips: ['Record accidental/exceptional discharges under G with circumstances and reasons.']
    },
    {
      code: 'GB', name: 'United Kingdom', admin: 'UK MCA / Red Ensign Group',
      language: 'English',
      signatory: DEFAULT_SIGNATORY,
      erbNote: 'UK/REG ships use MARPOL Appendix III; ERB must meet MCA/flag policy and MEPC.312(74) when replacing hard copy.',
      tips: ['Cross-check OWS seal/status remarks under code I when relevant to an operation.']
    },
    {
      code: 'NO', name: 'Norway (NIS)', admin: 'Norwegian Maritime Authority',
      language: 'English / Norwegian as applicable',
      signatory: DEFAULT_SIGNATORY,
      erbNote: 'NIS vessels follow MARPOL; electronic record books require NMA acceptance when used officially.',
      tips: ['Keep printed/export copies available for PSC if the ERB system is offline.']
    }
  ];

  function field(name, label, type, opts) {
    return Object.assign({ name, label, type: type || 'text', required: false }, opts || {});
  }

  /** Residual vs distillate — ISO 8217 lists and ORB tank filtering for Code H bunkering. */
  const BUNKER_FUEL_FAMILY = {
    residual: {
      label: 'Residual fuel',
      types: ['HFO', 'LFO', 'VLSFO'],
      iso: ['RMA 10', 'RMB 30', 'RMD 80', 'RME 180', 'RMG 180', 'RMG 380', 'RMG 500', 'RMG 700', 'RMK 380', 'RMK 500', 'RMK 700']
    },
    distillate: {
      label: 'Distillate fuel',
      types: ['MDO', 'MGO', 'LSMGO'],
      iso: ['DMX', 'DMA', 'DFA', 'DFZ', 'DMZ', 'DMB', 'DFB']
    }
  };

  function bunkerFuelCategoryForScenario(scenarioId) {
    if (scenarioId === 'bunker-diesel') return 'distillate';
    if (scenarioId === 'bunker-fuel') return 'residual';
    return 'residual';
  }

  function inferTankFuelService(tank) {
    if (!tank) return 'residual';
    const svc = String(tank.fuelService || '').trim().toLowerCase();
    if (svc === 'distillate' || svc === 'residual') return svc;
    const name = String(tank.name || '').toUpperCase();
    if (/MDO|MGO|LSMGO|DIESEL|GAS OIL|DISTILLATE|DO\b|GO\b/.test(name)) return 'distillate';
    if (/HFO|VLSFO|LSFO|LFO|HEAVY|RESIDUAL|FO\b/.test(name)) return 'residual';
    return 'residual';
  }

  function tanksForBunkerCategory(setup, category) {
    const cat = category === 'distillate' ? 'distillate' : 'residual';
    return tanksForGroup(setup, 'fuel').filter(t => inferTankFuelService(t) === cat);
  }

  /* Scenario-level fields.
     Codes A–H carry the fields MARPOL prescribes for each item. Code I is a single
     free-text remark, so an operation recorded under it — de-bunkering, a seal broken,
     condensate led to a bilge tank — has nowhere to put the tank, the quantity or the
     duration it actually involved. These render after the item fields, are written into
     the remark wording, and where the operation moves oil they draw down and top up
     tank R.O.B. exactly as a Code C or D movement does, so the book and the next weekly
     inventory cannot drift apart. */
  const EXTRA_FIELDS = {
    fromTank: field('extraFromTank', 'From tank', 'tank', { tankGroup: 'any' }),
    toTank: field('extraToTank', 'To tank', 'tank', { tankGroup: 'any' }),
    qty: field('extraQty', 'Quantity (m³)', 'number'),
    qtyT: field('extraQtyT', 'Quantity (t)', 'number'),
    fromRetained: field('extraFromRetained', 'Quantity retained in source (m³)', 'number'),
    toTotal: field('extraToTotal', 'Total content of receiving tank (m³)', 'number'),
    testDuration: field('testDurationMin', 'Duration of test (minutes)', 'number',
      { hint: 'How long the test ran. Recorded in the entry wording.' }),
    place: field('extraPlace', 'Place / port', 'text'),
    timeStart: field('extraTimeStart', 'Start time', 'time'),
    timeStop: field('extraTimeStop', 'Stop time', 'time'),
    sealNo: field('extraSealNo', 'Seal number(s)', 'text'),
    equipment: field('extraEquipment', 'Valve / equipment', 'text'),
    missedDate: field('extraMissedDate', 'Date the operation was actually carried out', 'date')
  };

  /** Part I — Machinery space operations (all ships ≥400 GT / tankers ≥150 GT) */
  const PART_I = [
    {
      code: 'A', title: 'Ballasting or cleaning of oil fuel tanks',
      guide: 'Use when ballasting or cleaning oil fuel tanks. Identify tanks and cleaning/ballasting details.',
      items: [
        { no: '1', label: 'Identity of tank(s) ballasted', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'fuel', required: true })] },
        { no: '2', label: 'Cleaned since last contained oil / previous oil type', fields: [
          field('cleaned', 'Cleaned since last oil?', 'select', { options: ['Yes', 'No'], required: true }),
          field('prevOil', 'Previous oil type (if not cleaned)', 'text')
        ]},
        { no: '3.1', label: 'Cleaning — position & time start/completion', fields: [
          field('cleanPosStart', 'Position at start', 'text'), field('cleanTimeStart', 'Time start', 'time'),
          field('cleanPosEnd', 'Position at completion', 'text'), field('cleanTimeEnd', 'Time end', 'time')
        ]},
        { no: '3.2', label: 'Cleaning method / chemicals', fields: [
          field('cleanMethod', 'Method', 'select', { options: ['Rinsing through', 'Steaming', 'Cleaning with chemicals', 'Other'] }),
          field('chemType', 'Chemical type', 'text'), field('chemQty', 'Chemical quantity (m³)', 'number')
        ]},
        { no: '3.3', label: 'Cleaning water transferred to', fields: [
          field('washToTank', 'Tank receiving cleaning water', 'tank', { tankGroup: 'any' }),
          field('washQty', 'Quantity (m³)', 'number')
        ]},
        { no: '4.1', label: 'Ballasting — position & time', fields: [
          field('balPosStart', 'Position start', 'text'), field('balTimeStart', 'Time start', 'time'),
          field('balPosEnd', 'Position end', 'text'), field('balTimeEnd', 'Time end', 'time')
        ]},
        { no: '4.2', label: 'Ballast quantity if tanks not cleaned (m³)', fields: [field('ballastQty', 'Quantity (m³)', 'number')] }
      ]
    },
    {
      code: 'B', title: 'Discharge of dirty ballast or cleaning water from oil fuel tanks',
      guide: 'Discharge of dirty ballast/cleaning water from fuel oil tanks referred to under (A).',
      items: [
        { no: '5', label: 'Identity of tank(s)', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'fuel', required: true })] },
        { no: '6', label: 'Position at start of discharge', fields: [field('posStart', 'Position', 'text', { required: true })] },
        { no: '7', label: 'Position on completion', fields: [field('posEnd', 'Position', 'text', { required: true })] },
        { no: '8', label: 'Ship’s speed(s) during discharge', fields: [field('speed', 'Speed (kn)', 'text')] },
        { no: '9.1', label: 'Method — through 15 ppm equipment', fields: [field('viaOws', 'Discharged via 15 ppm?', 'select', { options: ['Yes', 'No'] })] },
        { no: '9.2', label: 'Method — to reception facilities', fields: [field('receptionPort', 'Reception facility / port', 'text')] },
        { no: '10', label: 'Quantity discharged (m³)', fields: [field('qty', 'Quantity (m³)', 'number', { required: true })] }
      ]
    },
    {
      code: 'C', title: 'Collection, transfer and disposal of oil residues (sludge)',
      guide: 'C.11 weekly inventory of IOPP 3.1 sludge tanks; C.11.4 for manual collection into 3.1; C.12 for disposal/transfer/incineration.',
      common: true,
      items: [
        { no: '11.1', label: 'Identity of tank(s)', fields: [field('tank', 'Sludge tank (IOPP 3.1)', 'tank', { tankGroup: 'sludge', required: true })] },
        { no: '11.2', label: 'Capacity of tank(s) (m³)', fields: [field('capacity', 'Capacity (m³)', 'number', { required: true })] },
        { no: '11.3', label: 'Total quantity of retention (m³)', fields: [field('retention', 'Retention ROB (m³)', 'number', { required: true })] },
        { no: '11.4', label: 'Quantity collected by manual operation (m³)', fields: [field('manualCollected', 'Manual collection (m³)', 'number')] },
        { no: '12.1', label: 'Disposal to reception facilities', fields: [
          field('qtyDisposed', 'Quantity disposed (m³)', 'number'),
          field('tankEmptied', 'Tank(s) emptied', 'tank', { tankGroup: 'sludge' }),
          field('retained', 'Quantity retained (m³)', 'number'),
          field('receptionPort', 'Port / facility', 'text', { required: true }),
          field('timeStart', 'Pumping start (for capacity check)', 'time'),
          field('timeStop', 'Pumping stop (for capacity check)', 'time')
        ]},
        { no: '12.2', label: 'Transfer to another tank(s)', fields: [
          field('qtyDisposed', 'Quantity transferred (m³)', 'number', { required: true }),
          field('fromTank', 'From tank', 'tank', { tankGroup: 'sludge', required: true }),
          field('toTank', 'To tank', 'tank', { tankGroup: 'any', required: true }),
          field('toTotal', 'Total content of receiving tank (m³)', 'number'),
          field('retained', 'Quantity retained in source (m³)', 'number'),
          field('timeStart', 'Transfer start (for pump capacity check)', 'time'),
          field('timeStop', 'Transfer stop (for pump capacity check)', 'time')
        ]},
        { no: '12.3', label: 'Incinerated', fields: [
          field('qtyDisposed', 'Quantity incinerated (m³)', 'number', { required: true }),
          field('tankEmptied', 'Tank', 'tank', { tankGroup: 'sludge' }),
          field('retained', 'Quantity retained (m³)', 'number'),
          field('incinHours', 'Total time of operation (h)', 'number', { required: true })
        ]},
        { no: '12.4', label: 'Other method', fields: [
          field('qtyDisposed', 'Quantity (m³)', 'number'),
          field('otherMethod', 'Method', 'text', { required: true }),
          field('retained', 'Quantity retained (m³)', 'number')
        ]}
      ]
    },
    {
      code: 'D', title: 'Non-automatic starting — bilge water discharge/transfer/disposal',
      guide: 'Manual start of bilge discharge/transfer/disposal. Include holding-tank identity/capacity/retained when pumping from a holding tank.',
      common: true,
      items: [
        { no: '13', label: 'Quantity discharged/transferred/disposed (m³)', fields: [
          field('qty', 'Quantity (m³)', 'number', { required: true }),
          field('fromTank', 'From holding tank (if applicable)', 'tank', { tankGroup: 'bilge' }),
          field('fromCap', 'Holding tank capacity (m³)', 'number'),
          field('fromRetained', 'Quantity retained in holding tank (m³)', 'number')
        ]},
        { no: '14', label: 'Time of discharge/transfer/disposal (start and stop)', fields: [
          field('timeStart', 'Start time', 'time', { required: true }),
          field('timeStop', 'Stop time', 'time', { required: true })
        ]},
        { no: '15.1', label: 'Through 15 ppm equipment', fields: [
          field('posStart', 'Position at start', 'text', { required: true }),
          field('posEnd', 'Position at end', 'text', { required: true })
        ]},
        { no: '15.2', label: 'To reception facilities', fields: [field('receptionPort', 'Port / facility', 'text', { required: true })] },
        { no: '15.3', label: 'To slop/holding/other tank(s)', fields: [
          field('toTank', 'To tank', 'tank', { tankGroup: 'any', required: true }),
          field('toRetained', 'Quantity retained in tank(s) (m³)', 'number')
        ]}
      ]
    },
    {
      code: 'E', title: 'Automatic starting — bilge water system mode',
      guide: 'Record when the system is placed in automatic overboard mode, automatic transfer mode, or returned to manual.',
      common: true,
      items: [
        { no: '16', label: 'Automatic mode — discharge overboard via 15 ppm', fields: [
          field('timeStart', 'Time', 'time', { required: true }),
          field('position', 'Position', 'text', { required: true }),
          field('fromTank', 'From tank (if applicable)', 'tank', { tankGroup: 'bilge' })
        ]},
        { no: '17', label: 'Automatic mode — transfer to holding tank', fields: [
          field('timeStart', 'Time', 'time', { required: true }),
          field('toTank', 'Holding tank', 'tank', { tankGroup: 'bilge', required: true })
        ]},
        { no: '18', label: 'System put into manual operation', fields: [field('timeStop', 'Time', 'time', { required: true })] }
      ]
    },
    {
      code: 'F', title: 'Condition of the oil filtering equipment',
      guide: 'Covers OWS, oil content meter, alarm and automatic stopping devices.',
      common: true,
      items: [
        { no: '19', label: 'Time of system failure', fields: [field('failTime', 'Failure time', 'time', { required: true })] },
        { no: '20', label: 'Time when system made operational', fields: [field('restoreTime', 'Restored time', 'time')] },
        { no: '21', label: 'Reasons for failure', fields: [field('failReason', 'Reason', 'textarea', { required: true })] }
      ]
    },
    {
      code: 'G', title: 'Accidental or other exceptional discharges of oil',
      guide: 'Mandatory statement of circumstances and reasons for accidental/exceptional discharge.',
      items: [
        { no: '22', label: 'Time of occurrence', fields: [field('time', 'Time', 'time', { required: true })] },
        { no: '23', label: 'Place or position of ship', fields: [field('position', 'Position / place', 'text', { required: true })] },
        { no: '24', label: 'Approximate quantity and type of oil', fields: [
          field('qty', 'Approx. quantity (m³)', 'number', { required: true }),
          field('oilType', 'Type of oil', 'text', { required: true })
        ]},
        { no: '25', label: 'Circumstances, reasons and remarks', fields: [field('remarks', 'Circumstances / reasons', 'textarea', { required: true })] }
      ]
    },
    {
      code: 'H', title: 'Bunkering of fuel or bulk lubricating oil',
      guide: 'Record place, time, type/quantity added and tank identity with total content after bunkering.',
      common: true,
      items: [
        { no: '26.1', label: 'Place of bunkering', fields: [field('place', 'Place / port', 'text', { required: true })] },
        { no: '26.2', label: 'Time of bunkering', fields: [
          field('timeStart', 'Start', 'time', { required: true }),
          field('timeStop', 'Stop', 'time')
        ]},
        { no: '26.3', label: 'Fuel oil bunkered', fields: [
          field('fuelType', 'Fuel type / grade', 'select', { required: true, bunkerSelect: 'type' }),
          field('fuelQty', 'Total quantity added (MT)', 'number', { required: true }),
          field('fuelIsoSpec', 'ISO 8217 designation', 'select', { bunkerSelect: 'iso' }),
          field('fuelSg', 'Specific gravity @15°C', 'number'),
          field('fuelSulphur', 'Sulphur as per BDN (% m/m)', 'number'),
          field('fuelTank', 'Receiving tank(s)', 'tankMulti', { tankGroup: 'fuel', required: true }),
          field('fuelSplit', 'Per-tank quantity added (MT)', 'text',
            { hint: 'Filled from the per-tank rows on the form — e.g. fo1=120, fo2=80.' }),
          field('fuelRobSplit', 'Per-tank content after bunkering (MT)', 'text',
            { hint: 'ROB in each tank after loading — e.g. fo1=350, fo2=200.' }),
          field('fuelTotal', 'Total content (legacy single field, MT)', 'number'),
          field('fuelDensity', 'Density at 15 °C (kg/m³)', 'number'),
          field('fuelApi', 'API gravity (@15°C)', 'number')
        ]},
        { no: '26.4', label: 'Lubricating oil bunkered', fields: [
          field('lubeType', 'Lube type', 'text'),
          field('lubeQty', 'Quantity added (t)', 'number'),
          field('lubeTank', 'Tank(s)', 'tankMulti', { tankGroup: 'lube' }),
          field('lubeTankOther', 'Tank(s) — if not listed in ORB setup', 'text'),
          field('lubeSplit', 'Per-tank split (e.g. CYL1=12, SUMP=5)', 'text'),
          field('lubeTotal', 'Total content of tank(s) (t)', 'number')
        ]}
      ]
    },
    {
      code: 'I', title: 'Additional operational procedures and general remarks',
      guide: 'Only for additional procedures/remarks that do not replace codes A–H.',
      common: true,
      items: [
        { no: 'I', label: 'Remarks', fields: [field('remarks', 'Additional procedures / remarks', 'textarea', { required: true })] }
      ]
    }
  ];

  /** Part II — Cargo/ballast operations (oil tankers) */
  const PART_II = [
    { code: 'A', title: 'Loading of oil cargo', common: true, items: [
      { no: '1', label: 'Place of loading', fields: [field('place', 'Place', 'text', { required: true })] },
      { no: '2', label: 'Type of oil loaded and identity of tank(s)', fields: [
        field('oilType', 'Type of oil', 'text', { required: true }),
        field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo', required: true })
      ]},
      { no: '3', label: 'Total quantity loaded', fields: [
        field('qtyAdded', 'Quantity added (m³ at 15°C)', 'number', { required: true }),
        field('totalContent', 'Total content of tank(s) (m³)', 'number')
      ]}
    ]},
    { code: 'B', title: 'Internal transfer of oil cargo during voyage', items: [
      { no: '4.1', label: 'From tank(s)', fields: [field('fromTank', 'From', 'tankMulti', { tankGroup: 'cargo', required: true })] },
      { no: '4.2', label: 'To tank(s)', fields: [
        field('toTank', 'To', 'tankMulti', { tankGroup: 'cargo', required: true }),
        field('qty', 'Quantity transferred (m³)', 'number', { required: true }),
        field('toTotal', 'Total quantity in receiving tank(s) (m³)', 'number')
      ]},
      { no: '5', label: 'Were tank(s) in 4.1 emptied?', fields: [
        field('emptied', 'Emptied?', 'select', { options: ['Yes', 'No'], required: true }),
        field('retained', 'Quantity retained (m³)', 'number')
      ]}
    ]},
    { code: 'C', title: 'Unloading of oil cargo', common: true, items: [
      { no: '6', label: 'Place of unloading', fields: [field('place', 'Place', 'text', { required: true })] },
      { no: '7', label: 'Identity of tank(s) unloaded', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo', required: true })] },
      { no: '8', label: 'Were tank(s) emptied?', fields: [
        field('emptied', 'Emptied?', 'select', { options: ['Yes', 'No'], required: true }),
        field('retained', 'Quantity retained (m³)', 'number')
      ]}
    ]},
    { code: 'D', title: 'Crude oil washing (COW tankers only)', items: [
      { no: '9', label: 'Port or ship’s position', fields: [field('place', 'Port / position', 'text', { required: true })] },
      { no: '10', label: 'Identity of tank(s) washed', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo', required: true })] },
      { no: '11', label: 'Number of machines in use', fields: [field('machines', 'Machines', 'number')] },
      { no: '12', label: 'Time of start of washing', fields: [field('timeStart', 'Start', 'time')] },
      { no: '13', label: 'Washing pattern employed', fields: [field('pattern', 'Pattern', 'text')] },
      { no: '14', label: 'Washing line pressure', fields: [field('pressure', 'Pressure', 'text')] },
      { no: '15', label: 'Time washing completed/stopped', fields: [field('timeStop', 'Stop', 'time')] },
      { no: '16', label: 'Method of establishing tank(s) dry', fields: [field('dryMethod', 'Method', 'text')] },
      { no: '17', label: 'Remarks', fields: [field('remarks', 'Remarks', 'textarea')] }
    ]},
    { code: 'E', title: 'Ballasting of cargo tanks', items: [
      { no: '18', label: 'Position at start and end of ballasting', fields: [
        field('posStart', 'Position start', 'text'), field('posEnd', 'Position end', 'text')
      ]},
      { no: '19.1', label: 'Identity of tank(s) ballasted', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo', required: true })] },
      { no: '19.2', label: 'Time of start and end', fields: [field('timeStart', 'Start', 'time'), field('timeStop', 'End', 'time')] },
      { no: '19.3', label: 'Quantity of ballast received (m³)', fields: [field('qty', 'Quantity (m³)', 'number', { required: true })] }
    ]},
    { code: 'F', title: 'Ballasting of dedicated clean ballast tanks (CBT)', items: [
      { no: '20', label: 'Identity of tank(s) ballasted', fields: [field('tanks', 'CBT(s)', 'tankMulti', { tankGroup: 'cbt', required: true })] },
      { no: '21', label: 'Position when flushing/port ballast taken', fields: [field('posFlush', 'Position', 'text')] },
      { no: '22', label: 'Position when pumps/lines flushed to slop', fields: [field('posLineFlush', 'Position', 'text')] },
      { no: '23', label: 'Oily water to slop after line flushing', fields: [
        field('slopTank', 'Slop/cargo tank', 'tank', { tankGroup: 'slop' }),
        field('oilyQty', 'Quantity (m³)', 'number')
      ]},
      { no: '24', label: 'Position when additional CBT ballast taken', fields: [field('posAdd', 'Position', 'text')] },
      { no: '25', label: 'Time/position valves closed separating CBT', fields: [
        field('valveTime', 'Time', 'time'), field('valvePos', 'Position', 'text')
      ]},
      { no: '26', label: 'Quantity of clean ballast taken (m³)', fields: [field('qty', 'Quantity (m³)', 'number')] }
    ]},
    { code: 'G', title: 'Cleaning of cargo tanks', items: [
      { no: '27', label: 'Identity of tank(s) cleaned', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo', required: true })] },
      { no: '28', label: 'Port or ship’s position', fields: [field('place', 'Port / position', 'text')] },
      { no: '29', label: 'Duration of cleaning', fields: [field('duration', 'Duration', 'text')] },
      { no: '30', label: 'Method of cleaning', fields: [field('method', 'Method', 'text')] },
      { no: '31.1', label: 'Washings to reception facilities', fields: [
        field('receptionPort', 'Port', 'text'), field('qty', 'Quantity (m³)', 'number')
      ]},
      { no: '31.2', label: 'Washings to slop/cargo tank(s)', fields: [
        field('toTank', 'Tank(s)', 'tank', { tankGroup: 'slop' }),
        field('qty', 'Quantity transferred (m³)', 'number'),
        field('toTotal', 'Total in tank (m³)', 'number')
      ]}
    ]},
    { code: 'H', title: 'Discharge of dirty ballast', items: [
      { no: '32', label: 'Identity of tank(s)', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo', required: true })] },
      { no: '33', label: 'Time & position at start into the sea', fields: [field('timeStart', 'Time', 'time'), field('posStart', 'Position', 'text')] },
      { no: '34', label: 'Time & position on completion into the sea', fields: [field('timeStop', 'Time', 'time'), field('posEnd', 'Position', 'text')] },
      { no: '35', label: 'Quantity discharged into the sea (m³)', fields: [field('seaQty', 'Quantity (m³)', 'number')] },
      { no: '36', label: 'Ship’s speed(s) during discharge', fields: [field('speed', 'Speed (kn)', 'text')] },
      { no: '37', label: 'ODME in operation?', fields: [field('odme', 'ODME operating?', 'select', { options: ['Yes', 'No'] })] },
      { no: '38', label: 'Regular check on effluent/surface?', fields: [field('surfaceCheck', 'Check kept?', 'select', { options: ['Yes', 'No'] })] },
      { no: '39', label: 'Oily water to slop tank(s)', fields: [
        field('slopTank', 'Slop tank(s)', 'tank', { tankGroup: 'slop' }),
        field('slopQty', 'Total quantity (m³)', 'number')
      ]},
      { no: '40', label: 'Discharged to shore reception', fields: [
        field('receptionPort', 'Port', 'text'), field('shoreQty', 'Quantity (m³)', 'number')
      ]}
    ]},
    { code: 'I', title: 'Discharge of water from slop tanks into the sea', items: [
      { no: '41', label: 'Identity of slop tanks', fields: [field('tanks', 'Slop tank(s)', 'tankMulti', { tankGroup: 'slop', required: true })] },
      { no: '42', label: 'Time of settling from last entry of residues', fields: [field('settleResidues', 'Settling time', 'text')] },
      { no: '43', label: 'Time of settling from last discharge', fields: [field('settleDischarge', 'Settling time', 'text')] },
      { no: '44', label: 'Time & position at start of discharge', fields: [field('timeStart', 'Time', 'time'), field('posStart', 'Position', 'text')] },
      { no: '45', label: 'Ullage of total contents at start', fields: [field('ullageTotal', 'Ullage', 'text')] },
      { no: '46', label: 'Ullage of oil/water interface at start', fields: [field('ullageInterface', 'Interface ullage', 'text')] },
      { no: '47', label: 'Bulk quantity discharged & rate', fields: [field('bulkQty', 'Bulk (m³)', 'number'), field('bulkRate', 'Rate (m³/h)', 'number')] },
      { no: '48', label: 'Final quantity discharged & rate', fields: [field('finalQty', 'Final (m³)', 'number'), field('finalRate', 'Rate (m³/h)', 'number')] },
      { no: '49', label: 'Time & position on completion', fields: [field('timeStop', 'Time', 'time'), field('posEnd', 'Position', 'text')] },
      { no: '50', label: 'ODME in operation?', fields: [field('odme', 'ODME operating?', 'select', { options: ['Yes', 'No'] })] },
      { no: '51', label: 'Interface ullage on completion (m)', fields: [field('ullageEnd', 'Ullage (m)', 'number')] },
      { no: '52', label: 'Ship’s speed(s)', fields: [field('speed', 'Speed (kn)', 'text')] },
      { no: '53', label: 'Regular check on effluent/surface?', fields: [field('surfaceCheck', 'Check kept?', 'select', { options: ['Yes', 'No'] })] },
      { no: '54', label: 'Valves closed on completion?', fields: [field('valvesClosed', 'Confirmed closed?', 'select', { options: ['Yes', 'No'] })] }
    ]},
    { code: 'J', title: 'Collection, transfer and disposal of residues/oily mixtures', items: [
      { no: '55', label: 'Identity of tank(s)', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'any', required: true })] },
      { no: '56', label: 'Quantity transferred/disposed (retained)', fields: [
        field('qty', 'Quantity (m³)', 'number', { required: true }),
        field('retained', 'Retained (m³)', 'number')
      ]},
      { no: '57.1', label: 'To reception facilities', fields: [field('receptionPort', 'Port', 'text'), field('qty', 'Quantity (m³)', 'number')] },
      { no: '57.2', label: 'Mixed with cargo', fields: [field('qty', 'Quantity (m³)', 'number')] },
      { no: '57.3', label: 'Transferred to/from other tank(s)', fields: [
        field('toTank', 'Other tank(s)', 'tank', { tankGroup: 'any' }),
        field('qty', 'Quantity (m³)', 'number'),
        field('toTotal', 'Total in tank(s) (m³)', 'number')
      ]},
      { no: '57.4', label: 'Other method', fields: [field('otherMethod', 'Method', 'text'), field('qty', 'Quantity (m³)', 'number')] }
    ]},
    { code: 'K', title: 'Discharge of clean ballast contained in cargo tanks', items: [
      { no: '58', label: 'Position at start', fields: [field('posStart', 'Position', 'text')] },
      { no: '59', label: 'Identity of tank(s) discharged', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo' })] },
      { no: '60', label: 'Tank(s) empty on completion?', fields: [field('emptied', 'Empty?', 'select', { options: ['Yes', 'No'] })] },
      { no: '61', label: 'Position on completion (if different)', fields: [field('posEnd', 'Position', 'text')] },
      { no: '62', label: 'Regular check on effluent/surface?', fields: [field('surfaceCheck', 'Check kept?', 'select', { options: ['Yes', 'No'] })] }
    ]},
    { code: 'L', title: 'Discharge of ballast from dedicated CBTs', items: [
      { no: '63', label: 'Identity of tank(s) discharged', fields: [field('tanks', 'CBT(s)', 'tankMulti', { tankGroup: 'cbt' })] },
      { no: '64', label: 'Time & position at start into sea', fields: [field('timeStart', 'Time', 'time'), field('posStart', 'Position', 'text')] },
      { no: '65', label: 'Time & position on completion into sea', fields: [field('timeStop', 'Time', 'time'), field('posEnd', 'Position', 'text')] },
      { no: '66.1', label: 'Quantity into the sea (m³)', fields: [field('seaQty', 'Quantity (m³)', 'number')] },
      { no: '66.2', label: 'Quantity to reception facility', fields: [field('receptionPort', 'Port', 'text'), field('shoreQty', 'Quantity (m³)', 'number')] },
      { no: '67', label: 'Indication of oil contamination?', fields: [field('contamination', 'Contamination?', 'select', { options: ['Yes', 'No'] })] },
      { no: '68', label: 'Monitored by oil content meter?', fields: [field('ocm', 'OCM?', 'select', { options: ['Yes', 'No'] })] },
      { no: '69', label: 'Time & position valves closed', fields: [field('valveTime', 'Time', 'time'), field('valvePos', 'Position', 'text')] }
    ]},
    { code: 'M', title: 'Condition of oil discharge monitoring and control system', items: [
      { no: '70', label: 'Time of system failure', fields: [field('failTime', 'Failure time', 'time', { required: true })] },
      { no: '71', label: 'Time when system made operational', fields: [field('restoreTime', 'Restored time', 'time')] },
      { no: '72', label: 'Reasons for failure', fields: [field('failReason', 'Reason', 'textarea', { required: true })] }
    ]},
    { code: 'N', title: 'Accidental or other exceptional discharges of oil', items: [
      { no: '73', label: 'Time of occurrence', fields: [field('time', 'Time', 'time', { required: true })] },
      { no: '74', label: 'Port or ship’s position', fields: [field('position', 'Position', 'text', { required: true })] },
      { no: '75', label: 'Approximate quantity and type of oil', fields: [
        field('qty', 'Quantity (m³)', 'number', { required: true }),
        field('oilType', 'Type of oil', 'text', { required: true })
      ]},
      { no: '76', label: 'Circumstances, reasons and remarks', fields: [field('remarks', 'Circumstances', 'textarea', { required: true })] }
    ]},
    { code: 'O', title: 'Additional operational procedures and general remarks', common: true, items: [
      { no: 'O', label: 'Remarks', fields: [field('remarks', 'Remarks', 'textarea', { required: true })] }
    ]},
    { code: 'P', title: 'Specific trades — loading of ballast water', items: [
      { no: '77', label: 'Identity of tank(s) ballasted', fields: [field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo' })] },
      { no: '78', label: 'Position of ship when ballasted', fields: [field('position', 'Position', 'text')] },
      { no: '79', label: 'Total quantity of ballast loaded (m³)', fields: [field('qty', 'Quantity (m³)', 'number')] },
      { no: '80', label: 'Remarks', fields: [field('remarks', 'Remarks', 'textarea')] }
    ]},
    { code: 'Q', title: 'Specific trades — re-allocation of ballast water', items: [
      { no: '81', label: 'Reason for reallocation', fields: [field('remarks', 'Reason', 'textarea', { required: true })] }
    ]},
    { code: 'R', title: 'Specific trades — ballast water discharge to reception facility', items: [
      { no: '82', label: 'Port(s) where discharged', fields: [field('receptionPort', 'Port(s)', 'text', { required: true })] },
      { no: '83', label: 'Name/designation of reception facility', fields: [field('facility', 'Facility', 'text')] },
      { no: '84', label: 'Quantity discharged (m³) and tank(s)', fields: [
        field('qty', 'Quantity (m³)', 'number'),
        field('tanks', 'Tank(s)', 'tankMulti', { tankGroup: 'cargo' })
      ]}
    ]}
  ];

  /* Part III — Fuel oil changeover record.
     Not part of the Annex I Oil Record Book: sulphur-limit changeover is an Annex VI
     Regulation 14.6 record, which asks for the volume of low-sulphur fuel in each tank
     and the date, time and position at the completion of changeover before entering an
     ECA and at the commencement of changeover after leaving one. Flag e-ORB software
     keeps it alongside Parts I and II because the engineer writes both from the same
     watch, and this follows that convention. */
  const PART_III = [
    {
      code: 'C', title: 'Fuel oil changeover (ECA / sulphur limit)',
      guide: 'MARPOL Annex VI Reg. 14.6. Record each changeover as two entries — commencement and completion — with position, time and the volume of low-sulphur fuel on board.',
      common: true,
      items: [
        { no: '1', label: 'Changeover commencement — residual (HFO) to distillate (MGO/LSMGO)', fields: [
          field('coTime', 'Time', 'time', { required: true }),
          field('coPosition', 'Position', 'text', { required: true }),
          field('coToGrade', 'Fuel changing to', 'text', { required: true }),
          field('coSulphur', 'Sulphur content of new fuel (% m/m)', 'number'),
          field('coTanks', 'Tank(s) in service', 'tankMulti', { tankGroup: 'fuel' }),
          field('coVolume', 'Volume of low-sulphur fuel on board (m³)', 'number')
        ]},
        { no: '2', label: 'Changeover completion — residual (HFO) to distillate (MGO/LSMGO)', fields: [
          field('coTime', 'Time', 'time', { required: true }),
          field('coPosition', 'Position', 'text', { required: true }),
          field('coToGrade', 'Fuel changing to', 'text', { required: true }),
          field('coSulphur', 'Sulphur content of new fuel (% m/m)', 'number'),
          field('coTanks', 'Tank(s) in service', 'tankMulti', { tankGroup: 'fuel' }),
          field('coVolume', 'Volume of low-sulphur fuel on board (m³)', 'number')
        ]},
        { no: '3', label: 'Changeover commencement — distillate (MGO/LSMGO) to residual (HFO)', fields: [
          field('coTime', 'Time', 'time', { required: true }),
          field('coPosition', 'Position', 'text', { required: true }),
          field('coToGrade', 'Fuel changing to', 'text', { required: true }),
          field('coSulphur', 'Sulphur content of new fuel (% m/m)', 'number'),
          field('coTanks', 'Tank(s) in service', 'tankMulti', { tankGroup: 'fuel' }),
          field('coVolume', 'Volume of low-sulphur fuel on board (m³)', 'number')
        ]},
        { no: '4', label: 'Changeover completion — distillate (MGO/LSMGO) to residual (HFO)', fields: [
          field('coTime', 'Time', 'time', { required: true }),
          field('coPosition', 'Position', 'text', { required: true }),
          field('coToGrade', 'Fuel changing to', 'text', { required: true }),
          field('coSulphur', 'Sulphur content of new fuel (% m/m)', 'number'),
          field('coTanks', 'Tank(s) in service', 'tankMulti', { tankGroup: 'fuel' }),
          field('coVolume', 'Volume of low-sulphur fuel on board (m³)', 'number')
        ]}
      ]
    }
  ];

  /**
   * Plain-language operation scenarios mapped to the MARPOL code + item numbers they
   * require. Engineers think "I transferred sludge from the settling tank to the sludge
   * tank", not "Code C item 12.2" — this layer does that translation and pre-ticks only
   * the items that operation actually needs.
   *
   * Wording follows the worked examples in MEPC.1/Circ.736/Rev.2.
   * `requires` gates a scenario on fitted equipment / ship type.
   */
  const SCENARIOS = [
    /* ---- Routine (weekly) ---- */
    { id: 'weekly-sludge-bilge', group: 'Routine', part: 1, code: 'C',
      title: 'Weekly inventory — sludge and bilge tanks',
      blurb: 'Sound every IOPP 3.1 sludge tank (Code C 11.1–11.3) and oily bilge / wells (Code I). Must be within 7 days of the last weekly inventory — sooner is allowed, later is not.',
      items: ['11.1', '11.2', '11.3'],
      wizard: 'weekly' },
    { id: 'ows-weekly-test', group: 'Routine', part: 1, code: 'I',
      title: 'Weekly test of 15 ppm equipment (OWS)',
      blurb: 'Routine weekly operational test of the oily-water separator / 15 ppm bilge alarm. Recorded under Code I. Use Code F if the equipment failed.',
      items: ['I'],
      requires: { ows: true },
      weeklyKind: 'ows-test',
      extraFields: [EXTRA_FIELDS.testDuration, EXTRA_FIELDS.timeStart, EXTRA_FIELDS.timeStop],
      presets: { remarks: 'Weekly operational test of 15 ppm bilge alarm / oily-water separator carried out. Equipment found in good working order.' } },
    { id: 'ows-ocm-test', group: 'Routine', part: 1, code: 'I',
      title: 'OWS / OCM test (recirculation line)',
      blurb: 'Step 1 before any manual overboard discharge: test OWS through the recirculation line and confirm OCM / 15 ppm alarm with satisfactory results.',
      items: ['I'],
      requires: { ows: true },
      extraFields: [EXTRA_FIELDS.testDuration, EXTRA_FIELDS.timeStart, EXTRA_FIELDS.timeStop],
      presets: { remarks: 'Test of OWS through recirculation line for satisfactory results and test of OCM with satisfactory results.', testDurationMin: 10 },
      formNotes: ['Required before D.15.1 overboard discharge on the same date. Follow with Code I — breaking the overboard valve seal, then record the discharge.'] },

    /* ---- Fuel oil ---- */
    { id: 'bunker-fuel', group: 'Fuel oil', part: 1, code: 'H',
      title: 'Bunkering fuel oil',
      blurb: 'Taking residual fuel oil bunkers (HFO / LFO / VLSFO) into heavy-fuel tanks only. Records place, time, ISO grade, quantity and tank totals after loading.',
      items: ['26.1', '26.2', '26.3'],
      bunkerFuelCategory: 'residual',
      presets: { fuelType: 'VLSFO', fuelIsoSpec: 'RMG 380' } },
    { id: 'bunker-diesel', group: 'Fuel oil', part: 1, code: 'H',
      title: 'Bunkering diesel oil',
      blurb: 'Taking distillate bunkers (MDO / MGO / LSMGO) into diesel-service tanks only. Same Code H record — grade, quantity and tank totals after loading.',
      items: ['26.1', '26.2', '26.3'],
      bunkerFuelCategory: 'distillate',
      presets: { fuelType: 'MGO', fuelIsoSpec: 'DMA' } },
    { id: 'bunker-lube', group: 'Fuel oil', part: 1, code: 'H',
      title: 'Bunkering lubricating oil',
      blurb: 'Taking bulk lube oil. Records place, time, grade, quantity and tank totals.',
      items: ['26.1', '26.2', '26.4'] },
    { id: 'fo-tank-ballast', group: 'Fuel oil', part: 1, code: 'A',
      title: 'Ballasting or cleaning a fuel oil tank',
      blurb: 'Ballasting or internally cleaning an oil fuel tank.',
      items: ['1', '2', '3.1', '3.2', '3.3', '4.1', '4.2'] },
    { id: 'fo-dirty-ballast', group: 'Fuel oil', part: 1, code: 'B',
      title: 'Discharging dirty ballast / cleaning water from a fuel tank',
      blurb: 'Discharge of dirty ballast or tank-cleaning water from an oil fuel tank.',
      items: ['5', '6', '7', '8', '9.1', '9.2', '10'] },

    /* ---- Sludge / oil residue (IOPP 3.1) ---- */
    { id: 'sludge-purifier', group: 'Sludge / oil residue', part: 1, code: 'C',
      title: 'Sludge collected from purifier / separator drain tank',
      blurb: 'Oil residue drained from fuel or lube oil separators into a sludge tank.',
      items: ['11.1', '11.2', '11.3', '11.4'] },
    { id: 'sludge-sump', group: 'Sludge / oil residue', part: 1, code: 'C',
      title: 'Sludge collected by draining an engine sump',
      blurb: 'Oil residue collected by draining engine sump tanks.',
      items: ['11.1', '11.2', '11.3', '11.4'] },
    { id: 'sludge-manual', group: 'Sludge / oil residue', part: 1, code: 'C',
      title: 'Fuel oil / residue added manually to a sludge tank',
      blurb: 'Manual collection into a sludge tank — all content of a sludge tank counts as sludge.',
      items: ['11.1', '11.2', '11.3', '11.4'] },
    { id: 'sludge-transfer', group: 'Sludge / oil residue', part: 1, code: 'C',
      title: 'Sludge transfer — tank to tank',
      blurb: 'Moving oil residue between IOPP 3.1 tanks. Source retained and receiving total are calculated for you.',
      items: ['12.2'] },

    { id: 'sludge-water-drain', group: 'Sludge / oil residue', part: 1, code: 'C',
      title: 'Draining water from a sludge tank to a bilge water holding tank',
      blurb: 'Settled water drawn off a sludge tank into the oily bilge water holding tank. Recorded as a transfer — the source is drawn down and the receiving tank topped up.',
      items: ['12.2'],
      fieldTankGroups: { fromTank: 'sludge', toTank: 'bilge' } },
    { id: 'sludge-evaporation', group: 'Sludge / oil residue', part: 1, code: 'C',
      title: 'Evaporation of water from a sludge tank',
      blurb: 'Water evaporated off a sludge tank by heating. Disposal by another method — state the quantity evaporated and what is left in the tank.',
      items: ['12.4'],
      presets: { otherMethod: 'Evaporation of water from sludge tank by heating' } },
    { id: 'sludge-regeneration', group: 'Sludge / oil residue', part: 1, code: 'C',
      title: 'FO / LO regeneration from oil residue (sludge)',
      blurb: 'Oil recovered from sludge and returned to service as fuel or lube oil. Disposal by another method.',
      items: ['12.4'],
      presets: { otherMethod: 'FO/LO regeneration from oil residue (sludge)' } },

    /* ---- Bilge water ---- */
    { id: 'bilge-well-to-tank', group: 'Bilge water', part: 1, code: 'D',
      title: 'Bilge water transfer — bilge well to holding tank',
      blurb: 'Pumping engine room bilge wells into the oily bilge water holding tank (manual start).',
      items: ['13', '14', '15.3'],
      fieldTankGroups: { fromTank: 'bilgeWells' } },
    { id: 'bilge-ows-sea', group: 'Bilge water', part: 1, code: 'D',
      title: 'Bilge water discharged overboard via 15 ppm equipment',
      blurb: 'Step 3 — discharge to sea through the OWS / 15 ppm equipment (manual start). Requires OCM test and overboard valve unsealing logged the same date first.',
      items: ['13', '14', '15.1'], requires: { ows: true },
      requiresOwsSequence: true,
      formNotes: [
        'Same-day sequence: (1) OWS / OCM test (Code I), (2) breaking overboard valve seal (Code I), (3) this discharge (D.15.1), (4) re-seal valve when finished.',
        'Ensure the vessel is not in territorial waters, at anchor, or in port unless local rules allow.',
        'Cross-check OWS memory / pump throughput if applicable (nominal capacity check).'
      ] },
    { id: 'bilge-ows-auto-overboard', group: 'Bilge water', part: 1, code: 'E',
      title: 'Bilge system placed in automatic overboard mode (15 ppm)',
      blurb: 'Automatic-mode discharge overboard via 15 ppm equipment. Use Code D when started by hand, and Code E item 18 when returned to manual.',
      items: ['16'], requires: { ows: true } },
    { id: 'bilge-ows-auto-transfer', group: 'Bilge water', part: 1, code: 'E',
      title: 'Bilge system placed in automatic transfer-to-holding mode',
      blurb: 'Automatic-mode transfer of bilge water to a holding tank. Item 18 is a separate entry when the system is put back to manual.',
      items: ['17'], requires: { ows: true } },
    { id: 'bilge-ashore', group: 'Bilge water', part: 1, code: 'D',
      title: 'Bilge water landed ashore to reception facility',
      blurb: 'Bilge water discharged to a shore reception facility — keep the receipt with the ORB.',
      items: ['13', '14', '15.2'] },
    { id: 'bilge-tank-transfer', group: 'Bilge water', part: 1, code: 'D',
      title: 'Bilge water transfer between holding tanks (IOPP 3.3)',
      blurb: 'Moving bilge water between tanks listed in item 3.3 of the IOPP Certificate. Both tanks follow the quantity moved.',
      items: ['13', '14', '15.3'],
      fieldTankGroups: { fromTank: 'bilge', toTank: 'bilge' } },
    { id: 'bilge-to-sludge', group: 'Bilge water', part: 1, code: 'D',
      title: 'Bilge water disposed to a sludge tank',
      blurb: 'Bilge water pumped into an IOPP 3.1 sludge tank. Everything in a sludge tank counts as sludge from that point on.',
      items: ['13', '14', '15.3'],
      fieldTankGroups: { fromTank: 'bilge', toTank: 'sludge' } },
    { id: 'bilge-manual-mode', group: 'Bilge water', part: 1, code: 'E',
      title: 'Bilge system placed in manual mode',
      blurb: 'Recording the change of the automatic bilge system into manual operation.',
      items: ['18'] },

    /* ---- Incineration & disposal ---- */
    { id: 'sludge-incinerated', group: 'Incineration & disposal', part: 1, code: 'C',
      title: 'Sludge incinerated',
      blurb: 'Burning oil residue in the incinerator. Records quantity, tank, retained quantity and total burn time.',
      items: ['12.3'], requires: { incinerator: true } },
    { id: 'sludge-other-disposal', group: 'Incineration & disposal', part: 1, code: 'C',
      title: 'Sludge disposed by another method',
      blurb: 'Any disposal route other than reception facility, transfer or incineration — state the method.',
      items: ['12.4'] },

    /* ---- Reception facility ---- */
    { id: 'sludge-ashore', group: 'Reception facility', part: 1, code: 'C',
      title: 'Sludge discharged ashore to reception facility',
      blurb: 'Landing oil residue ashore. Retained quantity is calculated from the tank ROB less the quantity landed.',
      items: ['12.1'] },

    /* ---- Machinery & equipment ---- */
    { id: 'ows-failure', group: 'Machinery & equipment', part: 1, code: 'F',
      title: '15 ppm / OWS equipment failure',
      blurb: 'Any failure of the oil filtering equipment must be recorded, with the reason and the date repaired.',
      items: ['19', '20', '21'] },
    { id: 'ows-restored', group: 'Machinery & equipment', part: 1, code: 'F',
      title: '15 ppm / OWS equipment restored to operation',
      blurb: 'The oil filtering equipment made operational again after a failure. Record the time it was restored and what was done.',
      items: ['20', '21'] },
    { id: 'general-remarks', group: 'Machinery & equipment', part: 1, code: 'I',
      title: 'Additional procedure or general remark',
      blurb: 'Additional operational procedures and remarks. Never use this in place of codes A–H.',
      items: ['I'] },

    /* ---- Code I operations (additional procedures) ----
       MARPOL gives Code I no item fields of its own, so each of these carries the tank,
       quantity or duration the operation actually involved through the scenario's extra
       fields — which also move the tank R.O.B. where oil changed tanks. */
    { id: 'bilge-oily-to-tank', group: 'Code I operations', part: 1, code: 'I',
      title: 'Pumping oily bilge water to a tank listed in IOPP 3.3',
      blurb: 'Oily bilge water moved into a holding tank listed in item 3.3 of the IOPP Certificate.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.fromTank, EXTRA_FIELDS.toTank, EXTRA_FIELDS.qty,
        EXTRA_FIELDS.fromRetained, EXTRA_FIELDS.toTotal, EXTRA_FIELDS.timeStart, EXTRA_FIELDS.timeStop],
      presets: { remarks: 'Oily bilge water pumped to holding tank listed in item 3.3 of the IOPP Certificate.' } },
    { id: 'bilge-unit-maintenance', group: 'Code I operations', part: 1, code: 'I',
      title: 'Emptying / filling the bilge separation unit for maintenance',
      blurb: 'Draining or refilling the 15 ppm separator itself for servicing — not a discharge.',
      items: ['I'],
      requires: { ows: true },
      extraFields: [EXTRA_FIELDS.fromTank, EXTRA_FIELDS.toTank, EXTRA_FIELDS.qty, EXTRA_FIELDS.timeStart, EXTRA_FIELDS.timeStop],
      presets: { remarks: 'Bilge separation unit emptied and refilled for maintenance purposes. No discharge to sea.' } },
    { id: 'bilge-evaporation', group: 'Code I operations', part: 1, code: 'I',
      title: 'Evaporation of water from a bilge tank',
      blurb: 'Water evaporated off a bilge tank. The quantity comes out of that tank\u2019s R.O.B.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.fromTank, EXTRA_FIELDS.qty, EXTRA_FIELDS.fromRetained],
      presets: { remarks: 'Water evaporated from bilge water holding tank by heating.' } },
    { id: 'aircooler-condensate', group: 'Code I operations', part: 1, code: 'I',
      title: 'Condensate from air coolers to a bilge water holding tank',
      blurb: 'Condensed water from the scavenge / charge air coolers led to a bilge water holding tank.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.toTank, EXTRA_FIELDS.qty, EXTRA_FIELDS.toTotal],
      presets: { remarks: 'Condensated water from air coolers led to bilge water holding tank.' } },
    { id: 'debunker-fuel', group: 'Code I operations', part: 1, code: 'I',
      title: 'De-bunkering fuel oil',
      blurb: 'Landing fuel oil off the ship. Recorded under Code I — Code H covers bunkers taken on, not given up.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.fromTank, EXTRA_FIELDS.qtyT, EXTRA_FIELDS.place, EXTRA_FIELDS.timeStart, EXTRA_FIELDS.timeStop],
      presets: { remarks: 'Fuel oil de-bunkered from the vessel.' } },
    { id: 'debunker-diesel', group: 'Code I operations', part: 1, code: 'I',
      title: 'De-bunkering diesel oil',
      blurb: 'Landing diesel / gas oil off the ship.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.fromTank, EXTRA_FIELDS.qtyT, EXTRA_FIELDS.place, EXTRA_FIELDS.timeStart, EXTRA_FIELDS.timeStop],
      presets: { remarks: 'Diesel oil de-bunkered from the vessel.' } },
    { id: 'seal-applied', group: 'Code I operations', part: 1, code: 'I',
      title: 'Sealing of a MARPOL Annex I valve or equipment',
      blurb: 'A seal fitted to an Annex I related valve or item of equipment. Record the seal number.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.equipment, EXTRA_FIELDS.sealNo, EXTRA_FIELDS.timeStart],
      presets: { remarks: 'Seal fitted to MARPOL Annex I related valve and/or equipment.' } },
    { id: 'seal-broken', group: 'Code I operations', part: 1, code: 'I',
      title: 'Breaking a seal on a MARPOL Annex I valve or equipment',
      blurb: 'Step 2 before overboard discharge: record the overboard valve unsealed for OWS operation, including seal number.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.equipment, EXTRA_FIELDS.sealNo, EXTRA_FIELDS.timeStart],
      presets: {
        extraEquipment: 'Overboard valve from 15 ppm bilge water separator unit',
        remarks: 'Overboard valve unsealed for normal operation of 15 ppm unit.'
      },
      formNotes: ['Log this after the OWS / OCM test and before D.15.1 overboard discharge on the same date.'] },
    { id: 'missed-entry', group: 'Code I operations', part: 1, code: 'I',
      title: 'Entry for an earlier missed operation',
      blurb: 'Recording an operation that was carried out earlier but not entered at the time. The book keeps today\u2019s date; the date it actually happened goes in the wording.',
      items: ['I'],
      extraFields: [EXTRA_FIELDS.missedDate],
      presets: { remarks: 'Entry pertaining to an earlier missed operational entry. Details: ' } },

    /* ---- Exceptional ---- */
    { id: 'accidental-discharge', group: 'Exceptional', part: 1, code: 'G',
      title: 'Accidental or exceptional discharge of oil',
      blurb: 'Time, place, quantity, type of oil and the full circumstances and reasons for the discharge.',
      items: ['22', '23', '24', '25'] },

    /* ---- Part II — tankers ---- */
    { id: 'cargo-load', group: 'Cargo (tankers)', part: 2, code: 'A',
      title: 'Loading oil cargo', blurb: 'Place, type of oil, tanks loaded.', items: ['1', '2', '3'] },
    { id: 'cargo-internal', group: 'Cargo (tankers)', part: 2, code: 'B',
      title: 'Internal transfer of oil cargo during voyage', blurb: 'Moving cargo between tanks at sea.', items: ['4.1', '4.2', '5'] },
    { id: 'cargo-unload', group: 'Cargo (tankers)', part: 2, code: 'C',
      title: 'Unloading oil cargo', blurb: 'Place, tanks unloaded, tanks emptied.', items: ['6', '7', '8'] },
    { id: 'cargo-cow', group: 'Cargo (tankers)', part: 2, code: 'D',
      title: 'Crude oil washing (COW)', blurb: 'COW operation record for crude carriers.', items: ['9', '10', '12', '15'], requires: { cow: true } },
    { id: 'cargo-ballast', group: 'Cargo (tankers)', part: 2, code: 'E',
      title: 'Ballasting cargo tanks', blurb: 'Taking ballast into cargo tanks.', items: ['18', '19.1', '19.2', '19.3'] },
    { id: 'slop-decant', group: 'Cargo (tankers)', part: 2, code: 'I',
      title: 'Discharge of water from slop tanks into the sea', blurb: 'Decanting slop tank water — ODME record required.', items: ['41', '44', '49', '50', '54'] },
    { id: 'dirty-ballast-discharge', group: 'Cargo (tankers)', part: 2, code: 'H',
      title: 'Discharge of dirty ballast', blurb: 'Discharge of dirty ballast from cargo tanks.', items: ['32', '33', '34', '35', '36', '37'] },
    { id: 'residue-transfer', group: 'Cargo (tankers)', part: 2, code: 'J',
      title: 'Collection / transfer / disposal of residues', blurb: 'Slop and residue movements. Retained and receiving totals are calculated for you.', items: ['55', '56', '57.3'] },
    { id: 'odme-condition', group: 'Cargo (tankers)', part: 2, code: 'M',
      title: 'Condition of the ODME system', blurb: 'Failure or condition of the oil discharge monitoring and control system.', items: ['70', '71', '72'], requires: { odme: true } },

    /* ---- Part III — fuel changeover (Annex VI Reg. 14.6) ---- */
    { id: 'changeover-to-ls-start', group: 'Fuel changeover', part: 3, code: 'C',
      title: 'Changeover commencement — HFO to MGO',
      blurb: 'Starting the change to low-sulphur fuel before entering an ECA. Record position, time and the volume of low-sulphur fuel on board.',
      items: ['1'] },
    { id: 'changeover-to-ls-complete', group: 'Fuel changeover', part: 3, code: 'C',
      title: 'Changeover completion — HFO to MGO',
      blurb: 'Changeover complete and low-sulphur fuel in service. This must be recorded before the ship enters the ECA.',
      items: ['2'] },
    { id: 'changeover-to-hs-start', group: 'Fuel changeover', part: 3, code: 'C',
      title: 'Changeover commencement — MGO to HFO',
      blurb: 'Starting the change back to residual fuel after leaving an ECA. This must not begin before the ship is clear of the area.',
      items: ['3'] },
    { id: 'changeover-to-hs-complete', group: 'Fuel changeover', part: 3, code: 'C',
      title: 'Changeover completion — MGO to HFO',
      blurb: 'Changeover back to residual fuel complete, with position, time and the low-sulphur volume remaining on board.',
      items: ['4'] }
  ];

  /** Scenarios available for a part, filtered by what the ship is actually fitted with. */
  function getScenarios(setup, part) {
    const eq = (setup && setup.equipment) || {};
    const p = Number(part) || 1;
    return SCENARIOS.filter(s => {
      if (Number(s.part) !== p) return false;
      const req = s.requires || {};
      if (req.ows && eq.owsFitted === false) return false;
      if (req.incinerator && eq.incineratorFitted === false) return false;
      if (req.odme && !eq.odmeFitted) return false;
      if (req.cow && !eq.cowFitted) return false;
      return true;
    });
  }

  function getScenario(id) {
    return SCENARIOS.find(s => s.id === id) || null;
  }

  /** Scenarios grouped for display: [{ group, scenarios: [...] }] in catalogue order. */
  function getScenarioGroups(setup, part) {
    const groups = [];
    getScenarios(setup, part).forEach(s => {
      let g = groups.find(x => x.group === s.group);
      if (!g) { g = { group: s.group, scenarios: [] }; groups.push(g); }
      g.scenarios.push(s);
    });
    return groups;
  }

  /** MARPOL / SMS: weekly sludge (C.11) inventory at most every 7 days — sooner is allowed. */
  const WEEKLY_INTERVAL_DAYS = 7;

  function addDaysIso(isoDate, days) {
    const d = new Date(String(isoDate).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + Number(days));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function daysBetweenIso(fromIso, toIso) {
    const a = new Date(String(fromIso).slice(0, 10) + 'T12:00:00');
    const b = new Date(String(toIso).slice(0, 10) + 'T12:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function isWeeklySludgeInventory(entry) {
    if (!entry || entry.voided) return false;
    if (Number(entry.part) === 2) return false;
    if (entry.weeklyInventory && entry.code === 'C') return true;
    if (entry.scenarioId === 'weekly-sludge-bilge' || entry.scenarioId === 'sludge-weekly') return true;
    const items = entry.selectedItems || [];
    if (entry.code === 'C' && items.indexOf('11.3') !== -1 &&
        !items.some(n => String(n).indexOf('12') === 0)) return true;
    return false;
  }

  function isWeeklyOwsTest(entry) {
    if (!entry || entry.voided) return false;
    if (entry.scenarioId === 'ows-weekly-test' || entry.weeklyKind === 'ows-test') return true;
    return !!(entry.code === 'I' && entry.values && entry.values.weeklyOwsTest);
  }

  /** OCM / OWS test entries that satisfy the pre-discharge check (same date as D.15.1). */
  function isOwsOcmTestEntry(entry) {
    if (!entry || entry.voided) return false;
    if (entry.scenarioId === 'ows-ocm-test' || entry.scenarioId === 'ows-weekly-test') return true;
    return isWeeklyOwsTest(entry);
  }

  function isOverboardSealBreakEntry(entry) {
    if (!entry || entry.voided) return false;
    return entry.scenarioId === 'seal-broken';
  }

  /**
   * Manual D.15.1 overboard discharge requires same-date OCM test then valve unseal (beORB sequence).
   * @returns {string[]} blocking messages (empty when prerequisites are satisfied)
   */
  function owsDischargePrereqErrors(entries, opts) {
    const o = opts || {};
    if (o.scenarioId !== 'bilge-ows-sea') return [];
    const d = String(o.date || '').slice(0, 10);
    if (!d) return ['Set the operation date before saving overboard discharge.'];
    const day = (entries || []).filter(e => !e.voided && String(e.date).slice(0, 10) === d &&
      (!o.excludeId || e.id !== o.excludeId));
    const errs = [];
    if (!day.some(isOwsOcmTestEntry)) {
      errs.push('Log OWS / OCM test (Code I — OWS / OCM test or weekly 15 ppm test) for ' + formatOrbDate(d) + ' first.');
    }
    if (!day.some(isOverboardSealBreakEntry)) {
      errs.push('Log breaking the overboard valve seal (Code I — seal broken) for ' + formatOrbDate(d) + ' before discharge.');
    }
    const sorted = day.slice().sort((a, b) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const ocm = sorted.filter(isOwsOcmTestEntry).pop();
    const unseal = sorted.filter(isOverboardSealBreakEntry).pop();
    if (ocm && unseal && String(unseal.createdAt || '') < String(ocm.createdAt || '')) {
      errs.push('The seal-breaking entry must be logged after the OCM test on the same date.');
    }
    return errs;
  }

  /** Plain-language checklist for the wizard notes box. */
  function owsDischargePrereqChecklist(entries, date) {
    const d = String(date || '').slice(0, 10);
    const day = (entries || []).filter(e => !e.voided && String(e.date).slice(0, 10) === d);
    return {
      ocm: day.some(isOwsOcmTestEntry),
      unseal: day.some(isOverboardSealBreakEntry),
      date: d
    };
  }

  function lastMatchingEntryDate(entries, pred) {
    let last = null;
    (entries || []).forEach(e => {
      if (!pred(e) || !e.date) return;
      const d = String(e.date).slice(0, 10);
      if (!last || d > last) last = d;
    });
    return last;
  }

  /**
   * Status of a 7-day weekly routine relative to today.
   * dueBy = lastDate + 7. overdue when today is after dueBy.
   */
  function weeklyDueStatus(lastDate, todayIso, intervalDays) {
    const interval = intervalDays != null ? Number(intervalDays) : WEEKLY_INTERVAL_DAYS;
    const today = String(todayIso || '').slice(0, 10);
    if (!lastDate) {
      return { lastDate: null, dueBy: null, daysSince: null, daysLeft: null,
        overdue: false, dueSoon: false, first: true, intervalDays: interval };
    }
    const dueBy = addDaysIso(lastDate, interval);
    const daysSince = daysBetweenIso(lastDate, today);
    const daysLeft = daysBetweenIso(today, dueBy);
    return {
      lastDate, dueBy, daysSince, daysLeft, intervalDays: interval,
      overdue: !!(dueBy && today > dueBy),
      dueSoon: !!(dueBy && today <= dueBy && daysLeft != null && daysLeft <= 1),
      first: false
    };
  }

  /**
   * A new weekly inventory may be dated on or after the last weekly sounding,
   * and not after last+7 days. Sooner is allowed; later is not.
   * Returns an error string, or null when the date is inside the window.
   */
  function weeklyInventoryDateError(date, lastWeeklyDate, label) {
    const what = label || 'Weekly inventory';
    if (!date) return 'Date of operation is required.';
    if (!lastWeeklyDate) return null;
    const dueBy = addDaysIso(lastWeeklyDate, WEEKLY_INTERVAL_DAYS);
    if (date < lastWeeklyDate) {
      return what + ' date cannot be before the last one (' +
        formatOrbDate(lastWeeklyDate) + ').';
    }
    if (dueBy && date > dueBy) {
      return what + ' must be recorded within 7 days of the last one (' +
        formatOrbDate(lastWeeklyDate) + '; due by ' + formatOrbDate(dueBy) +
        '). It may be sooner, never later.';
    }
    return null;
  }

  function defaultOrbSetup(seed) {
    seed = seed || {};
    return {
      flag: seed.flag || 'LR',
      shipName: seed.shipName || '',
      imo: seed.imo || '',
      callSign: seed.callSign || '',
      gt: seed.gt != null ? seed.gt : null,
      shipType: seed.shipType || 'other', // other | tanker
      ioppForm: seed.ioppForm || 'A',
      masterName: seed.masterName || '',
      chiefEng: seed.chiefEng || '',
      equipment: Object.assign({
        owsFitted: true, owsPpm: 15, incineratorFitted: true, odmeFitted: false, cowFitted: false, cbtFitted: false,
        /* Capacities used for auto-ROB checks / mismatch warnings */
        incineratorM3PerH: seed.equipment && seed.equipment.incineratorM3PerH != null ? seed.equipment.incineratorM3PerH : 0.05,
        sludgePumpM3PerH: seed.equipment && seed.equipment.sludgePumpM3PerH != null ? seed.equipment.sludgePumpM3PerH : 2,
        bilgePumpM3PerH: seed.equipment && seed.equipment.bilgePumpM3PerH != null ? seed.equipment.bilgePumpM3PerH : 5,
        transferPumpM3PerH: seed.equipment && seed.equipment.transferPumpM3PerH != null ? seed.equipment.transferPumpM3PerH : 2,
        capacityWarnTolerancePct: seed.equipment && seed.equipment.capacityWarnTolerancePct != null ? seed.equipment.capacityWarnTolerancePct : 15
      }, seed.equipment || {}),
      tanks: {
        /* frameNo: position in the IOPP Supplement tank list, e.g. "Fr. 42–48 (P)". */
        sludge: (seed.tanks && seed.tanks.sludge) || [{ id: 'sludge1', name: 'Sludge Tank', frameNo: '', capacityM3: 5, robM3: 0 }],
        bilge: (seed.tanks && seed.tanks.bilge) || [{ id: 'bilge1', name: 'Oily Bilge Water Holding Tank', frameNo: '', capacityM3: 10, robM3: 0 }],
        bilgeWells: (seed.tanks && seed.tanks.bilgeWells) || [{ id: 'bilgewell1', name: 'Engine Room Bilge Wells', frameNo: '', capacityM3: null, robM3: 0 }],
        fuel: (seed.tanks && seed.tanks.fuel) || [],
        lube: (seed.tanks && seed.tanks.lube) || [],
        dirtyBallast: (seed.tanks && seed.tanks.dirtyBallast) || [],
        cargo: (seed.tanks && seed.tanks.cargo) || [],
        slop: (seed.tanks && seed.tanks.slop) || [],
        cbt: (seed.tanks && seed.tanks.cbt) || []
      },
      /* Engine officers who may sign entries: [{ id, rank, name }]. */
      officers: Array.isArray(seed.officers) ? seed.officers : [],
      disclaimerAck: !!seed.disclaimerAck
    };
  }

  function getFlag(code) {
    const f = FLAGS.find(x => x.code === code) || FLAGS[0];
    return Object.assign({}, f, {
      partIIISupplements: f.partIIISupplements !== false,
      signatory: Object.assign({}, DEFAULT_SIGNATORY, f.signatory || {})
    });
  }

  function flagSignatoryPolicy(code) {
    return getFlag(code).signatory;
  }

  function requiresDualSignatory(code) {
    return flagSignatoryPolicy(code).mode === SIGNATORY_MODES.engineer_and_chief_engineer;
  }

  function normalizeOrbRank(rank) {
    return String(rank || '').trim().toUpperCase().replace(/\s+/g, ' ');
  }

  function isChiefEngineerRank(rank) {
    const r = normalizeOrbRank(rank);
    if (!r) return false;
    return r === 'C/E' || r === 'CE' || r === 'CHIEF ENGINEER' ||
      r.indexOf('CHIEF ENGINEER') === 0;
  }

  function chiefEngRankFromSetup(setup) {
    const ce = String(setup && setup.chiefEng || '').trim();
    const officers = (setup && setup.officers) || [];
    const match = officers.find(o => ce && String(o.name || '').trim().toUpperCase() === ce.toUpperCase());
    if (match && match.rank) return match.rank;
    return 'C/E';
  }

  /**
   * Flag-specific signatory rules for a saved entry (Part I machinery operations).
   * Returns human-readable errors; empty when valid.
   */
  function validateEntrySignatory(setup, entry) {
    const errors = [];
    const pol = flagSignatoryPolicy(setup && setup.flag);
    const name = String(entry && entry.officerName || '').trim();
    const rank = String(entry && entry.officerRank || '').trim();
    if (!name) errors.push('Officer in charge name is required.');
    if (pol.mode === SIGNATORY_MODES.chief_engineer_only && rank && !isChiefEngineerRank(rank)) {
      errors.push(getFlag(setup.flag).name + ' requires the Chief Engineer (C/E) to sign Part I entries — rank must be C/E or Chief Engineer.');
    }
    if (pol.mode === SIGNATORY_MODES.engineer_and_chief_engineer) {
      const ceName = String(entry.chiefEngName || (setup && setup.chiefEng) || '').trim();
      if (!ceName) {
        errors.push(getFlag(setup.flag).name + ' expects a Chief Engineer second signature — set Chief Engineer on ORB Vessel Setup.');
      }
    }
    return errors;
  }

  /** Signature lines for print/preview (one row each in the book). */
  function orbSignatoryLines(entry, setup) {
    const lines = [];
    const primary = formatOrbSignature(entry);
    if (primary) lines.push(primary);
    if (!setup) return lines;
    const pol = flagSignatoryPolicy(setup.flag);
    if (pol.mode !== SIGNATORY_MODES.engineer_and_chief_engineer) return lines;
    const ceName = String(entry.chiefEngName || setup.chiefEng || '').trim();
    if (!ceName) return lines;
    const ceLine = formatOrbSignature({
      officerName: ceName,
      officerRank: entry.chiefEngRank || chiefEngRankFromSetup(setup),
      officerSignedAt: entry.chiefEngSignedAt || entry.officerSignedAt
    });
    if (ceLine && ceLine !== primary) lines.push(ceLine);
    return lines;
  }

  function getPartOps(part) {
    const p = Number(part);
    if (p === 2) return PART_II;
    if (p === 3) return PART_III;
    return PART_I;
  }

  function getOperation(part, code) {
    return getPartOps(part).find(op => op.code === code) || null;
  }

  function tanksForGroup(setup, group) {
    const t = (setup && setup.tanks) || {};
    if (group === 'sludge') return t.sludge || [];
    if (group === 'bilge') return t.bilge || [];
    if (group === 'bilgeWells') return t.bilgeWells || [];
    if (group === 'fuel') return t.fuel || [];
    if (group === 'fuelResidual') return tanksForBunkerCategory(setup, 'residual');
    if (group === 'fuelDistillate') return tanksForBunkerCategory(setup, 'distillate');
    if (group === 'lube') return t.lube || [];
    if (group === 'cargo') return t.cargo || [];
    if (group === 'slop') return t.slop || [];
    if (group === 'cbt') return t.cbt || [];
    if (group === 'dirtyBallast') return t.dirtyBallast || [];
    /* any */
    return [].concat(t.sludge || [], t.bilge || [], t.bilgeWells || [], t.fuel || [], t.lube || [], t.cargo || [], t.slop || [], t.cbt || [], t.dirtyBallast || []);
  }

  /**
   * Display label for a tank: name, frame position and capacity.
   * ORB tank-identity items are far more useful to a PSC inspector when the frame
   * position from the IOPP Supplement is carried alongside the tank name.
   */
  function tankLabel(setup, id) {
    const hit = findTank(setup, id);
    if (!hit) return String(id == null ? '' : id);
    const t = hit.tank;
    const bits = [];
    if (t.frameNo) bits.push(String(t.frameNo).trim());
    if (t.capacityM3 != null && t.capacityM3 !== '') bits.push(fmtVal(t.capacityM3) + ' m³');
    return t.name + (bits.length ? ' (' + bits.join(', ') + ')' : '');
  }

  /** Tank name plus frame position only — used inside ORB record wording. */
  function tankIdentity(setup, id) {
    const hit = findTank(setup, id);
    if (!hit) return String(id == null ? '' : id);
    const t = hit.tank;
    return t.frameNo ? `${t.name} (${String(t.frameNo).trim()})` : t.name;
  }

  /**
   * Weekly inventory builder (MEPC.1/Circ.736 Example #1).
   * - Sludge / oil residue tanks (IOPP 3.1) → Code C items 11.1 / 11.2 / 11.3 per tank (mandatory weekly).
   * - Oily bilge water holding (IOPP 3.3) + other bilge tanks/wells → Code I (voluntary per Circ.736).
   * soundings: [{ id, group, name, capacityM3, robM3, include }]
   */
  function buildWeeklyInventory(setup, soundings, options) {
    options = options || {};
    const list = Array.isArray(soundings) ? soundings : [];
    const sludgeLines = [];
    const sludgeTanks = [];
    const bilgeParts = [];
    const bilgeWellParts = [];

    list.forEach(row => {
      if (!row || row.include === false) return;
      /* Frame position belongs in the weekly inventory wording too (item 11.1). */
      const name = tankIdentity(setup, row.id) || row.name || row.id;
      const cap = row.capacityM3;
      const rob = row.robM3;
      if (row.group === 'sludge') {
        if (rob == null || rob === '') return;
        sludgeTanks.push({ id: row.id, name, capacityM3: cap, robM3: rob });
      } else if (row.group === 'bilge') {
        if (rob == null || rob === '') return;
        bilgeParts.push(
          name + ' — capacity ' + (cap != null && cap !== '' ? fmtVal(Number(cap)) + ' m³' : 'n/a') +
          ', retained ' + fmtVal(Number(rob)) + ' m³'
        );
      } else if (row.group === 'bilgeWells') {
        if (rob == null || rob === '') return;
        bilgeWellParts.push(
          name + ' — ' + (cap != null && cap !== '' ? ('capacity ' + fmtVal(Number(cap)) + ' m³, ') : '') +
          'retained ' + fmtVal(Number(rob)) + ' m³'
        );
      }
    });

    const out = { entries: [], errors: [] };
    if (!sludgeTanks.length) {
      out.errors.push('Enter retained quantity (m³) for at least one sludge / oil residue tank (IOPP 3.1) — weekly C.11 inventory.');
    } else {
      /* One book operation per sludge tank — not one Code C row compounding every tank. */
      sludgeTanks.forEach(tank => {
        out.entries.push({
          part: 1,
          code: 'C',
          selectedItems: ['11.1', '11.2', '11.3'],
          values: {
            weeklyInventory: true,
            sludgeTanks: [tank],
            inventoryKind: 'weekly-sludge',
            tankId: tank.id
          },
          lines: [
            { itemNo: '11.1', text: String(tank.name) },
            { itemNo: '11.2', text: (tank.capacityM3 != null && tank.capacityM3 !== '' ? fmtVal(Number(tank.capacityM3)) : '—') + ' m³' },
            { itemNo: '11.3', text: fmtVal(Number(tank.robM3)) + ' m³' }
          ],
          title: 'Weekly inventory — ' + tank.name + ' (IOPP 3.1)'
        });
      });
    }

    if (bilgeParts.length) {
      bilgeParts.forEach(partText => {
        const remarks = 'Weekly inventory of oily bilge water holding tank (IOPP Supplement item 3.3 — voluntary per MEPC.1/Circ.736): ' + partText + '.';
        out.entries.push({
          part: 1,
          code: 'I',
          selectedItems: ['I'],
          values: { remarks, weeklyInventory: true, inventoryKind: 'weekly-bilge' },
          lines: [{ itemNo: '', text: remarks }],
          title: 'Weekly inventory — oily bilge holding tank'
        });
      });
    }
    if (bilgeWellParts.length) {
      bilgeWellParts.forEach(partText => {
        const remarks = 'Weekly inventory of bilge tank / well: ' + partText + '.';
        out.entries.push({
          part: 1,
          code: 'I',
          selectedItems: ['I'],
          values: { remarks, weeklyInventory: true, inventoryKind: 'weekly-bilge-well' },
          lines: [{ itemNo: '', text: remarks }],
          title: 'Weekly inventory — bilge well / tank'
        });
      });
    }
    if (!bilgeParts.length && !bilgeWellParts.length && options.requireBilge) {
      out.errors.push('Enter retained quantity for oily bilge holding and/or bilge tanks, or untick “Require bilge inventory”.');
    }

    return out;
  }

  function tankName(setup, id) {
    if (!id) return '';
    const all = tanksForGroup(setup, 'any');
    const hit = all.find(x => x.id === id || x.name === id);
    return hit ? hit.name : String(id);
  }

  function findTank(setup, id) {
    if (!id || !setup || !setup.tanks) return null;
    const groups = Object.keys(setup.tanks);
    for (let i = 0; i < groups.length; i++) {
      const list = setup.tanks[groups[i]] || [];
      const hit = list.find(t => t && (t.id === id || t.name === id));
      if (hit) return { tank: hit, group: groups[i] };
    }
    return null;
  }

  function numOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }

  function hoursBetween(start, stop) {
    if (!start || !stop) return null;
    const [sh, sm] = String(start).split(':').map(Number);
    const [eh, em] = String(stop).split(':').map(Number);
    if (![sh, sm, eh, em].every(isFinite)) return null;
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60; /* crossed midnight */
    return mins / 60;
  }

  function round3(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }

  /** Normalise a tankMulti value (array, or '|'-joined string) to an array of ids. */
  function tankIdList(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (v == null || v === '') return [];
    return String(v).split('|').filter(Boolean);
  }

  /**
   * Parse a per-tank quantity split like "FO1=120, FO2=80" or "sludge1:2.5".
   * Keys match a tank id or a tank name, case-insensitively, so the engineer can type
   * whichever they see on the tank plate. Returns a Map(tankId -> quantity), or null
   * when nothing usable was written.
   */
  function parseTankSplit(setup, raw, allowedIds) {
    if (raw == null || String(raw).trim() === '') return null;
    const allow = allowedIds && allowedIds.length ? new Set(allowedIds) : null;
    const byKey = new Map();
    (allowedIds || []).forEach(id => {
      byKey.set(String(id).toLowerCase(), id);
      const hit = findTank(setup, id);
      if (hit && hit.tank.name) byKey.set(String(hit.tank.name).trim().toLowerCase(), id);
    });
    const out = new Map();
    String(raw).split(/[;,\n]+/).forEach(part => {
      const m = String(part).match(/^\s*(.+?)\s*[=:]\s*([-\d.]+)\s*$/);
      if (!m) return;
      const key = m[1].trim().toLowerCase();
      const qty = numOrNull(m[2]);
      if (qty == null) return;
      const id = byKey.get(key) || key;
      if (allow && !allow.has(id)) return;
      out.set(id, (out.get(id) || 0) + qty);
    });
    return out.size ? out : null;
  }

  /**
   * How much of `qty` goes into each selected tank.
   * Explicit split wins; a single selected tank takes the lot; otherwise we cannot
   * guess and return null so the caller can warn instead of inventing numbers.
   */
  function resolveTankShares(setup, tankIds, qty, splitRaw) {
    const ids = tankIdList(tankIds);
    if (!ids.length || qty == null) return null;
    const split = parseTankSplit(setup, splitRaw, ids);
    if (split) return split;
    if (ids.length === 1) return new Map([[ids[0], qty]]);
    return null;
  }

  /** Per-tank added MT and ROB after bunkering (beORB Code H layout). */
  function resolveFuelBunkerTankRows(setup, val) {
    const v = val || {};
    const ids = tankIdList(v.fuelTank);
    const splitMap = parseTankSplit(setup, v.fuelSplit, ids.length ? ids : null);
    const robMap = parseTankSplit(setup, v.fuelRobSplit, ids.length ? ids : null);
    if (splitMap && splitMap.size && robMap && robMap.size) {
      const paired = [];
      splitMap.forEach((added, id) => {
        if (!robMap.has(id)) return;
        paired.push({
          id,
          added,
          rob: robMap.get(id),
          label: tankIdentity(setup, id)
        });
      });
      if (paired.length) return paired;
    }
    const total = numOrNull(v.fuelQty);
    const shares = resolveTankShares(setup, ids, total, v.fuelSplit);
    const rows = [];
    if (shares) {
      shares.forEach((added, id) => {
        let rob = robMap && robMap.has(id) ? robMap.get(id) : null;
        if (robMap && robMap.size && !robMap.has(id)) return;
        if (rob == null) {
          const hit = findTank(setup, id);
          const prior = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : null;
          if (prior != null && added != null) rob = round3(prior + added);
        }
        rows.push({ id, added, rob, label: tankIdentity(setup, id) });
      });
      return rows;
    }
    if (ids.length === 1 && total != null) {
      const id = ids[0];
      let rob = robMap && robMap.has(id) ? robMap.get(id) : numOrNull(v.fuelTotal);
      if (rob == null) {
        const hit = findTank(setup, id);
        const prior = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : null;
        if (prior != null) rob = round3(prior + total);
      }
      rows.push({ id, added: total, rob, label: tankIdentity(setup, id) });
    }
    return rows;
  }

  /** Sum of MT added for receiving tanks that have both added and ROB after filled in. */
  function fuelBunkerPairedAddedSum(setup, values) {
    let sum = 0;
    resolveFuelBunkerTankRows(setup, values).forEach(r => {
      const n = numOrNull(r.added);
      if (n != null) sum += n;
    });
    return round3(sum);
  }

  function validateFuelBunkerQtyErrors(setup, code, selectedItems, values) {
    const errors = [];
    if (code !== 'H' || !selectedItemNos(selectedItems).includes('26.3')) return errors;
    const rows = resolveFuelBunkerTankRows(setup, values);
    if (!rows.length) {
      errors.push('Enter MT added and ROB after (MT) for at least one receiving tank. Blank tanks are excluded from the ORB record.');
      return errors;
    }
    const sum = fuelBunkerPairedAddedSum(setup, values);
    const total = numOrNull((values || {}).fuelQty);
    if (total == null) return errors;
    if (Math.abs(sum - total) > 0.001) {
      errors.push('Total quantity added (' + fmtVal(total) + ' MT) must equal the sum of per-tank MT added (' +
        fmtVal(sum) + ' MT).');
    }
    return errors;
  }

  function tolPct(setup) {
    const t = setup && setup.equipment && Number(setup.equipment.capacityWarnTolerancePct);
    return isFinite(t) && t >= 0 ? t : 15;
  }

  function mismatchWarning(label, actual, expected, unit, setup) {
    if (actual == null || expected == null || !(expected > 0)) return null;
    const pct = Math.abs(actual - expected) / expected * 100;
    if (pct <= tolPct(setup)) return null;
    return {
      level: pct >= 40 ? 'error' : 'warn',
      code: 'CAPACITY_MISMATCH',
      message: label + ': recorded ' + fmtVal(actual) + ' ' + unit +
        ' vs equipment capacity ≈ ' + fmtVal(round3(expected)) + ' ' + unit +
        ' (' + fmtVal(round3(pct)) + '% difference; tolerance ' + tolPct(setup) + '%). Check quantity, time, or rated capacity in ORB Vessel Setup.'
    };
  }

  /**
   * Auto-fill derived fields (retained, toTotal, capacity) from current tank ROB
   * without mutating setup. Returns a new values object + notes.
   */
  function autofillOperationValues(setup, part, code, selectedItems, values) {
    const v = Object.assign({}, values || {});
    const notes = [];
    const want = new Set(selectedItemNos(selectedItems));
    if (Number(part) === 2) return autofillPartTwoValues(setup, code, selectedItems, values);
    if (Number(part) !== 1) return { values: v, notes };

    function tankRob(id) {
      const hit = findTank(setup, id);
      return hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : null;
    }
    function tankCap(id) {
      const hit = findTank(setup, id);
      return hit && hit.tank.capacityM3 != null ? Number(hit.tank.capacityM3) : null;
    }

    if (code === 'C') {
      if (want.has('11.1') || want.has('11.2') || want.has('11.3')) {
        const id = v.tank;
        if (id) {
          if (v.capacity == null || v.capacity === '') {
            const c = tankCap(id);
            if (c != null) { v.capacity = c; notes.push('Capacity filled from ' + tankName(setup, id) + '.'); }
          }
          if (v.retention == null || v.retention === '') {
            const r = tankRob(id);
            if (r != null) { v.retention = r; notes.push('Retention filled from current ROB.'); }
          }
        }
      }
      if (want.has('11.4')) {
        const id = v.tank;
        const add = numOrNull(v.manualCollected);
        const base = tankRob(id);
        if (id && add != null && (v.retention == null || v.retention === '') && base != null) {
          v.retention = round3(base + add);
          if (v.capacity == null || v.capacity === '') {
            const c = tankCap(id);
            if (c != null) v.capacity = c;
          }
          notes.push('Retention after manual collection = prior ROB + collected.');
        }
      }
      if (want.has('12.1') || want.has('12.3') || want.has('12.4')) {
        const id = v.tankEmptied;
        const qty = numOrNull(v.qtyDisposed);
        const prior = tankRob(id);
        if (id && qty != null && (v.retained == null || v.retained === '') && prior != null) {
          v.retained = round3(Math.max(0, prior - qty));
          notes.push('Retained auto-calculated: ' + fmtVal(prior) + ' − ' + fmtVal(qty) + ' = ' + fmtVal(v.retained) + ' m³.');
        }
      }
      if (want.has('12.3')) {
        const eq = (setup && setup.equipment) || {};
        const rate = numOrNull(eq.incineratorM3PerH);
        const qty = numOrNull(v.qtyDisposed);
        const hours = numOrNull(v.incinHours);
        if (rate != null && rate > 0) {
          if (qty != null && qty > 0 && (v.incinHours == null || v.incinHours === '')) {
            v.incinHours = round3(qty / rate);
            notes.push('Incinerator hours auto-calculated: ' + fmtVal(qty) + ' m³ ÷ ' + fmtVal(rate) + ' m³/h.');
          } else if (hours != null && hours > 0 && (v.qtyDisposed == null || v.qtyDisposed === '')) {
            v.qtyDisposed = round3(rate * hours);
            notes.push('Incinerated quantity auto-calculated from rated capacity × hours.');
          }
        }
      }
      if (want.has('12.2')) {
        const fromId = v.fromTank;
        const toId = v.toTank;
        const qty = numOrNull(v.qtyDisposed);
        const fromPrior = tankRob(fromId);
        const toPrior = tankRob(toId);
        if (fromId && qty != null && (v.retained == null || v.retained === '') && fromPrior != null) {
          v.retained = round3(Math.max(0, fromPrior - qty));
          notes.push('Source retained auto-calculated from ROB.');
        }
        if (toId && qty != null && (v.toTotal == null || v.toTotal === '') && toPrior != null) {
          v.toTotal = round3(toPrior + qty);
          notes.push('Receiving tank total auto-calculated from ROB + transferred.');
        }
      }
    }

    if (code === 'D') {
      const fromId = v.fromTank;
      const qty = numOrNull(v.qty);
      const prior = tankRob(fromId);
      if (fromId && (v.fromCap == null || v.fromCap === '')) {
        const c = tankCap(fromId);
        if (c != null) v.fromCap = c;
      }
      if (fromId && qty != null && (v.fromRetained == null || v.fromRetained === '') && prior != null) {
        v.fromRetained = round3(Math.max(0, prior - qty));
        notes.push('Bilge holding retained auto-calculated from ROB − quantity.');
      }
      if (want.has('15.3')) {
        const toId = v.toTank;
        const toPrior = tankRob(toId);
        if (toId && qty != null && (v.toRetained == null || v.toRetained === '') && toPrior != null) {
          v.toRetained = round3(toPrior + qty);
          notes.push('Receiving tank retained auto-calculated from ROB + transferred.');
        }
      }
    }

    /* Bunkering: total content after = prior ROB + what went into each tank.
       Works for a split across several tanks, not just a single-tank stem. */
    function bunkerTotals(tankField, qtyField, splitField, totalField, label) {
      const ids = tankIdList(v[tankField]);
      const add = numOrNull(v[qtyField]);
      if (!ids.length || add == null) return;
      const shares = resolveTankShares(setup, ids, add, v[splitField]);
      if (!shares) {
        notes.push(label + ': ' + ids.length + ' tanks selected — enter a per-tank split to auto-calculate totals.');
        return;
      }
      let total = 0, known = 0;
      shares.forEach((qty, id) => {
        const prior = tankRob(id);
        if (prior != null) { total += prior + qty; known += 1; }
      });
      if (known && (v[totalField] == null || v[totalField] === '')) {
        v[totalField] = round3(total);
        notes.push(label + ' total content auto-calculated: prior ROB + bunkered quantity'
          + (shares.size > 1 ? ' across ' + shares.size + ' tanks.' : '.'));
      }
    }
    if (code === 'H' && want.has('26.3')) {
      bunkerTotals('fuelTank', 'fuelQty', 'fuelSplit', 'fuelTotal', 'Fuel tank');
      const ids = tankIdList(v.fuelTank);
      const add = numOrNull(v.fuelQty);
      const shares = resolveTankShares(setup, ids, add, v.fuelSplit);
      if (shares && (v.fuelRobSplit == null || String(v.fuelRobSplit).trim() === '')) {
        const parts = [];
        shares.forEach((qty, id) => {
          const hit = findTank(setup, id);
          const prior = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
          parts.push(id + '=' + round3(prior + qty));
        });
        v.fuelRobSplit = parts.join(', ');
        notes.push('Per-tank ROB after bunkering auto-calculated (prior + MT added).');
      }
    }
    if (code === 'H' && want.has('26.4')) bunkerTotals('lubeTank', 'lubeQty', 'lubeSplit', 'lubeTotal', 'Lube oil tank');

    return { values: v, notes };
  }

  /**
   * Part II (tankers) code J — collection/transfer/disposal of residues and oily mixtures.
   * Mirrors the Part I code C treatment so slop/cargo tank quantities stay consistent.
   */
  function autofillPartTwoValues(setup, code, selectedItems, values) {
    const v = Object.assign({}, values || {});
    const notes = [];
    const want = new Set(selectedItemNos(selectedItems));
    if (code !== 'J') return { values: v, notes };

    function tankRob(id) {
      const hit = findTank(setup, id);
      return hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : null;
    }
    const qty = numOrNull(v.qty);
    const ids = tankIdList(v.tanks);

    /* 56 — retained in the source tank(s) after the operation. */
    if (want.has('56') && qty != null && ids.length === 1 && (v.retained == null || v.retained === '')) {
      const prior = tankRob(ids[0]);
      if (prior != null) {
        v.retained = round3(Math.max(0, prior - qty));
        notes.push('Retained auto-calculated: ' + fmtVal(prior) + ' − ' + fmtVal(qty) + ' = ' + fmtVal(v.retained) + ' m³.');
      }
    }
    /* 57.3 — quantity moved into another tank. */
    if (want.has('57.3') && qty != null && v.toTank && (v.toTotal == null || v.toTotal === '')) {
      const toPrior = tankRob(v.toTank);
      if (toPrior != null) {
        v.toTotal = round3(toPrior + qty);
        notes.push('Receiving tank total auto-calculated from ROB + transferred.');
      }
    }
    return { values: v, notes };
  }

  /**
   * Capacity / rate warnings (incinerator burn rate, pump transfer rate vs quantity & time).
   */
  function capacityWarnings(setup, part, code, selectedItems, values) {
    const warnings = [];
    if (Number(part) !== 1) return warnings;
    const v = values || {};
    const want = new Set(selectedItemNos(selectedItems));
    const eq = (setup && setup.equipment) || {};

    if (code === 'C' && want.has('12.3')) {
      const qty = numOrNull(v.qtyDisposed);
      const hours = numOrNull(v.incinHours);
      const rate = numOrNull(eq.incineratorM3PerH);
      if (qty != null && hours != null && hours > 0 && rate != null && rate > 0) {
        const expected = rate * hours;
        const w = mismatchWarning('Incinerator sludge burning capacity', qty, expected, 'm³', setup);
        if (w) warnings.push(w);
        else warnings.push({
          level: 'info',
          code: 'INCIN_OK',
          message: 'Incinerator check OK: ' + fmtVal(qty) + ' m³ in ' + fmtVal(hours) +
            ' h ≈ ' + fmtVal(round3(expected)) + ' m³ at ' + fmtVal(rate) + ' m³/h rated capacity.'
        });
      } else if (eq.incineratorFitted !== false && (rate == null || !(rate > 0))) {
        warnings.push({ level: 'warn', code: 'INCIN_RATE_MISSING', message: 'Set incinerator sludge capacity (m³/h) in ORB Vessel Setup to validate burning quantity vs time.' });
      }
      const id = v.tankEmptied;
      const hit = findTank(setup, id);
      if (hit && qty != null && hit.tank.robM3 != null && qty - Number(hit.tank.robM3) > 0.001) {
        warnings.push({ level: 'error', code: 'ROB_EXCEEDED', message: 'Incinerated quantity (' + fmtVal(qty) + ' m³) exceeds current ROB in ' + hit.tank.name + ' (' + fmtVal(hit.tank.robM3) + ' m³).' });
      }
    }

    if (code === 'C' && (want.has('12.1') || want.has('12.2') || want.has('12.4'))) {
      const qty = numOrNull(v.qtyDisposed);
      const hours = hoursBetween(v.timeStart, v.timeStop);
      const rate = numOrNull(eq.sludgePumpM3PerH) || numOrNull(eq.transferPumpM3PerH);
      if (qty != null && hours != null && hours > 0 && rate != null && rate > 0) {
        const expected = rate * hours;
        const w = mismatchWarning('Sludge / transfer pump capacity', qty, expected, 'm³', setup);
        if (w) warnings.push(w);
      }
      const fromId = want.has('12.2') ? v.fromTank : v.tankEmptied;
      const hit = findTank(setup, fromId);
      if (hit && qty != null && hit.tank.robM3 != null && qty - Number(hit.tank.robM3) > 0.001) {
        warnings.push({ level: 'error', code: 'ROB_EXCEEDED', message: 'Transferred/disposed quantity (' + fmtVal(qty) + ' m³) exceeds ROB in ' + hit.tank.name + ' (' + fmtVal(hit.tank.robM3) + ' m³).' });
      }
      if (want.has('12.2')) {
        const toHit = findTank(setup, v.toTank);
        const toTotal = numOrNull(v.toTotal);
        if (toHit && toTotal != null && toHit.tank.capacityM3 != null && toTotal - Number(toHit.tank.capacityM3) > 0.001) {
          warnings.push({ level: 'error', code: 'OVERFILL', message: 'Receiving tank total (' + fmtVal(toTotal) + ' m³) exceeds capacity of ' + toHit.tank.name + ' (' + fmtVal(toHit.tank.capacityM3) + ' m³).' });
        }
      }
    }

    if (code === 'D') {
      const qty = numOrNull(v.qty);
      const hours = hoursBetween(v.timeStart, v.timeStop);
      const rate = numOrNull(eq.bilgePumpM3PerH) || numOrNull(eq.transferPumpM3PerH);
      if (qty != null && hours != null && hours > 0 && rate != null && rate > 0) {
        const expected = rate * hours;
        const w = mismatchWarning('Bilge pump capacity', qty, expected, 'm³', setup);
        if (w) warnings.push(w);
      } else if (qty != null && hours != null && hours > 0 && !(rate > 0)) {
        warnings.push({ level: 'warn', code: 'BILGE_RATE_MISSING', message: 'Set bilge pump capacity (m³/h) in ORB Vessel Setup to validate quantity vs pumping time.' });
      }
      const hit = findTank(setup, v.fromTank);
      if (hit && qty != null && hit.tank.robM3 != null && qty - Number(hit.tank.robM3) > 0.001) {
        warnings.push({ level: 'error', code: 'ROB_EXCEEDED', message: 'Bilge quantity (' + fmtVal(qty) + ' m³) exceeds ROB in ' + hit.tank.name + ' (' + fmtVal(hit.tank.robM3) + ' m³).' });
      }
    }

    /* Bunkering: overfill per receiving tank, and flag a split we cannot resolve. */
    function bunkerWarnings(tankField, qtyField, splitField, totalField, label) {
      const ids = tankIdList(v[tankField]);
      const add = numOrNull(v[qtyField]);
      const total = numOrNull(v[totalField]);
      if (ids.length === 1 && total != null) {
        const hit = findTank(setup, ids[0]);
        if (hit && hit.tank.capacityM3 != null && total - Number(hit.tank.capacityM3) > 0.001) {
          warnings.push({ level: 'error', code: 'OVERFILL', message: label + ' total content (' + fmtVal(total) + ') exceeds capacity of ' + hit.tank.name + ' (' + fmtVal(hit.tank.capacityM3) + ').' });
        }
        return;
      }
      if (ids.length <= 1 || add == null) return;
      const shares = resolveTankShares(setup, ids, add, v[splitField]);
      if (!shares) {
        warnings.push({ level: 'warn', code: 'SPLIT_REQUIRED',
          message: label + ': ' + ids.length + ' tanks selected. Enter a per-tank split (e.g. "' + ids[0] + '=' + fmtVal(add) + '") so tank ROB can be updated.' });
        return;
      }
      let sum = 0;
      shares.forEach((qty, id) => {
        sum += qty;
        const hit = findTank(setup, id);
        if (!hit || hit.tank.capacityM3 == null) return;
        const base = hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
        if (base + qty - Number(hit.tank.capacityM3) > 0.001) {
          warnings.push({ level: 'error', code: 'OVERFILL', message: label + ': ' + hit.tank.name + ' would reach ' + fmtVal(base + qty) + ' vs capacity ' + fmtVal(hit.tank.capacityM3) + '.' });
        }
      });
      if (Math.abs(sum - add) > 0.001) {
        warnings.push({ level: 'error', code: 'SPLIT_MISMATCH',
          message: label + ': per-tank split totals ' + fmtVal(sum) + ' but quantity added is ' + fmtVal(add) + '.' });
      }
    }
    if (code === 'H' && want.has('26.3')) bunkerWarnings('fuelTank', 'fuelQty', 'fuelSplit', 'fuelTotal', 'Fuel bunkering');
    if (code === 'H' && want.has('26.4')) bunkerWarnings('lubeTank', 'lubeQty', 'lubeSplit', 'lubeTotal', 'Lube oil bunkering');

    return warnings;
  }

  /** API gravity from specific gravity at 15°C (141.5/SG − 131.5). */
  function apiFromSpecificGravity(sg) {
    const s = numOrNull(sg);
    if (s == null || !(s > 0)) return null;
    return round3(141.5 / s - 131.5);
  }

  /** API from density @15°C in kg/m³ (SG = ρ/1000). */
  function apiFromDensityKgM3(density) {
    const d = numOrNull(density);
    if (d == null || !(d > 0)) return null;
    return apiFromSpecificGravity(d / 1000);
  }

  /**
   * Live alignment hints (rate × time vs quantity, bunkering split vs total received).
   * Shown beside the form sheet; capacityWarnings still flags out-of-tolerance cases.
   */
  function operationFieldHelpers(setup, part, code, selectedItems, values) {
    const hints = [];
    if (Number(part) !== 1) return hints;
    const v = values || {};
    const want = new Set(selectedItemNos(selectedItems));
    const eq = (setup && setup.equipment) || {};

    function pushRateHint(label, qty, hours, rate, unit) {
      if (qty == null || hours == null || !(hours > 0) || rate == null || !(rate > 0)) return;
      const expected = rate * hours;
      const aligned = Math.abs(qty - expected) / expected * 100 <= tolPct(setup);
      hints.push({
        level: aligned ? 'info' : 'warn',
        code: 'RATE_ALIGN',
        message: label + ': ' + fmtVal(qty) + ' ' + unit + ' recorded vs ' + fmtVal(rate) + ' ' + unit +
          '/h × ' + fmtVal(hours) + ' h ≈ ' + fmtVal(round3(expected)) + ' ' + unit +
          (aligned ? ' (within setup tolerance).' : ' — adjust quantity, duration, or rated capacity.')
      });
      if (!aligned && qty > 0 && rate > 0) {
        hints.push({
          level: 'info',
          code: 'RATE_SUGGEST_H',
          message: 'Implied duration at rated capacity: ' + fmtVal(round3(qty / rate)) + ' h.'
        });
      }
      if (!aligned && hours > 0 && rate > 0) {
        hints.push({
          level: 'info',
          code: 'RATE_SUGGEST_Q',
          message: 'Implied quantity at rated capacity: ' + fmtVal(round3(rate * hours)) + ' ' + unit + '.'
        });
      }
    }

    if (code === 'C' && want.has('12.3')) {
      const rate = numOrNull(eq.incineratorM3PerH);
      if (eq.incineratorFitted !== false && rate != null && rate > 0) {
        pushRateHint('Incinerator burn', numOrNull(v.qtyDisposed), numOrNull(v.incinHours), rate, 'm³');
      } else if (eq.incineratorFitted !== false) {
        hints.push({ level: 'warn', code: 'INCIN_RATE_MISSING',
          message: 'Set incinerator sludge capacity (m³/h) in ORB Vessel Setup to align burn time with quantity.' });
      }
    }

    if (code === 'C' && (want.has('12.1') || want.has('12.2'))) {
      const rate = numOrNull(eq.sludgePumpM3PerH) || numOrNull(eq.transferPumpM3PerH);
      const hours = hoursBetween(v.timeStart, v.timeStop);
      pushRateHint('Sludge / transfer pump', numOrNull(v.qtyDisposed), hours, rate, 'm³');
    }

    if (code === 'D') {
      const rate = numOrNull(eq.bilgePumpM3PerH) || numOrNull(eq.transferPumpM3PerH);
      const hours = hoursBetween(v.timeStart, v.timeStop);
      pushRateHint('Bilge pump', numOrNull(v.qty), hours, rate, 'm³');
    }

    function bunkerReceiveHint(tankField, qtyField, splitField, label) {
      const ids = tankIdList(v[tankField]);
      const add = numOrNull(v[qtyField]);
      if (!ids.length || add == null) return;
      const shares = resolveTankShares(setup, ids, add, v[splitField]);
      if (shares) {
        const parts = [];
        let sum = 0;
        shares.forEach((q, id) => {
          sum += q;
          parts.push(tankLabel(setup, id) + ' +' + fmtVal(q) + ' t');
        });
        const aligned = Math.abs(sum - add) <= 0.001;
        hints.push({
          level: aligned ? 'info' : 'error',
          code: 'BUNKER_SPLIT',
          message: label + ' received: ' + parts.join('; ') + ' = ' + fmtVal(round3(sum)) + ' t' +
            (aligned ? ' (matches quantity added ' + fmtVal(add) + ' t).' :
              ' — split totals ' + fmtVal(round3(sum)) + ' t but quantity added is ' + fmtVal(add) + ' t.')
        });
      } else if (ids.length > 1) {
        hints.push({
          level: 'warn',
          code: 'BUNKER_SPLIT_NEEDED',
          message: label + ': ' + ids.length + ' tanks selected — enter a per-tank split totalling ' + fmtVal(add) + ' t.'
        });
      } else {
        hints.push({
          level: 'info',
          code: 'BUNKER_SINGLE',
          message: label + ': full ' + fmtVal(add) + ' t to ' + tankLabel(setup, ids[0]) + '.'
        });
      }
    }
    if (code === 'H' && want.has('26.3')) {
      const rows = resolveFuelBunkerTankRows(setup, v);
      const add = numOrNull(v.fuelQty);
      if (rows.length) {
        const sum = fuelBunkerPairedAddedSum(setup, v);
        const parts = rows.map(r => tankLabel(setup, r.id) + ' +' + fmtVal(r.added) + ' MT');
        const aligned = add != null && Math.abs(sum - add) <= 0.001;
        hints.push({
          level: add == null ? 'warn' : (aligned ? 'info' : 'error'),
          code: 'BUNKER_TOTAL',
          message: 'Per-tank MT added: ' + parts.join('; ') + ' = ' + fmtVal(sum) + ' MT' +
            (add == null ? '.' :
              (aligned ? ' (matches total quantity added ' + fmtVal(add) + ' MT).' :
                ' — adjust total or per-tank MT added (total is ' + fmtVal(add) + ' MT).'))
        });
      } else if (add != null) {
        hints.push({
          level: 'warn',
          code: 'BUNKER_TANKS_NEEDED',
          message: 'Fuel bunkering: enter MT added and ROB after for at least one receiving tank.'
        });
      }
    }
    if (code === 'H' && want.has('26.4')) bunkerReceiveHint('lubeTank', 'lubeQty', 'lubeSplit', 'Lube oil bunkering');

    return hints;
  }

  /**
   * Apply ROB side-effects after a successful save. Mutates setup.tanks robM3 values.
   * Returns list of human-readable ROB change notes.
   */
  function applyOperationRob(setup, part, code, selectedItems, values) {
    const notes = [];
    /* Part III is the Annex VI changeover record — it moves fuel between service tanks,
       not oil residue, so it has no Annex I tank R.O.B. effect. */
    if (!setup || (Number(part) !== 1 && Number(part) !== 2)) return notes;
    const v = values || {};
    const want = new Set(selectedItemNos(selectedItems));

    function setRob(id, next, label) {
      const hit = findTank(setup, id);
      if (!hit) return;
      const prev = hit.tank.robM3 != null ? Number(hit.tank.robM3) : null;
      hit.tank.robM3 = round3(Math.max(0, next));
      notes.push((label || hit.tank.name) + ': ROB ' +
        (prev != null ? fmtVal(prev) : '—') + ' → ' + fmtVal(hit.tank.robM3) + ' m³');
    }

    if (Number(part) === 2) {
      applyPartTwoRob(setup, code, selectedItems, v, setRob);
      return notes;
    }

    if (code === 'C') {
      if (want.has('11.3') && v.tank != null && v.retention != null && v.retention !== '') {
        setRob(v.tank, Number(v.retention), tankName(setup, v.tank));
      }
      if (want.has('11.4') && v.tank && numOrNull(v.manualCollected) != null) {
        const hit = findTank(setup, v.tank);
        const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
        /* If retention also set, prefer retention; else add collected */
        if (want.has('11.3') && v.retention != null && v.retention !== '') {
          setRob(v.tank, Number(v.retention), tankName(setup, v.tank));
        } else {
          setRob(v.tank, base + Number(v.manualCollected), tankName(setup, v.tank));
        }
      }
      if ((want.has('12.1') || want.has('12.3') || want.has('12.4')) && v.tankEmptied) {
        if (v.retained != null && v.retained !== '') setRob(v.tankEmptied, Number(v.retained));
        else if (numOrNull(v.qtyDisposed) != null) {
          const hit = findTank(setup, v.tankEmptied);
          const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
          setRob(v.tankEmptied, Math.max(0, base - Number(v.qtyDisposed)));
        }
      }
      if (want.has('12.2')) {
        if (v.fromTank) {
          if (v.retained != null && v.retained !== '') setRob(v.fromTank, Number(v.retained));
          else if (numOrNull(v.qtyDisposed) != null) {
            const hit = findTank(setup, v.fromTank);
            const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
            setRob(v.fromTank, Math.max(0, base - Number(v.qtyDisposed)));
          }
        }
        if (v.toTank) {
          if (v.toTotal != null && v.toTotal !== '') setRob(v.toTank, Number(v.toTotal));
          else if (numOrNull(v.qtyDisposed) != null) {
            const hit = findTank(setup, v.toTank);
            const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
            setRob(v.toTank, base + Number(v.qtyDisposed));
          }
        }
      }
    }

    if (code === 'D') {
      if (v.fromTank) {
        if (v.fromRetained != null && v.fromRetained !== '') setRob(v.fromTank, Number(v.fromRetained));
        else if (numOrNull(v.qty) != null) {
          const hit = findTank(setup, v.fromTank);
          const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
          setRob(v.fromTank, Math.max(0, base - Number(v.qty)));
        }
      }
      if (want.has('15.3') && v.toTank) {
        if (v.toRetained != null && v.toRetained !== '') setRob(v.toTank, Number(v.toRetained));
        else if (numOrNull(v.qty) != null) {
          const hit = findTank(setup, v.toTank);
          const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
          setRob(v.toTank, base + Number(v.qty));
        }
      }
    }

    /* Bunkering adds to each receiving tank — a single stem, or a split across several. */
    function applyBunker(tankField, qtyField, splitField, totalField, robSplitField) {
      const ids = tankIdList(v[tankField]);
      const add = numOrNull(v[qtyField]);
      if (!ids.length) return;
      const robMap = robSplitField ? parseTankSplit(setup, v[robSplitField], ids) : null;
      const shareMap = parseTankSplit(setup, v[splitField], ids);
      if (robMap && robMap.size) {
        robMap.forEach((rob, id) => {
          if (shareMap && shareMap.size && !shareMap.has(id)) return;
          setRob(id, rob);
        });
        return;
      }
      if (ids.length === 1 && v[totalField] != null && v[totalField] !== '') {
        setRob(ids[0], Number(v[totalField]));
        return;
      }
      if (add == null) return;
      const shares = resolveTankShares(setup, ids, add, v[splitField]);
      if (!shares) return; /* ambiguous split — capacityWarnings tells the user */
      shares.forEach((qty, id) => {
        const hit = findTank(setup, id);
        if (!hit) return;
        const base = hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
        setRob(id, base + qty);
      });
    }
    if (code === 'H' && want.has('26.3')) applyBunker('fuelTank', 'fuelQty', 'fuelSplit', 'fuelTotal', 'fuelRobSplit');
    if (code === 'H' && want.has('26.4')) applyBunker('lubeTank', 'lubeQty', 'lubeSplit', 'lubeTotal');

    /* Code I records operations MARPOL gives no item fields for, so the movement is
       described by the scenario's extra fields instead. Oil that left a tank has to
       leave its R.O.B. too, or the next weekly inventory disagrees with the book. */
    if (code === 'I') {
      const qty = numOrNull(v.extraQty);
      if (v.extraFromTank) {
        if (numOrNull(v.extraFromRetained) != null) setRob(v.extraFromTank, Number(v.extraFromRetained));
        else if (qty != null) {
          const hit = findTank(setup, v.extraFromTank);
          const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
          setRob(v.extraFromTank, Math.max(0, base - qty));
        }
      }
      if (v.extraToTank) {
        if (numOrNull(v.extraToTotal) != null) setRob(v.extraToTank, Number(v.extraToTotal));
        else if (qty != null) {
          const hit = findTank(setup, v.extraToTank);
          const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
          setRob(v.extraToTank, base + qty);
        }
      }
    }

    return notes;
  }

  /** Part II code J ROB effects — source tank drawn down, receiving tank topped up. */
  function applyPartTwoRob(setup, code, selectedItems, values, setRob) {
    if (code !== 'J') return;
    const v = values || {};
    const want = new Set(selectedItemNos(selectedItems));
    const qty = numOrNull(v.qty);
    const ids = tankIdList(v.tanks);
    if (want.has('56') && ids.length === 1) {
      if (v.retained != null && v.retained !== '') setRob(ids[0], Number(v.retained));
      else if (qty != null) {
        const hit = findTank(setup, ids[0]);
        const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
        setRob(ids[0], Math.max(0, base - qty));
      }
    }
    if (want.has('57.3') && v.toTank) {
      if (v.toTotal != null && v.toTotal !== '') setRob(v.toTank, Number(v.toTotal));
      else if (qty != null) {
        const hit = findTank(setup, v.toTank);
        const base = hit && hit.tank.robM3 != null ? Number(hit.tank.robM3) : 0;
        setRob(v.toTank, base + qty);
      }
    }
  }

  function fmtVal(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) {
      return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Number(v.toFixed(3)));
    }
    return String(v).trim();
  }

  function selectedItemNos(selected) {
    return (selected || []).slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }

  /* Detail typed into a scenario's extra fields, as a sentence appended to the Code I
     remark. Held apart from the remark textarea so the wording stays consistent between
     entries and the same values can drive the tank R.O.B. */
  function extraDetailText(v, setup) {
    const bits = [];
    const named = (id) => (tankIdentity(setup, id) || id);
    if (v.extraEquipment) bits.push('Valve / equipment: ' + v.extraEquipment);
    if (v.extraSealNo) bits.push('Seal no. ' + v.extraSealNo);
    if (v.extraPlace) bits.push('Place: ' + v.extraPlace);
    if (numOrNull(v.extraQty) != null) bits.push('Quantity ' + fmtVal(Number(v.extraQty)) + ' m³');
    if (numOrNull(v.extraQtyT) != null) bits.push('Quantity ' + fmtVal(Number(v.extraQtyT)) + ' t');
    if (v.extraFromTank) bits.push('from ' + named(v.extraFromTank));
    if (v.extraToTank) bits.push('to ' + named(v.extraToTank));
    if (numOrNull(v.extraFromRetained) != null) bits.push(fmtVal(Number(v.extraFromRetained)) + ' m³ retained in source tank');
    if (numOrNull(v.extraToTotal) != null) bits.push('total content of receiving tank ' + fmtVal(Number(v.extraToTotal)) + ' m³');
    if (v.extraTimeStart || v.extraTimeStop) {
      bits.push('time ' + (v.extraTimeStart || '—') + ' to ' + (v.extraTimeStop || '—'));
    }
    if (numOrNull(v.testDurationMin) != null) bits.push('duration of test ' + fmtVal(Number(v.testDurationMin)) + ' minutes');
    if (v.extraMissedDate) bits.push('operation actually carried out on ' + formatOrbDate(v.extraMissedDate));
    return bits.length ? (bits.join(', ') + '.') : '';
  }

  function buildItemLines(part, code, selectedItems, values, setup) {
    const op = getOperation(part, code);
    if (!op) return [];
    const val = values || {};
    const want = new Set(selectedItemNos(selectedItems));
    const lines = [];

    function resolve(fieldDef) {
      let v = val[fieldDef.name];
      /* Tank identity in the record carries the IOPP frame position when known. */
      if (fieldDef.type === 'tank') v = tankIdentity(setup, v) || v;
      if (fieldDef.type === 'tankMulti') {
        const arr = Array.isArray(v) ? v : (v ? String(v).split('|') : []);
        v = arr.map(id => tankIdentity(setup, id) || id).filter(Boolean).join(', ');
      }
      return fmtVal(v);
    }

    op.items.forEach(item => {
      if (want.size && !want.has(item.no) && !(code === 'I' && item.no === 'I') && !(code === 'O' && item.no === 'O')) return;
      const parts = [];
      (item.fields || []).forEach(f => {
        const v = resolve(f);
        if (v !== '') parts.push(v);
      });
      if (!parts.length && want.size && !want.has(item.no)) return;
      if (!parts.length && !want.size) return;
      let text = parts.join('; ');
      /* Prefer MEPC-style compact phrases for common items */
      if (code === 'C' && item.no === '11.1') text = resolve(item.fields[0]);
      if (code === 'C' && item.no === '11.2') text = resolve(item.fields[0]) + ' m³';
      if (code === 'C' && item.no === '11.3') text = resolve(item.fields[0]) + ' m³';
      if (code === 'C' && item.no === '11.4' && resolve(item.fields[0])) text = resolve(item.fields[0]) + ' m³';
      if (code === 'C' && item.no === '12.1') {
        text = [resolve(item.fields[0]) && (resolve(item.fields[0]) + ' m³ sludge from ' + resolve(item.fields[1])),
          resolve(item.fields[2]) !== '' ? (resolve(item.fields[2]) + ' m³ retained') : '',
          resolve(item.fields[3]) ? ('to reception facilities at ' + resolve(item.fields[3])) : ''
        ].filter(Boolean).join(', ');
      }
      if (code === 'C' && item.no === '12.2') {
        text = [resolve(item.fields[0]) + ' m³ from ' + resolve(item.fields[1]) + ' to ' + resolve(item.fields[2]),
          resolve(item.fields[3]) !== '' ? ('total content ' + resolve(item.fields[3]) + ' m³') : '',
          resolve(item.fields[4]) !== '' ? (resolve(item.fields[4]) + ' m³ retained') : ''
        ].filter(Boolean).join(', ');
      }
      if (code === 'C' && item.no === '12.3') {
        text = [resolve(item.fields[0]) + ' m³ from ' + resolve(item.fields[1]),
          resolve(item.fields[2]) !== '' ? (resolve(item.fields[2]) + ' m³ retained') : '',
          'incinerated ' + resolve(item.fields[3]) + ' h'
        ].filter(Boolean).join(', ');
      }
      if (code === 'D' && item.no === '13') {
        const bits = [resolve(item.fields[0]) + ' m³ bilge water'];
        if (resolve(item.fields[1])) bits.push('from ' + resolve(item.fields[1]));
        if (resolve(item.fields[2])) bits.push('cap. ' + resolve(item.fields[2]) + ' m³');
        if (resolve(item.fields[3]) !== '') bits.push(resolve(item.fields[3]) + ' m³ retained');
        text = bits.join(', ');
      }
      if (code === 'D' && item.no === '14') {
        text = 'start: ' + resolve(item.fields[0]) + ' UTC, stop: ' + resolve(item.fields[1]) + ' UTC';
      }
      if (code === 'D' && item.no === '15.1') {
        text = 'through 15 ppm equipment overboard, position start ' + resolve(item.fields[0]) +
          ', position stop ' + resolve(item.fields[1]);
      }
      if (code === 'D' && item.no === '15.2') text = 'to reception facilities at ' + resolve(item.fields[0]);
      if (code === 'D' && item.no === '15.3') text = 'to ' + resolve(item.fields[0]) + (resolve(item.fields[1]) !== '' ? (', ' + resolve(item.fields[1]) + ' m³ retained') : '');
      if (code === 'H' && item.no === '26.3') {
        const grade = String(val.fuelType || '').trim();
        const qty = fmtVal(val.fuelQty);
        const iso = String(val.fuelIsoSpec || '').trim();
        const sulphur = val.fuelSulphur != null && String(val.fuelSulphur).trim() !== '' ? fmtVal(val.fuelSulphur) : '';
        const summary = [
          qty !== '' ? (qty + ' MT') : '',
          iso ? ('ISO ' + iso) : '',
          grade,
          sulphur !== '' ? (sulphur + '% S') : ''
        ].filter(Boolean).join(' ') + ' bunkered in tanks:';
        lines.push({ itemNo: '26.3', text: summary });
        resolveFuelBunkerTankRows(setup, val).forEach(row => {
          const added = row.added != null ? fmtVal(row.added) : '—';
          const rob = row.rob != null ? fmtVal(row.rob) : '—';
          lines.push({
            itemNo: '',
            text: added + ' MT added to ' + String(row.label || '').toUpperCase() +
              ' now containing ' + rob + ' MT'
          });
        });
        const spec = [];
        if (val.fuelApi != null && String(val.fuelApi).trim() !== '') spec.push('API ' + fmtVal(val.fuelApi));
        if (val.fuelDensity != null && String(val.fuelDensity).trim() !== '') {
          spec.push('density at 15 °C ' + fmtVal(val.fuelDensity) + ' kg/m³');
        }
        if (sulphur !== '') spec.push('sulphur as per BDN ' + sulphur + '%');
        return;
      }
      if (code === 'H' && item.no === '26.4') {
        const tank = resolve(item.fields[2]) || resolve(item.fields[3]);
        const split = item.fields[4] ? resolve(item.fields[4]) : '';
        const total = item.fields[5] ? resolve(item.fields[5]) : '';
        text = resolve(item.fields[0]) + ' ' + resolve(item.fields[1]) + ' t to ' + tank +
          (split ? (', split ' + split) : '') +
          (total !== '' ? (', total content ' + total + ' t') : '');
      }
      if ((code === 'I' || code === 'O') && (item.no === 'I' || item.no === 'O')) {
        const remark = resolve(item.fields[0]);
        const dur = numOrNull(val.testDurationMin);
        if (dur != null && remark && remark.toLowerCase().indexOf('recirculation') !== -1) {
          text = 'Test of OWS through recirculation line for ' + fmtVal(dur) +
            ' minutes and test of OCM with satisfactory results. ' +
            [remark, extraDetailText(val, setup).replace(/duration of test[^.]+\.\s?/i, '')].filter(Boolean).join(' ');
        } else {
          text = [remark, extraDetailText(val, setup)].filter(Boolean).join(' ');
        }
      }
      if (Number(part) === 3 && code === 'C') {
        const dir = item.no === '1' || item.no === '2' ? 'to low-sulphur fuel' : 'to residual fuel';
        const stage = item.no === '1' || item.no === '3' ? 'commenced' : 'completed';
        text = ['Changeover ' + stage + ' ' + dir + ' (' + resolve(item.fields[2]) + ')',
          'at ' + resolve(item.fields[0]) + ', position ' + resolve(item.fields[1]),
          resolve(item.fields[3]) !== '' ? ('sulphur ' + resolve(item.fields[3]) + '% m/m') : '',
          resolve(item.fields[4]) ? ('tank(s) ' + resolve(item.fields[4])) : '',
          resolve(item.fields[5]) !== '' ? (resolve(item.fields[5]) + ' m³ low-sulphur fuel on board') : ''
        ].filter(Boolean).join(', ');
      }
      if (!text) return;
      /* Code I (Part I) / Code O (Part II) remarks: letter sits in the Code column only;
         Item No. stays blank — same layout as company beORB / MARPOL paper books. */
      const itemNo = ((code === 'I' && item.no === 'I') || (code === 'O' && item.no === 'O')) ? '' : item.no;
      lines.push({ itemNo, text });
    });
    appendPartThreeSupplementLines(lines, part, code, selectedItems, val, setup,
      arguments.length > 5 ? arguments[5] : (val.scenarioId || ''));
    return lines;
  }

  /**
   * When bunkering names several receiving tanks, emit one record line per tank so each
   * can be signed separately (not one compounded H.26.3 line for all tanks).
   */
  function expandLinesForPerTankSignoff(part, code, values, setup, lines) {
    if (Number(part) !== 1 || code !== 'H' || !lines || !lines.length) return lines;
    /* Code H 26.3 uses beORB multi-line layout from buildItemLines — do not re-expand. */
    const v = values || {};
    function expandBunker(itemNo, tankField, qtyField, splitField, typeField) {
      if (itemNo === '26.3') return lines;
      const has = lines.some(l => String(l.itemNo) === itemNo);
      if (!has) return lines;
      const ids = tankIdList(v[tankField]);
      const add = numOrNull(v[qtyField]);
      if (ids.length <= 1 || add == null) return lines;
      const shares = resolveTankShares(setup, ids, add, v[splitField]);
      if (!shares || shares.size <= 1) return lines;
      const grade = v[typeField] != null ? String(v[typeField]).trim() : '';
      const out = [];
      lines.forEach(ln => {
        if (String(ln.itemNo) !== itemNo) { out.push(ln); return; }
        shares.forEach((qty, id) => {
          out.push({
            itemNo,
            text: (grade ? grade + ' ' : '') + fmtVal(qty) + ' t to ' + tankLabel(setup, id)
          });
        });
      });
      return out;
    }
    let expanded = expandBunker('26.3', 'fuelTank', 'fuelQty', 'fuelSplit', 'fuelType');
    expanded = expandBunker('26.4', 'lubeTank', 'lubeQty', 'lubeSplit', 'lubeType');
    return expanded;
  }

  /**
   * Store one ORB entry per completed item line so date, letter code, item number and
   * signatory are not compounded under a single signature block.
   */
  function splitEntryPerItemLine(entry) {
    if (!entry) return [];
    const lines = (entry.lines || []).filter(ln => ln && String(ln.text || '').trim() !== '');
    if (lines.length <= 1) return [entry];
    const groupId = entry.entryGroupId || entry.id;
    return lines.map((ln, idx) => {
      const itemNo = ln.itemNo != null && String(ln.itemNo) !== '' ? String(ln.itemNo) : null;
      let selectedItems = entry.selectedItems || [];
      if (itemNo && entry.code !== 'I' && entry.code !== 'O') selectedItems = [itemNo];
      else if (itemNo === '' && (entry.code === 'I' || entry.code === 'O')) selectedItems = [entry.code];
      return Object.assign({}, entry, {
        id: idx === 0 ? entry.id : (String(entry.id) + '_L' + idx),
        entryGroupId: groupId,
        lineIndex: idx,
        selectedItems,
        lines: [ln],
        robNotes: idx === 0 ? (entry.robNotes || []) : [],
        capacityWarnings: idx === 0 ? entry.capacityWarnings : undefined
      });
    });
  }

  /** Expand tank-scoped lines, then one stored entry per item line. */
  function materializeOrbSaveRecords(entry, setup) {
    const expanded = expandLinesForPerTankSignoff(entry.part, entry.code, entry.values, setup, entry.lines || []);
    const withLines = Object.assign({}, entry, { lines: expanded });
    return splitEntryPerItemLine(withLines);
  }

  function validateEntry(part, code, selectedItems, values, setup) {
    const op = getOperation(part, code);
    const errors = [];
    if (!op) { errors.push('Unknown operation code.'); return errors; }
    if (Number(part) === 2 && setup && setup.shipType !== 'tanker') {
      errors.push('Part II is for oil tankers. Set ship type to Tanker in ORB Vessel Setup.');
    }
    const want = selectedItemNos(selectedItems);
    if (!want.length) errors.push('Select at least one item number for this operation.');
    const byNo = {};
    op.items.forEach(it => { byNo[it.no] = it; });
    want.forEach(no => {
      const it = byNo[no];
      if (!it) { errors.push('Unknown item ' + no); return; }
      (it.fields || []).forEach(f => {
        if (!f.required) return;
        let v = values[f.name];
        if (f.type === 'tankMulti') {
          const arr = Array.isArray(v) ? v : (v ? String(v).split('|') : []);
          if (!arr.length) errors.push(f.label + ' is required (' + no + ').');
        } else if (v == null || String(v).trim() === '') {
          errors.push(f.label + ' is required (' + no + ').');
        }
      });
    });
    errors.push(...validateFuelBunkerQtyErrors(setup, code, selectedItems, values));
    return errors;
  }

  /**
   * Book Date column — company e-ORB style: 24-Aug-2026 (title-case month).
   * Signature lines use the same string uppercased → 24-AUG-2026.
   */
  function formatOrbDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return isoDate;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(d.getDate()).padStart(2, '0');
    return dd + '-' + months[d.getMonth()] + '-' + d.getFullYear();
  }

  /** Signature date on the book: 24-AUG-2026 (all-caps month, matching beORB printouts). */
  function formatOrbSignDate(isoDate) {
    const s = formatOrbDate(isoDate);
    return s ? s.toUpperCase() : '';
  }

  /** Code column — Part II/III entries read like the reference beORB sheets (PART III C). */
  function formatOrbBookCode(entry) {
    const p = Number(entry && entry.part) || 1;
    const c = String(entry && entry.code || '').trim();
    if (p === 3) return 'PART III ' + c;
    if (p === 2) return 'PART II ' + c;
    return c;
  }

  /** Footer timestamp — beORB “Report Rendered: 29-Sep-2026 10:57:29”. */
  function formatOrbRenderStamp(when) {
    const d = when instanceof Date ? when : new Date(when || Date.now());
    if (isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return dd + '-' + months[d.getMonth()] + '-' + d.getFullYear() + ' ' +
      hh + ':' + mm + ':' + ss;
  }

  function orbAppLabel() {
    try {
      if (global.location && /[?&]chengaio=1(?:&|$)/.test(String(global.location.search || ''))) {
        return 'ChEng AIO';
      }
    } catch (_e) { /* non-browser */ }
    return APP_NAME;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * @param {object} [opts] - { stampDataUrl } prints the ship's stamp in the
   *   "Ship's stamp" cell rather than leaving it blank for a wet stamp.
   */
  /* How full a tank is, and whether that is a problem yet. A sludge or bilge holding
     tank filling up is the thing that forces a disposal: once it is full there is
     nowhere to collect into, so the engineer wants to see it coming, not discover it.
     Thresholds are deliberately conservative — 75% is "plan a landing", 90% is "act". */
  const TANK_HIGH_PCT = 75;
  const TANK_FULL_PCT = 90;
  const TANK_GROUP_LABELS = {
    sludge: 'Oil residue / sludge (IOPP 3.1)',
    bilge: 'Oily bilge water holding (IOPP 3.3)',
    bilgeWells: 'Bilge wells',
    fuel: 'Fuel oil',
    lube: 'Lubricating oil',
    cargo: 'Cargo', slop: 'Slop', cbt: 'Clean ballast', dirtyBallast: 'Dirty ballast'
  };

  /**
   * Present R.O.B. of every configured tank with how full it is.
   * `pct` is null when no capacity is on record — the quantity is still reported, but
   * a percentage of an unknown capacity would be an invention.
   */
  function tankRobStatus(setup, groups) {
    const want = groups && groups.length ? groups : ['sludge', 'bilge', 'bilgeWells'];
    const out = [];
    want.forEach(group => {
      tanksForGroup(setup, group).forEach(t => {
        const cap = numOrNull(t.capacityM3);
        const rob = numOrNull(t.robM3) || 0;
        const pct = (cap != null && cap > 0) ? (rob / cap) * 100 : null;
        out.push({
          id: t.id, name: t.name, frameNo: t.frameNo || '',
          group, groupLabel: TANK_GROUP_LABELS[group] || group,
          capacityM3: cap, robM3: round3(rob),
          pct: pct == null ? null : Math.round(pct * 10) / 10,
          status: pct == null ? 'unknown' : (pct >= TANK_FULL_PCT ? 'full' : (pct >= TANK_HIGH_PCT ? 'high' : 'ok')),
          spareM3: cap != null ? round3(Math.max(0, cap - rob)) : null
        });
      });
    });
    return out;
  }

  /** Entries in book order: by date, then by the order they were written that day. */
  function sortEntriesForBook(entries) {
    return (entries || []).slice().sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }

  function wizardBunkerSelectHtml(name, options, preset, attrs) {
    const val = preset != null ? String(preset) : '';
    const extra = attrs || '';
    const opts = (options || []).map(o => {
      const sel = val === o ? ' selected' : '';
      return '<option value="' + escapeHtml(o) + '"' + sel + '>' + escapeHtml(o) + '</option>';
    }).join('');
    return '<select class="orb-form-input orb-bunker-select" data-orb-field="' + escapeHtml(name) + '"' + extra + '>' +
      '<option value="">— select —</option>' + opts + '</select>';
  }

  function wizardInputHtml(f, preset) {
    const val = preset != null ? String(preset) : '';
    if (f.type === 'select') {
      return '<select class="orb-form-input" data-orb-field="' + escapeHtml(f.name) + '">' +
        (f.options || []).map(o => '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>').join('') +
        '</select>';
    }
    if (f.readOnly) {
      return '<input type="text" class="orb-form-input orb-form-readonly" readonly tabindex="-1" data-orb-field="' +
        escapeHtml(f.name) + '" value="' + escapeHtml(val) + '">';
    }
    if (f.type === 'textarea') {
      return '<textarea class="orb-form-input" rows="2" data-orb-field="' + escapeHtml(f.name) + '">' +
        escapeHtml(val) + '</textarea>';
    }
    const t = f.type === 'number' ? 'number' : (f.type === 'time' ? 'time' : (f.type === 'date' ? 'date' : 'text'));
    return '<input type="' + t + '" class="orb-form-input" step="any" data-orb-field="' + escapeHtml(f.name) + '" value="' +
      escapeHtml(val) + '">';
  }

  function wizardTankSelectHtml(f, setup, opts) {
    const group = (opts.fieldTankGroups && opts.fieldTankGroups[f.name]) || f.tankGroup || 'any';
    const tanks = tanksForGroup(setup, group);
    const empty = tanks.length ? '' : '<option value="" disabled>No tanks in Vessel Setup</option>';
    const optsHtml = tanks.map(t =>
      '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(tankLabel(setup, t.id)) + '</option>').join('');
    return '<select class="orb-form-input" data-orb-field="' + escapeHtml(f.name) + '"><option value="">— tank —</option>' +
      empty + optsHtml + '</select>';
  }

  function wizardControlForField(f, setup, opts, presets, bunkerFam) {
    const p = presets || {};
    if (f.type === 'tank' || f.type === 'tankMulti') return wizardTankSelectHtml(f, setup, opts);
    if (f.bunkerSelect === 'type') return wizardBunkerSelectHtml(f.name, bunkerFam.types, p[f.name]);
    if (f.bunkerSelect === 'iso') return wizardBunkerSelectHtml(f.name, bunkerFam.iso, p[f.name]);
    return wizardInputHtml(f, p[f.name]);
  }

  function wizardLabeledField(f, setup, opts, presets, bunkerFam) {
    return '<div class="orb-wizard-field">' +
      '<label>' + escapeHtml(f.label) + '</label>' +
      wizardControlForField(f, setup, opts, presets, bunkerFam) +
      (f.hint ? '<span class="hint">' + escapeHtml(f.hint) + '</span>' : '') +
      '</div>';
  }

  /** Plain labeled inputs — print wording is built on save / in Preview only. */
  function wizardSimpleItemFieldsHtml(part, code, item, setup, opts, presets, seen, bunkerFam) {
    const skip = { fuelTank: 1, fuelSplit: 1, fuelRobSplit: 1, fuelTotal: 1 };
    if (code === 'H' && item.no === '26.3') {
      (item.fields || []).forEach(f => {
        if (skip[f.name] || seen.has(f.name)) return;
        seen.add(f.name);
      });
      return '';
    }
    let html = '<div class="orb-wizard-fields">';
    (item.fields || []).forEach(f => {
      if (seen.has(f.name)) return;
      seen.add(f.name);
      html += wizardLabeledField(f, setup, opts, presets, bunkerFam);
    });
    html += '</div>';
    return html;
  }

  function wizardFuelBunkerTankInputHtml(setup, presets, opts) {
    const cat = (opts && opts.bunkerFuelCategory) || bunkerFuelCategoryForScenario(opts && opts.scenarioId);
    const tanks = tanksForBunkerCategory(setup, cat);
    if (!tanks.length) {
      const hint = cat === 'distillate'
        ? 'No distillate-service fuel tanks in ORB setup — mark tanks as Distillate under IOPP / ORB Tanks.'
        : 'No residual / heavy-fuel tanks in ORB setup — mark tanks as Residual under IOPP / ORB Tanks.';
      return '<p class="hint">' + escapeHtml(hint) + '</p>';
    }
    const ids = tanks.map(t => t.id);
    const split = parseTankSplit(setup, (presets && presets.fuelSplit) || '', ids);
    const robSplit = parseTankSplit(setup, (presets && presets.fuelRobSplit) || '', ids);
    const rows = tanks.map(t => {
      const added = split && split.has(t.id) ? split.get(t.id) : '';
      const rob = robSplit && robSplit.has(t.id) ? robSplit.get(t.id) : '';
      const label = tankIdentity(setup, t.id);
      return '<tr class="orb-bunker-tank-row" data-orb-bunker-tank="' + escapeHtml(t.id) + '">' +
        '<td class="orb-bunker-tank-name">' + escapeHtml(label) + '</td>' +
        '<td><input type="number" step="any" class="orb-form-input orb-bunker-added" data-tank-id="' +
        escapeHtml(t.id) + '" value="' + escapeHtml(String(added === '' ? '' : added)) + '" aria-label="MT added"></td>' +
        '<td><input type="number" step="any" class="orb-form-input orb-bunker-rob" data-tank-id="' +
        escapeHtml(t.id) + '" value="' + escapeHtml(String(rob === '' ? '' : rob)) + '" aria-label="ROB after bunkering MT"></td></tr>';
    }).join('');
    return '<table class="orb-bunker-tanks-table"><thead><tr><th>Tank</th><th>MT added</th><th>ROB after (MT)</th></tr></thead><tbody>' +
      rows + '</tbody></table>';
  }

  function wizardBunkerEntryPanel(part, code, op, setup, opts, presets, selSet, seen) {
    const bunkerCat = opts.bunkerFuelCategory || bunkerFuelCategoryForScenario(opts.scenarioId);
    const bunkerFam = BUNKER_FUEL_FAMILY[bunkerCat] || BUNKER_FUEL_FAMILY.residual;
    const byNo = {};
    (op.items || []).forEach(it => { byNo[it.no] = it; });
    let html = '<section class="orb-wizard-section"><h3 class="orb-wizard-section-title">Bunkering data</h3>';
    html += '<p class="hint">Enter values here; the ORB printout wording is composed when you save (see Preview below).</p>';
    if (selSet.has('26.1') && byNo['26.1']) {
      (byNo['26.1'].fields || []).forEach(f => {
        if (seen.has(f.name)) return;
        seen.add(f.name);
        html += wizardLabeledField(f, setup, opts, presets, bunkerFam);
      });
    }
    if (selSet.has('26.2') && byNo['26.2']) {
      html += '<div class="orb-wizard-fields cols2">';
      (byNo['26.2'].fields || []).forEach(f => {
        if (seen.has(f.name)) return;
        seen.add(f.name);
        html += wizardLabeledField(f, setup, opts, presets, bunkerFam);
      });
      html += '</div>';
    }
    if (selSet.has('26.3') && byNo['26.3']) {
      html += '<h4 class="orb-wizard-subtitle">Fuel received (' + (bunkerCat === 'distillate' ? 'distillate' : 'residual') + ')</h4>';
      html += '<div class="orb-wizard-fields cols2">';
      (byNo['26.3'].fields || []).forEach(f => {
        if (f.name === 'fuelTank' || f.name === 'fuelSplit' || f.name === 'fuelRobSplit' || f.name === 'fuelTotal' ||
            f.name === 'fuelDensity' || f.name === 'fuelApi' || f.name === 'fuelSg' || seen.has(f.name)) return;
        seen.add(f.name);
        html += wizardLabeledField(f, setup, opts, presets, bunkerFam);
      });
      html += '</div>';
      html += '<h4 class="orb-wizard-subtitle">Per tank</h4>';
      html += '<p class="hint">Only tanks with both MT added and ROB after are included. Total quantity added (MT) must equal the sum of per-tank MT added.</p>';
      html += wizardFuelBunkerTankInputHtml(setup, presets, opts);
      html += '<h4 class="orb-wizard-subtitle">BDN specification</h4>';
      html += '<div class="orb-bdn-grid">';
      ['fuelDensity', 'fuelSg', 'fuelApi'].forEach(name => {
        let f = (byNo['26.3'].fields || []).find(x => x.name === name);
        if (!f || seen.has(name)) return;
        seen.add(name);
        if (name === 'fuelApi') f = Object.assign({}, f, { readOnly: true, label: 'API (auto from density or SG)' });
        html += wizardLabeledField(f, setup, opts, presets, bunkerFam);
      });
      html += '</div>';
      if (partThreeSupplementsEnabled(setup)) {
        html += '<p class="hint">Part III C item 3 (BDN type, API, density, sulphur) is appended automatically on save.</p>';
      }
    }
    html += '</section>';
    return html;
  }

  /** @deprecated Inline print-style narrative — use wizardSimpleItemFieldsHtml / wizardBunkerEntryPanel. */
  function wizardItemNarrativeHtml(part, code, item, setup, opts, presets) {
    const p = presets || (opts && opts.presets) || {};
    const bunkerCat = (opts && opts.bunkerFuelCategory) || bunkerFuelCategoryForScenario(opts && opts.scenarioId);
    const bunkerFam = BUNKER_FUEL_FAMILY[bunkerCat] || BUNKER_FUEL_FAMILY.residual;
    const fld = (name) => (item.fields || []).find(x => x.name === name);
    const ctrl = (name) => {
      const f = fld(name);
      if (!f) return '';
      if (f.type === 'tank' || f.type === 'tankMulti') return wizardTankSelectHtml(f, setup, opts);
      if (f.bunkerSelect === 'type') return wizardBunkerSelectHtml(f.name, bunkerFam.types, p[f.name]);
      if (f.bunkerSelect === 'iso') return wizardBunkerSelectHtml(f.name, bunkerFam.iso, p[f.name]);
      return wizardInputHtml(f, p[f.name]);
    };
    if (code === 'D' && item.no === '13') {
      return ctrl('qty') + ' m³ bilge water from ' + ctrl('fromTank') +
        ' capacity ' + ctrl('fromCap') + ' m³, ' + ctrl('fromRetained') + ' m³ retained.';
    }
    if (code === 'D' && item.no === '14') {
      return 'Start: ' + ctrl('timeStart') + ' UTC &nbsp; Stop: ' + ctrl('timeStop') + ' UTC';
    }
    if (code === 'D' && item.no === '15.1') {
      return 'Through 15 ppm equipment overboard.<br>Position start: ' + ctrl('posStart') +
        '<br>Position stop: ' + ctrl('posEnd');
    }
    if (code === 'C' && item.no === '11.1') return ctrl('tank') || ctrl((item.fields[0] || {}).name);
    if (code === 'C' && item.no === '11.2') return ctrl((item.fields[0] || {}).name) + ' m³ capacity.';
    if (code === 'C' && item.no === '11.3') return ctrl((item.fields[0] || {}).name) + ' m³ retained.';
    if (code === 'C' && item.no === '11.4') {
      return ctrl('manualCollected') + ' m³ collected by manual operation.';
    }
    if (code === 'C' && item.no === '12.3') {
      return ctrl('qtyDisposed') + ' m³ from ' + ctrl('tankEmptied') + ', ' +
        ctrl('retained') + ' m³ retained, incinerated ' + ctrl('incinHours') + ' h.';
    }
    if (code === 'H' && item.no === '26.3') {
      return '<div class="orb-bunker-line">' +
        ctrl('fuelQty') + ' <span class="orb-bunker-unit">MT</span> ISO ' + ctrl('fuelIsoSpec') + ' ' +
        ctrl('fuelType') + ' ' + ctrl('fuelSulphur') + ' <span class="orb-bunker-unit">% S</span> bunkered in ' +
        (bunkerCat === 'distillate' ? 'distillate' : 'residual') + ' tanks:</div>';
    }
    if ((code === 'I' || code === 'O') && (item.no === 'I' || item.no === 'O')) {
      return wizardInputHtml({ name: 'remarks', type: 'textarea' }, p.remarks || '');
    }
    return (item.fields || []).map(f => {
      if (f.type === 'tank' || f.type === 'tankMulti') return f.label + ': ' + wizardTankSelectHtml(f, setup, opts);
      return f.label + ': ' + wizardInputHtml(f, p[f.name]);
    }).join('<br>');
  }

  /**
   * Entry wizard — labeled fields only. ORB book layout is shown in Preview / after save.
   */
  function buildWizardFormSheet(part, code, op, setup, opts, selectedItems) {
    if (!op) return { html: '', extraHtml: '' };
    opts = Object.assign({}, opts, {
      bunkerFuelCategory: opts.bunkerFuelCategory || bunkerFuelCategoryForScenario(opts.scenarioId)
    });
    const sel = new Set(selectedItems || []);
    const presets = opts.presets || {};
    const seen = new Set();
    const bunkerFam = BUNKER_FUEL_FAMILY[opts.bunkerFuelCategory] || BUNKER_FUEL_FAMILY.residual;
    let panel = '';
    const selSet = sel;
    const isBunkerFuel = Number(part) === 1 && code === 'H' &&
      (selSet.has('26.1') || selSet.has('26.2') || selSet.has('26.3'));
    if (isBunkerFuel) {
      panel += wizardBunkerEntryPanel(part, code, op, setup, opts, presets, selSet, seen);
    }
    (op.items || []).forEach(it => {
      if (sel.size && !sel.has(it.no)) return;
      if (isBunkerFuel && (it.no === '26.1' || it.no === '26.2' || it.no === '26.3')) return;
      panel += '<section class="orb-wizard-section" data-orb-item="' + escapeHtml(it.no) + '">' +
        '<h3 class="orb-wizard-section-title">Item ' + escapeHtml(String(it.no)) + '</h3>' +
        '<p class="hint orb-wizard-item-label">' + escapeHtml(it.label || '') + '</p>' +
        wizardSimpleItemFieldsHtml(part, code, it, setup, opts, presets, seen, bunkerFam) +
        '</section>';
    });
    if (!panel) {
      panel = '<p class="hint">Tick item numbers above to show entry fields.</p>';
    }
    let extraHtml = '';
    if (opts.scenarioId === 'seal-broken') {
      extraHtml += '<section class="orb-wizard-section"><h3 class="orb-wizard-section-title">Seal broken</h3>' +
        '<div class="orb-wizard-fields">' +
        wizardLabeledField({ name: 'extraEquipment', label: 'Valve / equipment', type: 'text' }, setup, opts, presets, bunkerFam) +
        wizardLabeledField({ name: 'extraSealNo', label: 'Seal no.', type: 'text' }, setup, opts, presets, bunkerFam) +
        '</div></section>';
      seen.add('extraEquipment');
      seen.add('extraSealNo');
    }
    if (Number(part) === 1 && code === 'H' && selSet.has('26.4') && partThreeSupplementsEnabled(setup)) {
      extraHtml += '<p class="hint">Part III C item 3 lube supplement is appended automatically on save.</p>';
    }
    (opts.extraFields || []).forEach(f => {
      if (seen.has(f.name)) return;
      seen.add(f.name);
      extraHtml += '<section class="orb-wizard-section"><div class="orb-wizard-fields">' +
        wizardLabeledField(f, setup, opts, presets, bunkerFam) + '</div></section>';
    });
    const html = '<div class="orb-wizard-panel">' + panel + '</div>';
    return { html, extraHtml, seenFields: seen };
  }

  function isLastEntryInBookSet(sorted, entryIdx) {
    const e = sorted[entryIdx];
    const next = sorted[entryIdx + 1];
    if (e.entryGroupId) return !next || next.entryGroupId !== e.entryGroupId;
    return true;
  }

  /**
   * The body of the record book: one <tr> per item line, then a signature row at the
   * end of each code+item set (legacy multi-line row, or shards sharing entryGroupId).
   *
   * Layout matches company beORB / MARPOL Appendix III paper books:
   *   Date → 24-Aug-2026 (first line of the set only)
   *   Code (letter) → D / C / I (first line of the set only)
   *   Item No. (number) → 13, 11.1, … ; blank for Code I remarks
   *   Signature → separate row: NAME - RANK, 24-AUG-2026 [SIGNATURE]
   */
  function bookRowsHtml(entries, setup) {
    let body = '';
    let lastHeaderKey = null;
    const sorted = sortEntriesForBook(entries);
    sorted.forEach((e, entryIdx) => {
      const lines = e.lines || [];
      const voided = !!e.voided;
      const headerKey = e.entryGroupId || e.id;
      lines.forEach((ln, idx) => {
        const text = escapeHtml(String(ln.text || '').toUpperCase());
        let itemNo = ln.itemNo == null ? '' : String(ln.itemNo);
        /* Older saves put "I"/"O" in Item No.; suppress so Code column alone carries the letter. */
        if ((e.code === 'I' && itemNo.toUpperCase() === 'I') ||
            (e.code === 'O' && itemNo.toUpperCase() === 'O')) {
          itemNo = '';
        }
        let showDate = lines.length > 1 ? idx === 0 : headerKey !== lastHeaderKey;
        let showCode = showDate;
        if (ln.showDate === false) showDate = false;
        if (ln.recordPart != null || ln.recordCode != null) {
          if (ln.showDate === false) showDate = false;
          showCode = ln.showCode === true || (ln.showCode !== false && showDate);
        }
        const codeEntry = {
          part: ln.recordPart != null ? Number(ln.recordPart) : (Number(e.part) || 1),
          code: ln.recordCode != null ? String(ln.recordCode) : e.code
        };
        body += '<tr' + (voided ? ' class="orb-voided"' : '') + '>' +
          '<td>' + (showDate ? escapeHtml(formatOrbDate(e.date)) : '') + '</td>' +
          '<td class="orb-code">' + (showCode ? escapeHtml(formatOrbBookCode(codeEntry)) : '') + '</td>' +
          '<td>' + escapeHtml(itemNo) + '</td>' +
          '<td class="orb-record">' + (voided ? ('<s>' + text + '</s>') : text) + '</td></tr>';
      });
      lastHeaderKey = headerKey;
      if (isLastEntryInBookSet(sorted, entryIdx)) {
        const voidSuffix = voided ? (' — VOID' + (e.voidReason ? (': ' + escapeHtml(e.voidReason)) : '')) : '';
        const sigLines = orbSignatoryLines(e, setup);
        if (!sigLines.length && voidSuffix) sigLines.push('');
        sigLines.forEach((sig, sigIdx) => {
          if (!sig && !voidSuffix) return;
          const suffix = sigIdx === sigLines.length - 1 ? voidSuffix : '';
          body += '<tr class="orb-sign-row' + (voided ? ' orb-voided' : '') + '">' +
            '<td></td><td></td><td></td>' +
            '<td class="orb-record orb-sign-cell"><div class="orb-sign">' +
            escapeHtml(sig) + suffix + '</div></td></tr>';
        });
      }
    });
    return body;
  }

  /** Officer line under the last item — beORB style: NAME - RANK, DD-MON-YYYY [SIGNATURE] */
  function formatOrbSignature(e) {
    const name = String(e && e.officerName || '').trim().toUpperCase();
    const rank = String(e && e.officerRank || '').trim().toUpperCase();
    const when = e && e.officerSignedAt
      ? formatOrbSignDate(String(e.officerSignedAt).slice(0, 10))
      : '';
    const bits = [];
    if (name) bits.push(name + (rank ? (' - ' + rank) : ''));
    else if (rank) bits.push(rank);
    if (when) bits.push(when);
    if (!bits.length) return '';
    return bits.join(', ') + ' [SIGNATURE]';
  }

  /* One stylesheet for the book, wherever it is drawn. The app injects this into the
     page so the on-screen view uses it, and the printed document embeds it, so the two
     cannot be restyled apart. Selectors are all under .orb-book and set colour, wrap
     and position explicitly, because on screen they land inside a dark-theme app whose
     page-wide table rules would otherwise paint this light page's own cells. */
  const BOOK_CSS = [
    '.orb-book{background:#fff; color:#111; border:1px solid #c5c5c5; border-radius:3px;',
    '  padding:14px 16px; min-width:640px; font-family:Arial,Helvetica,sans-serif;}',
    '.orb-book-head-split{display:flex; justify-content:flex-start; align-items:flex-end; flex-wrap:nowrap; gap:8px 12px;',
    '  border-bottom:1px solid #333; padding-bottom:8px; margin-bottom:8px;}',
    '.orb-book-head-field{display:flex; align-items:baseline; gap:4px; flex:1 1 0; min-width:0; font-size:10px; line-height:1.35;}',
    '.orb-book-head-field .lbl{white-space:nowrap; color:#222; font-weight:600;}',
    '.orb-book-head-field .val{flex:1; border-bottom:1px solid #333; min-height:14px; padding:0 2px 1px; min-width:2.5em;}',
    '.orb-book-brand{text-align:right; flex:0 0 auto; margin-left:auto; white-space:nowrap;}',
    '.orb-book-brand .suite{font-size:9px; color:#555; letter-spacing:.02em;}',
    '.orb-book-brand .product{font-size:17px; font-weight:700; letter-spacing:.02em; color:#111; line-height:1.05;}',
    '.orb-book-partline{font-size:10px; color:#444; margin:0 0 8px; text-transform:uppercase; letter-spacing:.04em;}',
    '.orb-book-partline .range{color:#666; font-weight:400; text-transform:none; letter-spacing:0;}',
    '.orb-book table{width:100%; border-collapse:collapse; font-size:10.5px; color:#111; table-layout:fixed;}',
    '.orb-book thead th{background:#d9d9d9; color:#111; font-size:9px; position:static; font-family:inherit;',
    '  font-weight:700; text-transform:none; letter-spacing:0; text-align:left; border:1px solid #999; padding:5px 6px;}',
    '.orb-book th, .orb-book td{border:1px solid #999; padding:4px 6px; vertical-align:top;',
    '  color:#111; white-space:normal;}',
    '.orb-book tbody tr:nth-child(even){background:#ececec;}',
    '.orb-book tbody tr:hover{background:rgba(0,0,0,.04);}',
    '.orb-book th:nth-child(1), .orb-book td:nth-child(1){width:9%; white-space:nowrap; padding-left:4px; padding-right:4px;}',
    '.orb-book th:nth-child(2), .orb-book td.orb-code{width:10%; text-align:center; padding-left:3px; padding-right:3px;}',
    '.orb-book td.orb-code{font-weight:700; font-size:9.5px; line-height:1.25;}',
    '.orb-book th:nth-child(3), .orb-book td:nth-child(3){width:8%; text-align:center; padding-left:3px; padding-right:3px;}',
    '.orb-book th:nth-child(2), .orb-book th:nth-child(3){text-align:center; line-height:1.2; font-size:8px;}',
    '.orb-book th:nth-child(4), .orb-book td.orb-record{width:auto; font-size:10px; line-height:1.35; text-transform:uppercase;}',
    '.orb-book tr.orb-voided td{color:#666;}',
    '.orb-book .orb-sign{font-size:9.5px; font-style:italic; color:#333; text-transform:none;}',
    '.orb-book tr.orb-sign-row td{border-top:none;}',
    '.orb-book tr.orb-sign-row + tr td{border-top:1px solid #999;}',
    '.orb-book-empty{padding:22px; text-align:center; color:#666; font-size:11px;}',
    '.orb-book-master{margin-top:16px; display:flex; justify-content:space-between; gap:24px;}',
    '.orb-book-master > div{flex:1; border-top:1px solid #333; padding-top:4px; min-height:34px; font-size:10px; color:#333;}',
    '.orb-book-master img{max-height:24mm; max-width:42mm; object-fit:contain; display:block; margin-top:2px;}',
    '.orb-book-foot{margin-top:14px; padding-top:6px; border-top:1px solid #999; font-size:9px; color:#444; line-height:1.45;}',
    '.orb-book-foot-bar{display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:6px;}',
    '.orb-book-foot-legal{font-size:8px; color:#666; line-height:1.4;}',
    '.orb-book-byline{margin-top:5px; font-size:8px; color:#888; letter-spacing:.04em;}'
  ].join('\n');

  /** The part this set of entries belongs to, named as the book names it. */
  function bookPartTitles(entries) {
    const parts = [...new Set((entries || []).map(e => Number(e.part) || 1))];
    const p = parts.length === 1 ? parts[0] : 1;
    if (parts.length > 1) return { title: 'Oil Record Book', subtitle: 'Machinery Space and Cargo Operations' };
    if (p === 3) return { title: 'Fuel Oil Changeover Record — Part III', subtitle: 'Fuel Changeover (MARPOL Annex VI Reg. 14.6)' };
    if (p === 2) return { title: 'Oil Record Book — Part II', subtitle: 'Cargo / Ballast Operations (Oil Tankers)' };
    return { title: 'Oil Record Book — Part I', subtitle: 'Machinery Space Operations (All Ships)' };
  }

  /**
   * The book itself: head, ship's particulars, the ruled table, and optionally the
   * Master's signature block and the flag note that belong on a printed sheet.
   * Both the on-screen view and the printout are built from this, so what the engineer
   * checks on screen is the document that comes out of the printer.
   */
  function bookDocumentHtml(setup, entries, opts) {
    opts = opts || {};
    const flag = getFlag(setup.flag);
    const rows = sortEntriesForBook(entries);
    const t = bookPartTitles(rows);
    const body = bookRowsHtml(rows, setup);
    const appLabel = orbAppLabel();
    const renderStamp = formatOrbRenderStamp(opts.renderedAt || new Date());
    const rangeBit = opts.rangeLabel ? (' <span class="range">· ' + escapeHtml(opts.rangeLabel) + '</span>') : '';
    const table = body
      ? '<table><thead><tr><th>Date</th><th>Code<br>(letter)</th><th>Item No.<br>(number)</th>' +
        '<th>Record of operations / signature of officer in charge</th></tr></thead>' +
        '<tbody>' + body + '</tbody></table>'
      : '<div class="orb-book-empty">' + escapeHtml(opts.emptyText || 'No entries in the selected period.') + '</div>';
    const master = opts.master
      ? '<div class="orb-book-master"><div>Master\'s signature / date</div><div>Ship\'s stamp' +
        (opts.stampDataUrl ? '<img src="' + opts.stampDataUrl + '" alt="">' : '') + '</div></div>'
      : '';
    const footLegal = opts.foot != null ? opts.foot
      : ('MARPOL Annex I Appendix III. Flag: ' + escapeHtml(flag.admin) +
         '. Language: ' + escapeHtml(flag.language) + '. ' +
         'Generated by ' + escapeHtml(appLabel) + ' e-ORB. Official electronic ORB use as a hard-copy replacement ' +
         'requires flag-approved software under IMO MEPC.312(74) and a ship-specific Declaration. ' +
         escapeHtml(flag.erbNote));
    const officialNo = setup.officialNumber || setup.callSign || '';
    return '<div class="orb-book">' +
      '<div class="orb-book-head-split">' +
        '<div class="orb-book-head-field"><span class="lbl">Name of Ship:</span><span class="val">' +
          escapeHtml(setup.shipName || '') + '</span></div>' +
        '<div class="orb-book-head-field"><span class="lbl">Official Number:</span><span class="val">' +
          escapeHtml(officialNo) + '</span></div>' +
        '<div class="orb-book-head-field"><span class="lbl">IMO Number:</span><span class="val">' +
          escapeHtml(setup.imo || '') + '</span></div>' +
        '<div class="orb-book-brand">' +
          '<div class="suite">' + escapeHtml(appLabel) + '</div>' +
          '<div class="product">e-ORB</div>' +
        '</div>' +
      '</div>' +
      '<p class="orb-book-partline">' + escapeHtml(t.title) + rangeBit + '</p>' +
      table + master +
      '<div class="orb-book-foot">' +
        '<div class="orb-book-foot-bar">' +
          '<span>e-ORB Report Rendered: ' + escapeHtml(renderStamp) + '</span>' +
          '<span class="orb-book-page">Page <span class="orb-page-num"></span></span>' +
        '</div>' +
        '<div class="orb-book-foot-legal">' + footLegal + '</div>' +
        '<div class="orb-book-byline">' + escapeHtml(AUTHOR_LINE) + '</div></div>' +
    '</div>';
  }

  function buildPrintHtml(setup, entries, rangeLabel, opts) {
    /* The printed sheet is the on-screen book on a page: same builder, same stylesheet,
       plus the Master's signature block and the flag note a signed record carries. */
    const inner = bookDocumentHtml(setup, entries, {
      rangeLabel: rangeLabel || '',
      master: true,
      stampDataUrl: opts && opts.stampDataUrl,
      emptyText: 'No entries in selected period.'
    });
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Oil Record Book</title>' +
      '<style>' +
      '@page{size:A4 portrait;margin:14mm 12mm 16mm;}' +
      'body{margin:0; background:#fff; font-family:Arial,Helvetica,sans-serif;}' +
      BOOK_CSS +
      '.orb-book{border:0; border-radius:0; padding:0; min-width:0;' +
      '  -webkit-print-color-adjust:exact; print-color-adjust:exact;}' +
      '.orb-book thead th, .orb-book tbody tr:nth-child(even){-webkit-print-color-adjust:exact; print-color-adjust:exact;}' +
      '.orb-book tbody tr:hover{background:transparent;}' +
      '.orb-page-num::after{content:counter(page) " of " counter(pages);}' +
      '</style></head><body>' + inner + '</body></html>';
  }

  global.EORB = {
    FLAGS,
    PART_I,
    PART_II,
    PART_III,
    EXTRA_FIELDS,
    SCENARIOS,
    BUNKER_FUEL_FAMILY,
    bunkerFuelCategoryForScenario,
    inferTankFuelService,
    tanksForBunkerCategory,
    extraDetailText,
    getScenarios,
    getScenario,
    getScenarioGroups,
    defaultOrbSetup,
    getFlag,
    SIGNATORY_MODES,
    DEFAULT_SIGNATORY,
    flagSignatoryPolicy,
    requiresDualSignatory,
    isChiefEngineerRank,
    chiefEngRankFromSetup,
    validateEntrySignatory,
    orbSignatoryLines,
    getPartOps,
    getOperation,
    tanksForGroup,
    tankName,
    tankLabel,
    tankIdentity,
    tankIdList,
    parseTankSplit,
    resolveTankShares,
    resolveFuelBunkerTankRows,
    buildItemLines,
    expandLinesForPerTankSignoff,
    splitEntryPerItemLine,
    materializeOrbSaveRecords,
    bookRowsHtml,
    bookDocumentHtml,
    bookPartTitles,
    BOOK_CSS,
    sortEntriesForBook,
    tankRobStatus,
    TANK_HIGH_PCT,
    TANK_FULL_PCT,
    buildWeeklyInventory,
    autofillOperationValues,
    capacityWarnings,
    operationFieldHelpers,
    apiFromSpecificGravity,
    apiFromDensityKgM3,
    applyOperationRob,
    findTank,
    validateEntry,
    formatOrbDate,
    formatOrbSignDate,
    formatOrbBookCode,
    formatOrbRenderStamp,
    formatOrbSignature,
    buildPrintHtml,
    selectedItemNos,
    WEEKLY_INTERVAL_DAYS,
    addDaysIso,
    daysBetweenIso,
    isWeeklySludgeInventory,
    isWeeklyOwsTest,
    isOwsOcmTestEntry,
    isOverboardSealBreakEntry,
    owsDischargePrereqErrors,
    owsDischargePrereqChecklist,
    buildWizardFormSheet,
    lastMatchingEntryDate,
    weeklyDueStatus,
    weeklyInventoryDateError
  };
})(typeof window !== 'undefined' ? window : globalThis);
