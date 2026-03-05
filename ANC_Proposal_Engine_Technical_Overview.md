# ANC Proposal Engine — Technical Overview

**Prepared for:** ANC Sports Enterprises, LLC  
**Prepared by:** Ahmad Basheer — Independent Solutions Architect  
**Date:** March 5, 2026

---

## 1. Platform Overview

The ANC Proposal Engine is a web-based application that automates the creation of LED display proposals for sports venues. It replaces manual Excel-based workflows with an intelligent system that can:

- **Parse RFP documents** (PDF, Excel, Word) and extract display specifications automatically
- **Generate pricing proposals** with live formula calculations across multiple sheets
- **Export professional PDFs** and Excel workbooks matching ANC's established formats
- **Mirror existing budget documents** — upload a client's Excel and reproduce it with editable values

The platform serves two primary workflows:
- **Mirror Mode** (Natalia): Upload an existing Excel budget, edit values, and export a matching proposal
- **Intelligence Mode** (Jeremy/Matt/Eric): Start from an RFP, auto-extract specs, and generate a complete proposal

**Production URL:** `https://basheer-therag2.prd42b.easypanel.host`

---

## 2. Architecture

The application is built on a modern, industry-standard web stack:

| Component | Technology | Version |
|-----------|------------|---------|
| Frontend Framework | Next.js (React) | 15.3.3 |
| UI Library | React | 18.2.0 |
| Runtime | Node.js | 22.x |
| Database | PostgreSQL | Latest (managed) |
| ORM | Prisma | 5.22.0 |
| Language | TypeScript | 5.2.2 |
| Styling | Tailwind CSS | 3.3.5 |

**Architecture Diagram:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                              │
│                   (React + Tailwind UI)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NEXT.JS SERVER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   API Routes │  │  PDF Export  │  │ Excel Export │          │
│  │  (REST/JSON) │  │ (Puppeteer)  │  │  (ExcelJS)   │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────┐           │
│  │              PRISMA ORM                          │           │
│  └──────────────────────┬───────────────────────────┘           │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                           │
│              (Proposals, Users, Settings)                         │
└─────────────────────────────────────────────────────────────────┘
```

**External Services (connected via API):**
- AnythingLLM — AI/RAG for document intelligence
- Browserless — Headless Chrome for PDF generation
- Sentry — Error monitoring

---

## 3. Infrastructure & Hosting

### Where It Runs

The application is hosted on a **Hetzner dedicated server**, managed through **EasyPanel** (a Docker-based PaaS). The deployment consists of multiple Docker containers orchestrated by EasyPanel:

| Container | Purpose |
|-----------|---------|
| `therag2` | Main Next.js application |
| `natadb` | PostgreSQL database |
| `anything-llm` | AI/RAG service |
| `browserless` | Headless Chrome for PDFs |

### Server Specifications

- **Provider:** Hetzner (dedicated server)
- **Management:** EasyPanel with Docker containers
- **SSL:** Automatic HTTPS via Let's Encrypt
- **Region:** Germany (EU datacenter)

### What's Included in Managed Hosting ($500/month)

| Service | Description |
|---------|-------------|
| **Server Hosting** | Dedicated Hetzner server, Docker container orchestration via EasyPanel |
| **Uptime Monitoring** | 99.9% target uptime with automated health checks |
| **Security Updates** | OS patches, framework updates, dependency security fixes |
| **SSL Management** | Auto-renewed HTTPS certificates (Let's Encrypt) |
| **Daily Backups** | Automated database backups with 30-day retention |
| **Bug Fixes** | Priority response for production issues |
| **Performance Optimization** | Ongoing tuning as usage grows |
| **Support Access** | Direct Slack channel to developer |

### Ownership Boundaries

| ANC Owns | Managed by Ahmad |
|----------|---------------------|
| All project data (proposals, pricing, uploads) | Server infrastructure |
| All exported files (PDFs, Excel) | Docker container orchestration |
| Source code (via GitHub repository) | Code deployment & updates |
| User accounts & access control | Security patches & updates |
| Third-party service accounts (when transferred) | Monitoring & alerting |

---

## 4. Security

### Authentication

The application uses **Auth.js v5** (formerly NextAuth), the industry-standard authentication library for Next.js:

- **Method:** Email/password credentials with bcrypt password hashing
- **Session Strategy:** JWT tokens stored in secure HTTP-only cookies
- **Session Duration:** 30 days
- **Database Integration:** PrismaAdapter syncs users with PostgreSQL

### Role-Based Access Control (RBAC)

The platform enforces a strict permission matrix with **7 defined roles**:

| Role | Access Level |
|------|-------------|
| **ADMIN** | Full system access, workspace management, branding |
| **ESTIMATOR** | Create/edit proposals, run AI, all exports |
| **PRODUCT_EXPERT** | Technical spec validation, edit proposals |
| **PROPOSAL_LEAD** | Estimator + approval authority + delete proposals |
| **FINANCE** | View costs/margins, Internal Audit Excel only |
| **VIEWER** | Read-only access, final prices visible |
| **OUTSIDER** | Subcontractor — specs only, no pricing data |

Each role has granular permissions controlling:
- Proposal creation, editing, deletion
- Export capabilities (PDF, Excel, share links)
- Financial data visibility (costs, margins, selling prices)
- AI feature access

### Data Protection

| Protection | Implementation |
|------------|----------------|
| **HTTPS** | All traffic encrypted via TLS 1.3 |
| **Password Storage** | bcrypt hashing (industry standard) |
| **Soft Deletes** | Proposals are soft-deleted, recoverable |
| **API Security** | All routes protected by auth middleware |
| **Session Security** | JWT signed with AUTH_SECRET, HTTP-only cookies |

### Audit Trail

- All proposals track `createdByUserId`, `createdAt`, `updatedAt`
- Soft delete preserves data integrity (`deletedAt` field)
- Locked proposals (SIGNED/CLOSED status) become immutable with document hash

---

## 5. Data & Ownership

### Data Ownership

**ANC owns 100% of their data.** This includes:
- All proposals and project files
- All uploaded RFP documents (PDFs, Excel files)
- All pricing configurations and rate cards
- All user accounts and access logs
- All exported PDFs and Excel workbooks

### Database

| Property | Value |
|----------|-------|
| **Type** | PostgreSQL |
| **Location** | Dedicated Docker container on Hetzner server |
| **Access** | Via application only (no direct external access) |
| **Schema Management** | Prisma migrations |

### Backups

| Property | Value |
|----------|-------|
| **Frequency** | Daily automated backups |
| **Retention** | 30 days |
| **Location** | Stored on Hetzner server (can be configured for off-site) |
| **Restore** | Available upon request |

### Export Capability

ANC can export at any time:
- **Project Data:** Full database export (SQL or JSON)
- **Excel Files:** All generated workbooks with live formulas
- **PDFs:** All generated proposal documents
- **User Data:** Account information and access logs

---

## 6. Source Code Access

### Repository

| Property | Value |
|----------|-------|
| **Host** | GitHub (private repository) |
| **Access** | Provided upon request |
| **Maintainer** | Ahmad Basheer |

### Code Ownership

- **Full source code** available in the private GitHub repository
- **Complete commit history** preserved
- **No proprietary dependencies** — built entirely on open-source libraries
- **Standard stack** — any competent Next.js developer can maintain it

### Handover

Upon request or project completion:
- ANC receives **admin access** to the GitHub repository
- Full transfer of ownership can be executed
- All environment documentation provided
- No vendor lock-in — code is portable to any hosting provider

---

## 7. Third-Party Services

The application integrates with the following external services:

| Service | Purpose | Account Owner |
|---------|---------|---------------|
| **AnythingLLM** | AI document intelligence, RAG for RFP parsing | Ahmad (transferred to ANC on request) |
| **Browserless** | Headless Chrome for PDF generation | Ahmad (transferred to ANC on request) |
| **Serper** | Google Search API for venue lookups | Ahmad (transferred to ANC on request) |
| **Sentry** | Error monitoring and alerting | Ahmad (transferred to ANC on request) |
| **Nodemailer** | Email delivery (proposal sharing) | Configured per-deployment |

### Environment Variables

The application requires the following environment variables (values stored securely in EasyPanel):

```
DATABASE_URL          # PostgreSQL connection string
AUTH_SECRET           # Session encryption key (32+ characters)
NEXT_PUBLIC_BASE_URL  # Public URL of the application
ANYTHING_LLM_URL      # AI service endpoint
ANYTHING_LLM_KEY      # AI service API key
BROWSERLESS_URL       # PDF generation service
SERPER_API_KEY        # Search API key
NEXT_PUBLIC_SENTRY_DSN # Error monitoring (optional)
```

All sensitive values are stored in EasyPanel's encrypted environment variable storage. ANC will receive full documentation of required variables upon handover.

---

## 8. Deployment Process

### How Updates Are Deployed

```
Developer Push → GitHub → EasyPanel Auto-Build → Docker Container Update → Live
```

1. Code changes pushed to `phase2/product-database` branch
2. EasyPanel detects GitHub webhook
3. New Docker image built automatically
4. Container replaced with zero-downtime deployment
5. Health check confirms successful deployment

### Deployment Characteristics

| Property | Value |
|----------|-------|
| **Typical Deploy Time** | 2-5 minutes |
| **Downtime** | Zero (rolling update) |
| **Rollback** | Instant via Docker image revert or `git reset` |
| **Build Trigger** | Automatic on push to production branch |

### Monitoring

- **Health Endpoint:** `/api/health` returns 200 OK when healthy
- **Error Tracking:** Sentry captures all unhandled exceptions
- **Logs:** Container logs accessible via EasyPanel dashboard

---

## 9. Handover Plan (Future)

When the project is complete or upon ANC's request, the following will be transferred:

### What ANC Receives

| Item | Format |
|------|--------|
| **Source Code** | Admin access to GitHub repository |
| **Database Export** | SQL dump or Prisma migration files |
| **Environment Documentation** | Complete list of required variables |
| **Deployment Guide** | Step-by-step hosting instructions |
| **Third-Party Credentials** | API keys for all integrated services |
| **Training Materials** | Developer onboarding documentation |

### Timeline

- **Handover can be executed within 5 business days** of request
- Ahmad will assist with migration to ANC's preferred hosting
- Post-handover support available on negotiated terms

### Self-Hosting Options

ANC can choose to self-host at any point. The application is portable to:
- Any cloud provider (AWS, Azure, GCP, DigitalOcean)
- On-premises servers with Docker support
- Managed Next.js platforms (Vercel, Netlify)

Ahmad will provide migration assistance to ensure a smooth transition.

---

## 10. Monthly Managed Hosting — Value Summary

| Included | Detail | Value |
|----------|--------|-------|
| **Server Hosting** | Dedicated Hetzner server, Docker containers, EasyPanel management | Infrastructure cost covered |
| **Uptime Monitoring** | 99.9% target uptime, automated health checks | Peace of mind |
| **Security Updates** | OS patches, Node.js updates, dependency fixes | Protection against vulnerabilities |
| **SSL Management** | Auto-renewed HTTPS certificates | Secure data transmission |
| **Daily Backups** | Automated with 30-day retention | Data protection |
| **Bug Fixes** | Priority response for production issues | Minimal downtime |
| **Performance Optimization** | Ongoing tuning as usage grows | Scales with ANC |
| **Support** | Direct Slack access to developer | Fast communication |

**Total:** $500/month

---

## Contact

**Ahmad Basheer**  
Independent Solutions Architect  
ahmad@basheer.app

---

*This document was generated from the actual codebase configuration on March 5, 2026. All technical specifications reflect the current production deployment.*
