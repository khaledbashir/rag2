# NFL Ticket Bank (CRM)

Jireh asked (2026-08-15) for a better home than the `ANC NFL Suites 2026-2027.xlsx`
sheet for the 2026/27 NFL ticket "bank". Built in the CRM so every suite night sits
next to the account it is meant to serve.

## What exists in the CRM

| Object | id | Purpose |
|---|---|---|
| `suiteGame` ("Suite Game") | `5ffe23ec-d71d-4495-be34-e17539bc0269` | one game night in the bank |
| `suitePackage` ("Suite") | `782a2437-6d35-41bc-9d3a-b2ea5d7ed02b` | the season suite package at a stadium |

Views (nav folder **Tickets & Suites**, position 24.5):

| View | id |
|---|---|
| NFL Ticket Bank 2026/27 (grouped by status) | `feb1aeca-8285-4a88-aec3-600bfa7fa240` |
| Tickets to Send | `ca930c92-f909-4ab6-8d6e-918c7c6c9f96` |
| Ticket Bank Board (kanban) | `ec2adc64-c0cb-4663-b7e7-f59f42ee5ac5` |
| Open & For Sale | `b9ff2245-6dad-4bfc-b05c-5a676ee4e33e` |
| All Suites | `89bb9feb-dd19-441a-a62f-c175c7131100` |

Pinned to Jireh (`c6de56e5-…`) and Kirsten Savage (`ec0add4d-…`, who owns the sheet today).
Company page layout gained a **Suite Tickets** tab (`32e1061d-…`, position 26.5) fed by the
`Company.suiteGames` reverse relation, so an account shows the suite nights booked for it.

## Status model

`bankStatus`: OPEN · HELD · ASSIGNED · TICKETS_SENT · FOR_SALE · SOLD.
Seeded from the sheet: blank -> OPEN, "Hold: X" -> HELD, a named guest -> ASSIGNED,
"Sell?" -> FOR_SALE. At seed time: 9 open, 5 held, 11 assigned, 8 for sale (33 games).

## Reproducing / extending

```
cd scripts/ticket-bank
python3 build-ticket-bank-schema.py   # idempotent: skips objects/fields that exist
python3 build-ticket-bank-views.py    # NOT idempotent - creates new views each run
python3 seed-ticket-bank.py           # NOT idempotent - re-running duplicates games
```

`seed-ticket-bank.py` reads `games.json` (a flattening of the source workbook, kept here
as `nfl-suites-2026-2027-games.json`). It resolves every team/guest by **exact** company
name and aborts on a missing or ambiguous match rather than guessing - renewal-style and
duplicate team accounts make fuzzy name matching actively dangerous (see the 2026-06-11
stale-won incident).

Guest contacts are linked only where the person already exists in the CRM with a matching
email (Jack Armstrong / Hankook, Matt Lemire / Nationals, Tom Bingham / LG). The four
outside recipients on the Iona Prep and Jets rows are held in `guestEmails` rather than
invented as Person records with a guessed employer.

## Platform repair this needed

Creating any custom object failed workspace-wide: the running image
(`anc/twenty-v2170-anc-attachment-text:20260811`, APP_VERSION v2.17.0) inserts into
`core."searchFieldMetadata"` without `tsVectorFieldMetadataId`, which the database has as
NOT NULL - the compiled server has zero references to that column, so the DB is ahead of
the image. `scripts/sql/searchfieldmetadata-tsvector-fill-trigger.sql` fills the column
from the object's own TS_VECTOR field when the application omits it. It is a no-op once an
image ships code that sets the value. The underlying image/DB version drift is still open.
