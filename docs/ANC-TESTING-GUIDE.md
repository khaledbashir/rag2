# ANC Proposal Engine — Testing Guide

**For:** ANC Team (Natalia, Matt, Jeremy, Eric, Alison)
**Date:** February 2026
**URL:** https://proposals.anc.com

This guide walks you through every feature on the platform with step-by-step instructions and sample inputs to try. Work through each section to get familiar with the full system.

---

## 1. Login & Dashboard

**Steps:**
1. Go to the platform URL and log in with your credentials
2. You should land on the **Projects Dashboard**
3. Look at the top KPI strip — it shows total projects, pipeline value, and project counts by mode

**Try this:**
- Click the search bar and type a client name to filter
- Click any project card to open it
- Click the status dropdown on a project to change it (Draft → Approved → Signed)
- Click "Brief Me" on any project — the AI will summarize its contents

**What to look for:**
- KPI numbers match what you'd expect
- Projects load quickly
- Status changes save immediately

---

## 2. Mirror Mode (Natalia's Workflow)

This is the "upload Excel, get a matching proposal" flow.

**Steps:**
1. From the Dashboard, click **New Project**
2. On Step 1 (Ingestion), upload an ANC pricing Excel file
3. The system parses it and shows you the extracted pricing table
4. Click through to Step 4 (Export)
5. Click **Generate PDF** to see the proposal

**Try with these files (if you have them):**
- A standard ANC cost analysis Excel
- A Moody Center or similar non-standard format (this will trigger the Mapping Wizard)

**What to look for:**
- Every line item, section header, and total matches the Excel exactly
- No rounding or recalculation — numbers are identical
- Section order is preserved
- The PDF looks professional with ANC branding

**If you get the Mapping Wizard:**
- This means the Excel format is new to the system
- Pick the sheet with data, click the header row, map the columns (Description, Price, Qty, etc.)
- Name the profile (e.g., "Moody Center Format") and save
- Next time you upload the same format, it imports automatically

---

## 3. Intelligence Mode

Build a proposal from scratch — no Excel needed.

**Steps:**
1. From the Dashboard, click **New Project**
2. Choose **Intelligence Mode**
3. Fill in: client name, venue, display specs
4. The system calculates pricing based on the Rate Card
5. Review the pricing breakdown, adjust margins if needed
6. Export as PDF

**Try this sample project:**
- Client: "Dallas Stars"
- Venue: "American Airlines Center"
- Display: 20ft x 12ft main scoreboard, 4mm pixel pitch, indoor, wall mount
- Add a second display: 100ft x 3ft ribbon board, 6mm, ribbon mount

**What to look for:**
- Costs calculate automatically as you fill in specs
- Margin formula works (selling price = cost / (1 - margin %))
- Adding/removing displays updates the total
- PDF export includes all displays

---

## 4. LED Estimator

The fast calculator — answer questions, see live pricing.

**Steps:**
1. From the sidebar, click **Estimator** (or from Dashboard, click **New Estimate**)
2. You'll see the question flow — answer each question
3. Watch the right side: the Excel-style preview updates in real time
4. Click through the sheet tabs at the bottom (Project Info, Budget Summary, Display Details, etc.)

**Try this walkthrough:**
1. Client Name: "Indiana Fever"
2. Project Name: "Gainbridge Fieldhouse"
3. Location: "Indianapolis, IN"
4. Document Type: Budget
5. Indoor: Yes
6. New Install: Yes
7. Union Labor: Yes
8. Display Name: "Main Scoreboard"
9. Display Type: Scoreboard
10. Width: 20 ft, Height: 12 ft
11. Pixel Pitch: 4mm
12. Complexity: Standard
13. Service Type: Front/Rear
14. When asked "Add another display?" → Yes
15. Add: "Ribbon Board", Ribbon, 100 x 3, 6mm, Standard
16. Continue to Financial questions
17. Margin: 30%, Depth: ROM (quick) or Detailed (shows cost categories 3A-3G)

**What to look for:**
- Preview updates after every answer
- Numbers change when you switch between ROM and Detailed mode
- Detailed mode shows the "Cost Categories" sheet tab with 3A-3G breakdown
- Union labor adds 15% to installation costs
- The Budget Summary grand total is correct

---

## 5. AI Quick Estimate

Describe a project in plain English and let AI fill the form.

**Steps:**
1. Open the Estimator
2. On the very first question, click the **"Describe your project"** button (blue dashed box)
3. Type a project description in the text area
4. Click **"Fill Form with AI"** (or press Ctrl+Enter)
5. Watch the form auto-fill and jump to Financial questions

**Try these sample descriptions:**

**Simple:**
> Indiana Fever at Gainbridge Fieldhouse needs a new 20x12 main scoreboard at 4mm pixel pitch. Indoor arena, new install.

**Multi-display:**
> The Dallas Cowboys at AT&T Stadium need three displays: a 30x18 center-hung scoreboard at 2.5mm, two 200x3 ribbon boards at 6mm around the upper deck, and a 40x8 outdoor marquee at 10mm for the entrance. Union labor required.

**Minimal info (let AI fill defaults):**
> New scoreboard for the Sacramento Kings arena.

**Replacement project:**
> Replace the existing LED displays at Moody Center in Austin, TX. Need a 25x14 main video board at 4mm and a 120x3 fascia board at 6mm. Outdoor, non-union.

**What to look for:**
- AI correctly identifies: client name, venue, location, indoor/outdoor, union, new/replacement
- Displays are created with correct types, dimensions, and pixel pitches
- If you give minimal info, it fills reasonable defaults
- After AI fills the form, you land on the Financial questions — go back to review what it filled

---

## 6. Estimator Tools

Once you have a display configured in the Estimator, try each tool from the toolbar:

### 6a. Smart Bundler (orange button)
- Click the **Bundle** button in the toolbar
- See suggested accessories for each display (video processor, cables, spare parts, etc.)
- Toggle items on/off with checkboxes
- Watch the total cost update

**What to look for:** A scoreboard should suggest video processor ($12K), receiving cards, spare modules. A ribbon board should suggest different items.

### 6b. Budget Reverse Engineer (teal button)
- Click the **Budget** button
- Enter a target budget (e.g., $500,000)
- It shows which LED products from the catalog fit within that budget for your display size

**What to look for:** Results sorted by fit score. Each option shows headroom (how much budget is left).

### 6c. Vendor RFQ Generator (cyan button)
- Click the **RFQ** button
- Select one or more manufacturers (LG, Yaham, etc.)
- Click Generate
- See the formatted RFQ document with specs, quantities, and an RFQ number (RFQ-2026-XXXX)

**What to look for:** Each manufacturer gets their own RFQ. Specs match what you configured. Download works.

### 6d. Contract Risk Scanner (rose button)
- Click the **Risk** button
- Paste contract/SOW text (or upload a PDF)
- See the 20-point liability checklist with pass/warning/critical flags

**Try pasting this sample text:**
> This agreement is between ANC Sports and the Client. Payment terms are net 30. The contractor shall provide a 2-year warranty on all LED displays. Force majeure clause applies to acts of God. Liquidated damages shall not exceed $5,000 per day with no cap.

**What to look for:** "Liquidated Damages" should flag as critical (no cap mentioned). "Payment Terms" should pass (net 30 found). "Limitation of Liability" should flag as missing.

### 6e. Revision Radar (amber button)
- Click the **Delta** button
- Upload two Excel files: original pricing and revised pricing
- See section-by-section comparison with dollar impact highlighted

**What to look for:** Changed rows in amber, increases in red, decreases in green. Grand total delta at the top.

### 6f. Cut Sheets (indigo button)
- Click the **Cuts** button
- See your display specs summarized
- Click **Generate Cut Sheets**
- Review the per-display spec sheet (dimensions, resolution, power, weight, install notes)

**What to look for:** Specs match your configuration. Notes are auto-generated based on environment (indoor vs outdoor).

### 6g. Metric Mirror
- In the question flow, when entering Width or Height for a display
- If a product is selected, you'll see a snap card showing actual dimensions after cabinet grid alignment
- Shows feet-inches format (e.g., 9'-10") and the delta from your target

**What to look for:** Color-coded delta — green (< 0.5" off), amber (< 2"), red (> 2").

---

## 7. Product Catalog (Admin)

**Steps:**
1. Go to **Admin → Product Catalog** in the sidebar
2. Browse existing products or click **Add Product**
3. Try filtering by manufacturer or pixel pitch
4. Click a product to see its full spec sheet

**What to look for:**
- Products have: name, manufacturer, pixel pitch, cabinet dimensions, weight, power, brightness
- Indoor/outdoor flag
- Cost per square foot

---

## 8. Rate Card (Admin)

**Steps:**
1. Go to **Admin → Rate Card** in the sidebar
2. Browse the rate entries — these are the constants the Estimator uses
3. Try editing a value (e.g., change a labor rate)
4. Go to the Estimator and create a new estimate — the new rate should be reflected

**Key rates to check:**
- `led_cost.2_5mm`, `led_cost.4mm`, `led_cost.6mm` — hardware cost per sqft by pitch
- `install.steel_fab.standard` — steel fabrication labor rate
- `install.led_panel.standard` — LED installation labor rate
- `other.pm_base_fee` — project management base fee
- `margin.led_hardware` — default LED margin percentage

---

## 9. PDF Export & Sharing

**Steps:**
1. Open any completed proposal
2. Go to Step 4 (Export)
3. Click **Generate PDF** — a formatted PDF should appear in the preview
4. Click **Share** — generates a unique link
5. Open the share link in a new browser (or incognito) to see the client view

**What to look for:**
- PDF has ANC branding, correct pricing tables, professional layout
- Share link works without login
- Client can scroll through the proposal
- E-signature button is available on the shared view

---

## 10. AI Copilot (Lux)

**Steps:**
1. On the Dashboard, look for the chat icon in the bottom-right corner
2. Click to open the Copilot panel

**Try these prompts:**

| What to type | What should happen |
|-------------|-------------------|
| "What's the pipeline value?" | Shows total dollar value of active proposals |
| "Which projects need attention?" | Lists stale drafts or projects missing info |
| "Show me the latest projects" | Lists recent project activity |
| "What LED products do we have for indoor 4mm?" | Searches the product catalog |
| "Start a new budget" | Starts creating a new project |

**What to look for:**
- Responses are relevant and accurate
- Product catalog queries return real data from the database
- Quick actions actually navigate or create things

---

## 11. Document OCR

The platform can read scanned PDFs, DOCX files, and 75+ other formats.

**Steps:**
1. Try uploading a **scanned PDF** (image-only, no selectable text) to either:
   - The Contract Risk Scanner
   - The proposal import (Mirror Mode)
   - The PDF Filter tool (sidebar → PDF Filter)
2. The system should extract the text and process it normally

**What to look for:**
- Scanned documents are readable (not "image-only" errors)
- Text extraction is reasonably accurate
- Works with PDF, DOCX, DOC files

---

## Quick Reference — Where Everything Is

| Feature | Where to Find It |
|---------|-----------------|
| Dashboard | Home page after login |
| New Project | Dashboard → "New Project" button |
| New Estimate | Dashboard → "New Estimate" button, or Sidebar → Estimator |
| AI Quick Estimate | Estimator → first question → "Describe your project" |
| Estimator Tools | Estimator toolbar (colored buttons along the top) |
| Product Catalog | Sidebar → Admin → Product Catalog |
| Rate Card | Sidebar → Admin → Rate Card |
| PDF Filter | Sidebar → Tools → PDF Filter |
| AI Copilot | Bottom-right chat icon on Dashboard |
| User Management | Sidebar → Admin → Users |
| Profile Settings | Sidebar → Settings → Profile |

---

## Reporting Issues

If something doesn't work as described:
1. Note which page you're on (URL)
2. What you clicked or typed
3. What happened vs. what you expected
4. Screenshot if possible

Send to Ahmad at Assisted.VIP.

---

*This guide covers all features as of February 2026. New capabilities will be added to this document as they ship.*
