#!/usr/bin/env python3
"""Self-hosted sync server for Voyage Chief.

Stores voyage snapshots as JSON files under:
  <DATA_DIR>/<vessel>/<voyageNo>/<CONDITION>.json
  or, when X-License-Email is sent:
  <DATA_DIR>/users/<email-slug>/<vessel>/<voyageNo>/<CONDITION>.json

Each voyage number is a folder; B (ballast) and L (laden) legs are separate files
so records stay short and can be pulled independently. Voyage condition is only B or L.

Designed to run behind Cloudflare Tunnel or nginx on a Linux server.
Can optionally serve the static PWA files from the same process
(set SYNC_STATIC_DIR to the app root).

API:
  GET  /api/health
  GET  /api/voyage/<vessel>                              — list voyage folders + conditions
  GET  /api/voyage/<vessel>/<voyage>                     — list conditions for one voyage
  GET  /api/voyage/<vessel>/<voyage>/<B|L>               — pull leg snapshot
  PUT  /api/voyage/<vessel>/<voyage>/<B|L>               — push / merge leg snapshot

Legacy flat files <voyage>-<CONDITION>.json are still readable and listed.

Auth: Authorization: Bearer <SYNC_API_TOKEN>
      With SYNC_API_TOKEN unset the server has no secret to check and accepts every
      request; /api/health reports tokenConfigured:false so clients can say so.
"""

from __future__ import annotations

import hmac
import json
import mimetypes
import os
import re
import secrets
import sys
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
import threading
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
from accounts import (  # noqa: E402
    ROLE_ADMIN,
    ROLE_VESSEL,
    canonical_role,
    generate_password,
    AccountError,
    AccountStore,
)

# Per-request license email → data/users/<email-slug>/…
_request_ctx = threading.local()


def current_license_email() -> Optional[str]:
    return getattr(_request_ctx, "email", None)


def email_slug(email: str) -> str:
    """Match tank emailSlug: user@x.com -> user-x-com."""
    s = re.sub(r"[^a-z0-9]+", "-", (email or "").strip().lower())
    s = s.strip("-")[:64]
    return s or "anonymous"


def bind_request_license_email(handler: BaseHTTPRequestHandler) -> None:
    """Scope vessel files under users/<email>/ when X-License-Email is set.

    Master (X-License-Master: 1) may pass X-Act-As-User to open another account.
    Master without act-as keeps the legacy unscoped DATA_DIR root.
    """
    master = (handler.headers.get("X-License-Master") or "").strip() == "1"
    act_as = (handler.headers.get("X-Act-As-User") or "").strip().lower()
    email = (handler.headers.get("X-License-Email") or "").strip().lower()
    if master and act_as:
        _request_ctx.email = act_as
    elif master:
        _request_ctx.email = None
    else:
        _request_ctx.email = email or None


DATA_DIR = Path(os.environ.get("SYNC_DATA_DIR", "./sync-data"))
DEFAULT_API_TOKEN = "change-me-in-production"
_raw_token = os.environ.get("SYNC_API_TOKEN", DEFAULT_API_TOKEN)
API_TOKEN = _raw_token
ALLOW_OPEN_SYNC = os.environ.get("SYNC_ALLOW_OPEN", "").strip() == "1"
# No SYNC_API_TOKEN reached the process: the server has no secret to check against.
# Open sync is opt-in via SYNC_ALLOW_OPEN=1 (closed by default for safety).
TOKEN_CONFIGURED = bool(API_TOKEN) and API_TOKEN != DEFAULT_API_TOKEN
OPEN_SYNC = (not TOKEN_CONFIGURED) and ALLOW_OPEN_SYNC
HOST = os.environ.get("SYNC_HOST", "0.0.0.0")
PORT = int(os.environ.get("SYNC_PORT", "8787"))
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("SYNC_ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]
STATIC_DIR = Path(os.environ["SYNC_STATIC_DIR"]).resolve() if os.environ.get("SYNC_STATIC_DIR") else None
ACCOUNTS_DB = Path(os.environ.get("SYNC_ACCOUNTS_DB", str(DATA_DIR / "accounts.db")))
ADMIN_USER = os.environ.get("SYNC_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("SYNC_ADMIN_PASSWORD", "")
ACCOUNTS = AccountStore(ACCOUNTS_DB)

SLUG_RE = re.compile(r"^[a-zA-Z0-9._-]{1,64}$")
COND_RE = re.compile(r"^(B|L|BALLAST|LADEN|LOADED)$", re.IGNORECASE)
LIST_KEYS = ("entries", "receipts", "documents", "abstracts", "printHistory")
LEGACY_COND_SUFFIX = re.compile(
    r"^(?P<voyage>.+)-(?P<cond>B|L|BALLAST|LADEN|LOADED)$", re.IGNORECASE
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_slug(value: str) -> str:
    value = unquote(value or "").strip()
    if not SLUG_RE.match(value):
        raise ValueError("invalid slug")
    return value


def safe_condition(value: str) -> str:
    """Canonical voyage condition: B (ballast) or L (laden/loaded) only."""
    value = unquote(value or "").strip().upper()
    if not COND_RE.match(value):
        raise ValueError("invalid condition — use B or L only")
    if value in ("L", "LADEN", "LOADED"):
        return "L"
    return "B"


def vessel_dir(vessel: str, email: str | None = None) -> Path:
    """Vessel folder. With license email scope, nest under users/<email-slug>/."""
    if email is None:
        email = current_license_email()
    root = DATA_DIR
    if email:
        root = DATA_DIR / "users" / email_slug(email)
    return root / safe_slug(vessel)


def voyage_dir(vessel: str, voyage: str, email: str | None = None) -> Path:
    return vessel_dir(vessel, email) / safe_slug(voyage)


def voyage_leg_path(vessel: str, voyage: str, condition: str, email: str | None = None) -> Path:
    return voyage_dir(vessel, voyage, email) / f"{safe_condition(condition)}.json"


def legacy_flat_path(vessel: str, voyage: str, condition: str, email: str | None = None) -> Path:
    """Old layout: <vessel>/<voyage>-<CONDITION>.json"""
    return vessel_dir(vessel, email) / f"{safe_slug(voyage)}-{safe_condition(condition)}.json"


def resolve_leg_path(vessel: str, voyage: str, condition: str, email: str | None = None) -> Path:
    """Prefer B.json/L.json; fall back to legacy BALLAST/LADEN names and flat files."""
    cond = safe_condition(condition)
    folder = voyage_leg_path(vessel, voyage, cond, email)
    if folder.exists():
        return folder
    # Legacy full-word filenames inside voyage folder
    legacy_word = {"B": "BALLAST", "L": "LADEN"}[cond]
    word_path = voyage_dir(vessel, voyage, email) / f"{legacy_word}.json"
    if word_path.exists():
        return word_path
    legacy = legacy_flat_path(vessel, voyage, cond, email)
    if legacy.exists():
        return legacy
    legacy_flat_word = vessel_dir(vessel, email) / f"{safe_slug(voyage)}-{legacy_word}.json"
    if legacy_flat_word.exists():
        return legacy_flat_word
    return folder


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    send_cors(handler)
    handler.end_headers()
    handler.wfile.write(body)


def send_cors(handler: BaseHTTPRequestHandler) -> None:
    origin = handler.headers.get("Origin", "")
    if "*" in ALLOWED_ORIGINS:
        handler.send_header("Access-Control-Allow-Origin", "*")
    elif origin in ALLOWED_ORIGINS:
        handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, If-None-Match, X-Device-Id, X-Device-Name, X-Session-Token, X-License-Email, X-License-Master, X-Act-As-User, X-License-Entitlement",
    )
    handler.send_header("Access-Control-Expose-Headers", "ETag")
    handler.send_header("Access-Control-Max-Age", "86400")


def read_leg_meta(path: Path, voyage_number: str, condition: str) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "voyageNumber": voyage_number,
            "condition": condition,
            "voyageKey": f"{voyage_number}-{condition}",
            "updatedAt": None,
            "entryCount": 0,
        }
    entries = ((data.get("data") or data).get("entries")) or []
    return {
        "voyageNumber": data.get("voyageNumber") or voyage_number,
        "condition": safe_condition(data.get("condition") or condition),
        "voyageKey": data.get("voyageKey") or f"{voyage_number}-{condition}",
        "updatedAt": data.get("updatedAt") or data.get("serverUpdatedAt"),
        "deviceId": data.get("deviceId"),
        "deviceName": data.get("deviceName"),
        "serverUpdatedAt": data.get("serverUpdatedAt"),
        "entryCount": len(entries) if isinstance(entries, list) else 0,
    }


def list_voyages(vessel: str) -> list[dict]:
    """Return voyage folders with available BALLAST/LADEN legs."""
    root = vessel_dir(vessel)
    if not root.exists():
        return []

    by_voyage: dict[str, dict] = {}

    def add_leg(voyage_number: str, condition: str, path: Path) -> None:
        voyage_number = safe_slug(voyage_number)
        condition = safe_condition(condition)
        bucket = by_voyage.setdefault(
            voyage_number,
            {"voyageNumber": voyage_number, "conditions": {}},
        )
        meta = read_leg_meta(path, voyage_number, condition)
        bucket["conditions"][condition] = meta

    for path in sorted(root.iterdir()):
        if path.is_dir():
            voyage_number = path.name
            if not SLUG_RE.match(voyage_number):
                continue
            for cond_file in sorted(path.glob("*.json")):
                cond = cond_file.stem.upper()
                if COND_RE.match(cond):
                    add_leg(voyage_number, safe_condition(cond), cond_file)
        elif path.suffix == ".json":
            # Legacy flat: voyageNo-CONDITION.json or bare voyageKey.json
            m = LEGACY_COND_SUFFIX.match(path.stem)
            if m:
                add_leg(m.group("voyage"), m.group("cond"), path)
            else:
                # Unknown legacy key — expose as voyage with UNKNOWN skipped;
                # try to parse trailing condition from voyageSyncKey style.
                stem = path.stem
                for cond in ("B", "L", "BALLAST", "LADEN"):
                    suffix = f"-{cond}"
                    if stem.upper().endswith(suffix):
                        add_leg(stem[: -len(suffix)], cond, path)
                        break

    out: list[dict] = []
    for voyage_number in sorted(by_voyage.keys()):
        bucket = by_voyage[voyage_number]
        conditions = [
            bucket["conditions"][c]
            for c in ("B", "L")
            if c in bucket["conditions"]
        ]
        # include any other unexpected conditions last
        for c, meta in bucket["conditions"].items():
            if c not in ("B", "L"):
                conditions.append(meta)
        latest = max((c.get("updatedAt") or "" for c in conditions), default="")
        out.append(
            {
                "voyageNumber": voyage_number,
                "voyageKey": voyage_number,
                "conditions": conditions,
                "hasBallast": any(c["condition"] == "B" for c in conditions),
                "hasLaden": any(c["condition"] == "L" for c in conditions),
                "updatedAt": latest or None,
            }
        )
    return out


def list_conditions(vessel: str, voyage: str) -> list[dict]:
    voyages = {v["voyageNumber"]: v for v in list_voyages(vessel)}
    voyage = safe_slug(voyage)
    if voyage not in voyages:
        return []
    return voyages[voyage]["conditions"]


class SyncHandler(BaseHTTPRequestHandler):
    server_version = "NoonReportSync/1.5"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{utc_now()}] {self.address_string()} {fmt % args}")

    def do_OPTIONS(self) -> None:
        bind_request_license_email(self)
        self.send_response(HTTPStatus.NO_CONTENT)
        send_cors(self)
        self.end_headers()

    def _bearer(self) -> str:
        auth = self.headers.get("Authorization", "")
        if auth[:7].lower() == "bearer ":
            return auth[7:].strip()
        return ""

    def _principal(self) -> dict:
        """Who is calling, and which vessels they may touch.

        Four ways in, most specific first:
          session   a login from /api/auth/login — admin sees every vessel,
                    a vessel user sees exactly one
          vessel    the derived per-vessel token, good for that vessel's sync only
          master    the legacy shared SYNC_API_TOKEN — full access, kept so
                    existing single-token installs keep working untouched
          open      no token configured at all; the server guards nothing

        Returns {"kind", "vesselId"|None, "role", "username"|None, "reason"}.
        reason is set only when the caller is rejected.
        """
        token = self._bearer()
        session_header = self.headers.get("X-Session-Token", "").strip()

        session = ACCOUNTS.get_session(session_header or token)
        if session:
            if session["role"] == ROLE_ADMIN:
                # The fleet manager sees the whole database.
                return {"kind": "session", "role": session["role"],
                        "username": session["username"], "vesselId": None,
                        "readable": None, "writable": None, "reason": ""}
            # A chief engineer reads every ship he has sailed, writes only the
            # one he is on now.
            username = session["username"]
            return {
                "kind": "session",
                "role": session["role"],
                "username": username,
                "vesselId": ACCOUNTS.current_vessel(username),
                "readable": set(ACCOUNTS.readable_vessels(username)),
                "writable": ACCOUNTS.current_vessel(username),
                "reason": "",
            }

        if token:
            vessel = ACCOUNTS.get_vessel_by_token(token)
            if vessel:
                return {
                    "kind": "vessel", "role": ROLE_VESSEL, "username": None,
                    "vesselId": vessel["vesselId"],
                    "readable": {vessel["vesselId"]}, "writable": vessel["vesselId"],
                    "reason": "",
                }

        if not TOKEN_CONFIGURED:
            if ALLOW_OPEN_SYNC:
                return {"kind": "open", "role": ROLE_ADMIN, "username": None, "vesselId": None,
                        "readable": None, "writable": None, "reason": ""}
            return {"kind": "none", "role": "", "username": None, "vesselId": None,
                    "readable": set(), "writable": None,
                    "reason": "token_required"}

        if not token:
            return {"kind": "none", "role": "", "username": None, "vesselId": None,
                    "readable": set(), "writable": None, "reason": "missing_token"}

        if hmac.compare_digest(
            self.headers.get("Authorization", "").encode("latin-1", "replace"),
            f"Bearer {API_TOKEN}".encode("utf-8"),
        ):
            return {"kind": "master", "role": ROLE_ADMIN, "username": None, "vesselId": None,
                    "readable": None, "writable": None, "reason": ""}

        return {"kind": "none", "role": "", "username": None, "vesselId": None,
                "readable": set(), "writable": None, "reason": "token_mismatch"}

    def _authorize_vessel(self, vessel: str, write: bool = False) -> dict | None:
        """Principal for a request about one vessel, or None after replying 4xx.

        Reading is allowed for any ship in the caller's service history; writing
        only for the ship they are assigned to right now. A relieved engineer
        keeps his records but can no longer change them.
        """
        principal = self._principal()
        if principal["reason"]:
            self._reject_unauthorized(principal["reason"])
            return None

        readable = principal.get("readable")
        if readable is None:          # fleet manager, master token, or open mode
            return principal

        if write:
            if principal.get("writable") != vessel:
                current = principal.get("writable")
                json_response(
                    self, HTTPStatus.FORBIDDEN,
                    {"error": "forbidden", "reason": "not_current_vessel",
                     "message": (
                         f"This login may only write to the vessel it is currently "
                         f"assigned to ({current or 'none'}), not '{vessel}'."
                         if current else
                         f"This login is not assigned to any vessel, so it cannot "
                         f"write to '{vessel}'.")},
                )
                return None
            return principal

        if vessel not in readable:
            json_response(
                self, HTTPStatus.FORBIDDEN,
                {"error": "forbidden", "reason": "wrong_vessel",
                 "message": (
                     f"This login has never been assigned to '{vessel}', so its "
                     f"records are not available.")},
            )
            return None
        return principal

    def _require_admin(self) -> dict | None:
        principal = self._principal()
        if principal["reason"]:
            self._reject_unauthorized(principal["reason"])
            return None
        if principal["role"] != ROLE_ADMIN:
            json_response(
                self,
                HTTPStatus.FORBIDDEN,
                {"error": "forbidden", "reason": "admin_only",
                 "message": "This action needs an administrator login."},
            )
            return None
        return principal

    def _auth_reason(self) -> str:
        """'' when the request may proceed, otherwise why it may not."""
        # Keep in sync with _principal(): open sync is opt-in (SYNC_ALLOW_OPEN=1).
        if OPEN_SYNC:
            return ""
        if not TOKEN_CONFIGURED:
            return "token_required"
        auth = self.headers.get("Authorization", "")
        if not auth:
            return "missing_token"
        # Compare wire bytes. http.server decodes headers as latin-1, so a non-ASCII
        # token arrives mojibake and never matches the str it was set from; re-encoding
        # as latin-1 recovers the bytes the client actually sent.
        sent = auth.encode("latin-1", "replace")
        expected = f"Bearer {API_TOKEN}".encode("utf-8")
        if hmac.compare_digest(sent, expected):
            return ""
        return "token_mismatch"

    def _authorized(self) -> bool:
        return self._auth_reason() == ""

    def _reject_unauthorized(self, reason: str | None = None) -> None:
        reason = reason or self._auth_reason()
        json_response(
            self,
            HTTPStatus.UNAUTHORIZED,
            {
                "error": "unauthorized",
                "reason": reason,
                "message": (
                    "No Authorization header was sent; the app needs the API token."
                    if reason == "missing_token"
                    else (
                        "This sync server requires SYNC_API_TOKEN (or SYNC_ALLOW_OPEN=1 for a lab-only open server)."
                        if reason == "token_required"
                        else "The bearer token does not match this server's SYNC_API_TOKEN."
                    )
                ),
            },
        )

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def _serve_static(self, parsed_path: str) -> bool:
        if STATIC_DIR is None:
            return False
        rel = unquote(parsed_path).lstrip("/")
        if not rel or rel.endswith("/"):
            rel = "voyage_manager.html"
        candidate = (STATIC_DIR / rel).resolve()
        try:
            candidate.relative_to(STATIC_DIR)
        except ValueError:
            return False
        if not candidate.is_file():
            return False
        data = candidate.read_bytes()
        ctype = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        send_cors(self)
        self.end_headers()
        self.wfile.write(data)
        return True

    def do_GET(self) -> None:
        bind_request_license_email(self)
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "noon-report-sync",
                    "version": "1.5",
                    "time": utc_now(),
                    "static": bool(STATIC_DIR),
                    "layout": "vessel/voyageNo/CONDITION.json",
                    # False = SYNC_API_TOKEN never reached this process.
                    # authRequired is still true unless SYNC_ALLOW_OPEN=1 (closed by default).
                    "tokenConfigured": TOKEN_CONFIGURED,
                    "authRequired": not OPEN_SYNC,
                    "openSync": OPEN_SYNC,
                    # True once any account exists: the app should show its login
                    # screen instead of asking for a bare sync token.
                    "accountsEnabled": not ACCOUNTS.is_empty(),
                    "loginRequired": ACCOUNTS.has_admin(),
                },
            )
            return

        parts = [p for p in parsed.path.strip("/").split("/") if p]

        if parts == ["api", "auth", "me"]:
            principal = self._principal()
            if principal["reason"] or principal["kind"] not in ("session", "vessel"):
                self._reject_unauthorized("missing_token")
                return
            vessel = (
                ACCOUNTS.get_vessel(principal["vesselId"]) if principal["vesselId"] else None
            )
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "ok": True,
                    "username": principal["username"],
                    "role": principal["role"],
                    "vessel": self._vessel_public(vessel, include_token=True),
                    "history": self._readable_fleet(principal),
                },
            )
            return

        if parts == ["api", "admin", "vessels"]:
            if self._require_admin() is None:
                return
            json_response(
                self,
                HTTPStatus.OK,
                {"ok": True,
                 "vessels": [self._vessel_public(v, True) for v in ACCOUNTS.list_vessels()]},
            )
            return

        # Any signed-in user may see the fleet register (no tokens). An unassigned
        # engineer uses this list to claim the ship he joined, instead of minting one.
        if parts == ["api", "vessels"]:
            principal = self._principal()
            if principal["reason"] or principal["kind"] != "session":
                self._reject_unauthorized("missing_token")
                return
            json_response(
                self,
                HTTPStatus.OK,
                {"ok": True,
                 "vessels": [self._vessel_public(v, False) for v in ACCOUNTS.list_vessels()]},
            )
            return

        if parts == ["api", "admin", "vessels", "pending"]:
            if self._require_admin() is None:
                return
            json_response(self, HTTPStatus.OK,
                          {"ok": True,
                           "vessels": [self._vessel_public(v, True) for v in ACCOUNTS.pending_vessels()]})
            return

        if parts == ["api", "admin", "accounts"]:
            if self._require_admin() is None:
                return
            json_response(self, HTTPStatus.OK, {"ok": True, "accounts": ACCOUNTS.list_accounts()})
            return

        if parts == ["api", "auth", "devices"]:
            principal = self._principal()
            if principal["reason"] or principal["kind"] != "session":
                self._reject_unauthorized("missing_token")
                return
            json_response(
                self, HTTPStatus.OK,
                {"ok": True, "devices": ACCOUNTS.list_devices(principal["username"])},
            )
            return

        if parts == ["api", "admin", "devices"]:
            if self._require_admin() is None:
                return
            who = parse_qs(urlparse(self.path).query).get("username", [None])[0]
            json_response(
                self, HTTPStatus.OK,
                {"ok": True, "devices": ACCOUNTS.list_devices(who)},
            )
            return

        if len(parts) == 4 and parts[:3] == ["api", "admin", "crew"]:
            if self._require_admin() is None:
                return
            json_response(self, HTTPStatus.OK,
                          {"ok": True, "crew": ACCOUNTS.vessel_crew(safe_slug(parts[3]))})
            return

        # An engineer's own service record. A fleet manager may read anyone's.
        if len(parts) >= 3 and parts[:2] == ["api", "assignments"]:
            principal = self._principal()
            if principal["reason"]:
                self._reject_unauthorized(principal["reason"])
                return
            who = parts[2] if len(parts) > 2 else principal["username"]
            if principal["role"] != ROLE_ADMIN and who != principal["username"]:
                json_response(self, HTTPStatus.FORBIDDEN,
                              {"error": "forbidden", "reason": "not_your_record",
                               "message": "You may only read your own assignment history."})
                return
            json_response(self, HTTPStatus.OK,
                          {"ok": True, "username": who,
                           "assignments": ACCOUNTS.assignment_history(username=who)})
            return

        if len(parts) >= 2 and parts[0] == "api" and parts[1] == "voyage":
            try:
                requested_vessel = safe_slug(parts[2]) if len(parts) >= 3 else ""
            except ValueError:
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
                return
            # Authorize against the vessel in the path: a vessel login may only
            # reach its own ship, an admin login any of them.
            if self._authorize_vessel(requested_vessel) is None:
                return
            try:
                if len(parts) == 3:
                    vessel = safe_slug(parts[2])
                    json_response(
                        self,
                        HTTPStatus.OK,
                        {"ok": True, "vesselId": vessel, "voyages": list_voyages(vessel)},
                    )
                    return
                if len(parts) == 4:
                    vessel = safe_slug(parts[2])
                    voyage = safe_slug(parts[3])
                    # Could be legacy pull of voyageKey "22-F-BALLAST" OR list conditions
                    legacy = LEGACY_COND_SUFFIX.match(voyage)
                    if legacy:
                        path = resolve_leg_path(
                            vessel, legacy.group("voyage"), legacy.group("cond")
                        )
                        return self._send_leg_file(path)
                    json_response(
                        self,
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "vesselId": vessel,
                            "voyageNumber": voyage,
                            "conditions": list_conditions(vessel, voyage),
                        },
                    )
                    return
                if len(parts) == 5:
                    path = resolve_leg_path(parts[2], parts[3], parts[4])
                    return self._send_leg_file(path)
            except ValueError:
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
                return

        if self._serve_static(parsed.path):
            return

        json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def _send_leg_file(self, path: Path) -> None:
        if not path.exists():
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        data = json.loads(path.read_text(encoding="utf-8"))
        etag = data.get("serverUpdatedAt") or data.get("updatedAt") or ""
        if etag and self.headers.get("If-None-Match") == etag:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            send_cors(self)
            self.end_headers()
            return
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if etag:
            self.send_header("ETag", etag)
        send_cors(self)
        self.end_headers()
        self.wfile.write(body)

    # ------------------------------------------------------------ auth API

    def _vessel_public(self, vessel: dict | None, include_token: bool) -> dict | None:
        """A vessel for the app. The token is only ever handed to someone who
        already proved they are entitled to it."""
        if not vessel:
            return None
        out = {
            "vesselId": vessel["vesselId"],
            "vesselName": vessel["vesselName"],
            "imo": vessel["imo"],
            "company": vessel["company"],
            "pendingReview": bool(vessel.get("pendingReview")),
            "createdBy": vessel.get("createdBy") or "",
        }
        if vessel.get("chiefEngineer") is not None:
            out["chiefEngineer"] = vessel.get("chiefEngineer") or ""
        if include_token:
            out["token"] = vessel["token"]
        return out


    def _readable_fleet(self, principal: dict) -> list:
        """Ships this caller may read: the fleet for a manager, the engineer's
        service history otherwise."""
        if principal.get("role") == ROLE_ADMIN:
            return [self._vessel_public(v, False) for v in ACCOUNTS.list_vessels()]
        out = []
        for vessel_id in sorted(principal.get("readable") or []):
            vessel = ACCOUNTS.get_vessel(vessel_id)
            if vessel:
                out.append(self._vessel_public(vessel, False))
        return out

    def do_POST(self) -> None:
        bind_request_license_email(self)
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        try:
            body = self._read_json()
        except (ValueError, json.JSONDecodeError):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid JSON body"})
            return

        try:
            if parts == ["api", "auth", "login"]:
                return self._handle_login(body)
            if parts == ["api", "auth", "logout"]:
                return self._handle_logout()
            if parts == ["api", "auth", "password"]:
                return self._handle_password_change(body)
            if parts == ["api", "auth", "devices"]:
                return self._handle_enroll_device(body)
            if parts == ["api", "auth", "device-login"]:
                return self._handle_device_login(body)
            if parts == ["api", "admin", "vessels"]:
                return self._handle_create_vessel(body)
            if parts == ["api", "admin", "token-preview"]:
                return self._handle_token_preview(body)
            if parts == ["api", "admin", "accounts"]:
                return self._handle_create_account(body)
            if parts == ["api", "admin", "assign"]:
                return self._handle_assign(body)
            if parts == ["api", "admin", "release"]:
                return self._handle_release(body)
            if parts == ["api", "admin", "devices", "revoke"]:
                return self._handle_revoke_device(body)
            if parts == ["api", "admin", "vessels", "approve"]:
                if self._require_admin() is None:
                    return
                vessel = ACCOUNTS.approve_vessel(str(body.get("vesselId", "")))
                return json_response(self, HTTPStatus.OK,
                                     {"ok": True, "vessel": self._vessel_public(vessel, True)})
            if parts == ["api", "vessels", "import"]:
                return self._handle_vessel_import(body)
            if parts == ["api", "vessels", "claim"]:
                return self._handle_claim_vessel(body)
        except AccountError as err:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})
            return

        json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_DELETE(self) -> None:
        bind_request_license_email(self)
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        try:
            if len(parts) == 4 and parts[:3] == ["api", "admin", "vessels"]:
                if self._require_admin() is None:
                    return
                ACCOUNTS.delete_vessel(safe_slug(parts[3]))
                json_response(self, HTTPStatus.OK, {"ok": True, "deleted": parts[3]})
                return
            if len(parts) == 4 and parts[:3] == ["api", "admin", "accounts"]:
                principal = self._require_admin()
                if principal is None:
                    return
                if principal.get("username") == parts[3].strip().lower():
                    json_response(
                        self,
                        HTTPStatus.BAD_REQUEST,
                        {"error": "You cannot delete the account you are logged in with"},
                    )
                    return
                ACCOUNTS.delete_account(parts[3])
                json_response(self, HTTPStatus.OK, {"ok": True, "deleted": parts[3]})
                return
        except AccountError as err:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})
            return
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
            return

        json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def _login_payload(self, account: dict) -> dict:
        session = ACCOUNTS.create_session(account["username"])
        current = ACCOUNTS.current_vessel(account["username"]) or account.get("vessel_id")
        vessel = ACCOUNTS.get_vessel(current) if current else None
        return {
            "ok": True,
            "sessionToken": session["sessionToken"],
            "expiresAt": session["expiresAt"],
            "username": account["username"],
            "role": canonical_role(account["role"]),
            "vessel": self._vessel_public(vessel, include_token=True),
            "history": self._readable_fleet({
                "role": canonical_role(account["role"]),
                "username": account["username"],
                "readable": set(ACCOUNTS.readable_vessels(account["username"])),
            }),
        }

    def _handle_login(self, body: dict) -> None:
        username = str(body.get("username", ""))
        password = str(body.get("password", ""))
        account = ACCOUNTS.verify_password(username, password)
        if not account:
            json_response(
                self,
                HTTPStatus.UNAUTHORIZED,
                {"error": "unauthorized", "reason": "bad_credentials",
                 "message": "Username or password is incorrect."},
            )
            return
        json_response(self, HTTPStatus.OK, self._login_payload(account))

    def _handle_enroll_device(self, body: dict) -> None:
        """Bind this laptop to the signed-in chief engineer.

        The device generates a random secret and keeps the only plaintext copy.
        A bare vessel token must not enroll a laptop — the token already grants
        sync, and letting it also mint a device would make it a master key.
        """
        principal = self._principal()
        if principal["reason"]:
            self._reject_unauthorized(principal["reason"])
            return
        if principal["kind"] != "session":
            json_response(
                self, HTTPStatus.FORBIDDEN,
                {"error": "forbidden", "reason": "session_required",
                 "message": "A device is enrolled only after a signed-in password login."},
            )
            return
        if principal["role"] == ROLE_ADMIN:
            json_response(
                self, HTTPStatus.FORBIDDEN,
                {"error": "forbidden", "reason": "engineer_only",
                 "message": "Fleet manager accounts are not enrolled on a device."},
            )
            return
        device = ACCOUNTS.enroll_device(
            username=principal["username"],
            device_id=str(body.get("deviceId", "")),
            secret=str(body.get("secret", "")),
            label=str(body.get("label", "")),
        )
        json_response(self, HTTPStatus.OK, {"ok": True, "device": device})

    def _handle_device_login(self, body: dict) -> None:
        account = ACCOUNTS.verify_device(
            str(body.get("deviceId", "")), str(body.get("secret", ""))
        )
        if not account:
            json_response(
                self,
                HTTPStatus.UNAUTHORIZED,
                {"error": "unauthorized", "reason": "device_revoked",
                 "message": "This device is not enrolled, or the office has revoked it."},
            )
            return
        json_response(self, HTTPStatus.OK, self._login_payload(account))

    def _handle_revoke_device(self, body: dict) -> None:
        if self._require_admin() is None:
            return
        device = ACCOUNTS.revoke_device(str(body.get("deviceId", "")))
        json_response(self, HTTPStatus.OK, {"ok": True, "device": device})

    def _handle_claim_vessel(self, body: dict) -> None:
        """An unassigned engineer joins a ship that is already on the register."""
        principal = self._principal()
        if principal["reason"] or principal["kind"] != "session":
            self._reject_unauthorized("missing_token")
            return
        if principal["role"] == ROLE_ADMIN:
            json_response(
                self, HTTPStatus.FORBIDDEN,
                {"error": "forbidden", "reason": "engineer_only",
                 "message": "Post an engineer from Fleet Office, do not claim a ship as manager."},
            )
            return
        if ACCOUNTS.current_vessel(principal["username"]):
            json_response(
                self, HTTPStatus.BAD_REQUEST,
                {"error": "Already assigned to a vessel — ask the office to transfer you",
                 "reason": "already_assigned"},
            )
            return
        occupant = ACCOUNTS.current_engineer(str(body.get("vesselId", "")))
        if occupant and occupant != principal["username"]:
            vessel = ACCOUNTS.get_vessel(str(body.get("vesselId", "")))
            name = (vessel or {}).get("vesselName") or str(body.get("vesselId", ""))
            json_response(
                self, HTTPStatus.CONFLICT,
                {"error": "ship_occupied", "reason": "ship_occupied",
                 "message": (
                     f"{name} already has a chief engineer ({occupant}). "
                     "Ask the office to assign you."
                 ),
                 "chiefEngineer": occupant},
            )
            return
        out = ACCOUNTS.claim_vessel(principal["username"], str(body.get("vesselId", "")))
        vessel = ACCOUNTS.get_vessel(out["vesselId"])
        json_response(
            self, HTTPStatus.OK,
            {"ok": True, "assignment": out,
             "vessel": self._vessel_public(vessel, include_token=True)},
        )

    def _handle_logout(self) -> None:
        token = self.headers.get("X-Session-Token", "").strip() or self._bearer()
        ACCOUNTS.delete_session(token)
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _handle_password_change(self, body: dict) -> None:
        """Only the fleet manager changes passwords.

        A chief engineer cannot change his own. The password is generated so the
        first sign-in (and any replacement laptop) cannot be a weak one picked for
        convenience. After that the laptop unlocks by device enrollment, not by
        retyping it. Resets go through the office, which is also where a crew
        change is handled.
        """
        principal = self._principal()
        if principal["reason"] or principal["kind"] != "session":
            self._reject_unauthorized("missing_token")
            return
        if principal["role"] != ROLE_ADMIN:
            json_response(
                self, HTTPStatus.FORBIDDEN,
                {"error": "forbidden", "reason": "manager_only",
                 "message": "Only the fleet manager can change a password. "
                            "Ask the office for a reset."},
            )
            return

        target = str(body.get("username", "")).strip().lower() or principal["username"]
        account = ACCOUNTS.get_account(target)
        if not account:
            raise AccountError(f"No account '{target}'")

        # Changing your own still needs the current one, so a walked-away session
        # cannot lock the office out of its own account.
        if target == principal["username"]:
            if not ACCOUNTS.verify_password(target, str(body.get("currentPassword", ""))):
                json_response(
                    self, HTTPStatus.UNAUTHORIZED,
                    {"error": "unauthorized", "message": "Current password is incorrect."},
                )
                return

        # A chief engineer's replacement is generated too — a reset that let the
        # office type one in would reopen what generation closed.
        if canonical_role(account["role"]) != ROLE_ADMIN:
            new_password = generate_password()
            ACCOUNTS.set_password(target, new_password)
            json_response(self, HTTPStatus.OK,
                          {"ok": True, "username": target, "password": new_password,
                           "generated": True})
            return

        ACCOUNTS.set_password(target, str(body.get("newPassword", "")))
        json_response(self, HTTPStatus.OK, {"ok": True, "username": target, "generated": False})

    def _handle_token_preview(self, body: dict) -> None:
        """The key generator: what token would this vessel name + IMO produce?"""
        if self._require_admin() is None:
            return
        token = ACCOUNTS.derive_token(
            str(body.get("vesselName", "")), str(body.get("imo", ""))
        )
        json_response(
            self,
            HTTPStatus.OK,
            {"ok": True, "token": token, "vesselId": None},
        )

    def _handle_create_vessel(self, body: dict) -> None:
        if self._require_admin() is None:
            return
        vessel = ACCOUNTS.upsert_vessel(
            vessel_name=str(body.get("vesselName", "")),
            imo=str(body.get("imo", "")),
            company=str(body.get("company", "")),
            vessel_id=(str(body.get("vesselId", "")).strip() or None),
        )
        account = None
        username = str(body.get("username", "")).strip()
        if username:
            account_role = canonical_role(str(body.get("role", ROLE_VESSEL)))
            account = ACCOUNTS.create_account(
                username, str(body.get("password", "")), account_role, vessel["vesselId"],
                generate=(account_role != ROLE_ADMIN),
            )
            # Open the assignment period too. accounts.vessel_id alone is not a
            # posting: reads and writes are decided by the assignments table, so
            # without this the new engineer could not touch his own ship.
            ACCOUNTS.assign_vessel(
                username, vessel["vesselId"],
                assigned_by=(self._principal().get("username") or "fleet_manager"),
                note="created with vessel",
            )
        json_response(
            self,
            HTTPStatus.OK,
            {"ok": True, "vessel": self._vessel_public(vessel, include_token=True),
             "account": account},
        )

    def _handle_create_account(self, body: dict) -> None:
        if self._require_admin() is None:
            return
        principal = self._principal()
        role = canonical_role(str(body.get("role", ROLE_VESSEL)))
        vessel_id = str(body.get("vesselId", "")).strip() or None
        if role != ROLE_ADMIN and vessel_id and not ACCOUNTS.get_vessel(vessel_id):
            raise AccountError(f"No vessel '{vessel_id}' is registered")
        # A chief engineer's password is generated, never chosen by the office. These
        # credentials end up on a laptop that sails and can be attacked offline, so
        # the one thing that must not happen is a weak password picked for
        # convenience. The plaintext comes back once, in this response.
        account = ACCOUNTS.create_account(
            str(body.get("username", "")), str(body.get("password", "")), role, vessel_id,
            generate=(role != ROLE_ADMIN),
        )
        # A ship may be named now, or left empty for the engineer to enter when he
        # joins. If one is named, open the assignment period too — accounts.vessel_id
        # alone is not a posting, and without this the new engineer could not write
        # to the very ship he was just given.
        if role != ROLE_ADMIN and vessel_id:
            ACCOUNTS.assign_vessel(
                account["username"], vessel_id,
                assigned_by=(principal.get("username") or "fleet_manager"),
                note="created with account",
            )
            # Re-reading the row would drop the generated password — it lives only
            # in the create call's return value, and this response is its one
            # chance to reach the office.
            refreshed = ACCOUNTS.get_account(account["username"])
            if refreshed:
                refreshed = dict(refreshed)
                if account.get("password"):
                    refreshed["password"] = account["password"]
                account = refreshed
        json_response(self, HTTPStatus.OK,
                      {"ok": True, "account": account,
                       "vessel": self._vessel_public(
                           ACCOUNTS.get_vessel(vessel_id) if vessel_id else None, False)})


    def _handle_assign(self, body: dict) -> None:
        """Post an engineer to a ship. Re-posting is the transfer: the previous
        assignment is closed in the same transaction, so there is never a moment
        where an engineer is on two ships or none. If the target already has a
        live chief engineer, that person is signed off — one CE per ship."""
        principal = self._require_admin()
        if principal is None:
            return
        out = ACCOUNTS.assign_vessel(
            username=str(body.get("username", "")),
            vessel_id=str(body.get("vesselId", "")),
            assigned_by=principal.get("username") or "fleet_manager",
            note=str(body.get("note", "")),
        )
        json_response(self, HTTPStatus.OK, {"ok": True, "assignment": out})

    def _handle_release(self, body: dict) -> None:
        if self._require_admin() is None:
            return
        ACCOUNTS.release_vessel(str(body.get("username", "")))
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _handle_vessel_import(self, body: dict) -> None:
        """Register a ship that is not in the database yet, from local data.

        A fleet manager may register anything. A chief engineer may register a
        ship that does not exist — that is how a device with local records for an
        unlisted vessel gets it into the fleet — and is posted to it immediately,
        but the vessel is flagged pending_review so the manager sees it appeared
        from a ship rather than from the office. Neither may quietly overwrite an
        existing registration: vessel identity is the manager's to change.
        """
        principal = self._principal()
        if principal["reason"] or principal["kind"] != "session":
            self._reject_unauthorized("missing_token")
            return

        imo = str(body.get("imo", ""))
        existing = None
        try:
            existing = ACCOUNTS.get_vessel_by_imo(imo)
        except AccountError:
            raise

        is_manager = principal["role"] == ROLE_ADMIN
        if existing and not is_manager:
            json_response(
                self, HTTPStatus.CONFLICT,
                {"error": "already_registered", "reason": "already_registered",
                 "message": (
                     f"IMO {existing['imo']} is already registered as "
                     f"'{existing['vesselName']}'. Ask the fleet manager to change "
                     f"vessel details."),
                 "vessel": self._vessel_public(existing, include_token=False)},
            )
            return

        vessel = ACCOUNTS.upsert_vessel(
            vessel_name=str(body.get("vesselName", "")),
            imo=imo,
            company=str(body.get("company", "")),
            vessel_id=(str(body.get("vesselId", "")).strip() or None),
            created_by=principal["username"] or "",
            pending_review=not is_manager,
        )
        assignment = None
        if not is_manager:
            assignment = ACCOUNTS.assign_vessel(
                principal["username"], vessel["vesselId"],
                assigned_by=principal["username"], note="self-registered from local data",
            )
        json_response(
            self, HTTPStatus.OK,
            {"ok": True, "created": existing is None,
             "vessel": self._vessel_public(vessel, include_token=True),
             "assignment": assignment},
        )

    def do_PUT(self) -> None:
        bind_request_license_email(self)
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        if not (parts and parts[0] == "api" and parts[1] == "voyage"):
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        try:
            requested_vessel = safe_slug(parts[2]) if len(parts) >= 3 else ""
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
            return
        if self._authorize_vessel(requested_vessel, write=True) is None:
            return

        try:
            if len(parts) == 5:
                vessel, voyage, condition = parts[2], parts[3], parts[4]
                path = voyage_leg_path(vessel, voyage, condition)
            elif len(parts) == 4:
                # Legacy: /api/voyage/<vessel>/<voyageNo-CONDITION>
                vessel = parts[2]
                legacy = LEGACY_COND_SUFFIX.match(parts[3])
                if not legacy:
                    json_response(
                        self,
                        HTTPStatus.BAD_REQUEST,
                        {
                            "error": "use /api/voyage/<vessel>/<voyageNo>/<B|L>"
                        },
                    )
                    return
                voyage = legacy.group("voyage")
                condition = legacy.group("cond")
                path = voyage_leg_path(vessel, voyage, condition)
            else:
                json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            condition = safe_condition(condition)
            voyage = safe_slug(voyage)
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
            return

        try:
            incoming = self._read_json()
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid json"})
            return

        existing = None
        # Prefer folder file; also merge from legacy flat if only that exists
        read_path = resolve_leg_path(parts[2] if len(parts) >= 3 else vessel, voyage, condition)
        if read_path.exists():
            existing = json.loads(read_path.read_text(encoding="utf-8"))

        device_name = self.headers.get("X-Device-Name") or incoming.get("deviceName")
        if device_name:
            incoming["deviceName"] = str(device_name)[:128]
        device_id = self.headers.get("X-Device-Id") or incoming.get("deviceId")
        if device_id:
            incoming["deviceId"] = str(device_id)[:64]

        incoming["voyageNumber"] = voyage
        incoming["condition"] = condition
        incoming["voyageKey"] = f"{voyage}-{condition}"

        merged = merge_snapshots(existing, incoming)
        merged["voyageNumber"] = voyage
        merged["condition"] = condition
        merged["voyageKey"] = f"{voyage}-{condition}"
        merged["serverUpdatedAt"] = utc_now()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
        json_response(self, HTTPStatus.OK, merged)


def merge_snapshots(server: dict | None, client: dict) -> dict:
    """Merge by record id, keeping the newest updatedAt per item. Honour delete tombstones."""
    if not server:
        return client

    server_data = server.get("data") or server
    client_data = client.get("data") or client

    deleted = merge_deleted_maps(
        server_data.get("deletedIds"),
        client_data.get("deletedIds"),
    )

    merged = {
        "vesselId": client.get("vesselId") or server.get("vesselId"),
        "voyageNumber": client.get("voyageNumber") or server.get("voyageNumber"),
        "condition": client.get("condition") or server.get("condition"),
        "voyageKey": client.get("voyageKey") or server.get("voyageKey"),
        "updatedAt": max(
            server.get("updatedAt") or "",
            client.get("updatedAt") or "",
        ),
        "deviceId": client.get("deviceId") or server.get("deviceId"),
        "deviceName": client.get("deviceName") or server.get("deviceName"),
        "data": {},
    }

    for key in ("setup",) + LIST_KEYS:
        server_items = server_data.get(key)
        client_items = client_data.get(key)

        if key == "setup":
            merged["data"]["setup"] = newer_setup(server_items, client_items)
            continue

        if not isinstance(server_items, list) and not isinstance(client_items, list):
            merged["data"][key] = client_items or server_items
            continue

        items = merge_lists_by_id(server_items or [], client_items or [])
        gone = set(deleted.get(key) or [])
        if gone:
            items = [i for i in items if i.get("id") not in gone]
        merged["data"][key] = items

    merged["data"]["deletedIds"] = deleted
    return merged


def merge_deleted_maps(a: dict | None, b: dict | None) -> dict:
    out: dict[str, list] = {k: [] for k in LIST_KEYS}
    for src in (a or {}, b or {}):
        for key in LIST_KEYS:
            vals = src.get(key) or []
            if isinstance(vals, list):
                out[key].extend(str(v) for v in vals if v)
    for key in LIST_KEYS:
        seen: list[str] = []
        for v in out[key]:
            if v not in seen:
                seen.append(v)
        out[key] = seen[-500:]
    return out


def newer_setup(server_setup: dict | None, client_setup: dict | None) -> dict:
    server_setup = server_setup or {}
    client_setup = client_setup or {}
    server_ts = (server_setup.get("sync") or {}).get("lastModifiedAt") or ""
    client_ts = (client_setup.get("sync") or {}).get("lastModifiedAt") or ""
    return client_setup if client_ts >= server_ts else server_setup


def merge_lists_by_id(server_items: list, client_items: list) -> list:
    by_id: dict[str, dict] = {}
    for item in server_items:
        if isinstance(item, dict) and item.get("id"):
            by_id[item["id"]] = item
    for item in client_items:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        prev = by_id.get(item["id"])
        if not prev or record_ts(item) >= record_ts(prev):
            by_id[item["id"]] = item
    return list(by_id.values())


def record_ts(item: dict) -> str:
    return (
        item.get("updatedAt")
        or item.get("savedAt")
        or item.get("uploadedAt")
        or item.get("printedAt")
        or ""
    )


def bootstrap_admin() -> None:
    """Create the first administrator, once.

    With SYNC_ADMIN_PASSWORD set, that password is used. Without it, one is
    generated and printed — the only time it is ever shown, since only its hash
    is stored. A database that already has an admin is left alone, so a restart
    never resets anyone's password.
    """
    if ACCOUNTS.has_admin():
        return
    password = ADMIN_PASSWORD
    generated = False
    if not password:
        password = secrets.token_urlsafe(12)
        generated = True
    try:
        ACCOUNTS.ensure_admin(ADMIN_USER, password)
    except AccountError as err:
        print(f"WARNING: could not create the admin account: {err}")
        return
    print("=" * 78)
    print("Created the administrator account for the vessel database:")
    print(f"  username: {ADMIN_USER}")
    if generated:
        print(f"  password: {password}")
        print("  ^ shown once only — store it now. Set SYNC_ADMIN_PASSWORD to choose your own.")
    else:
        print("  password: (from SYNC_ADMIN_PASSWORD)")
    print("=" * 78)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    bootstrap_admin()
    ACCOUNTS.purge_expired_sessions()
    httpd = ThreadingHTTPServer((HOST, PORT), SyncHandler)
    print(f"Voyage Chief sync server listening on http://{HOST}:{PORT}")
    print(f"Data directory: {DATA_DIR.resolve()}")
    print("Layout: <data>/<vessel>/<voyageNo>/<B|L>.json  (B=ballast, L=laden)")
    if STATIC_DIR:
        print(f"Serving static PWA from: {STATIC_DIR}")
    if not TOKEN_CONFIGURED:
        print("*" * 78)
        if OPEN_SYNC:
            print("WARNING: SYNC_ALLOW_OPEN=1 — this server accepts EVERY request.")
            print("         Lab/LAN only. Prefer SYNC_API_TOKEN=<secret> in production.")
        else:
            print("WARNING: SYNC_API_TOKEN is not set — sync API is CLOSED (401).")
            print("         Set SYNC_API_TOKEN=<secret> for clients, or SYNC_ALLOW_OPEN=1")
            print("         only for a trusted lab/single-ship LAN with no public URL.")
        print("*" * 78)
    print("Cloudflare Tunnel example:")
    print(f"  cloudflared tunnel --url http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
        httpd.server_close()


if __name__ == "__main__":
    main()
