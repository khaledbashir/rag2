#!/usr/bin/env bash
# Friday weekly / last-day-of-month monthly Closed-Won report sender.
#
# Installed to /usr/local/sbin/anc-crm-closed-won-report.sh and driven by
# /etc/cron.d/anc-crm-closed-won-reports. Kept in the repo so the scheduled
# job is reviewable and restorable rather than living only on the box.
#
# Usage: anc-crm-closed-won-report.sh <last7|monthToDate> [extra-query-string]
set -euo pipefail

PERIOD="${1:-last7}"
EXTRA_QUERY="${2:-}"
ENV_FILE="/root/.anc-secrets/crm-report.env"
STATUS_FILE="/var/log/anc-crm-closed-won-report.status"
ENDPOINT="https://proposals.anc.com/api/crm-reports/closed-won/send?period=${PERIOD}${EXTRA_QUERY}"

# Retry policy. Every observed miss (500s on 2026-06-26/06-30/07-03/07-17/07-24,
# a 502 on 07-30) was transient — the same call succeeded on a later attempt
# with no code change. A single-shot curl turned each blip into a silent week
# with no email, and the gap ran three weeks before anyone reported it.
ATTEMPTS=4
RETRY_DELAY=180

# DST-safe hour guard.
# Cron fires at multiple Berlin-local hours so this script runs at least
# once at the intended US Eastern target hour regardless of whether the US
# and EU are in or out of daylight saving. The guard skips any fire where
# the current Eastern hour is not the intended one.
ET_HOUR="$(TZ='America/New_York' date +'%H')"
TARGET_HOUR="08"
if [[ "${ET_HOUR}" != "${TARGET_HOUR}" ]]; then
  echo "$(date -Is) skipping period=${PERIOD} — ET hour is ${ET_HOUR}, target ${TARGET_HOUR}"
  exit 0
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

if [[ -z "${CRM_REPORT_SECRET:-}" ]]; then
  echo "CRM_REPORT_SECRET is not configured" >&2
  exit 1
fi

# Empty body so the endpoint falls back to its full default recipient list
# (CRM_CLOSED_WON_REPORT_RECIPIENTS env var, currently 22 recipients).
PAYLOAD='{}'

record_status() {
  printf '%s period=%s %s\n' "$(date -Is)" "${PERIOD}" "$1" > "${STATUS_FILE}" 2>/dev/null || true
}

for attempt in $(seq 1 "${ATTEMPTS}"); do
  echo "$(date -Is) sending closed-won report period=${PERIOD} attempt=${attempt}/${ATTEMPTS}"

  # No `-f`: it discards the response body, which is where the endpoint puts
  # its actual error message. Capture body and status separately instead.
  HTTP_CODE=0
  BODY="$(curl -sS -m 120 -X POST "${ENDPOINT}" \
    -H "x-crm-report-secret: ${CRM_REPORT_SECRET}" \
    -H "Content-Type: application/json" \
    --data "${PAYLOAD}" \
    -w $'\n%{http_code}' 2>&1)" || true
  HTTP_CODE="${BODY##*$'\n'}"
  BODY="${BODY%$'\n'*}"

  echo "${BODY}"

  # A skipped monthToDate run (not the last day of the month) is a success.
  if [[ "${HTTP_CODE}" == "200" && "${BODY}" == *'"ok":true'* ]]; then
    echo "$(date -Is) closed-won report period=${PERIOD} OK (http ${HTTP_CODE})"
    record_status "ok http=${HTTP_CODE} attempt=${attempt}"
    exit 0
  fi

  echo "$(date -Is) closed-won report period=${PERIOD} FAILED http=${HTTP_CODE} attempt=${attempt}/${ATTEMPTS}" >&2

  if [[ "${attempt}" -lt "${ATTEMPTS}" ]]; then
    sleep "${RETRY_DELAY}"
  fi
done

echo "$(date -Is) closed-won report period=${PERIOD} GAVE UP after ${ATTEMPTS} attempts — no email was sent" >&2
record_status "FAILED http=${HTTP_CODE} after ${ATTEMPTS} attempts"
exit 1
