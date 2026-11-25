// Offline sea-distance router over data/sea-lanes/network.json (Node + browser: window.SeaRoute).
// APPROXIMATE: a port is joined to its nearest waypoint by a straight line, then Dijkstra over the lane graph.
(function (root) {
  'use strict';
  const R_NM = 3440.065, rad = Math.PI / 180;
  const gc = (a, b) => { const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2; return 2 * R_NM * Math.asin(Math.sqrt(h)); };
  const r1 = x => Math.round(x * 10) / 10;

  function create(network) {
    const nodes = new Map(network.nodes.map(n => [n.id, n]));
    const adj = new Map([...nodes.keys()].map(k => [k, []]));
    for (const e of network.edges) { adj.get(e.a).push({ to: e.b, nm: e.nm, tag: e.tag }); adj.get(e.b).push({ to: e.a, nm: e.nm, tag: e.tag }); }

    function nearestNode(pt) {
      let best = null, d = Infinity;
      for (const n of nodes.values()) { const x = gc(pt, n); if (x < d) { d = x; best = n; } }
      return { node: best, nm: d };
    }
    function dijkstra(src, dst, avoid) {
      const dist = new Map([[src, 0]]), prev = new Map(), done = new Set();
      for (;;) {
        let u = null, du = Infinity;
        for (const [k, v] of dist) if (!done.has(k) && v < du) { du = v; u = k; }
        if (u === null) return null;
        if (u === dst) break;
        done.add(u);
        for (const e of adj.get(u)) {
          if (e.tag && avoid.has(e.tag)) continue;
          const nd = du + e.nm;
          if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) { dist.set(e.to, nd); prev.set(e.to, u); }
        }
      }
      const path = [dst]; while (path[0] !== src) path.unshift(prev.get(path[0]));
      return { nm: dist.get(dst), path };
    }
    /**
     * route(from, to, {avoid:['SUEZ'|'PANAMA'], maxAttachNm:300})
     * from/to: {lat, lon, name?}. Returns {ok, nm, via[], attach:{from,to}, warnings[]} or {ok:false, error}.
     */
    function route(from, to, opts) {
      opts = opts || {};
      const avoid = new Set(opts.avoid || []), maxA = opts.maxAttachNm || 300, warnings = [];
      const a = nearestNode(from), b = nearestNode(to);
      for (const [lbl, x, p] of [['from', a, from], ['to', b, to]]) {
        if (x.nm > maxA) return { ok: false, error: `${lbl} point is ${Math.round(x.nm)} nm from the nearest modelled lane (limit ${maxA}); region not covered yet` };
        if (x.nm > 100) warnings.push(`${lbl} is ${Math.round(x.nm)} nm from nearest waypoint ${x.node.id}: low confidence`);
      }
      let mid;
      if (a.node.id === b.node.id) { mid = { nm: 0, path: [a.node.id] }; warnings.push('both points attach to the same waypoint: distance is approximate'); }
      else { mid = dijkstra(a.node.id, b.node.id, avoid); if (!mid) return { ok: false, error: 'no route with the given restrictions' }; }
      const total = a.nm + mid.nm + b.nm;
      return { ok: true, nm: r1(total), laneNm: r1(mid.nm), attach: { from: { node: a.node.id, nm: r1(a.nm) }, to: { node: b.node.id, nm: r1(b.nm) } }, via: mid.path, warnings };
    }
    return { route, nearestNode, nodes: () => [...nodes.values()] };
  }
  const api = { create, gc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SeaRoute = api;
})(typeof self !== 'undefined' ? self : this);
