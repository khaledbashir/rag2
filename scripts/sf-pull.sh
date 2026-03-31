#!/bin/bash
# ============================================================================
# Salesforce Data Pull Script
# Authenticates and extracts all objects for migration to Twenty CRM
# Usage: ./scripts/sf-pull.sh [auth|discover|count|pull|all]
# ============================================================================

set -euo pipefail

# --- Config ---
SF_USERNAME="${SALESFORCE_USERNAME:-ahmadbasheerr@gmail.com}"
SF_PASSWORD="${SALESFORCE_PASSWORD:-}"
SF_SECURITY_TOKEN="${SALESFORCE_SECURITY_TOKEN:-}"
SF_CLIENT_ID="${SALESFORCE_CLIENT_ID:-}"
SF_CLIENT_SECRET="${SALESFORCE_CLIENT_SECRET:-}"
SF_LOGIN_URL="https://login.salesforce.com"
SF_API_VERSION="v62.0"
OUTPUT_DIR="docs/salesforce-export"
TOKEN_CACHE="/tmp/sf_token_cache.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[SF]${NC} $1"; }
warn() { echo -e "${YELLOW}[SF]${NC} $1"; }
err() { echo -e "${RED}[SF]${NC} $1" >&2; }

# --- Auth (SOAP login — no Connected App needed) ---
sf_auth() {
  log "Authenticating to Salesforce via SOAP..."

  if [[ -z "$SF_PASSWORD" ]]; then
    err "SALESFORCE_PASSWORD not set. Export it or add to .env"
    exit 1
  fi

  local password="${SF_PASSWORD}${SF_SECURITY_TOKEN}"

  local response
  response=$(curl -s -X POST "${SF_LOGIN_URL}/services/Soap/u/62.0" \
    -H "Content-Type: text/xml" \
    -H "SOAPAction: login" \
    -d "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\"
  xmlns:urn=\"urn:partner.soap.sforce.com\">
  <soapenv:Body>
    <urn:login>
      <urn:username>${SF_USERNAME}</urn:username>
      <urn:password>${password}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>")

  # Check for SOAP fault
  if echo "$response" | grep -q "INVALID_LOGIN\|LOGIN_MUST_USE_SECURITY_TOKEN\|faultstring"; then
    err "Auth failed. Check username/password/security token."
    err "Response: $(echo "$response" | grep -oP '<faultstring>[^<]+' | sed 's/<faultstring>//')"
    exit 1
  fi

  # Extract session ID and server URL
  SF_TOKEN=$(echo "$response" | grep -oP '<sessionId>[^<]+' | sed 's/<sessionId>//')
  SF_INSTANCE_URL=$(echo "$response" | grep -oP '<serverUrl>[^<]+' | sed 's/<serverUrl>//' | grep -oP 'https://[^/]+')

  if [[ -z "$SF_TOKEN" ]]; then
    err "Failed to extract session token from response"
    exit 1
  fi

  # Cache token as JSON for compatibility
  echo "{\"access_token\": \"${SF_TOKEN}\", \"instance_url\": \"${SF_INSTANCE_URL}\"}" > "$TOKEN_CACHE"

  log "Authenticated successfully"
  log "Instance: $SF_INSTANCE_URL"
  log "Token cached at $TOKEN_CACHE"

  export SF_TOKEN SF_INSTANCE_URL
}

# Load cached token if available
load_token() {
  if [[ -f "$TOKEN_CACHE" ]]; then
    SF_TOKEN=$(jq -r '.access_token' "$TOKEN_CACHE")
    SF_INSTANCE_URL=$(jq -r '.instance_url' "$TOKEN_CACHE")
    export SF_TOKEN SF_INSTANCE_URL
    return 0
  fi
  return 1
}

# Authenticated GET request
sf_get() {
  local endpoint="$1"
  curl -s -H "Authorization: Bearer $SF_TOKEN" \
    -H "Content-Type: application/json" \
    "${SF_INSTANCE_URL}/services/data/${SF_API_VERSION}${endpoint}"
}

# --- Discover ---
sf_discover() {
  log "Discovering Salesforce objects..."
  mkdir -p "$OUTPUT_DIR"

  # List all objects
  local objects
  objects=$(sf_get "/sobjects/" | jq '[.sobjects[] | select(.queryable==true) | {name: .name, label: .label, count: .urls.rowTemplate}]')
  echo "$objects" | jq '.' > "$OUTPUT_DIR/objects.json"
  log "Found $(echo "$objects" | jq 'length') queryable objects"

  # Describe key objects
  for obj in Account Contact Opportunity Lead Task; do
    log "  Describing $obj..."
    sf_get "/sobjects/${obj}/describe" | jq '{
      name: .name,
      label: .label,
      fields: [.fields[] | {name: .name, label: .label, type: .type, length: .length, picklistValues: [.picklistValues[]? | .value]}]
    }' > "$OUTPUT_DIR/${obj}_describe.json" 2>/dev/null || warn "  $obj not found or no access"
  done

  log "Object descriptions saved to $OUTPUT_DIR/"
}

# --- Count ---
sf_count() {
  log "Counting records..."
  echo ""
  printf "%-20s %s\n" "OBJECT" "COUNT"
  printf "%-20s %s\n" "------" "-----"

  for obj in Account Contact Opportunity Lead Task Event Note Case; do
    local count
    count=$(sf_get "/query?q=SELECT+COUNT()+FROM+${obj}" 2>/dev/null | jq -r '.records[0].expr0 // "N/A"' 2>/dev/null || echo "N/A")
    printf "%-20s %s\n" "$obj" "$count"
  done
  echo ""
}

# --- Pull ---
sf_pull_object() {
  local obj_name="$1"
  local query="$2"
  local output_file="$OUTPUT_DIR/${obj_name}.json"

  log "Pulling $obj_name..."

  local encoded_query
  encoded_query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))" 2>/dev/null || echo "$query" | sed 's/ /+/g')

  local all_records="[]"
  local url="/query?q=${encoded_query}"
  local page=1

  while true; do
    local response
    response=$(sf_get "$url")

    # Check for error
    if echo "$response" | jq -e '.[0].errorCode' >/dev/null 2>&1; then
      err "  Error pulling $obj_name: $(echo "$response" | jq -r '.[0].message')"
      return 1
    fi

    local records
    records=$(echo "$response" | jq '.records')
    local count
    count=$(echo "$records" | jq 'length')

    all_records=$(echo "$all_records" "$records" | jq -s '.[0] + .[1]')
    log "  Page $page: $count records (total: $(echo "$all_records" | jq 'length'))"

    # Check if more pages
    local done
    done=$(echo "$response" | jq -r '.done')
    if [[ "$done" == "true" ]]; then
      break
    fi

    # Get next page URL (strip instance URL prefix)
    url=$(echo "$response" | jq -r '.nextRecordsUrl' | sed "s|/services/data/${SF_API_VERSION}||")
    page=$((page + 1))
  done

  echo "$all_records" | jq '.' > "$output_file"
  log "  Saved $(echo "$all_records" | jq 'length') records to $output_file"
}

sf_pull() {
  log "Pulling all data from Salesforce..."
  mkdir -p "$OUTPUT_DIR"

  sf_pull_object "accounts" \
    "SELECT Id, Name, Type, Industry, Phone, Website, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, ShippingStreet, ShippingCity, ShippingState, NumberOfEmployees, AnnualRevenue, Description, OwnerId, CreatedDate, LastModifiedDate FROM Account ORDER BY Name"

  sf_pull_object "contacts" \
    "SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, Title, Department, MailingStreet, MailingCity, MailingState, MailingPostalCode, AccountId, Account.Name, OwnerId, CreatedDate, LastModifiedDate FROM Contact ORDER BY LastName"

  sf_pull_object "opportunities" \
    "SELECT Id, Name, StageName, Amount, Probability, CloseDate, Type, Description, AccountId, Account.Name, OwnerId, LeadSource, NextStep, ForecastCategory, CreatedDate, LastModifiedDate FROM Opportunity ORDER BY CloseDate DESC"

  sf_pull_object "leads" \
    "SELECT Id, FirstName, LastName, Company, Email, Phone, MobilePhone, Title, Status, LeadSource, Industry, Street, City, State, PostalCode, Description, CreatedDate, LastModifiedDate FROM Lead ORDER BY LastName" || true

  sf_pull_object "tasks" \
    "SELECT Id, Subject, Description, Status, Priority, ActivityDate, WhoId, WhatId, OwnerId, CreatedDate FROM Task ORDER BY CreatedDate DESC LIMIT 500" || true

  log ""
  log "=== Pull complete ==="
  log "Files saved to $OUTPUT_DIR/"
  ls -la "$OUTPUT_DIR/"
}

# --- Main ---
main() {
  local cmd="${1:-all}"

  case "$cmd" in
    auth)
      sf_auth
      ;;
    discover)
      load_token || sf_auth
      sf_discover
      ;;
    count)
      load_token || sf_auth
      sf_count
      ;;
    pull)
      load_token || sf_auth
      sf_pull
      ;;
    all)
      sf_auth
      sf_discover
      sf_count
      sf_pull
      ;;
    *)
      echo "Usage: $0 [auth|discover|count|pull|all]"
      exit 1
      ;;
  esac
}

main "$@"
