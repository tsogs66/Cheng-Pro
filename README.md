# Cheng-Pro

All-in-one software for marine chief engineers: **Voyage Chief** + **Tank Chief** under one shell, one Proxmox/Debian server, and shared active vessel.

## What you get (v0.2)

| Surface | URL | Source |
|---------|-----|--------|
| Cheng-Pro shell | `/` | Shared vessel setup + launcher |
| Tank Chief (full) | `/tanks/` | Ported from `tank-management` |
| Voyage Chief (full) | `/voyage/` | Ported from `voyage-manager` |
| Auth + voyage sync | `/api/auth`, `/api/admin`, `/api/voyage`, … | Voyage Python sync-server |
| Tank API | `/tanks/api/…` | Tank Express API |

**Shared:** vessel identity + **active vessel** (Tank store + `chengProActiveVesselId`).  
**Separate:** tank calibration/readings/bunkering vs voyage noon/e-ORB/legs.

## Quick start

```bash
npm install
npm run seed
SYNC_ADMIN_PASSWORD='choose-a-password' SYNC_API_TOKEN='choose-a-token' npm start
# http://0.0.0.0:8080
```

Default seed vessel: from Tank Chief seed (`captain-veniamis` when present).

```bash
npm test                 # gateway + tanks + voyage auth smoke test
npm run android:prepare  # static www-android for Capacitor
```

Admin login (Voyage / Fleet Office): username `admin`, password from `SYNC_ADMIN_PASSWORD`.

## Packaging

| Target | Command / artifact |
|--------|---------------------|
| Windows installer + portable EXE | `npm run dist:win` (electron-builder) → `ChengPro-*.exe` |
| Linux AppImage | `npm run dist:linux` |
| Android APK | `npm run android:apk` (after Android SDK). Release APK is **signed for sideload** — enable “Install unknown apps” for your file manager. If install fails, use Chrome → `http://<server>:8080` → **Add to Home screen** (PWA). |
| CI | `.github/workflows/release.yml` on `v*` tags |

Electron loads the unified gateway locally; portable mode stores data beside the EXE (`cheng-pro-data/`).

## Proxmox / Debian LXC

```bash
curl -fsSL https://raw.githubusercontent.com/tsogs66/Cheng-Pro/main/deploy/proxmox-install.sh | bash
```

Installs Node + Python3, nginx :8080 → gateway, writes `/root/cheng-pro.env` with admin password and API token once.

## Docs

- [docs/UNIFICATION_PLAN.md](docs/UNIFICATION_PLAN.md)
- [docs/VESSEL_CONTRACT.md](docs/VESSEL_CONTRACT.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Layout

```
apps/web/                 Cheng-Pro shell
modules/tanks/            Full Tank Chief (public + server)
modules/voyage/           Voyage SPA (www) + Python sync-server
server/index.js           Unified gateway
desktop/                  Electron wrapper
deploy/proxmox-install.sh Debian/LXC install
```
