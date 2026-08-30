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

| SKU | Seats | Notes |
|-----|-------|--------|
| `voyage-chief` | 1 Android + 1 Windows | Standalone Voyage |
| `tank-chief` | 1 Android + 1 Windows | Standalone Tank |
| `cheng-aio` | 1 Android + 1 Windows | Unlocks Voyage + Tank modules inside AIO |

A ChEng AIO license does **not** auto-activate the standalone EXEs unless you sell a bundle SKU later.

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
`POST /api/license/transfer` — request seat move  
`GET  /api/license/admin/...` — revoke, approve transfer (fleet/support)

Remote URL: `LICENSE_SERVER_URL` (production). Desktop/LXC can host a local license DB for testing.

## Client

All three apps include a small license module that:

1. On boot: load cached entitlement
2. If grace remaining ≤ 7 days and online → heartbeat
3. If no entitlement / grace expired → Activation UI
4. Never block reading local backups while locked (data ownership)

## Rollout

1. Scaffold server + client (this change)
2. Wire Activation UI in ChEng AIO shell
3. Wire Voyage/Tank standalone
4. Production license host + purchase email delivery
5. Admin transfer console
