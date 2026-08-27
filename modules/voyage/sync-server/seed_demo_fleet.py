#!/usr/bin/env python3
"""Seed the account database with the four scenario vessels shipped in the app.

Same ships, IMO numbers and chief engineers as the in-app Test Fleet, so the
central database and the local demo data line up and can actually sync:

  M/V HARBOUR KEY    IMO 9722101  Ana Ruiz        port operations
  M/V ROADSTEAD      IMO 9684412  Henrik Berg     anchorage & drifting
  M/V CIRCUMNAV      IMO 9810024  Priya Nair      full voyage
  M/V PACIFIC TRADER IMO 9756231  Marco Dalisay   three succeeding voyages

Usage:
  python3 sync-server/seed_demo_fleet.py [--db PATH] [--password PW] [--force]

Existing accounts are left alone unless --force is given. Prints every login and
vessel token it creates — that output is the only copy of the passwords.

This is a seeding tool for demo data, not the way the office creates crew. It talks
to the database directly, so --password sets a shared password for every seeded
login and the tests can rely on it. Real accounts are created through
POST /api/admin/accounts, which ignores any password sent and generates one, because
chief engineer credentials end up on a laptop that sails.
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from accounts import ROLE_ADMIN, ROLE_VESSEL, AccountError, AccountStore, slugify  # noqa: E402

FLEET_COMPANY = "Pacific Ocean Shipping"

DEMO_VESSELS = [
    # (vessel name, IMO, chief engineer username, chief engineer display name)
    ("M/V HARBOUR KEY", "9722101", "aruiz", "Chief Engr. Ana Ruiz"),
    ("M/V ROADSTEAD", "9684412", "hberg", "Chief Engr. Henrik Berg"),
    ("M/V CIRCUMNAV", "9810024", "pnair", "Chief Engr. Priya Nair"),
    ("M/V PACIFIC TRADER", "9756231", "mdalisay", "Chief Engr. Marco Dalisay"),
]

# The app's Test Fleet uses these slugs, so the seeded vessels line up with the
# local demo data rather than creating a second set of folders.
APP_SLUGS = {
    "9722101": "mv-harbour-key",
    "9684412": "mv-roadstead",
    "9810024": "mv-circumnav",
    "9756231": "mv-pacific-trader",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=os.environ.get("SYNC_ACCOUNTS_DB", "./sync-data/accounts.db"))
    parser.add_argument("--password", default="", help="password for every seeded login (generated if omitted)")
    parser.add_argument("--manager", default="fleetmanager", help="fleet manager username")
    parser.add_argument("--force", action="store_true", help="reset passwords on accounts that already exist")
    args = parser.parse_args()

    store = AccountStore(Path(args.db))
    password = args.password or secrets.token_urlsafe(9)

    print(f"Account database: {Path(args.db).resolve()}")
    print()

    created: list[tuple[str, str, str]] = []

    def ensure_account(username: str, role: str) -> None:
        try:
            store.create_account(username, password, role)
            created.append((username, role, password))
        except AccountError as err:
            if "already exists" not in str(err):
                raise
            if args.force:
                store.set_password(username, password)
                created.append((username, role, password + "  (reset)"))
            else:
                created.append((username, role, "(unchanged — use --force to reset)"))

    ensure_account(args.manager, ROLE_ADMIN)

    print(f"{'VESSEL':<20} {'IMO':<10} {'SLUG':<20} TOKEN")
    for name, imo, username, display in DEMO_VESSELS:
        vessel = store.upsert_vessel(
            vessel_name=name, imo=imo, company=FLEET_COMPANY,
            vessel_id=APP_SLUGS.get(imo) or slugify(name),
            created_by=args.manager,
        )
        ensure_account(username, ROLE_VESSEL)
        # Idempotent: re-posting to the same ship just closes and reopens the period.
        if store.current_vessel(username) != vessel["vesselId"]:
            store.assign_vessel(username, vessel["vesselId"], assigned_by=args.manager,
                                note=display)
        print(f"{vessel['vesselName']:<20} {vessel['imo']:<10} {vessel['vesselId']:<20} {vessel['token']}")

    print()
    print(f"{'LOGIN':<16} {'ROLE':<16} PASSWORD")
    for username, role, pw in created:
        print(f"{username:<16} {role:<16} {pw}")
    print()
    print("Passwords are shown once — only their hashes are stored.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
