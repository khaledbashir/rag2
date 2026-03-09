# ANC Proposal Engine — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 15.3 App Router                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Frontend (React 18)                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │   Wizard     │  │   Tables     │  │   PDF     │ │   │
│  │  │   (5 steps)  │  │   (AG Grid)  │  │   Preview │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              API Routes (/app/api/)                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │   │
│  │  │   Auth   │ │  Upload  │ │  Export  │ │  RAG   │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Services Layer                    │   │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────┐ │   │
│  │  │  Parser  │ │  Proposal  │ │   PDF    │ │ LLM   │ │   │
│  │  └──────────┘ └───────────┘ └──────────┘ └───────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Two Parsing Paths

### Mirror Mode (pricingTableParser.ts)
- **Purpose**: Exact Excel reproduction
- **Rule**: NO MATH, preserve values exactly
- **Input**: Excel (.xlsx, .xls)
- **Output**: Tables with exact rows, columns, totals from Excel
- **Usage**: 70-75% — Natalia's workflow

### Intelligence Mode (excelImportService.ts)
- **Purpose**: Build quotes from scratch
- **Rule**: Recalculate everything (cost + margin formula)
- **Input**: Excel with cost data OR manual product catalog
- **Output**: Computed prices, margins, subtotals
- **Usage**: 25-30% — Matt/Jeremy workflow

## Key Services

| Service | Location | Purpose |
|---------|----------|---------|
| `pricingTableParser.ts` | `services/pricing/` | Mirror Mode parser, exact fidelity |
| `excelImportService.ts` | `services/proposal/` | Intelligence Mode import |
| `generateProposalPdfService.ts` | `services/proposal/server/` | PDF generation via Browserless |
| `AnythingLLMService.ts` | `services/` | RAG backend integration |

## Wizard Steps (Mirror Mode)

1. **Upload** → Excel file → `pricingTableParser.ts`
2. **Configure** → Document type (Budget/Proposal/LOI), intro, notes
3. **Review** → Preview PDF, export settings
4. **Export** → Generate PDF, save snapshot

## Edge Middleware

- **File**: `middleware.ts` (Edge runtime)
- **Auth**: `auth-middleware.ts` → NextAuth v5
- **Purpose**: Protect routes, check session on every request
- **Quirk**: Must set `secret: process.env.AUTH_SECRET` explicitly in Docker

## State Management

| Context | Location | Scope |
|---------|----------|-------|
| `ProposalContext` | `contexts/ProposalContext.tsx` | Full proposal state (119KB) |
| `ChargesContext` | `contexts/ChargesContext.tsx` | Charges, taxes, bonds |
| `SignatureContext` | `contexts/SignatureContext.tsx` | Digital signatures |

## Database (Prisma + PostgreSQL)

| Model | Purpose |
|-------|---------|
| `User` | Auth credentials, admin access |
| `Proposal` | Saved proposals, snapshots |
| `ChangeRequest` | Client feedback on shared links |
| `Product` | Phase B — product catalog database |

## External Integrations

| Service | Purpose |
|---------|---------|
| Browserless | Headless Chrome for PDF generation |
| AnythingLLM | RAG backend for AI chat (Phase D) |
| Kimi K2.5 (via Puter.js) | Free AI inference for copilot chat |
| Sentry | Error tracking & performance monitoring |
| nodemailer | Email notifications |

## Deployment

| Environment | URL | Platform |
|-------------|-----|----------|
| Local dev | `localhost:3003` | `pnpm dev` |
| Production | `proposals.anc.com` | EasyPanel (Docker) |
| Staging | PLANNED | Separate EasyPanel service |

## Authentication

- **Provider**: NextAuth v5 (Credentials)
- **Storage**: PrismaAdapter (PostgreSQL)
- **Session Strategy**: JWT (30-day maxAge)
- **Secret**: `AUTH_SECRET` env var (required in Docker)
- **Middleware**: Edge runtime, runs on every request

## PDF Generation Flow

```
ProposalSnapshot → generateProposalPdfService → Browserless (Puppeteer)
                     ↓
               Internal Docker URL first
                     ↓
               External WSS fallback
                     ↓
               PDF → Save to disk → Email/upload response
```

## Share System

```
Proposal → Create Snapshot → Generate hash link → /share/[hash]
                                                      ↓
                                              Client views sanitized preview
                                                      ↓
                                          ChangeRequestForm → feedback
                                                      ↓
                                           Resolved in Step4Export
```