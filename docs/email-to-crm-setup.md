# Email → CRM intake — Microsoft 365 setup

The engine, review queue (`/admin/email-to-crm`), and API are live without any
of this — emails can be pasted manually. This doc covers the one-time Azure
setup that turns on the automatic leg: a monitored intake mailbox plus
attachment filing into the OneDrive sales folder.

## 1. Create the intake mailbox

In the Microsoft 365 admin center (as `admin@anc.com`):

1. **Teams & groups → Shared mailboxes → Add** a shared mailbox, e.g.
   `deals@anc.com` (no license needed).
2. Tell the team: CC or forward any proposal/RFP email to that address.

## 2. Azure AD app registration

In [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID:

1. **App registrations → New registration** — name `ANC Email Intake`,
   single tenant, no redirect URI.
2. Note the **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret** (24 months). Copy the
   secret **value** immediately.
4. **API permissions → Add → Microsoft Graph → Application permissions**:
   - `Mail.ReadWrite` (read + mark-read on the intake mailbox)
   - `Files.ReadWrite.All` (upload attachments to the sales drive)
5. Click **Grant admin consent** — permissions must show green checks.

Optional hardening: restrict the app to only the intake mailbox with an
Exchange application access policy:

```powershell
New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId deals@anc.com `
  -AccessRight RestrictAccess -Description "Email intake app: deals@ only"
```

## 3. Point at the sales folder

Easiest path: open the sales folder in the browser (SharePoint or OneDrive),
copy the URL from the address bar, and set it as `EMAIL_CRM_FOLDER_URL`. The
poller resolves the drive via the Graph shares API — no drive id needed.

Alternative (drive id mode):

```
GET https://graph.microsoft.com/v1.0/sites?search=<sales site name>   (needs Sites.Read.All)
GET https://graph.microsoft.com/v1.0/sites/{siteId}/drives            → note the drive id
```

## 4. Env vars (EasyPanel → ancapp service)

Add via **read-merge-verify-write** (never bulk-replace the env block):

```
MSGRAPH_TENANT_ID=<tenant id>
MSGRAPH_CLIENT_ID=<client id>
MSGRAPH_CLIENT_SECRET=<secret value>
EMAIL_CRM_MAILBOX=deals@anc.com
EMAIL_CRM_FOLDER_URL=<paste the sales folder URL>   # preferred filing config
# — or drive-id mode instead of FOLDER_URL:
# EMAIL_CRM_DRIVE_ID=<drive id>
# EMAIL_CRM_ONEDRIVE_FOLDER=Sales/Inbound
```

## 5. Cron the poller

On the VPS, poke the poll endpoint every 5 minutes:

```
*/5 * * * * curl -s -X POST https://proposals.anc.com/api/intake/email-to-crm/poll -H "x-intake-token: $BOT_API_TOKEN" > /dev/null
```

The endpoint returns 503 with a clear message until step 4 is done, so the
cron entry is safe to add early.

## What the pipeline does per email

1. Reads the unread message from the intake mailbox.
2. AI extracts venue, project, due dates, key facts — every date must be
   backed by a **verbatim quote** from the email or it is flagged
   `needs confirmation` and never written to the CRM.
3. Matches CRM opportunities by name tokens; decisive matches (score ≥ 0.75
   and ≥ 0.15 clear of the runner-up) auto-apply; ambiguous ones wait in
   `/admin/email-to-crm`.
4. Applying = update `proposalDueDate` (only when it actually changes) +
   timeline note with deadlines, key info, sender, and attachment list.
5. Files attachments into `EMAIL_CRM_ONEDRIVE_FOLDER/<venue>/` and marks the
   message read.

## 6. Slack bid alerts (Jireh ask 2026-08-12)

Every processed email can also announce itself in Slack — venue, project, the
bid due date with its verbatim quote, attachments, and either a link to the CRM
opportunity it was logged on or a link to the review queue when a human has to
confirm the deal.

Env on the app service:

| Var | Required | What it does |
|---|---|---|
| `SLACK_BOT_TOKEN` | yes | Bot token for the ANC workspace (`@anc`). No token = alerts are a silent no-op. |
| `EMAIL_CRM_SLACK_CHANNEL` | no | Catch-all channel for emails whose venue matches no pursuit channel. |
| `EMAIL_CRM_SLACK_CHANNEL_MAP` | no | Explicit overrides, `{"venue keyword":"C0123456"}`. Beats name matching. |

**Routing follows the workspace's own convention.** Sales keeps one channel per
pursuit — `#sales-bank-of-america-stadium-carolina-panthers` — so a venue of
"Bank of America Stadium" finds that channel with no configuration, and a new
pursuit routes itself the day someone opens its channel. Matching requires
*every* identifying word of the venue to appear in the channel name (generic
words like "stadium", "arena", "field" are ignored), so "America First Field"
can never land in the Bank of America channel.

Two things gate a channel actually receiving alerts:

- **Public channel** — works immediately (`chat:write.public`).
- **Private channel** — `/invite @anc` first. Until then the bot cannot even see
  the channel in the lookup, and that venue's alerts fall to the catch-all.

Engine: `services/intake/bidAlertSlack.ts`. Alerts fire on all four outcomes —
applied, draft created, pending review, and failed-to-read — because the failure
cases are exactly the ones that need a person. A Slack failure is logged and
never fails the intake; the CRM write is the product.
