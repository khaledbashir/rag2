# ANC Studio - Requirements Extracted from Natalia Thread

**Document Version:** 1.0  
**Extracted Date:** February 5, 2026  
**Source:** Meeting transcripts, PRD documents, and Upwork communications with Natalia Kovaleva (ANC Sports Enterprises, LLC)

---

## Executive Summary

This document consolidates all functional and non-functional requirements extracted from conversations with Natalia Kovaleva. These requirements define the ANC Studio platform - an AI-powered proposal generation system for large-format LED display projects in stadiums, arenas, and entertainment venues.

---

## 1. CORE BUSINESS REQUIREMENTS

### REQ-001: Automated Proposal Generation
**Source:** Meeting 1/8/2026  
**Priority:** P0 (Must Have)

The system must transform complex RFP documents and technical specifications into branded, client-ready sales proposals automatically.

**Acceptance Criteria:**
- Upload Excel or RFP PDF → Generate client-facing proposal
- Sub-1-hour turnaround from upload to shareable link
- Support for 40+ screens in a single proposal

### REQ-002: Dual Output Generation
**Source:** Meeting 1/8/2026  
**Priority:** P0 (Must Have)

The system must produce two distinct outputs:
1. **Client-Facing PDF** - Branded, professional, sanitized (no internal costs)
2. **Internal Audit Excel** - Full calculation breakdown with formulas

**Natalia's Exact Words:**
> "Excel and PDF won't be the same exact documents. Excel has all the backup calculations and PDF only has client-facing information."

### REQ-003: Screen-Based Pricing Structure
**Source:** Meeting 1/8/2026  
**Priority:** P0 (Must Have)

Each proposal contains multiple "screens" (LED displays), each with:
- Display Name (e.g., "Center Hung", "Ribbon Board")
- Technical Specifications (pitch, dimensions, resolution, brightness)
- Per-Screen Cost Breakdown (hardware, structural, labor, installation)
- Line Item Pricing

---

## 2. DATA INGESTION REQUIREMENTS

### REQ-010: Excel Import (Mirror Mode)
**Source:** Meeting 1/8/2026, PRD Section 4.9  
**Priority:** P0 (Must Have)

The system must import estimator Excel files using fixed column mapping:

| Column | Field |
|--------|-------|
| A (0) | Display Name |
| E (4) | Pixel Pitch |
| F (5) | Active Height |
| G (6) | Active Width |
| H (7) | Pixel Resolution (Height) |
| J (9) | Pixel Resolution (Width) |
| M (12) | Brightness |

**Special Rules:**
- Rows labeled "ALT" or "Alternate" → SKIP (Base Bid only)
- Empty rows → SKIP
- Header rows → SKIP

### REQ-011: RFP Document Extraction (RAG)
**Source:** PRD Section 6, Natalia Meeting 1/14/2026  
**Priority:** P0 (Must Have)

The system must extract technical specifications from RFP documents using AI:
- Target: 80% auto-fill rate (17/20 fields)
- Priority Source: Division 11 / Section 11 06 60 (LED Display Systems Schedule)
- Support for 2,500+ page PDFs

**Accepted File Types:**
- PDF (RFPs, structural reports)
- Excel (.xlsx, .xls)
- Word (.docx)
- Images (OCR for technical drawings)

### REQ-012: Multi-Document Handling
**Source:** PRD Section 6.1  
**Priority:** P1 (Should Have)

Users can upload entire project folders ("Jaguar-sized" packages) and the AI queries across multiple related files.

---

## 3. FINANCIAL CALCULATION REQUIREMENTS

### REQ-020: Natalia Math - Divisor Margin Model
**Source:** Meeting 1/8/2026, PRD Section 4.5  
**Priority:** P0 (Must Have)

**CRITICAL:** The system MUST use the Divisor Margin formula, NOT markup.

```
Selling Price = Cost / (1 - Margin)
```

**Example:**
- Cost: $100,000
- Margin: 20%
- **Markup (WRONG):** $100,000 × 1.20 = $120,000
- **Divisor (CORRECT):** $100,000 / 0.80 = $125,000

**Validation:**
- Block margins >= 100% (division by zero error)
- Display error: "Margin must be less than 100%"

### REQ-021: Financial Calculation Sequence
**Source:** PRD Section 4.6  
**Priority:** P0 (Must Have)

The system MUST calculate in this exact order:

1. **Cost Basis** = Sum of all per-screen + project costs
2. **Selling Price** = Cost / (1 - Margin)
3. **Bond Value** = Selling Price × 1.5%
4. **B&O Tax** = (Selling Price + Bond) × 2% [Morgantown only]
5. **Sales Tax** = (Selling Price + Bond + B&O) × 9.5%
6. **Final Total** = Selling Price + Bond + B&O + Sales Tax

### REQ-022: Performance Bond
**Source:** PRD Section 4.7  
**Priority:** P0 (Must Have)

- Default Rate: 1.5% of Selling Price
- Override: Manual overrides allowed
- Visibility: Shown as line item in PDF and Share Link

### REQ-023: Morgantown B&O Tax
**Source:** PRD Section 4.8  
**Priority:** P0 (Must Have)

Site-specific 2% tax for West Virginia University projects:
- Trigger: Project location = Morgantown, WV (detect via address/venue name)
- Calculation: (Selling Price + Bond) × 2%
- Sequence: Applied AFTER Bond, BEFORE Sales Tax
- Display: "B&O Tax (Morgantown): $X" line item

### REQ-024: Cost Components
**Source:** Meeting 1/8/2026, PRD Section 5  
**Priority:** P0 (Must Have)

**Per-Screen Costs:**
- Hardware (LED modules/cabinets, processing electronics)
- Structural Materials (Tonnage × $3,000/ton)
- Structural Labor
- LED Installation
- Electrical/Data Subcontracting

**Project-Level Costs:**
- Project Management (PM)
- General Conditions
- Travel & Expenses
- Professional Services (Engineering, Submittals, Permits)
- CMS Equipment/Installation/Commissioning
- Spare Parts (typically 2% of hardware)
- Annual Maintenance

### REQ-025: Rounding Rules
**Source:** PRD Section 5.4  
**Priority:** P0 (Must Have)

- Rounding occurs at TOTALS only (not intermediate steps)
- Two decimal places for all currency ($125,000.00)
- Method: Banker's rounding (HALF_EVEN)
- Missing values: Show placeholder (e.g., [PROJECT TOTAL]) NOT $0.00

---

## 4. OUTPUT REQUIREMENTS

### REQ-030: Client-Facing PDF ("Ferrari-Grade")
**Source:** Meeting 1/8/2026, PRD Section 4.2  
**Priority:** P0 (Must Have)

**Natalia's Exact Words:**
> "I want to keep the font, the colors the same. Because this is our branding."

**Requirements:**
- Match ANC 2025 Brand Identity Guidelines exactly
- Centered "Paper Sheet" with shadow against bg-slate-200
- No internal costs, margins, or calculation formulas visible
- No "Blue Glow" AI metadata visible
- Empty fields show professional placeholders (not $0.00 or Invalid Date)

**Brand Guidelines (REQ-031):**
- Primary Color: French Blue #0A52EF
- Typography: Work Sans (Bold 700 / SemiBold 600 / Regular 400)
- Logo placement: Per 2025 Identity Guidelines

### REQ-032: Internal Audit Excel
**Source:** Meeting 1/8/2026, PRD Section 4.11  
**Priority:** P0 (Must Have)

**Natalia's Exact Words:**
> "I will need an Excel that shows me uh the margin that I used. So Excel will be pretty much an answer to every single question and all the calculations."

**Requirements:**
- Functional .xlsx with LIVE formulas (not static values)
- All cost components visible
- Yellow-highlighted input cells (margin %, steel basis, tax/bond overrides)
- Row groupings matching Drafting Table structure
- Must match PDF totals exactly

### REQ-033: Nomenclature Standard
**Source:** PRD Section 4.4  
**Priority:** P0 (Must Have)

All client-facing text MUST use "Brightness" instead of "Nits":
- UI tables and tooltips
- PDF headers and data rows
- RAG extraction field names
- Internal Audit Excel column headers
- Share Link displays

---

## 5. SHARE LINK REQUIREMENTS

### REQ-040: Secure Share Link Generation
**Source:** PRD Section 4.12  
**Priority:** P0 (Must Have)

Generate sanitized, public-accessible links for client review.

**Sanitization Allowlist (SHOWN):**
- Branding (logo, colors, typography)
- Technical specs (Display Name, Pitch, Quantity, Dimensions, Resolution, Brightness)
- Commercial terms (Total Selling Price, Sales Tax, Bond, Payment Terms)

**Sanitization Denylist (NEVER SHOWN):**
- Internal costs (hardware, labor, materials unit costs)
- Margin percentages or divisor logic
- Structural materials cost-basis ($3,000/ton)
- Bond/tax override details (rates and logic)
- "Natalia Math" formulas
- Raw source files (RFP PDFs, estimator Excels)
- AI metadata ("Blue Glow" indicators)

### REQ-041: Share Link Security
**Source:** PRD Section 4.12  
**Priority:** P0 (Must Have)

- Expiration: YES (configurable, default TBD)
- Password protection: YES (optional)
- Revocable: YES (instant revocation)
- Access logging: YES (who/when/IP for every view/download)
- Deep clone before generation (prevent data leakage)

### REQ-042: Revoked Link Handling
**Source:** PRD Section 4.12  
**Priority:** P0 (Must Have)

- Revoked link → 403 Forbidden (NOT 404)
- Snapshot retained for audit window
- Access logs retained for 15 years

---

## 6. USER INTERFACE REQUIREMENTS

### REQ-050: Fixed Viewport Architecture
**Source:** PRD Section 4.1  
**Priority:** P0 (Must Have)

- App locked to 100vh (no page scrolling)
- Left "Drafting Table" and right "Gallery" have independent scrollbars
- 50/50 split-screen layout
- CSS visibility toggling for panel switching (opacity + pointer-events-none)

### REQ-051: AI-Filled Field Indicators ("Blue Glow")
**Source:** PRD Section 6.3  
**Priority:** P1 (Should Have)

- Trigger: Field auto-filled by AI (not manually entered)
- Persistence: Until user verifies (clicks/edits/confirms)
- Storage: In-memory only (not persisted in DB)
- Export: Stripped from PDF and Share Link

### REQ-052: Gap Fill Questions
**Source:** Meeting 1/8/2026, PRD Section 6.2  
**Priority:** P1 (Should Have)

When AI cannot identify a field with confidence:
- Ask user 2-3 direct questions in chat sidebar
- If still unclear → leave field blank with placeholder
- Human verification required before "Approved" state

---

## 7. SIGNATURE & CONTRACT REQUIREMENTS

### REQ-060: Digital Signature Support
**Source:** PRD Section 4.14  
**Priority:** P1 (Should Have)

- "Agreed to and Accepted" signature blocks on PDF/Share Link
- ANC representative block (name, title, date)
- Purchaser representative block (name, title, date)
- Legal binding language included

### REQ-061: E-Signature Audit Trail
**Source:** PRD Section 4.14  
**Priority:** P1 (Should Have)

- Signer identity (full name, email)
- Authentication method (email verification, IP, device fingerprint)
- Timestamps (UTC, sent/viewed/signed)
- Document integrity (cryptographic hash at signing moment)
- Executed artifact storage (immutable PDF in Project Vault)

### REQ-062: Signature Block Placement
**Source:** PROJECT_MASTER_TRUTH.md  
**Priority:** P0 (Must Have)

The signature block MUST be the absolute final element in the PDF. No content (including footers) may render below the signature lines to meet legal standards.

---

## 8. USER ROLES & PERMISSIONS

### REQ-070: Role Definitions
**Source:** PRD Section 2.1  
**Priority:** P1 (Should Have)

| Role | Description |
|------|-------------|
| Admin | System owner (e.g., Natalia) - Branding, math logic, global settings |
| Estimator | Technical lead - Upload RFPs/Excels, run RAG extraction, Mirror Mode |
| Product Expert | Catalog manager - Update manufacturer catalogs |
| Proposal Lead | Day-to-day drafter - Gap filling, drafting, client-facing documents |
| Finance | Audit reviewer - Review Internal Audit Excel, verify margin logic |
| Outsider | Subcontractor/Installer - Restricted technical field access |
| Viewer | Anonymous public - View sanitized Share Link, download PDF, sign |

### REQ-071: Permission Matrix
**Source:** PRD Section 2.2  
**Priority:** P1 (Should Have)

**Critical Rule:** Viewers can NEVER see internal costs or margins.

---

## 9. DATA RETENTION & AUDIT REQUIREMENTS

### REQ-080: Project Vault
**Source:** PRD Section 4.13  
**Priority:** P1 (Should Have)

- Historical bids never lost
- Clear audit trail as scope evolves
- Old versions remain read-only
- Can clone old version into new Draft

### REQ-081: Versioning
**Source:** PRD Section 4.13  
**Priority:** P1 (Should Have)

- Proposals are versioned (v1, v2, v3...)
- Share Links point to specific versioned snapshot (immutable)
- Versioning triggers: Major drafting changes, financial input changes, header type change

### REQ-082: Retention Periods
**Source:** PRD Section 9.1  
**Priority:** P0 (Must Have)

| Artifact | Retention |
|----------|-----------|
| Projects, Proposals, Versions | Permanent |
| Audit Excels, PDFs | Minimum 3 years after contract termination |
| Access Logs | Minimum 15 years |
| Signature Evidence | Minimum 10 years |

### REQ-083: Immutability Rules
**Source:** PRD Section 9.2  
**Priority:** P0 (Must Have)

- Approved/Exported: PDF and Audit Excel locked
- Shared: Share Link snapshot immutable
- Signed: Proposal + PDF + Audit Excel fully immutable
- Signed versions can NEVER be edited (clone to new Draft instead)

---

## 10. AUDIT LOGGING REQUIREMENTS

### REQ-090: Required Log Events
**Source:** PRD Section 8.1  
**Priority:** P0 (Must Have)

Each log entry must include: Who (user ID + role), Timestamp (UTC), Project/Proposal ID, Version number, Before → After value.

**Events to Log:**
- Import (source filename, method, rows imported/skipped)
- Financial Changes (field name, old value, new value)
- AI Auto-fill + Verification (field name, value, who verified, timestamp)
- Export PDF / Audit Excel
- Share Link Create/Revoke/Access
- Signature Events

---

## 11. INTEGRATION REQUIREMENTS

### REQ-100: Salesforce Integration (Future)
**Source:** Meeting 1/8/2026  
**Priority:** P2 (Could Have)

**Natalia's Exact Words:**
> "We find the software that connects to Salesforce and as soon as somebody creates the opportunity in Salesforce it triggers proposal."

---

## 12. SUCCESS METRICS

### REQ-110: MVP Acceptance Criteria
**Source:** PRD Section 11.1  
**Priority:** P0 (Must Have)

1. **80% AI Auto-Fill Rate:** Test on 5 known RFPs, measure field accuracy ≥80%
2. **Zero Math Errors:** Internal Audit Excel ↔ PDF ↔ Share Link totals match exactly
3. **Ferrari-Grade PDFs:** Manual inspection confirms branding, typography, no data leakage
4. **Sub-1-Hour Proposal:** From RFP upload → shareable link in <60 minutes
5. **15-Year Audit Trail:** Access logs accessible, filterable, exportable

---

## 13. CRITICAL WARNINGS

> **NEVER change the Divisor Margin formula without explicit approval from Natalia**  
> **NEVER use fuzzy matching for Excel columns (use fixed indices)**  
> **NEVER expose internal costs in client-facing exports**  
> **ALWAYS deep clone before sanitization**  
> **ALWAYS verify share link sanitization after changes**

---

## Document Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-05 | Initial requirements extraction from Natalia thread |

---

**End of Requirements Document**
