// Offline sea-distance router over data/sea-lanes/marnet.json (Node + browser: window.SeaRoute).
// APPROXIMATE: each port is joined to its nearest lane nodes by a straight line, then Dijkstra (binary heap) over the lane graph.
(function (root) {
  'use strict';
  const R_NM = 3440.065, rad = Math.PI / 180;
  const gc = (lat1, lon1, lat2, lon2) => { const h = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2; return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h))); };
  const r1 = x => Math.round(x * 10) / 10;
  const ALWAYS_AVOID = ['northwest']; // Arctic Northwest Passage is excluded unless {allowNorthwest:true}
  /** Passages a route can be told to avoid (the network's own tags), in the order they are offered. `common` ones are shown first. */
  const PASSAGES = [
    { id: 'suez', label: 'Suez Canal', common: true }, { id: 'panama', label: 'Panama Canal', common: true },
    { id: 'babalmandab', label: 'Bab-el-Mandeb', common: true }, { id: 'malacca', label: 'Malacca Strait', common: true },
    { id: 'ormuz', label: 'Strait of Hormuz', common: true }, { id: 'south_africa', label: 'Cape of Good Hope', common: true },
    { id: 'sunda', label: 'Sunda Strait' }, { id: 'gibraltar', label: 'Strait of Gibraltar' }, { id: 'bosporus', label: 'Bosporus' },
    { id: 'dardanelles', label: 'Dardanelles' }, { id: 'chili', label: 'Chile / Magellan passage' }, { id: 'bering', label: 'Bering Strait' },
  ];
  /** Areas a route can be told to keep out of (approximate boxes [minLon, minLat, maxLon, maxLat]; the user decides which apply: they are not official designations).
   *  A port inside an area is still reachable: lane nodes within EXEMPT_NM of the From / To point are not blocked. */
  const AREAS = [
    { id: 'gulf_aden', label: 'Gulf of Aden', box: [43, 10.5, 53, 15.5] },
    { id: 'red_sea', label: 'Red Sea', box: [32, 12.5, 43.6, 28] },
    { id: 'somali_basin', label: 'Somali Basin / West Arabian Sea', box: [44, -6, 62, 12] },
    { id: 'gulf_of_guinea', label: 'Gulf of Guinea', box: [-10, -6, 12, 6] },
    { id: 'black_sea', label: 'Black Sea', box: [27.5, 40.9, 41.8, 47] },
    { id: 'taiwan_strait', label: 'Taiwan Strait', box: [117, 22.5, 121, 26] },
  ];
  const EXEMPT_NM = 200;

  class Heap { // min-heap of [key, value]
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  }

  function create(net) {
    if (net.format !== 'marnet-v1') throw new Error('unsupported network format');
    const N = net.nodes.length, lon = new Float64Array(N), lat = new Float64Array(N);
    net.nodes.forEach((p, i) => { lon[i] = p[0]; lat[i] = p[1]; });
    const adj = Array.from({ length: N }, () => []);
    for (const [a, b, t] of net.edges) { const nm = gc(lat[a], lon[a], lat[b], lon[b]); adj[a].push([b, nm, t]); adj[b].push([a, nm, t]); }

    function nearest(pt, k) {
      const best = []; // sorted ascending [d, i]
      for (let i = 0; i < N; i++) {
        const d = gc(pt.lat, pt.lon, lat[i], lon[i]);
        if (best.length < k || d < best[best.length - 1][0]) { best.push([d, i]); best.sort((x, y) => x[0] - y[0]); if (best.length > k) best.pop(); }
      }
      return best;
    }
    /** route(from, to, {avoid:[passage names e.g. 'suez','panama'], allowNorthwest:false, maxAttachNm:300, k:3}) with from/to = {lat, lon}. */
    function route(from, to, opts) {
      opts = opts || {};
      const avoidNames = new Set((opts.avoid || []).concat(opts.allowNorthwest ? [] : ALWAYS_AVOID).map(s => String(s).toLowerCase()));
      const avoidT = new Set(); net.tags.forEach((t, i) => { if (avoidNames.has(t.toLowerCase())) avoidT.add(i); });
      const maxA = opts.maxAttachNm || 300, k = opts.k || 3, warnings = [];
      const areaIds = new Set((opts.areas || []).map(s => String(s).toLowerCase()));
      const boxes = AREAS.filter(a => areaIds.has(a.id)).map(a => a.box);
      const A = nearest(from, k), B = nearest(to, k);
      if (A[0][0] > maxA) return { ok: false, error: `from point is ${Math.round(A[0][0])} nm from the nearest lane node (limit ${maxA})` };
      if (B[0][0] > maxA) return { ok: false, error: `to point is ${Math.round(B[0][0])} nm from the nearest lane node (limit ${maxA})` };
      const goal = new Map(B.filter(x => x[0] <= maxA).map(x => [x[1], x[0]]));
      const blocked = new Uint8Array(N);
      if (boxes.length) {
        for (let i = 0; i < N; i++) {
          if (!boxes.some(b => lon[i] >= b[0] && lon[i] <= b[2] && lat[i] >= b[1] && lat[i] <= b[3])) continue;
          if (gc(from.lat, from.lon, lat[i], lon[i]) <= EXEMPT_NM || gc(to.lat, to.lon, lat[i], lon[i]) <= EXEMPT_NM) continue;
          blocked[i] = 1;
        }
      }
      const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), prevT = new Int16Array(N).fill(-1), heap = new Heap();
      for (const [d, i] of A) if (d <= maxA) { dist[i] = d; heap.push(d, i); }
      let bestTotal = Infinity, bestNode = -1;
      while (heap.size) {
        const [du, u] = heap.pop();
        if (du > dist[u]) continue;
        if (du >= bestTotal) break;
        if (goal.has(u) && du + goal.get(u) < bestTotal) { bestTotal = du + goal.get(u); bestNode = u; }
        for (const [v, nm, t] of adj[u]) {
          if (t >= 0 && avoidT.has(t)) continue;
          if (blocked[v]) continue;
          const nd = du + nm; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; prevT[v] = t; heap.push(nd, v); }
        }
      }
      if (bestNode < 0) return { ok: false, error: 'no route with the given restrictions' };
      const nodesPath = []; const used = new Set(); let c = bestNode;
      while (c >= 0) { nodesPath.push(c); if (prevT[c] >= 0) used.add(net.tags[prevT[c]]); c = prev[c]; }
      nodesPath.reverse();
      const aNm = dist[nodesPath[0]], bNm = goal.get(bestNode);
      const inside = pt => AREAS.filter(ar => areaIds.has(ar.id) && pt.lon >= ar.box[0] && pt.lon <= ar.box[2] && pt.lat >= ar.box[1] && pt.lat <= ar.box[3]).map(ar => ar.label);
      [['from', from], ['to', to]].forEach(([w, pt]) => { const l = inside(pt); if (l.length) warnings.push(`${w} is inside an avoided area (${l.join(', ')}): the route may be unrealistic`); });
      if (aNm > 100) warnings.push(`from is ${Math.round(aNm)} nm from the nearest lane node: low confidence`);
      if (bNm > 100) warnings.push(`to is ${Math.round(bNm)} nm from the nearest lane node: low confidence`);
      return {
        ok: true, nm: r1(bestTotal), laneNm: r1(bestTotal - aNm - bNm),
        attach: { from: r1(aNm), to: r1(bNm) },
        passages: [...used].filter(t => t !== 'segment' && t !== 'segment2'),
        path: nodesPath.map(i => [lat[i], lon[i]]), warnings,
      };
    }
    return { route, nearest: (pt, kk) => nearest(pt, kk || 1).map(x => ({ nm: r1(x[0]), lat: lat[x[1]], lon: lon[x[1]] })), nodeCount: N };
  }
  const api = { create, PASSAGES, AREAS, gc: (a, b) => gc(a.lat, a.lon, b.lat, b.lon) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SeaRoute = api;
})(typeof self !== 'undefined' ? self : this);
