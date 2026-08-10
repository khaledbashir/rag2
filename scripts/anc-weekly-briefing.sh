#!/usr/bin/env bash
# Weekly "Your Week in Focus" briefing trigger (Jireh + Joe).
#
# Runs hourly. The endpoint owns the schedule: it delivers once per week, at or
# after Sunday 4:00 PM America/New_York, and skips every other hour. Keeping the
# schedule server-side makes delivery independent of this host's timezone and of
# EST/EDT changes.
#
# WHY THIS IS A SCRIPT AND NOT AN INLINE CRON COMMAND:
# crontab treats '%' as a metacharacter — it truncates the command at the first
# unescaped '%' and pipes the remainder to stdin. A curl --write-out format such
# as '%{http_code}' silently amputated the command mid-string, leaving an
# unterminated quote that sh refused to run. 167 firings between 2026-08-03 and
# 2026-08-10 executed nothing at all, including Sunday 2026-08-09 at 4 PM ET,
# and wrote no log line because the redirect lived past the cut. Percent signs
# belong in a script file, where they mean what they say.

set -uo pipefail

ENDPOINT="https://proposals.anc.com/api/briefing/weekly/run"
TOKEN_FILE="/root/.anc-intake-token"
LOG="/var/log/weekly-briefing.log"
BODY_FILE="/tmp/weekly-briefing-body.json"

if [[ ! -r "$TOKEN_FILE" ]]; then
  printf '%s briefing ERROR: token file %s is missing or unreadable\n' \
    "$(date -u +%FT%TZ)" "$TOKEN_FILE" >> "$LOG"
  exit 1
fi
TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"

http_code="$(
  curl -s -m 280 \
    -o "$BODY_FILE" \
    -w '%{http_code}' \
    -X POST "$ENDPOINT" \
    -H "x-intake-token: ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"scheduled":true}'
)"
curl_exit=$?

body="$(head -c 600 "$BODY_FILE" 2>/dev/null || true)"

if [[ $curl_exit -ne 0 ]]; then
  printf '%s briefing TRANSPORT-FAIL curl_exit=%s\n' "$(date -u +%FT%TZ)" "$curl_exit" >> "$LOG"
  exit 1
fi

# A skip is the expected answer 167 hours out of 168 — log it compactly so the
# weekly signal stays readable, and keep the full body on anything else.
if [[ "$http_code" == "200" && "$body" == *'"skipped":true'* ]]; then
  printf '%s briefing skip (status=%s)\n' "$(date -u +%FT%TZ)" "$http_code" >> "$LOG"
  exit 0
fi

printf '%s briefing status=%s body=%s\n' "$(date -u +%FT%TZ)" "$http_code" "$body" >> "$LOG"

[[ "$http_code" == "200" ]] || exit 1
