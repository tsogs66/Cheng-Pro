# Cheng-Pro

All-in-one software for marine chief engineers: voyage management, tank & bunker management, oil record book, and shared vessel setup.

## What works now (v0.1)

Unified shell + server in this repo:

- **One active vessel** drives Voyage and Tanks together
- **Vessel Setup** is the only shared identity surface (name, IMO, flag, company, …)
- **Separate data planes** under each vessel:
  - `data/vessels/<id>/vessel.json` + `assets.json` — shared
  - `data/vessels/<id>/tanks/` — tank plane
  - `data/vessels/<id>/voyage/` — voyage plane (+ `legs/` sync packs)
- Responsive UI for desktop, phone (bottom nav), tablet landscape
- Proxmox/Debian install script: `deploy/proxmox-install.sh`

Full architecture: [docs/UNIFICATION_PLAN.md](docs/UNIFICATION_PLAN.md) · contract: [docs/VESSEL_CONTRACT.md](docs/VESSEL_CONTRACT.md)

## Quick start

```bash
npm install
npm run seed
npm start
# http://0.0.0.0:8080
```

```bash
npm test   # smoke test (temp data dir)
```

Default seed vessel: **MV DEMO HARBOUR** (active).

## API (phase 1)

| Area | Paths |
|------|--------|
| Health | `GET /api/health`, `GET /api/status` |
| Shared vessels | `GET/POST /api/vessels`, `POST /api/vessels/active`, `GET/PUT/DELETE /api/vessels/:id` |
| Tanks | `GET /api/tanks/:vesselId`, tank CRUD, `POST …/calculate`, `PUT …/:part` |
| Voyage | `GET /api/voyage/:vesselId`, `PUT …/:part`, `GET/PUT …/:voyage/:B\|L` |
| Auth | `POST /api/auth/login` (optional; open mode by default) |

## Deploy (Proxmox LXC / Debian)

Inside the container as root:

```bash
curl -fsSL https://raw.githubusercontent.com/tsogs66/Cheng-Pro/main/deploy/proxmox-install.sh | bash
```

Or copy `deploy/proxmox-install.sh` into the CT and run it. Listens on **:8080** (nginx → Node :8787).

## Roadmap

1. ~~Scaffold shell + shared vessel + dual planes~~ (this release)
2. Port full Tank Chief UI/calc/import into the Tanks module
3. Port full Voyage Chief SPA/e-ORB into the Voyage module
4. Voyage-grade auth (assignments, device enrollment) on all routes
5. Windows installer + portable EXE + Android APK
