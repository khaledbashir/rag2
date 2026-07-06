#!/usr/bin/env bash
# Safety-net for Opportunity Number auto-populate.
# The live generator is logic function `auto-number-opp` (fires on opportunity.created),
# but it has no retry — a transient event-delivery/API timeout occasionally leaves a new
# deal with a blank number (Krissy 2026-05-29, Alexis 2026-07-06). This sweep runs every
# ~10 min and stamps any live opp that is still numberless after a 2-minute grace window
# (so it never races the live generator). Idempotent: only touches null/empty numbers.
set -uo pipefail

KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
BASE="https://crm.ancsports.net"
SCHEMA="workspace_cjspnkm8glh7iooo1gep8c1qo"
LOG="/var/log/anc-opp-number-backfill.log"

CID=$(docker ps --format '{{.ID}} {{.Names}}' | grep -E 'abc_twenty\.' | grep -viE 'worker|redis|db' | head -1 | awk '{print $1}')
if [ -z "$CID" ]; then echo "$(date -Is) ERROR no twenty container" >>"$LOG"; exit 0; fi

q() { printf '%s' "$1" | docker exec -i "$CID" sh -c 'psql "$PG_DATABASE_URL" -At -f -' 2>/dev/null; }

# Genuine misses: live opps, null/empty number, older than the 2-min grace window, oldest first.
MISSING=$(q "SELECT id FROM $SCHEMA.opportunity WHERE \"deletedAt\" IS NULL AND (\"opportunityNumber\" IS NULL OR \"opportunityNumber\"='') AND \"createdAt\" < now() - interval '2 minutes' ORDER BY \"createdAt\" ASC;")
[ -z "$MISSING" ] && exit 0

MAX=$(q "SELECT COALESCE(MAX((\"opportunityNumber\")::int),200000) FROM $SCHEMA.opportunity WHERE \"deletedAt\" IS NULL AND \"opportunityNumber\" ~ '^[0-9]{6}\$' AND (\"opportunityNumber\")::int BETWEEN 200000 AND 999999;")

n="$MAX"
while IFS= read -r id; do
  [ -z "$id" ] && continue
  n=$((n+1))
  num=$(printf '%06d' "$n")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/rest/opportunities/$id" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    --data "{\"opportunityNumber\":\"$num\"}")
  if [ "$code" = "200" ]; then
    echo "$(date -Is) assigned $num -> $id" >>"$LOG"
  else
    echo "$(date -Is) FAILED ($code) $num -> $id" >>"$LOG"
    n=$((n-1))  # don't burn the number on a failed patch
  fi
done <<< "$MISSING"
