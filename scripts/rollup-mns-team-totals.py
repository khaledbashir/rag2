#!/usr/bin/env python3
"""
M&S team-totals rollup — seeds Company.season2026* fields for all MLB teams.

For each MLB team Company:
  season2026Games     = totalCount(mediaPlacements where homeTeamId=this AND season=2026)
  season2026Executed  = totalCount(... AND executionStatus=EXECUTED)
  season2026Sold      = totalCount(... AND sponsorId != null)
  season2026OpenSlots = (sellableGamesPerSeason × inningPositionsPerGame) − season2026Sold

Idempotent. Re-runnable. Logs per-team breakdown.

This is the one-shot seed; same logic is mirrored in the Twenty logic function
`rollup-team-mns-totals` that fires live on mediaPlacement create/update.

Run:  python3 /root/rag2/scripts/rollup-mns-team-totals.py
      python3 /root/rag2/scripts/rollup-mns-team-totals.py --season 2026
      python3 /root/rag2/scripts/rollup-mns-team-totals.py --team "Washington Nationals"
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

TWENTY_BASE = os.environ.get("TWENTY_BASE", "https://crm.ancsports.net")
TWENTY_API_KEY = os.environ.get("TWENTY_API_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9."
    "nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
)

# Mirror of build-mns-contracts.py / build-mns-inventory-rollup.py MLB_TEAMS dict.
MLB_TEAMS = {
    "Boston Red Sox":        "211af4e6-2f67-4344-96bc-74e90fa7a91d",
    "Los Angeles Angels":    "79b29bb6-9ff5-4378-84b6-50a3b7a90553",
    "Miami Marlins":         "943bfdb7-e683-43b9-aff0-a85a486bd46e",
    "New York Mets":         "c5e68d70-9f8e-47b6-a2af-db46327888c4",
    "New York Yankees":      "d370dc5b-6027-4b98-90aa-71a06b6223fd",
    "Philadelphia Phillies": "4b49cd95-d18c-4514-ba72-6f3c1c3bf66c",
    "Seattle Mariners":      "78a89e66-aa43-45e0-88a8-8f01f8e17a71",
    "Washington Nationals":  "de41ff1a-592a-46e2-9bed-6327d4a2ca8b",
    "Detroit Tigers":        "0ed58bd6-d6c2-4533-9e5d-ba38336d14d3",
    "Kansas City Royals":    "230e8510-0170-4cc4-a45d-26d49c3c615d",
    "Milwaukee Brewers":     "02169446-9ec7-4953-a771-e47800d8a140",
    "Toronto Blue Jays":     "ef49aacb-978b-43a5-88d7-c841986d97ac",
    "Arizona Diamondbacks":  "b0c58a89-c193-482b-b734-943c193fb5ed",
    "Cincinnati Reds":       "c3670309-8aeb-49b6-b4d8-74718d5b01d3",
    "St. Louis Cardinals":   "13f32394-966a-4365-8e32-11b7f30e804a",
}


def gql(endpoint: str, query: str, variables=None):
    url = f"{TWENTY_BASE}/{endpoint}"
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {TWENTY_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_str = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} on {endpoint}:\n{body_str}\nQuery: {query[:300]}")
    if data.get("errors"):
        raise SystemExit(
            f"GraphQL errors on {endpoint}:\n{json.dumps(data['errors'], indent=2)}\nQuery: {query[:300]}"
        )
    return data["data"]


def count(filter_obj):
    """Return totalCount of mediaPlacements matching filter."""
    data = gql(
        "graphql",
        """
        query Cnt($filter: MediaPlacementFilterInput) {
          mediaPlacements(filter: $filter, first: 0) { totalCount }
        }
        """,
        {"filter": filter_obj},
    )
    return data["mediaPlacements"]["totalCount"]


def compute_team_totals(team_id, season):
    """Returns dict with the 4 rollup values for one team-season."""
    games = count({"homeTeamId": {"eq": team_id}, "season": {"eq": season}})
    executed = count({
        "homeTeamId": {"eq": team_id},
        "season": {"eq": season},
        "executionStatus": {"eq": "EXECUTED"},
    })
    sold = count({
        "homeTeamId": {"eq": team_id},
        "season": {"eq": season},
        "sponsorId": {"is": "NOT_NULL"},
    })
    return {"games": games, "executed": executed, "sold": sold}


def get_team_capacity(team_id):
    data = gql(
        "graphql",
        """
        query Cap($id: ID!) {
          company(filter: { id: { eq: $id } }) {
            id name
            sellableGamesPerSeason
            inningPositionsPerGame
          }
        }
        """,
        {"id": team_id},
    )
    n = data.get("company")
    return n


def update_team_totals(team_id, totals, open_slots):
    data = {
        "season2026Games": totals["games"],
        "season2026Executed": totals["executed"],
        "season2026Sold": totals["sold"],
        "season2026OpenSlots": open_slots,
    }
    gql(
        "graphql",
        """
        mutation Upd($id: ID!, $data: CompanyUpdateInput!) {
          updateCompany(id: $id, data: $data) { id }
        }
        """,
        {"id": team_id, "data": data},
    )


def recompute_margin_percent(dry_run=False):
    """Deal-valuation layer: marginPercent = ancMargin / slotRate * 100, per placement.

    Keeps the 'return per position' metric live. Only touches placements where both
    slotRate and ancMargin are set; never fabricates a value when slotRate is empty.
    Returns (scanned, updated).
    """
    scanned = updated = 0
    after = None
    while True:
        data = gql(
            "graphql",
            """
            query MP($after: String) {
              mediaPlacements(first: 200, after: $after,
                filter: { slotRate: { amountMicros: { is: NOT_NULL } } }) {
                edges { node { id slotRate { amountMicros } ancMargin { amountMicros } marginPercent } }
                pageInfo { hasNextPage endCursor }
              }
            }
            """,
            {"after": after},
        )
        conn = data["mediaPlacements"]
        for edge in conn["edges"]:
            n = edge["node"]
            scanned += 1
            rate = (n.get("slotRate") or {}).get("amountMicros")
            marg = (n.get("ancMargin") or {}).get("amountMicros")
            if not rate or rate == 0 or marg is None:
                continue
            pct = round(marg / rate * 100, 1)
            if n.get("marginPercent") == pct:
                continue
            updated += 1
            if not dry_run:
                gql(
                    "graphql",
                    """
                    mutation UpdMP($id: ID!, $data: MediaPlacementUpdateInput!) {
                      updateMediaPlacement(id: $id, data: $data) { id }
                    }
                    """,
                    {"id": n["id"], "data": {"marginPercent": pct}},
                )
        if not conn["pageInfo"]["hasNextPage"]:
            break
        after = conn["pageInfo"]["endCursor"]
    return scanned, updated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--team", help="Restrict to one team by name")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # Deal-valuation layer: keep marginPercent in sync on every run.
    mp_scanned, mp_updated = recompute_margin_percent(dry_run=args.dry_run)
    print(f"Margin%% recompute: scanned {mp_scanned} priced placements, updated {mp_updated}\n")

    targets = MLB_TEAMS
    if args.team:
        if args.team not in MLB_TEAMS:
            raise SystemExit(f"Unknown team: {args.team}\nKnown: {list(MLB_TEAMS)}")
        targets = {args.team: MLB_TEAMS[args.team]}

    print(f"Target: {TWENTY_BASE}")
    print(f"Season: {args.season}   DRY-RUN: {args.dry_run}\n")
    print(f"{'TEAM':28} {'GAMES':>7} {'EXEC':>6} {'SOLD':>6} {'SELL':>6} {'POS':>4} {'OPEN':>6}")
    print("-" * 75)

    total_games = total_exec = total_sold = total_open = 0

    for name, cid in targets.items():
        cap = get_team_capacity(cid)
        sellable = cap.get("sellableGamesPerSeason") or 0
        positions = cap.get("inningPositionsPerGame") or 0
        totals = compute_team_totals(cid, args.season)
        open_slots = max(0, sellable * positions - totals["sold"])

        total_games += totals["games"]
        total_exec += totals["executed"]
        total_sold += totals["sold"]
        total_open += open_slots

        print(
            f"{name:28} {totals['games']:>7} {totals['executed']:>6} "
            f"{totals['sold']:>6} {sellable:>6} {positions:>4} {open_slots:>6}"
        )

        if not args.dry_run:
            update_team_totals(cid, totals, open_slots)

    print("-" * 75)
    print(f"{'TOTAL':28} {total_games:>7} {total_exec:>6} {total_sold:>6} {'':>6} {'':>4} {total_open:>6}")
    print()
    print("Done." if not args.dry_run else "Dry run — no updates written.")


if __name__ == "__main__":
    main()
