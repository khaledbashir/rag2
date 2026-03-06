# Questions for Natalia — Unified Excel Build
## Status: PENDING ANSWERS

---

### 1. ONE TEMPLATE OR TWO?
Right now we have two builders (Budget + RFP) producing different workbooks. RFP version has more tabs (P&L, Cash Flow, Travel, Resp Matrix). Budget version is leaner.

**Question:** Should every workbook have all tabs regardless of how it started? Or keep a "light" version for budgets and a "full" version for RFPs?

**Answer:**

---

### 2. WHICH TABS DOES THE CLIENT SEE?
Some tabs are clearly internal (P&L, Bundle Equipment with ANC costs). Some are client-facing (Margin Analysis with selling prices, LED sheet, Tech Specs).

**Question:** When you send the workbook to the client, do they get the whole thing or do you pull out specific tabs? Which tabs are client-facing vs internal-only?

**Answer:**

---

### 3. BASE VS ALTERNATE LAYOUT
Currently alternates can live in the same Margin Analysis section as base items.

**Question:** Should Margin Analysis have two clearly separated blocks — "Base Bid Grand Total: $X" then "Alternate Grand Total: $Y" — each with their own subtotal, tax, bond, and grand total? Or grouped differently?

**Answer:**

---

### 4. MARGIN ANALYSIS — WHAT DOES THE CLIENT SEE AT LINE LEVEL?
You said move cost/margin to the bottom. Currently line items show description + selling price only, with cost and margin only on subtotal rows.

**Question:** Is that the right layout for client-facing? Or should the client version show NO cost/margin at all (not even on subtotals), and the internal version shows everything?

**Answer:**

---

### 5. ONLINE EDITING SCOPE
The engine already lets you edit quantities, dimensions, costs, and margins in-browser with live recalculation.

**Question:** Is that enough, or do you also need to edit things like install rates, bond %, tax %, and project info online with everything updating live throughout?

**Answer:**

---

### 6. MIRROR MODE ROUND-TRIP
The flow is: engine generates Excel --> you adjust numbers --> re-upload to Mirror Mode --> instant PDF.

**Question:** When the PDF is generated from the re-upload, which tabs should appear in the PDF? Just Margin Analysis? LED sheet too? Or the full workbook?

**Answer:**

---

### 7. INSTALLER SPECS — SAME WORKBOOK OR SEPARATE FILE?
We have a Tech Specs tab with no pricing (14 columns of specs only) for sharing with installers/subs.

**Question:** Should that stay as a tab inside the main workbook (installer pulls it out themselves), or should there be a "Download Installer Package" button that exports it as a standalone file?

**Answer:**

---

### 8. 3.9mm MESH ENVIRONMENT
The 3.9mm Mesh P10 (FM1921) is currently tagged as "indoor" in the product catalog. You listed all mesh products under Outdoor in your Capital One product list.

**Question:** Should the 3.9mm Mesh be outdoor? Or is it genuinely indoor for Capital One?

**Answer:**

---

### 9. MATT'S SOW TEMPLATES
You asked Matt to share SOW examples so we can build auto-generated templates.

**Question:** Has Matt shared any yet? If not, can we get 2-3 real examples to work from?

**Answer:**

---

### 10. EXCEL TAB ORDER
When the unified workbook is finalized, what order should the tabs appear?

**Proposed order (based on current RFP version):**
1. Project Summary
2. LED Cost Sheet
3. Processor Count
4. Margin Analysis
5. Install sheets (per zone)
6. Bundle Equipment
7. CMS (if applicable)
8. Scoring (if applicable)
9. Tech Specs (Installers)
10. P&L
11. Cash Flow
12. Resp Matrix
13. Travel

**Question:** Is this order right? Anything to add, remove, or reorder?

**Answer:**

---

## WHAT'S ALREADY BUILT (no questions needed)
- Live Excel formulas linked between pages
- Online editing with live recalculation
- Per-screen subtotals with tax/bond/grand total
- Bundle Equipment sheet (processor/equipment breakdown)
- Tech Specs sheet (no pricing, installer-safe)
- Project Summary tab with cross-sheet formula to grand total
- Spare parts rolled into LED hardware
- Mirror Mode re-upload for instant PDF
- Claimed pixel pitch = N/A globally
- All 11 Capital One products in catalog
