'use strict';
// Sanity test for the sea-lane network. Reference distances are ROUGH commonly quoted figures (nautical miles)
// from memory, NOT an authoritative table; tolerance is deliberately wide (10%).
const assert = require('assert'), fs = require('fs'), path = require('path');
const SR = require('./sea-route.js'), PL = require('./port-list.js');
const d = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const net = d('data/sea-lanes/marnet.json'), sr = SR.create(net), pl = PL.create(d('data/ports/ports.json'));
const port = id => { const p = pl.byId(id); assert(p, 'port ' + id); return p; };
const P = { RTM: port(31140), SIN: port(50000), NYC: port(7640), HK: port(57840), CPT: port(46770), FUJ: port(48262),
  BOM: port(48840), YOK: port(61390), COL: port(9865), HOU: port(9240), SHA: port(59970) };
const named = (q, cc) => { const p = pl.search(q, { country: cc })[0]; assert(p, q); return p; };

// graph integrity
assert(net.format === 'marnet-v1' && net.nodes.length > 9000 && net.edges.length > 15000, 'network size');
assert(net.edges.every(e => e[0] >= 0 && e[1] < net.nodes.length && e[2] < net.tags.length), 'edge indices');

const near = (r, ref, tol, label) => { assert(r.ok, label + ': ' + r.error); const err = Math.abs(r.nm - ref) / ref; assert(err <= (tol || 0.10), `${label}: ${r.nm} nm vs ~${ref} (${(err * 100).toFixed(1)}%)`); return r; };
const suez = near(sr.route(P.RTM, P.SIN), 8300, 0.10, 'Rotterdam-Singapore via Suez');
const cape = near(sr.route(P.RTM, P.SIN, { avoid: ['suez'] }), 11700, 0.10, 'Rotterdam-Singapore via Cape');
assert(suez.passages.includes('suez') && !cape.passages.includes('suez'), 'avoid suez changes route');
assert(cape.passages.includes('south_africa'), 'Cape route passes south_africa');
near(sr.route(P.RTM, P.NYC), 3450, 0.10, 'Rotterdam-New York');
near(sr.route(P.SIN, P.HK), 1440, 0.10, 'Singapore-Hong Kong');
near(sr.route(P.RTM, P.CPT), 6000, 0.10, 'Rotterdam-Cape Town');
near(sr.route(P.RTM, P.FUJ), 6300, 0.10, 'Rotterdam-Fujairah');
near(sr.route(P.SIN, P.YOK), 2900, 0.10, 'Singapore-Yokohama');
near(sr.route(P.RTM, P.COL), 4800, 0.10, 'Rotterdam-Colon');
// regions added in phase 2 (wider tolerance, figures are rough)
near(sr.route(P.RTM, named('gdansk', 'PL')), 850, 0.15, 'Rotterdam-Gdansk (Baltic)');
near(sr.route(P.RTM, named('istanbul', 'TR')), 3100, 0.15, 'Rotterdam-Istanbul (Bosphorus)');
near(sr.route(P.HOU, P.RTM), 5000, 0.12, 'Houston-Rotterdam (Gulf of Mexico)');
near(sr.route(named('los angeles', 'US'), P.YOK), 4800, 0.12, 'Los Angeles-Yokohama (Pacific)');
near(sr.route(named('sydney', 'AU'), P.SIN), 4000, 0.12, 'Sydney-Singapore (Australia)');
near(sr.route(named('santos', 'BR'), P.RTM), 5400, 0.12, 'Santos-Rotterdam (South America)');
// symmetry; Northwest Passage excluded by default
const ab = sr.route(P.FUJ, P.BOM), ba = sr.route(P.BOM, P.FUJ);
assert(ab.ok && Math.abs(ab.nm - ba.nm) < 0.5, 'symmetric');
assert(!sr.route(P.RTM, P.YOK).passages.includes('northwest'), 'northwest avoided by default');
// coverage: nearly every listed port has a lane node within 100 nm
let ok100 = 0; for (const p of pl.all()) if (sr.nearest(p)[0].nm <= 100) ok100++;
assert(ok100 / pl.all().length > 0.95, 'coverage within 100 nm: ' + ok100);
// a point far inland is refused, not guessed
assert(!sr.route({ lat: 50.0, lon: 70.0 }, P.RTM).ok, 'inland point refused');
console.log('sea-route OK (coverage<=100nm: ' + ok100 + '/' + pl.all().length + ')');
