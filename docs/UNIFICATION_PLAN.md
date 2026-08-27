# Cheng-Pro Unification Plan

Combine **Voyage Chief** (`voyage-manager`) and **Tank Chief** (`tank-management`) into one product for marine chief engineers, shipped from this repository.

## Goals

1. One installable product: Windows browser, Windows installer, USB portable EXE, Android phone/tablet.
2. One shared **vessel registry + active vessel** for both modules.
3. One shared **Vessel Setup** (ship identity + server fetch) that feeds both modules.
4. **Voyage data** and **tank data** stay separate stores and APIs — only ship details are shared.
5. Only the **active vessel** is in working context for both modules at once.
6. Server remains **Proxmox LXC / Debian**; clients stay offline-capable at sea.

## Non-goals (phase 1)

- Rewriting both SPAs into React/Vue from scratch.
- Merging noon-report ROB math with tank sounding math into one calculator.
- Sharing bunker receipts between modules as a single document type (cross-links later).
- Multi-active-vessel parallel editing on one client.

---

## Current state (source products)

| | Voyage Chief | Tank Chief |
|---|---|---|
| UI | Monolith SPA (`voyage_manager.html`) | Modular SPA (`public/`) |
| Local store | IndexedDB `noonReportDB` | IndexedDB + JSON (`store-core`) |
| Server | Python `http.server` + SQLite accounts + JSON voyage legs | Express + JSON vessel folders |
| Auth | Fleet manager / CE sessions, device enrollment, vessel tokens | None |
| Active vessel | Client `activeVesselId` + assignment rules | Global `activeVesselId` in index |
| Deploy | LXC nginx:8080 → API:8787; Capacitor; NSIS/portable | LXC systemd:3080; Electron; Capacitor |
| Domain | Noon logs, ROB, e-ORB, abstracts, receipts | Sounding/calibration, fuel report, bunker plan |

Cheng-Pro today is docs-only (`README.md`). All product code lives in the sibling repos until ported.

---

## Product shape

```
┌─────────────────────────────────────────────────────────────┐
│                     Cheng-Pro Shell                          │
│  Brand · Auth · Active Vessel Switcher · Module Nav          │
├──────────────────────┬──────────────────────────────────────┤
│   Vessel Setup       │  Shared ship identity only            │
│   (one screen)       │  name, IMO, flag, company, DWT, …     │
├──────────────────────┼──────────────────────────────────────┤
│   Voyage module      │  Tank module                          │
│   (own data plane)   │  (own data plane)                     │
│   entries, receipts  │  tanks, readings, calibration         │
│   abstracts, e-ORB   │  fuel report, bunker plan/after       │
└──────────────────────┴──────────────────────────────────────┘
```

**Rule:** Selecting vessel *V* loads shared profile once; Voyage module reads/writes only voyage stores for *V*; Tank module reads/writes only tank stores for *V*. Switching vessel reloads both modules’ working sets from *V*.

---

## Shared vessel contract

### Canonical vessel identity (shared)

Normalize fields from both products into one record:

| Field | Source today | Notes |
|-------|--------------|-------|
| `id` | slug (`mv-harbour-key`, `captain-veniamis`) | Single ID space; migrate dual `v-*` / `mv-*` in Voyage |
| `name` | both | Display name |
| `imo` | both | Digits-only unique on server |
| `callSign` | Tank | Optional |
| `flag` | both | |
| `company` / `owner` | both | Prefer `company`; keep `owner` alias if needed |
| `type` | Tank | Optional |
| `dwt` | both | |
| `notes` | Tank | Optional |
| `assets` | Tank (+ Voyage stamps) | Logo, CE signatures |
| `createdAt` / `updatedAt` | both | |
| Auth extras | Voyage | `token`, assignments — server-side only |

Machinery / voyage-ops fields that Voyage keeps in `setup` today (`flowArr`, MCR, generators, flowmeters, tank *counts* for ROB, etc.) stay in the **Voyage module setup**, not in shared vessel identity.

Tank calibration and tank list stay in the **Tank module**.

### Active vessel

- One `activeVesselId` per client session (and mirrored on server for fleet defaults).
- Shell owns selection UI; both modules subscribe to `ActiveVessel` events.
- On switch: flush dirty buffers → set active → Voyage loads leg set for that id → Tanks load folder for that id.
- Chief engineer accounts remain bound to assigned vessel (Voyage auth model); fleet managers may switch freely.

### Vessel Setup (single surface)

One screen serves both programs:

- Identity fields (shared record)
- Assets (logo / signatures) used by both print paths
- Server connection / fetch (login, claim, pull vessel list, sync health)
- **Does not** edit voyage log setup or tank calibration grids (those stay in each module)

---

## Data planes (strict separation)

```
data/
  settings.json                 # app + sync URL
  vessels-index.json            # { vessels[], activeVesselId }
  vessels/<vesselId>/
    vessel.json                 # SHARED identity only
    assets.json                 # SHARED print assets
    meta.json                   # shared revision / sync watermark (optional)
    voyage/                     # Voyage-only
      setup.json
      entries.json
      receipts.json
      documents.json
      abstracts.json
      print-history.json
      voyage-legs/
      orb-entries.json
    tanks/                      # Tank-only
      tanks.json
      readings.json
      voyage.json               # tank voyage fuel calc (not noon reports)
      bunkering.json
      bunker-plan.json
      bunker-after.json
      bunker-summary.json
      bunker-history.json
      fuel-report.json
      report-history.json
      transfers.json
      bunker-ops.json
```

Server mirrors the same layout under `/var/lib/cheng-pro/data` (or `/opt/cheng-pro/data`).

Voyage sync units remain **voyage number × condition (B|L)** payloads inside `voyage/`.  
Tank sync remains **revision-based vessel tank bundle** inside `tanks/`.

Cross-module reads allowed only of `vessel.json` + `assets.json` (+ active id). No shared writes into the other module’s folder.

---

## Server architecture (Debian LXC)

One container, one public port, one auth stack.

```
nginx :8080
  /                 → static Cheng-Pro shell + modules
  /api/auth/*       → auth service (from Voyage accounts)
  /api/vessels/*    → shared vessel registry + active + claim/import
  /api/admin/*      → Fleet Office
  /api/voyage/*     → voyage sync (Python merge or Node port of same rules)
  /api/tanks/*      → tank Express routes scoped by vessel id
```

### Recommended runtime

| Piece | Choice | Why |
|-------|--------|-----|
| Auth + vessel registry | Keep Voyage SQLite `accounts.db` + `vessels` | Already has roles, assignments, device enrollment |
| Voyage sync | Keep JSON leg merge semantics | Proven offline merge |
| Tank API | Keep Express + `store-core` under `/api/tanks` | Proven calc/import surface |
| Gateway | nginx on LXC | Same Proxmox pattern both products already use |
| Process model | `cheng-pro-auth` + `cheng-pro-voyage` + `cheng-pro-tanks` **or** one Node gateway that embeds tank store and proxies/auth-wraps voyage | Prefer **one Node gateway** long-term; phase 1 can run two backends behind nginx with shared auth middleware |

Phase 1 pragmatic path:

1. Port Voyage `accounts.py` vessel table into a **shared vessel service** (Python or Node).
2. Mount Tank Express under `/api/tanks` with auth middleware that validates the same session.
3. Mount Voyage sync under `/api/voyage` with the same session.
4. On vessel create/rename/IMO change in shared API, update both indexes; never invent a second vessel list.

Phase 2: single Node (or single Python) process owning all three route trees and one data root.

### Auth applied to tanks

Tank Chief has no auth today. Cheng-Pro must wrap tank APIs:

- Same session / CE assignment rules as Voyage (read historical vessels; write only current assignment).
- Fleet manager full access.
- Device enrollment unlocks offline shell for both modules.

---

## Client architecture

### Shell

- Top/side navigation: **Voyage · Tanks · Vessel Setup · Fleet Office** (role-gated).
- Persistent **Active Vessel** control (name + IMO); switching is the only vessel context change.
- Shared theme tokens (maritime, readable outdoors) with bright mode retained from Voyage.
- PWA service worker caches shell + both module asset graphs.

### Module hosting (phase 1)

Avoid a big-bang rewrite:

1. Extract Voyage SPA into `apps/web/modules/voyage/` (split CSS/JS from monolith over time).
2. Extract Tank SPA into `apps/web/modules/tanks/`.
3. Shell loads modules; injects `ChengPro.vessel` bridge:

```js
// Conceptual bridge API
ChengPro.vessel.getActive()      // shared identity
ChengPro.vessel.subscribe(fn)    // switch events
ChengPro.vessel.list()           // registry (auth-scoped)
ChengPro.auth.session()
ChengPro.api.fetch(path, opts)   // attaches session headers
```

Modules keep their own IndexedDB / local stores keyed by `vesselId`, but **must not** keep a private vessel picker as source of truth. Local pickers become read-only mirrors of shell active vessel.

### Offline

- First online login enrolls device (Voyage model) → unlocks both modules offline.
- Voyage mutations queue in voyage stores; tank mutations queue in tank stores.
- Sync push/pull is per-plane against `/api/voyage` and `/api/tanks`; vessel identity syncs via `/api/vessels`.

---

## UI / responsive targets

Must work as first-class layouts (not afterthoughts):

| Target | Layout rules |
|--------|--------------|
| Windows desktop browser | Full sidebar or top tabs; dense tables OK |
| Android phone portrait | Bottom nav + More sheet; 44px targets; single-column forms |
| Android phone landscape | Compact top/bottom chrome; tables scroll horizontally |
| Tablet portrait | Collapsible sidebar; two-column forms where useful |
| Tablet landscape | Sidebar + main; near-desktop density |

Shared breakpoints (align both CSS systems):

- `≤640` phone
- `≤960` large phone / small tablet
- `≤1100` tablet / small laptop
- `>1100` desktop

Safe-area insets for notched phones; print styles stay A4 for both report families.

---

## Client packaging

| Artifact | Approach |
|----------|----------|
| Windows installer | Electron or existing NSIS pattern wrapping local static + optional local API |
| USB portable EXE | electron-builder portable / existing Voyage portable pipeline unified |
| Android APK | One Capacitor app `com.chengpro.app` (or keep brand id), webDir = unified shell |
| PWA | Installable from browser against LXC URL |

Desktop portable mode:

- Local data under portable folder or `%APPDATA%\cheng-pro` (installer) / USB sibling `data/`.
- Can run fully offline; sync when `syncUrl` reachable.
- Tank Python import helpers: ship with desktop runtime only (Android keeps 501 for PDF/Excel server features, same as today).

---

## Migration strategy

### Phase 0 — Plan & contracts (this doc)

- Freeze shared vessel schema + API paths.
- Decide ID migration: prefer Tank-style slugs; map Voyage `v-*` → slug via `vessel.slug` / IMO.

### Phase 1 — Monorepo skeleton in cheng-pro

```
cheng-pro/
  apps/web/                 # shell
  modules/voyage/           # vendored then cleaned Voyage assets
  modules/tanks/            # vendored then cleaned Tank assets
  server/                   # gateway + auth + route mounts
  deploy/proxmox/           # one LXC install/update script
  desktop/                  # Electron / portable
  android/                  # Capacitor
  docs/
```

- Import code from both repos (git subtree or copy with HISTORY note).
- Implement shell + shared vessel API + auth gate on tank routes.
- Dual-run: existing product URLs can remain available as `/legacy/voyage` and `/legacy/tanks` during transition.

### Phase 2 — Single vessel UX

- Remove duplicate vessel pickers; wire both modules to shell active vessel.
- Unify Vessel Setup screen; strip identity fields from module-local setup UIs (leave machinery / tanks where they belong).
- One Proxmox install script creating CT `cheng-pro`.

### Phase 3 — Packaging

- Single Windows installer + portable EXE + Android APK CI.
- One README install path for engineers and fleet office.

### Phase 4 — Hardening

- Cross-module links (e.g. open Tank fuel report from Voyage ROB date) without merging stores.
- Backup format `cheng-pro-backup` that includes `vessel.json` + `voyage/` + `tanks/` per ship.
- Automated Playwright matrix: desktop, phone portrait, tablet landscape.

---

## Essential features to preserve

### From Voyage Chief

- Noon / log entries, ROB chain, bunker receipts, bunker survey corrections
- Voyage abstract, range totals, consumption, e-ORB
- Fleet Office, assignments, device enrollment / offline unlock
- Ship time / clock change handling
- Sync merge with tombstones

### From Tank Chief

- Multi-tank calibration (trim/list, volume curves)
- Sounding calc + ASTM 54B VCF / WCF
- Fuel oil (tank condition) report + history
- Bunker plan / after / summary
- PDF/Excel/CSV import (desktop/server)
- Voyage fuel calculation (tank planning — separate from noon voyage)

### Shared

- Multi-vessel registry, active vessel, identity + assets
- Offline-first clients, Proxmox Debian server, Windows + Android + portable

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Dual vessel ID schemes | Migration map by IMO; one slug PK; deprecate internal `v-*` |
| Auth gap on tanks | Mandatory session middleware before exposing tank APIs on shared host |
| Monolith Voyage HTML size | Host as module first; split files incrementally |
| Conflicting “voyage” naming | Namespace: `voyage/*` = noon product; `tanks/voyage.json` = tank fuel planning |
| Portable EXE + Python OCR size | Optional “full” desktop build; slim portable without OCR |
| UI inconsistency | Shared CSS variables + shell chrome; module interiors can retain look until themed |

---

## Success criteria

1. Engineer logs in once, sees one vessel list, sets one active vessel.
2. Voyage and Tank screens both show that vessel’s name/IMO; editing identity in Vessel Setup updates both.
3. Voyage data changes never rewrite tank calibration/readings; tank changes never rewrite noon entries.
4. LXC Debian install brings up one URL serving shell + both APIs.
5. Same build family produces Windows installer, portable EXE, and Android APK with usable phone portrait and tablet landscape layouts.
6. Offline unlock after first enrollment works for both modules on that device.

---

## Immediate next implementation steps

1. ~~Scaffold `apps/web` shell with vessel switcher stub and module placeholders.~~
2. ~~Add `server` with `/api/vessels` + auth mounts for `/api/voyage` and `/api/tanks`.~~
3. ~~Tank plane under `vessels/<id>/tanks/` (+ calc endpoint).~~
4. ~~Voyage plane under `vessels/<id>/voyage/` (+ leg merge sync).~~
5. ~~Proxmox script `deploy/proxmox-install.sh`.~~
6. ~~Responsive shell (desktop / phone bottom-nav / tablet landscape).~~
7. Port full Tank Chief UI (fuel report, bunkering, PDF/Excel import) into Tanks module.
8. Port full Voyage Chief SPA (noon math, e-ORB, Fleet Office) into Voyage module.
9. Voyage-grade auth (assignments, device enrollment) enforced on writes.
10. Windows installer + portable EXE + Android Capacitor packaging.
