#!/usr/bin/env python3
"""Install or verify the ANC Sales AI skill suite in Scout's live CRM workspace."""

from __future__ import annotations

import argparse
import re
import subprocess
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SKILLS_ROOT = ROOT / "pdf-triage-service" / "anc-sales-skills"
WORKSPACE_ID = "d3fbc29a-a635-48b7-9d6e-250941677fd0"
BACKUP_TABLE = "skill_backup_20260823_anc_sales_ai"

SKILLS = (
    ("anc-sales-brain", "ANC Sales Brain", "IconBrain"),
    ("anc-sales-control-panel", "ANC Sales Control Panel", "IconChartBar"),
    ("anc-list-builder", "ANC List Builder", "IconListCheck"),
    ("anc-company-researcher", "ANC Company Researcher", "IconBuildingSkyscraper"),
    ("anc-cold-email-builder", "ANC Cold Email Builder", "IconMail"),
)


def database_container() -> str:
    output = subprocess.check_output(
        ["docker", "ps", "--format", "{{.Names}}", "--filter", "name=abc_twenty-db.1"],
        text=True,
    )
    matches = [line.strip() for line in output.splitlines() if line.strip()]
    if len(matches) != 1:
        raise SystemExit(f"Expected one live ANC CRM database container, found {len(matches)}")
    return matches[0]


def run_sql(sql: str, *, tuples_only: bool = False) -> str:
    command = [
        "docker",
        "exec",
        "-i",
        database_container(),
        "psql",
        "-U",
        "postgres",
        "-d",
        "abc",
        "-v",
        "ON_ERROR_STOP=1",
        "-P",
        "pager=off",
    ]
    if tuples_only:
        command.extend(["-t", "-A"])
    result = subprocess.run(command, input=sql, text=True, check=True, capture_output=True)
    return result.stdout.strip()


def load_skill(slug: str) -> tuple[str, str]:
    text = (SKILLS_ROOT / slug / "SKILL.md").read_text(encoding="utf-8")
    match = re.match(r"^---\n(?P<frontmatter>.*?)\n---\n(?P<body>.*)$", text, re.DOTALL)
    if not match:
        raise SystemExit(f"Invalid frontmatter in {slug}/SKILL.md")
    description_match = re.search(r"^description:\s*(.+)$", match.group("frontmatter"), re.MULTILINE)
    if not description_match:
        raise SystemExit(f"Missing description in {slug}/SKILL.md")
    return description_match.group(1).strip(), match.group("body").strip() + "\n"


def dollar_quote(value: str, prefix: str) -> str:
    tag = f"{prefix}_{uuid.uuid4().hex}"
    marker = f"${tag}$"
    if marker in value:
        raise SystemExit("Generated SQL delimiter unexpectedly appears in skill content")
    return f"{marker}{value}{marker}"


def install() -> None:
    names = ", ".join(f"'{slug}'" for slug, _, _ in SKILLS)
    statements = [
        "BEGIN;",
        f'CREATE TABLE IF NOT EXISTS core."{BACKUP_TABLE}" (LIKE core.skill INCLUDING ALL);',
        (
            f'INSERT INTO core."{BACKUP_TABLE}" SELECT * FROM core.skill '
            f'WHERE "workspaceId" = \'{WORKSPACE_ID}\'::uuid AND name IN ({names}) '
            'ON CONFLICT (id) DO NOTHING;'
        ),
    ]

    for slug, label, icon in SKILLS:
        description, content = load_skill(slug)
        statements.append(
            f"""
WITH scout_app AS (
  SELECT "applicationId"
  FROM core.agent
  WHERE name = 'scout'
    AND "workspaceId" = '{WORKSPACE_ID}'::uuid
    AND "deletedAt" IS NULL
  LIMIT 1
)
INSERT INTO core.skill (
  id, "universalIdentifier", "applicationId", "workspaceId",
  name, label, icon, description, content, "isCustom", "isActive",
  "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v4(), uuid_generate_v4(), scout_app."applicationId", '{WORKSPACE_ID}'::uuid,
  '{slug}', {dollar_quote(label, 'label')}, {dollar_quote(icon, 'icon')},
  {dollar_quote(description, 'description')}, {dollar_quote(content, 'content')},
  true, true, now(), now()
FROM scout_app
ON CONFLICT (name, "workspaceId") WHERE "isActive" = true
DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  content = EXCLUDED.content,
  "isCustom" = true,
  "isActive" = true,
  "updatedAt" = now();
""".strip()
        )

    statements.append("COMMIT;")
    run_sql("\n\n".join(statements))


def verify() -> None:
    names = ", ".join(f"'{slug}'" for slug, _, _ in SKILLS)
    output = run_sql(
        f"""
SELECT name || '|' || label || '|' || "isActive" || '|' || length(content)
FROM core.skill
WHERE "workspaceId" = '{WORKSPACE_ID}'::uuid
  AND name IN ({names})
ORDER BY name;
""",
        tuples_only=True,
    )
    rows = [line for line in output.splitlines() if line]
    if len(rows) != len(SKILLS):
        raise SystemExit(f"Expected {len(SKILLS)} skills, found {len(rows)}\n{output}")
    if any("|true|" not in row and "|t|" not in row for row in rows):
        raise SystemExit(f"At least one ANC Sales AI skill is inactive\n{output}")
    print(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Upsert the five live Scout skills")
    args = parser.parse_args()
    if args.apply:
        install()
    verify()


if __name__ == "__main__":
    main()
