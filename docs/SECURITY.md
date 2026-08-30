/**
 * Security notes — ChEng AIO / Voyage Chief / Tank Chief
 *
 * Last review: 2026-08-30 (pre-release hardening on this branch).
 * Client-side license UI is not DRM. Treat networked hosts as needing secrets.
 */

# Security analysis (2026-08-30)

## Scope

Cheng-Pro (AIO gateway + license + embedded Voyage/Tank), voyage-manager sync-server,
tank-management API/sync.

## Findings (before hardening on this branch)

### Critical
1. **Spoofable tenant headers** — `X-License-Email` / `X-License-Master` trusted without a signed entitlement → cross-tenant read/write on shared hosts.
2. **Unauthenticated tank sync** — `GET/POST /api/sync/export|import` had no inbound auth.
3. **Voyage sync open by default** — unset/`change-me-in-production` `SYNC_API_TOKEN` granted full access.
4. **License admin open without token** — issue/admin allowed when `LICENSE_ADMIN_TOKEN` unset outside `NODE_ENV=production`.
5. **Forgeable client entitlement** — UI trusts localStorage; must not be the only control for data APIs.

### High
6. Reflected CORS + anonymous mutating APIs (CSRF from ship Wi‑Fi).
7. SSRF via peer sync URL (probe/pull/push).
8. Local file path on excel import (`body.path`).
9. Vessel id path traversal (`../../`).
10. Default signing / sync secrets.
11. Pairing code / seat transfer without rate limits.
12. Stored XSS sinks in Voyage ORB browse (unescaped fields).

### Medium / Low
13. Voyage email slug rejected `@` (isolation mismatch vs tanks).
14. Health/status info disclosure.
15. Embed flags skip client license UI (expected DRM limit).

## Hardening shipped with this release

| Item | Change |
|------|--------|
| Tenant headers | Scoped access requires `X-License-Entitlement` (base64 JSON) with **verified HMAC**; master/email must match the entitlement |
| License admin | **Always** requires `LICENSE_ADMIN_TOKEN` (no open issue in any mode) |
| Tank sync | Inbound export/import require `Authorization: Bearer` matching `SYNC_API_TOKEN` / `TMS_SYNC_TOKEN` when configured or in production |
| Voyage sync | Open mode only if `SYNC_ALLOW_OPEN=1`; default/`change-me` no longer grants admin |
| Vessel ids | Rejected unless safe slug pattern |
| Excel import | `body.path` rejected — upload only |
| Voyage email scope | Emails slugified like tanks (`user-at-domain`) |

## Residual risk (documented, not fully eliminated)

- **Client DRM** can still be patched locally; ship data security depends on network placement and sync/license secrets.
- **Peer sync SSRF** — tighten further with host allowlists in a follow-up if the gateway is internet-facing.
- **ORB XSS** — escape remaining `innerHTML` sinks in a follow-up pass.
- **CORS** — prefer an origin allowlist in production via `CORS_ORIGINS`.

## Operator checklist

```bash
# Required on any networked license / AIO host
LICENSE_ADMIN_TOKEN=<long random>
LICENSE_SIGNING_SECRET=<long random>
LICENSE_REQUIRE_ADMIN=1
SYNC_API_TOKEN=<long random>
# Do NOT set SYNC_ALLOW_OPEN=1 on shared hosts
```

Single-laptop offline use remains the lowest-risk deployment.
