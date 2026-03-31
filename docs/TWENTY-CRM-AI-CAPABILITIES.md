# Twenty CRM: AI, Automation & Integration — Technical Research

> Comprehensive research document covering Twenty CRM's AI agent capabilities, workflow automation, integrations, and customization options.
> Researched: 2026-03-30

---

## Table of Contents

1. [AI Features (Built-in)](#1-ai-features-built-in)
2. [MCP Server (AI Assistant Integration)](#2-mcp-server-ai-assistant-integration)
3. [Workflow Automation](#3-workflow-automation)
4. [Webhooks](#4-webhooks)
5. [API (REST + GraphQL)](#5-api-rest--graphql)
6. [Custom Objects & Metadata](#6-custom-objects--metadata)
7. [Email Integration](#7-email-integration)
8. [Calendar Integration](#8-calendar-integration)
9. [Slack Integration](#9-slack-integration)
10. [n8n / Zapier Integration](#10-n8n--zapier-integration)
11. [Self-Hosted Docker Deployment](#11-self-hosted-docker-deployment)
12. [Twenty vs Salesforce](#12-twenty-vs-salesforce)
13. [Roadmap & Maturity Assessment](#13-roadmap--maturity-assessment)
14. [Implications for ANC](#14-implications-for-anc)

---

## 1. AI Features (Built-in)

### Current State: Pre-Release / Coming Soon

Twenty treats AI as a dedicated product module with two directions:

**A) AI Chatbot (Natural Language CRM Queries)**
- Query records, relationships, and metrics in plain English
- Examples: "Which opportunities are linked to this company?", "What's our pipeline value?", "Find contacts I haven't followed up with in 30 days"
- Context-aware follow-up questions
- Status: Pre-release, available behind feature flag `IS_AI_ENABLED`

**B) AI Agent (Workflow Action)**
- Listed as a workflow action node — marked "Coming Soon" in docs
- Intended capabilities: data analysis, classification, text generation, decision-making
- Will consume workflow credits based on AI model used
- Respects role-based permissions (Settings > Roles)
- Use cases planned: lead scoring, data cleanup, email drafting, record assignment, record classification

### AI Capabilities Summary

| Capability | Status | Notes |
|---|---|---|
| Natural language CRM queries | Pre-release | Behind feature flag |
| Sales insights generation | Pre-release | |
| Data enrichment | Pre-release | |
| Record classification | Pre-release | |
| Content summarization | Pre-release | |
| AI Agent workflow action | Coming Soon | Listed in workflow docs, not yet GA |
| Custom AI skills | Not yet | Roadmap item |

### Key Takeaway
AI features exist in concept and early implementation but are NOT production-ready as of March 2026. The AI Agent workflow action is documented but marked "Coming Soon." Self-hosted deployments need to enable `IS_AI_ENABLED` feature flag and likely configure an LLM API key.

---

## 2. MCP Server (AI Assistant Integration)

### Status: Shipped (MVP, as of ~September 2025)

Twenty has an official MCP (Model Context Protocol) server that exposes CRM data to AI assistants like Claude.

**Architecture:**
- Built with `@modelcontextprotocol/sdk` (TypeScript)
- Hybrid GraphQL + REST API integration
- Multi-tenant workspace support
- Docker containerization with DXT packaging

**Exposed Tools:**
| Tool Category | Capabilities |
|---|---|
| CRUD Operations | Create, read, update, delete all record types |
| Search | Query and filter across all CRM objects |
| Workflow Execution | Trigger and manage CRM workflows |
| AI Agent | Access Twenty's AI features through MCP |

**Configuration:**
- Available in Twenty UI: Settings > Integrations
- Environment variables: `TWENTY_API_URL`, `TWENTY_API_KEY`
- Primarily tested with Claude Desktop

**Proven Use Case:** "Create a company and an opportunity based on the following call transcript" — demonstrated working by Twenty team.

### Key Takeaway
This is the most mature AI integration path. Claude (or any MCP client) can directly read/write CRM data. This is how we would build ANC's AI-powered CRM interactions.

---

## 3. Workflow Automation

### Status: Production-Ready (GA since v1.7+)

Twenty has a built-in visual workflow builder with triggers, actions, and flow control.

### Triggers (4 types)

| Trigger | Description | Notes |
|---|---|---|
| Record Event | Fires on record created, updated, or deleted | Any object type |
| Schedule | Runs on cron (daily, weekly, custom) | |
| Manual | User clicks "Run" in the UI | Supports bulk record selection |
| Webhook | External system sends HTTP POST | Receives external events |

### Actions (12 types)

| Action | Description | Limitations |
|---|---|---|
| **Create Record** | Insert new record in any object | Populate from prior steps or manual input |
| **Update Record** | Modify existing record | Cannot search — must know record ID or use Search first |
| **Delete Record** | Remove a record | Deleted data still available in subsequent steps |
| **Search Records** | Find records with filters, sort, limit | Max 200 records returned |
| **Upsert Record** | Create-or-update by matching criteria | Match on email, domain, ID, or unique fields |
| **Iterator** | Loop through array of records | Full sub-workflow per iteration |
| **Filter** | Conditional gate (if/else) | Does not return data, just gates flow |
| **Delay** | Wait by duration or until a date/time | No max duration limit |
| **Send Email** | Send from connected mailbox | Single recipient only, no HTML signatures, no sequences |
| **Form** | Collect user input during execution | Manual triggers only, fields cannot be required |
| **Code** | Execute custom JavaScript | API keys must be hardcoded in function body |
| **HTTP Request** | Call external API | GET/POST/PUT/PATCH/DELETE, custom headers |
| **AI Agent** | Intelligent task execution | COMING SOON — not yet available |

### Code Node Details
- Executes arbitrary JavaScript
- Can access variables from all prior steps
- External API keys must be inlined (no env var support in code nodes)
- Arrays from external sources may arrive as strings — needs manual parsing
- Runs server-side; in self-hosted, worker and server must share localStorage (or use S3)

### Key Takeaway
The workflow builder is functional and covers the ANC use cases in TWENTY-CRM-PLAN.md Phase 3 (New RFP Alert, Warranty Expiring, Deal Won, Stale Deal Alert). The Code node and HTTP Request node are key for Proposal Engine integration.

---

## 4. Webhooks

### Status: Production-Ready

**Setup:** Settings > APIs & Webhooks > Create webhook > Enter URL > Activates immediately

### Events

| Event Type | Examples |
|---|---|
| Record Created | `person.created`, `company.created`, `opportunity.created`, `note.created` |
| Record Updated | `person.updated`, `company.updated`, `opportunity.updated` |
| Record Deleted | `person.deleted`, `company.deleted` |

**Note:** All events go to the same webhook URL. Event filtering (subscribe to specific events) may be added in future releases.

### Payload Structure

```json
{
  "event": "opportunity.created",
  "data": { /* complete record object with all attributes */ },
  "timestamp": "2026-03-30T12:00:00Z"
}
```

### Security

| Header | Purpose |
|---|---|
| `X-Twenty-Webhook-Signature` | HMAC SHA256 of (timestamp + payload body) |
| `X-Twenty-Webhook-Timestamp` | Request timestamp |

**Validation:** Reconstruct signature by concatenating timestamp + JSON body, compute HMAC SHA256 with webhook secret, compare using timing-safe comparison.

### Acknowledgment
- Must respond with 2xx (200-299) to acknowledge
- Retry policy: Not documented (unknown behavior on failure)

### Key Takeaway
Webhooks work for pushing Twenty events to the Proposal Engine (e.g., "new opportunity created, go analyze the RFP"). The lack of event filtering means your receiver needs to check event type and ignore irrelevant ones.

---

## 5. API (REST + GraphQL)

### Status: Production-Ready

**Authentication:** Bearer token in header
```
Authorization: Bearer YOUR_API_KEY
```
API keys created in Settings > APIs & Webhooks. Key shown once on creation.

### Endpoints

| API | Base Path | Purpose |
|---|---|---|
| Core (REST) | `/rest/` | CRUD on records |
| Core (GraphQL) | `/graphql/` | CRUD + relationship queries in single call |
| Metadata (REST) | `/rest/metadata/` | Manage schema, objects, fields |
| Metadata (GraphQL) | `/metadata/` | Same via GraphQL |

| Environment | Base URL |
|---|---|
| Cloud | `https://api.twenty.com/` |
| Self-Hosted | `https://{your-domain}/` |

### Rate Limits & Batch Operations

| Constraint | Value |
|---|---|
| Rate limit | 100 calls/minute |
| Batch size | Up to 60 records/request |
| GraphQL batch | Plural endpoints (e.g., `CreateCompanies`) |

### REST Endpoints (Core Objects)

- `/rest/companies` — Companies
- `/rest/people` — People/Contacts
- `/rest/opportunities` — Deals
- `/rest/notes` — Notes
- `/rest/tasks` — Tasks
- `/rest/activities` — Activity timeline

### Metadata Endpoints

- `GET /rest/metadata/objects` — List all object types
- `GET /rest/metadata/objects/{objectName}` — Specific object schema
- `GET /rest/metadata/picklists` — Dropdown field options

### Developer Tools
- Interactive API playground in Settings > APIs & Webhooks
- Autocomplete, live testing, workspace-specific schema docs
- Role-based API key permissions

### Key Takeaway
The API is well-structured and production-ready. 100 calls/min is sufficient for ANC's volume. Both REST and GraphQL are available, with GraphQL being more efficient for relationship queries (e.g., get company + all opportunities in one call).

---

## 6. Custom Objects & Metadata

### Status: Production-Ready

Twenty uses a metadata-driven architecture:

**Core Tables:**
- `DataSource` — Where the data lives
- `Object` — Describes the object, links to DataSource
- `Field` — Describes fields on an Object

**Creation Flow:**
1. Query `/metadata` API to create object definition
2. Twenty updates metadata tables
3. GraphQL schema is recomputed and cached
4. New object is immediately queryable via `/graphql/` and `/rest/`

**Schema Generation:**
- `type.factory` translates field metadata into GraphQL types via `TypeMapperService`
- `type-definition.factory` creates GraphQL input/output objects from `objectMetadata`
- Schema is cached in a GQL cache for performance

**Supported Operations:**
- Create custom objects with any fields
- Define relations between custom and standard objects
- Custom objects appear in the same API as standard objects
- Full CRUD, search, and workflow support for custom objects

### Key Takeaway
This is how we build ANC-specific objects (rfpAnalysis, serviceContract, etc.) programmatically. The metadata API makes it possible to script the entire schema setup.

---

## 7. Email Integration

### Status: Production-Ready (with caveats)

**Supported Providers:**

| Provider | Protocol | Status |
|---|---|---|
| Gmail | OAuth | GA — requires self-created OAuth credentials |
| Microsoft 365 / Outlook | OAuth | GA — requires M365 license with Calendar + Messaging API |
| IMAP/SMTP | Direct | Beta — generic email provider support |

**Setup (Self-Hosted):**
1. Create OAuth credentials (Google Cloud Console / Azure AD)
2. Add credentials in Settings > Admin Panel > Config Variables
3. Providers only appear once valid credentials are configured
4. Start background sync jobs (worker process)

**Capabilities:**
- Bi-directional email sync
- Granular folder/label selection (v1.12+): choose which Gmail labels or Outlook folders to sync
- Emails appear on contact/company timelines
- Send emails from workflows (single recipient, no HTML signatures)

**Known Issues:**
- Missing OAuth scope in official docs caused widespread debugging
- Calendar events may not load despite successful connection
- IMAP sync has reported reliability issues in self-hosted setups

### Key Takeaway
Email sync works for Google and Microsoft but requires OAuth credential setup on the self-hosted instance. The Send Email workflow action is limited (single recipient, no sequences). For bulk/template emails, use an external service via HTTP Request or n8n.

---

## 8. Calendar Integration

### Status: Early / Beta

**Supported:**
- Google Calendar (via Google OAuth, same as email)
- Microsoft 365 Calendar (requires M365 license)
- CalDAV (IMAP/SMTP provider path)

**Capabilities:**
- Calendar events sync to Twenty
- Events appear on contact timelines
- CalDAV creates contacts for event attendees

**Known Issues:**
- Calendar events may not load despite successful OAuth connection
- Less mature than email sync
- No calendar creation/management from within Twenty

### Key Takeaway
Calendar sync exists but is less reliable than email. Not critical for ANC's initial use case — CRM pipeline tracking does not require calendar integration.

---

## 9. Slack Integration

### Status: Planned / Partial

- Twenty lists Slack as an integration on their website
- Real-time notifications to Slack channels mentioned as a capability
- The primary integration path today is via **webhooks + n8n/Zapier** rather than a native Slack app

**Practical approach for ANC:**
1. Twenty webhook fires on events (opportunity created, deal won, etc.)
2. n8n or Zapier receives the webhook
3. Sends formatted message to the appropriate Slack channel

### Key Takeaway
No native Slack app yet. Use webhooks + n8n as the integration layer. This is already documented in community templates.

---

## 10. n8n / Zapier Integration

### n8n

| Component | Status | Notes |
|---|---|---|
| Community Node | Beta | `n8n-nodes-twenty` — likely to break with Twenty API changes |
| HTTP Request | Stable | Use Twenty API directly via n8n HTTP Request module |
| Webhook trigger | Stable | Twenty fires webhooks, n8n receives them |

**Community Resources:**
- [n8n-nodes-twenty](https://github.com/shodgson/n8n-nodes-twenty) — community node
- [n8n-nodes-twenty-dynamic](https://github.com/Logrui/n8n-nodes-twenty-dynamic) — supports custom objects
- Published workflow templates on n8n.io for Twenty + Google Sheets, selective messaging, activity tracking

### Zapier

| Component | Status | Notes |
|---|---|---|
| Triggers | GA | Record created, updated, deleted, destroyed |
| Actions | GA | Create, update, delete records |
| Setup | Functional | Requires API key entry (not OAuth) |

**Zapier URL:** https://zapier.com/apps/twenty/integrations

### Key Takeaway
n8n is the better choice for self-hosted ANC (both Twenty and n8n can run on the same VPS). The community node works but the HTTP Request approach via Twenty's API is more stable. Zapier works but is a paid SaaS dependency.

---

## 11. Self-Hosted Docker Deployment

### Status: Production-Ready

**Docker Image:** `twentycrm/twenty` on Docker Hub

**Architecture:**
- Server (Next.js/Node.js API + UI)
- Worker (background jobs: email sync, workflow execution, cron tasks)
- PostgreSQL database
- Redis (optional, for caching)

**Key Configuration:**

| Setting | Notes |
|---|---|
| Single-workspace mode | Default — one CRM instance per deployment |
| Multi-workspace mode | SaaS-like, multiple teams on same instance |
| S3 storage | Required for worker to access serverless function code files |
| OAuth credentials | Must be configured for email/calendar sync |
| `IS_AI_ENABLED` | Feature flag for AI capabilities |

**EasyPanel:** Twenty has an official EasyPanel template at https://easypanel.io/docs/templates/twenty — one-click deploy.

**Critical Self-Hosted Caveat:** Worker and server must share the same localStorage/storage backend. If they don't, workflows with Code steps will fail because the worker can't access the code files. Use S3-compatible storage (MinIO, etc.) for production.

### Key Takeaway
EasyPanel template exists — same platform ANC already uses. The S3 requirement for Code workflow steps is important to note for infrastructure planning.

---

## 12. Twenty vs Salesforce

| Feature | Twenty | Salesforce |
|---|---|---|
| **Pricing** | Free (self-hosted) | $25-500/user/month |
| **Custom Objects** | Yes (metadata API) | Yes (Setup UI + API) |
| **Workflow Automation** | Built-in visual builder | Flow Builder (more mature) |
| **AI** | Pre-release (chatbot + agent) | Einstein AI + Agentforce (mature) |
| **Email Sync** | Gmail, Outlook, IMAP | Gmail, Outlook, Exchange (mature) |
| **AppExchange / Marketplace** | None | 7,000+ apps |
| **API** | REST + GraphQL | REST + SOAP + Bulk + Streaming |
| **Reporting** | Basic dashboards | Advanced (territories, forecasting, CPQ) |
| **Multi-Currency** | Not supported | Supported |
| **Self-Hosting** | Yes | No (managed only) |
| **Open Source** | Yes (AGPL-3.0) | No |
| **MCP Integration** | Official server shipped | Third-party only |
| **Integration Approach** | API + webhooks + n8n/Zapier | AppExchange + certified partners |

**What Twenty lacks vs Salesforce:**
- Advanced reporting, forecasting, territory management
- CPQ (configure-price-quote)
- Multi-currency
- AppExchange marketplace
- Enterprise SSO (SAML/SCIM) maturity
- Pre-built connectors to hundreds of tools

**What Twenty has that Salesforce doesn't:**
- Self-hosting / data sovereignty
- Open source (fork and customize anything)
- Official MCP server for AI assistants
- No per-user licensing fees
- GraphQL API (Salesforce has none)
- Modern React UI that developers can extend

---

## 13. Roadmap & Maturity Assessment

### Feature Maturity Matrix

| Feature | Maturity | Production-Ready? |
|---|---|---|
| Core CRM (companies, people, opportunities) | Mature | Yes |
| Custom Objects | Mature | Yes |
| REST + GraphQL API | Mature | Yes |
| Webhooks | Mature | Yes |
| Workflow Builder (triggers, actions) | Stable | Yes |
| Workflow Code Node | Stable | Yes (needs S3 for self-hosted) |
| Email Sync (Gmail/Outlook) | Stable | Yes (with OAuth setup) |
| MCP Server | Shipped MVP | Yes (for AI assistant integration) |
| Calendar Sync | Beta | Partial (reliability issues) |
| IMAP Email | Beta | Partial |
| Slack Integration | Planned | No (use webhooks + n8n) |
| AI Chatbot | Pre-release | No (behind feature flag) |
| AI Agent Workflow Action | Coming Soon | No |
| Custom AI Skills | Roadmap | No |
| AppExchange/Marketplace | Not planned | No |

### Active Development Areas (from release notes through Dec 2025)
- Workflow improvements (iterator, bulk select, stop button)
- Granular email folder sync
- Morph-many relationships
- Record trigger enhancements
- MCP server improvements

---

## 14. Implications for ANC

### What works TODAY for ANC's CRM plan:

1. **Core CRM + Custom Fields** — All objects and fields in TWENTY-CRM-PLAN.md can be created now
2. **Pipeline Stages** — Opportunity stages (Technology, Service, Media) work with existing SELECT fields
3. **Workflow Automation** — All 5 planned workflows (New RFP Alert, Warranty Expiring, Deal Won, Stale Deal, Proposal Engine Integration) can be built with existing triggers + actions
4. **Proposal Engine Integration** — HTTP Request action + webhooks enable bi-directional sync
5. **API for Bulk Operations** — REST API at 100 calls/min covers seed data import and ongoing sync
6. **Saved Views** — All planned views (Active Bids, NFL Venues, Expiring Warranties) work now
7. **EasyPanel Deployment** — Official template, same platform ANC already uses

### What needs workarounds:

| Need | Workaround |
|---|---|
| Slack notifications | Webhook > n8n > Slack (not native) |
| Bulk email to clients | Use external service via HTTP Request |
| AI-powered queries | Use MCP server with Claude (not native chatbot) |
| Calendar integration | Skip for now, not critical for pipeline tracking |

### What's NOT available yet:

| Feature | Timeline | Impact on ANC |
|---|---|---|
| AI Agent workflow action | Unknown (marked "Coming Soon") | Low — MCP + external AI covers this |
| Native Slack app | Unknown | Low — n8n workaround is fine |
| Custom AI Skills in Twenty | Unknown | Low — build skills externally with MCP |
| AppExchange / marketplace | Not planned | None — ANC builds custom |

### Recommended Architecture for ANC

```
[Proposal Engine] --webhook--> [Twenty CRM] --webhook--> [n8n]
                                     |                       |
                                     |                       +--> Slack notifications
                                     |                       +--> Email alerts
                                     |                       +--> Google Sheets sync
                                     |
                              [Claude via MCP]
                                     |
                              "What NFL deals are in scoping?"
                              "Create opportunity from this transcript"
                              "Summarize pipeline by region"
```

### Bottom Line

Twenty CRM is production-ready for ANC's core needs (CRM data, pipeline, workflows, API integration). AI features are nascent but the MCP server provides a mature path to AI-powered CRM interactions via Claude. The workflow builder handles all planned automations. Self-hosted on EasyPanel with the same infrastructure ANC already runs.

---

## Sources

- [Twenty Documentation - Webhooks](https://docs.twenty.com/developers/extend/capabilities/webhooks)
- [Twenty Documentation - Workflow Actions](https://docs.twenty.com/user-guide/workflows/capabilities/workflow-actions)
- [Twenty Documentation - Workflows Overview](https://docs.twenty.com/user-guide/workflows/overview)
- [Twenty Documentation - APIs](https://docs.twenty.com/developers/extend/capabilities/apis)
- [Twenty Documentation - Self-Host Setup](https://docs.twenty.com/developers/self-host/capabilities/setup)
- [Twenty Documentation - Custom Objects](https://docs.twenty.com/developers/backend-development/custom-objects)
- [Twenty Releases](https://twenty.com/releases)
- [Twenty MCP Server Issue #12953](https://github.com/twentyhq/twenty/issues/12953)
- [Twenty GitHub Repository](https://github.com/twentyhq/twenty)
- [Twenty EasyPanel Template](https://easypanel.io/docs/templates/twenty)
- [n8n-nodes-twenty Community Node](https://github.com/shodgson/n8n-nodes-twenty)
- [Twenty Zapier Integration](https://zapier.com/apps/twenty/integrations)
- [Twenty Email Guide](https://twenty.com/user-guide/section/integrations/emails)
- [NocoBase vs Twenty vs Krayin AI Comparison](https://www.nocobase.com/en/blog/best-ai-crm-open-source-nocobase-twenty-krayin)
- [n8n Twenty Event-Based Workflow Template](https://n8n.io/workflows/2509-twentycrm-event-based-updates-on-selective-messaging-channels-with-logs/)
