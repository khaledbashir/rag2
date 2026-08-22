---
name: anc-list-builder
description: Build deduplicated ANC target-account and decision-maker lists from live CRM data plus public research. Use for prospect lists, market coverage, named-account discovery, new verticals, contact gaps, or Apollo-style enrichment requests.
---

# ANC List Builder

Build a reviewable target list for ANC's Technology, Venue Services, or Media & Sponsorship teams. The CRM is the master list; external sources add candidates and evidence.

## Intake

Infer what is already clear from the request or current CRM view. Ask only for a missing choice that would materially change the list:

- business unit or offer;
- geography/league/venue segment;
- target role or buying committee;
- requested count;
- must-have or exclusion criteria.

Do not ask for ANC's general company profile. It is already known.

## Build stages

1. Search existing Companies, People, and open Opportunities before external discovery.
2. Find candidate organizations from public, attributable sources. Record source URL and observation date.
3. Apply the ANC fit filter:
   - clear venue, live-event, media, display, sponsorship, service, or operational relevance;
   - plausible need for one of ANC's three business units;
   - a real timing signal or defensible strategic angle;
   - no obvious conflict, duplicate, or disqualifier.
4. Resolve the buying committee. Prefer role families over a single guessed title:
   - economic buyer;
   - technical/operations owner;
   - procurement or project lead;
   - marketing/partnership owner when relevant.
5. Never invent a person, title, email, phone number, or verification status. Mark unknown values as unknown.
6. Deduplicate against CRM by domain, normalized organization name, and verified relationship signals. Surface ambiguous matches for review.
7. Rank the list `Strong`, `Fair`, or `Longshot` with a short, evidence-backed reason. Do not pad a thin list by relaxing the segment silently.

## External enrichment and credits

Discovery and CRM analysis are read-only. If a connected enrichment provider would spend credits or reveal paid data:

1. Show a free preview with candidate count and estimated credit impact.
2. Ask for explicit approval for that exact spend.
3. Run the approved action once.
4. Report actual credits/results and stop.

If no provider is connected, return the qualified CRM/public-research list and clearly label contact fields that still need enrichment. Do not pretend enrichment happened.

## Deliverable

Return a compact review table with:

- Company
- Domain
- Segment / league / geography
- ANC business unit
- Fit rating
- Why now
- Recommended role/person
- Email status
- Existing CRM match
- Source
- Recommended first move

Create Companies, People, Opportunities, views, or tasks only after the user approves the reviewed rows. On approved import, preserve source/provenance and read the created records back.
