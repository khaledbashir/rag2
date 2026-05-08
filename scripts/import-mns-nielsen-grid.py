#!/usr/bin/env python3
"""
Load the monthly Nielsen verification grid from ANC M&S Master Schedule 2026.

For each sponsor sheet, finds each (league, month, year) cell in the
"Monthly Schedule Check on Nielsen" grid and creates a nielsenVerification
row. TRUE -> isCorrect=true (verified), FALSE/blank -> isCorrect=false (open).

Idempotent on (sponsorId, league, month, year).
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date

import openpyxl

TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host"
TWENTY_API_KEY = os.environ.get("TWENTY_API_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9."
    "nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
)

# Sheet name -> sponsor Company UUID
SPONSOR_SHEETS = {
    "Bigelow Tea":         "4f8b25ce-57e7-4fa4-909b-e953a78b4172",
    "Discount Tire":       "7551ac58-4e04-4343-bee0-f5686a2da02c",
    "Hankook":             "a2522508-e708-4d91-8ee2-75e200592506",
    "Kenda":               "8ae8221c-e0b2-44d1-9f51-0a5e7c5cc428",
    "Kumho":               "6c6b2965-b870-40a4-a9b8-568eee485257",
    "LG":                  "14d1e93d-bd7e-42a3-a75b-5cc5c34c4a51",
    "Lumber Liquidators":  "d9f466db-2ed3-424b-8180-86fe9b126faa",
    "Lucas Oil":           "5f120484-89a6-4a29-8de5-8fe5709c1f5d",
    "Tire Rack":           "9a48b042-33cd-47ff-a38b-7c789a1fb3ca",
    "Authority":           "67ee1571-53da-4911-aab9-9ec5eb833dc8",  # Authority Brands
}

MONTH_TO_ENUM = {
    "jan":"JAN","feb":"FEB","mar":"MAR","apr":"APR","may":"MAY","jun":"JUN",
    "jul":"JUL","aug":"AUG","sep":"SEP","oct":"OCT","nov":"NOV","dec":"DEC",
}

LEAGUE_TOKENS = {"MLB","NBA","NHL","MLS","NFL","NCAA"}

# Heuristic: which calendar year does this league's month fall in?
# MLB Mar-Oct  -> all 2026
# NBA Oct-Sep  -> Oct/Nov/Dec are 2025, Jan-Sep are 2026 (season spans calendar boundary)
# NHL Oct-Apr  -> Oct/Nov/Dec are 2025, Jan-Apr 2026
# MLS Feb-Dec  -> all 2026
def derive_year(league, month_abbr, sheet_year=2026):
    m = month_abbr.lower()
    if league in ("MLB", "MLS"):
        return sheet_year
    if league in ("NBA", "NHL"):
        if m in ("oct", "nov", "dec"):
            return sheet_year - 1
        return sheet_year
    return sheet_year


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(f"{TWENTY_BASE}/graphql", data=body,
        headers={"Authorization": f"Bearer {TWENTY_API_KEY}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        d = json.loads(resp.read().decode("utf-8"))
    if d.get("errors"):
        raise RuntimeError(f"GraphQL: {json.dumps(d['errors'])[:500]}")
    return d["data"]


def existing_keys():
    out = set()
    after = None
    while True:
        var = {"first": 200}
        if after:
            var["after"] = after
        d = gql("""
            query All($first: Int, $after: String) {
              nielsenVerifications(first: $first, after: $after) {
                edges { node { sponsorId league month year } cursor }
                pageInfo { hasNextPage endCursor }
              }
            }
        """, var)
        edges = d["nielsenVerifications"]["edges"]
        for e in edges:
            n = e["node"]
            out.add((n.get("sponsorId"), n.get("league"), n.get("month"), n.get("year")))
        if not d["nielsenVerifications"]["pageInfo"]["hasNextPage"]:
            break
        after = d["nielsenVerifications"]["pageInfo"]["endCursor"]
    return out


def parse_grid_sections(ws):
    """Find each (league, month_headers_row, value_row) triple in the sheet.

    Pattern: a row whose col-A is a league token (MLB/NBA/NHL/MLS), followed by
    'Monthly Schedule Check on Nielsen' row whose cols 2..N are month headers,
    followed by 'Correct?' row whose cols 2..N are TRUE/FALSE.
    """
    sections = []
    max_r = ws.max_row
    last_league = None
    for r in range(1, max_r + 1):
        a = str(ws.cell(r, 1).value or "").strip()
        # League marker row
        if a.upper() in LEAGUE_TOKENS:
            last_league = a.upper()
            continue
        if a.lower().startswith("monthly schedule check"):
            # Use last_league if set, else default to MLB (most sheets)
            league = last_league or "MLB"
            month_row = r
            value_row = None
            for rr in range(r + 1, min(r + 5, max_r + 1)):
                if str(ws.cell(rr, 1).value or "").strip().lower() == "correct?":
                    value_row = rr
                    break
            if value_row:
                sections.append((league, month_row, value_row))
    return sections


def create_verification(payload):
    d = gql("""
        mutation Create($data: NielsenVerificationCreateInput!) {
          createNielsenVerification(data: $data) { id }
        }
    """, {"data": payload})
    return d["createNielsenVerification"]["id"]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/root/rag2/ANC M&S Master Schedule 2026_5_8.xlsx"
    wb = openpyxl.load_workbook(path, data_only=True)
    print("Loading existing nielsenVerifications for idempotency...")
    existing = existing_keys()
    print(f"  {len(existing)} existing")

    total_created = 0
    total_skipped = 0
    issues = []

    for sname, sponsor_id in SPONSOR_SHEETS.items():
        if sname not in wb.sheetnames:
            issues.append(f"Sheet not found: {sname}")
            continue
        ws = wb[sname]
        sections = parse_grid_sections(ws)
        print(f"\n== {sname} ({len(sections)} grid sections) ==")
        for league, month_row, value_row in sections:
            # Read months across columns 2..max
            for c in range(2, ws.max_column + 1):
                month_cell = str(ws.cell(month_row, c).value or "").strip().lower()
                if not month_cell or month_cell[:3] not in MONTH_TO_ENUM:
                    continue
                month_enum = MONTH_TO_ENUM[month_cell[:3]]
                year = derive_year(league, month_cell[:3])
                val_cell = ws.cell(value_row, c).value
                is_correct = bool(val_cell) and str(val_cell).strip().lower() in ("true", "yes", "1", "✓")
                key = (sponsor_id, league, month_enum, year)
                if key in existing:
                    total_skipped += 1
                    continue
                payload = {
                    "sponsorId": sponsor_id,
                    "league": league,
                    "month": month_enum,
                    "year": year,
                    "isCorrect": is_correct,
                }
                if is_correct:
                    payload["verifiedDate"] = date.today().isoformat()
                try:
                    create_verification(payload)
                    total_created += 1
                    existing.add(key)
                    time.sleep(0.04)
                except Exception as e:
                    issues.append(f"{sname} {league} {month_enum} {year}: {str(e)[:160]}")

        print(f"   running totals: created={total_created} skipped={total_skipped}")

    print(f"\n=== TOTALS: created={total_created} skipped={total_skipped} ===")
    if issues:
        print("\nIssues:")
        for line in issues:
            print(f"  {line}")


if __name__ == "__main__":
    main()
