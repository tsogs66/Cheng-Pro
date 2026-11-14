"""Pairing and presence for live sync between Voyage Chief devices on one Wi-Fi or hotspot.

Voyage Chief's data already travels through this server: the app on a phone, and the app on the
PC that runs the server, are both clients of it. What was missing is the part that made two
people type an address and a token into the right boxes, and the part that says whether the
two devices are even on the same ship. This supplies both:

  * pairing  - the PC shows a six-digit code; the phone finds the server, types the code, and is
               handed the server address and a credential, so nothing is typed by hand. The
               credential is the vessel's own token unless the person at the PC ticked "share
               every vessel", in which case it is the server's token. A code works once, for
               five minutes, and locks after five wrong tries.
  * presence - each device tells the server which vessel it has open; a device asks who else is
               here and on what. The app syncs only while the other device is on the same ship.
  * license  - devices sync only when they are on the SAME license (same email, same license id).
               Each device sends a hash of the two (never the license id); a code is refused for a
               different license without being spent, and presence carries the hash so the app
               only syncs with devices that match.

Stdlib only. The HTTP handlers live in server.py (they need its authentication).
"""

from __future__ import annotations

import json
import secrets
import threading
import time
from pathlib import Path

FORMAT = "cheng-lan-sync"
PRODUCT = "voyage-chief"
CODE_TTL_SECONDS = 5 * 60
MAX_TRIES = 5
PRESENCE_TTL_SECONDS = 3 * 60


def _norm_name(value: object) -> str:
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def _norm_imo(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _same_tag(a: object, b: object) -> bool:
    a, b = str(a or ""), str(b or "")
    return bool(a) and bool(b) and secrets.compare_digest(a.encode(), b.encode())


LICENSE_MSG = {
    "none": "Activate your license on the device showing the code first: live sync works only between devices on the same license.",
    "different": "These two devices are on different licenses. Live sync works only when both use the same email and license.",
    "older": "The other device runs a version that does not check licenses. Update it, then pair again.",
}


def same_hull(a: dict | None, b: dict | None) -> bool:
    """Same ship: the IMO number when both have one, otherwise the name."""
    if not a or not b:
        return False
    ia, ib = _norm_imo(a.get("imo")), _norm_imo(b.get("imo"))
    if ia and ib:
        return ia == ib
    na, nb = _norm_name(a.get("name")), _norm_name(b.get("name"))
    return bool(na) and na == nb


class LanSync:
    def __init__(self, data_dir: Path, default_name: str = "Voyage Chief server") -> None:
        self._lock = threading.Lock()
        self._file = Path(data_dir) / "lan-device.json"
        self._pairing: dict | None = None
        self._presence: dict[str, dict] = {}
        self._device_id = ""
        self._device_name = default_name
        try:
            saved = json.loads(self._file.read_text("utf-8"))
            self._device_id = str(saved.get("deviceId") or "")
            self._device_name = str(saved.get("deviceName") or default_name)
        except (OSError, ValueError):
            pass
        if not self._device_id:
            self._device_id = secrets.token_hex(16)
            self._save()

    def _save(self) -> None:
        try:
            self._file.parent.mkdir(parents=True, exist_ok=True)
            self._file.write_text(
                json.dumps({"deviceId": self._device_id, "deviceName": self._device_name}), "utf-8"
            )
        except OSError:
            pass  # a read-only folder must not stop the server

    # ------------------------------------------------------------------ hello

    def hello(self) -> dict:
        return {
            "format": FORMAT,
            "v": 1,
            "product": PRODUCT,
            "deviceId": self._device_id,
            "deviceName": self._device_name,
            "canBeCalled": True,
            "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    # ---------------------------------------------------------------- pairing

    def start_pairing(self, vessel: dict | None, share_all: bool, license_tag: str = "", code: str = "") -> dict:
        # One code can serve more than one program: the AIO shows a single code and hands it to Tank and Voyage.
        given = "".join(ch for ch in str(code or "") if ch.isdigit())
        code = given if len(given) == 6 else f"{secrets.randbelow(1_000_000):06d}"
        with self._lock:
            self._pairing = {
                "license": str(license_tag or "")[:128],
                "code": code,
                "expires": time.time() + CODE_TTL_SECONDS,
                "tries": 0,
                "vessel": {"name": str((vessel or {}).get("name") or ""), "imo": str((vessel or {}).get("imo") or "")},
                "shareAll": bool(share_all),
            }
        return {"code": code, "expiresIn": CODE_TTL_SECONDS, "shareAll": bool(share_all)}

    def redeem(self, code: object, license_tag: str = "") -> tuple[int, dict]:
        """Check a code. Returns (http status, {"ok": True, "vessel", "shareAll", "license"} or {"error"})."""
        with self._lock:
            p = self._pairing
            if not p or time.time() > p["expires"]:
                self._pairing = None
                return 403, {"error": "No pairing code is showing on that device. Press “Show pairing code” there first."}
            p["tries"] += 1
            if p["tries"] > MAX_TRIES:
                self._pairing = None
                return 429, {"error": "Too many wrong codes. Show a new pairing code."}
            given = "".join(ch for ch in str(code or "") if ch.isdigit())
            if not secrets.compare_digest(given.encode(), p["code"].encode()):
                return 403, {"error": "That code is not right."}
            # The licenses must match before the code is spent: a wrong device must not use it up.
            if not p.get("license"):
                return 403, {"error": LICENSE_MSG["none"], "code": "no-license"}
            if not _same_tag(license_tag, p["license"]):
                msg = LICENSE_MSG["different"] if license_tag else LICENSE_MSG["older"]
                return 403, {"error": msg, "code": "different-license"}
            self._pairing = None  # good once
            return 200, {"ok": True, "vessel": dict(p["vessel"]), "shareAll": p["shareAll"], "license": p["license"]}

    # --------------------------------------------------------------- presence

    def set_presence(self, device_id: str, name: str, vessel: dict | None, license_tag: str = "") -> None:
        if not device_id:
            return
        with self._lock:
            self._presence[str(device_id)[:80]] = {
                "deviceId": str(device_id)[:80],
                "name": str(name or "Device")[:80],
                "vessel": {"name": str((vessel or {}).get("name") or "")[:120], "imo": str((vessel or {}).get("imo") or "")[:20]},
                "license": str(license_tag or "")[:128],
                "seen": time.time(),
            }

    def presence(self) -> list[dict]:
        now = time.time()
        with self._lock:
            for key in [k for k, v in self._presence.items() if now - v["seen"] > PRESENCE_TTL_SECONDS]:
                del self._presence[key]
            return [dict(v, seen=int(now - v["seen"])) for v in self._presence.values()]
