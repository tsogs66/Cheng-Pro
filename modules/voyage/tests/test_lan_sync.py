#!/usr/bin/env python3
"""Pairing and presence for live sync between devices (sync-server/lan_sync.py + its routes).

Run: python3 tests/test_lan_sync.py
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER = REPO_ROOT / "sync-server" / "server.py"
MASTER = "master-secret-for-lan-test"
LIC = "a" * 64          # what a device sends: a hash of its license email and id
OTHER_LIC = "b" * 64

failures: list[str] = []
checks = 0


def check(label: str, actual, expected) -> None:
    global checks
    checks += 1
    if actual == expected:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label}: expected {expected!r}, got {actual!r}")
        failures.append(label)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def call(base: str, path: str, method: str = "GET", payload: dict | None = None, token: str | None = None, headers: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if data:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except json.JSONDecodeError:
            return err.code, {"raw": raw}


class Server:
    def __init__(self) -> None:
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self._tmp = tempfile.TemporaryDirectory()
        self._proc = None

    def __enter__(self):
        env = dict(os.environ)
        env.update(SYNC_HOST="127.0.0.1", SYNC_PORT=str(self.port), SYNC_DATA_DIR=self._tmp.name,
                   SYNC_API_TOKEN=MASTER, PYTHONUNBUFFERED="1")
        env.pop("SYNC_ALLOW_OPEN", None)
        self._proc = subprocess.Popen([sys.executable, str(SERVER)], env=env, stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT, text=True)
        deadline = time.time() + 20
        while time.time() < deadline:
            if self._proc.poll() is not None:
                raise RuntimeError(f"server exited early:\n{self._proc.stdout.read()}")
            try:
                if call(self.base, "/api/health")[0] == 200:
                    return self
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("server never became healthy")

    def __exit__(self, *_):
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        self._tmp.cleanup()


def main() -> int:
    with Server() as srv:
        b = srv.base
        print("\nhello and pairing")
        st, hello = call(b, "/api/voyage-lan/hello")
        check("hello is open and says what the server is", (st, hello.get("format"), hello.get("product")), (200, "cheng-lan-sync", "voyage-chief"))
        check("presence needs a credential", call(b, "/api/voyage-lan/presence")[0], 401)
        check("a wrong token is refused", call(b, "/api/voyage-lan/presence", token="guess")[0], 401)

        check("no code showing: pairing is refused", call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": "123456"})[0], 403)
        st, forwarded = call(b, "/api/voyage-lan/pair/start", "POST", {"license": LIC}, headers={"X-Forwarded-For": "203.0.113.9"})
        check("a code cannot be started by a remote caller arriving through the gateway", st, 403)

        st, started = call(b, "/api/voyage-lan/pair/start", "POST", {"license": LIC, "vessel": {"name": "MV PAIR TEST", "imo": "9100001"}})
        check("the server's own screen can show a code", (st, len(started.get("code", ""))), (200, 6))
        check("a wrong code is refused", call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": "000000" if started["code"] != "000000" else "000001"})[0], 403)
        st, paired = call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": started["code"], "deviceId": "phone-1", "deviceName": "Phone"})
        check("the right code pairs and hands over a credential", (st, paired.get("ok")), (200, True))
        check("an unregistered ship gets the server's token, and the answer says so", (paired.get("scope"), paired.get("token")), ("all", MASTER))
        check("a code is good once", call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": started["code"]})[0], 403)

        code = call(b, "/api/voyage-lan/pair/start", "POST", {"license": LIC})[1]["code"]
        wrong = "999999" if code != "999999" else "999998"
        for _ in range(5):
            call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": wrong})
        check("five wrong codes lock the code out", call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": code})[0] in (403, 429), True)

        print("\nonly the same license")
        code = call(b, "/api/voyage-lan/pair/start", "POST", {"license": LIC})[1]["code"]
        st, refused = call(b, "/api/voyage-lan/pair", "POST", {"license": OTHER_LIC, "code": code, "deviceId": "x", "deviceName": "X"})
        check("a device on another license is refused", (st, refused.get("code"), "token" in refused), (403, "different-license", False))
        check("the refusal says why, in plain words", "different licenses" in refused.get("error", ""), True)
        st, older = call(b, "/api/voyage-lan/pair", "POST", {"code": code, "deviceId": "old", "deviceName": "Old build"})
        check("a device that sends no license (an older build) is refused", (st, older.get("code")), (403, "different-license"))
        check("a device with no license is refused too", call(b, "/api/voyage-lan/pair", "POST", {"license": "", "code": code})[0], 403)
        st, good = call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": code, "deviceId": "phone-9", "deviceName": "Phone 9"})
        check("the wrong device did not use the code up: the right one still pairs, and is told whose license answered", (st, good.get("ok"), good.get("license")), (200, True, LIC))
        st, nolic = call(b, "/api/voyage-lan/pair/start", "POST", {})
        code = nolic["code"]
        st, none = call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": code})
        check("a server showing a code with no license behind it pairs nobody", (st, none.get("code")), (403, "no-license"))
        call(b, "/api/voyage-lan/presence", "POST", {"license": OTHER_LIC, "deviceId": "stranger", "deviceName": "Stranger", "vessel": {"name": "MV PAIR TEST", "imo": "9100001"}}, token=MASTER)
        st, pres = call(b, "/api/voyage-lan/presence", token=MASTER)
        row = [d for d in pres.get("devices", []) if d["deviceId"] == "stranger"]
        check("presence carries each device's license hash, so the app can tell who matches", row[0].get("license") if row else None, OTHER_LIC)

        print("\nthe ship's own token")
        st, made = call(b, "/api/admin/vessels", "POST", {"vesselName": "MV PAIR TEST", "imo": "9100001", "company": "T"}, token=MASTER)
        check("a ship is registered", (st, made.get("ok")), (200, True))
        vessel_token = made.get("vessel", {}).get("token")
        code = call(b, "/api/voyage-lan/pair/start", "POST", {"license": LIC, "vessel": {"name": "MV PAIR TEST", "imo": "9100001"}})[1]["code"]
        st, p2 = call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": code, "deviceId": "phone-2", "deviceName": "Phone 2"})
        check("a registered ship pairs with its own token, not the server's", (p2.get("scope"), p2.get("token") == vessel_token, p2.get("token") != MASTER), ("vessel", True, True))
        code = call(b, "/api/voyage-lan/pair/start", "POST", {"license": LIC, "vessel": {"name": "MV PAIR TEST", "imo": "9100001"}, "shareAll": True})[1]["code"]
        p3 = call(b, "/api/voyage-lan/pair", "POST", {"license": LIC, "code": code})[1]
        check("'share every vessel' hands over the server's token", (p3.get("scope"), p3.get("token")), ("all", MASTER))

        print("\nwho is on which ship")
        tok = p2["token"]
        st, _ = call(b, "/api/voyage-lan/presence", "POST", {"license": LIC, "deviceId": "phone-2", "deviceName": "Phone 2", "vessel": {"name": "MV PAIR TEST", "imo": "9100001"}}, token=tok)
        check("a paired device says which ship it has open", st, 200)
        call(b, "/api/voyage-lan/presence", "POST", {"license": LIC, "deviceId": "pc-1", "deviceName": "Laptop", "vessel": {"name": "MV OTHER", "imo": "9100002"}}, token=MASTER)
        st, who = call(b, "/api/voyage-lan/presence", token=tok)
        names = {d["deviceId"]: d["vessel"]["name"] for d in who.get("devices", [])}
        check("it can see who else is here and on what", (st, names.get("phone-2"), names.get("pc-1")), (200, "MV PAIR TEST", "MV OTHER"))
        st, _ = call(b, "/api/voyage/MV-OTHER-9100002", token=tok)
        check("the ship's token does not open another ship", st in (401, 403), True)

    print(f"\n{checks - len(failures)}/{checks} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
