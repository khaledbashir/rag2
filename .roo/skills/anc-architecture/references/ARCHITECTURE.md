# ANC Proposal Engine — Detailed Architecture Reference

This file provides deep-dive technical details for complex subsystems. Start with SKILL.md for overview.

---

## Table of Contents

1. [AI & Ingestion Pipeline](#ai--ingestion-pipeline)
2. [Database Schema Details](#database-schema-details)
3. [Excel Processing](#excel-processing)
4. [Pricing Logic Deep Dive](#pricing-logic-deep-dive)
5. [PDF Generation](#pdf-generation)
6. [State Management](#state-management)
7. [API Routes](#api-routes)

---

## AI & Ingestion Pipeline

### Models Used

| Model | Provider | Purpose | API Endpoint |
|-------|----------|---------|--------------|
| Mistral OCR | Mistral | PDF → structured markdown | `https://api.mistral.ai/v1/ocr` |
| Gemini 2.0 Flash | Google | Drawing analysis, spec extraction | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash` |
| GLM-4.6V Flash | Z.ai | Alternative vision model | `https://api.z.ai/api/paas/v4/chat/completions` |
| AnythingLLM | Self-hosted | RAG, document Q&A | `https://basheer-anything-llm.prd42b.easypanel.host/api/v1` |

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: Mistral OCR                                                │
│  - Input: PDF buffer                                                │
│  - Output: MistralOcrPage[] with markdown, tables, images          │
│  - Location: services/rfp/unified/mistralOcrClient.ts              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: Page Classification                                        │
│  - Input: MistralOcrPage[]                                         │
│  - Method: Text heuristics (keyword matching)                      │
│  - Categories: led_specs, drawing, cost_schedule, scope_of_work,   │
│                technical, legal, boilerplate, schedule, unknown    │
│  - Location: services/rfp/unified/pageClassifier.ts                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: Vision Analysis (Drawing Pages Only)                       │
│  - Input: Pages categorized as "drawing"                           │
│  - Method: Render to image → Gemini 2.0 Flash                      │
│  - Output: LED display specs from visual content                   │
│  - Location: services/rfp/unified/geminiVision.ts                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: Text Extraction (Text Pages Only)                          │
│  - Input: High-relevance text pages                                │
│  - Method: Regex patterns + AI-assisted extraction                 │
│  - Output: ExtractedLEDSpec[]                                      │
│  - Location: services/rfp/displayScheduleExtractor.ts              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 5: Merge & Deduplicate                                        │
│  - Combine specs from vision + text sources                        │
│  - Dedupe by name + location                                       │
│  - Assign confidence scores                                        │
│  - Location: services/rfp/unified/analyzeRfp.ts                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 6: Store & Export                                             │
│  - Store: ExtractedLEDSpec → ScreenConfig → Postgres               │
│  - Export: Generate Excel workbooks via ExcelJS                    │
│  - Location: services/rfp/server/RfpExtractionService.ts           │
└─────────────────────────────────────────────────────────────────────┘
```

### ExtractedLEDSpec Type

```typescript
interface ExtractedLEDSpec {
  name: string;                    // "North Main Videoboard"
  location: string;                // "North End Zone, Upper Level"
  widthFt: number | null;          // Width in feet
  heightFt: number | null;         // Height in feet
  widthPx: number | null;          // Horizontal resolution
  heightPx: number | null;         // Vertical resolution
  pixelPitchMm: number | null;     // Pixel pitch in mm
  brightnessNits: number | null;   // Brightness in nits
  environment: "indoor" | "outdoor";
  quantity: number;                // Number of identical displays
  serviceType: "front" | "rear" | "top" | null;
  mountingType: string | null;     // "fascia mount", "steel", etc.
  maxPowerW: number | null;        // Max power in watts
  weightLbs: number | null;        // Weight in lbs
  specialRequirements: string[];   // ["weatherproof", "curved", etc.]
  confidence: number;              // 0-1 AI confidence
  sourcePages: number[];           // Page numbers where found
  sourceType: "text" | "drawing" | "table";
  citation: string;                // "[Source: Section X, Page Y]"
  notes: string | null;            // Raw AI notes
}
```

---

## Database Schema Details

### Core Models

#### Workspace
```prisma
model Workspace {
  id              String     @id @default(cuid())
  name            String
  clientLogo      String?
  aiWorkspaceSlug String?              // AnythingLLM workspace slug
  proposals       Proposal[]
  users           User[]
}
```

#### Proposal (Main Entity)
```prisma
model Proposal {
  id                   String          @id @default(cuid())
  workspaceId          String
  
  // Client Info
  clientName           String
  clientLogo           String?
  venue                String?
  
  // Document Configuration
  documentMode         DocumentMode    @default(BUDGET)  // BUDGET | PROPOSAL | LOI
  calculationMode      CalculationMode @default(INTELLIGENCE)  // MIRROR | INTELLIGENCE | ESTIMATE
  status               ProposalStatus  @default(DRAFT)
  
  // Pricing Data (JSON blobs)
  pricingDocument      Json?           // Full Excel parse
  marginAnalysis       Json?           // Non-LED items breakdown
  quoteItems           Json?           // Line items
  tableHeaderOverrides Json?           // Mirror Mode section renames
  descriptionOverrides Json?           // Mirror Mode description edits
  priceOverrides       Json?           // Mirror Mode price edits
  
  // Verification & Audit
  verificationManifest Json?
  reconciliationReport Json?
  verificationStatus   VerificationStatus @default(PENDING)
  aiFilledFields       String[]        // Fields auto-filled by AI
  verifiedFields       Json?           // Human verification status
  
  // Estimator V2
  estimatorAnswers     Json?           // Full EstimatorAnswers
  estimatorDisplays    Json?           // DisplayAnswers with costs
  estimatorDepth       String?         // "rom" | "detailed"
  estimatorRateSnapshot Json?          // Rate card at creation time
  
  // Lifecycle
  isLocked             Boolean   @default(false)
  lockedAt             DateTime?
  documentHash         String?          // SHA-256 at signing
  versionNumber        Int       @default(1)
  
  // Relations
  screens              ScreenConfig[]
  manualOverrides      ManualOverride[]
  proposalVersions     ProposalVersion[]
  // ... more relations
}
```

#### ScreenConfig
```prisma
model ScreenConfig {
  id                    String     @id @default(cuid())
  proposalId            String
  name                  String
  customDisplayName     String?    // PDF override
  group                 String?    // Excel section header
  pixelPitch            Float
  width                 Float
  height                Float
  brightness            Float?     // Nits
  quantity              Int?       @default(1)
  serviceType           String?    // "Front/Rear" | "Top"
  hiddenFromSpecs       Boolean    @default(false)
  lineItems             CostLineItem[]
}
```

#### CostLineItem
```prisma
model CostLineItem {
  id             String       @id @default(cuid())
  screenConfigId String
  category       String       // "led", "structure", "install", "power"
  cost           Decimal      // Cost basis
  margin         Decimal      // Margin percentage
  price          Decimal      // Calculated selling price
}
```

### Key Enums

```prisma
enum CalculationMode {
  MIRROR        // Excel → PDF, no math
  INTELLIGENCE  // Build from scratch with calculations
  ESTIMATE      // ROM/detailed estimation
}

enum ProposalStatus {
  DRAFT
  PENDING_VERIFICATION
  AUDIT
  APPROVED
  SHARED
  SIGNED        // IMMUTABLE
  CLOSED        // IMMUTABLE
  ARCHIVED
  CANCELLED
}

enum DocumentMode {
  BUDGET
  PROPOSAL
  LOI
}
```

---

## Excel Processing

### Import Pipeline (Mirror Mode)

**Entry**: [`services/proposal/server/excelImportService.ts`](services/proposal/server/excelImportService.ts)

```typescript
export async function parseANCExcel(buffer: Buffer, fileName?: string): Promise<ParsedANCProposal>
```

**Steps**:
1. **Sheet Detection**:
   - Primary: `findLedOrCostSheet()` — fuzzy match "LED Sheet", "LED Cost Sheet"
   - Secondary: `findMarginAnalysisSheet()` — fuzzy match "Margin Analysis"

2. **Header Detection** (robust, handles column shifts):
   ```typescript
   const findCol = (regex: RegExp) => headers.findIndex(h => regex.test((h ?? "").toString().trim()));
   const detectedName     = findCol(/^(display\s*name|display|option|screen\s*name)$/i);
   const detectedPitch    = findCol(/^(mm\s*pitch|pixel\s*pitch|pitch)$/i);
   const detectedSell     = findCol(/^(sell\s*price|selling\s*price|total\s*price)$/i);
   ```

3. **Row Parsing**:
   - Iterate rows, extract screen configs
   - Handle alternate rows (marked with "Alt" or "Alternate")
   - Compute verification manifest

4. **Validation**:
   - Generate `VerificationManifest` for audit
   - Detect exceptions (missing data, math errors)
   - Store `sourceWorkbookHash` (SHA-256)

### Export Pipeline (Audit Excel)

**Entry**: [`services/proposal/server/exportFormulaicExcel.ts`](services/proposal/server/exportFormulaicExcel.ts)

```typescript
export async function generateAuditExcel(screens: any[], options?: AuditExcelOptions): Promise<ExcelJS.Workbook>
```

**Features**:
- **Live formulas**: `=Cost / (1 - MarginCell)`, `=SellingPrice * BondRate`
- **Yellow highlighting** for input cells
- **Multiple sheets**: Margin Analysis, LED Cost Sheet, Install, PM, Electrical

**Formula Pattern**:
```typescript
// Selling Price formula (row 5, margin in C2)
cell.value = { formula: `C5/(1-$C$2)` };

// Bond formula (bond rate in C3)
cell.value = { formula: `D5*$C$3` };
```

---

## Pricing Logic Deep Dive

### The Divisor Model (Critical)

**CORRECT** (Natalia Math):
```typescript
sellPrice = cost / (1 - marginPercent);
// Example: $100 cost at 20% margin = $100 / 0.8 = $125
```

**WRONG** (Markup — DO NOT USE):
```typescript
sellPrice = cost * (1 + marginPercent);  // This gives $120, not $125
```

### Round-Then-Sum Invariant

From [`lib/pricingMath.ts`](lib/pricingMath.ts):

```typescript
const DISPLAY_SCALE = 10 ** CURRENCY_FORMAT.decimals;  // 1 when decimals=0

export function roundToDisplay(value: number): number {
    return Math.round(value * DISPLAY_SCALE) / DISPLAY_SCALE;
}

export function computeRenderedTableTotals(table: PricingTable, ...): RenderedTableTotals {
    // 1. Round each item price
    const items = table.items.map(item => ({
        price: roundToDisplay(item.price),
        // ...
    }));
    
    // 2. Sum rounded values
    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    
    // 3. Round tax and bond
    const tax = roundToDisplay(subtotal * derivedTaxRate);
    const bond = roundToDisplay(subtotal * bondRate);
    
    // 4. Grand total = sum of rounded components
    const grandTotal = subtotal + tax + bond;
    
    return { items, subtotal, tax, bond, grandTotal };
}
```

### Rate Card System

From [`services/rfp/rateCardLoader.ts`](services/rfp/rateCardLoader.ts):

```typescript
// DB-first with hardcoded fallback
const HARDCODED_DEFAULTS: Record<string, number> = {
    "margin.led_hardware": 0.30,
    "margin.services_default": 0.20,
    "bond_tax.bond_rate": 0.015,
    "bond_tax.default_sales_tax": 0.095,
    // ...
};

export async function getRate(key: string): Promise<number> {
    // 1. Check cache (30s TTL)
    if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
        const cached = _cache.get(key);
        if (cached) return cached.value;
    }
    
    // 2. Load from DB
    const dbEntry = await prisma.rateCardEntry.findUnique({ where: { key } });
    if (dbEntry) return dbEntry.value;
    
    // 3. Fallback to hardcoded
    return HARDCODED_DEFAULTS[key] ?? 0;
}
```

### Venue-Specific Rules

From [`lib/estimator.ts`](lib/estimator.ts):

```typescript
export const VENUE_CONSTRAINTS = {
  [Venue.STADIUM]: {
    liquidatedDamages: "$2,500/day + $150,000 per home football game",
    weightLimitLbs: 60000,
  },
  [Venue.COLISEUM]: {
    liquidatedDamages: "$5,000/day + $150,000 per home basketball game",
    weightLimitLbs: 60000,
  },
};

// Morgantown B&O Tax (2%) triggers for WVU venues
function shouldApplyMorgantownBoTax(input?: { projectAddress?: string; venue?: string }) {
  const haystack = `${input?.projectAddress ?? ""} ${input?.venue ?? ""}`.toLowerCase();
  return haystack.includes("morgantown") || haystack.includes("wvu") || haystack.includes("milan puskar");
}
```

---

## PDF Generation

### Template System

**Primary Template**: [`app/components/templates/proposal-pdf/ProposalTemplate5.tsx`](app/components/templates/proposal-pdf/ProposalTemplate5.tsx)

**Sections**:
- `PdfHeader`: Logo, client info, proposal number
- `PdfProjectSummary`: Intro text, venue details
- `PdfPricingTables`: Line items with totals
- `PdfSpecsTable`: Technical specifications (Exhibit A)
- `PdfResponsibilityMatrix`: Scope ownership matrix
- `PdfSignatureBlock`: E-signature area

### Generation Pipeline

**Entry**: [`services/proposal/server/generateProposalPdfService.ts`](services/proposal/server/generateProposalPdfService.ts)

```typescript
export async function generateProposalPdf(proposalId: string): Promise<Buffer>
```

**Flow**:
1. Load proposal from DB
2. Render React template to HTML
3. Send to Browserless (headless Chrome)
4. Return PDF buffer

**Browserless Config**:
- Internal Docker URL first, WSS external fallback
- Timeout: 300-600s for large proposals
- Uses `@sparticuz/chromium` for Lambda compatibility

---

## State Management

### React Contexts

| Context | Purpose | Location |
|---------|---------|----------|
| `ProposalContext` | Main proposal state (119KB) | [`contexts/ProposalContext.tsx`](contexts/ProposalContext.tsx) |
| `ChargesContext` | Line items, pricing | [`contexts/ChargesContext.tsx`](contexts/ChargesContext.tsx) |
| `SignatureContext` | E-signature state | [`contexts/SignatureContext.tsx`](contexts/SignatureContext.tsx) |

### Auto-Save Pattern

```typescript
// 2-second debounced save
import { useDebouncedSave } from "@/hooks/useDebouncedSave";
useDebouncedSave(proposalData, 2000);
```

### Proposal Lifecycle State Machine

```
DRAFT → PENDING_VERIFICATION → AUDIT → APPROVED → SHARED → SIGNED → CLOSED
                                                        ↓
                                                    isLocked = true
                                                    documentHash = SHA-256
```

---

## API Routes

### Key Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/proposals/generate` | POST | Generate PDF via Browserless |
| `/api/proposals/save` | POST | Auto-save proposal data |
| `/api/rfp/analyze` | POST | Full RFP analysis (SSE streaming) |
| `/api/rfp/pipeline/extraction-excel` | POST | Export specs as .xlsx |
| `/api/rfp/pipeline/subcontractor-excel` | POST | Generate bid request Excel |
| `/api/rfp/pipeline/import-quote` | POST | Import subcontractor response |
| `/api/rfp/pipeline/rate-card-excel` | POST | 3-sheet rate card Excel |
| `/api/rfp/pipeline/scoping-workbook` | POST | 10+ sheet scoping workbook |
| `/api/chat/kimi` | POST | AI chat endpoint |

### SSE Streaming (RFP Analysis)

```typescript
// Server-Sent Events for long-running analysis
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stage: "ocr", percent: 10 })}\n\n`));
    // ... progress updates
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stage: "complete", result })}\n\n`));
    controller.close();
  }
});
return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
```

---

## Environment Variables

Set in EasyPanel dashboard (NOT .env file):

```
DATABASE_URL           — PostgreSQL connection string
AUTH_SECRET            — NextAuth secret (REQUIRED in auth.ts AND auth-middleware.ts)
ANYTHING_LLM_URL       — https://basheer-anything-llm.prd42b.easypanel.host
ANYTHING_LLM_KEY       — API key
BROWSERLESS_URL        — Internal Docker URL
MISTRAL_API_KEY        — Mistral OCR API key
GEMINI_API_KEY         — Gemini 2.0 Flash API key
NEXT_PUBLIC_BASE_URL   — App base URL
SENTRY_DSN             — Error tracking
```
