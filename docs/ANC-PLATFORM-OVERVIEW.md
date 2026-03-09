# ANC Proposal Engine — Platform Overview

**Prepared by:** Assisted.VIP
**For:** ANC Sports Enterprises
**Date:** February 2026

---

## What Is It?

The ANC Proposal Engine is a web-based platform purpose-built for ANC's LED display business. It replaces the manual Excel-email-PDF workflow with a single system that handles everything — from initial cost estimates to final signed proposals.

Your team logs in, builds proposals, exports professional PDFs, and shares them with clients for review and e-signature. All from one place.

**Live at:** https://proposals.anc.com

---

## Who Uses It?

| Person | Role | Primary Use |
|--------|------|-------------|
| **Natalia** | Proposal Lead | Import Excel pricing → generate matching PDF proposals (Mirror Mode) |
| **Matt** | Product & Pricing | Build proposals from scratch with AI-assisted pricing (Intelligence Mode) |
| **Jeremy** | Business Development | Quick budget estimates, RFP responses |
| **Eric** | Engineering | Review technical specs, cut sheets, cabinet layouts |
| **Alison** | Management | Dashboard overview, pipeline tracking |

---

## Platform Capabilities

### 1. Projects Dashboard

The home screen. Shows every proposal in your pipeline with live stats:

- **Total projects** and their status (Draft, Approved, Signed)
- **Pipeline value** — total dollar amount across active proposals
- **Quick filters** — search by client, venue, or status
- **AI Brief** — click any project and get an instant summary of what's in it

From here you can create a new project, open an existing one, or jump into the Estimator.

---

### 2. Proposal Builder (Two Modes)

#### Mirror Mode — "Make it look exactly like the Excel"

Natalia's primary workflow. Upload an ANC pricing Excel and the system:

- Reads every line item, section, and total exactly as-is
- Reproduces the pricing table in a professional PDF template
- Does zero math — what's in the Excel is what appears in the proposal
- Handles non-standard Excel formats with a one-time column mapping wizard (Map Once, Remember Forever)

#### Intelligence Mode — "Build it from scratch"

For new projects where there's no existing Excel. The system:

- Walks you through project setup (client, venue, displays, specs)
- Pulls from the product catalog to match the right LED panels
- Calculates all costs: hardware, installation, electrical, engineering, PM
- Applies margin formulas and generates the full pricing breakdown
- Supports USD, CAD, EUR, and GBP

---

### 3. LED Estimator

A dedicated calculator for quick cost estimates — no Excel needed.

**How it works:**
1. Answer guided questions about the project (venue, displays, specs)
2. See a live Excel-style preview that updates as you answer
3. Export the estimate or convert it to a full proposal

#### AI Quick Estimate — How It Works

Normally, building an estimate means answering 50+ questions one at a time: client name, venue, each display's type, dimensions, pixel pitch, mounting, complexity, and so on. That's fine for a detailed session, but when you're on a call or in a meeting and just need a ballpark, it's too slow.

**AI Quick Estimate lets you skip all of that.** You describe the project the way you'd describe it to a colleague:

> "Indiana Fever at Gainbridge Fieldhouse needs a new 20x12 main scoreboard at 4mm, two 100x3 ribbon boards at 6mm, and a 30x6 marquee at 10mm. Indoor, union labor."

The AI reads that sentence and extracts every detail:

| What you wrote | What the system fills in |
|---------------|------------------------|
| "Indiana Fever" | Client Name |
| "Gainbridge Fieldhouse" | Project Name |
| "20x12 main scoreboard at 4mm" | Display 1: Scoreboard, 20'×12', 4mm pitch |
| "two 100x3 ribbon boards at 6mm" | Display 2 & 3: Ribbon Board, 100'×3', 6mm pitch |
| "30x6 marquee at 10mm" | Display 4: Marquee, 30'×6', 10mm pitch |
| "Indoor" | Environment: Indoor |
| "union labor" | Union: Yes (+15% labor) |

One sentence → all project fields filled, all displays created, ready for pricing. The system jumps straight to the financial questions (margin tier, bond rate) so you can have a budget number in under 30 seconds.

**What it doesn't do:** It doesn't guess at things you didn't mention. If you don't specify dimensions, it uses industry-standard defaults (scoreboards default to 20×12, ribbons to 100×3). If you don't mention union labor, it defaults to non-union. You can always go back and adjust any field after the AI fills it in.

**When to use it:**
- Quick ROM on a call — describe what the client is asking for, get a number
- Initial pipeline entry — capture the opportunity fast, refine later
- Multi-display venues — instead of filling the same questions 4 times, describe all displays in one paragraph

**Built-in tools available inside the Estimator:**

| Tool | What It Does |
|------|-------------|
| **Smart Bundler** | Suggests commonly forgotten items — video processors, spare modules, cable kits, commissioning |
| **Budget Reverse Engineer** | Enter a target budget and display size → see which LED products fit within that budget |
| **Vendor RFQ Generator** | Auto-generates manufacturer quote requests with full specs, one per vendor, numbered and dated |
| **Contract Risk Scanner** | Upload a SOW/contract → 20-point checklist flags missing clauses and liability exposure |
| **Revision Radar** | Upload original + revised Excel → see exactly what changed and the dollar impact |
| **Visual Cut Sheets** | Auto-generates per-display spec sheets for submittal packages |
| **Metric Mirror** | Shows real-time Imperial/Metric conversion as you enter dimensions, snapped to actual cabinet grid |
| **Cost Category Breakdown** | Detailed view of all 7 ANC cost categories (3A–3G) per display |

---

### 4. Product Catalog

A searchable database of LED display products from ANC's manufacturer partners (LG, Yaham, Absen, Unilumin, and others).

- Filter by pixel pitch, indoor/outdoor, manufacturer
- Each product includes: dimensions, resolution, brightness, weight, power draw, IP rating
- Selected products auto-populate into estimates and proposals
- Admin-managed — add, edit, or import products as catalog evolves

---

### 5. Rate Card

The single source of truth for all estimation constants:

- LED hardware cost per sq ft by pixel pitch
- Installation labor rates by complexity (standard, complex, extreme)
- Electrical, PM, engineering base fees
- Margin percentages, bond rates, tax rates

When a rate changes, every new estimate uses the updated value. Existing estimates keep their original rates for audit purposes.

---

### 6. PDF Export & Client Sharing

Every proposal can be exported as a professional PDF with ANC branding, or shared via a secure link:

- **PDF Export** — formatted proposal document, ready for email or print
- **Share Link** — client receives a read-only view of the proposal
- **E-Signature** — clients can sign directly on the shared link
- **Client Annotations** — clients can leave voice/text feedback on specific sections

---

### 7. AI Copilot (Lux)

An AI assistant available throughout the platform:

- Ask questions about projects: "What's the pipeline value?" or "Which projects need attention?"
- Get instant answers from ANC's knowledge base (product specs, installation guides, past projects)
- Quick actions: "Start a new budget for the Pacers" or "Open the Moody Center project"

---

## Current Status

### What's Live and Working

- Projects Dashboard with full pipeline management
- Mirror Mode — Excel import → PDF proposal (Natalia's daily workflow)
- Intelligence Mode — build proposals from scratch with pricing engine
- LED Estimator with all 8 built-in tools
- AI Quick Estimate (describe project → auto-fill)
- Product Catalog management
- Rate Card management
- PDF export with ANC template
- Client share links with e-signature
- AI Copilot (Lux) with RAG knowledge base
- Document OCR — reads scanned PDFs, DOCX, and 75+ file formats
- Multi-currency support (USD, CAD, EUR, GBP)
- Role-based access (Admin, Product Expert, User)

### In Progress / Coming Soon

- Product catalog data population (manufacturer specs from Matt)
- Email sending directly from the platform
- Estimate → Full Proposal conversion (one-click)
- Historical comparison ("How does this estimate compare to similar past projects?")
- End-to-end testing suite

---

## How It's Built

The platform runs on ANC's own infrastructure — no third-party SaaS dependencies for core functionality.

| Component | Purpose |
|-----------|---------|
| Web Application | Next.js (React) — the main platform users interact with |
| Database | PostgreSQL — stores all projects, products, rates, users |
| AI/Knowledge | AnythingLLM — answers questions using ANC's uploaded documents and product data |
| PDF Engine | Browserless — generates professional PDF proposals |
| Document OCR | Kreuzberg — reads scanned PDFs and extracts text for processing |
| Hosting | Dedicated VPS with Docker, managed via EasyPanel |

All data stays on ANC's server. Nothing goes to external AI services for proposal content.

---

## Access

- **URL:** https://proposals.anc.com
- **Login:** Email + password (accounts created by Admin)
- **Roles:**
  - **Admin** — full access including Rate Card, User Management, Pricing Logic
  - **Product Expert** — full access except Rate Card and User Management
  - **User** — create and manage proposals, use Estimator and PDF tools

---

*Questions? Contact Ahmad Basheer at Assisted.VIP*
