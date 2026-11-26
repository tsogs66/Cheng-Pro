# Sea-lane network data — provenance and licence

## What this is
`marnet.json` is a global shipping-lane graph (42,334 nodes, 78,703 undirected edges, passage tags) converted by `scripts/import-marnet-eurostat.py`
from the **Eurostat SeaRoute `marnet_plus_5km` network** (`source/marnet_plus_5km.gpkg`, a GeoPackage read with sqlite3 only). Coordinates in `marnet.json` are
[lon, lat]; edge lengths are recomputed (great-circle, nm) by `scripts/sea-route.js`.

## Where it came from
- Repository: https://github.com/eurostat/searoute (Eurostat, European Commission), file `modules/war/src/main/resources/marnet/marnet_plus_5km.gpkg`,
  commit 88a2e568a8e0144d1f5a81c3931a7bc2bcce6901 (10 Jan 2022). SHA-256 of the stored copy: 75ca6cc130b3748f568196a9caf62889e9f096ec358f65223b4095ac070be0e7. Downloaded 26 Nov 2026.
- Verbatim from the Eurostat SeaRoute README, describing the network:

> This maritime network is based on the *Oak Ridge National Labs CTA Transportation Network Group, Global Shipping Lane Network, World, 2000* (retrieved from geocommons.com or github), enriched with some additional lines around the European coasts based on AIS data. Simplified versions of this network have been produced for different resolutions (5km, 10km, 20km, 50km, 100km) based on a shrinking of too short edges and a removal of similar edges.

## Licence
- The repository, including this data file, is published by Eurostat under the **European Union Public Licence v. 1.2 (EUPL-1.2)**; the licence text is in `source/EUROSTAT_SEAROUTE_LICENSE_EUPL-1.2.txt`.
  This replaces the earlier network taken from a third-party Python package whose licence for the data was unclear.
- EUPL-1.2 allows use, copying and redistribution, also commercially. Conditions that apply to what we ship: keep the licence text and the copyright / attribution notice with the data (done here and in
  the apps' `DATA-SOURCES.md`), and distribute a modified version (`marnet.json` is one: converted, tags renamed, dateline links added) under the EUPL-1.2 or a compatible licence. The data file is separate
  from the application code, which stays under the project's own licence.
- The EUPL's own wording is authoritative; this note is a plain summary, not legal advice.
- The upstream CTA data (Oak Ridge National Laboratory, 2000; a U.S. Government-funded dataset) is credited as the source above. Its own terms were not separately checked; Eurostat redistributes the derived network under the EUPL.

## What the converter does
- Splits each line into one edge per pair of vertices, merges equal points (5 decimals) into nodes, and keeps the `pass` attribute as the edge tag.
- Renames Eurostat tags to the ids the router uses: `babelmandeb` -> `babalmandab`, `magellan` -> `chili`. Tags in the file: northwest, northeast, chili, babalmandab, malacca, bering, kiel, gibraltar, dover, panama, suez, corinth.
- The lines are cut at the 180th meridian; each node at 180 E is joined to the node at 180 W with the same latitude (12 zero-length links) so that routes can cross the Pacific.
- Not tagged in this network (the router blocks them by region instead, see `PASSAGE_BOX` in `scripts/sea-route.js`): Strait of Hormuz, Cape of Good Hope, Sunda Strait, Bosporus, Dardanelles.
- The Kiel and Corinth canals and the two Arctic routes (Northwest Passage, Northern Sea Route) are never used by default.

## Limits
Planning estimate only; it is not a navigation product. Coverage: ports far from a lane (river and lake ports, some remote coasts) get a long attach leg and a low-confidence warning.
