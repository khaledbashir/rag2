#!/usr/bin/env python3
"""
Backfill the `name` field on every mediaPlacement / nielsenVerification /
sponsorTeamContract record so they stop showing as "Untitled" in the table.

Naming format:
  mediaPlacement       -> "2026-03-28 Mets vs Pirates — Tire Rack (HP Full #1)"
  nielsenVerification  -> "Tire Rack — MLB Mar 2026"
  sponsorTeamContract  -> "Tire Rack × NY Mets (MLB 2026)"
"""
import json
import os
import time
import urllib.request

TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host"
TWENTY_API_KEY = os.environ.get("TWENTY_API_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9."
    "nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
)

PLACEMENT_LABELS = {
    "HOMEPLATE_FULL_1": "HP Full #1",
    "HOMEPLATE_FULL_2": "HP Full #2",
    "HOMEPLATE_HALF_1": "HP Half #1",
    "HOMEPLATE_HALF_2": "HP Half #2",
    "SMALL_HOMEPLATE_1": "Small HP #1",
    "SMALL_HOMEPLATE_2": "Small HP #2",
    "OTHER": "",
}

MONTH_LABEL = {
    "JAN":"Jan","FEB":"Feb","MAR":"Mar","APR":"Apr","MAY":"May","JUN":"Jun",
    "JUL":"Jul","AUG":"Aug","SEP":"Sep","OCT":"Oct","NOV":"Nov","DEC":"Dec",
}


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


def short_team(name):
    if not name:
        return ""
    n = name
    # Strip stadium suffixes like " | Citi Field", " / Fenway Park", " (PNC Park)"
    for sep in [" | ", " / ", " ("]:
        if sep in n:
            n = n.split(sep)[0]
    # Common short forms
    aliases = {
        "Arizona Diamondbacks":"D-backs",
        "New York Mets":"Mets",
        "New York Yankees":"Yankees",
        "Boston Red Sox":"Red Sox",
        "Philadelphia Phillies":"Phillies",
        "Pittsburgh Pirates":"Pirates",
        "Milwaukee Brewers":"Brewers",
        "Detroit Tigers":"Tigers",
        "Kansas City Royals":"Royals",
        "Los Angeles Angels":"Angels",
        "Miami Marlins":"Marlins",
        "St. Louis Cardinals":"Cardinals",
        "Toronto Blue Jays":"Blue Jays",
        "Seattle Mariners":"Mariners",
        "Tampa Bay Rays":"Rays",
        "Washington Nationals":"Nationals",
        "Cincinnati Reds":"Reds",
        "Colorado Rockies":"Rockies",
        "Chicago White Sox":"White Sox",
        "Chicago Cubs":"Cubs",
        "Houston Astros":"Astros",
        "San Diego Padres":"Padres",
        "Atlanta Braves":"Braves",
        "Minnesota Twins":"Twins",
        "Cleveland Guardians":"Guardians",
        "Los Angeles Dodgers":"Dodgers",
        "San Francisco Giants":"Giants",
        "Baltimore Orioles":"Orioles",
        "Athletics (Las Vegas Athletics)":"Athletics",
    }
    return aliases.get(n.strip(), n.strip())


def short_sponsor(name):
    if not name:
        return ""
    n = name.strip()
    aliases = {
        "Tire Rack.com":"Tire Rack",
        "Hankook Tire America Corp.":"Hankook",
        "Hankook Tire Canada Corp.":"Hankook",
        "Lucas Oil Products Inc":"Lucas Oil",
        "Lumber Liquidators Flooring":"Lumber Liquidators",
        "Cabinets To Go":"Cabinets To Go",
        "LG Electronics":"LG",
        "Kumho Tire":"Kumho",
        "Kenda Tire":"Kenda",
        "National Highway Traffic Safety Administration (NHTSA)":"NHTSA",
        "Authority Brands":"Authority Brands",
        "Bigelow Tea":"Bigelow",
        "Discount Tire":"Discount Tire",
    }
    return aliases.get(n, n)


def page_through(query_name, sub_query, var=None):
    all_rows = []
    after = None
    while True:
        v = dict(var or {})
        v["first"] = 200
        if after:
            v["after"] = after
        d = gql(f"""
            query Pg($first: Int, $after: String) {{
              {query_name}(first: $first, after: $after) {{
                edges {{ node {{ {sub_query} }} cursor }}
                pageInfo {{ hasNextPage endCursor }}
              }}
            }}
        """, v)
        edges = d[query_name]["edges"]
        all_rows.extend(e["node"] for e in edges)
        if not d[query_name]["pageInfo"]["hasNextPage"]:
            break
        after = d[query_name]["pageInfo"]["endCursor"]
    return all_rows


def update_record(mutation_name, record_id, name):
    gql(f"""
        mutation U($id: UUID!, $data: {mutation_name.replace('update','').replace('Update','')}UpdateInput!) {{
          {mutation_name}(id: $id, data: $data) {{ id name }}
        }}
    """, {"id": record_id, "data": {"name": name}})


def backfill_placements():
    print("\n== mediaPlacement ==")
    rows = page_through(
        "mediaPlacements",
        "id name gameDate placementType homeTeam { name } awayTeam { name } sponsor { name }",
    )
    print(f"  total {len(rows)}")
    updated = 0
    skipped = 0
    for r in rows:
        if r.get("name") and r["name"] not in ("", "Untitled"):
            skipped += 1
            continue
        date = (r.get("gameDate") or "")[:10]
        home = short_team(r.get("homeTeam", {}).get("name") if r.get("homeTeam") else "")
        away = short_team(r.get("awayTeam", {}).get("name") if r.get("awayTeam") else "")
        sponsor = short_sponsor(r.get("sponsor", {}).get("name") if r.get("sponsor") else "")
        ptype = r.get("placementType") or ""
        ptag = PLACEMENT_LABELS.get(ptype, "")
        matchup = f"{home} vs {away}" if home and away else (home or away or "")
        # A record missing date/teams/sponsor must not become a bare
        # parenthetical like "(HP Full #1)". When the placement tag is all we
        # have, lead with it and say plainly that it isn't scheduled yet.
        if not date and not matchup and not sponsor:
            name = f"{ptag} — unscheduled" if ptag else ""
        else:
            parts = [p for p in [date, matchup, sponsor and f"— {sponsor}", ptag and f"({ptag})"] if p]
            name = " ".join(parts).strip()
        if not name:
            continue
        try:
            update_record("updateMediaPlacement", r["id"], name)
            updated += 1
            if updated % 50 == 0:
                print(f"  {updated} updated...")
            time.sleep(0.03)
        except Exception as e:
            print(f"  err {r['id']}: {e}")
    print(f"  -> updated={updated} skipped={skipped}")


def backfill_nielsen():
    print("\n== nielsenVerification ==")
    rows = page_through(
        "nielsenVerifications",
        "id name league month year sponsor { name }",
    )
    print(f"  total {len(rows)}")
    updated = 0
    for r in rows:
        if r.get("name") and r["name"] not in ("", "Untitled"):
            continue
        sponsor = short_sponsor(r.get("sponsor", {}).get("name") if r.get("sponsor") else "")
        league = r.get("league") or ""
        month = MONTH_LABEL.get(r.get("month") or "", r.get("month") or "")
        year = r.get("year") or ""
        name = f"{sponsor} — {league} {month} {year}".strip()
        if not name:
            continue
        try:
            update_record("updateNielsenVerification", r["id"], name)
            updated += 1
            time.sleep(0.03)
        except Exception as e:
            print(f"  err {r['id']}: {e}")
    print(f"  -> updated={updated}")


def backfill_contracts():
    print("\n== sponsorTeamContract ==")
    rows = page_through(
        "sponsorTeamContracts",
        "id name league season contractedGames contractedLabel sponsor { name } team { name }",
    )
    print(f"  total {len(rows)}")
    updated = 0
    for r in rows:
        if r.get("name") and r["name"] not in ("", "Untitled"):
            continue
        sponsor = short_sponsor(r.get("sponsor", {}).get("name") if r.get("sponsor") else "")
        team = short_team(r.get("team", {}).get("name") if r.get("team") else "")
        league = r.get("league") or ""
        season = r.get("season") or ""
        games = r.get("contractedGames") or 0
        label = r.get("contractedLabel") or ""
        suffix = f"{games} games" if games else label
        suffix = f" — {suffix}" if suffix else ""
        # Only join the two sides when both exist, otherwise a missing sponsor
        # leaves a dangling "× Red Sox (MLB 2026)".
        pairing = f"{sponsor} × {team}" if sponsor and team else (sponsor or team or "")
        season_tag = " ".join(p for p in [league, str(season) if season else ""] if p)
        name = " ".join(p for p in [pairing, f"({season_tag})" if season_tag else ""] if p) + suffix
        name = name.strip()
        if not name:
            continue
        try:
            update_record("updateSponsorTeamContract", r["id"], name)
            updated += 1
            time.sleep(0.03)
        except Exception as e:
            print(f"  err {r['id']}: {e}")
    print(f"  -> updated={updated}")


if __name__ == "__main__":
    backfill_contracts()
    backfill_nielsen()
    backfill_placements()
    print("\nDone.")
