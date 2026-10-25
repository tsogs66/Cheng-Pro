#!/usr/bin/env python3
"""MV-prefixed vessel slug aliases resolve to one ship folder.

Sample: m-v-flag-evi, mv-flag-evi, and flag-evi are the same vessel.

Run: python3 scripts/test-sync-slug-core.py
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SERVER = REPO / "modules" / "voyage" / "sync-server" / "server.py"

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


def load_server(data_dir: Path):
    spec = importlib.util.spec_from_file_location("voyage_sync_server", SERVER)
    mod = importlib.util.module_from_spec(spec)
    # Point DATA_DIR before module body runs vessel helpers that close over it.
    import os
    os.environ["SYNC_DATA_DIR"] = str(data_dir)
    os.environ.pop("SYNC_API_TOKEN", None)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp)
        mod = load_server(data)

        check("core strips m-v-", mod.slug_core("m-v-flag-evi"), "flag-evi")
        check("core strips mv-", mod.slug_core("mv-flag-evi"), "flag-evi")
        check("core strips m.v-", mod.slug_core("m.v-flag-evi"), "flag-evi")
        check("core leaves bare name", mod.slug_core("flag-evi"), "flag-evi")
        check("cores equal across aliases",
              mod.slug_core("m-v-flag-evi") == mod.slug_core("mv-flag-evi"),
              True)

        # Existing folder under account-style slug; request bare name.
        (data / "m-v-flag-evi" / "12").mkdir(parents=True)
        (data / "m-v-flag-evi" / "12" / "B.json").write_text("{}", encoding="utf-8")

        check("resolve bare → m-v- folder",
              mod.resolve_vessel_slug("flag-evi"), "m-v-flag-evi")
        check("resolve mv- → m-v- folder",
              mod.resolve_vessel_slug("mv-flag-evi"), "m-v-flag-evi")
        check("resolve exact stays",
              mod.resolve_vessel_slug("m-v-flag-evi"), "m-v-flag-evi")
        check("vessel_dir uses resolved folder",
              mod.vessel_dir("flag-evi").name, "m-v-flag-evi")
        check("unknown core keeps asked slug",
              mod.resolve_vessel_slug("other-ship"), "other-ship")

    print()
    if failures:
        print(f"FAILED — {len(failures)} of {checks} checks")
        return 1
    print(f"ok — {checks} checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
