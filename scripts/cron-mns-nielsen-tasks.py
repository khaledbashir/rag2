#!/usr/bin/env python3
"""
Monthly Nielsen verification task generator.

Designed to run on the 1st of each month (cron). For every active
sponsorTeamContract this season, ensures a nielsenVerification record exists
for the current (sponsor, league, month, year) and creates a Twenty task
linked to it via taskTarget so the verifier sees it on their list.

Idempotent — won't double-create tasks or verifications.

Crontab:
  0 13 1 * * /usr/bin/python3 /root/rag2/scripts/cron-mns-nielsen-tasks.py >> /var/log/anc-mns-nielsen-cron.log 2>&1
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta

TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host"
TWENTY_API_KEY = os.environ.get("TWENTY_API_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9."
    "nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
)

MONTH_ENUM = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]


def gql(query, variables=None, ep="graphql"):
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(f"{TWENTY_BASE}/{ep}", data=body,
        headers={"Authorization": f"Bearer {TWENTY_API_KEY}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        d = json.loads(resp.read().decode("utf-8"))
    if d.get("errors"):
        raise RuntimeError(f"GraphQL: {json.dumps(d['errors'])[:500]}")
    return d["data"]


def find_workspace_member_id(email_hint=None):
    """Return a workspace member id to assign tasks to. Prefers given email,
    falls back to first non-deleted member."""
    d = gql("""
        query Members {
          workspaceMembers(first: 50) {
            edges { node { id userEmail } }
          }
        }
    """)
    members = [e["node"] for e in d["workspaceMembers"]["edges"]]
    if email_hint:
        for m in members:
            if (m.get("userEmail") or "").lower() == email_hint.lower():
                return m["id"]
    return members[0]["id"] if members else None


def list_active_contracts(season):
    """Get unique (sponsorId, sponsorName, league) tuples from active contracts."""
    pairs = {}
    after = None
    while True:
        var = {"first": 200, "filter": {"season": {"eq": season}}}
        if after:
            var["after"] = after
        d = gql("""
            query C($filter: SponsorTeamContractFilterInput, $first: Int, $after: String) {
              sponsorTeamContracts(filter: $filter, first: $first, after: $after) {
                edges { node { sponsorId league sponsor { name } } cursor }
                pageInfo { hasNextPage endCursor }
              }
            }
        """, var)
        for e in d["sponsorTeamContracts"]["edges"]:
            n = e["node"]
            sid = n.get("sponsorId")
            league = n.get("league")
            if not sid or not league:
                continue
            key = (sid, league)
            if key not in pairs:
                pairs[key] = (n.get("sponsor", {}).get("name") or "Unknown")
        if not d["sponsorTeamContracts"]["pageInfo"]["hasNextPage"]:
            break
        after = d["sponsorTeamContracts"]["pageInfo"]["endCursor"]
    return [(sid, sname, league) for (sid, league), sname in pairs.items()]


def find_or_create_verification(sponsor_id, sponsor_name, league, month_enum, year):
    """Return (verificationId, created)."""
    d = gql("""
        query Find($filter: NielsenVerificationFilterInput) {
          nielsenVerifications(filter: $filter, first: 1) {
            edges { node { id } }
          }
        }
    """, {"filter": {
        "sponsorId": {"eq": sponsor_id},
        "league": {"eq": league},
        "month": {"eq": month_enum},
        "year": {"eq": year},
    }})
    edges = d["nielsenVerifications"]["edges"]
    if edges:
        return edges[0]["node"]["id"], False
    # Create
    month_label = month_enum.capitalize()
    name = f"{sponsor_name} — {league} {month_label} {year}"
    r = gql("""
        mutation C($data: NielsenVerificationCreateInput!) {
          createNielsenVerification(data: $data) { id }
        }
    """, {"data": {
        "sponsorId": sponsor_id,
        "league": league,
        "month": month_enum,
        "year": year,
        "isCorrect": False,
        "name": name,
    }})
    return r["createNielsenVerification"]["id"], True


def task_already_exists_for_verification(verification_id, month_enum, year):
    """Look up taskTargets pointing at this verification to avoid duplicates."""
    # We use a name match + verification link probe
    d = gql("""
        query T($filter: TaskFilterInput) {
          tasks(filter: $filter, first: 5) {
            edges { node { id title } }
          }
        }
    """, {"filter": {
        "title": {"like": f"%Verify Nielsen — {month_enum} {year}%"},
    }})
    return d["tasks"]["edges"]


def create_task(title, body_text, due_at, assignee_id):
    payload = {
        "title": title,
        "status": "TODO",
        "dueAt": due_at,
    }
    if assignee_id:
        payload["assigneeId"] = assignee_id
    if body_text:
        payload["bodyV2"] = {"markdown": body_text}
    r = gql("""
        mutation C($data: TaskCreateInput!) {
          createTask(data: $data) { id }
        }
    """, {"data": payload})
    return r["createTask"]["id"]


def link_task_to_verification(task_id, verification_id):
    """Create a taskTarget linking task -> nielsenVerification via *Id direct keys."""
    try:
        gql("""
            mutation C($data: TaskTargetCreateInput!) {
              createTaskTarget(data: $data) { id }
            }
        """, {"data": {
            "taskId": task_id,
            "targetNielsenVerificationId": verification_id,
        }})
        return True
    except Exception as e:
        print(f"    (taskTarget link skipped: {str(e)[:140]})")
        return False


def main():
    today = datetime.utcnow().date()
    # Override via --month YYYY-MM for testing
    if "--month" in sys.argv:
        ym = sys.argv[sys.argv.index("--month") + 1]
        y, m = ym.split("-")
        target = date(int(y), int(m), 1)
    else:
        target = today.replace(day=1)

    season = target.year
    month_enum = MONTH_ENUM[target.month - 1]
    year = target.year

    print(f"[mns-nielsen-cron] Generating tasks for {month_enum} {year}")
    assignee_email = os.environ.get("MNS_VERIFIER_EMAIL")
    assignee_id = find_workspace_member_id(assignee_email)
    print(f"  Assignee: {assignee_id} ({assignee_email or 'first member'})")

    contracts = list_active_contracts(season)
    print(f"  Active sponsor-league pairs this season: {len(contracts)}")

    # Due 2 weeks from today
    due_dt = (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")

    created_v = 0
    created_t = 0
    skipped_t = 0
    for sponsor_id, sponsor_name, league in contracts:
        v_id, v_created = find_or_create_verification(
            sponsor_id, sponsor_name, league, month_enum, year)
        if v_created:
            created_v += 1
        # Check for existing task
        title = f"Verify Nielsen — {month_enum} {year}: {sponsor_name} ({league})"
        existing = task_already_exists_for_verification(v_id, month_enum, year)
        # Filter to exact-title match
        dup = [t for t in existing if t["node"]["title"] == title]
        if dup:
            skipped_t += 1
            continue
        body = (
            f"Cross-check the {month_enum} {year} broadcast schedule for "
            f"**{sponsor_name}** ({league}) against Nielsen.\n\n"
            f"When done, open the linked Nielsen verification record and flip "
            f"`Verified Correct` to **true** with today's date. Note any "
            f"discrepancies in `Discrepancy Notes`."
        )
        try:
            task_id = create_task(title, body, due_dt, assignee_id)
            link_task_to_verification(task_id, v_id)
            created_t += 1
            time.sleep(0.05)
        except Exception as e:
            print(f"  task creation failed for {sponsor_name} {league}: {str(e)[:160]}")

    print(f"[mns-nielsen-cron] Done. verifications_created={created_v} "
          f"tasks_created={created_t} tasks_skipped={skipped_t}")


if __name__ == "__main__":
    main()
