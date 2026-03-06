# Unified Excel — Plan of Understanding
### For Natalia to review and confirm

---

## How It Works (The Flow)

1. Engine generates one Excel workbook — same format whether it starts from Budget or RFP
2. Team works in it — edit numbers online or download and adjust in Excel
3. When ready — re-upload the Excel into Mirror Mode
4. Mirror Mode generates the branded PDF — that's what the client sees

Excel stays internal. Client only sees the PDF.

---

## One Template

- Budget and RFP produce the exact same workbook
- Project Overview tab (currently only in Budget) will be in both
- Everything else follows the RFP format

---

## Two Pricing Views

The workbook will have both:

- **Margin Analysis** — one summary tab with all screens listed vertically. Each screen shows its full breakdown (hardware, install, engineering, structural, electrical, PM, subtotal, tax, bond, tariff, grand total). This is what becomes the client PDF via Mirror Mode.
- **Budget Summary** — per category. All hardware together, all labor together, all misc. For Jireh's internal budgeting.

Both tabs, same workbook, same numbers. If we ever need to simplify, Margin Analysis takes priority.

---

## Base Bid vs Alternates

- Base bid screens get a grand total (subtotal + tax + bond)
- Alternates do NOT get their own grand total — they are add-ons
- Each alt sits under its corresponding base screen as an add/deduct line
- Grand total table on Margin Analysis is toggleable (on/off)

**If RFP with bid form:**
- Margin Analysis follows the exact order and display names from the bid form
- Bid form takes priority over the RFP PDF

**If no RFP (budget from scratch):**
- Base screens listed with per-screen subtotals
- Under each base screen, alts show as "+ or - $X" for different pitch or size

---

## Per-Screen Breakdown

All costs are per screen, not per project:
- LED hardware — per screen
- Labor / Install — per screen
- Structural — per screen
- Electrical — per screen
- PM — per screen

Each screen rolls up to its own subtotal on the Margin Analysis.

---

## Tab Order (FINAL — Confirmed)

1. Project Overview
2. Margin Analysis
3. Budget Summary
4. LED Cost Sheet
5. Tech Specs — no pricing, for sharing with installers/subs
6. Install sheets (one per screen)
7. Processor Count
8. Bundle Equipment
9. Travel (own tab — hotel, airfare, car, per diem)
10. CMS (if applicable)
11. Scoring (if applicable)
12. Resp Matrix
13. P&L
14. Cash Flow

---

## What's Already Built

- Live Excel formulas linked between tabs
- Online editing with live recalculation
- Per-screen subtotals with tax and bond
- Bundle Equipment sheet
- Tech Specs sheet (no pricing)
- Project Summary / Overview tab
- Spare parts rolled into LED hardware
- Mirror Mode re-upload for instant PDF
- Claimed pixel pitch = N/A on all spec sheets
- All Capital One products loaded in catalog

---

## Still Need

- Eric to confirm: is 3.9mm Mesh indoor or outdoor?
- ~~Matt to share SOW examples~~ RECEIVED — also need Jeremy's for comparison
- Natalia to confirm tab order above

---

**If anything above is wrong or missing, please flag it. Once confirmed, I start building.**
