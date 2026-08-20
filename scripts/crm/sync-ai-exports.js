#!/usr/bin/env node
/**
 * Sync the CRM AI's file output into the `ancAiExport` object, so the private
 * "AI Exports" page has something to query.
 *
 * WHY THIS EXISTS. Files the AI produces live in `core.file` (folder
 * `agent-chat`), a platform table with no GraphQL or REST surface — a front
 * component cannot read it, and neither can a logic function. So this job runs
 * where all three things it needs are reachable at once: the Twenty database,
 * APP_SECRET, and the API. That is inside the `abc_twenty` container. The host
 * wrapper `sync-ai-exports.sh` copies this file in and runs it.
 *
 * WHAT IT WRITES. One `ancAiExport` row per file, keyed on `fileId`
 * (= core.file.id). Rows are upserted, never duplicated, and rows whose source
 * file has been deleted are soft-deleted here too.
 *
 * DOWNLOAD LINKS. Twenty serves `/file/:folder/:id` only with a signed token
 * (FileByIdGuard rejects an unsigned request outright), and the tokens the AI
 * chat mints expire in a day. So this job mints its own: a legacy-format HS256
 * FILE token, which `JwtWrapperService.resolveVerificationKey` accepts for any
 * non-`kid` header by deriving sha256(APP_SECRET + workspaceId + 'FILE'). Links
 * are minted for TOKEN_DAYS and re-minted once they drop under REFRESH_UNDER
 * days of life, so a link on the page never goes stale — and never lives
 * forever either.
 *
 * Usage (inside the container):
 *   node sync-ai-exports.js            # sync
 *   node sync-ai-exports.js --dry-run  # report only, write nothing
 */

const crypto = require('crypto');
const { Client } = require('/app/node_modules/pg');
const jwt = require('/app/node_modules/jsonwebtoken');

const WORKSPACE_ID = 'd3fbc29a-a635-48b7-9d6e-250941677fd0';
const WORKSPACE_SCHEMA = 'workspace_cjspnkm8glh7iooo1gep8c1qo';
const FILE_FOLDER = 'agent-chat';

const TOKEN_DAYS = 30;
const REFRESH_UNDER_DAYS = 10;
const BATCH = 40;

const DRY_RUN = process.argv.includes('--dry-run');

const API_URL = (process.env.SYNC_API_URL || 'https://crm.ancsports.net').replace(/\/$/, '');
const API_KEY = process.env.SYNC_API_KEY || '';
const APP_SECRET = process.env.APP_SECRET || '';
const SERVER_URL = (process.env.SERVER_URL || API_URL).replace(/\/$/, '');

/* ---------- signed download links ---------- */

const fileTokenSecret = () =>
  crypto.createHash('sha256').update(`${APP_SECRET}${WORKSPACE_ID}FILE`).digest('hex');

const mintDownloadUrl = (fileId) => {
  const token = jwt.sign(
    { workspaceId: WORKSPACE_ID, fileId, sub: WORKSPACE_ID, type: 'FILE' },
    fileTokenSecret(),
    { algorithm: 'HS256', expiresIn: `${TOKEN_DAYS}d` },
  );
  const expiresAt = new Date(Date.now() + TOKEN_DAYS * 86400000).toISOString();
  return { url: `${SERVER_URL}/file/${FILE_FOLDER}/${fileId}?token=${token}`, expiresAt };
};

/* ---------- classification ---------- */

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[A-Za-z0-9]+)?$/i;

const MIME_TYPES = [
  [/wordprocessingml|msword/, 'TYPE_WORD', 'DOCX'],
  [/spreadsheetml|ms-excel|csv/, 'TYPE_EXCEL', 'XLSX'],
  [/pdf/, 'TYPE_PDF', 'PDF'],
  [/presentationml|ms-powerpoint/, 'TYPE_POWERPOINT', 'PPTX'],
  [/^image\//, 'TYPE_IMAGE', 'IMG'],
  [/json|xml/, 'TYPE_DATA', 'DATA'],
  [/^text\/|markdown/, 'TYPE_TEXT', 'TXT'],
];

const classifyType = (mimeType) => {
  for (const [re, value, ext] of MIME_TYPES) {
    if (re.test(mimeType || '')) return { value, ext };
  }
  return { value: 'TYPE_OTHER', ext: 'FILE' };
};

/**
 * Name a file the way a person would recognise it.
 *
 * Code-interpreter output stores the real name after the file id
 * (`<fileId>-Report.docx`) — that is the same convention the download route
 * recovers filenames from. Chat uploads keep theirs on the message part. What
 * is left is tool output written straight to the folder root under a bare uuid,
 * which genuinely has no name anywhere; those get a plain "Untitled <EXT>"
 * rather than an invented one, and the Chat column carries the context.
 */
const deriveName = (storagePath, messageFilename, ext) => {
  if (messageFilename && !UUID_ONLY.test(messageFilename)) return messageFilename;
  const base = storagePath.split('/').pop() || '';
  const stripped = base.replace(UUID_PREFIX, '');
  if (stripped && stripped !== base && !UUID_ONLY.test(stripped)) return stripped;
  if (base && !UUID_ONLY.test(base)) return base;
  return `Untitled ${ext}`;
};

/**
 * A file is an upload when a person attached it to a chat — that is the only
 * case where it hangs off a `user` message. Everything else in this folder was
 * produced by the AI: the code interpreter writes under its own sub-path, and
 * tools (PDF render, Word render) drop theirs at the folder root.
 */
const classifyOrigin = (storagePath, role) => {
  if (role === 'user') {
    return { direction: 'DIRECTION_UPLOAD', source: 'SOURCE_CHAT_UPLOAD' };
  }
  if (storagePath.startsWith(`${FILE_FOLDER}/code-interpreter/`)) {
    return { direction: 'DIRECTION_EXPORT', source: 'SOURCE_CODE_INTERPRETER' };
  }
  return {
    direction: 'DIRECTION_EXPORT',
    source: role === 'assistant' ? 'SOURCE_AI_TOOL' : 'SOURCE_UNKNOWN',
  };
};

/* ---------- source of truth: core.file, attributed back to a chat ---------- */

// Files are matched to the chat that produced them three ways, in order of
// certainty: the message part's own fileId (uploads), the minted URL echoed in
// a tool's output, and the URL retyped into the assistant's answer. The last
// two are how code-interpreter and render-tool output gets traced, since
// neither writes a fileId back onto the part. Once the matching message gives
// us a turnId, the exact user request and the final assistant text from that
// same turn are mirrored as Asked / Outcome for the export detail panel.
const SOURCE_QUERY = `
  WITH files AS (
    SELECT f.id, f.path, f.size, f."mimeType", f."createdAt"
    FROM core.file f
    WHERE f."workspaceId" = $1
      AND f.path LIKE '${FILE_FOLDER}/%'
      AND f.path NOT LIKE '${FILE_FOLDER}/tool-output-spill/%'
      AND f."deletedAt" IS NULL
  )
  SELECT
    files.id, files.path, files.size, files."mimeType", files."createdAt",
    att.role, att."threadId", att."fileFilename",
    th.title AS "threadTitle",
    req."requestText", req."requestAttachments",
    outcome."outcomeText",
    u.email,
    wm.id AS "memberId", wm."nameFirstName", wm."nameLastName"
  FROM files
  LEFT JOIN LATERAL (
    SELECT
      m.role::text AS role,
      m."threadId",
      m."turnId",
      mp."fileFilename"
    FROM core."agentMessagePart" mp
    JOIN core."agentMessage" m ON m.id = mp."messageId"
    WHERE mp."workspaceId" = $1
      AND (
        mp."fileId" = files.id
        OR mp."textContent" LIKE '%' || files.id::text || '%'
        OR mp."toolOutput"::text LIKE '%' || files.id::text || '%'
      )
    ORDER BY (mp."fileId" = files.id) DESC, m."createdAt" ASC
    LIMIT 1
  ) att ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      string_agg(mp."textContent", E'\n\n' ORDER BY m."createdAt", mp."orderIndex")
        FILTER (WHERE NULLIF(BTRIM(mp."textContent"), '') IS NOT NULL) AS "requestText",
      string_agg(mp."fileFilename", E'\n' ORDER BY m."createdAt", mp."orderIndex")
        FILTER (WHERE NULLIF(BTRIM(mp."fileFilename"), '') IS NOT NULL)
        AS "requestAttachments"
    FROM core."agentMessage" m
    JOIN core."agentMessagePart" mp ON mp."messageId" = m.id
    WHERE m."threadId" = att."threadId"
      AND m."turnId" = att."turnId"
      AND m.role = 'user'
  ) req ON TRUE
  LEFT JOIN LATERAL (
    SELECT mp."textContent" AS "outcomeText"
    FROM core."agentMessage" m
    JOIN core."agentMessagePart" mp ON mp."messageId" = m.id
    WHERE m."threadId" = att."threadId"
      AND m."turnId" = att."turnId"
      AND m.role = 'assistant'
      AND NULLIF(BTRIM(mp."textContent"), '') IS NOT NULL
    ORDER BY m."createdAt" DESC, mp."orderIndex" DESC
    LIMIT 1
  ) outcome ON TRUE
  LEFT JOIN core."agentChatThread" th ON th.id = att."threadId"
  LEFT JOIN core."userWorkspace" uw ON uw.id = th."userWorkspaceId"
  LEFT JOIN core."user" u ON u.id = uw."userId"
  LEFT JOIN ${WORKSPACE_SCHEMA}."workspaceMember" wm ON wm."userId" = u.id
  ORDER BY files."createdAt" DESC
`;

/* ---------- Twenty API ---------- */

async function gql(query, variables) {
  const res = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors && body.errors.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }
  return body.data;
}

async function loadExistingRows() {
  const rows = new Map();
  let after = null;
  for (let page = 0; page < 60; page++) {
    const data = await gql(
      `query($after: String) {
        ancAiExports(first: 200, after: $after, orderBy: { id: AscNullsLast }) {
          edges {
            node {
              id fileId urlExpiresAt exportedByMemberId
              requestText requestAttachments outcomeText
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );
    const conn = data.ancAiExports;
    for (const edge of conn.edges) rows.set(edge.node.fileId, edge.node);
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return rows;
}

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/* ---------- main ---------- */

async function main() {
  if (!APP_SECRET) throw new Error('APP_SECRET is not set — run this inside the CRM container');
  if (!API_KEY && !DRY_RUN) throw new Error('SYNC_API_KEY is not set');

  const db = new Client({ connectionString: process.env.PG_DATABASE_URL });
  await db.connect();
  const { rows: files } = await db.query(SOURCE_QUERY, [WORKSPACE_ID]);
  await db.end();

  const desired = files.map((f) => {
    const { value: fileType, ext } = classifyType(f.mimeType);
    const { direction, source } = classifyOrigin(f.path, f.role);
    const person = [f.nameFirstName, f.nameLastName].filter(Boolean).join(' ').trim();
    return {
      fileId: f.id,
      name: deriveName(f.path, f.fileFilename, ext),
      fileType,
      direction,
      source,
      exportedAt: new Date(f.createdAt).toISOString(),
      exportedByName: person || null,
      exportedByEmail: f.email || null,
      // Security anchor. Every human role carries a row-level predicate
      // comparing this to the viewer's own workspaceMember id, so this being
      // wrong or blank is the difference between a person seeing their own
      // exports and seeing none. A file we could not trace stays null on
      // purpose — unattributed rows belong to nobody and are visible only
      // through the owner's unrestricted page.
      exportedByMemberId: f.memberId || null,
      threadTitle: f.threadTitle || null,
      threadId: f.threadId || null,
      requestText: f.requestText || null,
      requestAttachments: f.requestAttachments || null,
      outcomeText: f.outcomeText || null,
      sizeBytes: Number(f.size),
      storagePath: f.path,
    };
  });

  const exportsCount = desired.filter((d) => d.direction === 'DIRECTION_EXPORT').length;
  const attributed = desired.filter((d) => d.exportedByName).length;
  const withRequest = desired.filter((d) => d.requestText).length;
  const withOutcome = desired.filter((d) => d.outcomeText).length;
  console.log(
    `source: ${desired.length} files (${exportsCount} exports, ` +
      `${desired.length - exportsCount} uploads), ${attributed} attributed to a person, ` +
      `${withRequest} with request text, ${withOutcome} with an outcome`,
  );

  if (DRY_RUN) {
    for (const d of desired.slice(0, 10)) {
      console.log(
        `  ${d.exportedAt.slice(0, 10)}  ${d.fileType.replace('TYPE_', '').padEnd(11)} ` +
          `${(d.exportedByName || '—').padEnd(18)} ${d.name}`,
      );
    }
    console.log('dry run — nothing written');
    return;
  }

  const existing = await loadExistingRows();

  const refreshCutoff = Date.now() + REFRESH_UNDER_DAYS * 86400000;
  const toCreate = [];
  const toUpdate = [];

  // The link is stored twice on purpose: as TEXT for the owner's page, and as a
  // LINKS field so it is actually clickable in an ordinary CRM view — which is
  // the surface everyone else gets.
  const withLink = (d) => {
    const { url, expiresAt } = mintDownloadUrl(d.fileId);
    return {
      ...d,
      downloadUrl: url,
      urlExpiresAt: expiresAt,
      download: { primaryLinkUrl: url, primaryLinkLabel: d.name, secondaryLinks: [] },
    };
  };

  for (const d of desired) {
    const current = existing.get(d.fileId);
    if (!current) {
      toCreate.push(withLink(d));
      continue;
    }
    const expiry = current.urlExpiresAt ? new Date(current.urlExpiresAt).getTime() : 0;
    const conversationChanged =
      current.requestText !== d.requestText ||
      current.requestAttachments !== d.requestAttachments ||
      current.outcomeText !== d.outcomeText;
    // Re-mint before the link runs low, repair a row whose member anchor is
    // missing or has drifted, and keep the exact request/outcome mirror current
    // when a streaming response finishes after an earlier sync pass.
    if (
      expiry < refreshCutoff ||
      current.exportedByMemberId !== d.exportedByMemberId ||
      conversationChanged
    ) {
      toUpdate.push({ id: current.id, data: withLink(d) });
    }
  }

  const desiredIds = new Set(desired.map((d) => d.fileId));
  const stale = [...existing.values()].filter((row) => !desiredIds.has(row.fileId));

  for (const batch of chunk(toCreate, BATCH)) {
    await gql(
      `mutation($data: [AncAiExportCreateInput!]!) {
        createAncAiExports(data: $data) { id }
      }`,
      { data: batch },
    );
  }

  for (const item of toUpdate) {
    await gql(
      `mutation($id: UUID!, $data: AncAiExportUpdateInput!) {
        updateAncAiExport(id: $id, data: $data) { id }
      }`,
      item,
    );
  }

  for (const row of stale) {
    await gql(`mutation($id: UUID!) { deleteAncAiExport(id: $id) { id } }`, { id: row.id });
  }

  console.log(
    `synced: +${toCreate.length} new, ~${toUpdate.length} links refreshed, ` +
      `-${stale.length} removed, ${existing.size + toCreate.length - stale.length} total`,
  );
}

main().catch((error) => {
  console.error(`sync-ai-exports failed: ${error.message}`);
  process.exit(1);
});
