#!/usr/bin/env bash
# Safe margin/revenue rollup backstop.
# The live rollup (logic fn rollup-opportunity-totals) sums the per-FY revenue/margin
# fields into totalProjectRevenue/totalProjectMargin, but has no retry — a transient
# miss leaves totalProject at its old value (Alexis 2026-07-06: FY2026 margin set,
# Total Project Margin stayed $0).
#
# CRITICAL SAFETY: totalProjectRevenue/Margin are DUAL-PURPOSE — also the Salesforce
# Actual mirror on ~3,900 legacy opps. So this ONLY fills a field that is NULL/0 while
# its FY breakdown is non-zero (the unambiguous "rollup missed" case). It NEVER
# overwrites a non-zero value, so it cannot clobber real SF financials. Each field
# (revenue, margin) is handled independently.
set -uo pipefail

KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
BASE="https://crm.ancsports.net"
SCHEMA="workspace_cjspnkm8glh7iooo1gep8c1qo"
LOG="/var/log/anc-margin-rollup-backstop.log"

CID=$(docker ps --format '{{.ID}} {{.Names}}' | grep -E 'abc_twenty\.' | grep -viE 'worker|redis|db' | head -1 | awk '{print $1}')
if [ -z "$CID" ]; then echo "$(date -Is) ERROR no twenty container" >>"$LOG"; exit 0; fi
q() { printf '%s' "$1" | docker exec -i "$CID" sh -c 'psql "$PG_DATABASE_URL" -At -f -' 2>/dev/null; }

REVSUM="(COALESCE(\"revenue2025AmountMicros\",0)+COALESCE(\"revenue2026AmountMicros\",0)+COALESCE(\"revenue2027AmountMicros\",0)+COALESCE(\"revenue2028AmountMicros\",0)+COALESCE(\"revenue2029AmountMicros\",0)+COALESCE(\"revenue2030AmountMicros\",0)+COALESCE(\"revenue2031AmountMicros\",0)+COALESCE(\"revenue2032AmountMicros\",0)+COALESCE(\"revenue2033AmountMicros\",0)+COALESCE(\"revenue2034AmountMicros\",0)+COALESCE(\"revenue2035AmountMicros\",0)+COALESCE(\"revenue2036AmountMicros\",0))"
MARSUM="(COALESCE(\"margin2025AmountMicros\",0)+COALESCE(\"margin2026AmountMicros\",0)+COALESCE(\"margin2027AmountMicros\",0)+COALESCE(\"margin2028AmountMicros\",0)+COALESCE(\"margin2029AmountMicros\",0)+COALESCE(\"margin2030AmountMicros\",0)+COALESCE(\"margin2031AmountMicros\",0)+COALESCE(\"margin2032AmountMicros\",0)+COALESCE(\"margin2033AmountMicros\",0)+COALESCE(\"margin2034AmountMicros\",0)+COALESCE(\"margin2035AmountMicros\",0)+COALESCE(\"margin2036AmountMicros\",0))"

# id | need_rev(0/1) | revsum | need_mar(0/1) | marsum | currency
ROWS=$(q "SELECT id
  ||'|'|| (CASE WHEN COALESCE(\"totalProjectRevenueAmountMicros\",0)=0 AND $REVSUM<>0 THEN 1 ELSE 0 END)
  ||'|'|| $REVSUM
  ||'|'|| (CASE WHEN COALESCE(\"totalProjectMarginAmountMicros\",0)=0 AND $MARSUM<>0 THEN 1 ELSE 0 END)
  ||'|'|| $MARSUM
  ||'|'|| COALESCE(NULLIF(\"totalProjectRevenueCurrencyCode\",''), NULLIF(\"totalProjectMarginCurrencyCode\",''), 'USD')
  FROM $SCHEMA.opportunity
  WHERE \"deletedAt\" IS NULL
    AND ( (COALESCE(\"totalProjectRevenueAmountMicros\",0)=0 AND $REVSUM<>0)
       OR (COALESCE(\"totalProjectMarginAmountMicros\",0)=0 AND $MARSUM<>0) )
  AND \"updatedAt\" < now() - interval '2 minutes';")

[ -z "$ROWS" ] && exit 0

while IFS='|' read -r id needRev revSum needMar marSum ccy; do
  [ -z "$id" ] && continue
  fields=""
  [ "$needRev" = "1" ] && fields="\"totalProjectRevenue\":{\"amountMicros\":$revSum,\"currencyCode\":\"$ccy\"}"
  if [ "$needMar" = "1" ]; then
    [ -n "$fields" ] && fields="$fields,"
    fields="$fields\"totalProjectMargin\":{\"amountMicros\":$marSum,\"currencyCode\":\"$ccy\"}"
  fi
  [ -z "$fields" ] && continue
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/rest/opportunities/$id" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" --data "{$fields}")
  if [ "$code" = "200" ]; then
    echo "$(date -Is) filled rev=$needRev($revSum) mar=$needMar($marSum) -> $id" >>"$LOG"
  else
    echo "$(date -Is) FAILED ($code) -> $id" >>"$LOG"
  fi
  sleep 0.4
done <<< "$ROWS"
