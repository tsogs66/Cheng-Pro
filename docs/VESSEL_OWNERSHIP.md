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

| Source backup | ChEng AIO behaviour |
|---------------|---------------------|
| `noon-report-*-v1` (Voyage) | Import identity into shell vessel; voyage ops stay in Voyage store |
| `vessel-fuel-tms-backup` (Tank) | Import / match by IMO; tank data stays in Tank store |
| AIO shell vessel | Source of truth while using the suite |

## Active vessel

One `activeVesselId` in the shell. Embedded Voyage and Tank follow it. Standalone apps keep their own fleet pickers.
