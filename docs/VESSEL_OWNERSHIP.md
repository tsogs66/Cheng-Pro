# Vessel particulars ownership

## Decision (agreed direction)

**ChEng AIO Vessel Setup** is the single editor for **shared ship identity** when running the suite.

| Owned by ChEng AIO (shared) | Stays in Voyage Chief | Stays in Tank Chief |
|-----------------------------|----------------------|---------------------|
| Name, IMO, call sign, flag | Opening ROB / fuel & lube types | Tank list & calibration |
| Company / owner, type, DWT | Voyage no., ports, condition | Soundings, bunker plan |
| Notes, vessel stamp/logo (shared assets) | Flowmeters, noon entries, e-ORB ops | Fuel report voyage header |
| Engine basis used by Performance Calc | ORB equipment / IOPP tank lists | |

## Important correction (standalone products)

Do **not** delete Vessel Setup from standalone Voyage Chief or Tank Chief.

- Standalone buyers still need to enter ship identity without ChEng AIO.
- When the module runs **inside ChEng AIO**, identity fields are **read-only / hidden** and show “Managed in ChEng AIO → Vessel Setup”.
- Saves in AIO push identity into Voyage IndexedDB + Tank `vessel.json` (existing bridges).

## Backups

| Source backup | Behaviour |
|---------------|-----------|
| `noon-report-db-v1` / `noon-report-vessel-v1` (Voyage) | Native Voyage formats. AIO may import identity into the shell vessel; voyage ops stay in the Voyage store. Standalone Voyage Chief restores these files unchanged. |
| `vessel-fuel-tms-backup` (Tank) | Native Tank format. AIO may match by IMO; tank data stays in the Tank store. Standalone Tank Chief restores these files unchanged. |
| AIO shell vessel | Source of truth for shared identity while using the suite. |
| `cheng-aio-suite-v1` (AIO entire-program) | Wrapper with `tank` + `voyage` halves. Standalone Tank Chief restores `suite.tank`; standalone Voyage Chief restores `suite.voyage`. |

## Active vessel

One `activeVesselId` in the shell. Embedded Voyage and Tank follow it. Standalone apps keep their own fleet pickers.

## Standalone backup compatibility

Vessel Setup centralization in ChEng AIO does **not** change backup formats.

- Standalone **Tank Chief** still exports/imports `vessel-fuel-tms-backup` and still has its own Vessel Setup when not embedded.
- Standalone **Voyage Chief** still exports/imports `noon-report-db-v1` / `noon-report-vessel-v1` and still has its own Vessel Data when not embedded.
- Files produced inside ChEng AIO for Tank or Voyage use those same native formats, so they open in the standalone apps.
- Entire-program suite files (`cheng-aio-suite-v1`) can also be opened in a standalone app: Tank reads `suite.tank`, Voyage reads `suite.voyage` (same native payloads as single-program backups).
