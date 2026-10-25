#!/usr/bin/env python3
"""Auth matrix for modules/voyage/sync-server/server.py — stdlib only, no test framework.

Guards the failure this suite was written for: a server whose SYNC_API_TOKEN never
reached the process used to accept anonymous requests and reject every authenticated
one, so a correctly configured app got a 401 that looked like a bad token.

Run: python3 scripts/test-sync-auth.py
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
SERVER = REPO_ROOT / "modules" / "voyage" / "sync-server" / "server.py"

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


def request(url: str, token: str | None = None, method: str = "GET", payload: dict | None = None):
    """Return (status, parsed_body). Auth failures come back as a status, not an exception."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if token is not None:
        # Send the token as UTF-8 wire bytes, the way curl and fetch() do. http.client
        # latin-1-encodes header values, so hand it the latin-1 view of those bytes.
        header = f"Bearer {token}".encode("utf-8").decode("latin-1")
        req.add_header("Authorization", header)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except json.JSONDecodeError:
            return err.code, {"raw": raw}


class Server:
    """server.py in a subprocess, torn down on exit."""

    def __init__(self, token: str | None, allow_open: bool = False):
        self.token = token
        self.allow_open = allow_open
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self._tmp = tempfile.TemporaryDirectory()
        self._proc: subprocess.Popen | None = None

    def __enter__(self) -> "Server":
        env = dict(os.environ)
        env.pop("SYNC_API_TOKEN", None)
        env.pop("SYNC_ALLOW_OPEN", None)
        env.update(
            SYNC_HOST="127.0.0.1",
            SYNC_PORT=str(self.port),
            SYNC_DATA_DIR=self._tmp.name,
            PYTHONUNBUFFERED="1",
        )
        if self.token is not None:
            env["SYNC_API_TOKEN"] = self.token
        if self.allow_open:
            env["SYNC_ALLOW_OPEN"] = "1"
        self._proc = subprocess.Popen(
            [sys.executable, str(SERVER)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        deadline = time.time() + 20
        while time.time() < deadline:
            if self._proc.poll() is not None:
                raise RuntimeError(f"server exited early:\n{self._proc.stdout.read()}")
            try:
                status, _ = request(f"{self.base}/api/health")
                if status == 200:
                    return self
            except OSError:
                time.sleep(0.1)
        raise RuntimeError(f"server on port {self.port} never became healthy")

    def __exit__(self, *_exc) -> None:
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        self._tmp.cleanup()


def test_server_without_a_token() -> None:
    """No SYNC_API_TOKEN: closed by default (set SYNC_ALLOW_OPEN=1 for lab-only open sync)."""
    print("\nserver started with no SYNC_API_TOKEN")
    with Server(token=None) as srv:
        _, health = request(f"{srv.base}/api/health")
        check("health reports tokenConfigured false", health.get("tokenConfigured"), False)
        check("health reports authRequired true (closed by default)", health.get("authRequired"), True)
        check("health reports openSync false", health.get("openSync"), False)

        status, body = request(f"{srv.base}/api/voyage/testship")
        check("anonymous read is rejected when closed", status, 401)
        check("rejection names token_required", body.get("reason"), "token_required")

        status, body = request(f"{srv.base}/api/voyage/testship", token="any-token-at-all")
        check("random bearer is rejected when closed", status, 401)
        check("random bearer names token_required", body.get("reason"), "token_required")


def test_server_open_sync_opt_in() -> None:
    """SYNC_ALLOW_OPEN=1 with no token: every request is accepted (lab / single-ship LAN)."""
    print("\nserver started with SYNC_ALLOW_OPEN=1 and no SYNC_API_TOKEN")
    with Server(token=None, allow_open=True) as srv:
        _, health = request(f"{srv.base}/api/health")
        check("open health reports tokenConfigured false", health.get("tokenConfigured"), False)
        check("open health reports authRequired false", health.get("authRequired"), False)
        check("open health reports openSync true", health.get("openSync"), True)

        status, _ = request(f"{srv.base}/api/voyage/testship")
        check("open anonymous read is accepted", status, 200)

        status, _ = request(f"{srv.base}/api/voyage/testship", token="any-token-at-all")
        check("open authenticated read is accepted", status, 200)

        status, _ = request(
            f"{srv.base}/api/voyage/testship/22/B",
            token="any-token-at-all",
            method="PUT",
            payload={"entries": []},
        )
        check("open authenticated push is accepted", status, 200)


def test_server_with_a_token() -> None:
    """SYNC_API_TOKEN set: only the exact token passes, and 401s name their cause."""
    print("\nserver started with SYNC_API_TOKEN=s3cret-token")
    with Server(token="s3cret-token") as srv:
        _, health = request(f"{srv.base}/api/health")
        check("health reports tokenConfigured true", health.get("tokenConfigured"), True)
        check("health needs no token itself", health.get("ok"), True)

        status, body = request(f"{srv.base}/api/voyage/testship")
        check("anonymous read is rejected", status, 401)
        check("rejection names the missing token", body.get("reason"), "missing_token")

        status, body = request(f"{srv.base}/api/voyage/testship", token="wrong-token")
        check("wrong token is rejected", status, 401)
        check("rejection names the mismatch", body.get("reason"), "token_mismatch")

        status, _ = request(f"{srv.base}/api/voyage/testship", token="s3cret-token")
        check("correct token reads", status, 200)

        status, _ = request(
            f"{srv.base}/api/voyage/testship/22/B",
            token="s3cret-token",
            method="PUT",
            payload={"entries": [{"id": "e1", "updatedAt": "2026-08-13T00:00:00Z", "fuel": 12}]},
        )
        check("correct token pushes", status, 200)

        status, body = request(f"{srv.base}/api/voyage/testship/22/B", token="s3cret-token")
        check("pushed leg reads back", status, 200)
        check("pushed entry survives the round trip", [e["id"] for e in body.get("entries", [])], ["e1"])

        status, _ = request(
            f"{srv.base}/api/voyage/testship/22/B",
            method="PUT",
            payload={"entries": []},
        )
        check("anonymous push is rejected", status, 401)


def test_non_ascii_token() -> None:
    """http.server decodes headers as latin-1, so a non-ASCII token needs a byte comparison."""
    token = "tökén-ünïcode-😀"
    print(f"\nserver started with a non-ASCII SYNC_API_TOKEN ({token})")
    with Server(token=token) as srv:
        status, _ = request(f"{srv.base}/api/voyage/testship", token=token)
        check("correct non-ASCII token is accepted", status, 200)

        status, body = request(f"{srv.base}/api/voyage/testship", token="wrong-token")
        check("wrong token is still rejected", status, 401)
        check("rejection names the mismatch", body.get("reason"), "token_mismatch")


def main() -> int:
    if not SERVER.exists():
        print(f"ERROR: {SERVER} not found")
        return 1
    test_server_without_a_token()
    test_server_open_sync_opt_in()
    test_server_with_a_token()
    test_non_ascii_token()
    print()
    if failures:
        print(f"FAILED — {len(failures)} of {checks} checks:")
        for name in failures:
            print(f"  - {name}")
        return 1
    print(f"PASSED — {checks} checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
