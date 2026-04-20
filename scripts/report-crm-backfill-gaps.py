#!/usr/bin/env python3
"""
Generate CRM backfill gap reports from the Salesforce export and saved company map.

Outputs are written to /tmp/crm-backfill-gaps by default so they stay out of git.
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


EXPORT_DIR = Path("docs/salesforce-export")
DEFAULT_OUTPUT_DIR = Path("/tmp/crm-backfill-gaps")


def load_json(path: Path):
    with path.open() as f:
        return json.load(f)


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2))


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def account_name_from_record(record: dict) -> str:
    account = record.get("Account")
    if isinstance(account, dict):
        return account.get("Name") or ""
    return ""


def main() -> None:
    output_dir = DEFAULT_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    accounts = load_json(EXPORT_DIR / "accounts.json")
    contacts = load_json(EXPORT_DIR / "contacts.json")
    opportunities = load_json(EXPORT_DIR / "opportunities.json")
    company_map = load_json(EXPORT_DIR / "company_id_map.json")

    mapped_account_ids = set(company_map.keys())

    missing_accounts = []
    for account in accounts:
        account_id = account.get("Id")
        if account_id in mapped_account_ids:
            continue
        missing_accounts.append(
            {
                "sfAccountId": account_id,
                "accountName": account.get("Name") or "",
                "website": account.get("Website") or "",
                "billingCity": account.get("BillingCity") or "",
                "billingState": account.get("BillingState") or "",
                "billingCountry": account.get("BillingCountry") or "",
                "league": account.get("League__c") or "",
                "segment": account.get("Segment_s__c") or "",
                "vertical": account.get("Vertical__c") or "",
                "accountStatus": account.get("Account_Status__c") or "",
                "classification": account.get("Classification_s__c") or "",
            }
        )

    missing_account_lookup = {row["sfAccountId"]: row for row in missing_accounts}

    contact_rows = []
    contacts_by_account = Counter()
    for contact in contacts:
        account_id = contact.get("AccountId")
        if not account_id or account_id in mapped_account_ids:
            continue
        contacts_by_account[account_id] += 1
        contact_rows.append(
            {
                "sfContactId": contact.get("Id") or "",
                "accountId": account_id,
                "accountName": account_name_from_record(contact),
                "firstName": contact.get("FirstName") or "",
                "lastName": contact.get("LastName") or "",
                "email": contact.get("Email") or "",
                "title": contact.get("Title") or "",
                "phone": contact.get("Phone") or "",
                "mobilePhone": contact.get("MobilePhone") or "",
                "mailingCity": contact.get("MailingCity") or "",
                "mailingState": contact.get("MailingState") or "",
            }
        )

    opportunity_rows = []
    opportunities_by_account = Counter()
    stage_counter_by_account: dict[str, Counter] = defaultdict(Counter)
    for opportunity in opportunities:
        account_id = opportunity.get("AccountId")
        if not account_id or account_id in mapped_account_ids:
            continue
        opportunities_by_account[account_id] += 1
        stage = opportunity.get("StageName") or ""
        stage_counter_by_account[account_id][stage] += 1
        opportunity_rows.append(
            {
                "sfOpportunityId": opportunity.get("Id") or "",
                "accountId": account_id,
                "accountName": account_name_from_record(opportunity),
                "opportunityName": opportunity.get("Name") or "",
                "stageName": stage,
                "closeDate": opportunity.get("CloseDate") or "",
                "salePrice": opportunity.get("Sale_Price__c") or "",
                "recordType": opportunity.get("RecordType", {}).get("Name", "")
                if isinstance(opportunity.get("RecordType"), dict)
                else "",
                "ownerName": opportunity.get("Owner", {}).get("Name", "")
                if isinstance(opportunity.get("Owner"), dict)
                else "",
            }
        )

    account_summary_rows = []
    for account in missing_accounts:
        account_id = account["sfAccountId"]
        stage_counts = stage_counter_by_account.get(account_id, Counter())
        account_summary_rows.append(
            {
                "sfAccountId": account_id,
                "accountName": account["accountName"],
                "website": account["website"],
                "billingState": account["billingState"],
                "league": account["league"],
                "contactsAffected": contacts_by_account.get(account_id, 0),
                "opportunitiesAffected": opportunities_by_account.get(account_id, 0),
                "topOpportunityStages": ", ".join(
                    f"{stage}:{count}"
                    for stage, count in stage_counts.most_common(5)
                    if stage
                ),
            }
        )

    account_summary_rows.sort(
        key=lambda row: (row["opportunitiesAffected"], row["contactsAffected"], row["accountName"]),
        reverse=True,
    )
    contact_rows.sort(key=lambda row: (row["accountName"], row["lastName"], row["firstName"]))
    opportunity_rows.sort(key=lambda row: (row["accountName"], row["stageName"], row["opportunityName"]))

    summary = {
        "sourceCounts": {
            "accounts": len(accounts),
            "contacts": len(contacts),
            "opportunities": len(opportunities),
            "companyMapEntries": len(company_map),
        },
        "gapCounts": {
            "accountsMissingFromCompanyMap": len(missing_accounts),
            "contactsWithUnmappedAccount": len(contact_rows),
            "opportunitiesWithUnmappedAccount": len(opportunity_rows),
        },
        "topAccountsByOpportunityImpact": account_summary_rows[:10],
        "topAccountsByContactImpact": sorted(
            account_summary_rows,
            key=lambda row: (row["contactsAffected"], row["opportunitiesAffected"], row["accountName"]),
            reverse=True,
        )[:10],
    }

    write_json(output_dir / "summary.json", summary)
    write_json(output_dir / "missing-company-map-accounts.json", missing_accounts)
    write_json(output_dir / "contacts-with-unmapped-account.json", contact_rows)
    write_json(output_dir / "opportunities-with-unmapped-account.json", opportunity_rows)
    write_json(output_dir / "account-impact-summary.json", account_summary_rows)

    write_csv(
        output_dir / "missing-company-map-accounts.csv",
        missing_accounts,
        [
            "sfAccountId",
            "accountName",
            "website",
            "billingCity",
            "billingState",
            "billingCountry",
            "league",
            "segment",
            "vertical",
            "accountStatus",
            "classification",
        ],
    )
    write_csv(
        output_dir / "contacts-with-unmapped-account.csv",
        contact_rows,
        [
            "sfContactId",
            "accountId",
            "accountName",
            "firstName",
            "lastName",
            "email",
            "title",
            "phone",
            "mobilePhone",
            "mailingCity",
            "mailingState",
        ],
    )
    write_csv(
        output_dir / "opportunities-with-unmapped-account.csv",
        opportunity_rows,
        [
            "sfOpportunityId",
            "accountId",
            "accountName",
            "opportunityName",
            "stageName",
            "closeDate",
            "salePrice",
            "recordType",
            "ownerName",
        ],
    )
    write_csv(
        output_dir / "account-impact-summary.csv",
        account_summary_rows,
        [
            "sfAccountId",
            "accountName",
            "website",
            "billingState",
            "league",
            "contactsAffected",
            "opportunitiesAffected",
            "topOpportunityStages",
        ],
    )

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
