/* Shell for the static redesign mockups. No build step. */
(function () {
  'use strict';

  var HREF = {
    home: 'dashboard.html',
    summary: 'dashboard.html#passage',
    entry: 'noon.html',
    rob: 'rob.html',
    dashboard: 'dashboard.html#tanks',
    'fuel-report': 'soundings.html',
    calibration: 'calibration.html',
    vessel: 'vessel.html',
    setup: 'vessel.html'
  };

  var AIO = [
    ['home', 'Home'],
    ['summary', 'Voyage'],
    ['dashboard', 'Tanks'],
    ['bunkerplan', 'Consumption Plan', 'voyage'],
    ['bunkeringplan', 'Bunkering Plan', 'tank'],
    ['eca', 'ECA', 'voyage'],
    ['eorb', 'e-ORB', 'voyage'],
    ['performance', 'Performance', 'voyage'],
    ['spares', 'Spares', 'voyage'],
    ['notes', 'Notes'],
    ['vessel', 'Vessel Setup'],
    ['backup', 'Backup & Sync'],
    ['license', 'License'],
    ['about', 'About']
  ];

  var VOYAGE = [
    ['Watch', [
      ['summary', 'Summary'],
      ['entry', 'Log Entry'],
      ['rob', 'ROB'],
      ['spares', 'Spares']
    ]],
    ['Voyage', [
      ['bunkerplan', 'Consumption Plan'],
      ['eca', 'ECA'],
      ['consumption', 'Consumption'],
      ['voyageabstract', 'Voyage Abstract'],
      ['rangetotals', 'Range Totals'],
      ['trends', 'Trends'],
      ['receipts', 'Receipts'],
      ['reports', 'Reports']
    ]],
    ['Books', [
      ['reference', 'Reference'],
      ['guide', 'About'],
      ['notes', 'Notes'],
      ['eorb', 'e-ORB']
    ]],
    ['Ship', [
      ['data', 'Setup'],
      ['voyagesetup', 'Voyage Setup'],
      ['vessel', 'Vessel Data']
    ]]
  ];

  var TANKS = [
    ['Summary', [['dashboard', 'Summary']]],
    ['Tanks', [
      ['fuel', 'Fuel Oil'],
      ['lube', 'Lube Oil'],
      ['misc', 'Misc / Bilge'],
      ['water', 'Fresh Water'],
      ['add-tank', 'Add Tank'],
      ['calibration', 'Calibration DB']
    ]],
    ['Fuel Management', [
      ['fuel-report', 'Monitoring'],
      ['bunker-plan', 'Bunker Plan'],
      ['bunker-consumption', 'Bunker Consumption'],
      ['bunker-after', 'Bunkering'],
      ['bunker-summary', 'Bunker Summary'],
      ['sounding-card', 'Sounding Card'],
      ['report', 'Voyage Report']
    ]],
    ['Reference', [
      ['vcf-wcf', 'VCF / WCF Calc'],
      ['iso8217', 'ISO 8217 Specs']
    ]],
    ['System', [
      ['vessel', 'Vessel Setup'],
      ['backup', 'Backup / Sync'],
      ['notes', 'Notes'],
      ['about', 'About']
    ]]
  ];

  var SOON = {
    bunkerplan: ['Consumption Plan', 'Voyage group on the phone sheet. Same page as today: legs, ECA split, sea distance.'],
    bunkeringplan: ['Bunkering Plan', 'Tanks group. Plan lines, second hose, valve alarm.'],
    eca: ['ECA', 'Voyage group. Changeover calculator and the Appendix VI record.'],
    eorb: ['e-ORB', 'Books. The sealed MEPC book is unchanged; this mockup only places it in the shell.'],
    performance: ['Performance', 'Voyage group. The averages already sit on the home board.'],
    spares: ['Spares', 'Watch group, same list as the Voyage Spares tab.'],
    notes: ['Notes', 'Ship group. Reminders stay with the note.'],
    backup: ['Backup & Sync', 'Ship group. The top-bar lamp opens this too.'],
    license: ['License', 'Ship group.'],
    about: ['About', 'Ship group.'],
    consumption: ['Consumption', 'Voyage group.'],
    voyageabstract: ['Voyage Abstract', 'Voyage group.'],
    rangetotals: ['Range Totals', 'Voyage group.'],
    trends: ['Trends', 'Voyage group. Last-7-days lube, distance, slip and fresh water.'],
    receipts: ['Receipts', 'Voyage group. Date, time, sulphur, BDN, density, LCV.'],
    reports: ['Reports', 'Voyage group, including Noon to Noon.'],
    reference: ['Reference', 'Books group.'],
    guide: ['About', 'Voyage Books group.'],
    data: ['Setup', 'Voyage Ship group: flowmeters, MCR, opening ROB.'],
    voyagesetup: ['Voyage Setup', 'Voyage number, condition, departure, arrival, distance.'],
    fuel: ['Fuel Oil', 'Tank list for the fuel category.'],
    lube: ['Lube Oil', 'Tank list.'],
    misc: ['Misc / Bilge', 'Bilge, sludge and the other misc tanks.'],
    water: ['Fresh Water', 'Fresh-water tanks.'],
    'add-tank': ['Add Tank', 'Tanks group.'],
    'bunker-plan': ['Bunker Plan', 'Fuel management.'],
    'bunker-consumption': ['Bunker Consumption', 'Fuel management.'],
    'bunker-after': ['Bunkering', 'After-bunkering soundings.'],
    'bunker-summary': ['Bunker Summary', 'BDN summary.'],
    'sounding-card': ['Sounding Card', 'The paper card, blank or filled.'],
    report: ['Voyage Report', 'Tank voyage report.'],
    'vcf-wcf': ['VCF / WCF Calc', 'Reference group. ASTM 54B and 56.'],
    iso8217: ['ISO 8217 Specs', 'Reference group.']
  };

  function qs() { return new URLSearchParams(location.search); }

  function href(id) {
    var base = HREF[id] || ('soon.html?id=' + encodeURIComponent(id));
    var q = qs();
    var keep = [];
    if (q.get('theme')) keep.push('theme=' + encodeURIComponent(q.get('theme')));
    if (q.get('product')) keep.push('product=' + encodeURIComponent(q.get('product')));
    if (q.get('clean')) keep.push('clean=1');
    if (!keep.length) return base;
    var hash = '';
    var cut = base.indexOf('#');
    if (cut >= 0) { hash = base.slice(cut); base = base.slice(0, cut); }
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + keep.join('&') + hash;
  }

  function ico(id) {
    var set = window.ChengIcons && ChengIcons.byId;
    var svg = (set && (set[id] || set.more)) || '';
    var tone = {
      home: 'steel', summary: 'blue', entry: 'noon', rob: 'amber',
      dashboard: 'amber', bunkerplan: 'blue', bunkeringplan: 'bronze',
      eca: 'sea', eorb: 'red', performance: 'brass', spares: 'steel',
      notes: 'brass', vessel: 'brass', setup: 'brass', backup: 'green',
      license: 'brass', about: 'steel', guide: 'steel', consumption: 'bronze',
      voyageabstract: 'blue', rangetotals: 'blue', trends: 'blue',
      receipts: 'bronze', reports: 'blue', reference: 'blue', data: 'brass',
      voyagesetup: 'blue', fuel: 'amber', lube: 'lube', misc: 'steel',
      water: 'water', 'add-tank': 'amber', calibration: 'amber',
      'fuel-report': 'amber', 'bunker-plan': 'bronze', 'bunker-consumption': 'bronze',
      'bunker-after': 'bronze', 'bunker-summary': 'bronze', 'sounding-card': 'amber',
      report: 'amber', 'vcf-wcf': 'brass', iso8217: 'brass', more: 'steel'
    }[id] || 'steel';
    return '<span class="ico ico-' + tone + '" aria-hidden="true">' + svg + '</span>';
  }

  function link(id, label, extra) {
    var page = document.body.dataset.page || '';
    var active = page === id || (page === 'home' && id === 'home') || (page === 'soon' && qs().get('id') === id);
    if (id === 'entry' && page === 'noon') active = true;
    if (id === 'fuel-report' && page === 'soundings') active = true;
    var cls = 'nav-btn' + (active ? ' active' : '') + (extra || '');
    var attr = '';
    if (id === 'entry' || id === 'summary' || id === 'rob' || id === 'eorb' || id === 'bunkerplan' || id === 'eca') attr = ' data-for="voyage aio"';
    return '<a class="' + cls + '" href="' + href(id) + '"' + attr + '>' + ico(id) + label + '</a>';
  }

  function groupsHtml(groups, kind) {
    return groups.map(function (g) {
      var buttons = g[1].map(function (item) {
        var id = item[0];
        var page = document.body.dataset.page || '';
        var voy = document.body.dataset.voy || '';
        var tank = document.body.dataset.tank || '';
        var active = (kind === 'voyage' && voy === id) || (kind === 'tanks' && tank === id);
        if (kind === 'voyage' && id === 'entry' && page === 'noon') active = true;
        if (kind === 'tanks' && id === 'fuel-report' && page === 'soundings') active = true;
        if (kind === 'tanks' && id === 'calibration' && page === 'calibration') active = true;
        return '<a class="mod-tab' + (active ? ' active' : '') + '" href="' + href(id) + '">' + ico(id) + item[1] + '</a>';
      }).join('');
      return '<div class="mod-group"><span class="gk">' + g[0] + '</span>' + buttons + '</div>';
    }).join('');
  }

  function sheetGroups() {
    var blocks = [];
    blocks.push(['Watch', [
      ['home', 'Home'],
      ['entry', 'Noon report (Log Entry)'],
      ['rob', 'ROB'],
      ['spares', 'Spares']
    ]]);
    VOYAGE.forEach(function (g) {
      if (g[0] === 'Watch') return;
      blocks.push([g[0] === 'Ship' ? 'Voyage — Ship' : g[0], g[1]]);
    });
    TANKS.forEach(function (g) {
      blocks.push(['Tanks — ' + g[0], g[1]]);
    });
    blocks.push(['Ship', [
      ['vessel', 'Vessel Setup'],
      ['backup', 'Backup & Sync'],
      ['license', 'License'],
      ['notes', 'Notes'],
      ['about', 'About']
    ]]);
    return blocks.map(function (b) {
      var items = b[1].map(function (item) {
        var page = document.body.dataset.page || '';
        var active = page === item[0] || (item[0] === 'entry' && page === 'noon') || (item[0] === 'fuel-report' && page === 'soundings');
        return '<a class="item' + (active ? ' active' : '') + '" href="' + href(item[0]) + '">' + ico(item[0]) + item[1] + '</a>';
      }).join('');
      return '<div class="nav-k">' + b[0] + '</div>' + items;
    }).join('');
  }

  function railHtml() {
    var primary = [
      ['home', 'Home'],
      ['entry', 'Noon report'],
      ['fuel-report', 'Soundings']
    ];
    var html = '<div class="nav-k">On watch</div>' + primary.map(function (item) {
      var page = document.body.dataset.page || '';
      var active = (item[0] === 'home' && page === 'home') || (item[0] === 'entry' && page === 'noon') || (item[0] === 'fuel-report' && page === 'soundings');
      var forAttr = item[0] === 'entry' ? ' data-for="aio voyage"' : (item[0] === 'fuel-report' ? ' data-for="aio tank"' : '');
      return '<a class="nav-btn primary-link' + (active ? ' active' : '') + '" href="' + href(item[0]) + '"' + forAttr + '>' + ico(item[0]) + item[1] + '</a>';
    }).join('');
    html += '<div class="nav-k">All sections</div>';
    AIO.forEach(function (item) {
      if (item[0] === 'home' || item[0] === 'summary' || item[0] === 'dashboard') return;
      var forAttr = item[2] ? ' data-for="aio ' + item[2] + '"' : '';
      html += '<a class="nav-btn" href="' + href(item[0]) + '"' + forAttr + '>' + ico(item[0]) + item[1] + '</a>';
    });
    return html;
  }

  function sidebarHtml() {
    var page = document.body.dataset.page || '';
    var side = document.body.dataset.side || page;
    return AIO.map(function (item) {
      var id = item[0];
      var active = (id === 'home' && side === 'home') || (id === 'summary' && side === 'voyage') || (id === 'dashboard' && side === 'tanks') || (id === 'vessel' && side === 'vessel') || (id === side);
      var forAttr = item[2] ? ' data-for="aio ' + item[2] + '"' : '';
      return '<a class="nav-btn' + (active ? ' active' : '') + '" href="' + href(id) + '"' + forAttr + '>' + ico(id) + item[1] + '</a>';
    }).join('') + '<div class="side-foot">One vessel on this device.<br>Licensed for this ship.</div>';
  }

  function dockHtml() {
    var page = document.body.dataset.page || '';
    function item(id, label, cls) {
      var active = (id === 'home' && page === 'home') || (id === 'entry' && page === 'noon') || (id === 'fuel-report' && page === 'soundings') || (id === 'eorb' && page === 'soon' && qs().get('id') === 'eorb');
      var more = id === 'more';
      if (more) active = page === 'rob' || page === 'calibration' || page === 'vessel' || (page === 'soon' && qs().get('id') !== 'eorb');
      var tag = more ? 'button' : 'a';
      var hrefAttr = more ? ' type="button" data-open-sheet' : ' href="' + href(id) + '"';
      var forAttr = id === 'entry' || id === 'eorb' ? ' data-for="aio voyage"' : (id === 'fuel-report' ? ' data-for="aio tank"' : '');
      return '<' + tag + ' class="' + (cls || '') + (active ? ' active' : '') + '"' + hrefAttr + forAttr + '>' + ico(id) + '<strong>' + label + '</strong></' + tag + '>';
    }
    return item('home', 'Home') + item('entry', 'Noon') + item('fuel-report', 'Soundings') + item('eorb', 'e-ORB', 'dock-eorb') + item('more', 'More');
  }

  function chipsHtml() {
    var page = document.body.dataset.page || '';
    function chip(id, label, cls) {
      var active = (id === 'home' && page === 'home') || (id === 'entry' && page === 'noon') || (id === 'fuel-report' && page === 'soundings');
      var forAttr = id === 'entry' ? ' data-for="aio voyage"' : (id === 'fuel-report' ? ' data-for="aio tank"' : '');
      return '<a class="' + (cls || '') + (active ? ' active' : '') + '" href="' + href(id) + '"' + forAttr + '>' + ico(id) + label + '</a>';
    }
    return chip('entry', 'Noon') + chip('fuel-report', 'Soundings') + chip('home', 'Home') + '<a data-for="aio voyage" href="' + href('eorb') + '">' + ico('eorb') + 'e-ORB</a>' + '<a href="#" data-open-sheet>' + ico('more') + 'More</a>';
  }

  function watchHtml() {
    return [
      '<span><span class="k">Ship</span> <b>12:00 UTC+8</b></span>',
      '<span><span class="k">Pos</span> <b>12°18.4\'N 112°40.2\'E</b></span>',
      '<span><span class="k">Cse</span> <b>048° T</b></span>',
      '<span><span class="k">Next</span> <b>Singapore → Zhoushan</b></span>',
      '<span><span class="k">ROB MT</span> VLSFO <b>812.250</b> · LSMGO <b>86.200</b> · MDO <b>24.100</b></span>',
      '<span><span class="k">Sludge</span> <b>22%</b></span>',
      '<span><span class="k">e-ORB</span> <b>Weekly inventory in date · last 22 Nov</b></span>'
    ].join('');
  }

  function shell(inner) {
    var theme = document.documentElement.getAttribute('data-theme') === 'day' ? 'Night' : 'Day';
    return ''
      + '<header class="top">'
      + '<button type="button" class="menu-btn" data-open-sheet aria-label="All sections">Menu</button>'
      + '<a class="brand" href="' + href('home') + '"><span class="mark">CH</span><span><b>ChEng AIO</b><small>Marine engineer suite</small></span></a>'
      + '<div class="vessel-plate"><strong><span class="plimsoll" title="Laden" aria-hidden="true"></span>MV GIORGIS · L</strong><span class="top-sub">IMO 1234567 · Panama · 12°18\'N 112°40\'E · UTC+8</span></div>'
      + '<div class="top-tools">'
      + '<a class="lamp" href="' + href('backup') + '" title="Offline. Last sync 06:40. Open leg kept."><i></i><span>Offline</span><span class="lamp-long"> · 06:40</span></a>'
      + '<span class="clock"><span class="clock-date">27 Nov </span>12:00<span class="clock-tz"> UTC+8</span></span>'
      + '<button type="button" class="theme-btn" data-theme-toggle>' + theme + '</button>'
      + '</div></header>'
      + '<div class="watch" aria-label="Watch strip">' + watchHtml() + '</div>'
      + '<nav class="chips" aria-label="Phone landscape">' + chipsHtml() + '</nav>'
      + '<div class="frame">'
      + '<aside class="sidebar" aria-label="Windows menu">' + sidebarHtml() + '</aside>'
      + '<aside class="rail" aria-label="Tablet sections">' + railHtml() + '</aside>'
      + '<main class="stage" id="stage">'
      + '<nav class="module-bar voyage" aria-label="Voyage Chief">' + '<div class="mod-groups">' + groupsHtml(VOYAGE, 'voyage') + '</div></nav>'
      + '<nav class="module-bar tanks" aria-label="Tank Chief">' + '<div class="mod-groups">' + groupsHtml(TANKS, 'tanks') + '</div></nav>'
      + inner
      + '</main></div>'
      + '<nav class="dock" aria-label="Phone and tablet portrait">' + dockHtml() + '</nav>'
      + '<div class="sheet" id="sheet" aria-hidden="true"><div class="sheet-panel" role="dialog" aria-label="All sections">'
      + '<div class="sheet-h"><b>All sections</b><button type="button" class="btn small" data-close-sheet>Close</button></div>'
      + '<p class="hint" style="margin-top:0">Same work as the Windows list. Noon report and Soundings are on the bottom bar.</p>'
      + sheetGroups()
      + '</div></div>';
  }

  function applyTheme(mode, persist) {
    document.documentElement.setAttribute('data-theme', mode);
    try { if (persist) localStorage.setItem('cheng-mock-theme', mode); } catch (e) {}
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) btn.textContent = mode === 'day' ? 'Night' : 'Day';
  }

  function bind() {
    document.querySelectorAll('[data-open-sheet]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        var sheet = document.getElementById('sheet');
        sheet.classList.add('open');
        sheet.setAttribute('aria-hidden', 'false');
      });
    });
    document.querySelectorAll('[data-close-sheet]').forEach(function (el) {
      el.addEventListener('click', function () {
        var sheet = document.getElementById('sheet');
        sheet.classList.remove('open');
        sheet.setAttribute('aria-hidden', 'true');
      });
    });
    var sheet = document.getElementById('sheet');
    if (sheet) sheet.addEventListener('click', function (ev) {
      if (ev.target === sheet) sheet.classList.remove('open');
    });
    var toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) toggle.addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'day' ? 'night' : 'day', true);
    });

    var steps = document.querySelectorAll('[data-step]');
    var stepBtns = document.querySelectorAll('[data-go-step]');
    function showStep(n) {
      steps.forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-step') === String(n)); });
      stepBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go-step') === String(n)); });
    }
    if (steps.length) {
      showStep(1);
      stepBtns.forEach(function (b) {
        b.addEventListener('click', function () { showStep(b.getAttribute('data-go-step')); });
      });
      document.querySelectorAll('[data-next]').forEach(function (b) {
        b.addEventListener('click', function () {
          var cur = 1;
          steps.forEach(function (s) { if (s.classList.contains('on')) cur = Number(s.getAttribute('data-step')); });
          showStep(Math.min(4, cur + 1));
          var stage = document.getElementById('stage');
          if (stage) stage.scrollTop = 0;
        });
      });
      document.querySelectorAll('[data-prev]').forEach(function (b) {
        b.addEventListener('click', function () {
          var cur = 1;
          steps.forEach(function (s) { if (s.classList.contains('on')) cur = Number(s.getAttribute('data-step')); });
          showStep(Math.max(1, cur - 1));
        });
      });
    }

    var view = document.getElementById('tank-view');
    if (view && !view.getAttribute('data-view')) view.setAttribute('data-view', 'both');
    document.querySelectorAll('[data-tank-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!view) return;
        view.setAttribute('data-view', b.getAttribute('data-tank-view'));
        document.querySelectorAll('[data-tank-view]').forEach(function (x) {
          x.classList.toggle('on', x === b);
        });
      });
    });

    var cal = document.getElementById('cal-trim');
    if (cal) cal.addEventListener('change', function () {
      document.querySelectorAll('[data-trim-col]').forEach(function (col) {
        col.hidden = col.getAttribute('data-trim-col') !== cal.value;
      });
    });

    if (window.innerWidth < 1100) {
      document.querySelectorAll('details.head-fold, details.wide-open').forEach(function (d) {
        d.removeAttribute('open');
      });
    }

    if (qs().get('sheet') === '1' && sheet) {
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
    }
  }

  function fillSoon() {
    if (document.body.dataset.page !== 'soon') return;
    var id = qs().get('id') || '';
    var info = SOON[id] || ['This section', 'It stays in the menu so every Windows item has a place on the phone.'];
    var host = document.getElementById('soon-body');
    if (!host) return;
    host.innerHTML = '<header class="page-h"><div><h1>' + info[0] + '</h1>'
      + '<p>Reached from the phone sheet, the tablet rail, and the Windows menu. A full screen for this one is not in the mockup set.</p></div></header>'
      + '<section class="band"><p style="margin:0">' + info[1] + '</p>'
      + '<p class="hint">Noon report and tank soundings are drawn in full. This page only shows that the item is still one tap from More, and that nothing was dropped.</p></section>';
  }

  function boot() {
    var q = qs();
    var theme = q.get('theme');
    if (theme !== 'day' && theme !== 'night') {
      try { theme = localStorage.getItem('cheng-mock-theme'); } catch (e) { theme = null; }
    }
    if (theme !== 'day' && theme !== 'night') theme = 'night';
    document.documentElement.setAttribute('data-theme', theme);
    var product = q.get('product') || 'aio';
    if (product !== 'voyage' && product !== 'tank') product = 'aio';
    document.documentElement.setAttribute('data-product', product);
    if (q.get('clean') === '1') document.body.classList.add('clean');
    if (q.get('full') === '1') document.documentElement.classList.add('full-shot');

    var tpl = document.getElementById('page');
    var app = document.getElementById('app');
    if (!app || !tpl) return;
    app.innerHTML = shell(tpl.innerHTML);
    fillSoon();
    bind();

    var bar = document.getElementById('mockbar');
    if (bar) {
      bar.querySelectorAll('[data-set-theme]').forEach(function (b) {
        b.addEventListener('click', function () { applyTheme(b.getAttribute('data-set-theme'), true); });
      });
      var sel = bar.querySelector('[data-product]');
      if (sel) {
        sel.value = product;
        sel.addEventListener('change', function () {
          var next = new URL(location.href);
          next.searchParams.set('product', sel.value);
          location.href = next.toString();
        });
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
