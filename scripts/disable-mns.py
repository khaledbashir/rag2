#!/usr/bin/env python3
"""
KILL-SWITCH for the M&S Operating Layer (Bundle A).

If Grant + Jireh don't approve the $3K change order, run this script to
deactivate the M&S layer everywhere it's user-visible. Data stays in the
database (recoverable) — only the UI surface vanishes.

What gets disabled:
  - mediaPlacement object isActive=false
  - nielsenVerification object isActive=false
  - sponsorTeamContract object isActive=false
  - "Media & Sponsorships" navigation folder hidden
  - rag2 FEATURES.M_AND_S_OPERATING_LAYER flag (must be flipped manually in
    /root/rag2/lib/featureFlags.ts then deployed)

To re-enable:
  python3 scripts/disable-mns.py --enable

To check current state:
  python3 scripts/disable-mns.py --status
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

OBJECTS = {
    "mediaPlacement":      "73986315-2526-4614-b9da-1e07c4cb4fa4",
    "nielsenVerification": "dadc69a6-d6d6-4e62-96aa-613832df7342",
    "sponsorTeamContract": "7e1bd255-2eb6-4823-921f-ccbe74bbc91f",
}
FOLDER_ID = "9b984a8f-969a-42d3-a741-38f6d2e574cf"


def gql(q, v=None, ep="metadata"):
    body = json.dumps({"query": q, "variables": v or {}}).encode("utf-8")
    req = urllib.request.Request(f"{TWENTY_BASE}/{ep}", data=body,
        headers={"Authorization": f"Bearer {TWENTY_API_KEY}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        d = json.loads(resp.read().decode("utf-8"))
    if d.get("errors"):
        raise RuntimeError(json.dumps(d["errors"], indent=2)[:500])
    return d["data"]


def set_object_active(obj_id, active):
    return gql("""
        mutation U($input: UpdateOneObjectInput!) {
          updateOneObject(input: $input) { id nameSingular isActive }
        }
    """, {"input": {"id": obj_id, "update": {"isActive": active}}})


def set_folder_visible(visible):
    items = gql("query { navigationMenuItems { id type name folderId targetObjectMetadataId } }")["navigationMenuItems"]
    folder = next((i for i in items if i["id"] == FOLDER_ID), None)
    if not folder:
        print(f"[warn] folder {FOLDER_ID} not found")
        return
    if visible:
        if folder.get("name") == "Media & Sponsorships":
            print("  folder already visible")
            return
        gql("""
            mutation U($input: UpdateOneNavigationMenuItemInput!) {
              updateNavigationMenuItem(input: $input) { id name }
            }
        """, {"input": {"id": FOLDER_ID, "update": {"name": "Media & Sponsorships"}}})
        print("  folder renamed to 'Media & Sponsorships'")
    else:
        gql("""
            mutation U($input: UpdateOneNavigationMenuItemInput!) {
              updateNavigationMenuItem(input: $input) { id name }
            }
        """, {"input": {"id": FOLDER_ID, "update": {"name": "[hidden] M&S"}}})
        print("  folder renamed to '[hidden] M&S' (still in nav, just renamed)")


def status():
    print("Current state:")
    for name, oid in OBJECTS.items():
        try:
            d = gql("""query Q($id: UUID!) { object(id: $id) { id nameSingular isActive } }""",
                    {"id": oid})
            o = d["object"]
            print(f"  {name:25s} active={o['isActive']}")
        except Exception as e:
            print(f"  {name:25s} ERR: {str(e)[:80]}")
    items = gql("query { navigationMenuItems { id name } }")["navigationMenuItems"]
    folder = next((i for i in items if i["id"] == FOLDER_ID), None)
    print(f"  folder name: {folder.get('name') if folder else 'NOT FOUND'}")
    flag = open("/root/rag2/lib/featureFlags.ts").read()
    flag_state = "true" if "M_AND_S_OPERATING_LAYER: true" in flag else "false"
    print(f"  rag2 FEATURES.M_AND_S_OPERATING_LAYER: {flag_state}")


def disable():
    print("Disabling M&S Operating Layer...")
    for name, oid in OBJECTS.items():
        try:
            set_object_active(oid, False)
            print(f"  {name}: deactivated")
        except Exception as e:
            print(f"  {name}: FAILED — {str(e)[:200]}")
    set_folder_visible(False)
    print("\nrag2 FEATURES flag must be flipped manually:")
    print("  edit /root/rag2/lib/featureFlags.ts -> M_AND_S_OPERATING_LAYER: false")
    print("  git add -A && git commit -m 'kill: M&S layer disabled' && git push")


def enable():
    print("Re-enabling M&S Operating Layer...")
    for name, oid in OBJECTS.items():
        try:
            set_object_active(oid, True)
            print(f"  {name}: activated")
        except Exception as e:
            print(f"  {name}: FAILED — {str(e)[:200]}")
    set_folder_visible(True)
    print("\nrag2 FEATURES flag must be set to true:")
    print("  /root/rag2/lib/featureFlags.ts -> M_AND_S_OPERATING_LAYER: true")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "--status"
    if arg == "--status":
        status()
    elif arg == "--enable":
        enable()
    elif arg in ("--disable", "--off"):
        disable()
    else:
        print(__doc__)
        sys.exit(2)
