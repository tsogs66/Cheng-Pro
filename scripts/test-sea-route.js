'use strict';
// Sanity test for the phase-1 sea-lane network. Reference distances are ROUGH commonly quoted
// figures (nautical miles) from memory, NOT an authoritative table; tolerance is deliberately wide (10%).
const assert = require('assert'), fs = require('fs'), path = require('path');
const SR = require('./sea-route.js'), PL = require('./port-list.js');
const d = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const net = d('data/sea-lanes/network.json'), sr = SR.create(net), pl = PL.create(d('data/ports/ports.json'));
const port = id => { const p = pl.byId(id); assert(p, 'port ' + id); return p; };
const ROTTERDAM = port(31140), SINGAPORE = port(50000), NYC = port(7640), HK = port(57840), CAPETOWN = port(46770),
  FUJAYRAH = port(48262), MUMBAI = port(48840), YOKOHAMA = port(61390), COLON = port(9865);

// graph integrity
const ids = new Set(net.nodes.map(n => n.id));
assert(net.edges.every(e => ids.has(e.a) && ids.has(e.b) && e.nm > 0), 'edges reference nodes');

const near = (r, ref, tol, label) => { assert(r.ok, label + ': ' + r.error); const err = Math.abs(r.nm - ref) / ref; assert(err <= (tol || 0.10), `${label}: ${r.nm} nm vs ~${ref} (${(err * 100).toFixed(1)}%)`); return r; };
const suez = near(sr.route(ROTTERDAM, SINGAPORE), 8300, 0.10, 'Rotterdam-Singapore via Suez');
const cape = near(sr.route(ROTTERDAM, SINGAPORE, { avoid: ['SUEZ'] }), 11700, 0.10, 'Rotterdam-Singapore via Cape');
assert(suez.via.includes('SUEZ_S') && !cape.via.includes('SUEZ_S'), 'avoid SUEZ changes route');
assert(cape.nm > suez.nm, 'Cape route longer than Suez');
near(sr.route(ROTTERDAM, NYC), 3450, 0.10, 'Rotterdam-New York');
near(sr.route(SINGAPORE, HK), 1440, 0.10, 'Singapore-Hong Kong');
near(sr.route(ROTTERDAM, CAPETOWN), 6000, 0.10, 'Rotterdam-Cape Town');
near(sr.route(ROTTERDAM, FUJAYRAH), 6300, 0.10, 'Rotterdam-Fujairah');
near(sr.route(SINGAPORE, YOKOHAMA), 2900, 0.10, 'Singapore-Yokohama');
near(sr.route(ROTTERDAM, COLON), 4800, 0.10, 'Rotterdam-Colon');
// symmetry and triangle sanity
const ab = sr.route(FUJAYRAH, MUMBAI), ba = sr.route(MUMBAI, FUJAYRAH);
assert(ab.ok && Math.abs(ab.nm - ba.nm) < 0.2, 'symmetric');
// uncovered region is refused, not guessed
const baltic = pl.search('gdansk')[0];
if (baltic) { const r = sr.route(ROTTERDAM, baltic); assert(!r.ok || r.warnings.length, 'uncovered port must error or warn'); }
console.log('sea-route OK');
