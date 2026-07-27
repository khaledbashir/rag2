import type { Pool } from "pg";

// The production ANC workspace on crm.ancsports.net. The Twenty instance is
// multi-workspace ("ANC Sandbox" and "Salesforce Archive / Legacy Data" exist
// alongside it with EARLIER backdated createdAt values), so any
// "order by createdAt limit 1" heuristic resolves the wrong schema — that
// broke the weekly closed-won report from 2026-07-17 until this module
// (`column o.opportunityNumber does not exist`). Resolve by workspace id only.
const ANC_WORKSPACE_ID = "d3fbc29a-a635-48b7-9d6e-250941677fd0";

const schemaCache = new Map<string, string>();

export async function resolveAncWorkspaceSchema(pool: Pool): Promise<string> {
  const workspaceId = process.env.TWENTY_WORKSPACE_ID?.trim() || ANC_WORKSPACE_ID;
  const cached = schemaCache.get(workspaceId);
  if (cached) return cached;

  const result = await pool.query<{ databaseSchema: string }>(
    `select "databaseSchema"
     from core.workspace
     where id = $1
       and "deletedAt" is null
       and "databaseSchema" is not null
     limit 1`,
    [workspaceId],
  );

  const schema = result.rows[0]?.databaseSchema;
  if (!schema || !/^workspace_[a-z0-9_]+$/i.test(schema)) {
    throw new Error(`Could not resolve Twenty workspace schema for workspace ${workspaceId}`);
  }

  schemaCache.set(workspaceId, schema);
  return schema;
}
