#!/usr/bin/env python3
"""
Relabel the Opportunity object from "Deal"/"Deals" -> "Opportunity"/"Opportunities".

Why: Natalia (2026-06-18 call) — "nobody understands what Deals means. Everyone
worked Opportunities." Re-aligns the CRM with the Salesforce term everyone migrated
from. #1-priority adoption fix.

Safety:
  - Changes ONLY the display label (labelSingular/labelPlural). The API names
    (nameSingular="opportunity", namePlural="opportunities") are NEVER touched,
    so every view, field, script, Scout skill, and relation keeps working.
  - Uses the official updateOneObject metadata mutation (same path the Settings UI
    uses) -> the metadata service invalidates its own cache. No raw SQL, no manual
    Redis bust needed.
  - Idempotent: re-running when already "Opportunity" is a no-op.

Usage:
  python3 scripts/rename-deals-to-opportunities.py            # check only (default)
  python3 scripts/rename-deals-to-opportunities.py --apply    # perform the relabel
"""
import json
import os
import sys
import urllib.request

TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host"
TWENTY_API_KEY = os.environ.get("TWENTY_API_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9."
    "nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
)
OPPORTUNITY_OBJECT_ID = "c779922d-cf25-4a5e-9382-23eb1c02199e"


def gql(q, v=None, ep="metadata"):
    body = json.dumps({"query": q, "variables": v or {}}).encode("utf-8")
    req = urllib.request.Request(f"{TWENTY_BASE}/{ep}", data=body,
        headers={"Authorization": f"Bearer {TWENTY_API_KEY}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        d = json.loads(resp.read().decode("utf-8"))
    if d.get("errors"):
        raise RuntimeError(json.dumps(d["errors"], indent=2)[:800])
    return d["data"]


def fetch_object():
    data = gql("""
        query {
          objects(paging: {first: 500}) {
            edges { node {
              id nameSingular namePlural labelSingular labelPlural isLabelSyncedWithName
            } }
          }
        }
    """)
    for edge in data["objects"]["edges"]:
        if edge["node"]["id"] == OPPORTUNITY_OBJECT_ID:
            return edge["node"]
    raise SystemExit("Opportunity object not found by id")


def show(obj, header):
    print(f"\n{header}")
    print(f"  nameSingular         : {obj['nameSingular']}   (API name — must NOT change)")
    print(f"  namePlural           : {obj['namePlural']}   (API name — must NOT change)")
    print(f"  labelSingular        : {obj['labelSingular']}")
    print(f"  labelPlural          : {obj['labelPlural']}")
    print(f"  isLabelSyncedWithName: {obj['isLabelSyncedWithName']}")


def main():
    apply = "--apply" in sys.argv
    obj = fetch_object()
    show(obj, "=== CURRENT ===")

    if obj["labelSingular"] == "Opportunity" and obj["labelPlural"] == "Opportunities":
        print("\n[skip] Already labeled Opportunity/Opportunities. Nothing to do.")
        return

    if not apply:
        print("\n[check-only] Would relabel ->  Opportunity / Opportunities")
        print("Run again with --apply to perform the change.")
        return

    print("\n[apply] Relabeling Deal/Deals -> Opportunity/Opportunities ...")
    res = gql("""
        mutation U($input: UpdateOneObjectInput!) {
          updateOneObject(input: $input) {
            id nameSingular namePlural labelSingular labelPlural isLabelSyncedWithName
          }
        }
    """, {"input": {"id": OPPORTUNITY_OBJECT_ID, "update": {
        "labelSingular": "Opportunity",
        "labelPlural": "Opportunities",
    }}})  # standard object: isLabelSyncedWithName is locked (already False) — send labels only
    show(res["updateOneObject"], "=== AFTER ===")
    # Re-fetch independently to confirm it persisted at the read path.
    show(fetch_object(), "=== RE-FETCH (independent read) ===")
    print("\n[done] Relabel applied via updateOneObject (metadata service auto-invalidates cache).")


if __name__ == "__main__":
    main()
