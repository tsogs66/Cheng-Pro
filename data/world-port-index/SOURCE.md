# World Port Index (NGA Pub. 150)

## Source of truth
**`official/WPI.dbf` + `official/WPI.shp`** (shapefile package, unchanged from the zip) is the source of truth.
`world_port_index_MIRROR_superseded.csv` is the old third-party student-project mirror (7 columns, edition unknown, no licence). It is superseded and kept only for comparison; do not build from it.

## Provenance
- Zip file name: `world_port_index.zip` (downloaded by the user to their Windows PC, then committed to the repo root of `main`; commit 861bf61b6ed9fc4ba4f64107a270d8312fff5c14)
- Zip SHA-256: `45f677189f4cfaa0b1b1f219b9ff4c5d73ac0c66524f18acf78cd4756019b487`
- Download date: not recorded by the user's machine (file added to the repo 2026-11-26 07:17 +0800)
- Edition/date found in the package: dBASE header and all member files are dated **2017-03-28**. The zip has no readme or edition statement. The NGA page edition was not seen. Treat as "NGA WPI, file dated 2017-03-28"; this is older than the current NGA release. Verify against https://msi.nga.mil/Publications/WPI.
- Extracted into a fresh folder outside the repo, nothing inside was executed. Files are copied unchanged to `official/`.

## Is it the official full package?
It matches the **full NGA WPI attribute table** (78 fields: depths, pilotage, tugs, cranes, supplies, etc.), distributed as an ESRI shapefile. It is NOT a CSV. It does NOT contain an NGA readme, data dictionary, or licence text. The origin (downloaded from NGA vs. relayed) cannot be proven from the contents.

Contents (SHA-256 of each file in `official/SHA256SUMS.txt`):
WPI.dbf (attributes), WPI.shp / WPI.shx / WPI.sbn / WPI.sbx (geometry+indexes), WPI.prj (WGS84), WPI.cpg (UTF-8).

## Licence / usage statement
The zip contains no licence text. The statement below was supplied by the project owner on 26 Nov 2026 for use in the apps; it was **not independently verified against the NGA website** (msi.nga.mil is not reachable from the cloud session). It is shown in the Sea Distance page, the route options panel and the user guide, in short form on the route-map printout.

> Data Attribution & Disclaimer: Port reference data is derived from the World Port Index (Pub. 150) published by the National Geospatial-Intelligence Agency (NGA) Maritime Safety Information portal (msi.nga.mil), produced as a U.S. Government work (public domain under 17 U.S.C. § 105). Pursuant to 10 U.S.C. § 456, this geospatial information is provided "as is" with no warranty as to accuracy, currency, or completeness. This application is for general informational and planning purposes only—it is not an official NGA navigational product and must not be used for primary navigation or passage planning. Mariners must consult current official nautical charts, Sailing Directions, Notice to Mariners, and local port authorities. In accordance with 10 U.S.C. § 425, reference to NGA data does not imply U.S. Government or NGA endorsement, sponsorship, or affiliation.

Status: public-domain U.S. Government work, so redistribution of the derived port list (`data/ports/ports.json`) is permitted; the attribution and disclaimer above must stay with it.

## Summary
- Rows: 3669 (dBASE record count)
- Columns (78), exact order from the .dbf header:
  `INDEX_NO,REGION_NO,PORT_NAME,COUNTRY,LATITUDE,LONGITUDE,LAT_DEG,LAT_MIN,LAT_HEMI,LONG_DEG,LONG_MIN,LONG_HEMI,PUB,CHART,HARBORSIZE,HARBORTYPE,SHELTER,ENTRY_TIDE,ENTRYSWELL,ENTRY_ICE,ENTRYOTHER,OVERHD_LIM,CHAN_DEPTH,ANCH_DEPTH,CARGODEPTH,OIL_DEPTH,TIDE_RANGE,MAX_VESSEL,HOLDGROUND,TURN_BASIN,PORTOFENTR,US_REP,ETAMESSAGE,PILOT_REQD,PILOTAVAIL,LOC_ASSIST,PILOTADVSD,TUGSALVAGE,TUG_ASSIST,PRATIQUE,SSCC_CERT,QUAR_OTHER,COMM_PHONE,COMM_FAX,COMM_RADIO,COMM_VHF,COMM_AIR,COMM_RAIL,CARGOWHARF,CARGO_ANCH,CARGMDMOOR,CARBCHMOOR,CARICEMOOR,MED_FACIL,GARBAGE,DEGAUSS,DRTYBALLST,CRANEFIXED,CRANEMOBIL,CRANEFLOAT,LIFT_100_,LIFT50_100,LIFT_25_49,LIFT_0_24,LONGSHORE,ELECTRICAL,SERV_STEAM,NAV_EQUIP,ELECREPAIR,PROVISIONS,WATER,FUEL_OIL,DIESEL,DECKSUPPLY,ENG_SUPPLY,REPAIRCODE,DRYDOCK,RAILWAY`
- Example record: INDEX_NO 61090, PORT_NAME SHAKOTAN, COUNTRY RU, LATITUDE 43.866667, LONGITUDE 146.833333. Numeric fields are stored as text like `61090.000000`.
- UN/LOCODE: **not present** (no LOCODE column).
- Country names: **not present**; COUNTRY holds a 2-letter code (e.g. RU).
- Note for the converter: it must read the .dbf (or convert to CSV) and parse the 78 real columns; the old 7-column CSV layout no longer applies.
