# Deployment sketch (Proxmox LXC)

Target end-state for Cheng-Pro server install. Scripts will replace the separate Voyage/Tank CT installers.

## Container

| Item | Value |
|------|--------|
| Host | Proxmox VE |
| Template | Debian 12 standard |
| Suggested CT resources | 2 vCPU, 2 GB RAM, 16 GB disk (headroom for both data planes) |
| App path | `/opt/cheng-pro` |
| Data path | `/opt/cheng-pro/data` (or `/var/lib/cheng-pro`) |
| Public port | `8080` (nginx) |

## Processes

- **nginx** — static shell + `/api/` reverse proxy
- **cheng-pro** service(s) — auth/vessels + voyage sync + tanks API

Phase 1 may run voyage (Python :8787) and tanks (Node :3080) behind nginx with a shared auth gate. Phase 2 collapses to one service.

## Client installs (unchanged intent)

| Client | Notes |
|--------|--------|
| Windows browser | Point at `http://<ct-ip>:8080` or tunnel URL |
| Windows installer | Local app + local data; optional sync URL |
| Portable EXE | Run from USB; data beside EXE or configured path |
| Android APK | Capacitor WebView; phone portrait + tablet landscape tested |

## Preserve on upgrade

- `data/vessels/**`
- `accounts.db` (auth)
- TLS/tunnel config if any

Never seed-overwrite production vessel folders during `update`.
