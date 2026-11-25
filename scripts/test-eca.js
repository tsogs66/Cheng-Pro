'use strict';
// ECA zones for the offline route tools: outlines are APPROXIMATE (planning), so the checks use ports well inside or well outside, and wide ranges.
const assert = require('assert'), fs = require('fs'), path = require('path');
const E = require('./eca-zones.js'), SR = require('./sea-route.js'), PL = require('./port-list.js');
const d = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const pl = PL.create(d('data/ports/ports.json')), router = SR.create(d('data/sea-lanes/marnet.json'));
const port = (re, cc) => { const p = pl.all().find(x => re.test(x.name) && x.cc === cc); assert(p, String(re)); return p; };
const at = p => E.zoneAt(p.lon, p.lat);

// ports inside and outside the zones
const IN = [[/^ROTTERDAM/, 'NL', 'north_sea'], [/^HAMBURG/, 'DE', 'north_sea'], [/LE HAVRE$/, 'FR', 'north_sea'], [/^SOUTHAMPTON/, 'GB', 'north_sea'], [/^GDANSK/, 'PL', 'baltic'],
  [/^KIEL$/, 'DE', 'baltic'], [/SANKT-PETERBURG/, 'RU', 'baltic'], [/^HELSINKI/, 'FI', 'baltic'], [/^BARCELONA/, 'ES', 'mediterranean'], [/GENOVA/, 'IT', 'mediterranean'],
  [/ISKANDARIYH/, 'EG', 'mediterranean'], [/BUR SAID/, 'EG', 'mediterranean'], [/^HAIFA/, 'IL', 'mediterranean'], [/^NEW YORK CITY/, 'US', 'north_america'],
  [/^HOUSTON/, 'US', 'north_america'], [/^HALIFAX/, 'CA', 'north_america'], [/^LOS ANGELES/, 'US', 'north_america'], [/^SEATTLE/, 'US', 'north_america'],
  [/^HONOLULU/, 'US', 'north_america'], [/^CHICAGO/, 'US', 'north_america'], [/^SAN JUAN/, 'PR', 'us_caribbean']];
const OUT = [[/PUERTO DE BILBAO/, 'ES'], [/^LISBOA/, 'PT'], [/^LAS PALMAS/, 'ES'], [/^ODESA/, 'UA'], [/^ISTANBUL/, 'TR'], [/^VERACRUZ/, 'MX'], [/^CAPE TOWN/, 'ZA'],
  [/KEPPEL/, 'SG'], [/FUJAYRAH/, 'AE'], [/^ANCHORAGE/, 'US'], [/^CONSTANTA/, 'RO'], [/^SINES/, 'PT']];
for (const [re, cc, z] of IN) assert.strictEqual(at(port(re, cc)), z, 'inside ' + z + ': ' + re);
for (const [re, cc] of OUT) assert.strictEqual(at(port(re, cc)), null, 'outside every ECA: ' + re);

// measuring a route
const measure = (A, B, opts, ids) => { const x = router.route(A, B, opts); assert(x.ok); const m = E.measure([[A.lat, A.lon]].concat(x.path, [[B.lat, B.lon]]), ids); return { x, m }; };
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
assert(E.label('baltic') === 'Baltic Sea' && E.ZONES.length === 5, 'zone list');
console.log('eca OK');
