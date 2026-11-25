// Emission Control Area (ECA / SECA) zones for the offline route tools. Works in Node (require) and browsers (window.EcaZones).
// APPROXIMATE outlines drawn by hand for planning (how many nm of a route lie inside): NOT the official MARPOL Annex VI boundaries.
// Rings are [lon, lat]. The zone list is data: change it here and run node scripts/build-sea-distance.js.
(function (root) {
  'use strict';
  const R_NM = 3440.065, rad = Math.PI / 180;
  const gc = (a, b) => { const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2; return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h))); };
  const ZONES = [
    { id: 'baltic', label: 'Baltic Sea', rings: [[[10.6, 53.4], [30.6, 53.4], [30.6, 66.0], [12.8, 66.0], [12.8, 57.75], [9.8, 57.75], [9.8, 54.2], [10.6, 54.2]]] },
    { id: 'north_sea', label: 'North Sea & English Channel', rings: [
      [[-2.5, 51.0], [10.05, 51.0], [10.05, 57.75], [12.8, 57.75], [12.8, 62.0], [-4.0, 62.0], [-4.0, 56.0], [-2.5, 56.0]],
      [[-5.0, 48.5], [2.0, 48.5], [2.0, 51.4], [-2.0, 51.4], [-2.0, 50.95], [-5.0, 50.95]]] },
    { id: 'mediterranean', label: 'Mediterranean Sea', rings: [
      [[-5.6, 35.0], [0.0, 35.0], [0.0, 38.0], [-5.6, 38.0]],
      [[0.0, 36.0], [16.0, 36.0], [16.0, 43.8], [0.0, 43.8]],
      [[6.5, 43.0], [10.5, 43.0], [10.5, 44.6], [6.5, 44.6]],
      [[8.0, 30.0], [29.0, 30.0], [29.0, 31.0], [32.0, 31.0], [32.0, 31.2], [36.2, 31.2], [36.2, 37.2], [8.0, 37.2]],
      [[12.0, 36.0], [22.0, 36.0], [22.0, 40.0], [12.0, 40.0]],
      [[12.0, 40.0], [19.8, 40.0], [19.8, 45.9], [12.0, 45.9]],
      [[22.0, 36.0], [27.5, 36.0], [27.5, 41.0], [22.0, 41.0]]] },
    { id: 'north_america', label: 'North America (US & Canada, coarse)', rings: [
      // Atlantic coast, St Lawrence, Great Lakes and the US Gulf coast, about 200 nm offshore; the interior is land and only closes the ring
      [[-101.0, 49.5], [-52.0, 49.5], [-49.5, 46.5], [-55.0, 43.0], [-61.0, 40.5], [-69.0, 38.0], [-72.0, 35.2], [-76.0, 32.5], [-78.0, 29.5], [-77.5, 25.0],
       [-79.0, 23.7], [-82.5, 23.7], [-84.0, 24.2], [-87.0, 24.5], [-91.5, 25.0], [-94.5, 25.5], [-97.0, 25.9], [-101.0, 30.0]],
      // Pacific coast of the US and Canada (Alaska not included), about 200 nm offshore
      [[-117.2, 32.5], [-121.0, 31.0], [-125.5, 33.5], [-127.0, 38.5], [-128.0, 46.0], [-131.5, 50.0], [-135.5, 53.5], [-133.5, 54.8], [-129.5, 54.8], [-125.0, 50.0],
       [-117.0, 49.0], [-114.0, 40.0], [-114.6, 32.7]],
      // Main Hawaiian Islands
      [[-163.5, 16.5], [-152.5, 16.5], [-152.5, 24.8], [-163.5, 24.8]]] },
    { id: 'us_caribbean', label: 'US Caribbean (Puerto Rico, US Virgin Islands)', rings: [[[-70.0, 15.5], [-62.5, 15.5], [-62.5, 20.5], [-70.0, 20.5]]] },
  ];
  function inRing(lon, lat, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  /** The id of the first zone (of `ids`, default all) holding the point, or null. */
  function zoneAt(lon, lat, ids) {
    for (const z of ZONES) { if (ids && !ids.includes(z.id)) continue; if (z.rings.some(r => inRing(lon, lat, r))) return z.id; }
    return null;
  }
  const label = id => (ZONES.find(z => z.id === id) || { label: id }).label;
  /** Walk a path of [lat, lon] points (great-circle legs, sampled every ~stepNm) and report how much lies in an ECA.
   *  Returns { totalNm, ecaNm, zones: {id: nm}, runs: [{eca, zone, nm, from:[lat,lon], to:[lat,lon], pts:[[lat,lon]...]}] } with runs in order (pts follow the route, for drawing). */
  function measure(path, ids, stepNm) {
    const step = stepNm || 5, runs = []; let total = 0, eca = 0; const zones = {};
    const add = (z, nm, from, to) => {
      const last = runs[runs.length - 1];
      if (last && last.zone === z) { last.nm += nm; last.to = to; last.pts.push(to); } else runs.push({ eca: !!z, zone: z, nm, from, to, pts: [from, to] });
      total += nm; if (z) { eca += nm; zones[z] = (zones[z] || 0) + nm; }
    };
    for (let i = 1; i < path.length; i++) {
      const a = [path[i - 1][1], path[i - 1][0]], b = [path[i][1], path[i][0]], d = gc(a, b);
      if (!(d > 0)) continue;
      const bl = b[0] - a[0] > 180 ? b[0] - 360 : b[0] - a[0] < -180 ? b[0] + 360 : b[0]; // a leg across the 180th meridian goes the short way round
      const wrap = x => (x > 180 ? x - 360 : x < -180 ? x + 360 : x);
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
        const lonAt = t => wrap(a[0] + (bl - a[0]) * t), latAt = t => a[1] + (b[1] - a[1]) * t; // linear in lon/lat: fine at this step size
        add(zoneAt(lonAt(tm), latAt(tm), ids), d / n, [latAt(t0), lonAt(t0)], [latAt(t1), lonAt(t1)]);
      }
    }
    return { totalNm: total, ecaNm: eca, zones, runs };
  }
  const api = { ZONES, zoneAt, measure, label, inRing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EcaZones = api;
})(typeof self !== 'undefined' ? self : this);
