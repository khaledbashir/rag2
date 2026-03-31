# Twenty CRM Extensibility: Complete Technical Reference

> Research date: 2026-03-30
> Source: Official docs (docs.twenty.com), GitHub source (twentyhq/twenty), npm (twenty-sdk), DeepWiki

---

## Table of Contents

1. [Extension Model Overview](#1-extension-model-overview)
2. [Twenty Apps SDK](#2-twenty-apps-sdk)
3. [Custom Objects](#3-custom-objects)
4. [Custom Fields](#4-custom-fields)
5. [Logic Functions (Serverless)](#5-logic-functions-serverless)
6. [Front Components (Custom React UI)](#6-front-components-custom-react-ui)
7. [Page Layouts](#7-page-layouts)
8. [Navigation Menu Items](#8-navigation-menu-items)
9. [Views](#9-views)
10. [AI Agents & Skills](#10-ai-agents--skills)
11. [Workflow Automation](#11-workflow-automation)
12. [APIs (REST + GraphQL)](#12-apis-rest--graphql)
13. [Webhooks](#13-webhooks)
14. [Roles & Permissions](#14-roles--permissions)
15. [Infrastructure & Deployment](#15-infrastructure--deployment)
16. [Marketplace & Publishing](#16-marketplace--publishing)
17. [Integration Patterns](#17-integration-patterns)
18. [Feasibility: Embedding the Proposal Engine](#18-feasibility-embedding-the-proposal-engine)

---

## 1. Extension Model Overview

Twenty provides **three primary extension mechanisms**:

| Mechanism | What it does |
|-----------|-------------|
| **APIs** | REST + GraphQL CRUD on all objects (standard and custom) |
| **Webhooks** | Outbound real-time event notifications (record created/updated/deleted) |
| **Custom Apps** | Full code-first extension system: objects, fields, logic functions, front components, AI agents, views, nav items |

The Custom Apps system is the most powerful. It uses the `twenty-sdk` npm package with a code-first approach where you define entities using helper functions (`defineObject`, `defineLogicFunction`, `defineFrontComponent`, etc.) and the SDK syncs them to your Twenty workspace.

---

## 2. Twenty Apps SDK

### Installation

```bash
npx create-twenty-app@latest my-twenty-app     # Full scaffold with all examples
npx create-twenty-app@latest my-app --minimal   # Just core files
```

Requires: **Node.js 24+**, **Yarn 4**, Docker or local Twenty instance.

### Project Structure

```
src/
  application-config.ts          # Required: app identity + default role
  roles/default-role.ts          # Required: permission boundaries
  objects/                       # Custom data models
  fields/                        # Standalone field extensions
  logic-functions/               # HTTP routes, cron jobs, DB event handlers
    pre-install.ts               # Lifecycle: runs before install
    post-install.ts              # Lifecycle: runs after install
  front-components/              # Custom React components rendered inside Twenty UI
  page-layouts/                  # Custom record page tab layouts
  views/                         # Saved view configurations
  navigation-menu-items/         # Sidebar navigation entries
  skills/                        # AI agent knowledge/capabilities
  agents/                        # AI agent definitions
public/                          # Static assets (images, fonts)
```

### SDK Entity Helpers

| Helper | Purpose |
|--------|---------|
| `defineApplication` | App identity (name, description, default role) |
| `defineObject` | Custom data models with fields |
| `defineField` | Add fields to existing objects |
| `defineLogicFunction` | HTTP routes, cron jobs, DB event triggers |
| `definePreInstallLogicFunction` | Setup code before app install |
| `definePostInstallLogicFunction` | Setup code after app install |
| `defineFrontComponent` | Custom React components in Twenty UI |
| `definePageLayout` | Custom tabs/widgets on record detail pages |
| `defineRole` | Permission boundaries for function execution |
| `defineView` | Saved view configurations |
| `defineNavigationMenuItem` | Sidebar navigation entries |
| `defineSkill` | AI agent knowledge/instructions |
| `defineAgent` | AI agent definitions with prompts |

### CLI Commands

```bash
yarn twenty auth:login           # Authenticate with Twenty workspace
yarn twenty auth:list            # List auth profiles
yarn twenty auth:switch          # Switch workspace
yarn twenty dev                  # Dev mode: auto-sync changes to workspace
yarn twenty add                  # Add new entities (guided wizard)
yarn twenty function:logs        # Watch function execution logs
yarn twenty function:execute -n my-function -p '{"key": "value"}'
yarn twenty uninstall            # Remove app from workspace
yarn twenty help                 # List all commands
```

### Client SDKs (Auto-Generated)

```typescript
import { CoreApiClient } from 'twenty-client-sdk/core';     // Workspace data (CRUD)
import { MetadataApiClient } from 'twenty-client-sdk/metadata'; // Config + file uploads
```

The `CoreApiClient` is auto-generated with typed GraphQL operations for your workspace's data model.

---

## 3. Custom Objects

Custom objects are first-class citizens -- they get the same API treatment as built-in objects (Company, Person, etc.).

### Via SDK (Code-First)

```typescript
import { defineObject, FieldType } from 'twenty-sdk';

export const RFP_ANALYSIS_OBJECT_ID = 'a1b2c3d4-...';
export const NAME_FIELD_ID = 'e5f6g7h8-...';

export default defineObject({
  universalIdentifier: RFP_ANALYSIS_OBJECT_ID,
  nameSingular: 'rfpAnalysis',
  namePlural: 'rfpAnalyses',
  labelSingular: 'RFP Analysis',
  labelPlural: 'RFP Analyses',
  description: 'Links an Opportunity to a Proposal Engine analysis',
  icon: 'IconFileAnalytics',
  labelIdentifierFieldMetadataUniversalIdentifier: NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'projectName',
      label: 'Project Name',
      description: 'Name of the analyzed project',
      icon: 'IconAbc',
    },
    // more fields...
  ],
});
```

### Via UI

Settings > Workspace > Data model > + New object > Enter name, icon, description.

### Via Metadata API

POST to `/rest/metadata/` or use GraphQL `/metadata/` endpoint. The system:
1. Updates metadata schema database
2. Generates corresponding GraphQL schema dynamically
3. Caches the computed schema
4. REST and GraphQL endpoints become immediately available

### How It Works Internally

- Object and field definitions stored as metadata in the core database
- Three metadata tables: `DataSource`, `Object`, `Field`
- Workspace databases created/altered based on metadata changes at runtime
- GraphQL schema generated from metadata, cached for performance

---

## 4. Custom Fields

### 17 Field Types Available

| Type | Description | Config Options |
|------|-------------|----------------|
| TEXT | Single line of text | Can be main display field |
| LONG_TEXT | Multi-line text | -- |
| NUMBER | Integer or decimal | -- |
| CURRENCY | Monetary value + currency code | Default currency |
| DATE | Calendar date | -- |
| DATE_TIME | Date with time | -- |
| SELECT | Single choice from predefined list | Default option |
| MULTI_SELECT | Multiple choices from list | -- |
| BOOLEAN | True/false checkbox | -- |
| RATING | Star rating (1-5) | -- |
| EMAIL | Email addresses (primary + additional) | -- |
| PHONE | Phone numbers with dialing codes | Default country |
| LINKS | URLs with labels (primary + secondary) | -- |
| ADDRESS | Structured address (street, city, state, country) | -- |
| DOMAIN | Website domains | -- |
| RELATION | Links to records in other objects | -- |
| ARRAY | List of text values | -- |
| JSON | Structured JSON data | -- |

### Via SDK

```typescript
import { defineField, FieldType } from 'twenty-sdk';

export default defineField({
  objectUniversalIdentifier: EXAMPLE_OBJECT_ID,
  universalIdentifier: 'uuid-here',
  type: FieldType.NUMBER,
  name: 'displayCount',
  label: 'Display Count',
  description: 'Number of LED screens in this analysis',
});
```

### Constraints
- Fields support uniqueness constraints
- Standard fields cannot be deleted but can be deactivated
- Custom fields can be freely created/modified/deleted

---

## 5. Logic Functions (Serverless)

Logic functions are the **serverless backend** of Twenty apps. They support three trigger types.

### HTTP Route Trigger

```typescript
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk';

const handler = async (): Promise<{ message: string }> => {
  const client = new CoreApiClient();

  const { createCompany } = await client.mutation({
    createCompany: {
      __args: { data: { name: 'Hello World' } },
      id: true,
      name: true,
    },
  });

  return { message: `Created company "${createCompany.name}" with id ${createCompany.id}` };
};

export default defineLogicFunction({
  universalIdentifier: 'uuid-here',
  name: 'create-hello-world-company',
  description: 'Creates a company called Hello World',
  timeoutSeconds: 5,
  handler,
  httpRouteTriggerSettings: {
    path: '/create-hello-world-company',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
```

### Cron Trigger

```typescript
export default defineLogicFunction({
  universalIdentifier: 'uuid-here',
  name: 'check-stale-bids',
  description: 'Flags opportunities stale > 30 days',
  timeoutSeconds: 30,
  handler: async () => { /* ... */ },
  cronTriggerSettings: {
    pattern: '0 9 * * *',  // Daily at 9 AM
  },
});
```

### Database Event Trigger

```typescript
export default defineLogicFunction({
  universalIdentifier: 'uuid-here',
  name: 'on-opportunity-created',
  description: 'Runs when an opportunity is created',
  timeoutSeconds: 10,
  handler: async (payload: DatabaseEventPayload) => { /* ... */ },
  databaseEventTriggerSettings: {
    eventName: 'opportunity.created',
  },
});
```

### Available Event Types

From the SDK types:
- `ObjectRecordCreateEvent`
- `ObjectRecordUpdateEvent`
- `ObjectRecordDeleteEvent`
- `ObjectRecordDestroyEvent`
- `ObjectRecordRestoreEvent`
- `ObjectRecordUpsertEvent`

### Lifecycle Functions

```typescript
import { definePreInstallLogicFunction, type InstallLogicFunctionPayload } from 'twenty-sdk';

const handler = async (payload: InstallLogicFunctionPayload): Promise<void> => {
  console.log('Pre install executed!', payload.previousVersion);
};

export default definePreInstallLogicFunction({
  universalIdentifier: 'uuid-here',
  name: 'pre-install',
  description: 'Runs before installation to prepare the application.',
  timeoutSeconds: 300,
  handler,
});
```

### AI Tool Integration

Logic functions can be marked as AI tools with JSON schemas via `toolInputSchema`, making them callable by Twenty's AI agents.

### Execution Environments

| Driver | Env Var | Use Case |
|--------|---------|----------|
| **Disabled** | `LOGIC_FUNCTION_TYPE=DISABLED` | Off (production default) |
| **Local** | `LOGIC_FUNCTION_TYPE=LOCAL` | Dev only, no sandboxing |
| **Lambda** | `LOGIC_FUNCTION_TYPE=LAMBDA` | Production, AWS Lambda isolation |

Lambda config:
```bash
LOGIC_FUNCTION_TYPE=LAMBDA
LOGIC_FUNCTION_LAMBDA_REGION=us-east-1
LOGIC_FUNCTION_LAMBDA_ROLE=arn:aws:iam::123456789:role/your-role
LOGIC_FUNCTION_LAMBDA_ACCESS_KEY_ID=your-key
LOGIC_FUNCTION_LAMBDA_SECRET_ACCESS_KEY=your-secret
```

### Limitations

- API keys must be hardcoded in function body (no external config store)
- Arrays from external systems may arrive as strings
- `timeoutSeconds` is configurable per function
- Production requires Lambda setup (or LOCAL for trusted code)
- No native file system access in Lambda mode

---

## 6. Front Components (Custom React UI)

Front components are **React components rendered inside the Twenty UI**. This is the key mechanism for embedding custom UIs.

### Example: Full Front Component

```tsx
import { useEffect, useState } from 'react';
import { CoreApiClient, CoreSchema } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk';

export const PROPOSAL_PREVIEW_ID = 'uuid-here';

export const ProposalPreview = () => {
  const client = new CoreApiClient();
  const [data, setData] = useState<Pick<CoreSchema.Company, 'name' | 'id'> | undefined>();

  useEffect(() => {
    const fetchData = async () => {
      const response = await client.query({
        company: {
          name: true,
          id: true,
          __args: {
            filter: { position: { eq: 1 } },
          },
        },
      });
      setData(response.company);
    };
    fetchData();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Proposal Preview</h1>
      {data ? (
        <div>
          <p>Company: {data.name}</p>
          <p>ID: {data.id}</p>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: PROPOSAL_PREVIEW_ID,
  name: 'proposal-preview',
  description: 'Inline preview of proposal data inside Twenty',
  component: ProposalPreview,
});
```

### Capabilities

- Full React component (hooks, state, effects)
- Access to `CoreApiClient` for reading/writing CRM data
- Access to `MetadataApiClient` for workspace configuration
- Can render any UI (charts, tables, forms, iframes)
- Supports Command integration (Cmd+K palette)
- Component must be a valid React component function

### Command Integration

Front components can register commands accessible via Cmd+K:

```typescript
export default defineFrontComponent({
  universalIdentifier: '...',
  name: 'my-component',
  description: '...',
  component: MyComponent,
  command: {
    universalIdentifier: 'cmd-uuid',
    label: 'Open Proposal Engine',
    conditionalAvailabilityExpression: true,  // or a string expression
  },
});
```

### Key Insight for Our Use Case

Front components can render **iframes** or any arbitrary React content. This means we could embed the Proposal Engine (or a lightweight version of it) directly inside Twenty's record detail pages as a tab.

---

## 7. Page Layouts

Page layouts control what appears on record detail pages. You can add custom tabs with widgets (including front components).

```typescript
import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk';

export default definePageLayout({
  universalIdentifier: 'uuid-here',
  name: 'Opportunity Detail Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: OPPORTUNITY_OBJECT_ID,  // or custom object
  tabs: [
    {
      universalIdentifier: 'tab-uuid',
      title: 'Proposal Engine',
      position: 50,
      icon: 'IconFileAnalytics',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'widget-uuid',
          title: 'Proposal Preview',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: PROPOSAL_PREVIEW_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
```

This is the mechanism to **add a "Proposal Engine" tab on every Opportunity record** in Twenty.

---

## 8. Navigation Menu Items

Add entries to Twenty's sidebar navigation.

```typescript
import { defineNavigationMenuItem } from 'twenty-sdk';

export default defineNavigationMenuItem({
  universalIdentifier: 'uuid-here',
  name: 'proposal-engine',
  icon: 'IconFileAnalytics',
  color: 'blue',
  position: 0,
  type: 'VIEW',
  viewUniversalIdentifier: VIEW_UUID,
});
```

---

## 9. Views

Saved view configurations for objects.

```typescript
import { defineView, ViewKey } from 'twenty-sdk';

export default defineView({
  universalIdentifier: 'uuid-here',
  name: 'Active Bids',
  objectUniversalIdentifier: OPPORTUNITY_OBJECT_ID,
  icon: 'IconList',
  key: ViewKey.INDEX,
  position: 0,
  fields: [
    {
      universalIdentifier: 'field-uuid',
      fieldMetadataUniversalIdentifier: NAME_FIELD_ID,
      position: 0,
      isVisible: true,
      size: 200,
    },
  ],
});
```

---

## 10. AI Agents & Skills

### Agents

Define custom AI agents with system prompts:

```typescript
import { defineAgent } from 'twenty-sdk';

export default defineAgent({
  universalIdentifier: 'uuid-here',
  name: 'bid-assistant',
  label: 'Bid Assistant',
  description: 'Answers questions about the ANC bid pipeline',
  icon: 'IconRobot',
  prompt: 'You are a helpful bid assistant. Help users answer questions about NFL, NBA, and MLS stadium LED display bids. You have access to the CRM data...',
});
```

### Skills

Skills provide knowledge/context to agents:

```typescript
import { defineSkill } from 'twenty-sdk';

export default defineSkill({
  universalIdentifier: 'uuid-here',
  name: 'venue-enrichment',
  label: 'Venue Enrichment',
  description: 'Knowledge about ANC venue data',
  icon: 'IconBrain',
  content: 'ANC works with NFL, NBA, MLS, and NCAA venues. Key manufacturers are LG and Yaham. Typical pixel pitches are 2.5mm, 3.9mm, 5.9mm...',
});
```

### AI in Workflows

- **AI Agent** action in workflows is listed as "Coming Soon"
- Logic functions can be marked as AI tools via `toolInputSchema` (JSON Schema)
- Multi-provider support via Vercel AI SDK: OpenAI, Anthropic, Google, Groq, Mistral, XAI

### Code Interpreter

For AI data analysis:
```bash
CODE_INTERPRETER_TYPE=E_2_B    # Production (E2B sandbox)
CODE_INTERPRETER_TYPE=LOCAL    # Dev only
CODE_INTERPRETER_TYPE=DISABLED # Off (production default)
```

---

## 11. Workflow Automation

### Triggers

| Trigger | Description | Notes |
|---------|-------------|-------|
| **Record Created** | Fires on new record | Not recommended for manual creation (auto-save triggers too early) |
| **Record Updated** | Fires on record change | Can filter by specific fields |
| **Record Created/Updated** | Both combined | Best for multi-source records |
| **Record Deleted** | Fires on deletion | Deleted data still available in subsequent steps |
| **Manual** | User-initiated via Cmd+K or navbar | Global, Single, or Bulk modes |
| **Schedule** | Cron-based recurring | Runs in UTC |
| **Webhook** | External HTTP trigger | Unique endpoint URL per workflow, auth coming soon |

### Actions

| Action | Description | Notes |
|--------|-------------|-------|
| **Create Record** | Insert new record | Output available for subsequent steps |
| **Update Record** | Modify existing record | Fixed or dynamic record selection |
| **Delete Record** | Remove record | Deleted data remains available for next steps |
| **Search Records** | Find records with filters | Max 200 records returned |
| **Upsert Record** | Create or update by matching | Match on email, domain, ID, or unique fields |
| **Iterator** | Loop through arrays | Process multiple records sequentially |
| **Filter** | Conditional gate | Stops branch if condition not met |
| **Delay** | Pause execution | Duration-based or scheduled date |
| **Send Email** | Email via synced mailbox | Single recipient only, attachments supported |
| **Form** | Collect user input | For manual triggers only |
| **Code** | Execute custom JavaScript | Inline code with access to previous step variables |
| **HTTP Request** | Call external APIs | GET, POST, PUT, PATCH, DELETE |
| **AI Agent** | AI-powered actions | Coming soon |

### Code Action Example

Execute arbitrary JavaScript within workflows. Can access variables from previous steps.

### HTTP Request Action

Full API client: URL with params, headers, methods (GET/POST/PUT/PATCH/DELETE), sample response for structure preview. **This is how workflows call external systems like our Proposal Engine.**

### Workflow Credits

- Each action consumes credits
- Delay node: 1 credit when executed, none while waiting
- AI actions: credits vary by model
- Manual trigger: soft limit 100 runs/minute

---

## 12. APIs (REST + GraphQL)

### Endpoints

| Type | Cloud | Self-Hosted |
|------|-------|-------------|
| Core REST | `https://api.twenty.com/rest/` | `https://{domain}/rest/` |
| Core GraphQL | `https://api.twenty.com/graphql/` | `https://{domain}/graphql/` |
| Metadata REST | `https://api.twenty.com/rest/metadata/` | `https://{domain}/rest/metadata/` |
| Metadata GraphQL | `https://api.twenty.com/metadata/` | `https://{domain}/metadata/` |

### Authentication

```
Authorization: Bearer YOUR_API_KEY
```

API keys generated via Settings > APIs & Webhooks. Display once on creation.

### Core API (CRUD)

- Dedicated endpoints for each object (standard + custom)
- Supports batch operations (up to 60 records)
- GraphQL supports batch upserts and relationship queries
- Custom objects get identical API treatment as built-in ones

### Metadata API

- Manage workspace configuration
- Create/modify/delete custom objects and fields
- Dynamic schema updates

### Rate Limits

- **100 requests per minute**
- **60 records per batch operation**

### GraphQL Example

```graphql
mutation {
  createOpportunity(data: {
    name: "Panthers Stadium LED Outdoor"
    dealSize: DEAL_MASSIVE
    bidStatus: BID_SCOPING
    companyId: "company-uuid"
  }) {
    id
    name
    dealSize
  }
}
```

---

## 13. Webhooks

### Setup

Settings > APIs & Webhooks > Webhooks > Create webhook. Provide publicly accessible URL.

### Events

- `*.created` (person.created, company.created, note.created, etc.)
- `*.updated` (person.updated, company.updated, opportunity.updated, etc.)
- `*.deleted` (person.deleted, company.deleted, etc.)

**All events sent to webhook URL** -- no filtering yet.

### Payload

```json
{
  "event": "opportunity.created",
  "data": {
    "id": "uuid",
    "name": "Panthers Stadium LED",
    "dealSize": "DEAL_MASSIVE",
    "createdAt": "2026-03-30T...",
    "updatedBy": { "source": "API" }
  },
  "timestamp": "2026-03-30T12:00:00Z"
}
```

### Security (HMAC SHA256)

Headers: `X-Twenty-Webhook-Signature`, `X-Twenty-Webhook-Timestamp`

Verify: combine timestamp + payload, compute HMAC SHA256 with webhook secret, compare with timing-safe comparison.

### Limitations

- No event filtering (all events sent)
- Must respond with HTTP 2xx
- Inbound webhooks (external to Twenty) are a separate feature via workflow webhook triggers

---

## 14. Roles & Permissions

### Three-Layer Security

1. **Object-Level**: `canRead`, `canUpdate`, `canDelete`, `canDestroy` flags
2. **Field-Level**: `restrictedFields` map applied during query construction
3. **Row-Level**: Dynamic WHERE clause injection based on predicates

### App Roles

```typescript
import { defineRole } from 'twenty-sdk';

export default defineRole({
  universalIdentifier: 'uuid-here',
  label: 'Proposal Engine default role',
  description: 'Role for Proposal Engine app functions',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
});
```

All logic functions execute with the permissions of their app's role.

---

## 15. Infrastructure & Deployment

### Twenty Stack

- **Frontend**: React 18.3.1 + TypeScript 5.9.2 + Vite 7.0.0 + Jotai + Apollo Client
- **Backend**: NestJS 11.1.15 + GraphQL Yoga + TypeORM + PostgreSQL
- **Queue**: BullMQ + Redis
- **Analytics**: ClickHouse
- **Storage**: AWS S3
- **Auth**: Passport.js (JWT, OAuth Google/Microsoft, SAML SSO)
- **Email**: NodeMailer + AWS SES + IMAP ingestion
- **AI**: Vercel AI SDK (OpenAI, Anthropic, Google, Groq, Mistral, XAI)

### Self-Hosting

Deploy via Docker Compose or cloud providers. All configuration via environment variables.

### Logic Function Hosting

- **Local**: Direct Node.js execution (dev only)
- **Lambda**: AWS Lambda with hardware-level isolation (production)
- Must explicitly enable: `LOGIC_FUNCTION_TYPE=LAMBDA`

---

## 16. Marketplace & Publishing

### Current State (March 2026)

- The marketplace/app store is **actively being built**
- Content and permission tabs exist for marketplace and installed apps
- The SDK supports `yarn twenty publish` (or similar) for app distribution
- Language-agnostic plugin support planned (TypeScript, Python, Rust, Go via WebAssembly)

### Publishing Flow

1. Build app with `twenty-sdk`
2. Test with `yarn twenty dev`
3. Publish to Twenty marketplace (mechanism being finalized)

### Limitations

- Full public marketplace not yet launched
- Self-hosted instances can install apps directly via the SDK
- No third-party app store equivalent to Salesforce AppExchange yet

---

## 17. Integration Patterns

### Pattern 1: Proposal Engine -> CRM (Outbound)

Use Twenty's REST/GraphQL API from the Proposal Engine to create/update records:

```typescript
// In Proposal Engine (Next.js API route)
const response = await fetch('https://twenty-host/rest/core/opportunities', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TWENTY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: `${venue} LED ${type}`,
    dealSize: 'DEAL_MASSIVE',
    bidStatus: 'BID_SCOPING',
    companyId: companyId,
  }),
});
```

### Pattern 2: CRM -> Proposal Engine (Inbound via Workflows)

Use Twenty workflows with HTTP Request action to call Proposal Engine APIs:

1. Trigger: Opportunity created/updated
2. Action: HTTP POST to `https://proposals.anc.com/api/some-endpoint`
3. Action: Update record with response data

### Pattern 3: Embedded UI (Front Component + Page Layout)

Add a "Proposal Engine" tab on Opportunity records:

1. Define a front component that renders an iframe to `proposals.anc.com/embed/{opportunityId}`
2. Define a page layout that adds this as a tab on Opportunity detail pages
3. The iframe communicates via postMessage or shared API keys

### Pattern 4: Webhook Sync

1. Twenty sends webhooks to Proposal Engine on opportunity changes
2. Proposal Engine sends API calls back to Twenty when analyses complete
3. Bidirectional sync without polling

### Pattern 5: Logic Function as API Bridge

Create logic functions that act as middleware between Twenty and the Proposal Engine:

```typescript
export default defineLogicFunction({
  universalIdentifier: 'uuid-here',
  name: 'sync-proposal',
  description: 'Webhook from Proposal Engine, creates/updates rfpAnalysis',
  timeoutSeconds: 30,
  handler: async (payload) => {
    const client = new CoreApiClient();
    // Parse incoming data from Proposal Engine
    // Create/update records in Twenty
    return { success: true };
  },
  httpRouteTriggerSettings: {
    path: '/sync-proposal',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
```

### Pattern 6: n8n / Zapier Bridge

Twenty integrates with Zapier (official) and n8n (community). Use these as middleware for complex multi-step integrations.

---

## 18. Feasibility: Embedding the Proposal Engine

### The Question

Can we embed a full Next.js app (PDF generation, Excel parsing, AI chat, 144 routes, 30 pages) INTO Twenty CRM?

### The Answer: Yes, via a Layered Approach

#### Layer 1: Data Sync (Easy, Do First)

- Create custom objects in Twenty: `rfpAnalysis`, `proposalDocument`, `extractedSpec`
- Use Twenty's API from the Proposal Engine to auto-create/update CRM records
- Use webhooks for bidirectional sync
- **Effort**: 2-4 hours
- **Result**: CRM pipeline populated automatically from Proposal Engine

#### Layer 2: Embedded UI (Medium, High Impact)

- Build a Twenty App with a front component that renders an **iframe** to the Proposal Engine
- Use `definePageLayout` to add a "Proposal Engine" tab on Opportunity record pages
- Use `defineNavigationMenuItem` to add "Proposals" to the sidebar
- The iframe points to `https://proposals.anc.com/embed/{recordId}` with auth token
- **Effort**: 1-2 days
- **Result**: Users see the Proposal Engine inside Twenty without switching tabs

#### Layer 3: Native CRM Actions (Medium)

- Build workflow automations: "When Opportunity moves to BID_SCOPING, trigger RFP extraction"
- Use HTTP Request actions in workflows to call Proposal Engine APIs
- Use Code actions for data transformation
- **Effort**: 1-2 days
- **Result**: CRM workflows trigger proposal operations

#### Layer 4: AI Agent Integration (Advanced)

- Define a `bid-assistant` agent with access to CRM data
- Define skills with ANC domain knowledge
- Mark logic functions as AI tools so the agent can trigger Proposal Engine operations
- **Effort**: 2-3 days
- **Result**: "What NFL deals are in scoping? Generate a proposal for Panthers Stadium."

#### Layer 5: Full Native Port (NOT Recommended)

Porting 144 routes, 30 pages, 124 components into Twenty's front component system would be a multi-month rewrite. Not worth it. The iframe approach (Layer 2) gives 95% of the value at 5% of the cost.

### Recommended Architecture

```
[Twenty CRM]
  |-- Sidebar: "Proposals" nav item -> iframe to proposals.anc.com
  |-- Opportunity Record:
  |     |-- Standard tabs (Summary, Timeline, etc.)
  |     |-- "Proposal Engine" tab -> iframe with opportunity context
  |     |-- Custom fields: proposalUrl, rfpDocumentUrl, extractionConfidence
  |-- Workflows:
  |     |-- "New RFP" -> Create task for Natalia
  |     |-- "Opportunity Updated" -> Sync to Proposal Engine via HTTP
  |     |-- "Warranty Expiring" -> Alert Jireh
  |-- Logic Functions:
  |     |-- /sync-proposal (webhook receiver from Proposal Engine)
  |     |-- /check-stale-bids (daily cron)
  |-- AI Agent:
  |     |-- "Bid Assistant" with ANC domain skills
  |
[Proposal Engine (proposals.anc.com)]
  |-- Full Next.js app (unchanged)
  |-- /embed/{id} route (new, lightweight, for iframe)
  |-- API endpoints for CRM integration
  |-- Sends webhooks to Twenty on analysis completion
```

### What We CANNOT Do (Limitations)

1. **No full native port** -- Twenty's front component system is not designed for 30-page apps
2. **No file system access** in Lambda-hosted logic functions
3. **Rate limited** to 100 API requests/minute -- fine for CRM sync, not for bulk operations
4. **Single recipient emails** from workflow email actions
5. **200 record limit** on Search Records action
6. **No event filtering** on webhooks (all events sent to all webhooks)
7. **AI Agent workflow action** not yet available (coming soon)
8. **Marketplace** not fully launched -- apps are installed via SDK, not a store
9. **API keys in logic functions** must be hardcoded (no secret manager)

---

## Sources

- [Twenty Documentation - APIs](https://docs.twenty.com/developers/extend/capabilities/apis)
- [Twenty Documentation - Webhooks](https://docs.twenty.com/developers/extend/capabilities/webhooks)
- [Twenty Documentation - Workflows Overview](https://docs.twenty.com/user-guide/workflows/overview)
- [Twenty Documentation - Workflow Actions](https://docs.twenty.com/user-guide/workflows/capabilities/workflow-actions)
- [Twenty Documentation - Workflow Triggers](https://docs.twenty.com/user-guide/workflows/capabilities/workflow-triggers)
- [Twenty Documentation - AI Agents](https://docs.twenty.com/user-guide/ai/ai-agents)
- [Twenty Documentation - Custom Objects](https://docs.twenty.com/developers/backend-development/custom-objects)
- [Twenty Documentation - Fields](https://docs.twenty.com/user-guide/data-model/capabilities/fields)
- [Twenty Documentation - Apps Getting Started](https://docs.twenty.com/developers/extend/apps/getting-started)
- [Twenty Documentation - Self-Host Setup](https://docs.twenty.com/developers/self-host/capabilities/setup)
- [Twenty SDK on npm](https://www.npmjs.com/package/twenty-sdk)
- [Twenty GitHub Repository](https://github.com/twentyhq/twenty)
- [Twenty GitHub - twenty-sdk source](https://github.com/twentyhq/twenty/tree/main/packages/twenty-sdk/src/sdk)
- [Twenty GitHub - create-twenty-app templates](https://github.com/twentyhq/twenty/tree/main/packages/create-twenty-app/src/utils/app-template.ts)
- [DeepWiki - Twenty Architecture](https://deepwiki.com/twentyhq/twenty)
- [Squishy Software - Adding Extensibility to Twenty](https://www.getxtp.com/blog/adding-extensibility-to-twenty-a-modern-crm)
- [Twenty Releases](https://twenty.com/releases)
