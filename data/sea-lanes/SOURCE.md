# Sea-lane network data — provenance

## What this is
`marnet.json` is a global shipping-lane graph (9708 nodes, 15970 undirected edges, passage tags) converted by
`scripts/import-marnet.py` from `source/marnet_dict.py.txt`. The source file is stored with a .txt extension and is only
parsed with `ast.literal_eval`, never imported or executed. Coordinates in `marnet.json` are [lon, lat]; edge lengths are
recomputed (great-circle, nm) by `scripts/sea-route.js`, the source weights (km) are not used.

## Where it came from
- File: https://raw.githubusercontent.com/genthalili/searoute-py/main/searoute/data/marnet_dict.py
  (GitHub user `genthalili`, project "searoute-py", package metadata says Apache-2.0). Downloaded 2026-11-25; commit not recorded.
  SHA-256 of the stored copy: 3622fff283e71b940ba5d58280b07c5cb2e95959ffb48f647b39b500b6c50ea3
- That project credits Eurostat's SeaRoute Java library (https://github.com/eurostat/searoute, licensed EUPL v1.2;
  full text in `source/EUROSTAT_SEAROUTE_LICENSE_EUPL-1.2.txt`).
- Verbatim from the Eurostat SeaRoute README (master branch), describing the underlying network:

> This maritime network is based on the *Oak Ridge National Labs CTA Transportation Network Group, Global Shipping Lane Network, World, 2000* (retrieved from [geocommons.com](http://geocommons.com/datasets?id=25) or [github](https://github.com/geoiq/gc_data/blob/master/datasets/25.geojson)), enriched with some additional lines around the European coasts based on [AIS data](https://en.wikipedia.org/wiki/Automatic_identification_system).

- Verbatim from the searoute-py README:

> **Not for routing purposes!** This library was developed to generate realistic-looking sea routes for visualizations of maritime routes, not for mariners to route their ships.

## Licence status (UNVERIFIED — read before shipping in an app)
- searoute-py: no LICENSE file was found in the repository (LICENSE, LICENSE.md, NOTICE all 404); only its `setup.py` says
  `license='Apache-2.0'`. Whether that licence covers the data file is not stated.
- Eurostat SeaRoute: EUPL v1.2 (text included). Whether the network data is covered by it was not checked.
- The upstream data (Oak Ridge National Laboratory, 2000) has its own terms that were not checked.
- The maintainers' own warning above says the network is not for navigation. Treat this as a planning estimate only.
