# Sea-lane network (phase 2)

Phase 1 was a hand-authored 111-waypoint backbone. Phase 2 replaces it with a real global lane graph
(`marnet.json`, the Eurostat SeaRoute network under EUPL-1.2; see `SOURCE.md` for provenance and licence). The phase-1 files were removed.

- Import: `python3 -I scripts/import-marnet-eurostat.py` (GeoPackage -> `marnet.json`, 2 MB).
- Router: `scripts/sea-route.js`. `SeaRoute.create(network).route(from, to, opts)` with `from`/`to` = `{lat, lon}`.
  Each end attaches to its 3 nearest lane nodes (straight line, may cross land in enclosed bays); Dijkstra with a binary heap.
  Options: `avoid: ['suez','panama','malacca','sunda','gibraltar','bosporus','dardanelles','babalmandab','ormuz','south_africa','chili','bering','dover']`,
  `allowNorthwest` (Arctic passage is excluded by default), `maxAttachNm` (default 300).
  Result: `nm`, `laneNm`, `attach {from,to}`, `passages[]`, `path [[lat,lon]...]`, `warnings[]`; `{ok:false,error}` if out of coverage.
- Test: `node scripts/test-sea-route.js` — 15 reference routes within 10–15% of rough figures (from memory), plus symmetry,
  passage avoidance and coverage. Observed errors are mostly within ±4% (Rotterdam–Singapore 8,387 nm via Suez, 11,875 via the Cape).
- Coverage: 3472 of 3669 listed ports are within 100 nm of a lane node.

## Limits
- It is a coarse lane network from year-2000 data plus European enrichment: not chart-accurate, no draft/ECA/ice/weather/piracy logic,
  no canal transit distances beyond what the network encodes. Planning estimates only.
- Ports far from a lane node (e.g. Cape Town 68 nm, Santos 92 nm) get a long straight attach leg; `warnings` flags > 100 nm.
- Inland/river ports are only as good as their nearest sea node.
