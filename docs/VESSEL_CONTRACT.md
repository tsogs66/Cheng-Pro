# Shared Vessel & API Contract

Contracts for Cheng-Pro so Voyage and Tank modules share ship identity only.

## Active vessel rule

- Exactly one `activeVesselId` in client working context.
- Both modules load data **only** for that id after a switch completes.
- Server may store a fleet-default active id; assignment rules still restrict CE write access.

## `vessel.json` (shared)

```json
{
  "id": "mv-harbour-key",
  "name": "MV HARBOUR KEY",
  "imo": "9123456",
  "callSign": "XXXX",
  "flag": "PA",
  "company": "Example Shipping",
  "type": "Bulk Carrier",
  "dwt": 82000,
  "notes": "",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Not in shared file (module-owned):

- Voyage: flowmeters, MCR/SFOC, generators, ROB tank counts, voyage number/condition, noon entries.
- Tanks: tank list, calibration grids, readings, bunker plan, fuel report.

## `assets.json` (shared)

```json
{
  "vesselLogo": null,
  "chEngSignatures": {}
}
```

Used by both print pipelines.

## `vessels-index.json`

```json
{
  "vessels": [
    { "id": "mv-harbour-key", "name": "MV HARBOUR KEY", "imo": "9123456", "updatedAt": "..." }
  ],
  "activeVesselId": "mv-harbour-key",
  "updatedAt": "..."
}
```

## HTTP routes (target)

### Shared

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Combined health |
| POST | `/api/auth/login` | Session |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | |
| POST | `/api/auth/devices` | Enroll offline device |
| POST | `/api/auth/device-login` | Offline unlock |
| GET | `/api/vessels` | Registry (auth-scoped) |
| POST | `/api/vessels` | Create vessel identity |
| GET | `/api/vessels/:id` | Shared identity + assets meta |
| PUT | `/api/vessels/:id` | Update identity |
| POST | `/api/vessels/active` | Set active vessel |
| POST | `/api/vessels/claim` | CE claim empty ship |
| POST | `/api/vessels/import` | Register unknown ship (pending review) |
| GET/POST | `/api/admin/*` | Fleet Office |

### Voyage-only

| Method | Path | Purpose |
|--------|------|---------|
| GET/PUT | `/api/voyage/:vessel/:voyage/:condition` | Leg sync |
| GET | `/api/voyage/:vessel` | List voyages |

Payload remains Voyage Chief merge document (`setup`, `entries`, `receipts`, …) stored under `vessels/:id/voyage/`.

### Tank-only

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/tanks/:vesselId` | Full tank bundle |
| PUT | `/api/tanks/:vesselId/:part` | Part update |
| POST | `/api/tanks/:vesselId/calculate` | Sounding calc |
| … | import/export/bunker/fuel-report | Existing Tank Chief routes remounted under `/api/tanks` |

All tank routes require the same session headers as voyage routes.

## Client bridge

```js
window.ChengPro = {
  vessel: {
    getActive(): Vessel | null,
    setActive(id: string): Promise<void>,
    list(): Promise<VesselSummary[]>,
    subscribe(listener: (v: Vessel | null) => void): () => void,
  },
  auth: {
    session(): Session | null,
  },
  api: {
    fetch(path: string, init?: RequestInit): Promise<Response>,
  },
};
```

Modules must:

1. Not persist a competing active vessel id as source of truth.
2. Namespace local DB keys with `vesselId`.
3. On `subscribe` fire, rebuild UI from that vessel’s module store (empty state if none).

## ID migration

1. Prefer slug ids already used on server (`mv-…`, `captain-veniamis`).
2. Voyage internal `v-*` ids map via `slug` or IMO match during import.
3. After migration, one id is used in index, auth assignments, voyage paths, and tank folders.
