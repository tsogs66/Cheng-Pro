#!/usr/bin/env python3
"""Central account database for Voyage Chief.

One SQLite file beside the voyage JSON holds every login and every vessel:

  accounts   one row per login — admin, or a vessel user bound to one vessel_id
  vessels    the fleet register: slug, name, IMO, company, sync token
  sessions   bearer tokens handed out by /api/auth/login, with an expiry

A vessel's sync token is DERIVED, not random: HMAC-SHA256 over the vessel name
and IMO number under a server-held secret. The same name and IMO therefore
always regenerate the same token on the same server, so a ship that loses its
token gets it back by typing its name and IMO again — no reset, no re-issue.
The secret lives in this database, so tokens survive a restart but cannot be
recomputed by anyone who does not hold the file.

Passwords are PBKDF2-HMAC-SHA256 with a per-account salt. A device that has
signed in once holds a random enrollment secret, not a password verifier —
offline unlock proves the laptop, not the password. Stdlib only.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

PBKDF2_ROUNDS = 240_000
SESSION_TTL_HOURS = 12
TOKEN_LENGTH = 40
SLUG_RE = re.compile(r"^[a-zA-Z0-9._-]{1,64}$")

# No i, l, o, 0 or 1: this gets read off a handover sheet and typed on a ship's
# laptop, and a password nobody can transcribe gets written on a sticky note.
PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
PASSWORD_GROUPS = 4
PASSWORD_GROUP_SIZE = 4


def generate_password() -> str:
    """A password the office cannot choose badly.

    Typed once, at first enrollment (and on a replacement laptop). Four groups of
    four from a 31-character alphabet is about 79 bits, and it survives being
    read off a handover sheet.
    """
    return "-".join(
        "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_GROUP_SIZE))
        for _ in range(PASSWORD_GROUPS)
    )

ROLE_ADMIN = "fleet_manager"
ROLE_VESSEL = "chief_engineer"
# Older databases wrote these names; both still authenticate.
LEGACY_ROLES = {"admin": ROLE_ADMIN, "vessel": ROLE_VESSEL}
ALL_ROLES = (ROLE_ADMIN, ROLE_VESSEL)


def canonical_role(role: str) -> str:
    role = (role or "").strip()
    return LEGACY_ROLES.get(role, role)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    return moment.isoformat()


class AccountError(Exception):
    """Bad input from a caller — safe to report back as a 4xx."""


def normalize_imo(value: str) -> str:
    """IMO 9722101, imo9722101 and 9722101 are the same ship.

    The token is derived from this, so the normalization has to be stable or a
    ship would get a different token depending on how someone typed it.
    """
    digits = re.sub(r"\D", "", str(value or ""))
    if not digits:
        raise AccountError("IMO number is required and must contain digits")
    if len(digits) > 15:
        raise AccountError("IMO number is too long")
    return digits


def normalize_vessel_name(value: str) -> str:
    """Case and inner spacing are ignored: 'M/V  Fangcheng' == 'm/v fangcheng'."""
    name = re.sub(r"\s+", " ", str(value or "")).strip()
    if not name:
        raise AccountError("Vessel name is required")
    if len(name) > 120:
        raise AccountError("Vessel name is too long")
    return name.upper()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value or "").strip().lower())
    slug = re.sub(r"-{2,}", "-", slug).strip("-.")
    return slug[:64]


class AccountStore:
    """Thread-safe wrapper over the SQLite account database."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._create_schema()
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    # ---------------------------------------------------------------- schema

    def _create_schema(self) -> None:
        with self._lock, self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS vessels (
                    vessel_id   TEXT PRIMARY KEY,
                    vessel_name TEXT NOT NULL,
                    imo         TEXT NOT NULL UNIQUE,
                    company     TEXT NOT NULL DEFAULT '',
                    token       TEXT NOT NULL,
                    created_at  TEXT NOT NULL,
                    created_by  TEXT NOT NULL DEFAULT '',
                    pending_review INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS accounts (
                    username      TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    role          TEXT NOT NULL,
                    vessel_id     TEXT,
                    created_at    TEXT NOT NULL,
                    disabled      INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token      TEXT PRIMARY KEY,
                    username   TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS assignments (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    username    TEXT NOT NULL,
                    vessel_id   TEXT NOT NULL,
                    assigned_at TEXT NOT NULL,
                    released_at TEXT,
                    assigned_by TEXT NOT NULL DEFAULT '',
                    note        TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS devices (
                    device_id    TEXT PRIMARY KEY,
                    username     TEXT NOT NULL,
                    secret_hash  TEXT NOT NULL,
                    secret_salt  TEXT NOT NULL,
                    label        TEXT NOT NULL DEFAULT '',
                    created_at   TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    revoked      INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_vessel_token ON vessels(token);
                CREATE INDEX IF NOT EXISTS idx_assign_user ON assignments(username);
                CREATE INDEX IF NOT EXISTS idx_assign_vessel ON assignments(vessel_id);
                CREATE INDEX IF NOT EXISTS idx_device_user ON devices(username);
                -- One live posting per engineer: a second open row would make
                -- "which ship am I on" ambiguous at handover.
                CREATE UNIQUE INDEX IF NOT EXISTS idx_assign_one_open
                    ON assignments(username) WHERE released_at IS NULL;
                """
            )
            # One live chief engineer per ship: older databases allowed two
            # open postings on the same vessel. Close the extras, then index.
            self._ensure_one_chief_per_ship()

    def _ensure_one_chief_per_ship(self) -> None:
        """A ship has one live chief engineer. Older double-postings are closed
        so the unique index can be created on databases that predate the rule."""
        now = iso(utc_now())
        rows = self._conn.execute(
            "SELECT id, vessel_id FROM assignments "
            "WHERE released_at IS NULL ORDER BY assigned_at DESC, id DESC"
        ).fetchall()
        seen: set[str] = set()
        for row in rows:
            if row["vessel_id"] in seen:
                self._conn.execute(
                    "UPDATE assignments SET released_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
            else:
                seen.add(row["vessel_id"])
        # Keep accounts.vessel_id in line with the surviving live posting.
        self._conn.execute(
            "UPDATE accounts SET vessel_id = ("
            "  SELECT vessel_id FROM assignments "
            "  WHERE assignments.username = accounts.username "
            "    AND released_at IS NULL"
            ")"
        )
        self._conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_assign_one_ce_per_ship "
            "ON assignments(vessel_id) WHERE released_at IS NULL"
        )

    # -------------------------------------------------------------- settings

    def _get_setting(self, key: str) -> str | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            ).fetchone()
        return row["value"] if row else None

    def _set_setting(self, key: str, value: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def token_secret(self) -> str:
        """The HMAC key behind every vessel token. Created once, then reused."""
        secret = self._get_setting("token_secret")
        if not secret:
            secret = secrets.token_hex(32)
            self._set_setting("token_secret", secret)
        return secret

    # ----------------------------------------------------------------- token

    def derive_token(self, vessel_name: str, imo: str) -> str:
        """The key generator: same name + IMO on this server -> same token."""
        material = f"{normalize_vessel_name(vessel_name)}|{normalize_imo(imo)}"
        digest = hmac.new(
            self.token_secret().encode("utf-8"), material.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return digest[:TOKEN_LENGTH]

    # -------------------------------------------------------------- accounts

    @staticmethod
    def _hash_password(password: str, salt: str) -> str:
        if not password or len(password) < 6:
            raise AccountError("Password must be at least 6 characters")
        return hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ROUNDS
        ).hex()

    def create_account(
        self, username: str, password: str, role: str, vessel_id: str | None = None,
        generate: bool = False
    ) -> dict:
        """Create a login. With generate=True the supplied password is ignored and
        a strong one is made instead; the plaintext comes back in the returned dict
        under "password" and is never stored — that return value is the only copy."""
        generated = generate_password() if generate else ""
        if generate:
            password = generated
        username = (username or "").strip().lower()
        if not SLUG_RE.match(username):
            raise AccountError(
                "Username must be 1-64 characters, letters/digits/dot/dash/underscore"
            )
        role = canonical_role(role)
        if role not in ALL_ROLES:
            raise AccountError(f"Role must be one of {', '.join(ALL_ROLES)}")
        # vessel_id is the engineer's CURRENT posting; assignments hold the history.
        salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, salt)
        try:
            with self._lock, self._conn:
                self._conn.execute(
                    "INSERT INTO accounts "
                    "(username, password_hash, password_salt, role, vessel_id, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (username, password_hash, salt, role, vessel_id, iso(utc_now())),
                )
        except sqlite3.IntegrityError as exc:
            raise AccountError(f"Username '{username}' already exists") from exc
        # The plaintext rides back on this one return value and is stored nowhere.
        out = {"username": username, "role": role, "vesselId": vessel_id}
        if generated:
            out["password"] = generated
        return out

    def set_password(self, username: str, password: str) -> None:
        salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, salt)
        with self._lock, self._conn:
            cur = self._conn.execute(
                "UPDATE accounts SET password_hash = ?, password_salt = ? WHERE username = ?",
                (password_hash, salt, (username or "").strip().lower()),
            )
        if cur.rowcount == 0:
            raise AccountError("No such account")

    def delete_account(self, username: str) -> None:
        username = (username or "").strip().lower()
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM sessions WHERE username = ?", (username,))
            self._conn.execute("DELETE FROM devices WHERE username = ?", (username,))
            cur = self._conn.execute("DELETE FROM accounts WHERE username = ?", (username,))
        if cur.rowcount == 0:
            raise AccountError("No such account")

    def get_account(self, username: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM accounts WHERE username = ?",
                ((username or "").strip().lower(),),
            ).fetchone()
        return dict(row) if row else None

    def list_accounts(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT a.username, a.role, a.created_at, a.disabled, "
                "       COALESCE(s.vessel_id, a.vessel_id) AS vessel_id "
                "FROM accounts a "
                "LEFT JOIN assignments s "
                "  ON s.username = a.username AND s.released_at IS NULL "
                "ORDER BY a.role DESC, a.username"
            ).fetchall()
        return [
            {
                "username": r["username"],
                "role": r["role"],
                "vesselId": r["vessel_id"],
                "createdAt": r["created_at"],
                "disabled": bool(r["disabled"]),
            }
            for r in rows
        ]

    def has_admin(self) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT 1 FROM accounts WHERE role = ? LIMIT 1", (ROLE_ADMIN,)
            ).fetchone()
        return row is not None

    def verify_password(self, username: str, password: str) -> dict | None:
        account = self.get_account(username)
        if not account or account["disabled"]:
            # Spend the same work on a missing account so timing does not leak
            # which usernames exist.
            hashlib.pbkdf2_hmac("sha256", b"x", b"x" * 16, PBKDF2_ROUNDS)
            return None
        try:
            candidate = hashlib.pbkdf2_hmac(
                "sha256",
                (password or "").encode("utf-8"),
                bytes.fromhex(account["password_salt"]),
                PBKDF2_ROUNDS,
            ).hex()
        except ValueError:
            return None
        if hmac.compare_digest(candidate, account["password_hash"]):
            return account
        return None

    # --------------------------------------------------------------- vessels

    def upsert_vessel(
        self, vessel_name: str, imo: str, company: str = "", vessel_id: str | None = None,
        created_by: str = "", pending_review: bool = False
    ) -> dict:
        """Register a vessel and mint its token. Re-registering the same IMO
        updates the details in place and keeps the same slug."""
        name = normalize_vessel_name(vessel_name)
        imo_digits = normalize_imo(imo)
        token = self.derive_token(vessel_name, imo)
        display_name = re.sub(r"\s+", " ", str(vessel_name)).strip()

        existing = self.get_vessel_by_imo(imo_digits)
        slug = vessel_id or (existing or {}).get("vesselId") or slugify(name)
        if not SLUG_RE.match(slug or ""):
            raise AccountError("Could not derive a valid vessel id — set one explicitly")

        clash = self.get_vessel(slug)
        if clash and clash["imo"] != imo_digits:
            raise AccountError(
                f"Vessel id '{slug}' already belongs to IMO {clash['imo']} — choose another"
            )

        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO vessels "
                "(vessel_id, vessel_name, imo, company, token, created_at, created_by, pending_review) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(imo) DO UPDATE SET "
                "  vessel_name = excluded.vessel_name, "
                "  company = excluded.company, "
                "  token = excluded.token",
                (slug, display_name, imo_digits, str(company or "").strip(), token,
                 iso(utc_now()), created_by or "", 1 if pending_review else 0),
            )
        return self.get_vessel(slug) or {}

    def _vessel_row_to_dict(self, row: sqlite3.Row) -> dict:
        return {
            "vesselId": row["vessel_id"],
            "vesselName": row["vessel_name"],
            "imo": row["imo"],
            "company": row["company"],
            "token": row["token"],
            "createdAt": row["created_at"],
            "createdBy": row["created_by"],
            "pendingReview": bool(row["pending_review"]),
        }

    def get_vessel(self, vessel_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM vessels WHERE vessel_id = ?", (vessel_id or "",)
            ).fetchone()
        return self._vessel_row_to_dict(row) if row else None

    def get_vessel_by_imo(self, imo: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM vessels WHERE imo = ?", (normalize_imo(imo),)
            ).fetchone()
        return self._vessel_row_to_dict(row) if row else None

    def get_vessel_by_token(self, token: str) -> dict | None:
        """Constant-time match so a wrong token cannot be narrowed by timing."""
        if not token:
            return None
        with self._lock:
            rows = self._conn.execute("SELECT * FROM vessels").fetchall()
        match = None
        for row in rows:
            if hmac.compare_digest(row["token"], token):
                match = row
        return self._vessel_row_to_dict(match) if match else None

    def list_vessels(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT v.*, s.username AS chief_engineer "
                "FROM vessels v "
                "LEFT JOIN assignments s "
                "  ON s.vessel_id = v.vessel_id AND s.released_at IS NULL "
                "ORDER BY v.vessel_name"
            ).fetchall()
        out = []
        for row in rows:
            item = self._vessel_row_to_dict(row)
            item["chiefEngineer"] = row["chief_engineer"]
            out.append(item)
        return out


    def approve_vessel(self, vessel_id: str) -> dict:
        """Clear the pending flag on a vessel that was registered from a ship."""
        with self._lock, self._conn:
            cur = self._conn.execute(
                "UPDATE vessels SET pending_review = 0 WHERE vessel_id = ?", (vessel_id or "",)
            )
        if cur.rowcount == 0:
            raise AccountError(f"No vessel '{vessel_id}' is registered")
        return self.get_vessel(vessel_id)

    def pending_vessels(self) -> list[dict]:
        """Vessels that appeared from a ship rather than from the office."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM vessels WHERE pending_review = 1 ORDER BY created_at DESC"
            ).fetchall()
        return [self._vessel_row_to_dict(r) for r in rows]

    def delete_vessel(self, vessel_id: str) -> None:
        with self._lock, self._conn:
            cur = self._conn.execute(
                "DELETE FROM vessels WHERE vessel_id = ?", (vessel_id or "",)
            )
            self._conn.execute(
                "DELETE FROM sessions WHERE username IN "
                "(SELECT username FROM accounts WHERE vessel_id = ?)",
                (vessel_id or "",),
            )
            self._conn.execute(
                "DELETE FROM accounts WHERE vessel_id = ?", (vessel_id or "",)
            )
        if cur.rowcount == 0:
            raise AccountError("No such vessel")


    # ------------------------------------------------------------ assignments
    #
    # An assignment is a PERIOD, not a field. That one choice gives transfer,
    # service history and the access rule the same shape:
    #
    #   read   any vessel the engineer has ever been assigned to
    #   write  only the vessel he is assigned to right now
    #
    # So a relieved engineer keeps the history he sailed but cannot alter the
    # record after signing off, and his relief inherits the full prior log —
    # which this app needs, since opening ROB and meter readings carry over.

    def assign_vessel(
        self,
        username: str,
        vessel_id: str,
        assigned_by: str = "",
        note: str = "",
        displace: bool = True,
    ) -> dict:
        """Post an engineer to a ship.

        One live chief engineer per ship. The office may displace the incumbent
        (`displace=True`, the default): that person is signed off in the same
        transaction. A claim from the ship must not (`displace=False`) — kicking
        someone off is an office action. Re-posting the same pairing is a no-op.
        """
        username = (username or "").strip().lower()
        account = self.get_account(username)
        if not account:
            raise AccountError(f"No account '{username}'")
        if canonical_role(account["role"]) == ROLE_ADMIN:
            raise AccountError("A fleet manager is not posted to a ship")
        vessel = self.get_vessel(vessel_id)
        if not vessel:
            raise AccountError(f"No vessel '{vessel_id}' is registered")

        current = self.current_vessel(username)
        if current == vessel["vesselId"]:
            return {
                "username": username,
                "vesselId": vessel["vesselId"],
                "vesselName": vessel["vesselName"],
                "unchanged": True,
                "displaced": None,
            }

        now = iso(utc_now())
        displaced = None
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE assignments SET released_at = ? "
                "WHERE username = ? AND released_at IS NULL",
                (now, username),
            )
            occupant = self._conn.execute(
                "SELECT username FROM assignments "
                "WHERE vessel_id = ? AND released_at IS NULL",
                (vessel["vesselId"],),
            ).fetchone()
            if occupant and occupant["username"] != username:
                if not displace:
                    raise AccountError(
                        f"{vessel['vesselName']} already has a chief engineer "
                        f"({occupant['username']}). Ask the office to assign you."
                    )
                displaced = occupant["username"]
                self._conn.execute(
                    "UPDATE assignments SET released_at = ? "
                    "WHERE vessel_id = ? AND released_at IS NULL",
                    (now, vessel["vesselId"]),
                )
                self._conn.execute(
                    "UPDATE accounts SET vessel_id = NULL WHERE username = ?",
                    (displaced,),
                )
            try:
                self._conn.execute(
                    "INSERT INTO assignments "
                    "(username, vessel_id, assigned_at, assigned_by, note) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (username, vessel["vesselId"], now, assigned_by or "", note or ""),
                )
            except sqlite3.IntegrityError as exc:
                raise AccountError(
                    f"{vessel['vesselName']} already has a chief engineer. "
                    "Ask the office to assign you."
                ) from exc
            self._conn.execute(
                "UPDATE accounts SET vessel_id = ? WHERE username = ?",
                (vessel["vesselId"], username),
            )
        return {
            "username": username,
            "vesselId": vessel["vesselId"],
            "vesselName": vessel["vesselName"],
            "assignedAt": now,
            "previousVesselId": current,
            "displaced": displaced,
            "unchanged": False,
        }

    def release_vessel(self, username: str) -> None:
        """Sign an engineer off without posting them anywhere else."""
        username = (username or "").strip().lower()
        now = iso(utc_now())
        with self._lock, self._conn:
            cur = self._conn.execute(
                "UPDATE assignments SET released_at = ? "
                "WHERE username = ? AND released_at IS NULL",
                (now, username),
            )
            self._conn.execute(
                "UPDATE accounts SET vessel_id = NULL WHERE username = ?", (username,)
            )
        if cur.rowcount == 0:
            raise AccountError(f"'{username}' is not assigned to a vessel")

    def current_engineer(self, vessel_id: str) -> str | None:
        """Who is the live chief engineer on this ship, if anyone."""
        with self._lock:
            row = self._conn.execute(
                "SELECT username FROM assignments "
                "WHERE vessel_id = ? AND released_at IS NULL "
                "ORDER BY assigned_at DESC LIMIT 1",
                (vessel_id or "",),
            ).fetchone()
        return row["username"] if row else None

    def current_vessel(self, username: str) -> str | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT vessel_id FROM assignments "
                "WHERE username = ? AND released_at IS NULL",
                ((username or "").strip().lower(),),
            ).fetchone()
        return row["vessel_id"] if row else None

    def readable_vessels(self, username: str) -> list[str]:
        """Every ship this engineer has ever sailed — their service history."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT DISTINCT vessel_id FROM assignments WHERE username = ?",
                ((username or "").strip().lower(),),
            ).fetchall()
        return [r["vessel_id"] for r in rows]

    def assignment_history(self, username: str | None = None,
                           vessel_id: str | None = None) -> list[dict]:
        sql = ("SELECT a.*, v.vessel_name, v.imo, v.company FROM assignments a "
               "LEFT JOIN vessels v ON v.vessel_id = a.vessel_id WHERE 1=1")
        args: list = []
        if username:
            sql += " AND a.username = ?"
            args.append((username or "").strip().lower())
        if vessel_id:
            sql += " AND a.vessel_id = ?"
            args.append(vessel_id)
        sql += " ORDER BY a.assigned_at DESC"
        with self._lock:
            rows = self._conn.execute(sql, args).fetchall()
        return [
            {
                "username": r["username"],
                "vesselId": r["vessel_id"],
                "vesselName": r["vessel_name"],
                "imo": r["imo"],
                "company": r["company"],
                "assignedAt": r["assigned_at"],
                "releasedAt": r["released_at"],
                "assignedBy": r["assigned_by"],
                "note": r["note"],
                "current": r["released_at"] is None,
            }
            for r in rows
        ]

    def vessel_crew(self, vessel_id: str) -> dict:
        """Who is on this ship now, and who has been."""
        history = self.assignment_history(vessel_id=vessel_id)
        current = next((h["username"] for h in history if h["current"]), None)
        return {"vesselId": vessel_id, "chiefEngineer": current, "history": history}

    def claim_vessel(self, username: str, vessel_id: str) -> dict:
        """An unassigned engineer picks an empty registered ship.

        The office still creates the vessel and the account. This only opens the
        posting, and only when he is on none and the ship has no live chief
        engineer — it is not a transfer, and it will not kick anyone off.
        """
        username = (username or "").strip().lower()
        account = self.get_account(username)
        if not account:
            raise AccountError(f"No account '{username}'")
        if canonical_role(account["role"]) == ROLE_ADMIN:
            raise AccountError("A fleet manager is not posted to a ship")
        if self.current_vessel(username):
            raise AccountError(
                "Already assigned to a vessel — ask the office to transfer you"
            )
        vessel = self.get_vessel(vessel_id)
        if not vessel:
            raise AccountError(f"No vessel '{vessel_id}' is registered")
        occupant = self.current_engineer(vessel["vesselId"])
        if occupant and occupant != username:
            raise AccountError(
                f"{vessel['vesselName']} already has a chief engineer ({occupant}). "
                "Ask the office to assign you."
            )
        return self.assign_vessel(
            username,
            vessel["vesselId"],
            assigned_by=username,
            note="claimed at first sign-in",
            displace=False,
        )


    # -------------------------------------------------------- device enrollment
    #
    # A laptop earns offline access by signing in online once. The device then
    # holds a random secret the server hashed — not a password verifier. Offline
    # unlock proves this laptop, so the generated password is only typed at first
    # enrollment (and on a replacement machine). A stolen laptop is revoked from
    # the office; the password itself never sat on the disk to be ground at.
    #
    # Fleet manager accounts are never enrolled: office credentials have no
    # business on a ship's laptop.

    DEVICE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{16,80}$")

    @staticmethod
    def _hash_device_secret(secret: str, salt: str) -> str:
        if not secret or len(secret) < 32:
            raise AccountError("Device secret is too short")
        return hmac.new(
            bytes.fromhex(salt), secret.encode("utf-8"), hashlib.sha256
        ).hexdigest()

    def _device_row_to_dict(self, row: sqlite3.Row) -> dict:
        return {
            "deviceId": row["device_id"],
            "username": row["username"],
            "label": row["label"],
            "createdAt": row["created_at"],
            "lastSeenAt": row["last_seen_at"],
            "revoked": bool(row["revoked"]),
        }

    def enroll_device(
        self, username: str, device_id: str, secret: str, label: str = ""
    ) -> dict:
        """Bind this laptop to a chief engineer. The secret is hashed and the
        plaintext is stored only on the device that generated it."""
        username = (username or "").strip().lower()
        device_id = (device_id or "").strip()
        label = re.sub(r"\s+", " ", str(label or "")).strip()[:120]
        account = self.get_account(username)
        if not account or account["disabled"]:
            raise AccountError("No such account")
        if canonical_role(account["role"]) == ROLE_ADMIN:
            raise AccountError("Fleet manager accounts are not enrolled on a device")
        if not self.DEVICE_ID_RE.match(device_id):
            raise AccountError("Device id is not valid")

        existing = self.get_device(device_id)
        if existing and existing["username"] != username:
            raise AccountError("That device is already enrolled to someone else")
        if existing and existing["revoked"]:
            raise AccountError(
                "That device has been revoked — sign in with a password on a new one"
            )

        salt = secrets.token_hex(16)
        secret_hash = self._hash_device_secret(secret, salt)
        now = iso(utc_now())
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO devices "
                "(device_id, username, secret_hash, secret_salt, label, "
                " created_at, last_seen_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(device_id) DO UPDATE SET "
                "  secret_hash = excluded.secret_hash, "
                "  secret_salt = excluded.secret_salt, "
                "  label = excluded.label, "
                "  last_seen_at = excluded.last_seen_at",
                (device_id, username, secret_hash, salt, label, now, now),
            )
        return self.get_device(device_id) or {}

    def get_device(self, device_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM devices WHERE device_id = ?", ((device_id or "").strip(),)
            ).fetchone()
        return self._device_row_to_dict(row) if row else None

    def verify_device(self, device_id: str, secret: str) -> dict | None:
        """Return the account this device is bound to, or None."""
        device_id = (device_id or "").strip()
        if not device_id or not secret:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM devices WHERE device_id = ?", (device_id,)
            ).fetchone()
        if not row or row["revoked"]:
            return None
        try:
            candidate = self._hash_device_secret(secret, row["secret_salt"])
        except (AccountError, ValueError):
            return None
        if not hmac.compare_digest(candidate, row["secret_hash"]):
            return None
        account = self.get_account(row["username"])
        if not account or account["disabled"]:
            return None
        now = iso(utc_now())
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE devices SET last_seen_at = ? WHERE device_id = ?",
                (now, device_id),
            )
        return account

    def revoke_device(self, device_id: str) -> dict:
        device_id = (device_id or "").strip()
        with self._lock, self._conn:
            cur = self._conn.execute(
                "UPDATE devices SET revoked = 1 WHERE device_id = ?", (device_id,)
            )
        if cur.rowcount == 0:
            raise AccountError("No such device")
        return self.get_device(device_id) or {}

    def list_devices(self, username: str | None = None) -> list[dict]:
        sql = "SELECT * FROM devices"
        args: list = []
        if username:
            sql += " WHERE username = ?"
            args.append((username or "").strip().lower())
        sql += " ORDER BY last_seen_at DESC"
        with self._lock:
            rows = self._conn.execute(sql, args).fetchall()
        return [self._device_row_to_dict(r) for r in rows]

    # -------------------------------------------------------------- sessions

    def create_session(self, username: str) -> dict:
        token = secrets.token_urlsafe(32)
        now = utc_now()
        expires = now + timedelta(hours=SESSION_TTL_HOURS)
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO sessions (token, username, created_at, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (token, username, iso(now), iso(expires)),
            )
        return {"sessionToken": token, "expiresAt": iso(expires)}

    def get_session(self, token: str) -> dict | None:
        if not token:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT s.token, s.username, s.expires_at, a.role, a.vessel_id, a.disabled "
                "FROM sessions s JOIN accounts a ON a.username = s.username "
                "WHERE s.token = ?",
                (token,),
            ).fetchone()
        if not row or row["disabled"]:
            return None
        try:
            expires = datetime.fromisoformat(row["expires_at"])
        except ValueError:
            return None
        if expires <= utc_now():
            self.delete_session(token)
            return None
        return {
            "username": row["username"],
            "role": row["role"],
            "vesselId": row["vessel_id"],
            "expiresAt": row["expires_at"],
        }

    def delete_session(self, token: str) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM sessions WHERE token = ?", (token or "",))

    def purge_expired_sessions(self) -> int:
        with self._lock, self._conn:
            cur = self._conn.execute(
                "DELETE FROM sessions WHERE expires_at <= ?", (iso(utc_now()),)
            )
        return cur.rowcount

    # ------------------------------------------------------------- bootstrap

    def ensure_admin(self, username: str, password: str) -> bool:
        """Create the first admin if the database has none. True if created."""
        if self.has_admin():
            return False
        self.create_account(username, password, ROLE_ADMIN)
        return True

    def is_empty(self) -> bool:
        """No accounts at all — the server still runs in single-token mode."""
        with self._lock:
            row = self._conn.execute("SELECT 1 FROM accounts LIMIT 1").fetchone()
        return row is None
