# Licensing & copy control (ChEng AIO / Voyage / Tank)

Per-user software activation with **yearly** or **lifetime** plans, **1 Android + 1 Windows** seat, and a **60-day** online re-check. Designed for ships: apps keep working offline within the grace window.

## Goals

- Stop casual sharing of installers / APKs across crews
- Bound each purchase to one phone + one PC
- Allow lost-device recovery with audit + cooldown (not free unlimited resets)
- Keep Voyage/Tank **sync API tokens** separate from license seats
- Do not require internet every launch (breaks at sea)

## What we do *not* claim

Client-side DRM cannot stop a determined cracker. This system makes unpaid sharing **operationally useless** (seats revoke, grace expires) and gives you admin control.

## Products / SKUs

| SKU | Key prefix | Seats | Notes |
|-----|------------|-------|--------|
| `voyage-chief` | `VC-` | 1 Android + 1 Windows | Standalone Voyage; in AIO unlocks Voyage (+ Performance) only |
| `tank-chief` | `TC-` | 1 Android + 1 Windows | Standalone Tank; in AIO unlocks Tanks only |
| `cheng-aio` | `CA-` | 1 Android + 1 Windows | Unlocks Voyage + Tank + Performance + e-ORB inside AIO; also activates standalone apps |
| `cheng-admin` | `MA-` | 1 Android + 1 Windows | **Master** license: unlocks every product/module; entitlement includes `master: true`. Intended for fleet/admin operators who may access email-scoped customer DBs |

Legacy keys may still use the `CK-` fallback prefix.

**Add-ons:**
- `eorb` — enables Electronic ORB. Included with `cheng-aio` / `cheng-admin`. On `voyage-chief` (or issued with the add-on) unlocks the e-ORB tab / AIO e-ORB menu.
- `master` — same unlock as `cheng-admin` when attached to another SKU; sets `entitlement.master`.

A ChEng AIO or master (`cheng-admin` / `master` add-on) license activates every program. A Voyage or Tank key can be entered in the AIO shell but only opens that program’s modules.

**Email-scoped data:** customer Voyage/Tank databases and sync are keyed by the license email. A master entitlement may present `X-License-Master: 1` (via `ChengLicense.authHeaders()`) so admin tooling can reach those email-scoped DBs; ordinary keys stay limited to their own email.

## Plans

| Plan | Entitlement | Online check |
|------|-------------|--------------|
| Yearly | Expires on `expiresAt` | Must re-check within 60 days; renew before expiry |
| Lifetime | No calendar expiry | Still must re-check within 60 days (anti-share) |

## Seats

- **Android seat** — bound to install/device fingerprint
- **Windows seat** — bound to install/device fingerprint
- Pairing: Android (or account portal) issues a **one-time pairing code** (TTL ~15 min) to bind Windows
- Same credentials on a second phone/PC → rejected until seat transfer

## Lost device / abuse

1. User requests **seat transfer** (in-app or support)
2. Cool-down **14 days** *or* admin override
3. Soft cap: **2 transfers / rolling year**, then admin-only
4. Old seat revoked when new seat activates
5. Audit log: time, IP, device model, transfer reason

## Offline grace (60 days)

On successful activate/heartbeat, client stores a **signed entitlement**:

```json
{
  "licenseId": "...",
  "sku": "cheng-aio",
  "plan": "yearly",
  "email": "ce@example.com",
  "deviceSeat": "windows",
  "issuedAt": "...",
  "checkedAt": "...",
  "expiresAt": null,
  "graceUntil": "...",
  "sig": "..."
}
```

- App runs while `now <= graceUntil` (checkedAt + 60 days) and plan not expired
- When online, heartbeat refreshes `graceUntil`
- When grace lapses → lock to Activation screen (local data remains; export still allowed)

## Sync API keys (unchanged)

Voyage/Tank cloud sync tokens stay vessel/account scoped. License answers “may this install run?”; API token answers “may it sync this vessel?”

## Server

`POST /api/license/activate` — email + license key + device fingerprint + seat  
`POST /api/license/heartbeat` — refresh grace  
`POST /api/license/pair/start` — Android creates pairing code  
`POST /api/license/pair/complete` — Windows redeems code  
`POST /api/license/transfer` — request seat move (cooldown + yearly cap)  
`POST /api/license/issue` — admin: create key (+ email by default)  
`POST /api/license/purchase-webhook` — admin: issue + always email  
`GET/POST /api/license/admin/...` — list, force transfer, revoke, resend, audit  

Admin UI: `/license-admin` (enter `LICENSE_ADMIN_TOKEN` in the page).

### Production license host

Run the license API on a reachable host (same machine as ChEng AIO, or dedicated):

```bash
LICENSE_PORT=8788 \
LICENSE_ADMIN_TOKEN='…' \
LICENSE_SIGNING_SECRET='…' \
LICENSE_ENFORCE=1 \
SMTP_HOST=smtp.example.com SMTP_PORT=587 \
SMTP_USER=… SMTP_PASS=… \
LICENSE_MAIL_FROM='licenses@example.com' \
npm run license-host
```

Or keep using the full ChEng AIO gateway (`npm start`) — it mounts the same `/api/license` routes.

Clients point at the host with:

- AIO / same-origin: `/api/license` (default)
- Standalone Voyage/Tank EXE: `LICENSE_SERVER_URL=https://licenses.example.com` (Tank injects `/js/license-config.js`) or `meta name="license-api"` / `localStorage.chengLicenseApi`

### Email delivery

On issue / purchase-webhook / admin resend:

1. **Webhook** if `LICENSE_MAIL_WEBHOOK_URL` is set (optional `LICENSE_MAIL_WEBHOOK_TOKEN`)
2. Else **SMTP** via nodemailer (`SMTP_HOST` / `LICENSE_SMTP_*`)
3. Always appends to `data/license-mail-outbox.jsonl` as a safety net

## Client

All three apps include the same `license.js` (`ChengLicense`):

1. On boot: load cached entitlement; skip gate when embedded in AIO (`chengaio=1` / parent shell)
2. Fetch `/status` — when `enforce: true`, lock UI until activated
3. If grace remaining ≤ 7 days and online → heartbeat
4. SKU check: product keys are not interchangeable, except `cheng-aio` / `cheng-admin` (master) which unlock every app
5. Helpers: `isMaster`, `licenseEmail`, `authHeaders` (sends `X-License-Email` / `X-License-Master`)

## Hard enforce

- Server: `LICENSE_ENFORCE=1` (default) → `/status` reports `enforce: true`
- Soft/dev: `LICENSE_ENFORCE=0`
- Clients cache the flag after the first successful status fetch

## Admin transfer console

Open `/license-admin` on the license host. With the admin token you can:

- Issue a key and email it
- Search licenses
- Force-clear Android/Windows seats (bypass cooldown)
- Revoke a license
- Re-email a key
- Read the audit log

## Rollout

1. ~~Scaffold server + client~~
2. ~~Wire Activation UI in ChEng AIO shell~~
3. ~~Wire Voyage/Tank standalone (same client)~~
4. ~~Production license host + purchase email delivery~~
5. ~~Admin transfer console~~
6. Point portable/EXE builds at `LICENSE_SERVER_URL` and set `LICENSE_ENFORCE=1` in production
