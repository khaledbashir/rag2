# CRM Automation Living Doc

This is the running client-friendly doc for how the ANC CRM and Proposal Engine work together.

Goal:
- keep `rag2` working exactly as it does now
- make the CRM feel more connected through automation
- track what already exists, what is live, and what we want to add next

This is meant to be updated over time as we agree on more automations.

---

## Core Rule

These automations should update the CRM without changing the working Proposal Engine flow.

Simple version:
- users keep doing the work in the Proposal Engine
- the CRM gets updated automatically when important milestones happen

---

## What Users Can Do Now

From a non-technical user perspective, nothing gets harder and the Proposal Engine workflow does not change.

What changes is that the CRM can automatically receive milestone updates when key things happen in the Proposal Engine.

Users can now benefit from the CRM being updated when:
- an RFP is analyzed
- a proposal workspace is created from that RFP
- a client submits a change request
- a proposal is marked signed
- a proposal is marked closed
- important exported files are available through CRM notes with direct links
- centralized Proposal Engine activity can be collected into a CRM activity object feed

That means sales and leadership do not need to manually type as many updates into CRM to keep a deal current.

---

## Live CRM Note Triggers

These are the milestone triggers we agreed should write notes back into the CRM.

### 1. RFP Analyzed

Trigger:
- when an RFP finishes analysis in the Proposal Engine

What CRM should show:
- RFP analysis complete
- project name
- file name
- number of screens found
- estimated LED square footage when available

Why this matters:
- the sales side can see that the project moved forward without opening the Proposal Engine

### 2. Proposal Workspace Created

Trigger:
- when a proposal workspace/project is created from an analyzed RFP

What CRM should show:
- proposal workspace created
- client or project name
- screen count
- link to the Proposal Engine workspace

Why this matters:
- CRM users can tell the job moved from intake into active proposal work

### 3. Client Change Request Submitted

Trigger:
- when a client asks for revisions through the share link

What CRM should show:
- client requested changes
- requester name
- requester email if available
- summary of the request when available

Why this matters:
- sales can see that the client responded and needs follow-up

### 4. Proposal Signed

Trigger:
- when a proposal is marked signed

What CRM should show:
- proposal signed
- client name
- venue if available
- link back to the Proposal Engine workspace

Why this matters:
- the CRM shows deal progress automatically at a major milestone

### 5. Proposal Closed

Trigger:
- when a proposal is marked closed

What CRM should show:
- proposal closed
- client name
- venue if available
- link back to the Proposal Engine workspace

Why this matters:
- the CRM reflects the final state of the deal without manual re-entry

---

## Planned Next CRM Automations

These are the next automation ideas we want to keep in this document as we go.

### A. Auto-Attach Proposal Files to CRM

Goal:
- when the Proposal Engine creates important files, the CRM deal should have them automatically

Files we want:
- proposal PDF
- scoping workbook
- estimate workbook
- signed PDF

Why this matters:
- the CRM starts feeling like the complete deal record

Status:
- in progress

Current implementation direction:
- CRM notes receive direct links to the latest exported files
- this keeps the CRM useful immediately without changing the Proposal Engine workflow
- true native binary attachment upload into Twenty can be added after the upload contract is finalized

### B. Auto-Create CRM Follow-Up Tasks

Examples:
- after proposal is sent, create a follow-up task
- after client revision request, create a revision/follow-up task
- after signed, create the next internal handoff task

Why this matters:
- CRM becomes more operational, not just informational

Status:
- planned

### C. Auto-Update CRM Deal Stage

Examples:
- proposal ready
- proposal sent
- signed
- closed

Why this matters:
- deal stages stay cleaner without manual updating

Status:
- planned

### D. Auto-Post Summary Notes

Examples:
- daily summary
- revision summary
- “what changed since last version”

Why this matters:
- CRM notes stay readable and useful instead of becoming noisy

Status:
- planned

### E. Centralized CRM Activity Feed

Goal:
- create one place inside CRM where Proposal Engine activity can be seen in one feed

What this gives:
- a centralized CRM object called `Proposal Engine Activity`
- one place to see milestone activity instead of only opening deal records one by one
- records that can be filtered by user, date, proposal, opportunity, and event type

Important limitation:
- this is still not a perfect universal “everything every user did across the whole CRM” screen
- it is a centralized Proposal Engine activity feed inside CRM

Status:
- in progress

---

## What We Are Not Doing

To protect what is already working, we are not trying to:
- rebuild the Proposal Engine inside CRM
- change the estimator math
- change workbook generation
- change the existing RFP workflow
- make CRM the owner of proposal logic

The Proposal Engine remains the working engine.
CRM gets automation around it.

---

## Important CRM Limitation

ANC does not currently have a single centralized user activity dashboard inside the CRM that shows everything one user has done across all objects in one place.

Today, activity is typically viewed:
- on each individual record timeline
- by object type, using filtered views such as tasks, tickets, notes, or deals assigned to a specific user

Why this matters:
- CRM automation can still keep records updated
- CRM can still feel more useful and more connected
- but there is not yet one universal “show me everything this person did everywhere” view

Client-friendly explanation:

“The CRM can automatically update the relevant deal, task, or record when work happens in the Proposal Engine. However, the CRM does not currently have one master user activity dashboard that rolls every action from every object into a single per-user feed.”

---

## Simple Client Explanation

Here is the easiest way to explain this to a client:

“Your team keeps working in the Proposal Engine the same way they do now. We are not disrupting that workflow. What we are adding is automation so the CRM stays up to date automatically when important proposal milestones happen. That means less manual updating, better visibility for sales and leadership, and a more unified deal record.”

---

## Current Status

### Confirmed Direction
- CRM-only automation
- do not disturb working Proposal Engine flows
- focus on milestone-based updates first

### First Automation Set
- write milestone notes back into CRM

### Second Automation Set
- add direct file links into CRM notes for exported proposal artifacts

### Third Automation Set
- feed Proposal Engine events into a centralized CRM activity object and CRM activity dashboard

### Trigger Set Agreed So Far
- RFP analyzed
- proposal workspace created
- client change request submitted
- proposal signed
- proposal closed
- proposal PDF exported
- scoping workbook exported
- audit workbook exported

---

## Update Log

### 2026-04-13
- Created this living doc
- Documented the first agreed CRM note triggers
- Documented the next automation ideas to track as we go
- Added the file-link automation direction so CRM notes can point to the latest exported artifacts
- Added the current CRM limitation around user activity visibility
- Added the centralized CRM dashboard direction for Proposal Engine activity
