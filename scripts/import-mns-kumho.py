#!/usr/bin/env python3
"""
Import the Kumho list tab from 2026 ANC MLB Inventory List into mediaPlacement.

This is the simplified single-sponsor sheet (Sep 2025) — 81 games, sponsor=Kumho,
league=MLB. Used as the proof load for the M&S operating layer.

Idempotent: skips rows that already exist (matched by gameDate + sponsor + homeTeamId).
"""
import json
import os
import sys
import time
import urllib.request

import openpyxl

TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host"
TWENTY_API_KEY = os.environ.get("TWENTY_API_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9."
    "nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
)

KUMHO_SPONSOR_ID = "6c6b2965-b870-40a4-a9b8-568eee485257"  # Kumho Tire

# Team-name -> Company UUID. Canonical CRM Companies.
TEAM_MAP = {
    "Arizona Diamondbacks": "b0c58a89-c193-482b-b734-943c193fb5ed",
    "Atlanta Braves":       "672d87cc-4297-40d6-ae99-21891844ff7f",
    "Baltimore Orioles":    "6a43a6b7-ca46-4523-99c3-9626d39780a0",
    "Boston Red Sox":       "211af4e6-2f67-4344-96bc-74e90fa7a91d",
    "Chicago Cubs":         "3df0ac32-d444-45c0-a3c3-3a3f628d0ec7",
    "Chicago White Sox":    "0283caa9-7f01-4392-b4cd-0a8edc032408",
    "Cincinnati Reds":      "c3670309-8aeb-49b6-b4d8-74718d5b01d3",
    "Cleveland Guardians":  "1b2be75d-db30-4025-914f-221ff85153b8",
    "Colorado Rockies":     "85b79bda-4f9e-4756-b95e-f16e5c709571",
    "Detroit Tigers":       "0ed58bd6-d6c2-4533-9e5d-ba38336d14d3",
    "Houston Astros":       "4267a322-279d-4d5a-a1e3-da7108888220",
    "Kansas City Royals":   "230e8510-0170-4cc4-a45d-26d49c3c615d",
    "Los Angeles Angels":   "79b29bb6-9ff5-4378-84b6-50a3b7a90553",
    "Los Angeles Dodgers":  "62a165b2-c402-42f4-ad73-62088a3772cb",
    "Miami Marlins":        "943bfdb7-e683-43b9-aff0-a85a486bd46e",
    "Milwaukee Brewers":    "02169446-9ec7-4953-a771-e47800d8a140",
    "Minnesota Twins":      "aa370e4b-c017-4cb0-828b-09b09247db22",
    "New York Mets":        "c5e68d70-9f8e-47b6-a2af-db46327888c4",
    "New York Yankees":     "d370dc5b-6027-4b98-90aa-71a06b6223fd",
    "Oakland Athletics":    "af39c3d9-b272-4d3b-a02e-78d1b49d358d",
    "Philadelphia Phillies":"4b49cd95-d18c-4514-ba72-6f3c1c3bf66c",
    "Pittsburgh Pirates":   "bc532ecd-ecf2-4194-b997-7ab68cc7ea9e",
    "San Diego Padres":     "a7d9ac71-e6b9-4686-bfd5-f1d2f70708b6",
    "San Francisco Giants": "35b306f2-ba7b-4423-b35a-b119c6f5047a",
    "Seattle Mariners":     "78a89e66-aa43-45e0-88a8-8f01f8e17a71",
    "St. Louis Cardinals":  "13f32394-966a-4365-8e32-11b7f30e804a",
    "Tampa Bay Rays":       "61d9d823-1054-4e1e-bfa3-3d241c0c08d7",
    "Texas Rangers":        "9590cb20-ad7e-4f7a-b0e2-d04909339f61",
    "Toronto Blue Jays":    "ef49aacb-978b-43a5-88d7-c841986d97ac",
    "Washington Nationals": "de41ff1a-592a-46e2-9bed-6327d4a2ca8b",
    # Aliases (short forms appearing in source data)
    "D-backs":              "b0c58a89-c193-482b-b734-943c193fb5ed",
    "Mets":                 "c5e68d70-9f8e-47b6-a2af-db46327888c4",
    "Yankees":              "d370dc5b-6027-4b98-90aa-71a06b6223fd",
    "Pirates":              "bc532ecd-ecf2-4194-b997-7ab68cc7ea9e",
    "Brewers":              "02169446-9ec7-4953-a771-e47800d8a140",
    "Phillies":             "4b49cd95-d18c-4514-ba72-6f3c1c3bf66c",
    "Athletics":            "af39c3d9-b272-4d3b-a02e-78d1b49d358d",
    "Padres":               "a7d9ac71-e6b9-4686-bfd5-f1d2f70708b6",
    "Cardinals":            "13f32394-966a-4365-8e32-11b7f30e804a",
    "Astros":               "4267a322-279d-4d5a-a1e3-da7108888220",
    "Reds":                 "c3670309-8aeb-49b6-b4d8-74718d5b01d3",
    "Rockies":              "85b79bda-4f9e-4756-b95e-f16e5c709571",
    "Twins":                "aa370e4b-c017-4cb0-828b-09b09247db22",
    "Guardians":            "1b2be75d-db30-4025-914f-221ff85153b8",
    "Dodgers":              "62a165b2-c402-42f4-ad73-62088a3772cb",
    "Giants":               "35b306f2-ba7b-4423-b35a-b119c6f5047a",
    "Cubs":                 "3df0ac32-d444-45c0-a3c3-3a3f628d0ec7",
    "Marlins":              "943bfdb7-e683-43b9-aff0-a85a486bd46e",
    "Rays":                 "61d9d823-1054-4e1e-bfa3-3d241c0c08d7",
    "Nationals":            "de41ff1a-592a-46e2-9bed-6327d4a2ca8b",
    "Tigers":               "0ed58bd6-d6c2-4533-9e5d-ba38336d14d3",
    "Royals":               "230e8510-0170-4cc4-a45d-26d49c3c615d",
    "Angels":               "79b29bb6-9ff5-4378-84b6-50a3b7a90553",
    "Mariners":             "78a89e66-aa43-45e0-88a8-8f01f8e17a71",
    "Blue Jays":            "ef49aacb-978b-43a5-88d7-c841986d97ac",
    "Red Sox":              "211af4e6-2f67-4344-96bc-74e90fa7a91d",
    "White Sox":            "0283caa9-7f01-4392-b4cd-0a8edc032408",
    "Braves":               "672d87cc-4297-40d6-ae99-21891844ff7f",
    "Orioles":              "6a43a6b7-ca46-4523-99c3-9626d39780a0",
}


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        f"{TWENTY_BASE}/graphql", data=body,
        headers={"Authorization": f"Bearer {TWENTY_API_KEY}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        d = json.loads(resp.read().decode("utf-8"))
    if d.get("errors"):
        raise SystemExit(f"GraphQL errors: {json.dumps(d['errors'], indent=2)}")
    return d["data"]


def normalize_team(name):
    if not name:
        return None
    return name.strip()


def existing_kumho_dates():
    """Pull existing Kumho mediaPlacement records to make import idempotent."""
    out = set()
    after = None
    while True:
        var = {"filter": {"sponsorId": {"eq": KUMHO_SPONSOR_ID}}, "first": 100}
        if after:
            var["after"] = after
        d = gql("""
            query Existing($filter: MediaPlacementFilterInput, $first: Int, $after: String) {
              mediaPlacements(filter: $filter, first: $first, after: $after) {
                edges { node { gameDate homeTeamId } cursor }
                pageInfo { hasNextPage endCursor }
              }
            }
        """, var)
        edges = d["mediaPlacements"]["edges"]
        for e in edges:
            n = e["node"]
            d_str = (n.get("gameDate") or "")[:10]
            out.add((d_str, n.get("homeTeamId")))
        if not d["mediaPlacements"]["pageInfo"]["hasNextPage"]:
            break
        after = d["mediaPlacements"]["pageInfo"]["endCursor"]
    return out


def create_placement(row):
    d = gql("""
        mutation Create($data: MediaPlacementCreateInput!) {
          createMediaPlacement(data: $data) { id }
        }
    """, {"data": row})
    return d["createMediaPlacement"]["id"]


def main():
    wb = openpyxl.load_workbook(sys.argv[1] if len(sys.argv) > 1 else "/root/rag2/2026 ANC MLB Inventory List_5_8.xlsx", data_only=True)
    ws = wb["Kumho list"]

    print("Loading existing Kumho placements for idempotency check...")
    existing = existing_kumho_dates()
    print(f"  {len(existing)} existing")

    created = 0
    skipped = 0
    errors = []

    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row[0]:
            continue
        game_date = row[0]
        time_val = row[1]
        home = normalize_team(row[2])
        away = normalize_team(row[3])
        home_net = (row[4] or "").strip() if row[4] else None
        away_net = (row[5] or "").strip() if row[5] else None
        inning = (row[6] or "").strip() if row[6] else None

        home_id = TEAM_MAP.get(home)
        away_id = TEAM_MAP.get(away)
        if not home_id or not away_id:
            errors.append((i, f"unknown team(s): home={home!r} away={away!r}"))
            continue

        date_str = game_date.strftime("%Y-%m-%d")
        if (date_str, home_id) in existing:
            skipped += 1
            continue

        time_str = None
        if time_val:
            try:
                time_str = time_val.strftime("%H:%M:%S")
            except Exception:
                time_str = str(time_val)

        try:
            pid = create_placement({
                "gameDate": date_str,
                "gameTime": time_str,
                "homeTeamId": home_id,
                "awayTeamId": away_id,
                "sponsorId": KUMHO_SPONSOR_ID,
                "homeTVNetwork": home_net,
                "awayTVNetwork": away_net,
                "inningScheduled": inning,
                "executionStatus": "EXECUTED",  # historical Sep 2025 — assume executed unless told otherwise
                "league": "MLB",
                "season": 2025,
                "placementType": "OTHER",
                "nielsenVerified": False,
                "sponsorGameCount": 1,
            })
            created += 1
            if created % 10 == 0:
                print(f"  {created} created so far...")
            time.sleep(0.05)
        except SystemExit as e:
            errors.append((i, str(e)[:200]))

    print(f"\nDone. created={created} skipped={skipped} errors={len(errors)}")
    if errors:
        for i, msg in errors[:20]:
            print(f"  row {i}: {msg}")


if __name__ == "__main__":
    main()
