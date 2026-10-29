#!/usr/bin/env python3
"""The server's view of a ship's miscellaneous data spans every leg.

Requisitions, plan snapshots and e-ORB entries travel inside whichever leg
was open when they were sent. The backup page compares the device with the
union of all legs, so a requisition sent with last voyage's leg still counts
as on the server, and a deleted one does not come back.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

os.environ["SYNC_DATA_DIR"] = tempfile.mkdtemp(prefix="voy-misc-union-")
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


def write_leg(vessel, voyage, cond, setup, orb_entries=None, deleted=None, updated="2026-10-01T00:00:00Z"):
    path = server.resolve_leg_path(vessel, voyage, cond)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {"setup": setup, "entries": [], "deletedIds": deleted or {}}
    if orb_entries is not None:
        data["orbEntries"] = orb_entries
    path.write_text(json.dumps({
        "vesselId": vessel, "voyageNumber": voyage, "condition": cond,
        "updatedAt": updated, "data": data,
    }), encoding="utf-8")


V = "mv-misc-test"
write_leg(V, "10", "B", {
    "sync": {"lastModifiedAt": "2026-09-01T00:00:00Z"},
    "requisitions": [
        {"id": "rq1", "description": "old copy", "updatedAt": "2026-09-01T00:00:00Z"},
        {"id": "rq2", "description": "only on voyage 10", "updatedAt": "2026-09-02T00:00:00Z"},
        {"id": "rq-gone", "description": "deleted later", "updatedAt": "2026-09-03T00:00:00Z"},
    ],
    "bunkerPlanHistory": [{"id": "bp1", "savedAt": "2026-09-05T00:00:00Z"}],
    "bunkerPlan": {"note": "older plan", "updatedAt": "2026-09-05T00:00:00Z"},
    "orb": {"tanks": {"sludge": [{"id": "t1"}]}, "note": "older book"},
}, orb_entries=[{"id": "orb1", "date": "2026-09-01"}])
write_leg(V, "11", "L", {
    "sync": {"lastModifiedAt": "2026-10-01T00:00:00Z"},
    "requisitions": [
        {"id": "rq1", "description": "edited copy", "updatedAt": "2026-10-01T00:00:00Z"},
        {"id": "rq3", "description": "only on voyage 11", "updatedAt": "2026-10-02T00:00:00Z"},
    ],
    "bunkerPlan": {"note": "newer plan", "updatedAt": "2026-10-03T00:00:00Z"},
    "orb": {"tanks": {"sludge": [{"id": "t1"}, {"id": "t2"}]}, "note": "newer book"},
}, orb_entries=[{"id": "orb2", "date": "2026-10-01"}], deleted={"requisitions": ["rq-gone"]})
write_leg(V, "11", "B", {"sync": {"lastModifiedAt": "2026-08-01T00:00:00Z"}})

print("\nUnion across legs")
misc = server.collect_vessel_misc(V)
check("every leg read", misc["legs"], 3)
reqs = {r["id"]: r for r in misc["requisitions"]}
check("requisitions from both voyages, deleted one left out", sorted(reqs), ["rq1", "rq2", "rq3"])
check("newest copy of a requisition kept", reqs["rq1"]["description"], "edited copy")
check("plan snapshot from the older leg kept", [r["id"] for r in misc["bunkerPlanHistory"]], ["bp1"])
check("e-ORB entries from both legs", sorted(r["id"] for r in misc["orbEntries"]), ["orb1", "orb2"])
check("newest consumption plan", misc["bunkerPlan"]["note"], "newer plan")
check("oil record book set-up from the newest setup", misc["orb"]["note"], "newer book")
check("tombstones reported", misc["deletedIds"]["requisitions"], ["rq-gone"])

print("\nBrief for a check")
brief = server.brief_vessel_misc(misc)
check("brief lists ids and stamps only", brief["requisitions"][0].keys() == {"id", "at"}, True)
check("brief requisition count", len(brief["requisitions"]), 3)
check("brief plan stamp", brief["bunkerPlanAt"], "2026-10-03T00:00:00Z")
check("brief oil record book configured", brief["orbConfigured"], True)

print("\nSealed book on an older leg, newer setup has none")
V2 = "mv-sealed-book"
write_leg(V2, "1", "B", {
    "sync": {"lastModifiedAt": "2026-09-01T00:00:00Z"},
    "orb": {
        "note": "older book",
        "sealedBook": {"entries": [{"id": "sealed1", "date": "2026-09-01"}], "count": 1},
    },
})
write_leg(V2, "2", "L", {
    "sync": {"lastModifiedAt": "2026-10-20T00:00:00Z"},
    "orb": {"note": "newer setup no book"},
})
sealed = server.collect_vessel_misc(V2)
check("sealed lines are in the union", [r["id"] for r in sealed["orbEntries"]], ["sealed1"])
check("newest orb still carries those sealed lines",
      [r["id"] for r in ((sealed["orb"] or {}).get("sealedBook") or {}).get("entries") or []],
      ["sealed1"])
check("newest orb setup fields kept", sealed["orb"]["note"], "newer setup no book")

print("\nShip with no legs")
empty = server.collect_vessel_misc("mv-nothing-here")
check("no legs, nothing to report", (empty["legs"], empty["requisitions"], empty["bunkerPlan"]), (0, [], None))

print("\nRoute")
src = (Path(__file__).resolve().parent.parent / "modules" / "voyage" / "sync-server" / "server.py").read_text(encoding="utf-8")
check("GET /api/voyage-misc/<vessel> is routed", 'parts[:2] == ["api", "voyage-misc"]' in src, True)
check("route checks the caller may read that ship", "if self._authorize_vessel(vessel) is None:\n                return\n            misc = collect_vessel_misc(vessel)" in src.replace("\r\n", "\n"), True)

print(f"\n{checks - len(failures)}/{checks} passed")
sys.exit(1 if failures else 0)
