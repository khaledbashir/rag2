# AnythingLLM API Reference

## Base URL
`https://basheer-anything-llm.prd42b.easypanel.host/api/v1`
Configured in: `lib/variables.ts`

## Routing: Use `/api/v1/`
Both `/v1/` and `/api/v1/` hit the same router. Use `/api/v1/` for external calls.
All endpoints require `Authorization: Bearer <API_KEY>`.

---

## 1. Workspace Chat

### Standard Chat (Non-Streaming)
`POST /api/v1/workspace/{slug}/chat`

```json
{
  "message": "What is the project deadline?",
  "mode": "chat",
  "sessionId": "user-session-123",
  "reset": false
}
```
- `message`: (String, Required) The prompt
- `mode`: (String, Required) `chat` or `query`
- `sessionId`: (String, Optional) Preserves conversation context across calls
- `reset`: (Boolean, Optional) Set `true` to clear history for this workspace/session

**Response:**
```json
{
  "id": "chat-uuid-123",
  "type": "textResponse",
  "textResponse": "The deadline is Friday.",
  "sources": [{ "title": "SOW_Alpha.pdf", "chunk": "..." }],
  "close": true,
  "error": null
}
```

### Streaming Chat (SSE)
`POST /api/v1/workspace/{slug}/stream-chat` — same request body

**Response:** `Content-Type: text/event-stream`
```json
{
  "id": "uuid-123",
  "type": "textResponseChunk",
  "textResponse": " partial text...",
  "sources": [],
  "close": false,
  "error": null
}
```
- Concatenate `textResponse` chunks as they arrive
- Final chunk: `"close": true` + populated `sources` array for footnotes
- `"type": "abort"` = stream was cancelled

### Chat Modes
| Mode | Behavior |
|------|----------|
| `chat` | Vector DB context + LLM general knowledge + rolling history |
| `query` | Strict RAG only — answers from embedded docs only, no history |
| Agent | No `"mode": "agent"`. Use `"mode": "chat"` with `"message": "@agent ..."` |

### Session Behavior
- Same `sessionId` across calls = persistent conversation memory
- History limit controlled by workspace `openAiHistory` setting (default ~20 messages)
- Clear history: send `"reset": true` in chat body

### Chat History (restore context on reopen)
`GET /api/v1/workspace/{slug}/chats` (or `.../thread/{threadSlug}/chats` for threads)
- `limit`: Int (default 100, use 20-50 for faster load)
- `orderBy`: `"desc"` (newest first) or `"asc"`

**Response:**
```json
{
  "history": [
    { "role": "user", "content": "Calculate pixel pitch.", "sentAt": 1692851630 },
    { "role": "assistant", "content": "Based on 10ft viewing...", "sources": [...] }
  ]
}
```

### Clearing History
- **Workspace mode:** No "delete all chats" endpoint. Only `DELETE /v1/workspace/{slug}` (nuclear) or `"reset": true` in chat body
- **Thread mode (recommended):** `DELETE /v1/workspace/{slug}/thread/{threadSlug}` → create new thread immediately. Cleanest "Reset" button implementation

---

## 2. Workspace Management

### List All Workspaces
`GET /api/v1/workspaces` → array of `{ id, name, slug }`

### Create Workspace
`POST /api/v1/workspace/new`
```json
{ "name": "Project Alpha", "onboarding": false }
```

### Get Workspace (includes threads + documents)
`GET /api/v1/workspace/{slug}`

### Update Workspace Settings
`POST /api/v1/workspace/{slug}/update`

**All valid fields:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Workspace name |
| `slug` | String | URL slug |
| `openAiTemp` | Float | Temperature (0.0-1.0) |
| `openAiHistory` | Int | Max messages in history (default ~20) |
| `openAiPrompt` | String | System prompt |
| `similarityThreshold` | Float | Vector search similarity cutoff |
| `topN` | Int | Number of RAG chunks to retrieve |
| `chatMode` | String | `"chat"` or `"query"` |
| `chatProvider` | String | LLM provider (e.g. "openai") |
| `chatModel` | String | Model name (e.g. "gpt-4") |
| `agentProvider` | String | Agent LLM provider |
| `agentModel` | String | Agent model name |
| `queryRefusalResponse` | String | Custom "I don't know" message for query mode |
| `vectorTag` | String | Vector namespace tag |

Note: Cannot enable/disable Agent Skills (Web Search, etc.) via API — UI only.

### Our Workspaces
- `anc-estimator` (default)
- `anc-legal-brain` (legal)
- `dashboard-vault` (master)

---

## 3. Agent Mode

**Cannot enable/disable Agent Skills via API.** Must toggle in UI:
Workspace Settings → Agent Configuration → toggle Web-Browsing, Google Search, etc.

**Trigger via API:** `"message": "@agent scrape https://example.com"`

**Built-in Skills:**
- RAG Search (memory recall)
- Web Browsing (live internet search)
- Web Scraping (read specific URL)
- Save Files (save text/data to local file)
- Chart Generation (visual charts)
- SQL Agent (query connected SQL db)

---

## 4. Thread Management

### Create Thread
`POST /api/v1/workspace/{slug}/thread/new`
```json
{ "name": "Contract Review", "slug": "contract-review", "userId": 1 }
```

### Chat in Thread (scoped context)
`POST /api/v1/workspace/{slug}/thread/{threadSlug}/chat`
Same body as workspace chat but scoped to thread.

### List Threads
`GET /api/v1/workspace/{slug}` → response contains `threads` array

### Thread History
`GET /api/v1/workspace/{slug}/thread/{threadSlug}/chats`

### Delete Thread (hard reset)
`DELETE /api/v1/workspace/{slug}/thread/{threadSlug}`

---

## 5. Document & Embedding Management

### Upload & Embed
`POST /api/v1/document/upload` (multipart/form-data)
- `file`: The file (PDF, DOCX, TXT, MD, ODT, MBOX)
- `addToWorkspaces`: Comma-separated slugs — **auto-embeds, no separate call needed**

**Response:**
```json
{
  "success": true,
  "error": null,
  "documents": [
    {
      "location": "custom-documents/my-file.pdf-70b3...json",
      "name": "my-file.pdf-70b3...json",
      "url": "file://...",
      "title": "my-file.pdf",
      "token_count_estimate": 150
    }
  ]
}
```
**Key:** Use `documents[0].location` as `docPath` for pinning.

### Upload Link (scrape URL)
`POST /api/v1/document/upload-link`
```json
{
  "link": "https://example.com/pricing",
  "addToWorkspaces": "project-alpha,dashboard-vault",
  "metadata": {
    "title": "Competitor Pricing",
    "description": "Scraped pricing page"
  }
}
```
Supports `addToWorkspaces` — scrape + embed in one call.

### Upload Raw Text
`POST /api/v1/document/raw-text`

### List All Documents
`GET /api/v1/documents`

### Manage Embeddings (add/remove docs from workspace)
`POST /api/v1/workspace/{slug}/update-embeddings`
```json
{
  "adds": ["custom-documents/contract.pdf-hash.json"],
  "deletes": ["custom-documents/old-file.json"]
}
```
**Response:** Updated workspace object with current `documents` array.
**Note:** Not needed if you used `addToWorkspaces` during upload.

### Pin Document (full-text in context window)
`POST /api/v1/workspace/{slug}/update-pin`
```json
{ "docPath": "custom-documents/my-file.pdf-70b3...json", "pinStatus": true }
```
Use `location` from upload response as `docPath`.

**Pinning limits — CONTEXT WINDOW is the bottleneck:**
- No hard doc count limit, but pinning forces ENTIRE text into prompt for EVERY message
- Example: 3 pinned 50-page RFPs (~30k tokens each) = 90k tokens before "Hello"
- **Strategy:** Only pin the ACTIVE SOW/proposal draft. Leave historical RFPs embedded (unpinned) for RAG retrieval.

### Un-embed (remove doc from workspace without deleting file)
`POST /api/v1/workspace/{slug}/update-embeddings`
```json
{ "adds": [], "deletes": ["custom-documents/old-doc.pdf.json"] }
```
Doc stays on server for other workspaces — just decoupled from this project.

### List Embedded Documents
`GET /api/v1/workspace/{slug}` → `documents` array shows all files currently embedded.

### Vector Search (pure retrieval, no LLM)
`POST /api/v1/workspace/{slug}/vector-search`
```json
{
  "query": "What are the payment terms?",
  "topN": 4,
  "scoreThreshold": 0.2
}
```
**Response:**
```json
{
  "results": [
    {
      "id": "uuid-string",
      "text": "Payment shall be made within 30 days...",
      "metadata": { "source": "contract.pdf", "title": "Master Service Agreement" },
      "score": 0.85
    }
  ]
}
```

---

## 6. Error Handling

| Status | Meaning | Response Format |
|--------|---------|-----------------|
| 200 | Success | Endpoint-specific JSON |
| 400 | Bad request / missing params | `{ "success": false, "message": "Error details..." }` |
| 403 | Invalid API key | `{ "message": "Invalid API Key" }` |
| 500 | Server error | `{ "error": "Internal Server Error" }` (sometimes plain text) |

---

## 7. Admin & System

### Auth
- `GET /v1/auth` — Verify API token

### Users
- `GET /v1/admin/users` | `POST /v1/admin/users/new` | `POST /v1/admin/users/{id}` | `DELETE /v1/admin/users/{id}`

### Invites
- `GET /v1/admin/invites` | `POST /v1/admin/invite/new` | `DELETE /v1/admin/invite/{id}`

### System
- `GET /v1/system` — System settings
- `POST /v1/system/update-env` — Update .env programmatically

### Embed Widget
- `POST /v1/embed/new` — Generate widget config

---

## 8. Misc Notes

### Audio Transcription
No standalone STT. Upload audio via `/v1/document/upload` → auto-transcribes (Whisper/Xenova) → chunked for RAG.

### Embed Widget (data-* attributes)
| Attribute | Description |
|---|---|
| data-chat-icon | plus, chatBubble, support, magic, search |
| data-assistant-name | AI persona name |
| data-button-color | Hex color for chat bubble |
| data-position | bottom-right (default) |
| data-greeting | First message |
| data-open-on-load | Auto-open |
| data-no-sponsor | Remove branding |

No public JS API (`window.anythingLLM.open()` doesn't exist).

### No Native Webhooks
Workaround: Agent Flows with "API Call" block + `${variableName}` injection.

### Scaling (100+ Projects)
- **Workspaces:** 1000+ fine. LanceDB stores vectors on filesystem, scales well.
- **Upload size:** ~50MB practical limit (Node.js timeout), adjustable via env vars.
- **Rate limits:** None from AnythingLLM itself — bottleneck is your LLM provider (OpenAI/Anthropic).

### Embedding Configuration
- **Default engine:** LanceDB (vector DB) + AnythingLLM Native Embedder (BERT/MiniLM)
- **Chunk size:** System-wide setting (~1024 tokens default), configured in Admin UI or env vars — NOT per-document via API
- **For dense technical specs (LED/RFP):** Increase overlap to 20% in UI to prevent numbers being split between chunks
- **Production upgrade path:** Switch embedding model to OpenAI `text-embedding-3-large` (via UI settings) for better technical query accuracy

### Browser Extension
Chrome/Brave "Scrape & Sync" — text content only. Authenticated DOM scraping is Desktop-only.

### Integration Points in Our App
- Service class: `services/AnythingLLMService.ts`
- RAG bridge: `lib/anything-llm.ts` (queryVault, uploadDocument, addToWorkspace)
- Config: `lib/variables.ts` (hardcoded URL with env fallback)

---

## 9. Next-Level Integrations (Implementation Roadmap)

### 9.1 Bicameral Data Strategy (RAG + Pinning)
Upload once, sync twice. RFPs/drawings go to project workspace (pinned) AND dashboard-vault (embedded).

**Flow:**
1. Upload: `POST /api/v1/document/upload` with `addToWorkspaces: "{project_slug},dashboard-vault"` — auto-embeds both
2. Get `location` from response: `documents[0].location`
3. Pin to project: `POST /api/v1/workspace/{project_slug}/update-pin` with `{ "docPath": location, "pinStatus": true }`

### 9.2 Workspace Persona Automation
`POST /api/v1/workspace/{slug}/update` immediately after creation:
```json
{
  "openAiPrompt": "You are an expert LED Display Estimator for ANC...",
  "openAiTemp": 0.2,
  "chatMode": "chat"
}
```

### 9.3 Competitor & Client Recon (URL Scraping)
`POST /api/v1/document/upload-link` with `addToWorkspaces` for instant embed:
```json
{
  "link": "https://client-website.com/about-us",
  "addToWorkspaces": "{project_slug},dashboard-vault",
  "metadata": { "title": "Client Info", "description": "Scraped for tone matching" }
}
```

### 9.4 Streaming Responses (SSE)
`POST /api/v1/workspace/{slug}/stream-chat` — `Content-Type: text/event-stream`
Concatenate chunks, detect end with `close: true`, get sources from final chunk.

### 9.5 Reasoning/Thinking Models (DeepSeek R1, etc.)

**No native support for thinking tags.** AnythingLLM is a pass-through — if the model outputs `<think>`, it arrives as raw text in `textResponse` chunks. No separate field, no separate event type.

**Stream behavior:** Thinking tags are mixed into the text stream:
```
chunk: { "textResponse": "<think>" }
chunk: { "textResponse": "Analysis..." }
chunk: { "textResponse": "</think>" }
chunk: { "textResponse": "The answer is..." }
```

**Client-side state machine required:**
1. Detect `<think>` → redirect chunks to "thinking" buffer
2. Detect `</think>` → close buffer, render as collapsible UI (default collapsed)
3. Everything after → render as normal response

**UX rules:**
- Stream instantly — don't buffer server-side (thinking can take 30+ seconds)
- Show pulsing "Reasoning..." indicator on `<think>` detection
- Collapse thinking by default, let user expand
- Low temperature (0.6 or lower) recommended for reasoning models

**No workspace settings** to toggle thinking visibility — it's model behavior, not platform config.

---

### Implementation Checklist
1. Refactor uploads → use `addToWorkspaces` for dual-embedding (no separate `update-embeddings`)
2. Grab `documents[0].location` from upload response → use as `docPath` for `update-pin`
3. Add `workspace/update` call after workspace creation for persona
4. Update frontend chat to handle SSE from `stream-chat`
5. Add `"reset": true` support for clearing conversation history
6. Add client-side `<think>`/`</think>` state machine for reasoning model support
