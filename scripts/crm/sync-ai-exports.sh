#!/usr/bin/env bash
# Host wrapper for sync-ai-exports.js.
#
# The sync has to run inside the CRM container: that is the only place with the
# Twenty database, APP_SECRET (for minting download links) and the API all
# reachable at once. Copy the script in fresh each run so the repo stays the
# source of truth and a container restart never leaves a stale copy behind.
#
#   ./sync-ai-exports.sh            # sync
#   ./sync-ai-exports.sh --dry-run  # report only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="$(docker ps --format '{{.Names}}' | grep -m1 '^abc_twenty\.1\.')"

if [ -z "$CONTAINER" ]; then
  echo "sync-ai-exports: abc_twenty container not running" >&2
  exit 1
fi

# Workspace API key, kept in one place in the repo rather than duplicated here.
API_KEY="$(grep -oE 'eyJhbGciOi[A-Za-z0-9_.-]{40,}' \
  "$SCRIPT_DIR/../../services/integrations/twenty/crmAutomation.ts" | head -1)"

if [ -z "$API_KEY" ]; then
  echo "sync-ai-exports: could not read the Twenty API key" >&2
  exit 1
fi

docker cp "$SCRIPT_DIR/sync-ai-exports.js" "$CONTAINER:/tmp/sync-ai-exports.js"
docker exec -e "SYNC_API_KEY=$API_KEY" "$CONTAINER" \
  node /tmp/sync-ai-exports.js "$@"
