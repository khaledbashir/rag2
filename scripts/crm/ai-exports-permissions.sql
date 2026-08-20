-- AI Exports — who can see whose exports.
--
-- Jireh, 2026-08-20: "What if I need confidential information? I don't want
-- everyone to have access to my exports ... Could we make it specific to each
-- user?" — and, on Ahmad keeping oversight, "You are fine!"
--
-- So: every member can open AI Exports and sees ONLY their own files. Ahmad
-- (Founder) sees everything.
--
-- This is enforced by Twenty's native row-level permissions, not by the page.
-- `applyRowLevelPermissionPredicates` injects the predicate into the TypeORM
-- query builder for any USER auth context, so the scoping holds through the UI,
-- the REST and GraphQL APIs, and anything Scout runs on that person's behalf.
-- It deliberately does NOT apply to application or API-key contexts (they have
-- no workspace member), which is what keeps the owner's page and the sync job
-- working.
--
-- The predicate compares `ancAiExport.exportedByMemberId` against the VIEWER's
-- own `workspaceMember.id` — that is what `workspaceMemberFieldMetadataId`
-- means. Rows we could not trace to a person (35 at launch) match nobody and
-- stay owner-only, which is the safe direction.
--
-- Roles deliberately NOT granted read at all: Client, Client Portal User,
-- Britten Fabricator (external), and the app/function service roles. If it is
-- not listed here, it cannot see the object.
--
-- Re-runnable. Safe to apply repeatedly.
--   docker exec <abc_twenty> psql ... -f ai-exports-permissions.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _cfg AS SELECT
  'd3fbc29a-a635-48b7-9d6e-250941677fd0'::uuid AS workspace_id,
  '878b1a3c-8932-4853-988f-c82c45ee831f'::uuid AS application_id,
  'c34881c2-2557-4982-b29a-0148964d4df5'::uuid AS object_id,
  -- ancAiExport.exportedByMemberId — the security anchor the sync writes.
  '51a2425d-b651-4a0a-9339-d6febc605136'::uuid AS anchor_field_id,
  -- workspaceMember.id — resolved per request to whoever is asking.
  'ba62c436-3548-48c6-801d-99d1713b71b4'::uuid AS viewer_field_id;

-- Human roles that get the page. Founder is Ahmad and is intentionally absent
-- from the scoped set below.
CREATE TEMP TABLE _scoped_roles AS
SELECT r.id, r.label FROM core.role r, _cfg c
WHERE r."workspaceId" = c.workspace_id
  AND r.label IN ('Sales','Operations','Operator','Intern','User Manager','Admin','Executive','Member');

CREATE TEMP TABLE _owner_roles AS
SELECT r.id, r.label FROM core.role r, _cfg c
WHERE r."workspaceId" = c.workspace_id AND r.label = 'Founder';

-- 1. Read access. Read-only for people: the registry is a mirror, and editing a
--    row here would only be overwritten by the next sync pass.
--
--    Admin is the exception and MUST keep write. Every automation API key in
--    this workspace is targeted at the Admin role, including the one the sync
--    job authenticates with — making Admin read-only here silently breaks the
--    sync with "Entity performing the request does not have permission".
--    It costs nothing in confidentiality: object permissions gate the verb,
--    row-level predicates gate the rows, and a human on Admin still only ever
--    sees (and so can only ever touch) their own exports.
INSERT INTO core."objectPermission"
  (id, "universalIdentifier", "workspaceId", "applicationId", "roleId", "objectMetadataId",
   "canReadObjectRecords", "canUpdateObjectRecords", "canSoftDeleteObjectRecords", "canDestroyObjectRecords")
SELECT gen_random_uuid(), gen_random_uuid(), c.workspace_id, c.application_id, r.id, c.object_id,
       true, r.writes, r.writes, r.writes
FROM (
  SELECT id, label = 'Admin' AS writes FROM _scoped_roles
  UNION ALL
  SELECT id, true AS writes FROM _owner_roles
) r, _cfg c
ON CONFLICT ("objectMetadataId", "roleId") DO UPDATE
  SET "canReadObjectRecords" = true,
      "canUpdateObjectRecords" = EXCLUDED."canUpdateObjectRecords",
      "canSoftDeleteObjectRecords" = EXCLUDED."canSoftDeleteObjectRecords",
      "canDestroyObjectRecords" = EXCLUDED."canDestroyObjectRecords",
      "updatedAt" = now();

-- 2. One predicate group per scoped role, holding the single scoping rule.
INSERT INTO core."rowLevelPermissionPredicateGroup"
  (id, "universalIdentifier", "workspaceId", "applicationId", "roleId", "objectMetadataId",
   "logicalOperator", "positionInRowLevelPermissionPredicateGroup")
SELECT gen_random_uuid(), gen_random_uuid(), c.workspace_id, c.application_id, r.id, c.object_id,
       'AND', 0
FROM _scoped_roles r, _cfg c
WHERE NOT EXISTS (
  SELECT 1 FROM core."rowLevelPermissionPredicateGroup" g
  WHERE g."roleId" = r.id AND g."objectMetadataId" = c.object_id AND g."deletedAt" IS NULL
);

-- 3. The rule: this row's member anchor matches the viewer's own member id.
--    CONTAINS, not IS: Twenty rejects the IS operand on a TEXT filter
--    ("Unknown operand IS for TEXT filter"). Against a uuid this is still exact
--    equality — one uuid cannot be a substring of a different uuid — and an
--    empty anchor matches nobody, which fails closed.
INSERT INTO core."rowLevelPermissionPredicate"
  (id, "universalIdentifier", "workspaceId", "applicationId", "roleId", "objectMetadataId",
   "fieldMetadataId", operand, value, "workspaceMemberFieldMetadataId",
   "rowLevelPermissionPredicateGroupId", "positionInRowLevelPermissionPredicateGroup")
SELECT gen_random_uuid(), gen_random_uuid(), c.workspace_id, c.application_id, r.id, c.object_id,
       c.anchor_field_id, 'CONTAINS', NULL, c.viewer_field_id, g.id, 0
FROM _scoped_roles r
CROSS JOIN _cfg c
JOIN core."rowLevelPermissionPredicateGroup" g
  ON g."roleId" = r.id AND g."objectMetadataId" = c.object_id AND g."deletedAt" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM core."rowLevelPermissionPredicate" p
  WHERE p."roleId" = r.id AND p."objectMetadataId" = c.object_id AND p."deletedAt" IS NULL
);

COMMIT;

-- What landed.
SELECT r.label,
       op."canReadObjectRecords" AS can_read,
       count(p.id) FILTER (WHERE p."deletedAt" IS NULL) AS scoping_rules,
       CASE WHEN count(p.id) FILTER (WHERE p."deletedAt" IS NULL) = 0
            THEN 'SEES EVERYTHING' ELSE 'own exports only' END AS effect
FROM core."objectPermission" op
JOIN core.role r ON r.id = op."roleId"
LEFT JOIN core."rowLevelPermissionPredicate" p
  ON p."roleId" = op."roleId" AND p."objectMetadataId" = op."objectMetadataId"
WHERE op."objectMetadataId" = 'c34881c2-2557-4982-b29a-0148964d4df5'
GROUP BY r.label, op."canReadObjectRecords"
ORDER BY effect, r.label;
