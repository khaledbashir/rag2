#!/usr/bin/env python3
"""
Build the sponsorTeamContract custom object and load contracted-game counts
from the M&S Master Schedule Inventory sections.

Object: sponsorTeamContract
  - sponsor RELATION -> Company
  - team RELATION -> Company
  - league SELECT (MLB/NBA/NHL/MLS/...)
  - season NUMBER
  - contractedGames NUMBER (explicit count, e.g. 34)
  - contractedLabel TEXT (e.g. "Full Season", "Half-Season", "Minimum of 35 Games")
  - notes TEXT (e.g. "Signage sent", "Need creative")

Idempotent on (sponsorId, teamId, league, season).
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

COMPANY_OBJECT_ID = "ccd95b3f-4a9a-443c-b8f2-01bff6c479ab"

# Sponsor map (subset reused from inventory importer)
SPONSORS = {
    "tire rack":         "9a48b042-33cd-47ff-a38b-7c789a1fb3ca",
    "bigelow tea":       "4f8b25ce-57e7-4fa4-909b-e953a78b4172",
    "kumho":             "6c6b2965-b870-40a4-a9b8-568eee485257",
    "hankook":           "a2522508-e708-4d91-8ee2-75e200592506",
    "discount tire":     "7551ac58-4e04-4343-bee0-f5686a2da02c",
    "lucas oil":         "5f120484-89a6-4a29-8de5-8fe5709c1f5d",
    "lumber liquidators":"d9f466db-2ed3-424b-8180-86fe9b126faa",
    "kenda":             "8ae8221c-e0b2-44d1-9f51-0a5e7c5cc428",
    "lg":                "14d1e93d-bd7e-42a3-a75b-5cc5c34c4a51",
    "authority":         "67ee1571-53da-4911-aab9-9ec5eb833dc8",
}

TEAMS = {
    "Boston Red Sox":       "211af4e6-2f67-4344-96bc-74e90fa7a91d",
    "Los Angeles Angels":   "79b29bb6-9ff5-4378-84b6-50a3b7a90553",
    "LA Angels":            "79b29bb6-9ff5-4378-84b6-50a3b7a90553",
    "Miami Marlins":        "943bfdb7-e683-43b9-aff0-a85a486bd46e",
    "New York Mets":        "c5e68d70-9f8e-47b6-a2af-db46327888c4",
    "New York Yankees":     "d370dc5b-6027-4b98-90aa-71a06b6223fd",
    "Philadelphia Phillies":"4b49cd95-d18c-4514-ba72-6f3c1c3bf66c",
    "Seattle Mariners":     "78a89e66-aa43-45e0-88a8-8f01f8e17a71",
    "Washington Nationals": "de41ff1a-592a-46e2-9bed-6327d4a2ca8b",
    "Detroit Tigers":       "0ed58bd6-d6c2-4533-9e5d-ba38336d14d3",
    "Kansas City Royals":   "230e8510-0170-4cc4-a45d-26d49c3c615d",
    "Milwaukee Brewers":    "02169446-9ec7-4953-a771-e47800d8a140",
    "Toronto Blue Jays":    "ef49aacb-978b-43a5-88d7-c841986d97ac",
    "Arizona Diamondbacks": "b0c58a89-c193-482b-b734-943c193fb5ed",
    "Cincinnati Reds":      "c3670309-8aeb-49b6-b4d8-74718d5b01d3",
    "St. Louis Cardinals":  "13f32394-966a-4365-8e32-11b7f30e804a",
}


def gql(query, variables=None, ep="metadata"):
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(f"{TWENTY_BASE}/{ep}", data=body,
        headers={"Authorization": f"Bearer {TWENTY_API_KEY}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        d = json.loads(resp.read().decode("utf-8"))
    if d.get("errors"):
        raise RuntimeError(f"GraphQL: {json.dumps(d['errors'])[:500]}")
    return d["data"]


def find_object(name_singular):
    d = gql("""query { objects(paging: { first: 200 }) { edges { node { id nameSingular } } } }""")
    for edge in d["objects"]["edges"]:
        if edge["node"]["nameSingular"] == name_singular:
            return edge["node"]["id"]
    return None


def list_field_names(object_id):
    d = gql("""query Obj($id: UUID!) { object(id: $id) { fieldsList { id name type } } }""",
            {"id": object_id})
    return {f["name"]: f for f in d["object"]["fieldsList"]}


def create_object():
    existing = find_object("sponsorTeamContract")
    if existing:
        print(f"[skip] sponsorTeamContract exists: {existing}")
        return existing
    d = gql("""
        mutation Create($input: CreateOneObjectInput!) {
          createOneObject(input: $input) { id }
        }
    """, {"input": {"object": {
        "nameSingular": "sponsorTeamContract",
        "namePlural":   "sponsorTeamContracts",
        "labelSingular":"Sponsor-Team Contract",
        "labelPlural":  "Sponsor-Team Contracts",
        "icon":         "IconHandshake",
        "description":  "Per-sponsor per-team contracted-games allocation. Pairs with mediaPlacement actuals to drive contracted-vs-actual rollups.",
        "isLabelSyncedWithName": False,
    }}})
    new_id = d["createOneObject"]["id"]
    print(f"[created] sponsorTeamContract -> {new_id}")
    return new_id


def create_field(object_id, name, label, ftype, **kwargs):
    existing = list_field_names(object_id)
    if name in existing:
        print(f"  [skip] field {name}: {existing[name]['id']}")
        return existing[name]["id"]
    field_input = {
        "type": ftype, "name": name, "label": label,
        "objectMetadataId": object_id,
        "isCustom": True, "isActive": True, "isLabelSyncedWithName": False,
    }
    for k in ("description", "icon", "options", "settings", "defaultValue", "relationCreationPayload"):
        v = kwargs.get(k)
        if v is not None:
            field_input[k.replace("relationCreationPayload","relationCreationPayload")] = v
    d = gql("""
        mutation Create($input: CreateOneFieldMetadataInput!) {
          createOneField(input: $input) { id name }
        }
    """, {"input": {"field": field_input}})
    print(f"  [created] {name} ({ftype}) -> {d['createOneField']['id']}")
    time.sleep(0.2)
    return d["createOneField"]["id"]


def build_schema():
    obj_id = create_object()
    create_field(obj_id, "sponsor", "Sponsor", "RELATION", icon="IconStar",
        relationCreationPayload={"type":"MANY_TO_ONE","targetObjectMetadataId":COMPANY_OBJECT_ID,
            "targetFieldLabel":"Sponsor Contracts","targetFieldIcon":"IconHandshake"})
    create_field(obj_id, "team", "Team", "RELATION", icon="IconTrophy",
        relationCreationPayload={"type":"MANY_TO_ONE","targetObjectMetadataId":COMPANY_OBJECT_ID,
            "targetFieldLabel":"Team Sponsor Contracts","targetFieldIcon":"IconHandshake"})
    league_options = [
        {"value":"MLB","label":"MLB","color":"red","position":0},
        {"value":"NBA","label":"NBA","color":"orange","position":1},
        {"value":"NHL","label":"NHL","color":"blue","position":2},
        {"value":"MLS","label":"MLS","color":"green","position":3},
        {"value":"NFL","label":"NFL","color":"purple","position":4},
        {"value":"NCAA","label":"NCAA","color":"yellow","position":5},
        {"value":"OTHER","label":"Other","color":"gray","position":6},
    ]
    create_field(obj_id, "league", "League", "SELECT", options=league_options,
                 defaultValue="'MLB'", icon="IconTrophy")
    create_field(obj_id, "season", "Season", "NUMBER", settings={"type":"int"},
                 defaultValue=2026, icon="IconCalendarStats")
    create_field(obj_id, "contractedGames", "Contracted Games", "NUMBER",
                 description="Explicit number of games contracted (use 0 if labeled e.g. 'Full Season' without exact count)",
                 settings={"type":"int"}, defaultValue=0, icon="IconHash")
    create_field(obj_id, "contractedLabel", "Contracted Label", "TEXT",
                 description="Source-file label like 'Full Season', 'Half-Season', 'Minimum of 35 Games', '20 Games'",
                 icon="IconTag")
    create_field(obj_id, "notes", "Notes", "TEXT", icon="IconNote",
                 description="Source notes, e.g. 'Signage sent', 'Need creative', 'Check with them on updated signage'")
    return obj_id


# Contract data extracted from Master Schedule sponsor sheets
CONTRACTS = [
    # Tire Rack — 246 contracted MLB games across 8 teams
    ("tire rack", "Boston Red Sox",        "MLB", 2026, 34, None,           "Signage sent"),
    ("tire rack", "Los Angeles Angels",    "MLB", 2026, 20, None,           "Right Side - need creative"),
    ("tire rack", "Miami Marlins",         "MLB", 2026, 30, None,           "Check with them on updated signage"),
    ("tire rack", "New York Mets",         "MLB", 2026, 20, None,           "They have signage"),
    ("tire rack", "New York Yankees",      "MLB", 2026, 20, None,           "Need creatives and the games"),
    ("tire rack", "Philadelphia Phillies", "MLB", 2026, 37, None,           "Signage sent"),
    ("tire rack", "Seattle Mariners",      "MLB", 2026, 25, None,           "Check with them on updated signage"),
    ("tire rack", "Washington Nationals",  "MLB", 2026, 60, None,           "Signage sent"),
    # Bigelow Tea — Mets minimum 35
    ("bigelow tea", "New York Mets",       "MLB", 2026, 35, "Minimum of 35 Games", "10 games per contract; 1:30 per game"),
    # Hankook — 9 teams labeled Full / Half / 20 Games
    ("hankook", "Boston Red Sox",          "MLB", 2026, 0,  "Full-Season",   None),
    ("hankook", "Detroit Tigers",          "MLB", 2026, 0,  "Half-Season",   None),
    ("hankook", "Kansas City Royals",      "MLB", 2026, 0,  "Half-Season",   None),
    ("hankook", "Los Angeles Angels",      "MLB", 2026, 0,  "Half-Season",   None),
    ("hankook", "Milwaukee Brewers",       "MLB", 2026, 0,  "Half-Season",   None),
    ("hankook", "New York Mets",           "MLB", 2026, 0,  "Half-Season",   None),
    ("hankook", "New York Yankees",        "MLB", 2026, 0,  "Half-Season",   None),
    ("hankook", "Seattle Mariners",        "MLB", 2026, 0,  "Half-Season",   None),
    ("hankook", "Washington Nationals",    "MLB", 2026, 20, "20 Games",      None),
    ("hankook", "Toronto Blue Jays",       "MLB", 2026, 0,  "2 innings per game (separate)", None),
    # Kumho — 6 teams Full Season
    ("kumho", "Arizona Diamondbacks",      "MLB", 2026, 71, "Full Season",   "71 D-backs games"),
    ("kumho", "Cincinnati Reds",           "MLB", 2026, 0,  "Full Season",   None),
    ("kumho", "Detroit Tigers",            "MLB", 2026, 0,  "Full Season",   None),
    ("kumho", "Los Angeles Angels",        "MLB", 2026, 0,  "Full Season",   None),
    ("kumho", "Philadelphia Phillies",     "MLB", 2026, 0,  "Full Season",   None),
    ("kumho", "St. Louis Cardinals",       "MLB", 2026, 0,  "Full Season",   None),
    # LG — 1 team confirmed
    ("lg", "Boston Red Sox",               "MLB", 2026, 0,  "Full Season",   None),
]


def existing_contract_keys(obj_id):
    out = set()
    after = None
    while True:
        var = {"first": 200}
        if after:
            var["after"] = after
        d = gql("""
            query All($first: Int, $after: String) {
              sponsorTeamContracts(first: $first, after: $after) {
                edges { node { sponsorId teamId league season } cursor }
                pageInfo { hasNextPage endCursor }
              }
            }
        """, var, ep="graphql")
        edges = d["sponsorTeamContracts"]["edges"]
        for e in edges:
            n = e["node"]
            out.add((n.get("sponsorId"), n.get("teamId"), n.get("league"), n.get("season")))
        if not d["sponsorTeamContracts"]["pageInfo"]["hasNextPage"]:
            break
        after = d["sponsorTeamContracts"]["pageInfo"]["endCursor"]
    return out


def load_contracts(obj_id):
    print("\nLoading existing contracts for idempotency...")
    existing = existing_contract_keys(obj_id)
    print(f"  {len(existing)} existing")
    created = 0
    skipped = 0
    errors = []
    for sponsor_key, team_name, league, season, games, label, notes in CONTRACTS:
        sponsor_id = SPONSORS.get(sponsor_key)
        team_id = TEAMS.get(team_name)
        if not sponsor_id or not team_id:
            errors.append(f"missing id: sponsor={sponsor_key} team={team_name}")
            continue
        key = (sponsor_id, team_id, league, season)
        if key in existing:
            skipped += 1
            continue
        try:
            payload = {
                "sponsorId": sponsor_id,
                "teamId": team_id,
                "league": league,
                "season": season,
                "contractedGames": games or 0,
            }
            if label:
                payload["contractedLabel"] = label
            if notes:
                payload["notes"] = notes
            gql("""
                mutation C($data: SponsorTeamContractCreateInput!) {
                  createSponsorTeamContract(data: $data) { id }
                }
            """, {"data": payload}, ep="graphql")
            created += 1
            existing.add(key)
            time.sleep(0.05)
        except Exception as e:
            errors.append(f"{sponsor_key} {team_name}: {str(e)[:160]}")
    print(f"\nLoaded: created={created} skipped={skipped} errors={len(errors)}")
    for e in errors[:10]:
        print(f"  {e}")


if __name__ == "__main__":
    obj_id = build_schema()
    print(f"\nsponsorTeamContract id: {obj_id}")
    print("\nWaiting for cache to settle...")
    time.sleep(3)
    load_contracts(obj_id)
