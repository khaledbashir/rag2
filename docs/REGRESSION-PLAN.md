# Why Proposals Keep Breaking — And How We Fix It

A simple read-through. No tables. Just the story.

## The problem in one paragraph

Over the last six months, half of all the work on this codebase was fixing things that broke when something else was changed. Once every 11 days, a change was bad enough to roll back completely. Five files cause most of the damage — they're shared between the RFP tool, the Estimator, and the Excel export, so any change to one ripples to all three. Natalia is right: we change X, Y breaks. The data confirms it. There's almost no automated check today that catches this before she sees it.

## Why it happens

One file builds the spreadsheet for the RFP preview, the Estimator preview, AND the Excel export. It's been edited 99 times in six months. Every edit affects three different features at once.

The Excel parser hands data to the rest of the app without checking it. If a column shifts in the input file, the system silently produces a wrong PDF instead of stopping.

There are roughly 9 test files in a codebase of 693 files. The pricing parser is well-tested. Almost nothing else is. The two RFP tests that DO exist are switched off in the test runner.

That's it. Three structural reasons. The breakage isn't bad luck — it's the predictable result of a codebase with no safety net.

## The fix — six weeks, six steps

Each step is independent. Safety improves a little more every week. None of these steps touch the working code. They add a layer around it that catches problems before they ship.

**Week 1 — Automated checks on every change.**
Right now only the pricing tool runs a check before code goes live. We turn that on for everything else. Cheapest, fastest win. About 10% reduction in breakage.

**Weeks 2-3 — Visual checks on what stakeholders actually see.**
Take a snapshot of every PDF, Mirror Mode preview, and spreadsheet output today. Any future change that shifts a number, a font, a logo, or a layout gets blocked automatically. This is the biggest single win. About 30% reduction.

**Week 4 — Strict checks on Excel imports.**
If a column gets renamed or shifts position in an input file, the system stops it at the door instead of silently producing a wrong PDF. About 15% reduction.

**Weeks 5-6 — End-to-end tests for Natalia's daily flows.**
Three flows: Excel import to export, RFP to Estimator, proposal to PDF. Scripted once, then they run automatically every time someone changes anything. If they fail, the change doesn't ship. About 20% reduction.

**Small cleanup along the way.**
Block edits to shared files unless explicitly flagged. Delete four dead feature flags that aren't used. Half a day each.

**Combined effect: roughly 80% drop in the "I changed X and Y broke" pattern.** The bugs aren't gone — they get caught in our system before they get to her.

## What is NOT in this plan

We don't touch the RFP Analyzer code. We don't refactor the Estimator. We don't change anything Natalia uses today. Every step is additive — a new test file, a new check, a new guard rail. If we shipped nothing else, the existing app would stay exactly how it is.

The big refactor of the state hub (the file with 84 fixes) is parked for after the safety net is in place. Refactoring without tests first is how you create the next wave of breakage. Order matters.

## What to tell Natalia when ready

A short version, ready to send:

Hi Natalia,

You're right that changes keep breaking unrelated things. I went through six months of history and confirmed it — every 11 days something breaks badly enough to roll back, and most regressions cluster around a handful of files that the RFP, Estimator, and Excel export all share.

Here's what I'm putting in place over the next 4-6 weeks. Each piece is independent — the safety improves incrementally, you don't have to wait for everything.

Week 1: Automated checks on every change before it goes live.

Weeks 2-3: Visual checks on Mirror Mode, PDF outputs, and the spreadsheet preview. If a change shifts a number, a font, a logo, or a layout, the system catches it and blocks the change before it reaches you.

Week 4: Strict checks on the data flowing from Excel imports — so a misnamed column or a shifted row stops at the door instead of silently corrupting the export.

Weeks 5-6: End-to-end checks on the three flows you use daily.

Expected result: roughly an 80% drop in the "I changed X and Y broke" surprises you've been seeing. I'll keep you posted at the end of each week with what landed.

Ahmad

## Decision needed from you

Just one — yes or no on starting Week 1 (the automated checks). It's purely additive, takes half a day, and lowers risk for everything that comes after. Nothing breaks, nothing changes for users.

If yes, I start with Week 1 immediately when you're back. If you want a different order or want to skip something, tell me which.
