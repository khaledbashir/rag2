# ANC Proposal Engine — Complete Testing Guide

**Version:** March 7, 2026
**Production URL:** https://proposals.anc.com
**Login:** Use your assigned credentials (NextAuth)

---

## How to Use This Guide

Each section has numbered test steps. Follow them in order. After each test, mark PASS or FAIL.
If something fails, note what happened and move on — don't stop testing.

**You'll need:**
- A browser (Chrome recommended)
- 1-2 ANC Cost Analysis Excel files (any real file Natalia uses)
- An RFP PDF (optional — for RFP Analyzer tests)

---

## SECTION A: Login & Navigation

### A1. Login
1. Go to the production URL
2. Click "Sign In"
3. Enter your credentials
4. **PASS if:** You land on the Projects page

### A2. Navigation
1. Click each item in the left sidebar: Projects, Estimator, Chat, Settings
2. **PASS if:** Each page loads without error

---

## SECTION B: Mirror Mode (Natalia's Primary Workflow)

This is the most critical flow — Upload Excel, get branded PDF.

### B1. Create New Project (Mirror Mode)
1. Go to Projects → click "New Project"
2. Fill in project name (e.g., "Test Project ABC")
3. Fill in client name
4. Click Create → you'll see the Mode Selector
5. Click **"Upload Excel → PDF"** (first option, blue border)
6. **PASS if:** You see Step 1 with an Excel upload area

### B2. Upload Excel File
1. Drag & drop an ANC Cost Analysis Excel file (or click to browse)
2. Wait for parsing (you'll see a progress indicator)
3. **PASS if:** You see:
   - Green success message
   - Sheet name detected (e.g., "Margin Analysis")
   - Table count shown (e.g., "3 tables, 24 items")
   - Excel preview grid appears

### B3. Check Screen Detection
1. Click "Next" to go to Step 2 (Configure)
2. Look at the screens list on the left
3. **PASS if:** Screen names match what's in your Excel (e.g., "Center Hung", "Ribbon Board")
4. Click on a screen — check dimensions (height, width), pixel pitch, quantity
5. **PASS if:** Values match your Excel

### B4. Check Pricing (Step 3)
1. Click "Next" to go to Step 3 (Pricing)
2. Look at the pricing tables
3. **PASS if:**
   - Each screen has its own pricing table
   - Line item descriptions match your Excel exactly
   - Selling prices match your Excel exactly
   - Subtotals, tax, bond, grand totals all match
   - Document total at the top matches your Excel

### B5. Generate PDF (Step 4)
1. Click "Next" to go to Step 4 (Export)
2. Look at the PDF preview on the right side
3. **PASS if:** Preview shows a branded proposal with:
   - ANC logo and header
   - Client name and project name
   - Pricing tables with correct numbers
   - No cost or margin columns visible (those are internal only)

### B6. Download Bundle
1. Click "Download Bundle" (blue button)
2. Wait for files to generate
3. **PASS if:** You get 3-4 files downloaded:
   - Proposal PDF (client-facing)
   - Budget PDF
   - LOI PDF
   - Audit Excel (internal)

### B7. Download Individual Files
1. Click the download icon next to "Excel Only" → should download the audit workbook
2. Click the download icon next to "Original Excel" → should download the exact file you uploaded
3. Click the download icon next to "PDF Only" → should download just the proposal PDF
4. **PASS if:** All 3 downloads work

---

## SECTION C: AI Import (BETA)

### C1. Start AI Import
1. Go to Projects → "New Project"
2. Fill in project name and client
3. Click Create → Mode Selector appears
4. Click **"AI-Powered Import"** (middle option, amber/yellow, says BETA)
5. Upload any Excel file (doesn't need to be standard ANC format)
6. **PASS if:** You see a loading indicator while AI processes the file

### C2. Verify AI Results
1. After AI finishes, check the detected tables and screens
2. Compare table names, line items, and prices against the original Excel
3. **PASS if:**
   - Table names are reasonable (match section headers in Excel)
   - Prices are within $1 of the original Excel values
   - Screen count and dimensions are detected
   - Document total matches (within rounding)

### C3. AI Import → PDF
1. Continue through Steps 2-4 just like Mirror Mode (Section B3-B6)
2. **PASS if:** The PDF generates with correct pricing from the AI import

---

## SECTION D: Intelligence Mode (Build from Scratch)

### D1. Start Intelligence Mode
1. Go to Projects → "New Project"
2. Fill in project name and client
3. Click Create → Mode Selector
4. Click **"Build from Scratch"** (right option)
5. **PASS if:** You see Step 1 with no Excel upload required

### D2. Add Screens Manually
1. Go to Step 2 (Configure)
2. Click "Add Screen"
3. Fill in: Name (e.g., "Main Scoreboard"), Height (20), Width (40), Pitch (10mm), Qty (1)
4. Add 2-3 screens
5. **PASS if:** Screens appear in the list with correct values

### D3. Configure Pricing
1. Go to Step 3 (Pricing)
2. Set margin percentages (global or per-category)
3. Adjust line items as needed
4. **PASS if:** Selling prices calculate correctly from cost + margin

### D4. Export
1. Go to Step 4 → Download Bundle
2. **PASS if:** PDF and Excel files generate with your manually entered data

---

## SECTION E: Excel Workbook Features (Change Doc Items)

These tests verify the internal Excel workbook that gets exported.

### E1. LED Cost Sheet — Weight, Power, BTU
1. Open any project with screens → Step 4 → Download "Excel Only"
2. Open the downloaded Excel → go to "LED Cost Sheet" tab
3. **PASS if:** You see three columns on the right side: **Weight (lbs)**, **Total Power (W)**, **BTU/hr**
4. Values should be populated based on the display specs (not blank or zero)

### E2. Margin Analysis — Cost/Margin Hidden on Line Items
1. In the same Excel → go to "Margin Analysis" tab
2. Look at individual line item rows
3. **PASS if:**
   - Cost and Margin % columns appear empty/hidden on line items
   - BUT subtotal and grand total rows show full cost/margin values
   - This is intentional — the values are there for formulas but hidden from view

### E3. Spare Parts Under LED Hardware
1. In the Margin Analysis tab, look for spare parts
2. **PASS if:** Spare parts cost is NOT a separate line item — it's rolled into the "LED Hardware" line

### E4. Live Formulas
1. Click on any "Selling Price" cell in Margin Analysis
2. **PASS if:** You see a formula (not a hardcoded number)
3. Try changing a Cost value → the Selling Price should update automatically
4. Try changing a Margin % → the Selling Price should recalculate

### E5. Project Overview Tab
1. Check the tab order at the bottom of the Excel
2. **PASS if:** "Project Overview" is the first tab (leftmost)

### E6. Per-Screen Subtotals
1. In Margin Analysis, look at each screen section
2. **PASS if:** Each screen has: SUBTOTAL → TAX → BOND → TARIFF → GRAND TOTAL
3. At the bottom: BASE BID GRAND TOTAL sums all screens

### E7. Tech Specs (Installer-Friendly)
1. Go to the "Tech Specs (Installers)" tab
2. **PASS if:**
   - Shows display specifications (dimensions, pitch, resolution, weight, power)
   - Does NOT show any cost, price, or margin columns
   - Safe to hand to a subcontractor

### E8. Bundle Equipment Tab
1. Go to the "Bundle Equipment" tab
2. **PASS if:** Shows per-display equipment breakdown (processors, sending cards, cables, etc.)

---

## SECTION F: Installation SOW (DOCX)

### F1. Generate Installation SOW
1. Open any project with screens configured
2. Go to Step 4 (Export)
3. Look for the **"Install SOW"** button (green icon, says "Subcontractor DOCX")
4. Click the download icon
5. **PASS if:** A .docx file downloads

### F2. Verify SOW Content
1. Open the downloaded .docx in Word or Google Docs
2. **PASS if:** The document contains:
   - Project name, client, venue at the top
   - "Project Overview" section (ANC company description)
   - "Objective" section (what's being installed)
   - "Installation Timeline" section
   - "Electrical Connection" section
   - "Testing & Commissioning" section
   - "Reference Equipment" table (all displays with specs)
   - "Scope of Work" with General Inclusions and General Exclusions
   - Per-display installation task breakdown
   - "Itemized Pricing" table at the bottom

### F3. Verify Display Data
1. Check the equipment table in the SOW
2. **PASS if:** Display names, dimensions, pixel pitch, and quantities match the proposal

---

## SECTION G: RFP Analyzer

### G1. Upload an RFP
1. Go to Tools → RFP Analyzer (if visible in sidebar)
2. Upload an RFP PDF
3. Wait for processing
4. **PASS if:** You see extracted information:
   - Project name and venue
   - Display specifications (sizes, pitch, quantities)
   - Requirements and special conditions

### G2. Generate Scoping Workbook
1. After RFP analysis, click "Generate Workbook" (or similar)
2. **PASS if:** An Excel workbook downloads with multiple tabs (Margin Analysis, LED Cost Sheet, Install sheets, etc.)

### G3. Generate Instant PDF
1. Look for "Generate Instant PDF" button
2. Click it
3. **PASS if:** A proposal PDF is generated directly from the RFP analysis — no manual data entry needed

---

## SECTION H: AI Copilot

### H1. Open Copilot
1. In any project, look for the chat/copilot icon (usually bottom-right or in sidebar)
2. Click to open
3. **PASS if:** Chat panel opens

### H2. Test Natural Language Commands
1. Type: "Set margin to 35%"
2. **PASS if:** The margin percentage updates in the pricing
3. Type: "Add a screen called Lobby Display, 10 feet by 15 feet, 2.5mm pitch"
4. **PASS if:** A new screen is added with those specs
5. Type: "What's the total project value?"
6. **PASS if:** Copilot responds with the current document total

---

## SECTION I: Product Catalog (Admin)

### I1. View Products
1. Go to Admin → Products
2. **PASS if:** You see a list of LED products with manufacturer, model, pitch, specs

### I2. Search/Filter
1. Use the search bar to find a specific product (e.g., "3.9mm")
2. **PASS if:** Results filter correctly

### I3. Add Product (if admin)
1. Click "Add Product"
2. Fill in details (name, manufacturer, pitch, price, etc.)
3. Save
4. **PASS if:** Product appears in the list

---

## SECTION J: Sharing & Client View

### J1. Create Share Link
1. Open any project
2. Look for "Share" or a share icon
3. Create a share link
4. **PASS if:** A URL is generated

### J2. View Shared Proposal
1. Open the share link in a new browser (or incognito window)
2. **PASS if:**
   - Proposal loads without login
   - Shows read-only view with pricing and specs
   - Does NOT show internal cost/margin data

---

## SECTION K: PDF Quality Checks

For any PDF generated (from any workflow above):

### K1. Visual Quality
- [ ] ANC logo appears in header
- [ ] Project name and client name are correct
- [ ] French Blue accent color (#0A52EF) is used
- [ ] Work Sans font is used
- [ ] Page numbers appear on multi-page documents
- [ ] Tables don't clip or overflow page edges

### K2. Pricing Accuracy
- [ ] Line items match the Excel source
- [ ] Subtotals are correct
- [ ] Grand total matches
- [ ] NO cost or margin columns visible (those are internal)
- [ ] "INCLUDED" badge shows for $0 items (not "$0.00")

### K3. Specifications
- [ ] Screen dimensions are correct
- [ ] Pixel pitch is correct
- [ ] Manufacturer/model info appears if configured

---

## Quick Reference: What to Test First

If you only have 15 minutes, test these (the critical path):

1. **B1-B6** — Mirror Mode end-to-end (most important flow)
2. **F1** — Installation SOW download
3. **E1-E2** — Excel workbook Weight/Power + hidden cost columns
4. **K1-K2** — PDF visual quality + pricing accuracy

---

## Reporting Issues

If a test fails:
1. Note the **section number** (e.g., "B4 FAIL")
2. Take a **screenshot**
3. Describe **what you expected** vs **what happened**
4. Send to Ahmad with the screenshot

---

*Generated March 7, 2026 — ANC Proposal Engine v2*
