# World Port Index (NGA Pub. 150) — MIRROR COPY, NOT THE OFFICIAL NGA DOWNLOAD

## Provenance (read this first)
The official NGA page could not be used: https://msi.nga.mil/Publications/WPI was
unreachable (blocked by the session proxy with 403, and reported by the user to be
under maintenance). Per the user's decision, a third-party mirror was used instead.

- Official page (NOT fetched): https://msi.nga.mil/Publications/WPI
- Mirror file URL: https://raw.githubusercontent.com/danteboe/MINE4213-Proyecto/main/resources/world_port_index.csv
- Mirror owner: GitHub user `danteboe`, repo `MINE4213-Proyecto` (a student project, unaffiliated with NGA). Commit not recorded; fetched from branch `main`.
- Stored here as: `world_port_index.csv` (byte-identical to the download)
- SHA-256: 8abb02b33c860a8a0925d5fff9cd3d3fa7533f44a79bc8781d92586fff788eb4
- Download date: 2026-11-25
- Publication edition/date: UNKNOWN. The file carries no edition information and the NGA page was not seen.

## Important limitations
- This is a **reduced extract** of the WPI (7 columns), not the full NGA CSV (which has
  ~100+ columns: depths, pilotage, facilities, etc.). Column names are the mirror's own
  (`INDEX_NO`, `HARBORSIZE`, ...), not NGA's. It cannot be verified against NGA here.
- It may be outdated or edited. Replace it with the official file when msi.nga.mil is back.

## Licence / usage statement
- NGA page: not seen, so no NGA licence/distribution statement could be copied. **None is quoted here.**
- Mirror repo: no LICENSE file (LICENSE and LICENSE.md return 404); its README (first lines only read) says nothing about this file's licence.
- No licence text exists in the data file itself.
- Nothing is paraphrased as if it were NGA's terms. Redistribution terms are therefore UNVERIFIED;
  check the NGA page text before shipping this data inside an app.

## Summary
- Rows: 3669 data rows (3670 lines including header), UTF-8/ASCII, comma-separated, no quoting issues seen.
- Header line:
  `INDEX_NO,PORT_NAME,COUNTRY,LATITUDE,LONGITUDE,HARBORSIZE,HARBORTYPE`
- Notes for the converter: LATITUDE/LONGITUDE are decimal degrees, all rows populated.
  HARBORSIZE codes: V=2153, S=990, M=361, L=160, blank=5 (very small/small/medium/large).
  COUNTRY is a 2-letter code. HARBORTYPE is a 2-letter code (e.g. CN, CB, RB, OR).
