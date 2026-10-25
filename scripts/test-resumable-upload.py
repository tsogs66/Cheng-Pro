#!/usr/bin/env python3
"""Resumable chunked leg upload — driven against a real server over real HTTP.

A full voyage leg carrying scanned requisitions runs to tens or hundreds of
megabytes, and a ship's connection drops. Sent as one PUT, an upload that dies
at 90% is worth nothing: the next attempt starts from the beginning, and on a
link that slow it may never finish at all. (The ten-minute watchdog was raised
for the same reason, which treated the symptom.)

So a leg may go up as numbered chunks and be assembled here. What this file
pins is the behaviour that makes that worth having:

  - an interrupted upload resumes from what the SERVER holds, not from what the
    client believes it sent
  - re-sending a chunk is harmless, so a client unsure whether one landed may
    simply send it again
  - the assembled leg is verified against the digest declared up front, BEFORE
    it is merged, and a mismatch keeps the parts so only the bad chunk need be
    re-sent
  - a leg that arrived in pieces is merged by exactly the same path as one that
    arrived whole
  - the staging folder is never mistaken for a voyage

Run: python3 scripts/test-resumable-upload.py
"""

from __future__ import annotations

import hashlib
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
TOKEN = "resumable-test-token"
VESSEL, VOYAGE, CONDITION = "harbour-key", "41", "L"

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


def request(url: str, method: str = "GET", payload=None, raw: bytes | None = None, token=TOKEN):
    """(status, body). An auth or validation failure is a status, not an exception."""
    data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/octet-stream" if raw is not None else "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as err:
        rawbody = err.read().decode()
        try:
            return err.code, json.loads(rawbody)
        except json.JSONDecodeError:
            return err.code, {"raw": rawbody}


class Server:
    """server.py in a subprocess, torn down on exit."""

    def __init__(self) -> None:
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self._tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self._tmp.name)
        self._proc: subprocess.Popen | None = None

    def __enter__(self) -> "Server":
        env = dict(os.environ)
        env.pop("SYNC_ALLOW_OPEN", None)
        env.update(
            SYNC_HOST="127.0.0.1",
            SYNC_PORT=str(self.port),
            SYNC_DATA_DIR=str(self.data_dir),
            SYNC_API_TOKEN=TOKEN,
            PYTHONUNBUFFERED="1",
        )
        self._proc = subprocess.Popen(
            [sys.executable, str(SERVER)], env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        deadline = time.time() + 20
        while time.time() < deadline:
            if self._proc.poll() is not None:
                raise RuntimeError(f"server exited early:\n{self._proc.stdout.read()}")
            try:
                if request(f"{self.base}/api/health")[0] == 200:
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


CHUNK = 64 * 1024


def build_leg(entry_count: int = 400, voyage: str = VOYAGE, condition: str = CONDITION,
              min_chunks: int = 2):
    """A leg whose content we can check came back intact, not just its size.

    min_chunks is asserted, not hoped for. Twice while writing this file a case
    was built with too few entries, came out as ONE chunk, and the test that
    corrupted "chunk 1" or interrupted at "chunk 5" passed without exercising
    anything. A test that cannot fail is worse than no test.
    """
    entries = [
        {"id": f"e{i}", "updatedAt": "2026-10-20T00:00:00Z",
         "note": "scanned requisition stand-in é€ " + ("x" * 400)}
        for i in range(entry_count)
    ]
    payload = {
        "vesselId": VESSEL, "voyageNumber": voyage, "condition": condition,
        "updatedAt": "2026-10-20T00:00:00Z", "deviceId": "dev1",
        "data": {
            "setup": {"vesselName": "MV Harbour Key",
                      "sync": {"lastModifiedAt": "2026-10-20T00:00:00Z"}},
            "entries": entries, "receipts": [], "documents": [],
            "abstracts": [], "printHistory": [], "deletedIds": {},
        },
    }
    blob = json.dumps(payload).encode()
    chunks = [blob[i:i + CHUNK] for i in range(0, len(blob), CHUNK)]
    manifest = {
        "totalBytes": len(blob), "totalChunks": len(chunks), "chunkBytes": CHUNK,
        "digest": hashlib.sha256(blob).hexdigest(), "digestAlgo": "sha256",
    }
    if len(chunks) < min_chunks:
        raise AssertionError(
            f"this leg is {len(blob)} bytes = {len(chunks)} chunk(s) at {CHUNK} bytes; "
            f"the case needs at least {min_chunks}. Raise entry_count."
        )
    return entries, chunks, manifest


def main() -> None:
    with Server() as srv:
        leg = f"{srv.base}/api/voyage/{VESSEL}/{VOYAGE}/{CONDITION}"
        entries, chunks, manifest = build_leg()

        print(f"\nleg is {manifest['totalBytes']} bytes in {len(chunks)} chunks")
        check("the leg really is split into several chunks", len(chunks) > 3, True)

        print("\nhealth advertises the capability, so a client need not probe")
        _, health = request(f"{srv.base}/api/health")
        check("resumableUpload is advertised", (health.get("resumableUpload") or {}).get("supported"), True)
        check("with a byte ceiling", isinstance((health.get("resumableUpload") or {}).get("maxBytes"), int), True)

        print("\nbegin")
        status, body = request(leg + "/upload", "POST", manifest)
        check("begin returns 200", status, 200)
        upload_id = body.get("uploadId") or ""
        check("it issues a 32-hex upload id", len(upload_id) == 32, True)
        check("nothing is held yet", body.get("received"), [])
        check("and it says the digest will be verified", body.get("digestVerified"), True)

        print("\nthree chunks land, then the link drops")
        for i in range(3):
            check(f"chunk {i} stored", request(f"{leg}/upload/{upload_id}/{i}", "PUT", raw=chunks[i])[0], 200)

        print("\ncompleting now must refuse, and must keep the parts")
        status, body = request(f"{leg}/upload/{upload_id}/complete", "POST", {})
        check("complete refuses an incomplete upload", status, 409)
        check("and says chunks are missing", "missing" in (body.get("error") or ""), True)
        check("the parts already sent are still held", body.get("received"), [0, 1, 2])

        print("\nresume: the client asks what the server holds")
        status, body = request(leg + "/upload", "POST", dict(manifest, uploadId=upload_id))
        check("resume returns 200", status, 200)
        check("the same upload is continued", body.get("uploadId"), upload_id)
        check("and the three held chunks are reported", body.get("received"), [0, 1, 2])
        check("flagged as a resume", body.get("resumed"), True)

        status, body = request(f"{leg}/upload/{upload_id}")
        check("the status route agrees", body.get("received"), [0, 1, 2])

        print("\na re-sent chunk is harmless")
        check("re-sending chunk 1 is accepted", request(f"{leg}/upload/{upload_id}/1", "PUT", raw=chunks[1])[0], 200)

        for i in range(3, len(chunks)):
            status, _ = request(f"{leg}/upload/{upload_id}/{i}", "PUT", raw=chunks[i])
            if status != 200:
                check(f"chunk {i} stored", status, 200)
        check("every chunk is held", request(f"{leg}/upload/{upload_id}")[1].get("receivedCount"), len(chunks))

        print("\ncomplete")
        status, body = request(f"{leg}/upload/{upload_id}/complete", "POST", {})
        check("complete returns 200", status, 200)
        check("the digest was verified", body.get("digestVerified"), True)
        check("the leg was merged, not merely stored", body.get("voyageKey"), f"{VOYAGE}-{CONDITION}")
        check("every entry arrived", len((body.get("data") or {}).get("entries") or []), len(entries))
        check("and the content is intact, multi-byte characters included",
              ((body.get("data") or {}).get("entries") or [{}])[0].get("note"), entries[0]["note"])

        print("\nthe assembled leg is an ordinary leg from here on")
        status, body = request(leg)
        check("it can be pulled back", status, 200)
        check("with every entry", len((body.get("data") or {}).get("entries") or []), len(entries))
        _, body = request(f"{srv.base}/api/voyage/{VESSEL}")
        voyages = [v.get("voyageNumber") for v in (body.get("voyages") or [])]
        check("the voyage list shows it", VOYAGE in voyages, True)
        # SLUG_RE allows a leading dot, so without an explicit guard the staging
        # folder would be scanned as though it were a voyage number.
        check("and never lists the upload staging folder as a voyage",
              any(str(v).startswith(".") for v in voyages), False)
        check("the finished upload is cleaned up", request(f"{leg}/upload/{upload_id}")[0], 404)

        print("\na corrupted chunk is caught before anything is merged")
        _, bad_chunks, bad_manifest = build_leg(entry_count=400, voyage="42", min_chunks=3)
        check("the corruption case has chunks to corrupt", len(bad_chunks) > 2, True)
        bad_leg = f"{srv.base}/api/voyage/{VESSEL}/42/{CONDITION}"
        upload_id = request(bad_leg + "/upload", "POST", bad_manifest)[1]["uploadId"]
        for i, chunk in enumerate(bad_chunks):
            payload = bytes([chunk[0] ^ 0x01]) + chunk[1:] if i == 1 else chunk
            request(f"{bad_leg}/upload/{upload_id}/{i}", "PUT", raw=payload)
        status, body = request(f"{bad_leg}/upload/{upload_id}/complete", "POST", {})
        check("one flipped bit is refused", status, 409)
        check("named as a digest mismatch", "does not match the digest" in (body.get("error") or ""), True)
        check("nothing was written for that leg", request(bad_leg)[0], 404)
        check("and the parts are kept, so only the bad chunk need be re-sent",
              len(body.get("received") or []), len(bad_chunks))
        request(f"{bad_leg}/upload/{upload_id}/1", "PUT", raw=bad_chunks[1])
        check("re-sending the good chunk completes it",
              request(f"{bad_leg}/upload/{upload_id}/complete", "POST", {})[0], 200)

        print("\na leg that changed between attempts starts a fresh upload")
        _, chunks_a, manifest_a = build_leg(entry_count=400, voyage="43", min_chunks=3)
        leg43 = f"{srv.base}/api/voyage/{VESSEL}/43/{CONDITION}"
        first = request(leg43 + "/upload", "POST", manifest_a)[1]["uploadId"]
        request(f"{leg43}/upload/{first}/0", "PUT", raw=chunks_a[0])
        _, _chunks_b, manifest_b = build_leg(entry_count=401, voyage="43", min_chunks=3)
        status, body = request(leg43 + "/upload", "POST", dict(manifest_b, uploadId=first))
        check("the stale upload is not resumed", body.get("uploadId") == first, False)
        check("and the new one starts empty, not half-built", body.get("received"), [])

        print("\nrubbish is refused")
        check("a manifest with no sizes", request(leg + "/upload", "POST", {"totalBytes": 0, "totalChunks": 0, "chunkBytes": 0})[0], 400)
        check("an absurd leg size", request(leg + "/upload", "POST", dict(manifest, totalBytes=3 * 1024 ** 3))[0], 413)
        check("too many chunks", request(leg + "/upload", "POST", dict(manifest, totalChunks=99999))[0], 400)
        check("an oversized chunk size", request(leg + "/upload", "POST", dict(manifest, chunkBytes=99 * 1024 ** 2))[0], 400)
        check("an unknown digest algorithm", request(leg + "/upload", "POST", dict(manifest, digestAlgo="md5"))[0], 400)
        # The id reaches the filesystem, so it is validated rather than sanitised.
        check("a non-hex upload id", request(f"{leg}/upload/" + "z" * 32)[0], 400)
        check("a traversal attempt in the id", request(f"{leg}/upload/..%2f..%2fetc")[0], 400)
        check("an unknown upload id", request(f"{leg}/upload/" + "ab" * 16)[0], 404)
        check("a chunk index past the end",
              request(f"{leg}/upload/{upload_id}/99999", "PUT", raw=b"x")[0], 404)

        print("\nauth guards every new route")
        check("begin", request(leg + "/upload", "POST", manifest, token=None)[0], 401)
        check("chunk", request(f"{leg}/upload/{upload_id}/0", "PUT", raw=b"x", token=None)[0], 401)
        check("status", request(f"{leg}/upload/{upload_id}", token=None)[0], 401)
        check("complete", request(f"{leg}/upload/{upload_id}/complete", "POST", {}, token=None)[0], 401)
        check("abandon", request(f"{leg}/upload/{upload_id}", "DELETE", token=None)[0], 401)

        print("\nabandoning an upload removes the parts")
        _, chunks_c, manifest_c = build_leg(entry_count=400, voyage="44", min_chunks=3)
        leg44 = f"{srv.base}/api/voyage/{VESSEL}/44/{CONDITION}"
        gone = request(leg44 + "/upload", "POST", manifest_c)[1]["uploadId"]
        request(f"{leg44}/upload/{gone}/0", "PUT", raw=chunks_c[0])
        check("abandon returns 200", request(f"{leg44}/upload/{gone}", "DELETE")[0], 200)
        check("and the upload is gone", request(f"{leg44}/upload/{gone}")[0], 404)

    print(f"\n{'FAILED — ' + str(len(failures)) + ' of ' + str(checks) if failures else 'PASSED — ' + str(checks)} checks")
    if failures:
        for f in failures:
            print(f"  - {f}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
