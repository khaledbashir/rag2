#!/usr/bin/env python3
"""
Salesforce → Twenty CRM Migration
Reads exported SF JSON files and batch-imports into Twenty CRM.

Usage:
  python3 scripts/sf-to-twenty-migrate.py [companies|people|opportunities|all] [--dry-run]
"""

import json
import sys
import os
import time
import urllib.request
import urllib.error

# --- Config ---
TWENTY_URL = "https://abc-twenty.izcgmb.easypanel.host/rest"
TWENTY_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
SF_EXPORT_DIR = "docs/salesforce-export"
DRY_RUN = "--dry-run" in sys.argv

# Track SF ID → Twenty ID mappings for linking
COMPANY_MAP = {}  # sf_account_id → twenty_company_id
COMPANY_MAP_FILE = f"{SF_EXPORT_DIR}/company_id_map.json"


def twenty_post(endpoint: str, data: dict, retries: int = 5) -> dict | None:
    """POST to Twenty CRM REST API with rate limit retry."""
    if DRY_RUN:
        return {"data": {"id": "dry-run-id"}}

    url = f"{TWENTY_URL}/{endpoint}"
    body = json.dumps(data).encode()
    headers = {
        "Authorization": f"Bearer {TWENTY_TOKEN}",
        "Content-Type": "application/json",
    }

    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            # Skip duplicates silently
            if "already exists" in error_body.lower() or e.code == 409:
                return None
            # Rate limited — wait and retry
            if e.code == 429:
                wait = 2 ** attempt + 1  # 2, 3, 5, 9, 17 seconds
                time.sleep(wait)
                continue
            # Validation error — log and skip
            if e.code == 400:
                print(f"    SKIP (400): {error_body[:150]}", file=sys.stderr)
                return None
            print(f"    ERROR {e.code}: {error_body[:200]}", file=sys.stderr)
            return None

    print(f"    RATE LIMITED: gave up after {retries} retries", file=sys.stderr)
    return None


def twenty_get_all(endpoint: str) -> list:
    """GET all records from a Twenty endpoint (paginated)."""
    headers = {
        "Authorization": f"Bearer {TWENTY_TOKEN}",
        "Content-Type": "application/json",
    }
    all_records = []
    cursor = None

    while True:
        url = f"{TWENTY_URL}/{endpoint}?limit=60"
        if cursor:
            url += f"&starting_after={cursor}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())

        # Extract records - Twenty returns data under plural key
        records_wrapper = data.get("data", {})
        # Get the first key that's a list
        records = []
        for key, val in records_wrapper.items():
            if isinstance(val, list):
                records = val
                break
        all_records.extend(records)

        page_info = data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    return all_records


# ============================================================================
# FIELD MAPPERS
# ============================================================================

def map_league(sf_league: str | None) -> str | None:
    """Map SF League__c → Twenty league."""
    if not sf_league:
        return None
    mapping = {
        "NFL": "NFL",
        "NBA": "NBA",
        "MLB": "MLB",
        "MLS": "MLS",
        "NHL": "NHL",
        "NCAA": "NCAA",
        "Non-Sports": "INDEPENDENT",
        "PGA Tour": "INDEPENDENT",
        "Minor League Baseball": "INDEPENDENT",
        "Minor League Hockey": "INDEPENDENT",
        "Motor Racing/Nascar": "INDEPENDENT",
        "Multi-Sport Ownership Group": "INDEPENDENT",
        "WNBA": "NBA",  # Closest match
        "USL": "MLS",
        "NWSL": "MLS",
        "Other": "INDEPENDENT",
    }
    return mapping.get(sf_league, "INDEPENDENT")


def map_venue_type(sf_segment: str | None, sf_vertical: str | None) -> str | None:
    """Map SF Segment_s__c / Vertical__c → Twenty venueType."""
    val = sf_segment or sf_vertical or ""
    val_lower = val.lower()
    if "collegiate" in val_lower or "university" in val_lower:
        return "UNIVERSITY"
    if "stadium" in val_lower:
        return "STADIUM"
    if "arena" in val_lower:
        return "ARENA"
    if "convention" in val_lower or "conference" in val_lower:
        return "CONVENTION_CENTER"
    if "retail" in val_lower or "shopping" in val_lower:
        return "RETAIL"
    if "transit" in val_lower or "mass transit" in val_lower:
        return "TRANSIT"
    if "corporate" in val_lower:
        return "CORPORATE"
    if "casino" in val_lower:
        return "CORPORATE"
    if "church" in val_lower:
        return "CORPORATE"
    return None


def map_region(sf_state: str | None) -> str | None:
    """Map billing state → Twenty region."""
    if not sf_state:
        return None
    northeast = ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island",
                 "Vermont", "New Jersey", "New York", "Pennsylvania", "CT", "ME", "MA",
                 "NH", "RI", "VT", "NJ", "NY", "PA", "Maryland", "MD", "Delaware", "DE",
                 "District of Columbia", "DC"]
    southeast = ["Alabama", "Florida", "Georgia", "Kentucky", "Mississippi",
                 "North Carolina", "South Carolina", "Tennessee", "Virginia",
                 "West Virginia", "AL", "FL", "GA", "KY", "MS", "NC", "SC", "TN", "VA", "WV",
                 "Louisiana", "LA", "Arkansas", "AR"]
    midwest = ["Illinois", "Indiana", "Iowa", "Kansas", "Michigan", "Minnesota",
               "Missouri", "Nebraska", "North Dakota", "Ohio", "South Dakota",
               "Wisconsin", "IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"]
    southwest = ["Arizona", "New Mexico", "Oklahoma", "Texas", "AZ", "NM", "OK", "TX"]
    west = ["Alaska", "California", "Colorado", "Hawaii", "Idaho", "Montana",
            "Nevada", "Oregon", "Utah", "Washington", "Wyoming",
            "AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"]

    s = sf_state.strip()
    if s in northeast:
        return "NORTHEAST"
    if s in southeast:
        return "SOUTHEAST"
    if s in midwest:
        return "MIDWEST"
    if s in southwest:
        return "SOUTHWEST"
    if s in west:
        return "WEST"
    return "INTERNATIONAL" if s else None


def map_service_status(sf_status: str | None) -> str | None:
    """Map SF Account_Status__c → Twenty serviceStatus."""
    if not sf_status:
        return "PROSPECT"
    s = sf_status.lower()
    if "active" in s or "install" in s:
        return "ACTIVE_INSTALL"
    if "warranty" in s:
        return "UNDER_WARRANTY"
    if "post" in s:
        return "POST_WARRANTY"
    if "recurring" in s or "service" in s:
        return "RECURRING"
    if "churn" in s or "lost" in s:
        return "CHURNED"
    return "PROSPECT"


def map_revenue_type(sf_classification: str | None) -> str | None:
    """Map SF Classification_s__c → Twenty revenueType."""
    if not sf_classification:
        return None
    c = sf_classification.lower()
    has_tech = "technology" in c or "software" in c
    has_svc = "services" in c
    has_ad = "advertising" in c

    if has_tech and (has_svc or has_ad):
        return "HYBRID"
    if has_tech:
        return "TECHNOLOGY"
    if has_svc:
        return "VENUE_SERVICES"
    if has_ad:
        return "MEDIA_SPONSORSHIP"
    return None


def map_stage(sf_stage: str | None) -> str:
    """Map SF StageName → Twenty stage."""
    mapping = {
        "Prospecting": "NEW",
        "Evaluating": "SCREENING",
        "Negotiation": "PROPOSAL",
        "Verbal Commitment": "CUSTOMER",
        "Closed Won": "CUSTOMER",
        "Closed Lost": "CUSTOMER",
        "No Bid": "CUSTOMER",
        "On Hold": "SCREENING",
    }
    return mapping.get(sf_stage, "NEW")


def map_bid_status(sf_stage: str | None) -> str | None:
    """Map SF StageName → Twenty bidStatus."""
    mapping = {
        "Prospecting": "RFP_RECEIVED",
        "Evaluating": "SCOPING",
        "Negotiation": "BID_SUBMITTED",
        "Verbal Commitment": "SHORTLISTED",
        "Closed Won": "WON",
        "Closed Lost": "LOST",
        "No Bid": "NO_BID",
        "On Hold": "SCOPING",
    }
    return mapping.get(sf_stage)


def map_deal_size(sale_price) -> str | None:
    """Map SF Sale_Price__c → Twenty dealSize."""
    if sale_price is None:
        return None
    try:
        amt = float(sale_price)
    except (ValueError, TypeError):
        return None
    if amt < 100000:
        return "DEAL_UNDER100K"
    if amt < 500000:
        return "DEAL_100KTO500K"
    if amt < 2000000:
        return "DEAL_500KTO2M"
    return "DEAL_OVER2M"


def map_decision_role(sf_title: str | None, sf_authority: str | None) -> str | None:
    """Map SF Title + Decisioning_Marking_Authority__c → Twenty decisionRole."""
    t = (sf_title or "").lower()
    if "owner" in t or "president" in t or "ceo" in t or "coo" in t:
        return "ROLE_OWNER"
    if "athletic director" in t or "ad " in t:
        return "ROLE_AD"
    if "vp" in t or "vice president" in t:
        return "ROLE_VPOPS"
    if "facilities" in t or "maintenance" in t:
        return "ROLE_FACILITIES"
    if "av" in t or "video" in t or "technology" in t or "it " in t:
        return None  # No AV Director role in Twenty schema
    if "estimat" in t or "pricing" in t:
        return "ROLE_ESTIMATOR"
    return None


def amount_to_currency(val) -> dict | None:
    """Convert a number to Twenty currency format."""
    if val is None:
        return None
    try:
        micros = int(float(val) * 1000000)
        return {"amountMicros": micros, "currencyCode": "USD"}
    except (ValueError, TypeError):
        return None


# ============================================================================
# MIGRATION FUNCTIONS
# ============================================================================

def migrate_companies():
    """Migrate SF Accounts → Twenty Companies."""
    print("\n=== MIGRATING COMPANIES ===")

    with open(f"{SF_EXPORT_DIR}/accounts.json") as f:
        accounts = json.load(f)

    # Load existing Twenty companies to avoid duplicates
    existing = twenty_get_all("companies")
    existing_names = {c["name"].lower().strip() for c in existing}
    print(f"  Existing in Twenty: {len(existing)}")
    print(f"  SF accounts to process: {len(accounts)}")

    # Load existing map if available
    if os.path.exists(COMPANY_MAP_FILE):
        with open(COMPANY_MAP_FILE) as f:
            COMPANY_MAP.update(json.load(f))
        print(f"  Loaded {len(COMPANY_MAP)} existing ID mappings")

    created = 0
    skipped = 0
    errors = 0

    for i, acct in enumerate(accounts):
        name = (acct.get("Name") or "").strip()
        if not name:
            skipped += 1
            continue

        # Skip if already in Twenty
        if name.lower() in existing_names:
            # Try to find the existing ID for mapping
            for ex in existing:
                if ex["name"].lower().strip() == name.lower():
                    COMPANY_MAP[acct["Id"]] = ex["id"]
                    break
            skipped += 1
            continue

        # Build Twenty company payload
        payload = {"name": name}

        # Domain
        website = acct.get("Website")
        if website:
            if not website.startswith("http"):
                website = f"https://{website}"
            payload["domainName"] = {
                "primaryLinkUrl": website,
                "primaryLinkLabel": "",
                "secondaryLinks": [],
            }

        # Address
        street = acct.get("BillingStreet")
        city = acct.get("BillingCity")
        state = acct.get("BillingState")
        zipcode = acct.get("BillingPostalCode")
        country = acct.get("BillingCountry")
        if city or state:
            payload["address"] = {
                "addressStreet1": street or "",
                "addressCity": city or "",
                "addressState": state or "",
                "addressPostcode": zipcode or "",
                "addressCountry": country or "US",
            }

        # Phone → no direct field, skip (Twenty companies don't have phone)

        # Employees
        if acct.get("NumberOfEmployees"):
            payload["employees"] = acct["NumberOfEmployees"]

        # Custom field mappings
        league = map_league(acct.get("League__c"))
        if league:
            payload["league"] = league

        vtype = map_venue_type(acct.get("Segment_s__c"), acct.get("Vertical__c"))
        if vtype:
            payload["venueType"] = vtype

        region = map_region(acct.get("BillingState"))
        if not region:
            # Fallback to SF Region__c
            sf_region = acct.get("Region__c")
            if sf_region:
                sf_region_map = {
                    "East": "NORTHEAST",
                    "West": "WEST",
                    "South": "SOUTHEAST",
                    "Midwest": "MIDWEST",
                    "International": "INTERNATIONAL",
                }
                region = sf_region_map.get(sf_region)
        if region:
            payload["region"] = region

        status = map_service_status(acct.get("Account_Status__c"))
        if status:
            payload["serviceStatus"] = status

        rev_type = map_revenue_type(acct.get("Classification_s__c"))
        if rev_type:
            payload["revenueType"] = rev_type

        # Partner type — all SF accounts are clients
        payload["partnerType"] = "CLIENT"

        result = twenty_post("companies", payload)
        if result:
            # Extract created ID
            data = result.get("data", {})
            created_record = data.get("createCompany") or data.get("company") or data
            twenty_id = created_record.get("id", "")
            COMPANY_MAP[acct["Id"]] = twenty_id
            existing_names.add(name.lower())
            created += 1
        else:
            errors += 1

        # Progress
        if (i + 1) % 100 == 0:
            print(f"  Progress: {i+1}/{len(accounts)} (created: {created}, skipped: {skipped})")
            # Save map periodically
            with open(COMPANY_MAP_FILE, "w") as f:
                json.dump(COMPANY_MAP, f)

        # Rate limiting — Twenty allows 100 req/60s = ~1.6/s
        time.sleep(0.7)

    # Final save of mapping
    with open(COMPANY_MAP_FILE, "w") as f:
        json.dump(COMPANY_MAP, f)

    print(f"\n  DONE: {created} created, {skipped} skipped, {errors} errors")
    print(f"  ID mappings saved: {len(COMPANY_MAP)}")
    return created


def migrate_people():
    """Migrate SF Contacts → Twenty People."""
    print("\n=== MIGRATING PEOPLE ===")

    with open(f"{SF_EXPORT_DIR}/contacts.json") as f:
        contacts = json.load(f)

    # Load company map
    if os.path.exists(COMPANY_MAP_FILE):
        with open(COMPANY_MAP_FILE) as f:
            COMPANY_MAP.update(json.load(f))

    # Load existing people
    existing = twenty_get_all("people")
    existing_emails = set()
    for p in existing:
        email = (p.get("emails") or {}).get("primaryEmail", "")
        if email:
            existing_emails.add(email.lower())

    print(f"  Existing in Twenty: {len(existing)}")
    print(f"  SF contacts to process: {len(contacts)}")
    print(f"  Company mappings available: {len(COMPANY_MAP)}")

    created = 0
    skipped = 0
    errors = 0
    no_company = 0

    for i, contact in enumerate(contacts):
        first = (contact.get("FirstName") or "").strip()
        last = (contact.get("LastName") or "").strip()
        email = (contact.get("Email") or "").strip()

        if not last:
            skipped += 1
            continue

        # Skip if email already exists
        if email and email.lower() in existing_emails:
            skipped += 1
            continue

        # Build payload
        payload = {
            "name": {"firstName": first, "lastName": last},
        }

        if email:
            payload["emails"] = {"primaryEmail": email}

        phone = contact.get("Phone") or contact.get("MobilePhone")
        if phone:
            # Clean phone to E.164 format: +1XXXXXXXXXX
            import re
            digits = re.sub(r"[^\d]", "", str(phone))
            # Only US/CA numbers (10 digits → prepend 1)
            if len(digits) == 10:
                digits = "1" + digits
            # Must be exactly 11 digits for US numbers
            if len(digits) == 11 and digits.startswith("1"):
                payload["phones"] = {"primaryPhoneNumber": f"+{digits}"}

        title = contact.get("Title")
        if title:
            payload["jobTitle"] = title

        city = contact.get("MailingCity")
        if city:
            payload["city"] = city

        # Link to company
        sf_account_id = contact.get("AccountId")
        if sf_account_id and sf_account_id in COMPANY_MAP:
            payload["companyId"] = COMPANY_MAP[sf_account_id]
        else:
            no_company += 1

        # Decision role
        role = map_decision_role(title, contact.get("Decisioning_Marking_Authority__c"))
        if role:
            payload["decisionRole"] = role

        # LinkedIn
        linkedin = contact.get("Linkedin_URL__c")
        if linkedin:
            payload["linkedinLink"] = {
                "primaryLinkUrl": linkedin,
                "primaryLinkLabel": "",
                "secondaryLinks": [],
            }

        result = twenty_post("people", payload)
        if result:
            if email:
                existing_emails.add(email.lower())
            created += 1
        else:
            errors += 1

        # Progress
        if (i + 1) % 500 == 0:
            print(f"  Progress: {i+1}/{len(contacts)} (created: {created}, skipped: {skipped}, no-company: {no_company})")

        # Rate limiting — Twenty allows 100 req/60s
        time.sleep(0.7)

    print(f"\n  DONE: {created} created, {skipped} skipped, {errors} errors, {no_company} without company link")
    return created


def migrate_opportunities():
    """Migrate SF Opportunities → Twenty Opportunities."""
    print("\n=== MIGRATING OPPORTUNITIES ===")

    with open(f"{SF_EXPORT_DIR}/opportunities.json") as f:
        opps = json.load(f)

    # Load company map
    if os.path.exists(COMPANY_MAP_FILE):
        with open(COMPANY_MAP_FILE) as f:
            COMPANY_MAP.update(json.load(f))

    # Load existing
    existing = twenty_get_all("opportunities")
    existing_names = {o["name"].lower().strip() for o in existing}

    print(f"  Existing in Twenty: {len(existing)}")
    print(f"  SF opportunities to process: {len(opps)}")
    print(f"  Company mappings available: {len(COMPANY_MAP)}")

    created = 0
    skipped = 0
    errors = 0
    no_company = 0

    for i, opp in enumerate(opps):
        name = (opp.get("Name") or "").strip()
        if not name:
            skipped += 1
            continue

        # Skip if already exists
        if name.lower() in existing_names:
            skipped += 1
            continue

        # Build payload
        payload = {"name": name}

        # Stage mapping
        sf_stage = opp.get("StageName")
        payload["stage"] = map_stage(sf_stage)

        bid_status = map_bid_status(sf_stage)
        if bid_status:
            payload["bidStatus"] = bid_status

        # Close date
        close_date = opp.get("CloseDate")
        if close_date:
            payload["closeDate"] = close_date

        # Amount from Sale_Price__c
        sale_price = opp.get("Sale_Price__c")
        amount = amount_to_currency(sale_price)
        if amount:
            payload["amount"] = amount

        # Deal size
        deal_size = map_deal_size(sale_price)
        if deal_size:
            payload["dealSize"] = deal_size

        # Link to company
        sf_account_id = opp.get("AccountId")
        if sf_account_id and sf_account_id in COMPANY_MAP:
            payload["companyId"] = COMPANY_MAP[sf_account_id]
        else:
            no_company += 1

        result = twenty_post("opportunities", payload)
        if result:
            existing_names.add(name.lower())
            created += 1
        else:
            errors += 1

        # Progress
        if (i + 1) % 200 == 0:
            print(f"  Progress: {i+1}/{len(opps)} (created: {created}, skipped: {skipped})")

        # Rate limiting — Twenty allows 100 req/60s
        time.sleep(0.7)

    print(f"\n  DONE: {created} created, {skipped} skipped, {errors} errors, {no_company} without company link")
    return created


# ============================================================================
# MAIN
# ============================================================================

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "all"

    if DRY_RUN:
        print("*** DRY RUN — no records will be created ***\n")

    print(f"Salesforce → Twenty CRM Migration")
    print(f"Source: {SF_EXPORT_DIR}/")
    print(f"Target: {TWENTY_URL}")

    totals = {}

    if cmd in ("companies", "all"):
        totals["companies"] = migrate_companies()

    if cmd in ("people", "all"):
        totals["people"] = migrate_people()

    if cmd in ("opportunities", "all"):
        totals["opportunities"] = migrate_opportunities()

    print("\n=== MIGRATION SUMMARY ===")
    for obj, count in totals.items():
        print(f"  {obj}: {count:,} created")
    print(f"\nTotal: {sum(totals.values()):,} records migrated")


if __name__ == "__main__":
    main()
