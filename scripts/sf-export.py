#!/usr/bin/env python3
"""
Salesforce Full Data Export
Pulls all Accounts, Contacts, and Opportunities from ANC's Salesforce org.
Outputs to docs/salesforce-export/ as JSON files.
"""

import urllib.request
import urllib.parse
import json
import sys
import os

SF_TOKEN = os.environ.get("SF_TOKEN", "")
SF_URL = os.environ.get("SF_URL", "https://ancsports.my.salesforce.com")
API_VERSION = "v62.0"
OUTPUT_DIR = "docs/salesforce-export"


def sf_query(query: str) -> list:
    """Run a SOQL query and paginate through all results."""
    headers = {
        "Authorization": f"Bearer {SF_TOKEN}",
        "Content-Type": "application/json",
    }

    all_records = []
    encoded = urllib.parse.quote(query.strip())
    url = f"{SF_URL}/services/data/{API_VERSION}/query?q={encoded}"
    page = 1

    while True:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"  ERROR on page {page}: {e.code} - {body}", file=sys.stderr)
            if all_records:
                print(f"  Returning {len(all_records)} records collected so far", file=sys.stderr)
                return all_records
            raise

        records = data.get("records", [])
        # Strip Salesforce metadata
        for r in records:
            r.pop("attributes", None)
            for key, val in r.items():
                if isinstance(val, dict) and "attributes" in val:
                    val.pop("attributes")

        all_records.extend(records)
        total = data.get("totalSize", "?")
        print(f"  Page {page}: +{len(records)} = {len(all_records)}/{total}", file=sys.stderr)

        if data.get("done", True):
            break

        next_url = data.get("nextRecordsUrl", "")
        url = f"{SF_URL}{next_url}"
        page += 1

    return all_records


def pull_accounts():
    print("\n=== ACCOUNTS ===", file=sys.stderr)
    records = sf_query("""
        SELECT Id, Name, Industry, Phone, Website,
            BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
            ShippingStreet, ShippingCity, ShippingState,
            NumberOfEmployees, AnnualRevenue, Description, OwnerId,
            Region__c, League__c, Conference__c, Account_Status__c,
            Classification_s__c, Segment_s__c, Vertical__c,
            Booked_Revenue__c, Pipeline_Revenue__c, Project_Manager__c,
            Client_Services_Status_Update__c, Current_CMS__c,
            CreatedDate, LastModifiedDate
        FROM Account ORDER BY Name
    """)
    save("accounts.json", records)
    return len(records)


def pull_contacts():
    print("\n=== CONTACTS ===", file=sys.stderr)
    records = sf_query("""
        SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, Title,
            Department, MailingStreet, MailingCity, MailingState, MailingPostalCode,
            AccountId, Account.Name,
            League__c, Category__c, Contact_Status__c, Classification_s__c,
            Decisioning_Marking_Authority__c, Type__c, Linkedin_URL__c,
            OwnerId, CreatedDate, LastModifiedDate
        FROM Contact ORDER BY LastName
    """)
    save("contacts.json", records)
    return len(records)


def pull_opportunities():
    print("\n=== OPPORTUNITIES ===", file=sys.stderr)
    records = sf_query("""
        SELECT Id, Name, StageName, Probability, CloseDate,
            Description, AccountId, Account.Name, OwnerId, LeadSource,
            NextStep, ForecastCategory,
            Sale_Price__c, Estimated_Cost__c, Sales_Margin__c,
            Actual_Cost__c, Actual_Margin__c,
            Tier__c, Status_Update__c, Proposal_Stage__c, Budgetary_Quoted_RFP__c,
            Product_Manufacturer__c, Project_Manager_s__c,
            Service__c, Technology__c, Installation__c,
            Bid_Due_Date__c, Commercial_or_Sports__c,
            CreatedDate, LastModifiedDate
        FROM Opportunity ORDER BY CloseDate DESC
    """)
    save("opportunities.json", records)
    return len(records)


def pull_tasks():
    print("\n=== TASKS ===", file=sys.stderr)
    try:
        records = sf_query("""
            SELECT Id, Subject, Description, Status, Priority,
                ActivityDate, WhoId, WhatId, OwnerId, CreatedDate
            FROM Task ORDER BY CreatedDate DESC LIMIT 2000
        """)
        save("tasks.json", records)
        return len(records)
    except Exception as e:
        print(f"  Tasks pull failed: {e}", file=sys.stderr)
        return 0


def save(filename: str, records: list):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w") as f:
        json.dump(records, f, indent=2)
    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f"  -> Saved {len(records)} records to {path} ({size_mb:.1f} MB)", file=sys.stderr)


def main():
    if not SF_TOKEN:
        print("ERROR: SF_TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)

    print(f"Salesforce Export — {SF_URL}", file=sys.stderr)
    print(f"Output: {OUTPUT_DIR}/", file=sys.stderr)

    totals = {}
    totals["accounts"] = pull_accounts()
    totals["contacts"] = pull_contacts()
    totals["opportunities"] = pull_opportunities()
    totals["tasks"] = pull_tasks()

    print("\n=== SUMMARY ===", file=sys.stderr)
    for obj, count in totals.items():
        print(f"  {obj}: {count:,} records", file=sys.stderr)
    print(f"\nTotal: {sum(totals.values()):,} records exported", file=sys.stderr)


if __name__ == "__main__":
    main()
