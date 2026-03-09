# ANC Proposal Engine — What It Does & How to Use It

**For:** Natalia, Matt, Jeremy, Eric, Alison & the ANC Team
**Updated:** February 2026
**Platform:** [https://proposals.anc.com](https://proposals.anc.com)

---

## At a Glance

The ANC Proposal Engine replaces the manual process of building LED display proposals. Instead of copying numbers from Excel to InDesign, guessing at costs in your head, or scrolling through 3,000-page RFPs looking for one table — the platform handles it.

Every feature below exists because someone on the team described a specific headache. This document maps each headache to the tool that fixes it.

---

## The Dashboard

**Where:** The first page you see after login.

Your command center. Every project lives here — proposals, estimates, contracts. At the top, you see your total pipeline value, project counts by mode (Mirror / Intelligence / Estimator), and how many are in each stage (Draft → Sent → Signed).

**What you can do:**
- **Search** — Type a client name or venue to filter instantly
- **Status tracking** — Click the status badge on any project to move it through stages (Draft → Approved → Signed → Closed)
- **Quick PDF export** — Hit the download icon on any project card to get a branded PDF without opening the project
- **Brief Me** — Click the sparkle icon on any project. The AI reads the project data, researches the client, and gives you a one-page intelligence brief: who the client is, what the deal looks like, and what to watch out for

---

## Three Ways to Build a Proposal

The platform gives you three distinct paths depending on where you're starting from.

### 1. Mirror Mode — "I already have the Excel"

**Who it's for:** Natalia, or anyone who receives a completed pricing Excel from an estimator.

**The problem it solves:** You used to spend hours manually typing numbers from Excel into InDesign to create PDFs. One typo in a multimillion-dollar deal could be catastrophic.

**How it works:**
1. Click **New Project** from the Dashboard
2. Upload the ANC pricing Excel
3. The system reads every cell value — line items, section headers, subtotals, grand total — and locks them in
4. It generates a branded PDF that matches the Excel exactly

**The key rule:** Mirror Mode does zero math. It trusts the Excel 100%. If the Excel says $1,247,893.00, the PDF says $1,247,893.00. No rounding, no recalculation, no data corruption. What goes in is what comes out.

**What about weird Excels?** About 10% of estimators send non-standard formats (merged cells, unusual columns, different sheet layouts). When the system encounters a format it hasn't seen before, it opens the **Mapping Wizard** — you click the header row, pick which columns are "Description," "Price," and "Quantity," name the profile (e.g., "Moody Center Format"), and save. Next time that format shows up, it imports automatically. Map once, remember forever.

---

### 2. Intelligence Mode — "I'm building from scratch"

**Who it's for:** Anyone creating a proposal without a pre-built Excel.

**The problem it solves:** When you start from zero, you need to enter client info, configure displays, set margins, and generate professional output — all without an existing spreadsheet.

**How it works:**
1. Click **New Project** → choose **Intelligence Mode**
2. Fill in: client name, venue, display specs (size, pitch, mount type)
3. The system calculates pricing based on your Rate Card
4. Adjust margins, tax, bond as needed
5. Export as a branded PDF

Everything updates in real time. Change a display from 20ft to 25ft and the pricing recalculates instantly.

---

### 3. LED Estimator — "I need a quick number"

**Who it's for:** Matt, or anyone who needs a fast cost estimate before a full proposal exists.

**The problem it solves:** Matt receives vague requests — "I need a screen for the Dodgers" — and has to make 50+ mental assumptions to build a price. The Estimator turns that into a guided conversation.

**How it works:**
1. Click **New Estimate** from the Dashboard (or **Estimator** in the sidebar)
2. Answer the questions one at a time: client, venue, location, indoor/outdoor, union labor, display specs
3. Watch the right panel: a live Excel-style preview updates after every answer
4. Browse the sheet tabs at the bottom: Project Info, Budget Summary, Display Details, Cost Categories, Labor Worksheet
5. Export the finished estimate as an Excel file

**ROM vs. Detailed:** Two levels of depth. ROM (Rough Order of Magnitude) gives you a quick number — great for "ballpark, how much?" conversations. Detailed mode unlocks the full 7-category cost breakdown (3A through 3G) with line-item detail for structural, labor, electrical, project management, engineering, and logistics.

---

## AI Quick Estimate — "Just Let Me Describe It"

**Where:** Inside the Estimator, on the very first question.

**The problem it solves:** Sometimes you don't want to click through 15 questions. You just want to say what the project is and have the system figure it out.

**How it works:**
1. Open the Estimator
2. On the first question, click the blue **"Describe your project"** button
3. Type a plain-English description. For example:

> *"Indiana Fever at Gainbridge Fieldhouse needs a new 20x12 main scoreboard at 4mm, two 100x3 ribbon boards at 6mm, and a 30x6 marquee at 10mm for the entrance. Indoor, new install, union labor required."*

4. Click **Fill Form with AI** (or press Ctrl+Enter)
5. The AI extracts every detail — client, venue, location, display types, dimensions, pixel pitches, indoor/outdoor, union, new/replacement — and fills the entire form
6. You land on the Financial questions with everything pre-populated. Go back to review and adjust anything the AI got wrong.

Works with minimal info too. Type *"New scoreboard for the Sacramento Kings"* and the AI fills reasonable defaults.

---

## The Three-Mode Toggle — Budget, Proposal, Contract

**Where:** Step 1 of any project, or via the document mode switcher.

**The problem it solves:** A deal moves through stages. Early on, it's a soft budget estimate — you don't want ANC legally bound to a number. Later, it becomes a formal sales quotation. Eventually, it's a full contract with payment terms, liability clauses, and signature blocks. Natalia used to manually edit headers, footers, and legal text for each stage.

**How it works — one switch, three formats:**

| Mode | Header | Numbers | Legal Sections |
|------|--------|---------|----------------|
| **Budget** | "Budget Estimate" | Rounded, soft language | No signatures, no payment terms |
| **Proposal** | "Sales Quotation" | Exact pricing | Optional payment terms |
| **LOI (Letter of Intent)** | Full legal header | Exact pricing | Payment terms, liability clauses, signature blocks, exhibits |

Switch between them anytime. The pricing data stays the same — only the presentation and legal wrapper changes.

---

## Estimator Toolbar — Seven Power Tools

Once you have a display configured in the Estimator, the toolbar across the top gives you seven specialized tools. Hover over any button for a description of what it does, when to use it, and the benefit.

### Smart Assembly Bundler

**The problem:** When Matt quotes a scoreboard, he has to remember 20+ "invisible" line items in his head — video processor, receiving cards, spare modules, mounting brackets, cable kits, power distribution. Miss one and you lose $5K-$30K on the deal.

**What it does:** Click **Bundle** and the system auto-suggests every accessory for each display based on its type. A scoreboard triggers: video processor ($12K), receiving cards, fiber converter, spare modules. A ribbon board triggers different items. A wall mount adds vertical steel and plywood backing.

**How to use it:** Toggle items on/off with checkboxes. Costs update in real time. Excluded items are remembered — the system won't keep suggesting things you've already decided to skip.

---

### Budget Reverse Engineer

**The problem:** A client says "I have exactly $500K." The team has to guess-and-check products to see what fits.

**What it does:** Click **Budget**, enter the target dollar amount, and the system searches the entire product catalog. It shows every LED product that fits within that budget for your display size, sorted by best fit, with headroom (how much budget is left) shown for each option.

**How to use it:** Enter your budget, review the ranked options, click one to select it. The display specs auto-update.

---

### Vendor RFQ Generator

**The problem:** To get accurate pricing from manufacturers, Matt has to type all the specs into an email and send it to LG, Yaham, or whoever. Double-entry work.

**What it does:** Click **RFQ**, pick one or more manufacturers, and the system generates a formatted Request for Quotation with all the specs, quantities, and a unique RFQ number (RFQ-2026-XXXX). Each manufacturer gets their own document.

**How to use it:** Select manufacturers → click Generate → download or copy the formatted RFQ. Ready to send.

---

### Contract Risk Scanner (Liability Hunter)

**The problem:** Critical financial risks — "Liquidated Damages: $2,500/day with no cap" or "100% Performance Bond" — are buried in the legal fine print of contracts and RFPs. Missing them kills margin.

**What it does:** Click **Risk**, paste contract text (or upload a PDF), and the system runs a 20-point liability checklist. It hunts specifically for financial keywords: liquidated damages, performance bonds, union requirements, prevailing wage, insurance, warranty terms, payment timelines, force majeure.

**What you see:** Each check shows pass (green), warning (amber), or critical (red). Missing clauses are flagged. The system even warns you if the document doesn't look like a contract (e.g., you accidentally pasted a technical spec sheet).

---

### Revision Radar (Delta Scanner)

**The problem:** A client issues "Addendum 4" changing a screen from 10mm to 6mm. Jeremy has to re-read the entire document to find what changed.

**What it does:** Click **Delta**, upload two Excel files (original and revised), and the system diffs them section by section. Changed rows are highlighted in amber. Price increases show in red, decreases in green. The grand total delta is displayed at the top.

**How to use it:** Upload Version 1 and Version 2 → see exactly what changed and by how much.

---

### Visual Cut-Sheet Automator

**The problem:** Creating a per-display spec sheet means pulling together dimensions, resolution, power draw, weight, and installation notes from scattered sources.

**What it does:** Click **Cuts** to see a formatted spec sheet for each display in the project. Dimensions, resolution, power consumption, weight, environmental ratings, and auto-generated installation notes based on whether it's indoor or outdoor, wall mount or center-hung.

---

### Metric Mirror (Imperial ↔ Metric)

**The problem:** Matt sells in feet and inches (US clients) but buys in millimeters (Asian manufacturers). He hates doing the conversion math — and LED cabinets can't be cut, so the actual size is never exactly what you asked for.

**What it does:** When you enter display dimensions and select a product, the system calculates exactly how many cabinets fit. You asked for 10ft wide, but cabinets are 500mm — so the actual build is 9.84ft (6 cabinets) or 11.48ft (7 cabinets). The Metric Mirror shows you the real dimension, the delta from your target, and color-codes it: green (close match), amber (noticeable difference), red (significant mismatch).

---

## The PDF — What Clients See

**The problem it solves:** Clients must never see internal margins, raw costs, or markup percentages. One slip-up reveals ANC's profit structure. At the same time, the PDF has to look exactly right — correct fonts, margins, the ANC blue slash graphics, Work Sans typeface.

**How it works:**
- The PDF generator strips all internal cost and margin data. Only the selling price column is printed.
- The ANC branding (blue slash design, Work Sans font, strict margins) is hard-coded into the template. It looks the same regardless of who creates the project or what data goes in.
- Every section is toggleable: intro text, pricing tables, specifications, payment terms, scope of work, signature block, notes, exhibits. Turn them on or off depending on what the client needs to see.

---

## Share Links — The "Ferrari" View

**Where:** Step 4 (Export) of any project.

**The problem it solves:** You need to send a client a clean, professional view of the proposal — not a PDF attachment that gets lost in email threads.

**How it works:**
1. Click **Share** on any completed project
2. The system generates a unique link and copies it to your clipboard
3. Send the link to the client — they can view the full proposal in their browser, no login required
4. The shared view is sanitized: no internal costs, no margins, no AI metadata. Just the professional presentation.

**Security:** Share links are version-locked. If you update the proposal and re-share, the old link still shows the old version. New link, new snapshot. Links expire after 30 days by default. Optional password protection is available.

---

## E-Signatures (DocuSign)

**Where:** Available on shared LOI documents.

**The problem it solves:** Getting contracts signed used to mean printing, scanning, emailing back and forth.

**How it works:** When a project is in LOI mode and shared, the client can sign electronically through DocuSign. The system tracks who signed, when, from what IP address, and stores a full audit trail with a Certificate of Completion.

---

## AI Copilot — Lux

The platform includes two AI assistants depending on where you are.

### Dashboard Copilot

**Where:** Bottom-right chat icon on the Dashboard.

**What it can do:**
- "What's the pipeline value?" → Shows your total dollar value across all active proposals
- "Which projects need attention?" → Flags stale drafts or proposals missing critical info
- "What LED products do we have for indoor 4mm?" → Searches the product catalog and returns real data
- "Start a new budget" → Creates a new project for you

### Estimator Copilot (Lux)

**Where:** The chat icon in the Estimator toolbar.

**What it can do:**
- "Add a 20x10 scoreboard at 4mm" → Adds a display to the estimate
- "Set LED margin to 38%" → Updates margins
- "Set bond rate to 1.5%" → Adjusts financial parameters
- "What's the total?" → Shows the current grand total with breakdown
- "Switch to proposal tier" → Changes margin preset (LED 38%, Services 20%)
- "Explain structural costs" → Walks you through how a specific cost category is calculated

Lux renders responses with full markdown formatting — tables, bold text, headers, code blocks. No overflow, no clipping.

---

## PDF Page Triage (PDF Filter)

**Where:** Sidebar → Tools → PDF Filter.

**The problem it solves:** Jeremy receives 3,000-page construction PDFs. He needs to find the 15 pages that matter — the LED specs, the AV drawings, the display schedule — and ignore the rest.

**How it works:**
1. Upload the RFP/construction PDF
2. The system scans every page for relevant keywords (LED, display, AV, scoreboard, ribbon board, etc.)
3. Text pages are scored and sorted: relevant pages float to the top, noise sinks to the bottom
4. Drawing pages are analyzed with AI vision to identify architectural and AV sheets
5. Drag pages between "Keep" and "Discard" piles
6. Export a filtered PDF with only the pages you need

**Also reads scanned documents.** If the PDF is image-only (no selectable text), the built-in OCR engine extracts the text so filtering still works. Supports PDF, DOCX, DOC, and 75+ other formats.

---

## Gap Fill Assistant

**Where:** Inside any Intelligence Mode project, in the RFP sidebar.

**The problem it solves:** After the AI extracts data from an uploaded RFP, some fields might be missing or uncertain. Instead of hunting through the form to find what's blank, the Gap Fill Assistant asks you directly.

**How it works:** It scans the proposal for missing critical fields (pixel pitch, dimensions, brightness) and low-confidence AI extractions. Then it walks you through one question at a time: *"I found the display 'Main Scoreboard', but I cannot find the Pixel Pitch. What is it?"* Answer, and the form updates. Skip if you don't know. A progress bar shows how close you are to complete.

---

## Admin Tools

### Product Catalog

**Where:** Sidebar → Admin → Product Catalog.

The database of every LED product ANC works with. Each product has: manufacturer, model number, pixel pitch, cabinet dimensions (mm), weight, power draw, brightness, indoor/outdoor rating, and cost per square foot.

**What you can do:** Browse, search, filter by manufacturer or pitch, add new products, edit existing ones, import from CSV.

The product catalog feeds into the Estimator (auto-matching products to specs), the Budget Reverse Engineer (finding products that fit a budget), and the Vendor RFQ Bot (pulling accurate specs for manufacturer quotes).

---

### Rate Card

**Where:** Sidebar → Admin → Rate Card.

The constants that drive every calculation in the Estimator. This is where you set:

- **LED hardware cost** per square foot by pitch (2.5mm, 4mm, 6mm, 10mm)
- **Steel fabrication** and **LED installation** labor rates
- **Project management** base fee
- **Default margins** (LED hardware, services)
- **Bond and insurance rates**
- **Per diem and travel rates**

Change a rate here and every new estimate uses the updated number. Historical estimates keep the rates they were created with.

---

## The Mapping Wizard (Frankenstein Normalizer)

**Where:** Triggered automatically when Mirror Mode encounters an unrecognized Excel format.

**The problem it solves:** 10% of pricing Excels that come in have non-standard layouts — different column orders, merged cells, unusual sheet names. The old system would just fail.

**How it works:**
1. The system detects the Excel doesn't match any known format
2. You see the raw sheet data and pick the correct sheet
3. Click the header row
4. Map columns: which one is "Description"? Which is "Unit Price"? Which is "Quantity"?
5. Name the profile (e.g., "Moody Center Format")
6. Save — the system stores this fingerprint

Next time anyone uploads an Excel with the same layout, it imports automatically. One person maps it once, everyone benefits forever.

---

## Security & Audit

**What clients never see:**
- Internal cost columns
- Margin percentages
- AI metadata or confidence scores
- Rate card values

**What finance can always see:**
- Full internal audit Excel with all formulas and margins visible
- AI verification status (which fields were AI-filled, which were human-verified)
- Share link audit trail (who generated it, when, which version)
- Signature audit trail (DocuSign Certificate of Completion)

**AI Guardrail:** If a proposal contains AI-extracted data that hasn't been verified by a human, the system blocks sharing. You cannot send an unverified proposal to a client.

---

## Quick Reference — Where to Find Everything

| What You Need | Where It Is |
|---------------|-------------|
| See all projects | Dashboard (home page) |
| Create a proposal from Excel | Dashboard → New Project → Upload Excel |
| Create a proposal from scratch | Dashboard → New Project → Intelligence Mode |
| Create a quick estimate | Dashboard → New Estimate, or Sidebar → Estimator |
| Describe a project to AI | Estimator → first question → "Describe your project" |
| Smart Bundler, Budget Reverse, RFQ, Risk, Delta, Cuts | Estimator toolbar (colored buttons) |
| Filter a large PDF/RFP | Sidebar → Tools → PDF Filter |
| Manage LED products | Sidebar → Admin → Product Catalog |
| Manage pricing rates | Sidebar → Admin → Rate Card |
| AI assistant (Dashboard) | Bottom-right chat icon |
| AI assistant (Estimator) | Estimator toolbar → Lux button |
| Share a proposal | Open project → Step 4 → Share |
| Export PDF | Open project → Step 4 → Generate PDF |
| Switch document mode | Project settings → Budget / Proposal / LOI toggle |

---

*This document covers every feature on the platform as of February 2026. If something doesn't work as described or you have questions, reach out to Ahmad at Assisted.VIP.*
