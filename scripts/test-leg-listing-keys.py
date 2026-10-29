#!/usr/bin/env python3
"""The server lists a leg under the folder and file a pull asks for.

A leg file written by an older client can carry another voyage number or
condition inside it: a B.json whose content says "L". The listing reported the
content, the device asked for voyage .../L, the server had no L.json, and the
leg showed "only on the server" however often Update ran.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

os.environ["SYNC_DATA_DIR"] = tempfile.mkdtemp(prefix="voy-leg-keys-")
os.environ["SYNC_API_TOKEN"] = "test-token-not-default"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "modules" / "voyage" / "sync-server"))

import server  # noqa: E402

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


V = "mv-leg-keys"


def write(path: Path, body: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body), encoding="utf-8")


# Ballast file whose content says laden and an older number.
write(server.resolve_leg_path(V, "12", "B"), {
    "voyageNumber": "V 11", "condition": "L", "updatedAt": "2026-10-01T00:00:00Z",
    "data": {"entries": [{"id": "e1"}, {"id": "e2"}]},
})
# A leg written by the current server: content and folder agree.
write(server.resolve_leg_path(V, "13", "L"), {
    "voyageNumber": "13", "condition": "L", "updatedAt": "2026-10-02T00:00:00Z",
    "data": {"entries": [{"id": "e3"}]},
})

print("\nListing reports where each leg can be fetched")
voyages = {v["voyageNumber"]: v for v in server.list_voyages(V)}
check("voyages listed by folder", sorted(voyages), ["12", "13"])
leg12 = voyages["12"]["conditions"][0]
check("condition from the file name, not the content", leg12["condition"], "B")
check("number from the folder, not the content", leg12["voyageNumber"], "12")
check("entry count still read", leg12["entryCount"], 2)
check("what the file says is kept for reference", (leg12["storedVoyageNumber"], leg12["storedCondition"]), ("V 11", "L"))
check("ballast flag follows the file", (voyages["12"]["hasBallast"], voyages["12"]["hasLaden"]), (True, False))

print("\nEvery listed leg resolves to a file that exists")
for vn, voyage in voyages.items():
    for cond in voyage["conditions"]:
        path = server.resolve_leg_path(V, cond["voyageNumber"], cond["condition"])
        check(f"voyage {vn} {cond['condition']} can be fetched", path.exists(), True)

print(f"\n{checks - len(failures)}/{checks} passed")
sys.exit(1 if failures else 0)
