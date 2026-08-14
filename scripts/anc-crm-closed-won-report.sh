#!/usr/bin/env bash
# Friday weekly / last-day-of-month monthly Closed-Won report sender.
#
# Installed to /usr/local/sbin/anc-crm-closed-won-report.sh and driven by
# /etc/cron.d/anc-crm-closed-won-reports. Kept in the repo so the scheduled job
# is reviewable and restorable rather than living only on the box.
#
# Usage: anc-crm-closed-won-report.sh <last7|monthToDate> [extra-query-string]
#        CATCHUP=1 anc-crm-closed-won-report.sh last7      # retry run, any hour
#
# History that shaped this script — six of the nine Fridays to 2026-08-14 never
# reached an inbox and nobody found out from the system:
#
#   06-19 502 · 06-26 500 · 07-03 500 · 07-17 500 · 07-24 500 · 08-14 skipped
#
# Three failures were fixed by hand days later, after a recipient asked where
# the report was. The three defects behind that silence, each addressed below:
#
#   1. Success was `"ok":true`, and a SKIPPED run returns exactly that. The
#      2026-08-14 run answered {"ok":true,"skipped":true,"locked":true} and was
#      recorded as OK. Delivery is now proven by a messageId, never by ok alone.
#   2. Giving up wrote to stderr and stopped. Nothing paged anyone, so a missed
#      week looked identical to a delivered one. Failures now alert on Slack.
#   3. The retry budget was four attempts over nine minutes. A deploy or a
#      restart lasting longer than that cost the whole week, with no later
#      attempt. A run is now claimed per period and retried until it lands.
set -euo pipefail

PERIOD="${1:-last7}"
EXTRA_QUERY="${2:-}"
ENV_FILE="/root/.anc-secrets/crm-report.env"
STATUS_FILE="/var/log/anc-crm-closed-won-report.status"
STATE_DIR="/var/lib/anc-crm-reports"
LOCK_FILE="${STATE_DIR}/${PERIOD}.lock"
ENDPOINT="https://proposals.anc.com/api/crm-reports/closed-won/send?period=${PERIOD}${EXTRA_QUERY}"

ATTEMPTS=4
RETRY_DELAY=180
TARGET_HOUR="08"

mkdir -p "${STATE_DIR}"

# One period, one delivery. The key is derived in US Eastern because that is the
# clock the schedule is expressed in: an ISO week for the Friday report, a
# calendar month for the monthly one. Once the key is marked delivered, every
# later run this period is a no-op, which is what makes an aggressive catch-up
# schedule safe to point at a job that sends email to 22 people.
if [[ "${PERIOD}" == "monthToDate" ]]; then
  PERIOD_KEY="$(TZ='America/New_York' date +'%Y-%m')"
else
  PERIOD_KEY="$(TZ='America/New_York' date +'%G-W%V')"
fi
MARKER="${STATE_DIR}/${PERIOD}-${PERIOD_KEY}.delivered"

log() { echo "$(date -Is) $*"; }

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

# Alerting is what turns a silent miss into something a human sees. It must
# never be the reason a send fails, so every failure here is swallowed.
alert() {
  local text="$1"
  if [[ -z "${CRM_REPORT_ALERT_SLACK_TOKEN:-}" || -z "${CRM_REPORT_ALERT_SLACK_CHANNEL:-}" ]]; then
    echo "$(date -Is) ALERT (no Slack configured): ${text}" >&2
    return 0
  fi
  curl -sS -m 20 -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer ${CRM_REPORT_ALERT_SLACK_TOKEN}" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "$(python3 -c 'import json,sys; print(json.dumps({"channel": sys.argv[1], "text": sys.argv[2]}))' \
      "${CRM_REPORT_ALERT_SLACK_CHANNEL}" "${text}")" >/dev/null 2>&1 || true
}

record_status() {
  printf '%s period=%s %s\n' "$(date -Is)" "${PERIOD}" "$1" > "${STATUS_FILE}" 2>/dev/null || true
}

if [[ -f "${MARKER}" ]]; then
  log "period=${PERIOD} ${PERIOD_KEY} already delivered — nothing to do"
  exit 0
fi

# The scheduled fire targets 8 AM Eastern; cron fires at two Berlin hours so one
# of them lands on it whichever side of DST each side of the Atlantic is on. A
# catch-up run has already missed that window by definition, so it skips the
# guard — the marker above is what stops it double-sending.
ET_HOUR="$(TZ='America/New_York' date +'%H')"
ET_DOW="$(TZ='America/New_York' date +'%u')"   # 1=Mon … 5=Fri, 6=Sat

if [[ "${CATCHUP:-0}" != "1" ]]; then
  if [[ "${ET_HOUR}" != "${TARGET_HOUR}" ]]; then
    log "skipping period=${PERIOD} — ET hour is ${ET_HOUR}, target ${TARGET_HOUR}"
    exit 0
  fi
elif [[ "${PERIOD}" == "last7" ]]; then
  # The catch-up cron fires every half hour on every day so that no DST shift can
  # move the window out from under it; these two checks are what actually decide
  # when a retry is due. Friday before 9 AM Eastern is ahead of the scheduled
  # run, and sending then would land the report a day early.
  if [[ "${ET_DOW}" != "5" && "${ET_DOW}" != "6" ]]; then
    exit 0
  fi
  if [[ "${ET_DOW}" == "5" && "${ET_HOUR#0}" -lt 9 ]]; then
    exit 0
  fi
fi

if [[ -z "${CRM_REPORT_SECRET:-}" ]]; then
  echo "CRM_REPORT_SECRET is not configured" >&2
  alert ":rotating_light: Closed-Won ${PERIOD}: CRM_REPORT_SECRET is not configured on the box — no email can be sent."
  exit 1
fi

# The catch-up schedule is dense enough that two runs could overlap on a slow
# attempt; the second should step aside rather than queue behind it.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "another ${PERIOD} run holds the lock — stepping aside"
  exit 0
fi

PAYLOAD='{}'

for attempt in $(seq 1 "${ATTEMPTS}"); do
  log "sending closed-won report period=${PERIOD} key=${PERIOD_KEY} attempt=${attempt}/${ATTEMPTS} catchup=${CATCHUP:-0}"

  # No `-f`: it discards the response body, which is where the endpoint puts its
  # actual error message. Capture body and status separately instead.
  HTTP_CODE=0
  BODY="$(curl -sS -m 120 -X POST "${ENDPOINT}" \
    -H "x-crm-report-secret: ${CRM_REPORT_SECRET}" \
    -H "Content-Type: application/json" \
    --data "${PAYLOAD}" \
    -w $'\n%{http_code}' 2>&1)" || true
  HTTP_CODE="${BODY##*$'\n'}"
  BODY="${BODY%$'\n'*}"

  echo "${BODY}"

  # A monthToDate run on any day but the last is the endpoint working exactly as
  # intended. It is not a delivery, so it is not marked — the real send still has
  # to happen on the last day.
  if [[ "${HTTP_CODE}" == "200" && "${BODY}" == *'Not the last day of the month'* ]]; then
    log "period=${PERIOD} no-op — not the last day of the month"
    exit 0
  fi

  # Delivery is proven by a messageId. `"ok":true` alone is not proof: a locked
  # or otherwise skipped run returns it while sending nothing at all.
  if [[ "${HTTP_CODE}" == "200" && "${BODY}" == *'"messageId"'* && "${BODY}" != *'"skipped":true'* ]]; then
    MSG_ID="$(printf '%s' "${BODY}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("messageId",""))' 2>/dev/null || true)"
    RECIPIENTS="$(printf '%s' "${BODY}" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("recipients",[])))' 2>/dev/null || echo '?')"
    printf '%s messageId=%s recipients=%s\n' "$(date -Is)" "${MSG_ID}" "${RECIPIENTS}" > "${MARKER}"
    log "closed-won report period=${PERIOD} DELIVERED messageId=${MSG_ID} recipients=${RECIPIENTS}"
    record_status "ok http=${HTTP_CODE} attempt=${attempt} messageId=${MSG_ID} recipients=${RECIPIENTS}"
    if [[ "${CATCHUP:-0}" == "1" ]]; then
      alert ":white_check_mark: Closed-Won ${PERIOD} recovered — it failed at the scheduled 8 AM ET run and a catch-up attempt has now delivered it to ${RECIPIENTS} recipients."
    fi
    exit 0
  fi

  # A 200 that sent nothing is the failure mode that hid for three weeks. Call it
  # out by name rather than letting it read as a transport error.
  if [[ "${HTTP_CODE}" == "200" ]]; then
    REASON="$(printf '%s' "${BODY}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("reason",""))' 2>/dev/null || true)"
    log "period=${PERIOD} answered 200 but SENT NOTHING — reason: ${REASON:-unknown}"
  fi

  log "closed-won report period=${PERIOD} FAILED http=${HTTP_CODE} attempt=${attempt}/${ATTEMPTS}" >&2

  if [[ "${attempt}" -lt "${ATTEMPTS}" ]]; then
    sleep "${RETRY_DELAY}"
  fi
done

log "closed-won report period=${PERIOD} GAVE UP after ${ATTEMPTS} attempts — no email was sent" >&2
record_status "FAILED http=${HTTP_CODE} after ${ATTEMPTS} attempts"

SNIPPET="$(printf '%s' "${BODY}" | head -c 300)"
if [[ "${CATCHUP:-0}" == "1" ]]; then
  alert ":rotating_light: Closed-Won ${PERIOD} (${PERIOD_KEY}) still failing — catch-up attempt gave up. http=${HTTP_CODE}. Response: ${SNIPPET}"
else
  alert ":warning: Closed-Won ${PERIOD} (${PERIOD_KEY}) failed at the scheduled 8 AM ET run. http=${HTTP_CODE}. Response: ${SNIPPET} — catch-up runs every 30 minutes and will alert again if they cannot deliver."
fi
exit 1
