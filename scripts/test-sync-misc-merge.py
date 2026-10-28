#!/usr/bin/env python3
"""Miscellaneous vessel data and open drafts survive a leg merge on the server.

A newer setup used to replace the whole object, so requisitions and the oil
record book that lived on the older side never reached the server. The oil
record entries were not in the merge list at all.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

os.environ["SYNC_DATA_DIR"] = tempfile.mkdtemp(prefix="voy-misc-")
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


def leg(setup, entries=None, orb=None, draft=None, deleted=None):
    data = {
        "setup": setup,
        "entries": entries or [],
        "receipts": [],
        "documents": [],
        "abstracts": [],
        "printHistory": [],
        "deletedIds": deleted or {},
    }
    if orb is not None:
        data["orbEntries"] = orb
    if draft is not None:
        data["openWorkDraft"] = draft
    return {"data": data}


server_leg = leg(
    {
        "sync": {"lastModifiedAt": "2026-10-02T00:00:00Z"},
        "requisitions": [{"id": "rq-server", "updatedAt": "2026-10-02T00:00:00Z", "description": "server"}],
        "bunkerPlanHistory": [{"id": "p1", "savedAt": "2026-10-01T00:00:00Z"}],
        "orb": {"tanks": {"sludge": [{"id": "sl-1", "name": "Sludge"}]}},
    },
    orb=[{"id": "orb-server", "updatedAt": "2026-10-02T00:00:00Z"}],
    draft={"log": {"fields": {"in_datetime": "old"}}, "savedAt": "2026-10-01T00:00:00Z"},
)
client_leg = leg(
    {
        "sync": {"lastModifiedAt": "2026-10-03T00:00:00Z"},
        "requisitions": [
            {"id": "rq-server", "updatedAt": "2026-10-01T00:00:00Z", "description": "stale"},
            {"id": "rq-client", "updatedAt": "2026-10-03T00:00:00Z", "description": "client"},
        ],
        "bunkerPlan": {"voyageNo": "12"},
        "orb": {"tanks": {"sludge": [{"id": "sl-2", "name": "Sludge 2"}]}},
    },
    orb=[{"id": "orb-client", "updatedAt": "2026-10-03T00:00:00Z"}],
    draft={"log": {"fields": {"in_datetime": "new"}}, "savedAt": "2026-10-04T00:00:00Z"},
    deleted={"requisitions": ["rq-gone"]},
)

merged = server.merge_snapshots(server_leg, client_leg)
setup = merged["data"]["setup"]
req_ids = sorted(r["id"] for r in setup["requisitions"])
check("requisitions from both sides are kept", req_ids, ["rq-client", "rq-server"])
kept = next(r for r in setup["requisitions"] if r["id"] == "rq-server")
check("the newer requisition row wins", kept["description"], "server")
check("consumption-plan snapshots from the older setup are kept",
      [r["id"] for r in setup["bunkerPlanHistory"]], ["p1"])
check("the working bunkering plan from the side that has one is kept",
      setup["bunkerPlan"]["voyageNo"], "12")
sludge = sorted(t["id"] for t in setup["orb"]["tanks"]["sludge"])
check("e-ORB tanks from both sides are kept", sludge, ["sl-1", "sl-2"])
orb_ids = sorted(r["id"] for r in merged["data"]["orbEntries"])
check("e-ORB entries from both sides are stored", orb_ids, ["orb-client", "orb-server"])
check("the newer open draft is stored",
      merged["data"]["openWorkDraft"]["log"]["fields"]["in_datetime"], "new")
check("a requisition tombstone is remembered",
      "rq-gone" in merged["data"]["deletedIds"]["requisitions"], True)

gone = server.merge_snapshots(
    server_leg,
    leg(
        {"sync": {"lastModifiedAt": "2026-10-04T00:00:00Z"}, "requisitions": []},
        deleted={"requisitions": ["rq-server"]},
    ),
)
check("a tombstoned requisition does not come back",
      [r["id"] for r in gone["data"]["setup"]["requisitions"]], [])

blank = server.merge_snapshots(
    server_leg,
    leg({"sync": {"lastModifiedAt": "2026-10-05T00:00:00Z"}}),
)
check("a push with no draft does not erase the stored draft",
      blank["data"]["openWorkDraft"]["log"]["fields"]["in_datetime"], "old")

print(f"sync misc merge ok ({checks})" if not failures else f"{len(failures)} failed")
sys.exit(1 if failures else 0)
