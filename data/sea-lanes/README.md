# Sea-lane network (phase 1 — coarse, approximate, NOT for navigation)

- Source of truth: `scripts/sea-lane-network.js` (hand-authored waypoints + lanes). Build with
  `node scripts/build-sea-lanes.js` -> `network.json` (validates ids, duplicates, connectivity, computes edge nm).
- Router: `scripts/sea-route.js` (`SeaRoute.create(network).route(fromPort, toPort, {avoid:['SUEZ'|'PANAMA'], maxAttachNm})`).
  A port is joined to its **nearest waypoint by a straight line** (may cross land for enclosed bays), then Dijkstra over lanes.
  Results carry `warnings` when the attach leg is > 100 nm; ports > 300 nm from any waypoint return `ok:false`.
- Test: `node scripts/test-sea-route.js` — checks 9 well-known passages within 10% of rough reference figures
  (from memory, not an authoritative table). Real accuracy is about 3–7% high on the checked routes.

## Covered (phase 1)
North Sea/Channel, Atlantic seaboard, Mediterranean backbone, Suez, Red Sea, Gulf of Aden, Arabian Sea, Persian Gulf,
India west coast/Sri Lanka/Bay of Bengal (partial), Malacca/Singapore/Sunda, South China Sea, East China Sea, Korea Strait,
Japan Pacific side (to Tokyo), North Atlantic to New York, West Africa, Cape of Good Hope, Indian Ocean, Caribbean to Panama.
About 1460 of the 3669 listed ports are within 300 nm of a waypoint (529 within 100 nm).

## Not covered yet
Baltic, Black Sea, Adriatic, Aegean, Gulf of Mexico/US east coast south of NY, Pacific (incl. Panama Pacific side), Australia,
East Africa, Mozambique Channel, Philippines/Indonesia interior, Japan inland sea, rivers/lakes, ice routes, ECA/piracy/weather routing.

## Known weaknesses
- Waypoints were placed by hand and have **not** been checked against charts or a coastline; some legs may graze land/islands.
- Distances are great-circle between waypoints, so they are slightly short of true track lengths in curved passages
  but the lane geometry is coarse, so totals can still run high.
- Treat results as planning estimates only. Replace with a verified network (e.g. a licensed/open sea-route dataset) before relying on them.
