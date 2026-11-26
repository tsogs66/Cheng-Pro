'use strict';
// ECA zones for the offline route tools: outlines are APPROXIMATE (planning), so the checks use ports well inside or well outside, and wide ranges.
const assert = require('assert'), fs = require('fs'), path = require('path');
const E = require('./eca-zones.js'), PA = require('./parse-eca.js'), SR = require('./sea-route.js'), PL = require('./port-list.js');
const d = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const pl = PL.create(d('data/ports/ports.json')), router = SR.create(d('data/sea-lanes/marnet.json'));
const port = (re, cc) => { const p = pl.all().find(x => re.test(x.name) && x.cc === cc); assert(p, String(re)); return p; };
const at = p => E.zoneAt(p.lon, p.lat);                                    // every area, also those that take effect later
const atNow = p => E.zoneAt(p.lon, p.lat, E.inForce('2026-11-26'));      // the areas in force on 26 Nov 2026

// ports inside and outside the zones
const IN = [[/^ROTTERDAM/, 'NL', 'north_sea'], [/^HAMBURG/, 'DE', 'north_sea'], [/LE HAVRE$/, 'FR', 'north_sea'], [/^SOUTHAMPTON/, 'GB', 'north_sea'], [/^GDANSK/, 'PL', 'baltic'],
  [/^KIEL$/, 'DE', 'baltic'], [/SANKT-PETERBURG/, 'RU', 'baltic'], [/^HELSINKI/, 'FI', 'baltic'], [/^BARCELONA/, 'ES', 'mediterranean'], [/GENOVA/, 'IT', 'mediterranean'],
  [/ISKANDARIYH/, 'EG', 'mediterranean'], [/^HAIFA/, 'IL', 'mediterranean'], [/^NEW YORK CITY/, 'US', 'north_america'],
  [/^HOUSTON/, 'US', 'north_america'], [/^HALIFAX/, 'CA', 'north_america'], [/^LOS ANGELES/, 'US', 'north_america'], [/^SEATTLE/, 'US', 'north_america'],
  [/^HONOLULU/, 'US', 'north_america'], [/^SAN JUAN/, 'PR', 'us_caribbean']];
const OUT = [[/PUERTO DE BILBAO/, 'ES'], [/^LISBOA/, 'PT'], [/^LAS PALMAS/, 'ES'], [/^ODESA/, 'UA'], [/^ISTANBUL/, 'TR'], [/^VERACRUZ/, 'MX'], [/^CAPE TOWN/, 'ZA'],
  [/KEPPEL/, 'SG'], [/FUJAYRAH/, 'AE'], [/^CONSTANTA/, 'RO'], [/^SINES/, 'PT'], [/BUR SAID/, 'EG'] /* inside the excluded Suez Canal entrance box */, [/^SHANGHAI/, 'CN'] /* 0.50% area: off unless switched on */, [/^TROMSO/, 'NO'] /* Norwegian Sea ECA from 2027 */];
for (const [re, cc, z] of IN) assert.strictEqual(atNow(port(re, cc)), z, 'inside ' + z + ': ' + re);
for (const [re, cc] of OUT) assert.strictEqual(atNow(port(re, cc)), null, 'outside every ECA in force: ' + re);

// measuring a route
const measure = (A, B, opts, ids) => { const x = router.route(A, B, opts); assert(x.ok); const m = E.measure([[A.lat, A.lon]].concat(x.path, [[B.lat, B.lon]]), ids || E.inForce('2026-11-26')); return { x, m }; };
const SIN = port(/KEPPEL/, 'SG'), RTM = port(/^ROTTERDAM/, 'NL'), HAM = port(/^HAMBURG/, 'DE');
const a = measure(SIN, RTM);
assert(Math.abs(a.m.totalNm - a.x.nm) < 15, 'measured length matches the route length: ' + a.m.totalNm + ' vs ' + a.x.nm);
assert(a.m.zones.mediterranean > 1500 && a.m.zones.mediterranean < 2500, 'Singapore-Rotterdam via Suez: Mediterranean part ' + a.m.zones.mediterranean);
assert(a.m.zones.north_sea > 250 && a.m.zones.north_sea < 600, 'and the Channel / North Sea part ' + a.m.zones.north_sea);
assert(a.m.runs.map(r => r.eca).join() === 'false,true,false,true', 'outside, Mediterranean, outside, North Sea');
const c = measure(SIN, RTM, { avoid: ['suez'] });
assert(!c.m.zones.mediterranean && c.m.zones.north_sea > 250, 'round the Cape there is no Mediterranean part');
const h = measure(RTM, HAM); assert(Math.abs(h.m.ecaNm - h.m.totalNm) < 1, 'Rotterdam-Hamburg is all inside the North Sea ECA');
assert(measure(SIN, RTM, null, ['baltic']).m.ecaNm === 0, 'switching a zone off removes it from the measure');
// a leg across the 180th meridian goes the short way round (it used to be sampled through the North Sea)
const pac = E.measure([[34, -118], [35.5, 140]]);
assert(!pac.zones.north_sea && pac.zones.north_america > 100, 'Pacific crossing: only the North American coast counts');
assert(E.label('baltic') === 'Baltic Sea' && E.ZONES.length === 10, 'zone list');
// the official coordinate tables (IMO resolutions in data/eca/source/): complete and without scan slips
const tables = PA.load(), R = 3440.065, rad = Math.PI / 180;
const stepNm = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2));
assert.deepStrictEqual(tables.na.map(r => r.length), [47, 206, 45], 'North American ECA: 47 + 206 + 45 points');
assert.strictEqual(tables.car[0].length, 27, 'US Caribbean ECA: 27 points');
assert.strictEqual(new Set(tables.ne.map(r => r.n)).size, 157, 'North-East Atlantic ECA: 157 points');
for (const rows of tables.na.concat(tables.car)) rows.forEach((r, i) => { assert(r.n === i + 1, 'points are numbered in order'); if (i) assert(stepNm(rows[i - 1], r) < 400, 'no scan slip: point ' + r.n); });
// areas that take effect later
assert(!E.inForce('2026-11-26').includes('north_east_atlantic') && E.inForce('2027-09-01').includes('north_east_atlantic') && E.inForce('2026-11-26', ['north_east_atlantic']).includes('north_east_atlantic'), 'the North-East Atlantic ECA counts from 1 Sep 2027 or when switched on');
const ids26 = E.inForce('2026-11-26'), ids28 = E.inForce('2028-01-01');
const hv = port(/LE HAVRE$/, 'FR'), ny = port(/^NEW YORK CITY/, 'US'), hvx = router.route(hv, ny, {}), hvPts = [[hv.lat, hv.lon]].concat(hvx.path, [[ny.lat, ny.lon]]);
assert(E.measure(hvPts, ids28).ecaNm > E.measure(hvPts, ids26).ecaNm + 200, 'from 2027 the North-East Atlantic adds distance to Le Havre - New York');
const OFFICIAL_IN = [[/^NEW ORLEANS/, 'US', 'north_america'], [/^BALTIMORE/, 'US', 'north_america'], [/^TAMPA/, 'US', 'north_america'], [/^MONTREAL/, 'CA', 'north_america'], [/^SAN FRANCISCO/, 'US', 'north_america'],
  [/^PORTLAND/, 'US', 'north_america'], [/^ANCHORAGE/, 'US', 'north_america'], [/^LISBOA/, 'PT', 'north_east_atlantic'], [/^CORK/, 'IE', 'north_east_atlantic'], [/^DUBLIN/, 'IE', 'north_east_atlantic'], [/REYKJAVIK/, 'IS', 'north_east_atlantic'], [/^SINES/, 'PT', 'north_east_atlantic'], [/^CADIZ/, 'ES', 'north_east_atlantic']];
for (const [re, cc, z] of OFFICIAL_IN) assert.strictEqual(at(port(re, cc)), z, 'inside ' + z + ': ' + re);
for (const [re, cc] of [[/^CHICAGO/, 'US'], [/^FREEPORT/, 'BS'], [/^NASSAU/, 'BS'], [/^HABANA|BAHAI DE LA HABANA/, 'CU'], [/^KINGSTON/, 'JM'], [/^LAS PALMAS/, 'ES']]) assert.strictEqual(at(port(re, cc)), null, 'outside every area (Great Lakes, Bahamas, Cuba, Jamaica, Canaries): ' + re);
// Canadian Arctic, Norwegian Sea, Mediterranean (MEPC.361(79) wording) and the Chinese domestic ECA
assert.deepStrictEqual([tables.ca.length, tables.no.length, tables.cnCoast.length, tables.cnHainan.length], [179, 29, 59, 20], 'table sizes: Canadian Arctic 179, Norwegian Sea 29, China coast 59, Hainan 20');
for (const rows of [tables.ca, tables.no, tables.cnCoast, tables.cnHainan]) rows.forEach((r, i) => { if (i) assert(stepNm(rows[i - 1], r) < 420, 'no slip in a table near ' + r.lat + ',' + r.lon); });
const z = (lon, lat) => E.zoneAt(lon, lat);
assert.strictEqual(z(-85, 74.2), 'canadian_arctic', 'Lancaster Sound'); assert.strictEqual(z(-133, 70.5), 'canadian_arctic', 'Beaufort Sea off Tuktoyaktuk');
assert.strictEqual(z(-94.2, 58.8), null, 'Hudson Bay south of 60 N is outside');
assert.strictEqual(z(18, 70.3), 'norwegian_sea', 'off Tromso'); assert.strictEqual(z(5, 64), 'norwegian_sea', 'off Trondheim'); assert.strictEqual(z(3, 67), null, 'the open Norwegian Sea beyond the line');
assert.strictEqual(z(28, 40.7), null, 'Sea of Marmara is outside the Mediterranean ECA'); assert.strictEqual(z(31, 43), null, 'Black Sea is outside'); assert.strictEqual(z(25.5, 39.9), 'mediterranean', 'Aegean');
assert.strictEqual(z(-7, 36), 'north_east_atlantic', 'Gulf of Cadiz belongs to the Atlantic area, not the Mediterranean'); assert.strictEqual(z(-5.2, 36.0), 'mediterranean', 'Strait of Gibraltar east of the Trafalgar - Spartel line');
assert.strictEqual(z(32.4, 31.4), null, 'northern entrance of the Suez Canal is excluded'); assert.strictEqual(z(34.5, 27), null, 'Red Sea');
assert.strictEqual(z(122.3, 31.2), 'china_coast', 'Yangtze mouth'); assert.strictEqual(z(119.5, 38.7), 'china_coast', 'inside Bohai Bay'); assert.strictEqual(z(114.2, 22.2), 'china_coast', 'Hong Kong');
assert.strictEqual(z(109.6, 18.1), 'china_hainan', 'south of Hainan'); assert.strictEqual(z(119.5, 24.5), null, 'mid Taiwan Strait is outside'); assert.strictEqual(z(135, 34), null, 'Japan is outside');
const d26 = E.inForce('2026-11-26'), d27 = E.inForce('2027-03-01');
assert(!d26.includes('canadian_arctic') && !d26.includes('norwegian_sea') && d27.includes('canadian_arctic') && d27.includes('norwegian_sea'), 'Canadian Arctic and Norwegian Sea: fuel limit from 1 Mar 2027');
assert(d26.includes('china_hainan') && !d26.includes('china_coast') && E.inForce('2026-11-26', ['china_coast']).includes('china_coast'), 'China: Hainan 0.10% counts; the 0.50% coast only when switched on');
assert(E.inForce('2026-01-01').includes('mediterranean') && !E.inForce('2021-06-01').includes('china_hainan'), 'Mediterranean counts today; Hainan 0.10% only from 1 Jan 2022');
// keeping the route out of the ECA: fewer ECA miles for a bounded detour
const nan = port(/^NANTES/, 'FR'), nol = port(/^NEW ORLEANS/, 'US'), idsNow = E.inForce('2026-11-26'), inEca = (lo, la) => !!E.zoneAt(lo, la, idsNow);
const eNm = (A, B, x) => E.measure([[A.lat, A.lon]].concat(x.path, [[B.lat, B.lon]]), idsNow).ecaNm;
const r0 = router.route(nan, nol, {}), r2 = router.route(nan, nol, { eca: { test: inEca, key: 'now', weight: 2 } });
assert(r2.ok && eNm(nan, nol, r2) < eNm(nan, nol, r0) - 100, 'a weight on ECA water cuts the miles inside the ECA');
assert(r2.nm >= r0.nm - 0.5 && r2.nm <= r0.nm * 1.12, 'for a bounded detour (the reported distance is the real one): ' + r0.nm + ' -> ' + r2.nm);
assert(router.route(nan, nol, { eca: { test: inEca, key: 'now', weight: 0 } }).nm === r0.nm, 'weight 0 changes nothing');
// waypoints for the route editor: a route rebuilt from its own waypoints has the same length, and land crossings are flagged
assert(r0.waypoints && r0.waypoints.length >= 3, 'the route result lists its waypoints');
{ const pts = [[nan.lat, nan.lon]].concat(r0.waypoints, [[nol.lat, nol.lon]]); let sum = 0; const R = Math.PI / 180;
  for (let i = 1; i < pts.length; i++) { const h = Math.sin((pts[i][0] - pts[i - 1][0]) * R / 2) ** 2 + Math.cos(pts[i - 1][0] * R) * Math.cos(pts[i][0] * R) * Math.sin((pts[i][1] - pts[i - 1][1]) * R / 2) ** 2; sum += 2 * 3440.065 * Math.asin(Math.sqrt(h)); }
  assert(Math.abs(sum - r0.nm) < r0.nm * 0.01, 'waypoints rebuild the distance: ' + sum + ' vs ' + r0.nm); }
const landRouter = SR.create(d('data/sea-lanes/marnet.json'), { land: SR.decodeLand(d('data/map/land.json')) });
assert(landRouter.segmentCheck([40, -7], [40, 0]).land === true, 'a leg across Spain is flagged as crossing land');
assert(landRouter.segmentCheck([40, -40], [35, -30]).land === false, 'open Atlantic is clear');
console.log('eca OK');
