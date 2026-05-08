#!/usr/bin/env python3
"""
Build the Media & Sponsorship operating layer in Twenty CRM.

Creates two custom objects and their fields in the live workspace.
Idempotent: skips objects/fields that already exist.

Objects created:
  - mediaPlacement   (game × sponsor × position × inning)
  - nielsenVerification (monthly Nielsen check per sponsor per league)

Run:  python3 /root/rag2/scripts/build-mns-schema.py
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host"
TWENTY_API_KEY = os.environ.get("TWENTY_API_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9."
    "nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
)

COMPANY_OBJECT_ID = "ccd95b3f-4a9a-443c-b8f2-01bff6c479ab"
OPPORTUNITY_OBJECT_ID = "c779922d-cf25-4a5e-9382-23eb1c02199e"


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
        body = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} on {endpoint}: {body}")
    if data.get("errors"):
        raise SystemExit(f"GraphQL errors: {json.dumps(data['errors'], indent=2)}\nQuery: {query[:200]}")
    return data["data"]


def find_object_by_name(name_singular):
    data = gql(
        "metadata",
        """
        query Objs {
          objects(paging: { first: 200 }) {
            edges { node { id nameSingular } }
          }
        }
        """,
    )
    for edge in data["objects"]["edges"]:
        if edge["node"]["nameSingular"] == name_singular:
            return edge["node"]["id"]
    return None


def list_field_names(object_id):
    data = gql(
        "metadata",
        """
        query Obj($id: UUID!) {
          object(id: $id) {
            fieldsList { id name type }
          }
        }
        """,
        {"id": object_id},
    )
    return {f["name"]: f for f in data["object"]["fieldsList"]}


def create_object(name_singular, name_plural, label_singular, label_plural, icon, description):
    existing = find_object_by_name(name_singular)
    if existing:
        print(f"  [skip] object {name_singular} already exists: {existing}")
        return existing
    data = gql(
        "metadata",
        """
        mutation CreateObj($input: CreateOneObjectInput!) {
          createOneObject(input: $input) { id nameSingular }
        }
        """,
        {
            "input": {
                "object": {
                    "nameSingular": name_singular,
                    "namePlural": name_plural,
                    "labelSingular": label_singular,
                    "labelPlural": label_plural,
                    "icon": icon,
                    "description": description,
                    "isLabelSyncedWithName": False,
                }
            }
        },
    )
    new_id = data["createOneObject"]["id"]
    print(f"  [created] object {name_singular} -> {new_id}")
    return new_id


def create_field(object_id, name, label, ftype, description=None, options=None,
                 settings=None, default_value=None, icon=None,
                 relation_payload=None):
    existing = list_field_names(object_id)
    if name in existing:
        print(f"    [skip] field {name} already exists: {existing[name]['id']}")
        return existing[name]["id"]
    field_input = {
        "type": ftype,
        "name": name,
        "label": label,
        "objectMetadataId": object_id,
        "isCustom": True,
        "isActive": True,
        "isLabelSyncedWithName": False,
    }
    if description:
        field_input["description"] = description
    if icon:
        field_input["icon"] = icon
    if options is not None:
        field_input["options"] = options
    if settings is not None:
        field_input["settings"] = settings
    if default_value is not None:
        field_input["defaultValue"] = default_value
    if relation_payload is not None:
        field_input["relationCreationPayload"] = relation_payload
    data = gql(
        "metadata",
        """
        mutation CreateField($input: CreateOneFieldMetadataInput!) {
          createOneField(input: $input) { id name type }
        }
        """,
        {"input": {"field": field_input}},
    )
    new_id = data["createOneField"]["id"]
    print(f"    [created] field {name} ({ftype}) -> {new_id}")
    time.sleep(0.2)
    return new_id


# ---------- mediaPlacement ----------

def build_media_placement():
    print("\n== mediaPlacement ==")
    obj_id = create_object(
        name_singular="mediaPlacement",
        name_plural="mediaPlacements",
        label_singular="Media Placement",
        label_plural="Media Placements",
        icon="IconBroadcast",
        description="Game-level sponsor placement (game x sponsor x homeplate position x inning) for M&S inventory and Nielsen verification.",
    )

    create_field(obj_id, "gameDate", "Game Date", "DATE", icon="IconCalendar")
    create_field(obj_id, "gameTime", "Game Time (EST)", "TEXT", icon="IconClock")

    create_field(
        obj_id, "homeTeam", "Home Team", "RELATION",
        icon="IconHome",
        relation_payload={
            "type": "MANY_TO_ONE",
            "targetObjectMetadataId": COMPANY_OBJECT_ID,
            "targetFieldLabel": "Home-Team Media Placements",
            "targetFieldIcon": "IconBroadcast",
        },
    )
    create_field(
        obj_id, "awayTeam", "Away Team", "RELATION",
        icon="IconPlane",
        relation_payload={
            "type": "MANY_TO_ONE",
            "targetObjectMetadataId": COMPANY_OBJECT_ID,
            "targetFieldLabel": "Away-Team Media Placements",
            "targetFieldIcon": "IconBroadcast",
        },
    )
    create_field(
        obj_id, "sponsor", "Sponsor", "RELATION",
        icon="IconStar",
        relation_payload={
            "type": "MANY_TO_ONE",
            "targetObjectMetadataId": COMPANY_OBJECT_ID,
            "targetFieldLabel": "Media Placements (Sponsor)",
            "targetFieldIcon": "IconBroadcast",
        },
    )
    create_field(
        obj_id, "opportunity", "Opportunity", "RELATION",
        icon="IconTargetArrow",
        relation_payload={
            "type": "MANY_TO_ONE",
            "targetObjectMetadataId": OPPORTUNITY_OBJECT_ID,
            "targetFieldLabel": "Media Placements",
            "targetFieldIcon": "IconBroadcast",
        },
    )

    create_field(obj_id, "homeTVNetwork", "Home TV Network", "TEXT", icon="IconDeviceTv")
    create_field(obj_id, "awayTVNetwork", "Away TV Network", "TEXT", icon="IconDeviceTv")
    create_field(obj_id, "nationalTVNetwork", "National TV Network", "TEXT", icon="IconBroadcast")
    create_field(obj_id, "inningScheduled", "Inning Scheduled", "TEXT",
                 description="e.g. T2, B7, B3 — top/bottom + inning number",
                 icon="IconBaseball")

    position_options = [
        {"value": "HOMEPLATE_FULL_1", "label": "Homeplate Full #1", "color": "blue", "position": 0},
        {"value": "HOMEPLATE_FULL_2", "label": "Homeplate Full #2", "color": "sky", "position": 1},
        {"value": "HOMEPLATE_HALF_1", "label": "Homeplate Half #1", "color": "green", "position": 2},
        {"value": "HOMEPLATE_HALF_2", "label": "Homeplate Half #2", "color": "lime", "position": 3},
        {"value": "SMALL_HOMEPLATE_1", "label": "Small Homeplate #1", "color": "orange", "position": 4},
        {"value": "SMALL_HOMEPLATE_2", "label": "Small Homeplate #2", "color": "yellow", "position": 5},
        {"value": "OTHER", "label": "Other", "color": "gray", "position": 6},
    ]
    create_field(obj_id, "position", "Position", "SELECT",
                 options=position_options,
                 default_value="'HOMEPLATE_FULL_1'",
                 icon="IconMapPin")

    status_options = [
        {"value": "SCHEDULED", "label": "Scheduled", "color": "gray", "position": 0},
        {"value": "EXECUTED", "label": "Executed", "color": "green", "position": 1},
        {"value": "NOT_EXECUTED", "label": "Not Executed", "color": "red", "position": 2},
        {"value": "NATIONAL_GAME", "label": "National Game", "color": "blue", "position": 3},
        {"value": "POSTPONED", "label": "Postponed", "color": "orange", "position": 4},
    ]
    create_field(obj_id, "executionStatus", "Execution Status", "SELECT",
                 options=status_options,
                 default_value="'SCHEDULED'",
                 icon="IconCircleCheck")

    league_options = [
        {"value": "MLB", "label": "MLB", "color": "red", "position": 0},
        {"value": "NBA", "label": "NBA", "color": "orange", "position": 1},
        {"value": "NHL", "label": "NHL", "color": "blue", "position": 2},
        {"value": "MLS", "label": "MLS", "color": "green", "position": 3},
        {"value": "NFL", "label": "NFL", "color": "purple", "position": 4},
        {"value": "NCAA", "label": "NCAA", "color": "yellow", "position": 5},
        {"value": "OTHER", "label": "Other", "color": "gray", "position": 6},
    ]
    create_field(obj_id, "league", "League", "SELECT",
                 options=league_options,
                 default_value="'MLB'",
                 icon="IconTrophy")

    create_field(obj_id, "season", "Season", "NUMBER",
                 settings={"type": "int"}, default_value=2026, icon="IconCalendarStats")

    create_field(obj_id, "nielsenVerified", "Nielsen Verified", "BOOLEAN",
                 default_value=False, icon="IconCheck")
    create_field(obj_id, "nielsenVerifiedDate", "Nielsen Verified Date", "DATE",
                 icon="IconCalendarCheck")

    create_field(obj_id, "sponsorGameCount", "Sponsor Game Count", "NUMBER",
                 description="Number of placements this sponsor receives in this game (1 unless multi-position)",
                 settings={"type": "int"}, default_value=1, icon="IconHash")

    create_field(obj_id, "notes", "Notes", "TEXT", icon="IconNote")

    return obj_id


# ---------- nielsenVerification ----------

def build_nielsen_verification():
    print("\n== nielsenVerification ==")
    obj_id = create_object(
        name_singular="nielsenVerification",
        name_plural="nielsenVerifications",
        label_singular="Nielsen Verification",
        label_plural="Nielsen Verifications",
        icon="IconCheckbox",
        description="Monthly Nielsen verification record per sponsor per league. One row per (sponsor, league, month, year).",
    )

    create_field(
        obj_id, "sponsor", "Sponsor", "RELATION",
        icon="IconStar",
        relation_payload={
            "type": "MANY_TO_ONE",
            "targetObjectMetadataId": COMPANY_OBJECT_ID,
            "targetFieldLabel": "Nielsen Verifications",
            "targetFieldIcon": "IconCheckbox",
        },
    )

    league_options = [
        {"value": "MLB", "label": "MLB", "color": "red", "position": 0},
        {"value": "NBA", "label": "NBA", "color": "orange", "position": 1},
        {"value": "NHL", "label": "NHL", "color": "blue", "position": 2},
        {"value": "MLS", "label": "MLS", "color": "green", "position": 3},
        {"value": "NFL", "label": "NFL", "color": "purple", "position": 4},
        {"value": "NCAA", "label": "NCAA", "color": "yellow", "position": 5},
        {"value": "OTHER", "label": "Other", "color": "gray", "position": 6},
    ]
    create_field(obj_id, "league", "League", "SELECT", options=league_options,
                 default_value="'MLB'", icon="IconTrophy")

    month_options = [
        {"value": "JAN", "label": "January",   "color": "gray",  "position": 0},
        {"value": "FEB", "label": "February",  "color": "gray",  "position": 1},
        {"value": "MAR", "label": "March",     "color": "gray",  "position": 2},
        {"value": "APR", "label": "April",     "color": "gray",  "position": 3},
        {"value": "MAY", "label": "May",       "color": "gray",  "position": 4},
        {"value": "JUN", "label": "June",      "color": "gray",  "position": 5},
        {"value": "JUL", "label": "July",      "color": "gray",  "position": 6},
        {"value": "AUG", "label": "August",    "color": "gray",  "position": 7},
        {"value": "SEP", "label": "September", "color": "gray",  "position": 8},
        {"value": "OCT", "label": "October",   "color": "gray",  "position": 9},
        {"value": "NOV", "label": "November",  "color": "gray",  "position": 10},
        {"value": "DEC", "label": "December",  "color": "gray",  "position": 11},
    ]
    create_field(obj_id, "month", "Month", "SELECT", options=month_options,
                 default_value="'MAR'", icon="IconCalendarMonth")

    create_field(obj_id, "year", "Year", "NUMBER",
                 settings={"type": "int"}, default_value=2026, icon="IconCalendarStats")

    create_field(obj_id, "isCorrect", "Verified Correct", "BOOLEAN",
                 default_value=False, icon="IconCheck")
    create_field(obj_id, "verifiedDate", "Verified Date", "DATE", icon="IconCalendarCheck")
    create_field(obj_id, "verifiedByEmail", "Verified By", "TEXT", icon="IconUser")

    create_field(obj_id, "discrepancyNotes", "Discrepancy Notes", "TEXT", icon="IconAlertTriangle")

    return obj_id


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        for n in ("mediaPlacement", "nielsenVerification"):
            print(f"{n}: {find_object_by_name(n)}")
        return
    mp = build_media_placement()
    nv = build_nielsen_verification()
    print(f"\nDone. mediaPlacement={mp}  nielsenVerification={nv}")


if __name__ == "__main__":
    main()
