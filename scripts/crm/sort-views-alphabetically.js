/*
 * ANC — put every object's saved views in alphabetical order.
 *
 * Jireh Billings, 2026-08-20: "make it alphabetically sorted, so at least some
 * way organized."
 *
 * The view picker renders views in core."view".position order. Opportunity had
 * 65 views of which 26 sat at position 0, so the order users saw was whatever
 * the tie-break happened to be that request. This assigns each object's views a
 * distinct position matching their alphabetical rank, which fixes the ordering
 * everywhere views are listed — not just in the dropdown.
 *
 * Writes go through the updateView metadata mutation rather than SQL so the
 * metadata cache is busted for us (a direct UPDATE would serve stale until a
 * service restart).
 *
 * Usage:
 *   node sort-views-alphabetically.js --check    (report only, writes nothing)
 *   node sort-views-alphabetically.js --apply
 *
 * Reversible from /root/twenty-backups/view-positions-before-<date>.csv.
 */
'use strict';

const fs = require('fs');

const ENDPOINT = 'https://crm.ancsports.net/metadata';
const TOKEN = fs.readFileSync(process.env.ANC_TOKEN_FILE, 'utf8').trim();

const APPLY = process.argv.includes('--apply');

/* Views the picker never renders — the record-page field rail lives in the same
   table but has no ordering to speak of. */
const PICKER_TYPES = new Set(['TABLE', 'KANBAN', 'CALENDAR']);

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

async function gql(query, variables) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

async function listObjects() {
  const data = await gql(`
    query {
      objects(paging: { first: 500 }) {
        edges { node { id namePlural labelPlural isActive } }
      }
    }
  `);

  return data.objects.edges.map((edge) => edge.node).filter((node) => node.isActive);
}

async function listViews(objectMetadataId) {
  const data = await gql(
    `query ($objectMetadataId: String!) {
       getViews(objectMetadataId: $objectMetadataId) { id name position type }
     }`,
    { objectMetadataId },
  );

  return data.getViews;
}

async function setPosition(id, position) {
  await gql(
    `mutation ($id: String!, $position: Float!) {
       updateView(id: $id, input: { position: $position }) { id position }
     }`,
    { id, position },
  );
}

async function main() {
  const objects = await listObjects();
  let touched = 0;
  let scanned = 0;
  const report = [];

  for (const object of objects) {
    const views = (await listViews(object.id)).filter((view) =>
      PICKER_TYPES.has(view.type),
    );

    if (views.length < 2) continue;
    scanned += views.length;

    const sorted = views.slice().sort((a, b) => collator.compare(a.name, b.name));
    const changes = [];

    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index].position !== index) {
        changes.push({ view: sorted[index], position: index });
      }
    }

    if (!changes.length) continue;

    report.push(`${object.labelPlural}: ${changes.length}/${views.length} repositioned`);

    for (const change of changes) {
      if (APPLY) await setPosition(change.view.id, change.position);
      touched += 1;
    }
  }

  console.log(report.join('\n'));
  console.log(
    `\n${APPLY ? 'Applied' : 'Would apply'}: ${touched} position changes across ${scanned} picker views.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
