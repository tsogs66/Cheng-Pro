# Cheng-Pro

All-in-one software for marine chief engineers: voyage management, tank & bunker management, oil record book, and shared vessel setup.

## Product intent

Cheng-Pro unifies:

- **Voyage Chief** (`voyage-manager`) — noon reports, ROB, consumption, e-ORB, fleet sync
- **Tank Chief** (`tank-management`) — tank sounding, calibration, fuel reports, bunkering

into one client and one Proxmox (Debian LXC) server, with:

- **Shared** vessel identity, active vessel selection, Vessel Setup, and auth
- **Separate** voyage data plane and tank data plane (only ship details are shared)
- Install targets: **Windows browser**, **Windows installer**, **USB portable EXE**, **Android** (phone & tablet, portrait & landscape)

## Status

Planning / architecture phase. Implementation will land in this repository.

| Doc | Contents |
|-----|----------|
| [docs/UNIFICATION_PLAN.md](docs/UNIFICATION_PLAN.md) | Full merge architecture, phases, packaging, success criteria |
| [docs/VESSEL_CONTRACT.md](docs/VESSEL_CONTRACT.md) | Shared vessel schema, API routes, client bridge |

## Design rules (summary)

1. One active vessel serves both modules side by side.
2. Vessel Setup and server fetch are single surfaces for both programs.
3. Tanks and voyage datasets are stored and synced independently under the same vessel id.
4. Server stays Debian on Proxmox LXC; clients remain offline-capable after first enrollment.
