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

  Resumable push, for a leg too big for one request on a ship's connection:
  POST   /api/voyage/<v>/<voyage>/<B|L>/upload                 — begin or resume, returns uploadId + chunks already held
  PUT    /api/voyage/<v>/<voyage>/<B|L>/upload/<id>/<index>    — one chunk, raw bytes, idempotent
  GET    /api/voyage/<v>/<voyage>/<B|L>/upload/<id>            — which chunks are held
  POST   /api/voyage/<v>/<voyage>/<B|L>/upload/<id>/complete   — assemble, verify the digest, then merge exactly as PUT does
  DELETE /api/voyage/<v>/<voyage>/<B|L>/upload/<id>            — abandon and delete the parts

  Scanned files travel separately, so a dropped link resumes the one file
  that was in flight instead of the whole leg:
  GET    /api/blob/<vessel>/<sha256>/status
  PUT    /api/blob/<vessel>/<sha256>/part/<index>
  POST   /api/blob/<vessel>/<sha256>/complete
  GET    /api/blob/<vessel>/<sha256>/part/<index>
  GET  /api/vessel-library                               — list vessels (name + IMO) across user DBs
  POST /api/vessel-library/import                        — copy particulars + latest leg into caller DB
  GET  /api/admin/inventory                              — admin: users, vessels, voyage legs

Legacy flat files <voyage>-<CONDITION>.json are still readable and listed.

Auth: Authorization: Bearer <SYNC_API_TOKEN>
      With SYNC_API_TOKEN unset the server has no secret to check and accepts every
      request; /api/health reports tokenConfigured:false so clients can say so.
"""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sys
import time
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
LIST_KEYS = ("entries", "receipts", "documents", "abstracts", "printHistory", "orbEntries")
# Lists that live inside setup and must be unioned, not taken from one side.
MISC_SETUP_LISTS = (("requisitions", 0), ("bunkerPlanHistory", 50))
ORB_TANK_GROUPS = (
    "sludge", "bilge", "bilgeWells", "fuel", "lube",
    "dirtyBallast", "cargo", "slop", "cbt",
)
TOMBSTONE_KEYS = LIST_KEYS + ("requisitions", "bunkerPlanHistory", "orbTanks")
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


def slug_core(value: str) -> str:
    """Canonical ship key for matching: m-v-flag-evi, mv-flag-evi, and flag-evi
    are the same vessel. Account registration often keeps the MV as an m-v-
    prefix in the folder name; Voyage Chief's Setup field may use the bare
    name — treat them as one ship when reading/writing voyage data.
    """
    raw = unquote(value or "").strip().lower()
    s = re.sub(r"[^a-z0-9._-]+", "-", raw).strip("-.")
    prev = None
    while s != prev:
        prev = s
        s = re.sub(r"^m[._-]?v[._-]+", "", s)
        s = s.lstrip("-._")
    return s or "vessel"


_RESERVED_ROOT_DIRS = frozenset({"users"})


def resolve_vessel_slug(vessel: str, email: str | None = None) -> str:
    """Map a requested vessel id onto an existing data folder with the same core.

    Exact match wins. Otherwise any sibling folder whose slug_core matches
    (e.g. request flag-evi → folder m-v-flag-evi). If nothing matches, return
    the asked slug so a first push still creates a new folder under that name.
    """
    asked = safe_slug(vessel)
    if email is None:
        email = current_license_email()
    root = DATA_DIR / "users" / email_slug(email) if email else DATA_DIR
    if (root / asked).is_dir():
        return asked
    if not root.is_dir():
        return asked
    core = slug_core(asked)
    matches: list[str] = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        if not email and child.name.lower() in _RESERVED_ROOT_DIRS:
            continue
        if not SLUG_RE.match(child.name):
            continue
        if slug_core(child.name) == core:
            matches.append(child.name)
    if not matches:
        return asked
    if asked in matches:
        return asked
    # Prefer the m-v- form account registration historically wrote.
    matches.sort(key=lambda n: (0 if n.lower().startswith("m-v-") else 1, len(n), n))
    return matches[0]


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
    return root / resolve_vessel_slug(vessel, email)


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
        "Authorization, Content-Type, If-None-Match, X-Device-Id, X-Device-Name, X-Session-Token, X-License-Email, X-License-Master, X-Act-As-User, X-License-Entitlement, X-Voyage-Compact, X-Blob-Total-Bytes, X-Blob-Chunk-Bytes, X-Blob-Total-Chunks",
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
    # A pull asks for the folder and file this leg sits in, so that is what
    # the listing reports. A file written by an older client can carry another
    # number or condition inside (a B.json saying "L"); listing those sent the
    # pull to a leg that does not exist, and the leg could never be downloaded.
    return {
        "voyageNumber": voyage_number,
        "condition": condition,
        "voyageKey": f"{voyage_number}-{condition}",
        "storedVoyageNumber": data.get("voyageNumber"),
        "storedCondition": data.get("condition"),
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
            # SLUG_RE allows a leading dot, so the resumable-upload staging
            # folder would otherwise be scanned as if it were a voyage. It
            # holds no leg files today, so nothing would be listed, but that
            # is luck rather than intent -- say it.
            if voyage_number.startswith("."):
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



SKIP_ROOT_NAMES = {"users", "__pycache__"}


def iter_owner_roots():
    """Yield (owner_slug|None, root_path) for root and each users/<slug>/ tree."""
    yield None, DATA_DIR
    users = DATA_DIR / "users"
    if not users.is_dir():
        return
    try:
        names = sorted(users.iterdir())
    except OSError:
        return
    for p in names:
        try:
            if p.is_dir() and p.name not in SKIP_ROOT_NAMES and not p.name.startswith("."):
                yield p.name, p
        except OSError:
            continue


def _leg_payload(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _setup_from_leg(data: dict | None) -> dict:
    if not data:
        return {}
    inner = data.get("data") if isinstance(data.get("data"), dict) else None
    setup = (inner or data).get("setup")
    return setup if isinstance(setup, dict) else {}


def _particulars_from_setup(setup: dict, vessel_slug: str) -> dict:
    setup = setup or {}
    name = (
        setup.get("vesselName")
        or setup.get("shipName")
        or vessel_slug.replace("-", " ").title()
    )
    imo = setup.get("imoNo") or setup.get("imo") or setup.get("imoNumber") or ""
    return {
        "vesselName": name,
        "imoNo": imo,
        "callSign": setup.get("callSign") or "",
        "flag": setup.get("flag") or "",
        "company": setup.get("company") or "",
        "dwt": setup.get("dwt"),
        "chEng": setup.get("chEng") or "",
        "pitch": setup.get("pitch"),
        "mcrRpm": setup.get("mcrRpm"),
        "mcrKw": setup.get("mcrKw"),
        "csrRpm": setup.get("csrRpm"),
        "csrKw": setup.get("csrKw"),
        "sfoc100": setup.get("sfoc100"),
        "sfoc85": setup.get("sfoc85"),
        "lcvRef": setup.get("lcvRef"),
        "lcvActual": setup.get("lcvActual"),
        "capacity": setup.get("capacity"),
        "capacityLube": setup.get("capacityLube"),
        "fuelTanks": setup.get("fuelTanks"),
        "lubeTanks": setup.get("lubeTanks"),
        "fwTanks": setup.get("fwTanks"),
        "generators": setup.get("generators"),
        "flowmeters": setup.get("flowmeters"),
        "defaults": setup.get("defaults"),
        "geArrangement": setup.get("geArrangement"),
        "generatorCount": setup.get("generatorCount"),
        "meCylinderCount": setup.get("meCylinderCount"),
        "turboCount": setup.get("turboCount"),
    }


def find_latest_leg(owner_slug: str | None, vessel_slug: str) -> dict | None:
    """Newest B/L leg on disk for a vessel under root or users/<slug>/.

    Important: do not call vessel_dir(..., None) here — that falls back to the
    request's X-License-Email and would hide root-level vessels from a scoped user.
    """
    vessel_slug = safe_slug(vessel_slug)
    if owner_slug:
        root = DATA_DIR / "users" / email_slug(owner_slug) / vessel_slug
    else:
        root = DATA_DIR / vessel_slug
    if not root.exists():
        return None
    best = None
    best_key = ""

    def consider(voyage_no: str, condition: str, path: Path) -> None:
        nonlocal best, best_key
        data = _leg_payload(path)
        meta = read_leg_meta(path, voyage_no, condition)
        stamp = meta.get("updatedAt") or meta.get("serverUpdatedAt") or ""
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0
        key = f"{stamp}|{mtime:020.0f}|{voyage_no}|{condition}"
        if key >= best_key:
            best_key = key
            best = {
                "ownerSlug": owner_slug,
                "vesselSlug": vessel_slug,
                "voyageNo": voyage_no,
                "condition": safe_condition(condition),
                "updatedAt": stamp or None,
                "path": path,
                "data": data,
            }

    try:
        children = sorted(root.iterdir())
    except OSError:
        return None
    for path in children:
        if path.is_dir():
            voyage_no = path.name
            if not SLUG_RE.match(voyage_no):
                continue
            if voyage_no.startswith("."):  # upload staging, not a voyage
                continue
            for cond_file in sorted(path.glob("*.json")):
                cond = cond_file.stem.upper()
                if COND_RE.match(cond):
                    consider(voyage_no, safe_condition(cond), cond_file)
        elif path.suffix == ".json":
            m = LEGACY_COND_SUFFIX.match(path.stem)
            if m:
                consider(m.group("voyage"), m.group("cond"), path)
    return best


def list_vessel_library() -> list[dict]:
    """All vessels on this sync server (name + IMO), across user folders."""
    out: list[dict] = []
    seen: set[str] = set()
    for owner_slug, root in iter_owner_roots():
        if not root.exists():
            continue
        try:
            children = sorted(root.iterdir())
        except OSError:
            continue
        for child in children:
            try:
                if not child.is_dir():
                    continue
            except OSError:
                continue
            if child.name in SKIP_ROOT_NAMES or child.name.startswith("."):
                continue
            if child.name.endswith(".db"):
                continue
            vessel_slug = child.name
            if not SLUG_RE.match(vessel_slug):
                continue
            key = f"{owner_slug or ''}::{vessel_slug}"
            if key in seen:
                continue
            seen.add(key)
            leg = find_latest_leg(owner_slug, vessel_slug)
            setup = _setup_from_leg(leg["data"] if leg else None)
            particulars = _particulars_from_setup(setup, vessel_slug)
            # Fleet register may have a friendlier name/IMO when disk has none.
            acct = None
            try:
                acct = ACCOUNTS.get_vessel(vessel_slug)
            except Exception:
                acct = None
            if acct:
                if not particulars.get("vesselName") or particulars["vesselName"] == vessel_slug.replace("-", " ").title():
                    particulars["vesselName"] = acct.get("vesselName") or particulars["vesselName"]
                if not particulars.get("imoNo"):
                    particulars["imoNo"] = acct.get("imo") or ""
            out.append({
                "ownerSlug": owner_slug,
                "vesselId": vessel_slug,
                "name": particulars.get("vesselName") or vessel_slug,
                "imo": particulars.get("imoNo") or "",
                "updatedAt": (leg or {}).get("updatedAt"),
                "hasVoyageLeg": bool(leg),
            })
    out.sort(key=lambda v: str(v.get("name") or "").lower())
    return out


def import_vessel_library_entry(owner_slug: str | None, vessel_id: str, dest_email: str | None) -> dict:
    """Copy ship particulars + latest voyage leg into the requester's user folder."""
    vessel_id = safe_slug(vessel_id)
    source_owner = owner_slug.strip() if isinstance(owner_slug, str) and owner_slug.strip() else None
    leg = find_latest_leg(source_owner, vessel_id)
    setup = _setup_from_leg(leg["data"] if leg else None)
    particulars = _particulars_from_setup(setup, vessel_id)
    if not particulars.get("vesselName"):
        try:
            acct = ACCOUNTS.get_vessel(vessel_id)
            if acct:
                particulars["vesselName"] = acct.get("vesselName") or vessel_id
                particulars["imoNo"] = particulars.get("imoNo") or acct.get("imo") or ""
        except Exception:
            pass

    voyage_copy = None
    voyage_leg = None
    if leg and leg.get("data") is not None:
        voyage_leg = {
            "ownerSlug": leg["ownerSlug"],
            "vesselSlug": leg["vesselSlug"],
            "voyageNo": leg["voyageNo"],
            "condition": leg["condition"],
            "updatedAt": leg["updatedAt"],
            "data": leg["data"],
        }
        dest_vessel = vessel_id
        # Build destination under the caller's user folder explicitly (no request-context fallback).
        if dest_email:
            dest_root = DATA_DIR / "users" / email_slug(dest_email) / safe_slug(dest_vessel)
        else:
            dest_root = DATA_DIR / safe_slug(dest_vessel)
        dest_path = dest_root / safe_slug(leg["voyageNo"]) / f"{safe_condition(leg['condition'])}.json"
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.loads(json.dumps(leg["data"]))  # deep copy via JSON
        if isinstance(payload, dict):
            payload["serverUpdatedAt"] = utc_now()
            payload["copiedFrom"] = {
                "ownerSlug": leg["ownerSlug"],
                "vesselSlug": leg["vesselSlug"],
                "voyageNo": leg["voyageNo"],
                "condition": leg["condition"],
                "at": utc_now(),
            }
        dest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        voyage_copy = {
            "ownerSlug": email_slug(dest_email) if dest_email else None,
            "vesselSlug": dest_vessel,
            "voyageNo": leg["voyageNo"],
            "condition": leg["condition"],
            "path": (str(dest_path.relative_to(DATA_DIR)) if str(dest_path).startswith(str(DATA_DIR)) else str(dest_path)),
        }

    return {
        "ok": True,
        "vessel": {
            "id": vessel_id,
            "slug": vessel_id,
            "name": particulars.get("vesselName") or vessel_id,
            "imo": particulars.get("imoNo") or "",
        },
        "particulars": particulars,
        "voyageLeg": voyage_leg,
        "voyageCopy": voyage_copy,
        "message": (
            "Ship particulars imported and latest voyage leg copied into your server database."
            if voyage_copy
            else "Ship particulars imported (no voyage leg found on server)."
        ),
    }


def list_admin_inventory() -> dict:
    """Master inventory: user folders, vessels, and voyage legs on disk."""
    users = []
    for owner_slug, root in iter_owner_roots():
        vessels = []
        try:
            children = sorted(root.iterdir())
        except OSError:
            children = []
        for child in children:
            try:
                if not child.is_dir() or child.name in SKIP_ROOT_NAMES or child.name.startswith("."):
                    continue
            except OSError:
                continue
            if not SLUG_RE.match(child.name):
                continue
            leg = find_latest_leg(owner_slug, child.name)
            setup = _setup_from_leg(leg["data"] if leg else None)
            particulars = _particulars_from_setup(setup, child.name)
            vessels.append({
                "vesselId": child.name,
                "name": particulars.get("vesselName") or child.name,
                "imo": particulars.get("imoNo") or "",
                "updatedAt": (leg or {}).get("updatedAt"),
            })
        users.append({
            "emailSlug": owner_slug or "(root)",
            "vesselCount": len(vessels),
            "vessels": vessels,
        })
    legs = []
    for owner_slug, root in iter_owner_roots():
        try:
            children = sorted(root.iterdir())
        except OSError:
            continue
        for child in children:
            try:
                if not child.is_dir() or child.name in SKIP_ROOT_NAMES:
                    continue
            except OSError:
                continue
            if not SLUG_RE.match(child.name):
                continue
            # reuse list_voyages under that owner
            prev = current_license_email()
            try:
                _request_ctx.email = owner_slug
                for voyage in list_voyages(child.name):
                    for cond in voyage.get("conditions") or []:
                        legs.append({
                            "ownerSlug": owner_slug,
                            "vesselSlug": child.name,
                            "voyageNo": voyage.get("voyageNumber"),
                            "condition": cond.get("condition"),
                            "updatedAt": cond.get("updatedAt"),
                        })
            finally:
                _request_ctx.email = prev
    return {"users": users, "voyageLegs": legs}


# ---------------------------------------------------------------------------
# Resumable leg upload
#
# A full voyage leg carrying scanned requisitions runs to tens or hundreds of
# megabytes, and a ship's connection drops. As one PUT, an upload that dies at
# 90% is worth nothing: the next attempt starts from the beginning, and on a
# link that slow it may never finish at all.
#
# So a leg may instead be sent as numbered chunks into a staging folder, and
# assembled here once every chunk has arrived. A chunk is written under its
# index, which makes a re-send idempotent -- a client that is unsure whether a
# chunk landed can simply send it again -- and a resumed upload asks the server
# which indices it already holds rather than trusting its own record of what it
# sent.
#
# The assembled bytes are verified against the digest declared when the upload
# began, BEFORE anything is merged into the leg. That is the whole point of
# carrying the digest: a leg assembled from chunks must be provably the leg the
# ship built, not merely the right number of bytes. A mismatch is refused and
# the parts are kept, so the client can re-send rather than lose the work.
#
# Nothing here changes how a leg is merged: completing an upload runs the same
# merge_snapshots path the single-request PUT runs.
# ---------------------------------------------------------------------------

UPLOAD_DIR_NAME = ".uploads"
UPLOAD_MANIFEST = "manifest.json"
# A leg this big is a bug, not a leg; refuse it before filling the disk.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
MAX_UPLOAD_CHUNKS = 20000
# Per chunk. 256 KiB is the client default; the ceiling leaves room to raise it
# on a good link without a server change.
MAX_CHUNK_BYTES = 8 * 1024 * 1024
# An upload nobody has touched for this long is abandoned. A ship may be a week
# between useful connections, so this is generous.
UPLOAD_STALE_SECONDS = 14 * 24 * 3600

# A scanned requisition or photo lives in the leg as a data: URL. Sent inside
# the leg JSON, one dropped upload throws away every scan that had already
# arrived. Stored here by sha256, each file is uploaded once and a later sync
# skips the ones this server already holds.
BLOB_DIR_NAME = ".blobs"
BLOB_MIN_CHARS = 2048
# Small enough that one part is cheap to lose, and under the size a single
# IndexedDB value is allowed to be on the Android WebView.
BLOB_CHUNK_BYTES = 120 * 1024


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def upload_root(vessel: str, email: str | None = None) -> Path:
    return vessel_dir(vessel, email) / UPLOAD_DIR_NAME


def upload_dir(vessel: str, upload_id: str, email: str | None = None) -> Path:
    """The staging folder, with the id validated rather than trusted.

    The id goes into a filesystem path, so it is checked against a strict
    pattern instead of being sanitised: an id that is not one we issued has no
    business resolving to a path at all.
    """
    if not re.fullmatch(r"[0-9a-f]{32}", upload_id or ""):
        raise ValueError("invalid upload id")
    return upload_root(vessel, email) / upload_id


def chunk_path(folder: Path, index: int) -> Path:
    return folder / f"{index:06d}.part"


def read_upload_manifest(folder: Path) -> dict | None:
    try:
        return json.loads((folder / UPLOAD_MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_upload_manifest(folder: Path, manifest: dict) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    manifest["touchedAt"] = utc_now()
    (folder / UPLOAD_MANIFEST).write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def upload_received(folder: Path, total_chunks: int) -> list[int]:
    """Indices actually on disk. The disk is the authority, not the client."""
    got = []
    for i in range(total_chunks):
        p = chunk_path(folder, i)
        try:
            if p.exists() and p.stat().st_size > 0:
                got.append(i)
        except OSError:
            continue
    return got


def assemble_upload(folder: Path, manifest: dict) -> str:
    total = int(manifest.get("totalChunks") or 0)
    missing = [i for i in range(total) if i not in set(upload_received(folder, total))]
    if missing:
        raise ValueError(f"{len(missing)} chunk(s) still missing: {missing[:10]}")
    out = bytearray()
    for i in range(total):
        out.extend(chunk_path(folder, i).read_bytes())
    declared_bytes = int(manifest.get("totalBytes") or 0)
    if declared_bytes and len(out) != declared_bytes:
        raise ValueError(
            f"assembled {len(out)} bytes, the upload declared {declared_bytes}"
        )
    text = out.decode("utf-8")
    # Verified against the digest declared when the upload began, before a byte
    # of it is merged: a leg assembled from chunks must be provably the leg the
    # ship built, not merely the right number of bytes.
    #
    # Only sha256 is checked here, and the client only declares it when it can
    # compute it. crypto.subtle is exposed only over https or on localhost, so a
    # tablet on plain http cannot, and declares "none" instead. Mirroring that
    # device's FNV-1a fallback on this side was the obvious thing to do and is
    # wrong: its multiply exceeds 2^53 in JavaScript, so the browser's own
    # result is a float approximation that an exact-integer Python port would
    # not reproduce, and every upload from such a device would be refused for a
    # corruption that had not happened. Those uploads are checked on length and
    # chunk completeness, and the response says the digest was not verified
    # rather than implying it was.
    algo = str(manifest.get("digestAlgo") or "none")
    declared = str(manifest.get("digest") or "")
    if algo == "sha256" and declared:
        actual = sha256_hex(text)
        if actual != declared:
            raise ValueError(
                "the assembled leg does not match the digest the ship declared "
                f"(sha256: got {actual[:16]}…, expected {declared[:16]}…) — "
                "the parts are kept, send the chunks again"
            )
    return text


def prune_stale_uploads(root: Path) -> None:
    """Drop staging folders nobody has touched in a fortnight. Best effort."""
    try:
        folders = list(root.iterdir())
    except OSError:
        return
    cutoff = time.time() - UPLOAD_STALE_SECONDS
    for folder in folders:
        if not folder.is_dir():
            continue
        try:
            if folder.stat().st_mtime >= cutoff:
                continue
            for child in folder.iterdir():
                child.unlink(missing_ok=True)
            folder.rmdir()
        except OSError:
            continue


def delete_upload(folder: Path) -> None:
    try:
        for child in folder.iterdir():
            child.unlink(missing_ok=True)
        folder.rmdir()
    except OSError:
        pass


def _blob_digest_ok(digest: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-f]{64}", digest or ""))


def blob_dir(vessel: str) -> Path:
    return vessel_dir(vessel) / BLOB_DIR_NAME


def blob_file(vessel: str, digest: str) -> Path:
    if not _blob_digest_ok(digest):
        raise ValueError("invalid blob id")
    return blob_dir(vessel) / digest


def blob_incoming_dir(vessel: str, digest: str) -> Path:
    if not _blob_digest_ok(digest):
        raise ValueError("invalid blob id")
    return blob_dir(vessel) / (digest + ".incoming")


def store_blob_bytes(vessel: str, digest: str, raw: bytes) -> None:
    """Write a finished blob. The same bytes are not written twice."""
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("blob does not match its sha256")
    path = blob_file(vessel, digest)
    if path.exists() and path.stat().st_size == len(raw):
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(raw)
    tmp.replace(path)


def read_blob_bytes(vessel: str, digest: str) -> bytes | None:
    try:
        path = blob_file(vessel, digest)
    except ValueError:
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def _is_blob_ref(node: object) -> bool:
    return (
        isinstance(node, dict)
        and set(node.keys()) == {"$blob"}
        and isinstance(node.get("$blob"), str)
        and _blob_digest_ok(node["$blob"])
    )


def detach_data_urls(vessel: str, value):
    """Pull long data: URLs out into the blob store. Returns (value, changed).

    The leg JSON then carries {"$blob": "<sha256>"} where the scan was. A
    later sync sends the id, and the bytes stay where they already landed.
    """
    changed = False

    def walk(node):
        nonlocal changed
        if isinstance(node, str):
            if len(node) >= BLOB_MIN_CHARS and node.startswith("data:"):
                raw = node.encode("utf-8")
                digest = hashlib.sha256(raw).hexdigest()
                store_blob_bytes(vessel, digest, raw)
                changed = True
                return {"$blob": digest}
            return node
        if isinstance(node, list):
            return [walk(item) for item in node]
        if isinstance(node, dict):
            if _is_blob_ref(node):
                return node
            return {key: walk(item) for key, item in node.items()}
        return node

    return walk(value), changed


def expand_blob_refs(vessel: str, value):
    """Put the stored scans back, for a client that does not understand refs."""
    def walk(node):
        if _is_blob_ref(node):
            raw = read_blob_bytes(vessel, node["$blob"])
            if raw is None:
                return node
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                return node
        if isinstance(node, list):
            return [walk(item) for item in node]
        if isinstance(node, dict):
            return {key: walk(item) for key, item in node.items()}
        return node

    return walk(value)


def blob_chunk_count(size: int, chunk: int) -> int:
    if size <= 0:
        return 1
    return (size + chunk - 1) // chunk


def read_blob_slice(path: Path, index: int, chunk: int) -> bytes:
    with path.open("rb") as handle:
        handle.seek(index * chunk)
        return handle.read(chunk)


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
            writable = principal.get("writable")
            if writable is None or slug_core(writable) != slug_core(vessel):
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

        if not any(slug_core(v) == slug_core(vessel) for v in readable):
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
                    # Resumable chunked leg upload. A client reads this rather
                    # than probing: an older server answers an unknown POST
                    # with its own error page, and "is this a 404 or a proxy
                    # being odd" is not a question worth asking mid-upload.
                    "resumableUpload": {
                        "supported": True,
                        "maxBytes": MAX_UPLOAD_BYTES,
                        "maxChunks": MAX_UPLOAD_CHUNKS,
                        "maxChunkBytes": MAX_CHUNK_BYTES,
                    },
                    # Long data: URLs (scans, photos) are stored once by sha256
                    # and the leg JSON only carries the id. A client reads this
                    # rather than guessing: an older server has no blob routes.
                    "blobStore": {
                        "supported": True,
                        "chunkBytes": BLOB_CHUNK_BYTES,
                        "minChars": BLOB_MIN_CHARS,
                    },
                    "resumableDownload": {
                        "supported": True,
                        "chunkBytes": BLOB_CHUNK_BYTES,
                    },
                },
            )
            return

        parts = [p for p in parsed.path.strip("/").split("/") if p]
        blob = self._blob_route(parts)
        if blob:
            return self._blob_get(blob)

        try:
            upload_route = self._upload_route(parts)
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
            return
        if upload_route:
            vessel_part, _voyage, _condition, upload_id, tail = upload_route
            if self._authorize_vessel(safe_slug(vessel_part), write=True) is None:
                return
            if upload_id and not tail:
                return self._upload_status(vessel_part, upload_id)
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "GET /upload/<id> for upload status"})
            return

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


        if parts == ["api", "vessel-library"]:
            principal = self._principal()
            if principal["reason"]:
                self._reject_unauthorized(principal["reason"])
                return
            try:
                json_response(
                    self,
                    HTTPStatus.OK,
                    {"ok": True, "vessels": list_vessel_library()},
                )
            except Exception as err:
                json_response(
                    self,
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": str(err) or "Failed to list vessel library"},
                )
            return

        if parts == ["api", "admin", "inventory"]:
            if self._require_admin() is None:
                return
            try:
                inv = list_admin_inventory()
                json_response(self, HTTPStatus.OK, {"ok": True, **inv})
            except Exception as err:
                json_response(
                    self,
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": str(err) or "Failed to build inventory"},
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

        # GET /api/voyage-misc/<vessel>[?full=1] -- miscellaneous data across every leg.
        if len(parts) == 3 and parts[:2] == ["api", "voyage-misc"]:
            try:
                vessel = safe_slug(parts[2])
            except ValueError:
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
                return
            if self._authorize_vessel(vessel) is None:
                return
            misc = collect_vessel_misc(vessel)
            full = parse_qs(parsed.query).get("full", ["0"])[0] in ("1", "true")
            body = {"ok": True, "vesselId": resolve_vessel_slug(vessel)}
            if full:
                body["misc"] = expand_blob_refs(vessel, misc)
            else:
                body["brief"] = brief_vessel_misc(misc)
            json_response(self, HTTPStatus.OK, body)
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
                    resolved = resolve_vessel_slug(vessel)
                    json_response(
                        self,
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "vesselId": resolved,
                            "requestedVesselId": vessel,
                            "voyages": list_voyages(vessel),
                        },
                    )
                    return
                if len(parts) == 4:
                    vessel = safe_slug(parts[2])
                    voyage = safe_slug(parts[3])
                    resolved = resolve_vessel_slug(vessel)
                    # Could be legacy pull of voyageKey "22-F-BALLAST" OR list conditions
                    legacy = LEGACY_COND_SUFFIX.match(voyage)
                    if legacy:
                        path = resolve_leg_path(
                            vessel, legacy.group("voyage"), legacy.group("cond")
                        )
                        return self._send_leg_file(path, vessel)
                    json_response(
                        self,
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "vesselId": resolved,
                            "requestedVesselId": vessel,
                            "voyageNumber": voyage,
                            "conditions": list_conditions(vessel, voyage),
                        },
                    )
                    return
                if len(parts) == 5:
                    path = resolve_leg_path(parts[2], parts[3], parts[4])
                    return self._send_leg_file(path, safe_slug(parts[2]))
            except ValueError:
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
                return

        if self._serve_static(parsed.path):
            return

        json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def _wants_compact(self) -> bool:
        return (self.headers.get("X-Voyage-Compact") or "") == "1"

    def _send_leg_file(self, path: Path, vessel: str) -> None:
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
        # A client that understands refs gets the small form. The scans are
        # pulled one file at a time, and each file resumes on its own. The
        # first such pull also rewrites a legacy fat leg so the next one is
        # already small.
        if self._wants_compact():
            data, changed = detach_data_urls(vessel, data)
            if changed:
                path.write_text(json.dumps(data), encoding="utf-8")
        else:
            data = expand_blob_refs(vessel, data)
        body = json.dumps(data).encode("utf-8")
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

        blob = self._blob_route(parts)
        if blob:
            return self._blob_post(blob)

        try:
            # Resumable leg upload: begin or resume, and complete.
            try:
                route = self._upload_route(parts)
            except ValueError:
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
                return
            if route:
                vessel_part, voyage, condition, upload_id, tail = route
                if self._authorize_vessel(safe_slug(vessel_part), write=True) is None:
                    return
                if not upload_id:
                    return self._upload_begin(vessel_part, voyage, condition, body)
                if tail == "complete":
                    return self._upload_complete(vessel_part, voyage, condition, upload_id)
                json_response(self, HTTPStatus.NOT_FOUND, {"error": "POST /upload to begin or /upload/<id>/complete to finish"})
                return

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
            if parts == ["api", "vessel-library", "import"]:
                principal = self._principal()
                if principal["reason"]:
                    self._reject_unauthorized(principal["reason"])
                    return
                owner_slug = body.get("ownerSlug")
                vessel_id = body.get("vesselId") or body.get("vesselSlug")
                if not vessel_id:
                    json_response(self, HTTPStatus.BAD_REQUEST, {"error": "vesselId is required"})
                    return
                dest_email = current_license_email()
                if not dest_email and principal.get("role") != ROLE_ADMIN:
                    json_response(
                        self,
                        HTTPStatus.BAD_REQUEST,
                        {"error": "X-License-Email is required to import into your own server database"},
                    )
                    return
                try:
                    result = import_vessel_library_entry(owner_slug, str(vessel_id), dest_email)
                except ValueError as err:
                    json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})
                    return
                except Exception as err:
                    json_response(
                        self,
                        HTTPStatus.INTERNAL_SERVER_ERROR,
                        {"error": str(err) or "Import failed"},
                    )
                    return
                return json_response(self, HTTPStatus.OK, result)
        except AccountError as err:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})
            return

        json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_DELETE(self) -> None:
        bind_request_license_email(self)
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        try:
            route = self._upload_route(parts)
            if route:
                vessel_part, _voyage, _condition, upload_id, tail = route
                if self._authorize_vessel(safe_slug(vessel_part), write=True) is None:
                    return
                if upload_id and not tail:
                    return self._upload_abandon(vessel_part, upload_id)
                json_response(self, HTTPStatus.NOT_FOUND, {"error": "DELETE /upload/<id> to abandon an upload"})
                return

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
        blob = self._blob_route(parts)
        if blob:
            return self._blob_put(blob)
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

        # A chunk of a resumable upload: raw bytes, not a JSON leg.
        try:
            route = self._upload_route(parts)
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid path"})
            return
        if route:
            vessel_part, _voyage, _condition, upload_id, tail = route
            if upload_id and tail:
                return self._upload_chunk(vessel_part, upload_id, tail)
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "PUT an upload chunk as /upload/<id>/<index>"})
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

        merged = self._merge_leg(
            parts[2] if len(parts) >= 3 else vessel, voyage, condition, path, incoming
        )
        json_response(self, HTTPStatus.OK, merged)

    # ---- blob store ------------------------------------------------------

    def _discard_body(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except (TypeError, ValueError):
            return
        remaining = length
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 65536))
            if not chunk:
                break
            remaining -= len(chunk)

    def _blob_route(self, parts: list[str]):
        """Parse /api/blob/<vessel>/<sha256>/status|complete|part/<index>.

        Returns (vessel, digest, tail) or None when this is not a blob route.
        """
        if len(parts) < 4 or parts[0] != "api" or parts[1] != "blob":
            return None
        return parts[2], parts[3], parts[4:]

    def _blob_checked(self, vessel_part: str, digest: str, write: bool):
        try:
            vessel = safe_slug(vessel_part)
            if not _blob_digest_ok(digest):
                raise ValueError("invalid blob id")
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid blob id"})
            return None
        if self._authorize_vessel(vessel, write=write) is None:
            return None
        return vessel

    def _blob_status_payload(self, vessel: str, digest: str) -> dict | None:
        final = blob_file(vessel, digest)
        if final.exists():
            size = final.stat().st_size
            total = blob_chunk_count(size, BLOB_CHUNK_BYTES)
            return {
                "ok": True,
                "complete": True,
                "sha256": digest,
                "totalBytes": size,
                "chunkBytes": BLOB_CHUNK_BYTES,
                "totalChunks": total,
                "received": list(range(total)),
                "receivedCount": total,
            }
        folder = blob_incoming_dir(vessel, digest)
        manifest = read_upload_manifest(folder)
        if not manifest:
            return None
        total = int(manifest.get("totalChunks") or 0)
        received = upload_received(folder, total)
        return {
            "ok": True,
            "complete": False,
            "sha256": digest,
            "totalBytes": int(manifest.get("totalBytes") or 0),
            "chunkBytes": int(manifest.get("chunkBytes") or 0),
            "totalChunks": total,
            "received": received,
            "receivedCount": len(received),
        }

    def _blob_get(self, route) -> None:
        vessel_part, digest, tail = route
        vessel = self._blob_checked(vessel_part, digest, write=False)
        if vessel is None:
            return
        if tail == ["status"]:
            payload = self._blob_status_payload(vessel, digest)
            if payload is None:
                json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            json_response(self, HTTPStatus.OK, payload)
            return
        if len(tail) == 2 and tail[0] == "part":
            try:
                index = int(tail[1])
            except (TypeError, ValueError):
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "chunk index must be a number"})
                return
            final = blob_file(vessel, digest)
            if not final.exists():
                json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            if index < 0 or index >= blob_chunk_count(final.stat().st_size, BLOB_CHUNK_BYTES):
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "chunk index is outside the file"})
                return
            raw = read_blob_slice(final, index, BLOB_CHUNK_BYTES)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(raw)))
            send_cors(self)
            self.end_headers()
            self.wfile.write(raw)
            return
        json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def _blob_put(self, route) -> None:
        """Store one part of a scan. Re-sending a part replaces it."""
        vessel_part, digest, tail = route
        vessel = self._blob_checked(vessel_part, digest, write=True)
        if vessel is None:
            return
        if not (len(tail) == 2 and tail[0] == "part"):
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "PUT a blob part as /part/<index>"})
            return
        try:
            index = int(tail[1])
        except (TypeError, ValueError):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "chunk index must be a number"})
            return
        final = blob_file(vessel, digest)
        if final.exists():
            # The body still has to be consumed, or the next request on this
            # connection is read as the tail of this one.
            self._discard_body()
            json_response(self, HTTPStatus.OK, {"ok": True, "complete": True, "sha256": digest, "index": index})
            return
        try:
            total_bytes = int(self.headers.get("X-Blob-Total-Bytes") or 0)
            chunk_bytes = int(self.headers.get("X-Blob-Chunk-Bytes") or 0)
            total_chunks = int(self.headers.get("X-Blob-Total-Chunks") or 0)
        except (TypeError, ValueError):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "blob size headers must be numbers"})
            return
        if total_bytes <= 0 or chunk_bytes <= 0 or total_chunks <= 0:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "X-Blob-Total-Bytes, X-Blob-Chunk-Bytes and X-Blob-Total-Chunks are required"})
            return
        if chunk_bytes > MAX_CHUNK_BYTES or total_bytes > MAX_UPLOAD_BYTES or total_chunks > MAX_UPLOAD_CHUNKS:
            json_response(self, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "blob part exceeds the server limit"})
            return
        if index < 0 or index >= total_chunks:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"chunk index {index} is outside 0..{total_chunks - 1}"})
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > MAX_CHUNK_BYTES:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "empty or oversized blob part"})
            return
        raw = self.rfile.read(length)
        if len(raw) != length:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "chunk was cut short — send it again"})
            return
        folder = blob_incoming_dir(vessel, digest)
        folder.mkdir(parents=True, exist_ok=True)
        manifest = read_upload_manifest(folder)
        if manifest and (
            int(manifest.get("totalBytes") or 0) != total_bytes
            or int(manifest.get("chunkBytes") or 0) != chunk_bytes
            or int(manifest.get("totalChunks") or 0) != total_chunks
        ):
            # The client is sending this file on a different split. The old
            # parts describe a different cutting, so they cannot be mixed in.
            delete_upload(folder)
            folder.mkdir(parents=True, exist_ok=True)
            manifest = None
        if manifest is None:
            manifest = {
                "sha256": digest,
                "totalBytes": total_bytes,
                "chunkBytes": chunk_bytes,
                "totalChunks": total_chunks,
            }
        tmp = folder / f"{index:06d}.part.tmp"
        try:
            tmp.write_bytes(raw)
            tmp.replace(chunk_path(folder, index))
            write_upload_manifest(folder, manifest)
        except OSError as err:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            json_response(self, HTTPStatus.INSUFFICIENT_STORAGE, {"error": f"could not store the chunk: {err}"})
            return
        received = upload_received(folder, total_chunks)
        json_response(self, HTTPStatus.OK, {
            "ok": True,
            "sha256": digest,
            "index": index,
            "receivedCount": len(received),
            "totalChunks": total_chunks,
            "complete": False,
        })

    def _blob_post(self, route) -> None:
        vessel_part, digest, tail = route
        vessel = self._blob_checked(vessel_part, digest, write=True)
        if vessel is None:
            return
        if tail != ["complete"]:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "POST /complete to finish a blob"})
            return
        final = blob_file(vessel, digest)
        if final.exists():
            json_response(self, HTTPStatus.OK, {"ok": True, "complete": True, "sha256": digest, "totalBytes": final.stat().st_size})
            return
        folder = blob_incoming_dir(vessel, digest)
        manifest = read_upload_manifest(folder)
        if not manifest:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "no such upload — begin it again"})
            return
        total = int(manifest.get("totalChunks") or 0)
        try:
            missing = [i for i in range(total) if i not in set(upload_received(folder, total))]
            if missing:
                raise ValueError(f"{len(missing)} chunk(s) still missing")
            out = bytearray()
            for i in range(total):
                out.extend(chunk_path(folder, i).read_bytes())
            if len(out) != int(manifest.get("totalBytes") or 0):
                raise ValueError("assembled size does not match the declared size")
            if hashlib.sha256(out).hexdigest() != digest:
                raise ValueError("the assembled file does not match its sha256 — the parts are kept, send the chunks again")
            store_blob_bytes(vessel, digest, bytes(out))
        except ValueError as err:
            json_response(self, HTTPStatus.CONFLICT, {
                "error": str(err),
                "sha256": digest,
                "received": upload_received(folder, total),
                "totalChunks": total,
            })
            return
        except OSError as err:
            json_response(self, HTTPStatus.CONFLICT, {"error": f"could not read the uploaded parts: {err}"})
            return
        delete_upload(folder)
        json_response(self, HTTPStatus.OK, {"ok": True, "complete": True, "sha256": digest, "totalBytes": len(out)})

    # ---- resumable upload ------------------------------------------------

    def _upload_route(self, parts: list[str]):
        """Parse /api/voyage/<v>/<voyage>/<B|L>/upload[/<id>[/<index>|complete]].

        Returns (vessel_part, voyage, condition, upload_id, tail) or None when
        the path is not an upload route. Authorisation is the caller's job.
        """
        if len(parts) < 6 or parts[0] != "api" or parts[1] != "voyage" or parts[5] != "upload":
            return None
        vessel_part = parts[2]
        voyage = safe_slug(parts[3])
        condition = safe_condition(parts[4])
        upload_id = parts[6] if len(parts) >= 7 else ""
        tail = parts[7] if len(parts) >= 8 else ""
        if len(parts) > 8:
            return None
        return vessel_part, voyage, condition, upload_id, tail

    def _upload_begin(self, vessel_part: str, voyage: str, condition: str, body: dict) -> None:
        """Begin a new upload, or resume one and say which chunks are held.

        A resume is the same call with the same uploadId: the client does not
        tell us what it has sent, it ASKS what we hold. Its own record can be
        wrong in the one way that matters -- a chunk whose response was lost is
        on disk here but unconfirmed there -- and trusting it would skip a chunk
        that never arrived.

        The declared digest is what binds a resumed upload to the leg it
        started as. If the leg changed between attempts the digest changes with
        it, and we start a new upload rather than assembling halves of two
        different legs into something that is neither.
        """
        try:
            total_bytes = int(body.get("totalBytes") or 0)
            total_chunks = int(body.get("totalChunks") or 0)
            chunk_bytes = int(body.get("chunkBytes") or 0)
        except (TypeError, ValueError):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "totalBytes, totalChunks and chunkBytes must be numbers"})
            return
        if total_bytes <= 0 or total_chunks <= 0 or chunk_bytes <= 0:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "totalBytes, totalChunks and chunkBytes are required"})
            return
        if total_bytes > MAX_UPLOAD_BYTES:
            json_response(self, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": f"leg is {total_bytes} bytes; this server accepts up to {MAX_UPLOAD_BYTES}"})
            return
        if total_chunks > MAX_UPLOAD_CHUNKS:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"{total_chunks} chunks exceeds the limit of {MAX_UPLOAD_CHUNKS}; use a larger chunk size"})
            return
        if chunk_bytes > MAX_CHUNK_BYTES:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"chunkBytes {chunk_bytes} exceeds the limit of {MAX_CHUNK_BYTES}"})
            return

        digest = str(body.get("digest") or "")
        digest_algo = str(body.get("digestAlgo") or "none")
        if digest_algo not in ("sha256", "none"):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "digestAlgo must be sha256 or none"})
            return

        root = upload_root(vessel_part)
        prune_stale_uploads(root)

        asked = str(body.get("uploadId") or "")
        folder = None
        manifest = None
        if asked:
            try:
                folder = upload_dir(vessel_part, asked)
            except ValueError:
                json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid upload id"})
                return
            manifest = read_upload_manifest(folder)
            if manifest and (
                manifest.get("digest") != digest
                or manifest.get("digestAlgo") != digest_algo
                or int(manifest.get("totalBytes") or 0) != total_bytes
                or int(manifest.get("totalChunks") or 0) != total_chunks
            ):
                # The leg changed since that upload began. Its parts describe a
                # leg that no longer exists, so they are dropped rather than
                # mixed with the new one.
                delete_upload(folder)
                manifest = None
                folder = None

        if manifest is None:
            upload_id = secrets.token_hex(16)
            folder = upload_dir(vessel_part, upload_id)
            manifest = {
                "uploadId": upload_id,
                "vessel": vessel_part,
                "voyage": voyage,
                "condition": condition,
                "totalBytes": total_bytes,
                "totalChunks": total_chunks,
                "chunkBytes": chunk_bytes,
                "digest": digest,
                "digestAlgo": digest_algo,
                "startedAt": utc_now(),
            }
            write_upload_manifest(folder, manifest)

        received = upload_received(folder, total_chunks)
        json_response(
            self,
            HTTPStatus.OK,
            {
                "uploadId": manifest["uploadId"],
                "received": received,
                "receivedCount": len(received),
                "totalChunks": total_chunks,
                "chunkBytes": chunk_bytes,
                "resumed": bool(asked) and bool(received),
                "digestVerified": digest_algo == "sha256",
            },
        )

    def _upload_status(self, vessel_part: str, upload_id: str) -> None:
        try:
            folder = upload_dir(vessel_part, upload_id)
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid upload id"})
            return
        manifest = read_upload_manifest(folder)
        if not manifest:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "no such upload"})
            return
        received = upload_received(folder, int(manifest.get("totalChunks") or 0))
        json_response(
            self,
            HTTPStatus.OK,
            {
                "uploadId": manifest.get("uploadId"),
                "received": received,
                "receivedCount": len(received),
                "totalChunks": manifest.get("totalChunks"),
                "chunkBytes": manifest.get("chunkBytes"),
                "startedAt": manifest.get("startedAt"),
                "touchedAt": manifest.get("touchedAt"),
            },
        )

    def _upload_chunk(self, vessel_part: str, upload_id: str, index_raw: str) -> None:
        """Store one chunk. Writing it under its index is what makes a re-send
        harmless: a client that lost our response can send the chunk again and
        the second copy simply replaces the first."""
        try:
            folder = upload_dir(vessel_part, upload_id)
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid upload id"})
            return
        manifest = read_upload_manifest(folder)
        if not manifest:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "no such upload — begin it again"})
            return
        total_chunks = int(manifest.get("totalChunks") or 0)
        try:
            index = int(index_raw)
        except (TypeError, ValueError):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "chunk index must be a number"})
            return
        if index < 0 or index >= total_chunks:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"chunk index {index} is outside 0..{total_chunks - 1}"})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "empty chunk"})
            return
        if length > MAX_CHUNK_BYTES:
            json_response(self, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": f"chunk is {length} bytes; the limit is {MAX_CHUNK_BYTES}"})
            return
        raw = self.rfile.read(length)
        if len(raw) != length:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "chunk was cut short — send it again"})
            return

        # Written to a temporary name and moved into place, so a connection that
        # dies mid-write cannot leave a short chunk looking complete.
        tmp = folder / f"{index:06d}.part.tmp"
        try:
            tmp.write_bytes(raw)
            tmp.replace(chunk_path(folder, index))
        except OSError as err:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            json_response(self, HTTPStatus.INSUFFICIENT_STORAGE, {"error": f"could not store the chunk: {err}"})
            return
        write_upload_manifest(folder, manifest)

        received = upload_received(folder, total_chunks)
        json_response(
            self,
            HTTPStatus.OK,
            {
                "uploadId": manifest.get("uploadId"),
                "index": index,
                "receivedCount": len(received),
                "totalChunks": total_chunks,
            },
        )

    def _upload_complete(self, vessel_part: str, voyage: str, condition: str, upload_id: str) -> None:
        try:
            folder = upload_dir(vessel_part, upload_id)
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid upload id"})
            return
        manifest = read_upload_manifest(folder)
        if not manifest:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "no such upload — begin it again"})
            return
        try:
            text = assemble_upload(folder, manifest)
        except ValueError as err:
            # The parts are deliberately NOT deleted: the ship can re-send the
            # chunks that are wrong rather than the whole leg again.
            total = int(manifest.get("totalChunks") or 0)
            json_response(
                self,
                HTTPStatus.CONFLICT,
                {
                    "error": str(err),
                    "uploadId": manifest.get("uploadId"),
                    "received": upload_received(folder, total),
                    "totalChunks": total,
                },
            )
            return
        except (OSError, UnicodeDecodeError) as err:
            json_response(self, HTTPStatus.CONFLICT, {"error": f"could not read the uploaded parts: {err}"})
            return

        try:
            incoming = json.loads(text)
        except json.JSONDecodeError as err:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"the assembled leg is not valid JSON: {err}"})
            return

        path = voyage_leg_path(vessel_part, voyage, condition)
        merged = self._merge_leg(vessel_part, voyage, condition, path, incoming)
        # Only now, once the leg is stored, are the parts no longer needed.
        delete_upload(folder)
        merged["uploadId"] = manifest.get("uploadId")
        merged["digestVerified"] = manifest.get("digestAlgo") == "sha256"
        json_response(self, HTTPStatus.OK, merged)

    def _upload_abandon(self, vessel_part: str, upload_id: str) -> None:
        try:
            folder = upload_dir(vessel_part, upload_id)
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid upload id"})
            return
        delete_upload(folder)
        json_response(self, HTTPStatus.OK, {"ok": True, "uploadId": upload_id})

    def _merge_leg(
        self, vessel_part: str, voyage: str, condition: str, path: Path, incoming: dict
    ) -> dict:
        """Merge an incoming snapshot into the stored leg and write it.

        Shared by the single-request PUT and the completion of a chunked upload,
        deliberately: a leg that arrived in pieces must be merged by exactly the
        same rules as one that arrived whole, or the two routes would drift and
        only one of them would be the tested one.
        """
        existing = None
        # Prefer folder file; also merge from legacy flat if only that exists
        read_path = resolve_leg_path(vessel_part, voyage, condition)
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
        # The copy on disk does not carry the scans inline. They live in the
        # blob store, so the next pull is the leg plus only the files this
        # device does not already have.
        stored, _changed = detach_data_urls(vessel_part, merged)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(stored), encoding="utf-8")
        if self._wants_compact():
            return stored
        return expand_blob_refs(vessel_part, stored)


def _misc_row_ts(item: dict) -> str:
    return str(
        item.get("updatedAt")
        or item.get("savedAt")
        or item.get("printedAt")
        or item.get("createdAt")
        or item.get("date")
        or ""
    )


def merge_misc_list(server_items, client_items, tombstones, cap: int = 0) -> list:
    """Union a setup list. Newest stamp per id wins. A row with no id is kept."""
    dead = {str(x) for x in (tombstones or []) if x}
    by_id: dict = {}
    loose: list = []
    for row in list(server_items or []) + list(client_items or []):
        if not isinstance(row, dict):
            continue
        rid = row.get("id")
        if rid is None or rid == "":
            loose.append(row)
            continue
        if str(rid) in dead:
            continue
        prev = by_id.get(rid)
        if prev is None or _misc_row_ts(row) >= _misc_row_ts(prev):
            by_id[rid] = row
    out = list(by_id.values()) + loose
    out.sort(key=_misc_row_ts, reverse=True)
    if cap and len(out) > cap:
        out = out[:cap]
    return out


def merge_orb_tank_group(chosen_list, other_list, tombstones) -> list:
    """Chosen side's tanks, then any tank only the other side has."""
    dead = {str(x) for x in (tombstones or []) if x}
    out: list = []
    seen: set = set()
    for row in chosen_list or []:
        if not isinstance(row, dict):
            continue
        rid = row.get("id")
        if rid is not None and str(rid) in dead:
            continue
        if rid is not None:
            if rid in seen:
                continue
            seen.add(rid)
        out.append(row)
    for row in other_list or []:
        if not isinstance(row, dict):
            continue
        rid = row.get("id")
        if rid is None or rid == "" or str(rid) in dead or rid in seen:
            continue
        seen.add(rid)
        out.append(row)
    return out


def apply_misc_to_setup(chosen, other, deleted) -> dict:
    """Setup fields from the newer side; miscellaneous lists from both."""
    out = copy.deepcopy(chosen) if isinstance(chosen, dict) else {}
    other = other if isinstance(other, dict) else {}
    deleted = deleted or {}
    for key, cap in MISC_SETUP_LISTS:
        if not isinstance(out.get(key), list) and not isinstance(other.get(key), list):
            continue
        # Chosen second, so an equal stamp keeps the side that won the setup.
        out[key] = merge_misc_list(other.get(key), out.get(key), deleted.get(key), cap)
    orb = out.get("orb")
    other_orb = other.get("orb") if isinstance(other.get("orb"), dict) else {}
    if isinstance(orb, dict):
        tanks = dict(orb.get("tanks") or {})
        other_tanks = other_orb.get("tanks") or {}
        for group in ORB_TANK_GROUPS:
            chosen_list = tanks.get(group)
            other_list = other_tanks.get(group)
            if not isinstance(chosen_list, list) and not isinstance(other_list, list):
                continue
            tanks[group] = merge_orb_tank_group(chosen_list, other_list, deleted.get("orbTanks"))
        orb = dict(orb)
        orb["tanks"] = tanks
        out["orb"] = orb
    elif other_orb:
        out["orb"] = copy.deepcopy(other_orb)
    # The plan being drafted is one object. A newer setup stamp must not keep
    # an older plan and drop the one edited on this device.
    plan = _newer_misc_doc(out.get("bunkerPlan"), other.get("bunkerPlan"))
    if isinstance(plan, dict):
        out["bunkerPlan"] = plan
    return out


def _newer_misc_doc(a, b):
    if not isinstance(a, dict):
        return copy.deepcopy(b) if isinstance(b, dict) else None
    if not isinstance(b, dict):
        return a
    ta = str(a.get("updatedAt") or a.get("savedAt") or "")
    tb = str(b.get("updatedAt") or b.get("savedAt") or "")
    return a if ta >= tb else copy.deepcopy(b)


def collect_vessel_misc(vessel: str) -> dict:
    """The ship's miscellaneous data across every leg on this server.

    Requisitions, plan snapshots and e-ORB entries ride inside whichever leg
    was open when they were sent, so no single leg holds them all. Union them
    the way a leg merge does -- newest stamp per id, deleted ids left out --
    and take the newest consumption plan and oil record book set-up.
    """
    deleted: dict = {}
    lists: dict[str, list] = {key: [] for key, _cap in MISC_SETUP_LISTS}
    orb_entries: list = []
    plan = None
    orb = None
    orb_at = ""
    legs = 0
    for voyage in list_voyages(vessel):
        for cond in voyage.get("conditions") or []:
            try:
                path = resolve_leg_path(vessel, voyage["voyageNumber"], cond["condition"])
            except (KeyError, ValueError):
                continue
            data = _leg_payload(path)
            if not data:
                continue
            legs += 1
            inner = data.get("data") if isinstance(data.get("data"), dict) else data
            deleted = merge_deleted_maps(deleted, inner.get("deletedIds"))
            setup = _setup_from_leg(data)
            for key, _cap in MISC_SETUP_LISTS:
                lists[key] = merge_misc_list(lists[key], setup.get(key), [], 0)
            orb_entries = merge_misc_list(orb_entries, inner.get("orbEntries"), [], 0)
            orb_entries = merge_misc_list(orb_entries, setup.get("orbEntries"), [], 0)
            orb_cfg = setup.get("orb")
            if isinstance(orb_cfg, dict):
                book = orb_cfg.get("sealedBook")
                if isinstance(book, dict):
                    orb_entries = merge_misc_list(orb_entries, book.get("entries"), [], 0)
            plan = _newer_misc_doc(plan, setup.get("bunkerPlan"))
            setup_at = str((setup.get("sync") or {}).get("lastModifiedAt") or data.get("updatedAt") or "")
            if isinstance(setup.get("orb"), dict) and setup_at >= orb_at:
                orb, orb_at = setup["orb"], setup_at
    for key, cap in MISC_SETUP_LISTS:
        lists[key] = merge_misc_list(lists[key], [], deleted.get(key), cap)
    orb_entries = merge_misc_list(orb_entries, [], deleted.get("orbEntries"), 0)
    if isinstance(orb, dict) and orb_entries:
        orb = dict(orb)
        book = orb.get("sealedBook") if isinstance(orb.get("sealedBook"), dict) else {}
        orb["sealedBook"] = {
            "entries": orb_entries,
            "count": len(orb_entries),
            "head": book.get("head") or "",
            "sealedAt": orb_at,
        }
    return {
        "legs": legs,
        **lists,
        "orbEntries": orb_entries,
        "bunkerPlan": plan,
        "orb": orb,
        "deletedIds": {k: deleted.get(k) or [] for k in ("requisitions", "bunkerPlanHistory", "orbEntries")},
    }


def brief_vessel_misc(misc: dict) -> dict:
    """Ids and stamps only. Requisitions carry scanned files; a check needs none of them."""
    def rows(items):
        return [{"id": r.get("id"), "at": _misc_row_ts(r)} for r in items or [] if isinstance(r, dict) and r.get("id")]
    plan = misc.get("bunkerPlan")
    return {
        "legs": misc.get("legs", 0),
        "requisitions": rows(misc.get("requisitions")),
        "bunkerPlanHistory": rows(misc.get("bunkerPlanHistory")),
        "orbEntries": rows(misc.get("orbEntries")),
        "bunkerPlanAt": str((plan or {}).get("updatedAt") or (plan or {}).get("savedAt") or "") if isinstance(plan, dict) else "",
        "orbConfigured": isinstance(misc.get("orb"), dict) and bool(misc.get("orb")),
    }


def merge_open_work_draft(server_doc, client_doc):
    """The half-typed log or oil-record form. A blank side does not erase one."""
    def blank(doc) -> bool:
        if not isinstance(doc, dict) or not doc:
            return True
        return not (doc.get("log") or doc.get("orb"))

    def stamp(doc) -> str:
        return str(doc.get("savedAt") or doc.get("updatedAt") or "")

    if blank(client_doc):
        return None if blank(server_doc) else copy.deepcopy(server_doc)
    if blank(server_doc):
        return copy.deepcopy(client_doc)
    if stamp(client_doc) >= stamp(server_doc):
        return copy.deepcopy(client_doc)
    return copy.deepcopy(server_doc)


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
            merged["data"]["setup"] = newer_setup(server_items, client_items, deleted)
            continue

        if not isinstance(server_items, list) and not isinstance(client_items, list):
            merged["data"][key] = client_items or server_items
            continue

        items = merge_lists_by_id(server_items or [], client_items or [])
        gone = set(deleted.get(key) or [])
        if gone:
            items = [i for i in items if i.get("id") not in gone]
        if key == "entries":
            entry_deleted = deleted.setdefault("entries", [])
            items = dedupe_entries_by_content(items, entry_deleted)
            gone = set(entry_deleted)
            if gone:
                items = [i for i in items if i.get("id") not in gone]
        merged["data"][key] = items

    merged["data"]["deletedIds"] = deleted
    for key in ("orbEntries",):
        server_items = server_data.get(key)
        client_items = client_data.get(key)
        if not isinstance(server_items, list) and not isinstance(client_items, list):
            if client_items is not None or server_items is not None:
                merged["data"][key] = client_items if client_items is not None else server_items
            continue
        items = merge_lists_by_id(server_items or [], client_items or [])
        gone = set(deleted.get(key) or [])
        if gone:
            items = [i for i in items if i.get("id") not in gone]
        merged["data"][key] = items
    draft = merge_open_work_draft(server_data.get("openWorkDraft"), client_data.get("openWorkDraft"))
    if draft is not None:
        merged["data"]["openWorkDraft"] = draft
    return merged


def merge_deleted_maps(a: dict | None, b: dict | None) -> dict:
    out: dict[str, list] = {k: [] for k in TOMBSTONE_KEYS}
    for src in (a or {}, b or {}):
        for key in TOMBSTONE_KEYS:
            vals = src.get(key) or []
            if isinstance(vals, list):
                out[key].extend(str(v) for v in vals if v)
    for key in TOMBSTONE_KEYS:
        seen: list[str] = []
        for v in out[key]:
            if v not in seen:
                seen.append(v)
        out[key] = seen[-500:]
    return out


def newer_setup(server_setup: dict | None, client_setup: dict | None, deleted: dict | None = None) -> dict:
    server_setup = server_setup or {}
    client_setup = client_setup or {}
    server_ts = (server_setup.get("sync") or {}).get("lastModifiedAt") or ""
    client_ts = (client_setup.get("sync") or {}).get("lastModifiedAt") or ""
    if client_ts >= server_ts:
        chosen, other = client_setup, server_setup
    else:
        chosen, other = server_setup, client_setup
    return apply_misc_to_setup(chosen, other, deleted)


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


def entry_content_key(item: dict) -> str | None:
    """Voyage + condition + datetime + operation — same watch, different offline ids."""
    if not isinstance(item, dict):
        return None
    dt = str(item.get("datetime") or "").strip()
    if not dt:
        return None
    vid = str(item.get("vesselId") or "")
    vn = str(item.get("voyageNumber") or "").strip() or "_"
    cond = str(item.get("condition") or "B").strip().upper()
    if cond in ("BALLAST",):
        cond = "B"
    elif cond in ("LADEN", "LOADED"):
        cond = "L"
    op = str(item.get("operation") or "_").strip().upper() or "_"
    return f"{vid}|{vn}|{cond}|{dt}|{op}"


def dedupe_entries_by_content(items: list, deleted_entries: list | None = None) -> list:
    """Keep the newest row per content key; append loser ids onto deleted_entries."""
    best: dict[str, dict] = {}
    passthrough: list = []
    losers: list[str] = []
    for item in items or []:
        if not isinstance(item, dict) or not item.get("id"):
            passthrough.append(item)
            continue
        key = entry_content_key(item)
        if not key:
            passthrough.append(item)
            continue
        prev = best.get(key)
        if not prev:
            best[key] = item
            continue
        prefer_new = record_ts(item) >= record_ts(prev)
        keep, drop = (item, prev) if prefer_new else (prev, item)
        best[key] = keep
        if drop.get("id") and drop["id"] != keep.get("id"):
            losers.append(drop["id"])
    if deleted_entries is not None:
        for lid in losers:
            if lid not in deleted_entries:
                deleted_entries.append(lid)
    return passthrough + list(best.values())


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
